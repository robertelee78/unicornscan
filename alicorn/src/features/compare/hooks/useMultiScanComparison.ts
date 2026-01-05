/**
 * useMultiScanComparison - Hook for comparing 2-5+ scans
 *
 * Extends the 2-scan comparison to handle multiple scans by:
 * - Fetching all scan metadata and IP reports in parallel
 * - Computing presence/absence for each host and port across all scans
 * - Tracking first/last seen, change detection, and summary statistics
 *
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useQuery } from '@tanstack/react-query'
import { getDatabase } from '@/lib/database'
import type { Scan, IpReport } from '@/types/database'
import type {
  PortInfo,
  MultiScanComparisonResult,
  MultiScanHostDiff,
  MultiScanPortDiff,
  MultiScanPortPresence,
  MultiScanHostPresence,
  MultiScanSummary,
  PresenceStatus,
} from '../types'

const db = getDatabase()

// =============================================================================
// Query Keys
// =============================================================================

export const multiCompareKeys = {
  all: ['multi-compare'] as const,
  comparison: (scanIds: number[]) =>
    [...multiCompareKeys.all, 'comparison', scanIds.sort().join(',')] as const,
}

// =============================================================================
// Helper Functions
// =============================================================================

function getProtocolName(proto: number): string {
  switch (proto) {
    case 6: return 'tcp'
    case 17: return 'udp'
    default: return 'other'
  }
}

function reportToPortInfo(report: IpReport): PortInfo {
  return {
    port: report.sport,
    protocol: getProtocolName(report.proto),
    ttl: report.ttl,
    flags: report.subtype,
    sport: report.sport,
  }
}

function portKey(port: number, protocol: string): string {
  return `${port}:${protocol}`
}

/**
 * Group IP reports by host address
 */
function groupReportsByHost(reports: IpReport[]): Map<string, IpReport[]> {
  const map = new Map<string, IpReport[]>()
  for (const report of reports) {
    const key = report.host_addr
    if (!map.has(key)) {
      map.set(key, [])
    }
    map.get(key)!.push(report)
  }
  return map
}

/**
 * Compare ports for a single host across all scans
 */
function computePortDiffs(
  hostAddr: string,
  scans: Scan[],
  reportsByScan: Map<number, Map<string, IpReport[]>>
): MultiScanPortDiff[] {
  // Collect all unique ports for this host across all scans
  const allPorts = new Map<string, { port: number; protocol: string }>()

  for (const scan of scans) {
    const hostReportsMap = reportsByScan.get(scan.scan_id)
    const hostReports = hostReportsMap?.get(hostAddr) || []
    for (const report of hostReports) {
      const key = portKey(report.sport, getProtocolName(report.proto))
      if (!allPorts.has(key)) {
        allPorts.set(key, { port: report.sport, protocol: getProtocolName(report.proto) })
      }
    }
  }

  // Build port diffs
  const portDiffs: MultiScanPortDiff[] = []

  for (const [, { port, protocol }] of allPorts) {
    const presence: MultiScanPortPresence[] = []
    let firstSeenScanId = 0
    let lastSeenScanId = 0
    let presentCount = 0

    for (const scan of scans) {
      const hostReportsMap = reportsByScan.get(scan.scan_id)
      const hostReports = hostReportsMap?.get(hostAddr) || []
      const portReport = hostReports.find(
        (r) => r.sport === port && getProtocolName(r.proto) === protocol
      )

      const status: PresenceStatus = portReport ? 'present' : 'absent'

      presence.push({
        scanId: scan.scan_id,
        status,
        info: portReport ? reportToPortInfo(portReport) : undefined,
      })

      if (portReport) {
        presentCount++
        if (firstSeenScanId === 0) firstSeenScanId = scan.scan_id
        lastSeenScanId = scan.scan_id
      }
    }

    // Check for presence changes between consecutive scans
    let hasChanges = false
    for (let i = 1; i < presence.length; i++) {
      if (presence[i].status !== presence[i - 1].status) {
        hasChanges = true
        break
      }
    }

    // Check for TTL changes between consecutive scans where port was present
    let hasTtlChanges = false
    const ttlValues: number[] = []
    let lastTtl: number | null = null

    for (const p of presence) {
      if (p.status === 'present' && p.info) {
        ttlValues.push(p.info.ttl)
        if (lastTtl !== null && p.info.ttl !== lastTtl) {
          hasTtlChanges = true
        }
        lastTtl = p.info.ttl
      }
    }

    portDiffs.push({
      port,
      protocol,
      presence,
      firstSeenScanId,
      lastSeenScanId,
      presentCount,
      hasChanges,
      hasTtlChanges,
      ttlValues,
    })
  }

  // Sort by port number
  return portDiffs.sort((a, b) => a.port - b.port)
}

/**
 * Compare hosts across all scans
 */
