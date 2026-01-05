/**
 * Application settings hook for database-stored configuration
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 *
 * This hook reads application settings from the uni_app_settings table,
 * providing database-persisted configuration with localStorage fallback.
 *
 * Features:
 * - React Query with staleTime for smart caching
 * - refetchOnWindowFocus for automatic updates on navigation
 * - Merges database config with localStorage fallback
 * - No Docker bounce needed - config refreshes on page focus
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PostgrestClient } from '@supabase/postgrest-js'
import { config as dbConfig } from '@/lib/database'
import type { GeoIPServiceConfig } from '@/lib/geoip/types'
import { DEFAULT_GEOIP_CONFIG, GEOIP_CONFIG_STORAGE_KEY } from '@/lib/geoip/types'

// =============================================================================
// Types
// =============================================================================

/**
 * App setting record from uni_app_settings table
 */
export interface AppSetting<T = unknown> {
  key: string
  value: T
  updated_at: string
}

/**
 * GeoIP configuration stored in database
 * Matches the format written by unicornscan-geoip-update script
 */
export interface DatabaseGeoIPConfig {
  provider?: string  // 'dbip' | 'maxmind' | 'ipinfo' | 'ip2location'
  enabled?: boolean
  cityDbPath?: string | null
  asnDbPath?: string | null
  anonymousDbPath?: string | null
  cacheSize?: number
  cacheTtlMs?: number
}

// =============================================================================
// Query Keys
// =============================================================================

export const appSettingsKeys = {
  all: ['app-settings'] as const,
  setting: (key: string) => [...appSettingsKeys.all, key] as const,
  geoip: () => [...appSettingsKeys.all, 'geoip_config'] as const,
}

// =============================================================================
// PostgREST Client
// =============================================================================

let postgrestClient: PostgrestClient | null = null

function getPostgrestClient(): PostgrestClient {
  if (!postgrestClient) {
    if (!dbConfig.postgrestUrl) {
      throw new Error('PostgREST URL must be configured')
    }
    postgrestClient = new PostgrestClient(dbConfig.postgrestUrl)
  }
  return postgrestClient
}

// =============================================================================
// Raw Data Fetching
// =============================================================================

/**
 * Fetch a single setting from uni_app_settings
 */
async function fetchAppSetting<T>(key: string): Promise<AppSetting<T> | null> {
  try {
    const client = getPostgrestClient()
    const { data, error } = await client
      .from('uni_app_settings')
      .select('*')
      .eq('key', key)
      .single()

    if (error) {
      // Table doesn't exist or no matching row - not an error condition
      if (error.code === 'PGRST116' || error.code === '42P01') {
        return null
      }
      throw error
    }

    return data as AppSetting<T>
  } catch {
    // Database not available - fallback to localStorage
    return null
  }
}

/**
 * Save a setting to uni_app_settings
 */
