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
  byScan: (scansId: number) => [...geoipKeys.all, 'scan', scansId] as const,
  stats: (scansId: number) => [...geoipKeys.all, 'stats', scansId] as const,
  countryBreakdown: (scansId: number) => [...geoipKeys.all, 'countries', scansId] as const,
  typeBreakdown: (scansId: number) => [...geoipKeys.all, 'types', scansId] as const,
  mapPoints: (scansId: number) => [...geoipKeys.all, 'map', scansId] as const,
  asnBreakdown: (scansId: number) => [...geoipKeys.all, 'asns', scansId] as const,
}

// =============================================================================
// Single Host GeoIP Hook
// =============================================================================

/**
 * Get GeoIP data for a specific host IP
 * Returns the most recent lookup, optionally filtered by scan
 */
export function useGeoIP(hostIp: string, scansId?: number) {
  return useQuery({
    queryKey: scansId ? [...geoipKeys.byHost(hostIp), scansId] : geoipKeys.byHost(hostIp),
    queryFn: async (): Promise<GeoIPRecord | null> => {
      return db.getGeoIPByHost(hostIp, scansId)
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
export function useScanGeoIP(scansId: number, options?: GeoIPQueryOptions) {
  return useQuery({
    queryKey: [...geoipKeys.byScan(scansId), options],
    queryFn: async (): Promise<GeoIPRecord[]> => {
      return db.getGeoIPByScan(scansId, options)
    },
    enabled: scansId > 0,
    staleTime: 60000,
  })
}

/**
 * Get aggregated GeoIP statistics for a scan
 */
export function useGeoIPStats(scansId: number) {
  const { data: geoipRecords, isLoading: recordsLoading } = useScanGeoIP(scansId)
  const { data: countryStats, isLoading: countryLoading } = useGeoIPCountryBreakdown(scansId)

  const stats = useMemo((): GeoIPScanStats | null => {
    if (!geoipRecords) return null

    const total = geoipRecords.length
    if (total === 0) {
      return {
        scans_id: scansId,
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
      scans_id: scansId,
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
  }, [geoipRecords, countryStats, scansId])

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
export function useGeoIPCountryBreakdown(scansId: number) {
  return useQuery({
    queryKey: geoipKeys.countryBreakdown(scansId),
    queryFn: async (): Promise<GeoIPCountryStats[]> => {
      return db.getGeoIPCountryStats(scansId)
    },
    enabled: scansId > 0,
    staleTime: 60000,
  })
}

/**
 * Get IP type breakdown for a scan
 */
export function useGeoIPTypeBreakdown(scansId: number) {
  const { data: records } = useScanGeoIP(scansId)

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
 * Get GeoIP data as map points for visualization
 */
export function useGeoIPMapPoints(scansId: number) {
  return useQuery({
    queryKey: geoipKeys.mapPoints(scansId),
    queryFn: async (): Promise<GeoIPMapPoint[]> => {
      const records = await db.getGeoIPByScan(scansId, { hasCoordinates: true })
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
          scans_id: r.scans_id,
        }))
    },
    enabled: scansId > 0,
    staleTime: 60000,
  })
}

// =============================================================================
// ASN Breakdown Hook
// =============================================================================

/**
 * Get ASN breakdown for a scan
 */
export function useGeoIPAsnBreakdown(scansId: number, limit: number = 20) {
  const { data: records } = useScanGeoIP(scansId)

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
 */
export function useHasGeoIP(scansId: number) {
  const { data: records, isLoading } = useScanGeoIP(scansId, { limit: 1 })

  return {
    hasGeoIP: records && records.length > 0,
    isLoading,
  }
}
