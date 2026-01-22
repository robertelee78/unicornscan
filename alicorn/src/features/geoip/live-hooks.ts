/**
 * Live GeoIP lookup hooks
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 *
 * Provides React Query hooks for live GeoIP lookups using
 * the GeoIP service. These hooks are for lookups that aren't
 * stored in the database (manual lookups, comparison mode).
 *
 * v12: Now uses useGeoIPConfig to read config from database (uni_app_settings)
 *      with localStorage fallback. Config auto-refreshes on window focus.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getGeoIPService,
  initializeGeoIPService,
  type LiveGeoIPResult,
  type GeoIPServiceConfig,
  type GeoIPServiceStatus,
  type GeoIPComparisonResult,
} from '@/lib/geoip'
import { useGeoIPConfig } from '@/lib/settings'

// =============================================================================
// Query Keys
// =============================================================================

export const liveGeoipKeys = {
  all: ['geoip-live'] as const,
  lookup: (ip: string) => [...liveGeoipKeys.all, 'lookup', ip] as const,
  batch: (ips: string[]) => [...liveGeoipKeys.all, 'batch', ips.join(',')] as const,
  status: () => [...liveGeoipKeys.all, 'status'] as const,
  compare: (ip: string) => [...liveGeoipKeys.all, 'compare', ip] as const,
}

// =============================================================================
// Service Initialization Hook
// =============================================================================

/**
 * Initialize and manage GeoIP service state
 *
 * v12: Now syncs with database config via useGeoIPConfig hook.
 * Config is automatically refreshed on window focus (refetchOnWindowFocus).
 * When config changes (e.g., after running unicornscan-geoip-update),
 * the service is updated without requiring a Docker container restart.
 */
export function useGeoIPService() {
  const [isReady, setIsReady] = useState(false)
  const [status, setStatus] = useState<GeoIPServiceStatus | null>(null)
  const queryClient = useQueryClient()

  // Use database config with localStorage fallback
  const { config: dbConfig, isLoading: configLoading, updateConfig: saveDbConfig } = useGeoIPConfig()

  // Track previous config to detect changes
  const prevConfigRef = useRef<GeoIPServiceConfig | null>(null)

  // Initialize service
  useEffect(() => {
    const init = async () => {
      await initializeGeoIPService()
      const service = getGeoIPService()
      setStatus(service.getStatus())
      setIsReady(true)
    }
    init()
  }, [])

  // Sync service config with database config when it changes
  useEffect(() => {
    if (configLoading || !isReady) return

    const service = getGeoIPService()
    const currentServiceConfig = service.getConfig()

    // Check if config has changed
    const configChanged =
      dbConfig.enabled !== currentServiceConfig.enabled ||
      dbConfig.cityDbPath !== currentServiceConfig.cityDbPath ||
      dbConfig.asnDbPath !== currentServiceConfig.asnDbPath ||
      dbConfig.provider !== currentServiceConfig.provider

    if (configChanged && prevConfigRef.current !== null) {
      // Update service with new database config
      service.updateConfig(dbConfig)
      setStatus(service.getStatus())

      // Invalidate all live lookups when config changes
      queryClient.invalidateQueries({ queryKey: liveGeoipKeys.all })

      console.log('[GeoIP] Config updated from database:', {
        enabled: dbConfig.enabled,
        cityDbPath: dbConfig.cityDbPath,
        asnDbPath: dbConfig.asnDbPath,
      })
    } else if (prevConfigRef.current === null) {
      // Initial load - just set config without invalidating
      service.updateConfig(dbConfig)
      setStatus(service.getStatus())
    }

    prevConfigRef.current = dbConfig
  }, [dbConfig, configLoading, isReady, queryClient])

  const updateConfig = useCallback(
    (config: Partial<GeoIPServiceConfig>) => {
      const service = getGeoIPService()
      service.updateConfig(config)
      setStatus(service.getStatus())

      // Also save to database
      saveDbConfig(config)

      // Invalidate all live lookups when config changes
      queryClient.invalidateQueries({ queryKey: liveGeoipKeys.all })
    },
    [queryClient, saveDbConfig]
  )

  const clearCache = useCallback(() => {
    const service = getGeoIPService()
    service.clearCache()
    setStatus(service.getStatus())
  }, [])

  const testConnection = useCallback(async () => {
    const service = getGeoIPService()
    return service.testConnection()
  }, [])

  return {
    isReady: isReady && !configLoading,
    status,
    updateConfig,
    clearCache,
    testConnection,
    getConfig: () => getGeoIPService().getConfig(),
  }
}

// =============================================================================
// Live Lookup Hooks
// =============================================================================

/**
 * Perform a live GeoIP lookup for a single IP
 */
export function useLiveGeoIPLookup(ip: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ip ? liveGeoipKeys.lookup(ip) : liveGeoipKeys.all,
    queryFn: async (): Promise<LiveGeoIPResult | null> => {
      if (!ip) return null
      const service = getGeoIPService()
      return service.lookup(ip)
    },
    enabled: !!ip && (options?.enabled !== false),
    staleTime: 60000, // 1 minute - IP locations don't change often
    gcTime: 300000, // 5 minutes
  })
}

/**
 * Batch lookup for multiple IPs
 */
export function useLiveGeoIPBatch(ips: string[], options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: liveGeoipKeys.batch(ips),
    queryFn: async (): Promise<Map<string, LiveGeoIPResult | null>> => {
      const service = getGeoIPService()
      return service.lookupBatch(ips)
    },
    enabled: ips.length > 0 && (options?.enabled !== false),
    staleTime: 60000,
  })
}

/**
 * Manual lookup mutation (for form-based lookups)
 */
export function useLiveGeoIPMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ip: string): Promise<LiveGeoIPResult | null> => {
      const service = getGeoIPService()
      return service.lookup(ip)
    },
    onSuccess: (data, ip) => {
      // Cache the result
      if (data) {
        queryClient.setQueryData(liveGeoipKeys.lookup(ip), data)
      }
    },
  })
}

// =============================================================================
// Comparison Hook
// =============================================================================

/**
 * Compare stored GeoIP data with live lookup
 */
export function useGeoIPComparison(
  ip: string | null,
  storedData: LiveGeoIPResult | null,
  storedTime: Date | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ip ? liveGeoipKeys.compare(ip) : liveGeoipKeys.all,
    queryFn: async (): Promise<GeoIPComparisonResult | null> => {
      if (!ip) return null
      const service = getGeoIPService()
      return service.compare(ip, storedData, storedTime)
    },
    enabled: !!ip && (options?.enabled !== false),
    staleTime: 60000,
  })
}

// =============================================================================
// Service Status Hook
// =============================================================================

/**
 * Get current service status
 */
export function useGeoIPStatus() {
  return useQuery({
    queryKey: liveGeoipKeys.status(),
    queryFn: async (): Promise<GeoIPServiceStatus> => {
      const service = getGeoIPService()
      return service.getStatus()
    },
    staleTime: 5000, // Refresh every 5 seconds
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  })
}
