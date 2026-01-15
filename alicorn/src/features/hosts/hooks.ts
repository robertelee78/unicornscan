/**
 * Hosts feature hooks with filtering and host detail data
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getDatabase } from '@/lib/database'
import { searchVendors, macMatchesOuis, isOuiLoaded } from '@/lib/oui'
import type { Host, IpReport } from '@/types/database'
import type { HostFilters, SortState, PaginationState, PortHistoryEntry, AggregatedPortEntry, HostScanEntry } from './types'
import {
  parseSearch,
  matchesCIDR,
  matchesIPPrefix,
  matchesMAC,
  matchesBanner,
  matchesText,
  type ParsedSearch,
} from './search-utils'

const db = getDatabase()

// =============================================================================
// Query Keys
// =============================================================================

export const hostListKeys = {
  all: ['hostList'] as const,
  filtered: (filters: HostFilters, sort: SortState, pagination: PaginationState) =>
    [...hostListKeys.all, 'filtered', filters, sort, pagination] as const,
  portHistory: (hostIp: string) => [...hostListKeys.all, 'portHistory', hostIp] as const,
  aggregatedPorts: (hostIp: string) => [...hostListKeys.all, 'aggregatedPorts', hostIp] as const,
  hostScans: (hostIp: string) => [...hostListKeys.all, 'hostScans', hostIp] as const,
  hostReports: (hostIp: string) => [...hostListKeys.all, 'hostReports', hostIp] as const,
  // Search index keys (for smart search feature)
  bannerIndex: () => [...hostListKeys.all, 'bannerIndex'] as const,
  notesIndex: () => [...hostListKeys.all, 'notesIndex'] as const,
  portsIndex: () => [...hostListKeys.all, 'portsIndex'] as const,
  asnIndex: () => [...hostListKeys.all, 'asnIndex'] as const,
}

// =============================================================================
// Search Index Hooks (for smart search feature)
// =============================================================================

/**
 * Hook to fetch all host banners indexed by host address.
 * Lazy-loaded only when search requires banner matching.
 */
export function useHostBannerIndex(enabled = true) {
  return useQuery({
    queryKey: hostListKeys.bannerIndex(),
    queryFn: () => db.getHostBannerIndex(),
    enabled,
    staleTime: 60000, // 60 seconds - banners change slowly
    gcTime: 300000,   // Keep in cache for 5 minutes
  })
}

/**
 * Hook to fetch all host notes indexed by host address.
 * Lazy-loaded only when search requires notes matching.
 */
export function useHostNotesIndex(enabled = true) {
  return useQuery({
    queryKey: hostListKeys.notesIndex(),
    queryFn: () => db.getHostNotesIndex(),
    enabled,
    staleTime: 30000, // 30 seconds - notes may change more frequently
    gcTime: 300000,
  })
}

/**
 * Hook to fetch all host ports indexed by host address.
 * Required for port number search.
 */
export function useHostPortsIndex(enabled = true) {
  return useQuery({
    queryKey: hostListKeys.portsIndex(),
    queryFn: () => db.getHostPortsIndex(),
    enabled,
    staleTime: 30000,
    gcTime: 300000,
  })
}

/**
 * Hook to fetch all host ASN data indexed by host address.
 * Data comes from uni_geoip table (stored at scan time).
 * Required for ASN search filtering.
 */
export function useHostAsnIndex(enabled = true) {
  return useQuery({
    queryKey: hostListKeys.asnIndex(),
    queryFn: () => db.getHostAsnIndex(),
    enabled,
    staleTime: 60000, // ASN data changes slowly
    gcTime: 300000,
  })
}

// =============================================================================
// List Hook
// =============================================================================

interface UseHostListResult {
  data: Host[]
  total: number
  isLoading: boolean
  error: Error | null
  /** Parsed search for UI display (detected type, etc.) */
  parsedSearch: ParsedSearch | null
}

/**
 * Check if a host matches the parsed search query.
 * Handles all search types: text, port, cidr, ip-prefix, mac, asn, regex
 */