function computeHostDiffs(
  scans: Scan[],
  reportsByScan: Map<number, Map<string, IpReport[]>>
): MultiScanHostDiff[] {
  // Collect all unique hosts across all scans
  const allHosts = new Set<string>()
  for (const [, hostReportsMap] of reportsByScan) {
    for (const hostAddr of hostReportsMap.keys()) {
      allHosts.add(hostAddr)
    }
  }

  // Build host diffs
  const hostDiffs: MultiScanHostDiff[] = []

  for (const hostAddr of allHosts) {
    const presence: MultiScanHostPresence[] = []
    let firstSeenScanId = 0
    let lastSeenScanId = 0
    let presentCount = 0

    for (const scan of scans) {
      const hostReportsMap = reportsByScan.get(scan.scan_id)
      const hostReports = hostReportsMap?.get(hostAddr) || []
      const status: PresenceStatus = hostReports.length > 0 ? 'present' : 'absent'

      presence.push({
        scanId: scan.scan_id,
        status,
        portCount: hostReports.length,
      })

      if (hostReports.length > 0) {
        presentCount++
        if (firstSeenScanId === 0) firstSeenScanId = scan.scan_id
        lastSeenScanId = scan.scan_id
      }
    }

    // Check for changes between consecutive scans
    let hasChanges = false
    for (let i = 1; i < presence.length; i++) {
      if (presence[i].status !== presence[i - 1].status) {
        hasChanges = true
        break
      }
    }

    // Compute port diffs for this host
    const portDiffs = computePortDiffs(hostAddr, scans, reportsByScan)

    hostDiffs.push({
      ipAddr: hostAddr,
      presence,
      firstSeenScanId,
      lastSeenScanId,
      presentCount,
      hasChanges,
      portDiffs,
    })
  }

  // Sort by IP address (numeric sort)
  return hostDiffs.sort((a, b) => {
    const aNum = a.ipAddr.split('.').reduce((acc, oct) => acc * 256 + parseInt(oct), 0)
    const bNum = b.ipAddr.split('.').reduce((acc, oct) => acc * 256 + parseInt(oct), 0)
    return aNum - bNum
  })
}

/**
 * Compute summary statistics for multi-scan comparison
 */
function computeSummary(
  scanCount: number,
  hostDiffs: MultiScanHostDiff[]
): MultiScanSummary {
  let hostsInAllScans = 0
  let hostsInSomeScans = 0
  let hostsInOneScan = 0
  let totalPorts = 0
  let portsInAllScans = 0
  let portsWithChanges = 0
  let portsWithTtlChanges = 0

  for (const host of hostDiffs) {
    if (host.presentCount === scanCount) {
      hostsInAllScans++
    } else if (host.presentCount === 1) {
      hostsInOneScan++
    } else {
      hostsInSomeScans++
    }

    for (const port of host.portDiffs) {
      totalPorts++
      if (port.presentCount === scanCount) {
        portsInAllScans++
      }
      if (port.hasChanges) {
        portsWithChanges++
      }
      if (port.hasTtlChanges) {
        portsWithTtlChanges++
      }
    }
  }

  return {
    scanCount,
    totalHosts: hostDiffs.length,
    hostsInAllScans,
    hostsInSomeScans,
    hostsInOneScan,
    totalPorts,
    portsInAllScans,
    portsWithChanges,
    portsWithTtlChanges,
  }
}

/**
 * Main comparison function for multiple scans
 */
async function compareMultipleScans(scanIds: number[]): Promise<MultiScanComparisonResult | null> {
  if (scanIds.length < 2) return null

  // Fetch all scan metadata in parallel
  const scanPromises = scanIds.map((id) => db.getScan(id))
  const scansRaw = await Promise.all(scanPromises)

  // Filter out nulls (invalid scan IDs)
  const scans = scansRaw.filter((s): s is Scan => s !== null)
  if (scans.length < 2) return null

  // Sort scans chronologically by start time
  scans.sort((a, b) => a.s_time - b.s_time)

  // Fetch all IP reports in parallel
  const reportsPromises = scans.map((s) => db.getIpReports(s.scan_id))
  const reportsArrays = await Promise.all(reportsPromises)

  // Build a map: scan_id -> (host_addr -> IpReport[])
  const reportsByScan = new Map<number, Map<string, IpReport[]>>()
  for (let i = 0; i < scans.length; i++) {
    const hostReportsMap = groupReportsByHost(reportsArrays[i])
    reportsByScan.set(scans[i].scan_id, hostReportsMap)
  }

  // Compute host diffs
  const hostDiffs = computeHostDiffs(scans, reportsByScan)

  // Compute summary
  const summary = computeSummary(scans.length, hostDiffs)

  return {
    scans,
    hostDiffs,
    summary,
  }
}

// =============================================================================
// Hook
// =============================================================================

export interface UseMultiScanComparisonResult {
  data: MultiScanComparisonResult | null | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
}

/**
 * Hook to compare 2-5+ scans
 *
 * Fetches all scan metadata and IP reports in parallel,
 * then computes diffs across all scans.
 *
 * @param scanIds - Array of scan IDs to compare (minimum 2)
 * @returns Comparison result with host diffs, port diffs, and summary
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useMultiScanComparison([1, 2, 3])
 *
 * if (isLoading) return <Loading />
 * if (error) return <Error error={error} />
 * if (!data) return <NoData />
 *
 * return <ComparisonView data={data} />
 * ```
 */
export function useMultiScanComparison(scanIds: number[]): UseMultiScanComparisonResult {
  const query = useQuery({
    queryKey: multiCompareKeys.comparison(scanIds),
    queryFn: () => compareMultipleScans(scanIds),
    enabled: scanIds.length >= 2,
    staleTime: 30000,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}