async function saveAppSetting<T>(key: string, value: T): Promise<boolean> {
  try {
    const client = getPostgrestClient()
    const { error } = await client
      .from('uni_app_settings')
      .upsert({
        key,
        value,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      console.warn('Failed to save app setting to database:', error.message)
      return false
    }

    return true
  } catch (err) {
    console.warn('Failed to save app setting:', err)
    return false
  }
}

// =============================================================================
// GeoIP Configuration Hook
// =============================================================================

/**
 * Load GeoIP config from localStorage (fallback)
 */
function loadLocalGeoIPConfig(): Partial<GeoIPServiceConfig> {
  try {
    const stored = localStorage.getItem(GEOIP_CONFIG_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore parse errors
  }
  return {}
}

/**
 * Save GeoIP config to localStorage
 */
function saveLocalGeoIPConfig(config: Partial<GeoIPServiceConfig>): void {
  try {
    localStorage.setItem(GEOIP_CONFIG_STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Normalize provider name to match GeoIPProviderType
 */
function normalizeProvider(provider: string | undefined): GeoIPServiceConfig['provider'] {
  switch (provider) {
    case 'dbip':
      // DB-IP uses MaxMind-compatible MMDB format
      return 'maxmind'
    case 'maxmind':
    case 'ipinfo':
    case 'ip2location':
      return provider as GeoIPServiceConfig['provider']
    default:
      return 'maxmind'
  }
}

/**
 * Hook to get GeoIP configuration from database with localStorage fallback
 *
 * This hook:
 * - Reads geoip_config from uni_app_settings (set by unicornscan-geoip-update)
 * - Falls back to localStorage if database is unavailable
 * - Uses React Query with staleTime for smart caching
 * - Refetches on window focus for automatic updates
 */
export function useGeoIPConfig() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: appSettingsKeys.geoip(),
    queryFn: async (): Promise<GeoIPServiceConfig> => {
      // Try database first
      const dbSetting = await fetchAppSetting<DatabaseGeoIPConfig>('geoip_config')

      // Load localStorage config as fallback
      const localConfig = loadLocalGeoIPConfig()

      // Merge: database > localStorage > defaults
      const dbConfig = dbSetting?.value || {}

      const mergedConfig: GeoIPServiceConfig = {
        ...DEFAULT_GEOIP_CONFIG,
        ...localConfig,
        // Database config takes priority
        ...(dbConfig.enabled !== undefined && { enabled: dbConfig.enabled }),
        ...(dbConfig.cityDbPath !== undefined && { cityDbPath: dbConfig.cityDbPath }),
        ...(dbConfig.asnDbPath !== undefined && { asnDbPath: dbConfig.asnDbPath }),
        ...(dbConfig.anonymousDbPath !== undefined && { anonymousDbPath: dbConfig.anonymousDbPath }),
        ...(dbConfig.cacheSize !== undefined && { cacheSize: dbConfig.cacheSize }),
        ...(dbConfig.cacheTtlMs !== undefined && { cacheTtlMs: dbConfig.cacheTtlMs }),
        // Normalize provider
        provider: normalizeProvider(dbConfig.provider),
      }

      return mergedConfig
    },
    staleTime: 30000,  // 30 seconds - config doesn't change often
    gcTime: 300000,    // 5 minutes cache retention
    refetchOnWindowFocus: true,  // Refresh when user returns to tab
    refetchOnMount: true,        // Refresh on component mount
    retry: false,                // Don't retry on failure (fallback handles it)
  })

  // Mutation for updating config
  const updateMutation = useMutation({
    mutationFn: async (config: Partial<GeoIPServiceConfig>) => {
      // Get current config
      const current = query.data || DEFAULT_GEOIP_CONFIG
      const updated = { ...current, ...config }

      // Save to localStorage immediately (for instant feedback)
      saveLocalGeoIPConfig(updated)

      // Try to save to database
      await saveAppSetting('geoip_config', {
        provider: updated.provider === 'maxmind' ? 'dbip' : updated.provider,
        enabled: updated.enabled,
        cityDbPath: updated.cityDbPath,
        asnDbPath: updated.asnDbPath,
        anonymousDbPath: updated.anonymousDbPath,
        cacheSize: updated.cacheSize,
        cacheTtlMs: updated.cacheTtlMs,
      })

      return updated
    },
    onSuccess: (data) => {
      // Update the query cache
      queryClient.setQueryData(appSettingsKeys.geoip(), data)
    },
  })

  return {
    config: query.data || DEFAULT_GEOIP_CONFIG,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isStale: query.isStale,
    dataUpdatedAt: query.dataUpdatedAt,
    updateConfig: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    refetch: query.refetch,
  }
}

// =============================================================================
// Generic App Settings Hook
// =============================================================================

/**
 * Generic hook for any app setting
 */
export function useAppSetting<T>(key: string, defaultValue: T) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: appSettingsKeys.setting(key),
    queryFn: async (): Promise<T> => {
      const setting = await fetchAppSetting<T>(key)
      return setting?.value ?? defaultValue
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
  })

  const updateMutation = useMutation({
    mutationFn: async (value: T) => {
      await saveAppSetting(key, value)
      return value
    },
    onSuccess: (data) => {
      queryClient.setQueryData(appSettingsKeys.setting(key), data)
    },
  })

  return {
    value: query.data ?? defaultValue,
    isLoading: query.isLoading,
    update: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    refetch: query.refetch,
  }
}