function hostMatchesSearch(
  host: Host,
  search: ParsedSearch,
  bannerIndex: Map<string, string[]> | undefined,
  notesIndex: Map<string, string[]> | undefined,
  portsIndex: Map<string, number[]> | undefined,
  asnIndex: Map<string, number> | undefined
): boolean {
  const hostAddr = host.ip_addr ?? host.host_addr

  switch (search.type) {
    case 'port': {
      // Match hosts that have this port
      if (!portsIndex || !search.port) return false
      const hostPorts = portsIndex.get(hostAddr)
      return hostPorts ? hostPorts.includes(search.port) : false
    }

    case 'asn': {
      // Match hosts in this Autonomous System Number
      if (!asnIndex || !search.asn) return false
      const hostAsn = asnIndex.get(hostAddr)
      return hostAsn === search.asn
    }

    case 'cidr':
      // Match hosts within CIDR range
      if (!search.cidr) return false
      return matchesCIDR(hostAddr, search.cidr)

    case 'ip-prefix':
      // Match hosts with IP starting with prefix
      return matchesIPPrefix(hostAddr, search.value)

    case 'mac': {
      // Match hosts with matching MAC address
      const mac = host.current_mac || host.mac_addr
      return matchesMAC(mac, search.value)
    }

    case 'regex': {
      // Apply regex to banners only
      if (!bannerIndex) return false
      const banners = bannerIndex.get(hostAddr) || []
      return banners.some(b => matchesBanner(b, search))
    }

    case 'text':
    default:
      // Search across multiple fields: IP, hostname, MAC, banners, notes, OS
      // IP address
      if (matchesText(hostAddr, search)) return true
      // Hostname
      if (matchesText(host.hostname, search)) return true
      // MAC address (current or legacy)
      if (matchesText(host.current_mac || host.mac_addr, search)) return true
      // OS info
      if (matchesText(host.os_name, search)) return true
      if (matchesText(host.os_family, search)) return true
      if (matchesText(host.os_guess, search)) return true
      if (matchesText(host.device_type, search)) return true
      // Banners (if loaded)
      if (bannerIndex) {
        const hostBanners = bannerIndex.get(hostAddr) || []
        if (hostBanners.some(b => matchesBanner(b, search))) return true
      }
      // Notes (if loaded)
      if (notesIndex) {
        const hostNotes = notesIndex.get(hostAddr) || []
        if (hostNotes.some(n => matchesText(n, search))) return true
      }
      return false
  }
}

