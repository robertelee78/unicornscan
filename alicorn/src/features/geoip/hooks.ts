/**
 * GeoIP feature hooks with React Query
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getDatabase } from '@/lib/database'
import type {
  GeoIPRecord,
  GeoIPScanStats,
  GeoIPCountryStats,
  GeoIPTypeDistribution,
  GeoIPAsnStats,
  GeoIPMapPoint,
  GeoIPQueryOptions,
  IpType,
} from './types'

const db = getDatabase()

// =============================================================================
// Query Keys
// =============================================================================

export const geoipKeys = {
  all: ['geoip'] as const,
  byHost: (hostIp: string) => [...geoipKeys.all, 'host', hostIp] as const,
  byScan: (scanId: number) => [...geoipKeys.all, 'scan', scanId] as const,
  stats: (scanId: number) => [...geoipKeys.all, 'stats', scanId] as const,
  countryBreakdown: (scanId: number) => [...geoipKeys.all, 'countries', scanId] as const,
  typeBreakdown: (scanId: number) => [...geoipKeys.all, 'types', scanId] as const,
  mapPoints: (scanId: number) => [...geoipKeys.all, 'map', scanId] as const,
  asnBreakdown: (scanId: number) => [...geoipKeys.all, 'asns', scanId] as const,
}

// =============================================================================
// Single Host GeoIP Hook
// =============================================================================

/**
 * Get GeoIP data for a specific host IP
 * Returns the most recent lookup, optionally filtered by scan
 */
export function useGeoIP(hostIp: string, scanId?: number) {
  return useQuery({
    queryKey: scanId ? [...geoipKeys.byHost(hostIp), scanId] : geoipKeys.byHost(hostIp),
    queryFn: async (): Promise<GeoIPRecord | null> => {
      return db.getGeoIPByHost(hostIp, scanId)
    },
    enabled: !!hostIp,
    staleTime: 60000,  // GeoIP data doesn't change often
  })
}

/**
 * Get GeoIP history for a host (all lookups across scans)
 * Useful for detecting IP movement over time
 */
export function useGeoIPHistory(hostIp: string) {
  return useQuery({
    queryKey: [...geoipKeys.byHost(hostIp), 'history'],
    queryFn: async (): Promise<GeoIPRecord[]> => {
      return db.getGeoIPHistory(hostIp)
    },
    enabled: !!hostIp,
    staleTime: 60000,
  })
}

// =============================================================================
// Scan GeoIP Hooks
// =============================================================================

/**
 * Get all GeoIP records for a scan
 */
export function useScanGeoIP(scanId: number, options?: GeoIPQueryOptions) {
  return useQuery({
    queryKey: [...geoipKeys.byScan(scanId), options],
    queryFn: async (): Promise<GeoIPRecord[]> => {
      return db.getGeoIPByScan(scanId, options)
    },
    enabled: scanId > 0,
    staleTime: 60000,
  })
}

/**
 * Get aggregated GeoIP statistics for a scan
 */
