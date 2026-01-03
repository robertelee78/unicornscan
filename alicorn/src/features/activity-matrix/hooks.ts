/**
 * Host Activity Matrix hooks
 * React Query hooks for matrix data fetching and processing
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useQuery } from '@tanstack/react-query'
import { useState, useCallback, useMemo } from 'react'
import { getDatabase } from '@/lib/database'
import { IP_PROTOCOLS } from '@/types/database'
import type { Scan, IpReport } from '@/types/database'
import { getTimeRangeSeconds } from '@/features/dashboard/types'
import type {
  MatrixFilters,
  MatrixCell,
  HostRowData,
  ScanColumnData,
  ActivityMatrixData,
  MatrixSummary,
  PortKey,
  CellStatus,
  DiffDialogData,
} from './types'
import { DEFAULT_MATRIX_FILTERS, makePortKey } from './types'

const db = getDatabase()

// =============================================================================
// Query Keys
// =============================================================================

export const activityMatrixKeys = {
  all: ['activity-matrix'] as const,
  matrix: (filters: MatrixFilters) =>
    [...activityMatrixKeys.all, 'matrix', JSON.stringify(filters)] as const,
  hostPorts: (scan_id: number, hostIp: string) =>
    [...activityMatrixKeys.all, 'host-ports', scan_id, hostIp] as const,
  scansForMatrix: (timeRange: string) =>
    [...activityMatrixKeys.all, 'scans', timeRange] as const,
}

// =============================================================================
// Filter State Hook
// =============================================================================

/**
 * Hook for managing matrix filter state
 */
export function useMatrixFilters(initialFilters?: Partial<MatrixFilters>) {
  const [filters, setFilters] = useState<MatrixFilters>({
    ...DEFAULT_MATRIX_FILTERS,
    ...initialFilters,
  })

  const updateFilter = useCallback(<K extends keyof MatrixFilters>(
    key: K,
    value: MatrixFilters[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_MATRIX_FILTERS)
  }, [])

  return {
    filters,
    setFilters,
    updateFilter,
    resetFilters,
  }
}

// =============================================================================
// Scans Query Hook
// =============================================================================

/**
 * Fetch scans for the matrix within time range
 */
export function useMatrixScans(timeRange: string) {
  return useQuery({
    queryKey: activityMatrixKeys.scansForMatrix(timeRange),
    queryFn: async (): Promise<Scan[]> => {
      const allScans = await db.getScans({ limit: 500 })

      // Filter by time range
      const seconds = getTimeRangeSeconds(timeRange as '1h' | '24h' | '7d' | '30d' | '90d' | 'all')
      if (seconds === null) {
        return allScans.sort((a, b) => a.s_time - b.s_time)
      }

      const cutoff = Math.floor(Date.now() / 1000) - seconds
      return allScans
        .filter((s) => s.s_time >= cutoff)
        .sort((a, b) => a.s_time - b.s_time)
    },
    staleTime: 60000,
  })
}

// =============================================================================
// Activity Matrix Hook
// =============================================================================

/**
 * Main hook for fetching and computing the activity matrix
 */