export function useHostList(
  filters: HostFilters,
  sort: SortState,
  pagination: PaginationState
): UseHostListResult {
  // Parse the search string to determine type
  const parsedSearch = useMemo(() => {
    if (!filters.search.trim()) return null
    return parseSearch(filters.search)
  }, [filters.search])

  // Determine which indexes we need based on search type and filters
  const needsBannerIndex = parsedSearch?.type === 'regex' || parsedSearch?.type === 'text' || filters.hasBanner !== null
  const needsNotesIndex = parsedSearch?.type === 'text'
  const needsPortsIndex = parsedSearch?.type === 'port'
  const needsAsnIndex = parsedSearch?.type === 'asn'

  // Fetch hosts
  const { data: hosts, isLoading: hostsLoading, error: hostsError } = useQuery({
    queryKey: hostListKeys.filtered(filters, sort, pagination),
    queryFn: async () => {
      const hosts = await db.getHosts({ limit: 1000 })
      return hosts
    },
    staleTime: 30000,
  })

  // Fetch search indexes (lazy - only when needed)
  const { data: bannerIndex, isLoading: bannersLoading } = useHostBannerIndex(needsBannerIndex)
  const { data: notesIndex, isLoading: notesLoading } = useHostNotesIndex(needsNotesIndex)
  const { data: portsIndex, isLoading: portsLoading } = useHostPortsIndex(needsPortsIndex)
  const { data: asnIndex, isLoading: asnLoading } = useHostAsnIndex(needsAsnIndex)

  // Combined loading state
  const isLoading = hostsLoading ||
    (needsBannerIndex && bannersLoading) ||
    (needsNotesIndex && notesLoading) ||
    (needsPortsIndex && portsLoading) ||
    (needsAsnIndex && asnLoading)

  // Apply filters, sort, and pagination client-side
  const result = useMemo(() => {
    let filtered = [...(hosts || [])]

    // Apply smart search filter
    if (parsedSearch) {
      filtered = filtered.filter((h) =>
        hostMatchesSearch(h, parsedSearch, bannerIndex, notesIndex, portsIndex, asnIndex)
      )
    }

    // Apply hasOpenPorts filter (actually "responding ports" - got a packet back)
    if (filters.hasOpenPorts !== null) {
      const getPortCount = (h: Host) => h.port_count ?? 0
      filtered = filtered.filter((h) =>
        filters.hasOpenPorts ? getPortCount(h) > 0 : getPortCount(h) === 0
      )
    }

    // Apply vendor filter (requires OUI data to be loaded)
    if (filters.vendorFilter && isOuiLoaded()) {
      const matches = searchVendors(filters.vendorFilter, 1000)
      const ouiPrefixes = matches.map((m) => m.oui)
      filtered = filtered.filter((h) => {
        const mac = h.current_mac || h.mac_addr
        return macMatchesOuis(mac, ouiPrefixes)
      })
    }

    // Apply banner filter
    if (filters.hasBanner !== null && bannerIndex) {
      filtered = filtered.filter((h) => {
        const hostAddr = h.ip_addr ?? h.host_addr
        const banners = bannerIndex.get(hostAddr) || []
        const hasBanners = banners.length > 0
        return filters.hasBanner ? hasBanners : !hasBanners
      })
    }

    const total = filtered.length

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: string | number | null
      let bVal: string | number | null

      switch (sort.field) {
        case 'host_addr':
          // Sort IP addresses numerically
          aVal = (a.ip_addr ?? a.host_addr).split('.').reduce((acc, octet) => acc * 256 + parseInt(octet), 0)
          bVal = (b.ip_addr ?? b.host_addr).split('.').reduce((acc, octet) => acc * 256 + parseInt(octet), 0)
          break
        case 'hostname':
          aVal = a.hostname?.toLowerCase() ?? ''
          bVal = b.hostname?.toLowerCase() ?? ''
          break
        case 'port_count':
          aVal = a.port_count ?? 0
          bVal = b.port_count ?? 0
          break
        case 'scan_count':
          aVal = a.scan_count
          bVal = b.scan_count
          break
        case 'first_seen':
          aVal = a.first_seen
          bVal = b.first_seen
          break
        case 'last_seen':
        default:
          aVal = a.last_seen
          bVal = b.last_seen
      }

      if (typeof aVal === 'string') {
        const cmp = aVal.localeCompare(bVal as string)
        return sort.direction === 'asc' ? cmp : -cmp
      }
      return sort.direction === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })

    // Apply pagination
    const start = (pagination.page - 1) * pagination.pageSize
    const paged = filtered.slice(start, start + pagination.pageSize)

    return { data: paged, total }
  }, [hosts, parsedSearch, bannerIndex, notesIndex, portsIndex, asnIndex, filters.hasOpenPorts, filters.hasBanner, filters.vendorFilter, sort, pagination])

  return {
    data: result.data,
    total: result.total,
    isLoading,
    error: hostsError as Error | null,
    parsedSearch,
  }
}

// =============================================================================
// Port History Hook
// =============================================================================

export function useHostPortHistory(hostIp: string) {
  return useQuery({
    queryKey: hostListKeys.portHistory(hostIp),
    queryFn: async (): Promise<PortHistoryEntry[]> => {
      // Get all IP reports for this host across all scans
      // Note: This is a simplified approach - for large datasets, we'd need a dedicated API
      const scans = await db.getScans({ limit: 100 })
      const entries: PortHistoryEntry[] = []

      for (const scan of scans) {
        const reports = await db.getIpReportsByHost(scan.scan_id, hostIp)
        const banners = await db.getBannersForScan(scan.scan_id)
        for (const report of reports) {
          entries.push({
            scan_id: scan.scan_id,
            scan_time: scan.s_time,
            port: report.sport,  // sport = target's port (from response packet)
            protocol: report.proto === 6 ? 'tcp' : report.proto === 17 ? 'udp' : 'other',
            ttl: report.ttl,
            // For TCP: type contains TCP header flags; flags is for CRC errors
            flags: report.type,
            window_size: report.window_size,
            eth_hwaddr: report.eth_hwaddr,
            tstamp: report.tstamp,
            ipreport_id: report.ipreport_id,
            banner: banners.get(report.ipreport_id),
          })
        }
      }

      // Sort by scan time, then port
      return entries.sort((a, b) => {
        if (a.scan_time !== b.scan_time) return b.scan_time - a.scan_time
        return a.port - b.port
      })
    },
    enabled: !!hostIp,
    staleTime: 30000,
  })
}

