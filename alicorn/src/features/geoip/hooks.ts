/**
 * GeoIP feature hooks with React Query
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getDatabase } from '@/lib/database'
import { getTimeRangeSeconds, type TimeRange } from '@/features/dashboard/types'
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
// Constants
// =============================================================================

/** Sentinel value meaning "aggregate data from all recent scans" */
export const ALL_SCANS = 0

// =============================================================================
// Query Keys
// =============================================================================

export const geoipKeys = {
  all: ['geoip'] as const,
  byHost: (hostIp: string) => [...geoipKeys.all, 'host', hostIp] as const,
  byScan: (scanId: number) => [...geoipKeys.all, 'scan', scanId] as const,
  byTimeRange: (timeRange: string) => [...geoipKeys.all, 'timeRange', timeRange] as const,
  stats: (scanId: number) => [...geoipKeys.all, 'stats', scanId] as const,
  statsTimeRange: (timeRange: string) => [...geoipKeys.all, 'stats', 'timeRange', timeRange] as const,
  countryBreakdown: (scanId: number) => [...geoipKeys.all, 'countries', scanId] as const,
  countryBreakdownTimeRange: (timeRange: string) => [...geoipKeys.all, 'countries', 'timeRange', timeRange] as const,
  typeBreakdown: (scanId: number) => [...geoipKeys.all, 'types', scanId] as const,
  typeBreakdownTimeRange: (timeRange: string) => [...geoipKeys.all, 'types', 'timeRange', timeRange] as const,
  mapPoints: (scanId: number) => [...geoipKeys.all, 'map', scanId] as const,
  mapPointsTimeRange: (timeRange: string) => [...geoipKeys.all, 'map', 'timeRange', timeRange] as const,
  asnBreakdown: (scanId: number) => [...geoipKeys.all, 'asns', scanId] as const,
  asnBreakdownTimeRange: (timeRange: string) => [...geoipKeys.all, 'asns', 'timeRange', timeRange] as const,
  hasGeoIPTimeRange: (timeRange: string) => [...geoipKeys.all, 'has', 'timeRange', timeRange] as const,
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
 * Falls back to live lookups if no stored GeoIP data exists
 * When scanId is 0, aggregates from all recent scans
 */
export function useScanGeoIP(scanId: number, options?: GeoIPQueryOptions) {
  return useQuery({
    queryKey: [...geoipKeys.byScan(scanId), options],
    queryFn: async (): Promise<GeoIPRecord[]> => {
      // Handle "all scans" case
      if (scanId === ALL_SCANS) {
        const scanIds = await getRecentScanIds()
        if (scanIds.length === 0) return []

        // Get stored data from all recent scans
        const allRecords: GeoIPRecord[] = []
        const ipsWithStoredData = new Set<string>()
        for (const sid of scanIds) {
          const records = await db.getGeoIPByScan(sid, options)
          records.forEach((r) => {
            if (!ipsWithStoredData.has(r.host_ip)) {
              ipsWithStoredData.add(r.host_ip)
              allRecords.push(r)
            }
          })
        }

        // Get all public IPs from scans and find ones missing GeoIP data
        const allPublicIps = await getPublicIpsForScan(ALL_SCANS)
        const ipsNeedingLookup = allPublicIps.filter((ip) => !ipsWithStoredData.has(ip))

        // Do live lookups for IPs without stored data
        if (ipsNeedingLookup.length > 0) {
          const liveRecords = await fetchLiveGeoIPRecords(ipsNeedingLookup, 0)
          allRecords.push(...(liveRecords as unknown as GeoIPRecord[]))
        }

        return allRecords
      }

      // Single scan case - get stored data first
      const storedRecords = await db.getGeoIPByScan(scanId, options)
      const ipsWithStoredData = new Set(storedRecords.map((r) => r.host_ip))

      // Get all public IPs and find ones missing GeoIP data
      const publicIps = await getPublicIpsForScan(scanId)
      const ipsNeedingLookup = publicIps.filter((ip) => !ipsWithStoredData.has(ip))

      // If all IPs have stored data, return stored records
      if (ipsNeedingLookup.length === 0) {
        return storedRecords
      }

      // Apply limit from options if specified
      const ipsToLookup = options?.limit
        ? ipsNeedingLookup.slice(0, options.limit)
        : ipsNeedingLookup

      // Fetch live GeoIP data for missing IPs and combine
      const liveRecords = await fetchLiveGeoIPRecords(ipsToLookup, scanId)
      return [...storedRecords, ...(liveRecords as unknown as GeoIPRecord[])]
    },
    enabled: true,
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
 * Aggregate live records into country stats
 */
function aggregateLiveRecordsToCountryStats(
  liveRecords: LiveGeoIPRecord[],
  scanId: number
): GeoIPCountryStats[] {
  const countryMap = new Map<string, {
    country_name: string | null
    count: number
    asns: Set<number>
    datacenter: number
    residential: number
    vpn: number
    proxy: number
    tor: number
    mobile: number
  }>()

  liveRecords.forEach((r) => {
    if (r.country_code) {
      const existing = countryMap.get(r.country_code)
      const ipType = r.ip_type || 'unknown'
      if (existing) {
        existing.count++
        if (r.asn) existing.asns.add(r.asn)
        if (ipType === 'datacenter') existing.datacenter++
        else if (ipType === 'residential') existing.residential++
        else if (ipType === 'vpn') existing.vpn++
        else if (ipType === 'proxy') existing.proxy++
        else if (ipType === 'tor') existing.tor++
        else if (ipType === 'mobile') existing.mobile++
      } else {
        countryMap.set(r.country_code, {
          country_name: r.country_name,
          count: 1,
          asns: new Set(r.asn ? [r.asn] : []),
          datacenter: ipType === 'datacenter' ? 1 : 0,
          residential: ipType === 'residential' ? 1 : 0,
          vpn: ipType === 'vpn' ? 1 : 0,
          proxy: ipType === 'proxy' ? 1 : 0,
          tor: ipType === 'tor' ? 1 : 0,
          mobile: ipType === 'mobile' ? 1 : 0,
        })
      }
    }
  })

  return Array.from(countryMap.entries())
    .map(([country_code, data]) => ({
      scan_id: scanId,
      country_code,
      country_name: data.country_name,
      host_count: data.count,
      unique_asns: data.asns.size,
      datacenter_count: data.datacenter,
      residential_count: data.residential,
      vpn_count: data.vpn,
      proxy_count: data.proxy,
      tor_count: data.tor,
      mobile_count: data.mobile,
    }))
    .sort((a, b) => b.host_count - a.host_count)
}

/**
 * Get country breakdown for a scan (from v_geoip_stats view)
 * Combines stored data with live lookups for IPs missing stored data
 * When scanId is 0, aggregates from all recent scans
 */
export function useGeoIPCountryBreakdown(scanId: number) {
  return useQuery({
    queryKey: geoipKeys.countryBreakdown(scanId),
    queryFn: async (): Promise<GeoIPCountryStats[]> => {
      // Handle "all scans" case
      if (scanId === ALL_SCANS) {
        const scanIds = await getRecentScanIds()
        if (scanIds.length === 0) return []

        // Get stored GeoIP records and track which IPs have data
        const ipsWithStoredData = new Set<string>()
        const storedRecords: LiveGeoIPRecord[] = []
        for (const sid of scanIds) {
          const records = await db.getGeoIPByScan(sid)
          records.forEach((r) => {
            if (!ipsWithStoredData.has(r.host_ip)) {
              ipsWithStoredData.add(r.host_ip)
              storedRecords.push(r as unknown as LiveGeoIPRecord)
            }
          })
        }

        // Get all public IPs and find ones missing GeoIP data
        const allPublicIps = await getPublicIpsForScan(ALL_SCANS)
        const ipsNeedingLookup = allPublicIps.filter((ip) => !ipsWithStoredData.has(ip))

        // Do live lookups for IPs without stored data
        let liveRecords: LiveGeoIPRecord[] = []
        if (ipsNeedingLookup.length > 0) {
          liveRecords = await fetchLiveGeoIPRecords(ipsNeedingLookup, 0)
        }

        // Combine and aggregate to country stats
        const allRecords = [...storedRecords, ...liveRecords]
        return aggregateLiveRecordsToCountryStats(allRecords, 0)
      }

      // Single scan case - get stored records and track which IPs have data
      const storedRecords = await db.getGeoIPByScan(scanId)
      const ipsWithStoredData = new Set(storedRecords.map((r) => r.host_ip))

      // Get all public IPs and find ones missing GeoIP data
      const publicIps = await getPublicIpsForScan(scanId)
      const ipsNeedingLookup = publicIps.filter((ip) => !ipsWithStoredData.has(ip))

      // Do live lookups for IPs without stored data
      let liveRecords: LiveGeoIPRecord[] = []
      if (ipsNeedingLookup.length > 0) {
        liveRecords = await fetchLiveGeoIPRecords(ipsNeedingLookup, scanId)
      }

      // Combine and aggregate to country stats
      const allRecords = [
        ...(storedRecords as unknown as LiveGeoIPRecord[]),
        ...liveRecords,
      ]
      return aggregateLiveRecordsToCountryStats(allRecords, scanId)
    },
    enabled: true,
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
 * Live GeoIP record type (matches API response)
 */
interface LiveGeoIPRecord {
  host_ip: string
  country_code: string | null
  country_name: string | null
  region_code: string | null
  region_name: string | null
  city: string | null
  postal_code: string | null
  latitude: number | null
  longitude: number | null
  timezone: string | null
  ip_type: IpType | null
  isp: string | null
  organization: string | null
  asn: number | null
  as_org: string | null
  provider: string
  scan_id: number
}

/**
 * Fetch live GeoIP data for a list of IPs from the API
 * Returns full GeoIP records (not just map points)
 */
async function fetchLiveGeoIPRecords(ips: string[], scanId: number): Promise<LiveGeoIPRecord[]> {
  const apiUrl = import.meta.env.VITE_GEOIP_URL || 'http://localhost:3001'
  const results: LiveGeoIPRecord[] = []

  // Batch lookups with concurrency limit
  const batchSize = 20
  for (let i = 0; i < ips.length; i += batchSize) {
    const batch = ips.slice(i, i + batchSize)
    const batchPromises = batch.map(async (ip) => {
      try {
        const response = await fetch(`${apiUrl}/lookup/${encodeURIComponent(ip)}`)
        if (!response.ok) return null
        const data = await response.json()
        // Only include if we got meaningful data
        if (data.country_code || data.asn || (data.latitude && data.longitude)) {
          return {
            host_ip: ip,
            country_code: data.country_code || null,
            country_name: data.country_name || null,
            region_code: data.region_code || null,
            region_name: data.region_name || null,
            city: data.city || null,
            postal_code: data.postal_code || null,
            latitude: data.latitude || null,
            longitude: data.longitude || null,
            timezone: data.timezone || null,
            ip_type: data.ip_type || null,
            isp: data.isp || null,
            organization: data.organization || null,
            asn: data.asn || null,
            as_org: data.as_org || null,
            provider: data.provider || 'unknown',
            scan_id: scanId,
          } as LiveGeoIPRecord
        }
        return null
      } catch {
        return null
      }
    })
    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults.filter((r): r is LiveGeoIPRecord => r !== null))
  }

  return results
}

/**
 * Get recent scan IDs (last 30 days, up to 20 scans)
 * @deprecated Use getScanIdsByTimeRange() for time-range-based filtering
 */
async function getRecentScanIds(): Promise<number[]> {
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60)
  const scans = await db.getScans({ limit: 100 })
  // Filter to last 30 days and take first 20
  return scans
    .filter((s) => s.s_time >= thirtyDaysAgo)
    .slice(0, 20)
    .map((s) => s.scan_id)
}

/**
 * Get ALL scan IDs within the specified time range (no arbitrary limit)
 * Used by time-range-based GeoIP hooks to aggregate data across all scans
 */
async function getScanIdsByTimeRange(timeRange: TimeRange): Promise<number[]> {
  const seconds = getTimeRangeSeconds(timeRange)
  const sinceTimestamp = seconds !== null
    ? Math.floor(Date.now() / 1000) - seconds
    : 0  // 'all' time range
  const scans = await db.getScans({ limit: 10000 })  // High limit to get all scans
  return scans
    .filter((s) => s.s_time >= sinceTimestamp)
    .map((s) => s.scan_id)
}

/**
 * Get public IPs from scans within a time range
 */
async function getPublicIpsForTimeRange(timeRange: TimeRange): Promise<string[]> {
  const scanIds = await getScanIdsByTimeRange(timeRange)
  if (scanIds.length === 0) return []

  const allIps = new Set<string>()
  for (const sid of scanIds) {
    const ipReports = await db.getIpReports(sid)
    ipReports.forEach((r) => {
      if (!isPrivateIp(r.host_addr)) {
        allIps.add(r.host_addr)
      }
    })
  }
  return Array.from(allIps)
}

/**
 * Get public IPs from a scan's IP reports
 * When scanId is 0, gets IPs from all recent scans
 */
async function getPublicIpsForScan(scanId: number): Promise<string[]> {
  if (scanId === ALL_SCANS) {
    // Get IPs from all recent scans
    const scanIds = await getRecentScanIds()
    if (scanIds.length === 0) return []

    const allIps = new Set<string>()
    for (const sid of scanIds) {
      const ipReports = await db.getIpReports(sid)
      ipReports.forEach((r) => {
        if (!isPrivateIp(r.host_addr)) {
          allIps.add(r.host_addr)
        }
      })
    }
    return Array.from(allIps)
  }

  const ipReports = await db.getIpReports(scanId)
  const uniqueIps = [...new Set(ipReports.map((r) => r.host_addr))]
  return uniqueIps.filter((ip) => !isPrivateIp(ip))
}

/**
 * Get GeoIP data as map points for visualization
 * Combines stored data with live lookups for IPs missing stored data
 */
export function useGeoIPMapPoints(scanId: number) {
  return useQuery({
    queryKey: geoipKeys.mapPoints(scanId),
    queryFn: async (): Promise<GeoIPMapPoint[]> => {
      // Handle "all scans" case
      if (scanId === ALL_SCANS) {
        const scanIds = await getRecentScanIds()
        if (scanIds.length === 0) return []

        // Get stored data from all scans and track which IPs have data
        const allPoints: GeoIPMapPoint[] = []
        const ipsWithStoredData = new Set<string>()
        for (const sid of scanIds) {
          const records = await db.getGeoIPByScan(sid, { hasCoordinates: true })
          records
            .filter((r): r is GeoIPRecord & { latitude: number; longitude: number } =>
              r.latitude !== null && r.longitude !== null
            )
            .forEach((r) => {
              if (!ipsWithStoredData.has(r.host_ip)) {
                ipsWithStoredData.add(r.host_ip)
                allPoints.push({
                  latitude: r.latitude,
                  longitude: r.longitude,
                  host_ip: r.host_ip,
                  country_code: r.country_code,
                  city: r.city,
                  ip_type: r.ip_type,
                  scan_id: r.scan_id,
                })
              }
            })
        }

        // Get all public IPs and find ones missing GeoIP data
        const allPublicIps = await getPublicIpsForScan(ALL_SCANS)
        const ipsNeedingLookup = allPublicIps.filter((ip) => !ipsWithStoredData.has(ip))

        // Do live lookups for IPs without stored data
        if (ipsNeedingLookup.length > 0) {
          const liveRecords = await fetchLiveGeoIPRecords(ipsNeedingLookup, 0)
          liveRecords
            .filter((r): r is LiveGeoIPRecord & { latitude: number; longitude: number } =>
              r.latitude !== null && r.longitude !== null
            )
            .forEach((r) => {
              allPoints.push({
                latitude: r.latitude,
                longitude: r.longitude,
                host_ip: r.host_ip,
                country_code: r.country_code,
                city: r.city,
                ip_type: r.ip_type,
                scan_id: r.scan_id,
              })
            })
        }

        return allPoints
      }

      // Single scan case - get stored data and track which IPs have it
      const records = await db.getGeoIPByScan(scanId, { hasCoordinates: true })
      const ipsWithStoredData = new Set(records.map((r) => r.host_ip))

      const storedPoints: GeoIPMapPoint[] = records
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

      // Get all public IPs and find ones missing GeoIP data
      const publicIps = await getPublicIpsForScan(scanId)
      const ipsNeedingLookup = publicIps.filter((ip) => !ipsWithStoredData.has(ip))

      // If no IPs need lookup, return stored points
      if (ipsNeedingLookup.length === 0) {
        return storedPoints
      }

      // Fetch live GeoIP data for missing IPs and combine
      const liveRecords = await fetchLiveGeoIPRecords(ipsNeedingLookup, scanId)
      const livePoints = liveRecords
        .filter((r): r is LiveGeoIPRecord & { latitude: number; longitude: number } =>
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

      return [...storedPoints, ...livePoints]
    },
    enabled: true,
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
      // Handle "all scans" case
      if (scanId === ALL_SCANS) {
        const scanIds = await getRecentScanIds()
        if (scanIds.length === 0) return false

        // Check if any scan has stored GeoIP data
        for (const sid of scanIds) {
          const storedRecords = await db.getGeoIPByScan(sid, { limit: 1 })
          if (storedRecords.length > 0) return true
        }

        // Check if any scan has public IPs for live lookup
        const publicIps = await getPublicIpsForScan(ALL_SCANS)
        return publicIps.length > 0
      }

      // Single scan case - first check for stored GeoIP data
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
    enabled: true,
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

// =============================================================================
// Time-Range-Based GeoIP Hooks (for Statistics page)
// =============================================================================

/**
 * Check if there's GeoIP data available for scans in the time range
 */
export function useHasGeoIPForTimeRange(timeRange: TimeRange) {
  return useQuery({
    queryKey: geoipKeys.hasGeoIPTimeRange(timeRange),
    queryFn: async (): Promise<boolean> => {
      const scanIds = await getScanIdsByTimeRange(timeRange)
      if (scanIds.length === 0) return false

      // Check if any scan has GeoIP data
      for (const sid of scanIds) {
        const storedRecords = await db.getGeoIPByScan(sid, { limit: 1 })
        if (storedRecords.length > 0) return true
      }

      // No stored data - check for public IPs that could be looked up
      const publicIps = await getPublicIpsForTimeRange(timeRange)
      return publicIps.length > 0
    },
    staleTime: 60000,
  })
}

/**
 * Get GeoIP country breakdown for all scans in time range
 */
export function useGeoIPCountryBreakdownForTimeRange(timeRange: TimeRange) {
  return useQuery({
    queryKey: geoipKeys.countryBreakdownTimeRange(timeRange),
    queryFn: async (): Promise<GeoIPCountryStats[]> => {
      const scanIds = await getScanIdsByTimeRange(timeRange)
      if (scanIds.length === 0) return []

      // Aggregate stored data from all scans
      const allRecords: GeoIPRecord[] = []
      const ipsWithStoredData = new Set<string>()
      for (const sid of scanIds) {
        const records = await db.getGeoIPByScan(sid)
        records.forEach((r) => {
          if (!ipsWithStoredData.has(r.host_ip)) {
            ipsWithStoredData.add(r.host_ip)
            allRecords.push(r)
          }
        })
      }

      // Get public IPs needing live lookup
      const allPublicIps = await getPublicIpsForTimeRange(timeRange)
      const ipsNeedingLookup = allPublicIps.filter((ip) => !ipsWithStoredData.has(ip))

      // Do live lookups
      if (ipsNeedingLookup.length > 0) {
        const liveRecords = await fetchLiveGeoIPRecords(ipsNeedingLookup, 0)
        allRecords.push(...(liveRecords as unknown as GeoIPRecord[]))
      }

      // Aggregate by country
      return aggregateRecordsToCountryStats(allRecords)
    },
    staleTime: 60000,
  })
}

/**
 * Get GeoIP map points for all scans in time range
 */
export function useGeoIPMapPointsForTimeRange(timeRange: TimeRange) {
  return useQuery({
    queryKey: geoipKeys.mapPointsTimeRange(timeRange),
    queryFn: async (): Promise<GeoIPMapPoint[]> => {
      const scanIds = await getScanIdsByTimeRange(timeRange)
      if (scanIds.length === 0) return []

      const allPoints: GeoIPMapPoint[] = []
      const ipsWithStoredData = new Set<string>()

      for (const sid of scanIds) {
        const records = await db.getGeoIPByScan(sid, { hasCoordinates: true })
        records
          .filter((r): r is GeoIPRecord & { latitude: number; longitude: number } =>
            r.latitude !== null && r.longitude !== null
          )
          .forEach((r) => {
            if (!ipsWithStoredData.has(r.host_ip)) {
              ipsWithStoredData.add(r.host_ip)
              allPoints.push({
                latitude: r.latitude,
                longitude: r.longitude,
                host_ip: r.host_ip,
                country_code: r.country_code,
                city: r.city,
                ip_type: r.ip_type,
                scan_id: r.scan_id,
              })
            }
          })
      }

      // Get IPs needing live lookup
      const allPublicIps = await getPublicIpsForTimeRange(timeRange)
      const ipsNeedingLookup = allPublicIps.filter((ip) => !ipsWithStoredData.has(ip))

      if (ipsNeedingLookup.length > 0) {
        const liveRecords = await fetchLiveGeoIPRecords(ipsNeedingLookup, 0)
        liveRecords
          .filter((r) => r.latitude !== null && r.longitude !== null)
          .forEach((r) => {
            allPoints.push({
              latitude: r.latitude!,
              longitude: r.longitude!,
              host_ip: r.host_ip,
              country_code: r.country_code,
              city: r.city,
              ip_type: r.ip_type as IpType,
              scan_id: 0,
            })
          })
      }

      return allPoints
    },
    staleTime: 60000,
  })
}

/**
 * Get GeoIP type breakdown for all scans in time range
 */
export function useGeoIPTypeBreakdownForTimeRange(timeRange: TimeRange): GeoIPTypeDistribution[] {
  const { data: countryStats } = useGeoIPCountryBreakdownForTimeRange(timeRange)

  return useMemo(() => {
    if (!countryStats || countryStats.length === 0) return []

    const typeCounts: Record<IpType, number> = {
      datacenter: 0,
      residential: 0,
      vpn: 0,
      proxy: 0,
      tor: 0,
      mobile: 0,
      unknown: 0,
    }

    let total = 0
    countryStats.forEach((cs) => {
      typeCounts.datacenter += cs.datacenter_count
      typeCounts.residential += cs.residential_count
      typeCounts.vpn += cs.vpn_count
      typeCounts.proxy += cs.proxy_count
      typeCounts.tor += cs.tor_count
      typeCounts.mobile += cs.mobile_count
      total += cs.host_count
    })

    // Calculate unknown (hosts with no IP type classification)
    const classified = Object.entries(typeCounts)
      .filter(([k]) => k !== 'unknown')
      .reduce((acc, [, v]) => acc + v, 0)
    typeCounts.unknown = Math.max(0, total - classified)

    // Convert to distribution array with percentages
    const distribution: GeoIPTypeDistribution[] = Object.entries(typeCounts)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => ({
        ip_type: type as IpType,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)

    // Filter out "unknown" if it's the only one or if there are better classifications
    if (distribution.length > 1) {
      return distribution.filter((d) => d.ip_type !== 'unknown' || d.percentage > 50)
    }

    return distribution
  }, [countryStats])
}

/**
 * Get GeoIP ASN breakdown for all scans in time range
 */
export function useGeoIPAsnBreakdownForTimeRange(timeRange: TimeRange, _limit: number = 20): GeoIPAsnStats[] {
  const { data: countryStats } = useGeoIPCountryBreakdownForTimeRange(timeRange)

  // We need to re-aggregate to get ASN breakdown since country stats aggregate by country
  // For now, return empty and let the full implementation fetch ASN data properly
  return useMemo(() => {
    // TODO: implement proper ASN aggregation across time range
    // For now, return empty - the country breakdown is the main visualization
    return []
  }, [countryStats])
}

/**
 * Get GeoIP stats for all scans in time range
 */
export function useGeoIPStatsForTimeRange(timeRange: TimeRange) {
  return useQuery({
    queryKey: geoipKeys.statsTimeRange(timeRange),
    queryFn: async (): Promise<GeoIPScanStats> => {
      const scanIds = await getScanIdsByTimeRange(timeRange)
      if (scanIds.length === 0) {
        return {
          scan_id: ALL_SCANS,
          total_hosts: 0,
          hosts_with_geoip: 0,
          country_count: 0,
          countries: [],
          asn_count: 0,
          coverage_percentage: 0,
          type_distribution: [],
          top_asns: [],
          bounds: null,
        }
      }

      // Aggregate stored data from all scans (deduplicated by IP)
      const allRecords: GeoIPRecord[] = []
      const ipsWithStoredData = new Set<string>()
      for (const sid of scanIds) {
        const records = await db.getGeoIPByScan(sid)
        records.forEach((r) => {
          if (!ipsWithStoredData.has(r.host_ip)) {
            ipsWithStoredData.add(r.host_ip)
            allRecords.push(r)
          }
        })
      }

      // Get total public IPs
      const allPublicIps = await getPublicIpsForTimeRange(timeRange)

      // Calculate stats
      const countries = new Set<string>()
      const asns = new Set<number>()
      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
      let hasCoords = false

      allRecords.forEach((r) => {
        if (r.country_code) countries.add(r.country_code)
        if (r.asn) asns.add(r.asn)
        if (r.latitude !== null && r.longitude !== null) {
          hasCoords = true
          minLat = Math.min(minLat, r.latitude)
          maxLat = Math.max(maxLat, r.latitude)
          minLng = Math.min(minLng, r.longitude)
          maxLng = Math.max(maxLng, r.longitude)
        }
      })

      return {
        scan_id: ALL_SCANS,
        total_hosts: allPublicIps.length,
        hosts_with_geoip: allRecords.length,
        country_count: countries.size,
        countries: [],  // Calculated separately by useGeoIPCountryBreakdownForTimeRange
        asn_count: asns.size,
        coverage_percentage: allPublicIps.length > 0
          ? (allRecords.length / allPublicIps.length) * 100
          : 0,
        type_distribution: [],  // Calculated separately by useGeoIPTypeBreakdownForTimeRange
        top_asns: [],  // Calculated separately
        bounds: hasCoords ? {
          min_lat: minLat,
          max_lat: maxLat,
          min_lng: minLng,
          max_lng: maxLng,
        } : null,
      }
    },
    staleTime: 60000,
  })
}

/**
 * Helper to aggregate records to country stats
 */
function aggregateRecordsToCountryStats(records: GeoIPRecord[]): GeoIPCountryStats[] {
  const countryMap = new Map<string, GeoIPCountryStats>()

  records.forEach((r) => {
    const cc = r.country_code || 'Unknown'
    if (!countryMap.has(cc)) {
      countryMap.set(cc, {
        scan_id: ALL_SCANS,  // Sentinel value for aggregated data
        country_code: cc,
        country_name: r.country_name || cc,
        host_count: 0,
        unique_asns: 0,
        datacenter_count: 0,
        residential_count: 0,
        vpn_count: 0,
        proxy_count: 0,
        tor_count: 0,
        mobile_count: 0,
      })
    }

    const stats = countryMap.get(cc)!
    stats.host_count++

    // Track IP type
    switch (r.ip_type) {
      case 'datacenter': stats.datacenter_count++; break
      case 'residential': stats.residential_count++; break
      case 'vpn': stats.vpn_count++; break
      case 'proxy': stats.proxy_count++; break
      case 'tor': stats.tor_count++; break
      case 'mobile': stats.mobile_count++; break
    }
  })

  // Calculate unique ASNs per country
  const countryAsns = new Map<string, Set<number>>()
  records.forEach((r) => {
    const cc = r.country_code || 'Unknown'
    if (r.asn) {
      if (!countryAsns.has(cc)) countryAsns.set(cc, new Set())
      countryAsns.get(cc)!.add(r.asn)
    }
  })

  countryMap.forEach((stats, cc) => {
    stats.unique_asns = countryAsns.get(cc)?.size || 0
  })

  return Array.from(countryMap.values())
    .sort((a, b) => b.host_count - a.host_count)
}