export function useActivityMatrix(filters: MatrixFilters) {
  return useQuery({
    queryKey: activityMatrixKeys.matrix(filters),
    queryFn: async (): Promise<ActivityMatrixData> => {
      // Step 1: Get scans in time range
      const scans = await getFilteredScans(filters.timeRange)
      if (scans.length === 0) {
        return createEmptyMatrix(filters)
      }

      // Step 2: Determine baseline scan
      const baselineScansId = getBaselineScansId(scans, filters)

      // Step 3: Get all unique hosts across all scans
      const hostPortsBySccan = new Map<number, Map<string, Set<PortKey>>>()

      for (const scan of scans) {
        const reports = await db.getIpReports(scan.scan_id)
        const hostPorts = processReports(reports, filters)
        hostPortsBySccan.set(scan.scan_id, hostPorts)
      }

      // Step 4: Collect all unique hosts
      const allHosts = new Set<string>()
      for (const hostPorts of hostPortsBySccan.values()) {
        for (const hostIp of hostPorts.keys()) {
          // Apply subnet filter
          if (filters.subnet && !matchesSubnet(hostIp, filters.subnet)) {
            continue
          }
          allHosts.add(hostIp)
        }
      }

      // Step 5: Build matrix rows and columns
      const rows = new Map<string, HostRowData>()
      const columns = new Map<number, ScanColumnData>()

      // Initialize columns
      for (const scan of scans) {
        columns.set(scan.scan_id, {
          scan,
          isBaseline: scan.scan_id === baselineScansId,
          changedHostCount: 0,
        })
      }

      // Build summary stats
      const summary: MatrixSummary = {
        totalHosts: allHosts.size,
        hostsWithChanges: 0,
        totalScans: scans.length,
        scansWithChanges: 0,
        cellsWithNewPorts: 0,
        cellsWithRemovedPorts: 0,
        cellsWithMixedChanges: 0,
        allUniquePorts: new Set<PortKey>(),
      }

      // Build rows
      for (const hostIp of allHosts) {
        const cells = new Map<number, MatrixCell>()
        let changedScanCount = 0
        const allHostPorts = new Set<PortKey>()
        let hasVisibleCells = false

        // Get baseline ports for this host
        const baselinePorts = baselineScansId
          ? hostPortsBySccan.get(baselineScansId)?.get(hostIp) || new Set<PortKey>()
          : new Set<PortKey>()

        for (const scan of scans) {
          const scanHostPorts = hostPortsBySccan.get(scan.scan_id)
          const currentPorts = scanHostPorts?.get(hostIp) || new Set<PortKey>()

          // Add to all host ports
          for (const port of currentPorts) {
            allHostPorts.add(port)
            summary.allUniquePorts.add(port)
          }

          // Calculate diff
          const isBaseline = scan.scan_id === baselineScansId
          const { newPorts, removedPorts, status } = calculateDiff(
            currentPorts,
            isBaseline ? null : baselinePorts,
            isBaseline
          )

          const cell: MatrixCell = {
            hostIp,
            scan_id: scan.scan_id,
            timestamp: scan.s_time,
            currentPorts,
            baselinePorts: isBaseline ? null : baselinePorts,
            newPorts,
            removedPorts,
            status,
            isBaseline,
          }

          cells.set(scan.scan_id, cell)

          // Update counts
          if (status === 'new' || status === 'removed' || status === 'mixed') {
            changedScanCount++

            if (status === 'new') summary.cellsWithNewPorts++
            else if (status === 'removed') summary.cellsWithRemovedPorts++
            else if (status === 'mixed') summary.cellsWithMixedChanges++
          }

          // Check visibility for view mode
          if (filters.viewMode === 'diff-only') {
            if (status !== 'unchanged' && status !== 'empty') {
              hasVisibleCells = true
            }
          } else {
            hasVisibleCells = true
          }
        }

        if (changedScanCount > 0) {
          summary.hostsWithChanges++
        }

        rows.set(hostIp, {
          hostIp,
          cells,
          changedScanCount,
          totalUniquePorts: allHostPorts.size,
          isVisible: hasVisibleCells,
        })
      }

      // Calculate scans with changes
      for (const scan of scans) {
        let hasChanges = false
        for (const row of rows.values()) {
          const cell = row.cells.get(scan.scan_id)
          if (cell && (cell.status === 'new' || cell.status === 'removed' || cell.status === 'mixed')) {
            hasChanges = true
            const col = columns.get(scan.scan_id)
            if (col) col.changedHostCount++
          }
        }
        if (hasChanges) {
          summary.scansWithChanges++
        }
      }

      // Determine visible hosts based on view mode
      const hostOrder = [...allHosts]
        .filter((hostIp) => {
          const row = rows.get(hostIp)
          return row?.isVisible ?? false
        })
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

      const scanOrder = scans.map((s) => s.scan_id)

      return {
        rows,
        columns,
        hostOrder,
        scanOrder,
        filters,
        summary,
      }
    },
    staleTime: 60000,
  })
}