// =============================================================================
// Aggregated Port History Hook
// =============================================================================

const MAX_HISTORY_ENTRIES = 10

/**
 * Aggregates port history by port+protocol, showing latest observation
 * with latest non-null banner (which may be from an older scan).
 * Limits history to 10 entries per port.
 */
export function useAggregatedPortHistory(hostIp: string) {
  return useQuery({
    queryKey: hostListKeys.aggregatedPorts(hostIp),
    queryFn: async (): Promise<AggregatedPortEntry[]> => {
      // Fetch all raw entries (reuse existing logic)
      const scans = await db.getScans({ limit: 100 })
      const entries: PortHistoryEntry[] = []

      for (const scan of scans) {
        const reports = await db.getIpReportsByHost(scan.scan_id, hostIp)
        const banners = await db.getBannersForScan(scan.scan_id)
        for (const report of reports) {
          entries.push({
            scan_id: scan.scan_id,
            scan_time: scan.s_time,
            port: report.sport,
            protocol: report.proto === 6 ? 'tcp' : report.proto === 17 ? 'udp' : 'other',
            ttl: report.ttl,
            flags: report.type,
            window_size: report.window_size,
            eth_hwaddr: report.eth_hwaddr,
            tstamp: report.tstamp,
            ipreport_id: report.ipreport_id,
            banner: banners.get(report.ipreport_id),
          })
        }
      }

      // Sort all entries by timestamp descending (most recent first)
      entries.sort((a, b) => b.tstamp - a.tstamp)

      // Group by port+protocol
      const groups = new Map<string, PortHistoryEntry[]>()
      for (const entry of entries) {
        const key = `${entry.port}-${entry.protocol}`
        const group = groups.get(key)
        if (group) {
          group.push(entry)
        } else {
          groups.set(key, [entry])
        }
      }

      // Build aggregated entries
      const aggregated: AggregatedPortEntry[] = []
      for (const [, groupEntries] of groups) {
        // Already sorted by timestamp desc, so first is latest
        const latest = groupEntries[0]

        // Find latest non-null banner
        let latestBanner: string | undefined
        let latestBannerScanId: number | undefined
        let latestBannerTimestamp: number | undefined
        for (const entry of groupEntries) {
          if (entry.banner) {
            latestBanner = entry.banner
            latestBannerScanId = entry.scan_id
            latestBannerTimestamp = entry.tstamp
            break // First one with banner is the most recent
          }
        }

        // Check if banner is from older scan
        const bannerFromOlderScan = !!(
          latestBanner &&
          latestBannerScanId !== latest.scan_id
        )

        aggregated.push({
          port: latest.port,
          protocol: latest.protocol,
          latest,
          latestBanner,
          latestBannerScanId,
          latestBannerTimestamp,
          bannerFromOlderScan,
          history: groupEntries.slice(0, MAX_HISTORY_ENTRIES),
        })
      }

      // Sort by port number
      return aggregated.sort((a, b) => a.port - b.port)
    },
    enabled: !!hostIp,
    staleTime: 30000,
  })
}

// =============================================================================
// Associated Scans Hook
// =============================================================================

export function useHostScans(hostIp: string) {
  return useQuery({
    queryKey: hostListKeys.hostScans(hostIp),
    queryFn: async (): Promise<HostScanEntry[]> => {
      // Optimized: Uses 2 queries instead of N+1
      // 1. Get all reports for this host (with scan_id)
      // 2. Get scan details for those scan IDs
      return db.getScansForHost(hostIp)
    },
    enabled: !!hostIp,
    staleTime: 30000,
  })
}

// =============================================================================
// Host Reports Hook (for export)
// =============================================================================

export function useHostReports(hostIp: string) {
  return useQuery({
    queryKey: hostListKeys.hostReports(hostIp),
    queryFn: async (): Promise<IpReport[]> => {
      // Optimized: Single query instead of N+1
      // Gets all reports for this host across all scans
      return db.getReportsForHost(hostIp)
    },
    enabled: !!hostIp,
    staleTime: 30000,
  })
}
