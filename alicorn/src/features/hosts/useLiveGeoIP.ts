/**
 * Hook for live GeoIP lookup when database doesn't have stored data
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useEffect } from 'react'
import { getGeoIPService, initializeGeoIPService } from '@/lib/geoip'
import type { LiveGeoIPResult } from '@/lib/geoip'

// Track initialization
let initialized = false
let initializing = false

/**
 * Hook to get live GeoIP data for an IP address
 * Only fetches if the host doesn't have stored GeoIP data
 *
 * @param ip - IP address to lookup
 * @param hasStoredData - Whether the host already has GeoIP data in the database
 * @returns Live GeoIP result or null
 */
export function useLiveGeoIP(
  ip: string,
  hasStoredData: boolean
): { data: LiveGeoIPResult | null; isLoading: boolean } {
  const [data, setData] = useState<LiveGeoIPResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Skip if host already has stored data
    if (hasStoredData) {
      return
    }

    // Skip if no IP
    if (!ip) {
      return
    }

    let cancelled = false

    async function fetchGeoIP() {
      // Initialize service if needed
      if (!initialized && !initializing) {
        initializing = true
        try {
          await initializeGeoIPService()
          initialized = true
        } catch {
          // Service unavailable - that's ok
        }
        initializing = false
      }

      // Wait for initialization if in progress
      while (initializing) {
        await new Promise((r) => setTimeout(r, 50))
      }

      if (cancelled) return

      setIsLoading(true)
      try {
        const service = getGeoIPService()
        const result = await service.lookup(ip)
        if (!cancelled) {
          setData(result)
        }
      } catch {
        // Lookup failed - leave as null
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchGeoIP()

    return () => {
      cancelled = true
    }
  }, [ip, hasStoredData])

  return { data, isLoading }
}

/**
 * Batch hook for fetching GeoIP data for multiple IPs
 * Used for prefetching when viewing host list
 */
export function useBatchLiveGeoIP(
  ips: Array<{ ip: string; hasStoredData: boolean }>
): Map<string, LiveGeoIPResult | null> {
  const [results, setResults] = useState<Map<string, LiveGeoIPResult | null>>(new Map())

  useEffect(() => {
    // Filter to only IPs without stored data
    const ipsToFetch = ips.filter((i) => !i.hasStoredData).map((i) => i.ip)

    if (ipsToFetch.length === 0) {
      return
    }

    let cancelled = false

    async function fetchBatch() {
      // Initialize service if needed
      if (!initialized && !initializing) {
        initializing = true
        try {
          await initializeGeoIPService()
          initialized = true
        } catch {
          // Service unavailable
        }
        initializing = false
      }

      while (initializing) {
        await new Promise((r) => setTimeout(r, 50))
      }

      if (cancelled) return

      try {
        const service = getGeoIPService()
        const batchResults = await service.lookupBatch(ipsToFetch)
        if (!cancelled) {
          setResults(batchResults)
        }
      } catch {
        // Batch lookup failed
      }
    }

    fetchBatch()

    return () => {
      cancelled = true
    }
  }, [ips])

  return results
}