export function useGeoIPStats(scanId: number) {
  const { data: geoipRecords, isLoading: recordsLoading } = useScanGeoIP(scanId)
  const { data: countryStats, isLoading: countryLoading } = useGeoIPCountryBreakdown(scanId)

  const stats = useMemo((): GeoIPScanStats | null => {
    if (!geoipRecords) return null

    const total = geoipRecords.length
    if (total === 0) {
      return {
        scan_id: scanId,
        total_hosts: 0,
        hosts_with_geoip: 0,
        coverage_percentage: 0,
        country_count: 0,
        countries: [],
        type_distribution: null,
        asn_count: 0,
        top_asns: [],
        bounds: null,
      }
    }

    // Calculate IP type distribution
    const typeCounts = new Map<IpType, number>()
    geoipRecords.forEach((r) => {
      const type = (r.ip_type as IpType) || 'unknown'
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1)
    })

    const typeDistribution: GeoIPTypeDistribution[] = Array.from(typeCounts.entries())
      .map(([ip_type, count]) => ({
        ip_type,
        count,
        percentage: (count / total) * 100,
      }))
      .sort((a, b) => b.count - a.count)

    // Calculate ASN statistics
    const asnMap = new Map<number, { as_org: string | null; count: number; countries: Set<string> }>()
    geoipRecords.forEach((r) => {
      if (r.asn) {
        const existing = asnMap.get(r.asn)
        if (existing) {
          existing.count++
          if (r.country_code) existing.countries.add(r.country_code)
        } else {
          asnMap.set(r.asn, {
            as_org: r.as_org,
            count: 1,
            countries: new Set(r.country_code ? [r.country_code] : []),
          })
        }
      }
    })

    const topAsns: GeoIPAsnStats[] = Array.from(asnMap.entries())
      .map(([asn, data]) => ({
        asn,
        as_org: data.as_org,
        host_count: data.count,
        countries: Array.from(data.countries),
      }))
      .sort((a, b) => b.host_count - a.host_count)
      .slice(0, 10)

    // Calculate geographic bounds
    const coordRecords = geoipRecords.filter((r) => r.latitude !== null && r.longitude !== null)
    let bounds: GeoIPScanStats['bounds'] = null
    if (coordRecords.length > 0) {
      bounds = {
        min_lat: Math.min(...coordRecords.map((r) => r.latitude!)),
        max_lat: Math.max(...coordRecords.map((r) => r.latitude!)),
        min_lng: Math.min(...coordRecords.map((r) => r.longitude!)),
        max_lng: Math.max(...coordRecords.map((r) => r.longitude!)),
      }
    }

    return {
      scan_id: scanId,
      total_hosts: total,
      hosts_with_geoip: total,
      coverage_percentage: 100,  // All records have GeoIP by definition
      country_count: countryStats?.length || new Set(geoipRecords.map((r) => r.country_code)).size,
      countries: countryStats || [],
      type_distribution: typeDistribution.some((t) => t.ip_type !== 'unknown') ? typeDistribution : null,
      asn_count: asnMap.size,
      top_asns: topAsns,
      bounds,
    }
  }, [geoipRecords, countryStats, scanId])

  return {
    data: stats,
    isLoading: recordsLoading || countryLoading,
    error: null,
  }
}

// =============================================================================
// Country/Region Breakdown Hooks
// =============================================================================

/**
 * Get country breakdown for a scan (from v_geoip_stats view)
 */
export function useGeoIPCountryBreakdown(scanId: number) {
  return useQuery({
    queryKey: geoipKeys.countryBreakdown(scanId),
    queryFn: async (): Promise<GeoIPCountryStats[]> => {
      return db.getGeoIPCountryStats(scanId)
    },
    enabled: scanId > 0,
    staleTime: 60000,
  })
}

/**
 * Get IP type breakdown for a scan
 */
export function useGeoIPTypeBreakdown(scanId: number) {
  const { data: records } = useScanGeoIP(scanId)

  return useMemo((): GeoIPTypeDistribution[] => {
    if (!records || records.length === 0) return []

    const typeCounts = new Map<IpType, number>()
    records.forEach((r) => {
      const type = (r.ip_type as IpType) || 'unknown'
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1)
    })

    const total = records.length
    return Array.from(typeCounts.entries())
      .map(([ip_type, count]) => ({
        ip_type,
        count,
        percentage: (count / total) * 100,
      }))
      .filter((t) => t.ip_type !== 'unknown' || t.count === total)  // Only show unknown if all are unknown
      .sort((a, b) => b.count - a.count)
  }, [records])
}

// =============================================================================
// Map Visualization Hooks
// =============================================================================

/**
 * Check if an IP address is private/RFC1918 (no meaningful geolocation)
 */
function isPrivateIp(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4) return false

  // 10.0.0.0/8
  if (parts[0] === 10) return true
  // 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true
  // 127.0.0.0/8 (loopback)
  if (parts[0] === 127) return true
  // 169.254.0.0/16 (link-local)
  if (parts[0] === 169 && parts[1] === 254) return true

  return false
}

/**
 * Fetch live GeoIP data for a list of IPs from the API
 */
async function fetchLiveGeoIP(ips: string[]): Promise<GeoIPMapPoint[]> {
  const apiUrl = import.meta.env.VITE_GEOIP_URL || 'http://localhost:3001'
  const results: GeoIPMapPoint[] = []

  // Batch lookups with concurrency limit
  const batchSize = 20
  for (let i = 0; i < ips.length; i += batchSize) {
    const batch = ips.slice(i, i + batchSize)
    const batchPromises = batch.map(async (ip) => {
      try {
        const response = await fetch(`${apiUrl}/lookup/${encodeURIComponent(ip)}`)
        if (!response.ok) return null
        const data = await response.json()
        if (data.latitude && data.longitude) {
          return {
            latitude: data.latitude,
            longitude: data.longitude,
            host_ip: ip,
            country_code: data.country_code || null,
            city: data.city || null,
            ip_type: data.ip_type || null,
            scan_id: 0, // Live lookup, not from stored scan
          } as GeoIPMapPoint
        }
        return null
      } catch {
        return null
      }
    })
    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults.filter((r): r is GeoIPMapPoint => r !== null))
  }

  return results
}