// =============================================================================
// Diff Dialog Hook
// =============================================================================

/**
 * Get detailed diff data for a specific cell
 */
export function useCellDiff(
  hostIp: string | null,
  scan_id: number | null,
  baselineScansId: number | null
) {
  return useQuery({
    queryKey: activityMatrixKeys.hostPorts(scan_id ?? 0, hostIp ?? ''),
    queryFn: async (): Promise<DiffDialogData | null> => {
      if (!hostIp || !scan_id) return null

      // Get current scan
      const scans = await db.getScans({ limit: 500 })
      const currentScan = scans.find((s) => s.scan_id === scan_id)
      if (!currentScan) return null

      // Get baseline scan if specified
      const baselineScan = baselineScansId
        ? scans.find((s) => s.scan_id === baselineScansId)
        : null

      // Get ports for current scan
      const currentReports = await db.getIpReportsByHost(scan_id, hostIp)
      const currentPorts = new Set<PortKey>()
      for (const report of currentReports) {
        currentPorts.add(makePortKey(report.sport, report.proto))
      }

      // Get ports for baseline scan
      const baselinePorts = new Set<PortKey>()
      if (baselineScansId) {
        const baselineReports = await db.getIpReportsByHost(baselineScansId, hostIp)
        for (const report of baselineReports) {
          baselinePorts.add(makePortKey(report.sport, report.proto))
        }
      }

      // Calculate diff
      const newPorts: PortKey[] = []
      const removedPorts: PortKey[] = []
      const unchangedPorts: PortKey[] = []

      for (const port of currentPorts) {
        if (baselinePorts.has(port)) {
          unchangedPorts.push(port)
        } else {
          newPorts.push(port)
        }
      }

      for (const port of baselinePorts) {
        if (!currentPorts.has(port)) {
          removedPorts.push(port)
        }
      }

      // Determine status
      let status: CellStatus
      if (!baselineScansId) {
        status = 'first'
      } else if (newPorts.length > 0 && removedPorts.length > 0) {
        status = 'mixed'
      } else if (newPorts.length > 0) {
        status = 'new'
      } else if (removedPorts.length > 0) {
        status = 'removed'
      } else if (currentPorts.size === 0 && baselinePorts.size === 0) {
        status = 'empty'
      } else {
        status = 'unchanged'
      }

      // Sort ports for display
      const sortPorts = (ports: PortKey[]) =>
        ports.sort((a, b) => {
          const [portA] = a.split('/')
          const [portB] = b.split('/')
          return parseInt(portA, 10) - parseInt(portB, 10)
        })

      return {
        hostIp,
        currentScan,
        baselineScan: baselineScan ?? null,
        currentPorts: sortPorts([...currentPorts]),
        baselinePorts: sortPorts([...baselinePorts]),
        newPorts: sortPorts(newPorts),
        removedPorts: sortPorts(removedPorts),
        unchangedPorts: sortPorts(unchangedPorts),
        status,
      }
    },
    enabled: !!hostIp && !!scan_id,
    staleTime: 60000,
  })
}

// =============================================================================
// Helper Functions
// =============================================================================

async function getFilteredScans(timeRange: string): Promise<Scan[]> {
  const allScans = await db.getScans({ limit: 500 })
  const seconds = getTimeRangeSeconds(timeRange as '1h' | '24h' | '7d' | '30d' | '90d' | 'all')

  if (seconds === null) {
    return allScans.sort((a, b) => a.s_time - b.s_time)
  }

  const cutoff = Math.floor(Date.now() / 1000) - seconds
  return allScans
    .filter((s) => s.s_time >= cutoff)
    .sort((a, b) => a.s_time - b.s_time)
}

function getBaselineScansId(scans: Scan[], filters: MatrixFilters): number | null {
  if (scans.length === 0) return null

  switch (filters.baselineMode) {
    case 'first':
      return scans[0].scan_id
    case 'specific':
      return filters.baselineScansId
    case 'previous':
    default:
      // In 'previous' mode, baseline is calculated per-cell dynamically
      // For the matrix view, we use the first scan as a reference point
      return scans[0].scan_id
  }
}

