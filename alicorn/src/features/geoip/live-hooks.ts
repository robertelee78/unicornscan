/**
 * Live GeoIP lookup hooks
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 *
 * Provides React Query hooks for live GeoIP lookups using
 * the GeoIP service. These hooks are for lookups that aren't
 * stored in the database (manual lookups, comparison mode).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useCallback } from 'react'
import {
  getGeoIPService,
  initializeGeoIPService,
  type LiveGeoIPResult,
  type GeoIPServiceConfig,
  type GeoIPServiceStatus,
  type GeoIPComparisonResult,
} from '@/lib/geoip'

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
 */
export function useGeoIPService() {
  const [isReady, setIsReady] = useState(false)
  const [status, setStatus] = useState<GeoIPServiceStatus | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    const init = async () => {
      await initializeGeoIPService()
      const service = getGeoIPService()
      setStatus(service.getStatus())
      setIsReady(true)
    }
    init()
  }, [])

  const updateConfig = useCallback(
    (config: Partial<GeoIPServiceConfig>) => {
      const service = getGeoIPService()
      service.updateConfig(config)
      setStatus(service.getStatus())
      // Invalidate all live lookups when config changes
      queryClient.invalidateQueries({ queryKey: liveGeoipKeys.all })
    },
    [queryClient]
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
    isReady,
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