/**
 * Get GeoIP data as map points for visualization
 * Falls back to live lookups if no stored GeoIP data exists
 */
export function useGeoIPMapPoints(scanId: number) {
  return useQuery({
    queryKey: geoipKeys.mapPoints(scanId),
    queryFn: async (): Promise<GeoIPMapPoint[]> => {
      // First try to get stored GeoIP data
      const records = await db.getGeoIPByScan(scanId, { hasCoordinates: true })

      if (records.length > 0) {
        // Use stored data
        return records
          .filter((r): r is GeoIPRecord & { latitude: number; longitude: number } =>
            r.latitude !== null && r.longitude !== null
          )
          .map((r) => ({
            latitude: r.latitude,
            longitude: r.longitude,
            host_ip: r.host_ip,
            country_code: r.country_code,
            city: r.city,
            ip_type: r.ip_type,
            scan_id: r.scan_id,
          }))
      }

      // No stored data - fall back to live lookups
      // Get unique host IPs from scan's IP reports
      const ipReports = await db.getIpReports(scanId)
      const uniqueIps = [...new Set(ipReports.map((r) => r.host_addr))]

      // Filter out private IPs (no meaningful geolocation)
      const publicIps = uniqueIps.filter((ip) => !isPrivateIp(ip))

      if (publicIps.length === 0) {
        return []
      }

      // Fetch live GeoIP data
      return fetchLiveGeoIP(publicIps)
    },
    enabled: scanId > 0,
    staleTime: 60000,
  })
}

// =============================================================================
// ASN Breakdown Hook
// =============================================================================

/**
 * Get ASN breakdown for a scan
 */
export function useGeoIPAsnBreakdown(scanId: number, limit: number = 20) {
  const { data: records } = useScanGeoIP(scanId)

  return useMemo((): GeoIPAsnStats[] => {
    if (!records || records.length === 0) return []

    const asnMap = new Map<number, { as_org: string | null; count: number; countries: Set<string> }>()
    records.forEach((r) => {
      if (r.asn) {
        const existing = asnMap.get(r.asn)
        if (existing) {
          existing.count++
          if (r.country_code) existing.countries.add(r.country_code)
        } else {
          asnMap.set(r.asn, {
            as_org: r.as_org,
            count: 1,
            countries: new Set(r.country_code ? [r.country_code] : []),
          })
        }
      }
    })

    return Array.from(asnMap.entries())
      .map(([asn, data]) => ({
        asn,
        as_org: data.as_org,
        host_count: data.count,
        countries: Array.from(data.countries),
      }))
      .sort((a, b) => b.host_count - a.host_count)
      .slice(0, limit)
  }, [records, limit])
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Check if GeoIP data is available for a scan
 * Returns true if:
 * 1. Stored GeoIP data exists, OR
 * 2. Scan has public IPs that can be looked up live
 */
export function useHasGeoIP(scanId: number) {
  return useQuery({
    queryKey: [...geoipKeys.byScan(scanId), 'hasGeoIP'],
    queryFn: async (): Promise<boolean> => {
      // First check for stored GeoIP data
      const storedRecords = await db.getGeoIPByScan(scanId, { limit: 1 })
      if (storedRecords.length > 0) {
        return true
      }

      // No stored data - check if scan has public IPs for live lookup
      const ipReports = await db.getIpReports(scanId)
      const uniqueIps = [...new Set(ipReports.map((r) => r.host_addr))]
      const publicIps = uniqueIps.filter((ip) => !isPrivateIp(ip))

      return publicIps.length > 0
    },
    enabled: scanId > 0,
    staleTime: 60000,
  })
}

/**
 * Legacy hook for backwards compatibility
 */
export function useHasGeoIPLegacy(scanId: number) {
  const { data: records, isLoading } = useScanGeoIP(scanId, { limit: 1 })

  return {
    hasGeoIP: records && records.length > 0,
    isLoading,
  }
}