function processReports(
  reports: IpReport[],
  filters: MatrixFilters
): Map<string, Set<PortKey>> {
  const hostPorts = new Map<string, Set<PortKey>>()

  for (const report of reports) {
    // Apply protocol filter
    const protocol = report.proto === IP_PROTOCOLS.TCP
      ? 'tcp'
      : report.proto === IP_PROTOCOLS.UDP
        ? 'udp'
        : null

    if (!protocol || !filters.protocols.includes(protocol)) {
      continue
    }

    // Apply port range filter
    if (filters.portRange) {
      if (report.sport < filters.portRange.min || report.sport > filters.portRange.max) {
        continue
      }
    }

    // Add to host's port set
    const portKey = makePortKey(report.sport, report.proto)
    if (!hostPorts.has(report.host_addr)) {
      hostPorts.set(report.host_addr, new Set())
    }
    hostPorts.get(report.host_addr)!.add(portKey)
  }

  return hostPorts
}

function matchesSubnet(ip: string, subnet: string): boolean {
  // Parse CIDR notation (e.g., "192.168.1.0/24")
  const [network, maskBits] = subnet.split('/')
  if (!maskBits) {
    // No mask, check for prefix match
    return ip.startsWith(network)
  }

  const mask = parseInt(maskBits, 10)
  if (isNaN(mask) || mask < 0 || mask > 32) {
    return ip.startsWith(network.replace(/\.0+$/, ''))
  }

  // Convert IPs to numeric for proper comparison
  const ipNum = ipToNumber(ip)
  const networkNum = ipToNumber(network)
  const maskNum = (0xffffffff << (32 - mask)) >>> 0

  return (ipNum & maskNum) === (networkNum & maskNum)
}

function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return 0
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

function calculateDiff(
  currentPorts: Set<PortKey>,
  baselinePorts: Set<PortKey> | null,
  isBaseline: boolean
): { newPorts: PortKey[]; removedPorts: PortKey[]; status: CellStatus } {
  if (isBaseline) {
    return {
      newPorts: [],
      removedPorts: [],
      status: currentPorts.size > 0 ? 'first' : 'empty',
    }
  }

  if (!baselinePorts) {
    return {
      newPorts: [...currentPorts],
      removedPorts: [],
      status: currentPorts.size > 0 ? 'new' : 'empty',
    }
  }

  const newPorts = [...currentPorts].filter((p) => !baselinePorts.has(p))
  const removedPorts = [...baselinePorts].filter((p) => !currentPorts.has(p))

  let status: CellStatus
  if (currentPorts.size === 0 && baselinePorts.size === 0) {
    status = 'empty'
  } else if (newPorts.length > 0 && removedPorts.length > 0) {
    status = 'mixed'
  } else if (newPorts.length > 0) {
    status = 'new'
  } else if (removedPorts.length > 0) {
    status = 'removed'
  } else {
    status = 'unchanged'
  }

  return { newPorts, removedPorts, status }
}

function createEmptyMatrix(filters: MatrixFilters): ActivityMatrixData {
  return {
    rows: new Map(),
    columns: new Map(),
    hostOrder: [],
    scanOrder: [],
    filters,
    summary: {
      totalHosts: 0,
      hostsWithChanges: 0,
      totalScans: 0,
      scansWithChanges: 0,
      cellsWithNewPorts: 0,
      cellsWithRemovedPorts: 0,
      cellsWithMixedChanges: 0,
      allUniquePorts: new Set(),
    },
  }
}

// =============================================================================
// Baseline Scan Selector Hook
// =============================================================================

/**
 * Hook for selecting baseline scan from available scans
 */
export function useBaselineScanOptions(timeRange: string) {
  const { data: scans, isLoading } = useMatrixScans(timeRange)

  const options = useMemo(() => {
    if (!scans) return []
    return scans.map((scan) => ({
      value: scan.scan_id,
      label: `${new Date(scan.s_time * 1000).toLocaleString()} - ${scan.target_str}`,
      scan,
    }))
  }, [scans])

  return { options, isLoading }
}
