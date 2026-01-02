/**
 * Hosts feature hooks with filtering and host detail data
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getDatabase } from '@/lib/database'
import type { Host, IpReport } from '@/types/database'
import type { HostFilters, SortState, PaginationState, PortHistoryEntry, HostScanEntry } from './types'

const db = getDatabase()

// =============================================================================
// Query Keys
// =============================================================================

export const hostListKeys = {
  all: ['hostList'] as const,
  filtered: (filters: HostFilters, sort: SortState, pagination: PaginationState) =>
    [...hostListKeys.all, 'filtered', filters, sort, pagination] as const,
  portHistory: (hostIp: string) => [...hostListKeys.all, 'portHistory', hostIp] as const,
  hostScans: (hostIp: string) => [...hostListKeys.all, 'hostScans', hostIp] as const,
  hostReports: (hostIp: string) => [...hostListKeys.all, 'hostReports', hostIp] as const,
}

// =============================================================================
// List Hook
// =============================================================================

interface UseHostListResult {
  data: Host[]
  total: number
  isLoading: boolean
  error: Error | null
}

export function useHostList(
  filters: HostFilters,
  sort: SortState,
  pagination: PaginationState
): UseHostListResult {
  const { data, isLoading, error } = useQuery({
    queryKey: hostListKeys.filtered(filters, sort, pagination),
    queryFn: async () => {
      // Get all hosts (we'll filter client-side until we add server-side filtering)
      const hosts = await db.getHosts({ limit: 1000 })
      return hosts
    },
    staleTime: 30000,
  })

  // Apply filters, sort, and pagination client-side
  const result = useMemo(() => {
    let filtered = [...(data || [])]

    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter(
        (h) =>
          (h.ip_addr ?? h.host_addr).toLowerCase().includes(searchLower) ||
          (h.hostname?.toLowerCase().includes(searchLower) ?? false) ||
          (h.mac_addr?.toLowerCase().includes(searchLower) ?? false)
      )
    }

    // Apply hasOpenPorts filter (actually "responding ports" - got a packet back)
    if (filters.hasOpenPorts !== null) {
      const getPortCount = (h: Host) => h.port_count ?? 0
      filtered = filtered.filter((h) =>
        filters.hasOpenPorts ? getPortCount(h) > 0 : getPortCount(h) === 0
      )
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
  }, [data, filters, sort, pagination])

  return {
    data: result.data,
    total: result.total,
    isLoading,
    error: error as Error | null,
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
        const reports = await db.getIpReportsByHost(scan.scans_id, hostIp)
        for (const report of reports) {
          entries.push({
            scansId: scan.scans_id,
            scanTime: scan.s_time,
            port: report.dport,
            protocol: report.proto === 6 ? 'tcp' : report.proto === 17 ? 'udp' : 'other',
            ttl: report.ttl,
            flags: report.subtype,
          })
        }
      }

      // Sort by scan time, then port
      return entries.sort((a, b) => {
        if (a.scanTime !== b.scanTime) return b.scanTime - a.scanTime
        return a.port - b.port
      })
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
      // 1. Get all reports for this host (with scans_id)
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
