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
          h.ip_addr.toLowerCase().includes(searchLower) ||
          (h.hostname?.toLowerCase().includes(searchLower) ?? false) ||
          (h.mac_addr?.toLowerCase().includes(searchLower) ?? false)
      )
    }

    // Apply hasOpenPorts filter
    if (filters.hasOpenPorts !== null) {
      filtered = filtered.filter((h) =>
        filters.hasOpenPorts ? h.open_port_count > 0 : h.open_port_count === 0
      )
    }

    const total = filtered.length

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: string | number | null
      let bVal: string | number | null

      switch (sort.field) {
        case 'ip_addr':
          // Sort IP addresses numerically
          aVal = a.ip_addr.split('.').reduce((acc, octet) => acc * 256 + parseInt(octet), 0)
          bVal = b.ip_addr.split('.').reduce((acc, octet) => acc * 256 + parseInt(octet), 0)
          break
        case 'hostname':
          aVal = a.hostname?.toLowerCase() ?? ''
          bVal = b.hostname?.toLowerCase() ?? ''
          break
        case 'open_port_count':
          aVal = a.open_port_count
          bVal = b.open_port_count
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
      // Get all scans and check which ones found this host
      const scans = await db.getScans({ limit: 100 })
      const entries: HostScanEntry[] = []

      for (const scan of scans) {
        const reports = await db.getIpReportsByHost(scan.scans_id, hostIp)
        if (reports.length > 0) {
          entries.push({
            scansId: scan.scans_id,
            scanTime: scan.s_time,
            profile: scan.profile,
            targetStr: scan.target_str,
            portsFound: reports.length,
          })
        }
      }

      // Sort by scan time descending
      return entries.sort((a, b) => b.scanTime - a.scanTime)
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
      // Get all scans and collect reports for this host
      const scans = await db.getScans({ limit: 100 })
      const allReports: IpReport[] = []

      for (const scan of scans) {
        const reports = await db.getIpReportsByHost(scan.scans_id, hostIp)
        allReports.push(...reports)
      }

      // Sort by scan ID (most recent first), then by port
      return allReports.sort((a, b) => {
        if (a.scans_id !== b.scans_id) return b.scans_id - a.scans_id
        return a.dport - b.dport
      })
    },
    enabled: !!hostIp,
    staleTime: 30000,
  })
}
