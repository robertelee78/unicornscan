/**
 * Scan comparison utility functions
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import type { Scan, IpReport } from '@/types/database'
import type {
  HostDiff,
  PortInfo,
  PortDiff,
  ScanComparisonResult,
  ComparisonSummary,
  DiffStatus,
} from './types'

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
    port: report.dport,
    protocol: getProtocolName(report.proto),
    ttl: report.ttl,
    flags: report.subtype,
    sport: report.sport,
  }
}

function portKey(port: number, protocol: string): string {
  return `${port}:${protocol}`
}

// =============================================================================
// Port Comparison
// =============================================================================

function comparePort(infoA: PortInfo | undefined, infoB: PortInfo | undefined): DiffStatus {
  if (!infoA && infoB) return 'added'
  if (infoA && !infoB) return 'removed'
  if (!infoA || !infoB) return 'unchanged'

  // Check if properties changed (TTL or flags)
  if (infoA.ttl !== infoB.ttl || infoA.flags !== infoB.flags) {
    return 'changed'
  }

  return 'unchanged'
}

function comparePorts(portsA: PortInfo[], portsB: PortInfo[]): PortDiff[] {
  const mapA = new Map<string, PortInfo>()
  const mapB = new Map<string, PortInfo>()

  for (const p of portsA) {
    mapA.set(portKey(p.port, p.protocol), p)
  }
  for (const p of portsB) {
    mapB.set(portKey(p.port, p.protocol), p)
  }

  const allKeys = new Set([...mapA.keys(), ...mapB.keys()])
  const diffs: PortDiff[] = []

  for (const key of allKeys) {
    const infoA = mapA.get(key)
    const infoB = mapB.get(key)
    const [portStr, protocol] = key.split(':')
    const port = parseInt(portStr, 10)

    diffs.push({
      port,
      protocol,
      status: comparePort(infoA, infoB),
      infoA,
      infoB,
    })
  }

  // Sort by port number
  return diffs.sort((a, b) => a.port - b.port)
}

// =============================================================================
// Host Comparison
// =============================================================================

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

function compareHosts(
  ipAddr: string,
  reportsA: IpReport[],
  reportsB: IpReport[]
): HostDiff {
  const portsA = reportsA.map(reportToPortInfo)
  const portsB = reportsB.map(reportToPortInfo)
  const portDiffs = comparePorts(portsA, portsB)

  // Determine overall host status
  const hasAdded = portDiffs.some(d => d.status === 'added')
  const hasRemoved = portDiffs.some(d => d.status === 'removed')
  const hasChanged = portDiffs.some(d => d.status === 'changed')

  let status: DiffStatus = 'unchanged'
  if (reportsA.length === 0 && reportsB.length > 0) {
    status = 'added'
  } else if (reportsA.length > 0 && reportsB.length === 0) {
    status = 'removed'
  } else if (hasAdded || hasRemoved || hasChanged) {
    status = 'changed'
  }

  return {
    ipAddr,
    status,
    portsA,
    portsB,
    portDiffs,
  }
}

// =============================================================================
// Summary Calculation
// =============================================================================

function calculateSummary(
  hostDiffs: HostDiff[],
  reportsA: IpReport[],
  reportsB: IpReport[]
): ComparisonSummary {
  const hostsA = new Set(reportsA.map(r => r.host_addr))
  const hostsB = new Set(reportsB.map(r => r.host_addr))

  let hostsAdded = 0
  let hostsRemoved = 0
  let hostsChanged = 0
  let hostsUnchanged = 0
  let portsOpened = 0
  let portsClosed = 0
  let portsModified = 0

  for (const diff of hostDiffs) {
    switch (diff.status) {
      case 'added':
        hostsAdded++
        portsOpened += diff.portsB.length
        break
      case 'removed':
        hostsRemoved++
        portsClosed += diff.portsA.length
        break
      case 'changed':
        hostsChanged++
        for (const pd of diff.portDiffs) {
          if (pd.status === 'added') portsOpened++
          else if (pd.status === 'removed') portsClosed++
          else if (pd.status === 'changed') portsModified++
        }
        break
      case 'unchanged':
        hostsUnchanged++
        break
    }
  }

  return {
    totalHostsA: hostsA.size,
    totalHostsB: hostsB.size,
    hostsAdded,
    hostsRemoved,
    hostsChanged,
    hostsUnchanged,
    totalPortsA: reportsA.length,
    totalPortsB: reportsB.length,
    portsOpened,
    portsClosed,
    portsModified,
  }
}

// =============================================================================
// Main Comparison Function
// =============================================================================

export function compareScans(
  scanA: Scan,
  scanB: Scan,
  reportsA: IpReport[],
  reportsB: IpReport[]
): ScanComparisonResult {
  const hostMapA = groupReportsByHost(reportsA)
  const hostMapB = groupReportsByHost(reportsB)

  // Get all unique host IPs
  const allHosts = new Set([...hostMapA.keys(), ...hostMapB.keys()])

  // Compare each host
  const hostDiffs: HostDiff[] = []
  for (const ipAddr of allHosts) {
    const hostReportsA = hostMapA.get(ipAddr) || []
    const hostReportsB = hostMapB.get(ipAddr) || []
    hostDiffs.push(compareHosts(ipAddr, hostReportsA, hostReportsB))
  }

  // Sort by IP address (numeric sort)
  hostDiffs.sort((a, b) => {
    const aNum = a.ipAddr.split('.').reduce((acc, oct) => acc * 256 + parseInt(oct), 0)
    const bNum = b.ipAddr.split('.').reduce((acc, oct) => acc * 256 + parseInt(oct), 0)
    return aNum - bNum
  })

  // Calculate summary
  const summary = calculateSummary(hostDiffs, reportsA, reportsB)

  return {
    scanA,
    scanB,
    hostDiffs,
    summary,
  }
}

// =============================================================================
// URL Helpers
// =============================================================================

export function parseCompareUrl(searchParams: URLSearchParams): { scanA?: number; scanB?: number } {
  const aStr = searchParams.get('a')
  const bStr = searchParams.get('b')

  return {
    scanA: aStr ? parseInt(aStr, 10) : undefined,
    scanB: bStr ? parseInt(bStr, 10) : undefined,
  }
}

export function buildCompareUrl(scanAId: number, scanBId: number): string {
  return `/compare?a=${scanAId}&b=${scanBId}`
}
