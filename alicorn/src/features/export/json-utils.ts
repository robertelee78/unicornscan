/**
 * JSON export utilities
 * Functions for converting scan/host data to structured JSON
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import type { Scan, IpReport, Host } from '@/types/database'
import { decodeTcpFlags, getProtocolName } from '@/types/database'
import { parseTimestamp } from '@/lib/utils'
import type {
  ScanExportData,
  HostExportData,
  BulkExportData,
  MetadataDepth,
} from './types'

// =============================================================================
// Types for JSON Output
// =============================================================================

interface JSONExportMetadata {
  exportVersion: string
  generatedAt: string
  generator: string
  metadataDepth: MetadataDepth
  filters?: Record<string, unknown>
}

interface ScanJSONBasic {
  id: number
  startTime: string
  target: string
  hostCount: number
  portCount: number
}

interface ScanJSONStandard extends ScanJSONBasic {
  endTime: string
  durationSeconds: number
  profile: string
  mode: string
  portRange: string
}

interface ScanJSONFull extends ScanJSONStandard {
  user: string
  pps: number
  senders: number
  listeners: number
  dronestr: string
  covertness: number
  modules: string
  options: number
  payloadGroup: number
  notes: string | null
  metadata: Record<string, unknown> | null
}

interface ReportJSONBasic {
  hostIp: string
  port: number
  protocol: string
}

interface ReportJSONStandard extends ReportJSONBasic {
  id: number
  scan_id: number
  ttl: number
  flags: string[]
  timestamp: string
  service?: string
}

interface ReportJSONFull extends ReportJSONStandard {
  rawFlags: number
  windowSize: number
  sport: number
  sendAddr: string
  traceAddr: string
  type: number
  subtype: number
  magic: number
  mseq: number
  tseq: number
  tTstamp: number
  mTstamp: number
  extraData: Record<string, unknown> | null
}

interface HostJSONBasic {
  id: number
  ipAddr: string
  portCount: number
}

interface HostJSONStandard extends HostJSONBasic {
  hostname: string | null
  firstSeen: string
  lastSeen: string
  scanCount: number
}

interface HostJSONFull extends HostJSONStandard {
  macAddr: string | null
  osGuess: string | null
  metadata: Record<string, unknown> | null
}

// =============================================================================
// Data Transformation
// =============================================================================

function scanToJSON(scan: Scan, hostCount: number, portCount: number, depth: MetadataDepth): ScanJSONBasic | ScanJSONStandard | ScanJSONFull {
  const basic: ScanJSONBasic = {
    id: scan.scan_id,
    startTime: new Date(scan.s_time * 1000).toISOString(),
    target: scan.target_str ?? '',
    hostCount,
    portCount,
  }

  if (depth === 'basic') return basic

  const standard: ScanJSONStandard = {
    ...basic,
    endTime: new Date(scan.e_time * 1000).toISOString(),
    durationSeconds: scan.e_time - scan.s_time,
    profile: scan.profile,
    mode: scan.mode_str ?? '',
    portRange: scan.port_str ?? '',
  }

  if (depth === 'standard') return standard

  return {
    ...standard,
    user: scan.user,
    pps: scan.pps ?? 0,
    senders: scan.senders,
    listeners: scan.listeners,
    dronestr: scan.dronestr,
    covertness: scan.covertness,
    modules: scan.modules,
    options: scan.options,
    payloadGroup: scan.payload_group,
    notes: scan.scan_notes,
    metadata: scan.scan_metadata,
  }
}

function reportToJSON(report: IpReport, depth: MetadataDepth, service?: string): ReportJSONBasic | ReportJSONStandard | ReportJSONFull {
  const basic: ReportJSONBasic = {
    hostIp: report.host_addr,
    port: report.dport,
    protocol: getProtocolName(report.proto),
  }

  if (depth === 'basic') return basic

  const standard: ReportJSONStandard = {
    ...basic,
    id: report.ipreport_id,
    scan_id: report.scan_id,
    ttl: report.ttl,
    flags: decodeTcpFlags(report.type),  // TCP flags are in type field
    timestamp: new Date(report.tstamp * 1000).toISOString(),
    service,
  }

  if (depth === 'standard') return standard

  return {
    ...standard,
    rawFlags: report.type,  // TCP flags are in type field
    windowSize: report.window_size,
    sport: report.sport,
    sendAddr: report.send_addr,
    traceAddr: report.trace_addr,
    type: report.type,
    subtype: report.subtype,
    magic: report.magic,
    mseq: report.mseq,
    tseq: report.tseq,
    tTstamp: report.t_tstamp,
    mTstamp: report.m_tstamp,
    extraData: report.extra_data,
  }
}

function hostToJSON(host: Host, depth: MetadataDepth): HostJSONBasic | HostJSONStandard | HostJSONFull {
  const basic: HostJSONBasic = {
    id: host.host_id,
    ipAddr: host.ip_addr ?? host.host_addr,
    portCount: host.port_count ?? 0,
  }

  if (depth === 'basic') return basic

  const standard: HostJSONStandard = {
    ...basic,
    hostname: host.hostname,
    firstSeen: new Date(parseTimestamp(host.first_seen) * 1000).toISOString(),
    lastSeen: new Date(parseTimestamp(host.last_seen) * 1000).toISOString(),
    scanCount: host.scan_count,
  }

  if (depth === 'standard') return standard

  return {
    ...standard,
    macAddr: host.mac_addr,
    osGuess: host.os_guess ?? null,
    metadata: host.extra_data,
  }
}

// =============================================================================
// Export Functions
// =============================================================================

/**
 * Export single scan to JSON
 */
export function exportScanToJSON(
  data: ScanExportData,
  depth: MetadataDepth
): string {
  const hostCount = new Set(data.reports.map((r) => r.host_addr)).size
  const portCount = new Set(data.reports.map((r) => `${r.dport}/${r.proto}`)).size

  const output = {
    _metadata: createMetadata(depth),
    scan: scanToJSON(data.scan, hostCount, portCount, depth),
    reports: data.reports.map((r) => reportToJSON(r, depth)),
    // Group reports by host for convenience
    hostSummary: groupReportsByHost(data.reports, depth),
  }

  return JSON.stringify(output, null, 2)
}

/**
 * Export single host to JSON
 */
export function exportHostToJSON(
  data: HostExportData,
  depth: MetadataDepth
): string {
  const output = {
    _metadata: createMetadata(depth),
    host: hostToJSON(data.host, depth),
    reports: data.reports.map((r) => reportToJSON(r, depth)),
    scanHistory: data.scanHistory,
  }

  return JSON.stringify(output, null, 2)
}

/**
 * Export multiple scans to JSON (bulk)
 */
export function exportBulkScansToJSON(
  data: BulkExportData,
  depth: MetadataDepth
): string {
  const output = {
    _metadata: {
      ...createMetadata(depth),
      filters: data.filters,
    },
    scans: data.scans.map((scanData) => {
      const hostCount = new Set(scanData.reports.map((r) => r.host_addr)).size
      const portCount = new Set(scanData.reports.map((r) => `${r.dport}/${r.proto}`)).size

      return {
        scan: scanToJSON(scanData.scan, hostCount, portCount, depth),
        reports: scanData.reports.map((r) => reportToJSON(r, depth)),
      }
    }),
    summary: createBulkSummary(data),
  }

  return JSON.stringify(output, null, 2)
}

/**
 * Export hosts list to JSON
 */
export function exportHostsListToJSON(
  hosts: Host[],
  depth: MetadataDepth
): string {
  const getPortCount = (h: Host) => h.port_count ?? 0
  const output = {
    _metadata: createMetadata(depth),
    hosts: hosts.map((h) => hostToJSON(h, depth)),
    summary: {
      totalHosts: hosts.length,
      hostsWithResponses: hosts.filter((h) => getPortCount(h) > 0).length,
      totalRespondingPorts: hosts.reduce((sum, h) => sum + getPortCount(h), 0),
    },
  }

  return JSON.stringify(output, null, 2)
}

/**
 * Export scans list to JSON
 */
export function exportScansListToJSON(
  scans: Array<Scan & { host_count: number; port_count: number }>,
  depth: MetadataDepth
): string {
  const output = {
    _metadata: createMetadata(depth),
    scans: scans.map((s) => scanToJSON(s, s.host_count, s.port_count, depth)),
    summary: {
      totalScans: scans.length,
      totalHosts: scans.reduce((sum, s) => sum + s.host_count, 0),
      totalPorts: scans.reduce((sum, s) => sum + s.port_count, 0),
      dateRange: scans.length > 0 ? {
        earliest: new Date(Math.min(...scans.map((s) => s.s_time)) * 1000).toISOString(),
        latest: new Date(Math.max(...scans.map((s) => s.s_time)) * 1000).toISOString(),
      } : null,
    },
  }

  return JSON.stringify(output, null, 2)
}

// =============================================================================
// Helper Functions
// =============================================================================

function createMetadata(depth: MetadataDepth): JSONExportMetadata {
  return {
    exportVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    generator: 'Alicorn/unicornscan',
    metadataDepth: depth,
  }
}

function groupReportsByHost(
  reports: IpReport[],
  depth: MetadataDepth
): Record<string, Array<ReportJSONBasic | ReportJSONStandard | ReportJSONFull>> {
  const grouped: Record<string, Array<ReportJSONBasic | ReportJSONStandard | ReportJSONFull>> = {}

  for (const report of reports) {
    if (!grouped[report.host_addr]) {
      grouped[report.host_addr] = []
    }
    grouped[report.host_addr].push(reportToJSON(report, depth))
  }

  return grouped
}

function createBulkSummary(data: BulkExportData): Record<string, unknown> {
  const allReports = data.scans.flatMap((s) => s.reports)
  const allHosts = new Set(allReports.map((r) => r.host_addr))
  const allPorts = new Set(allReports.map((r) => `${r.dport}/${r.proto}`))

  // Count ports by frequency
  const portCounts: Record<string, number> = {}
  for (const report of allReports) {
    const key = `${report.dport}/${getProtocolName(report.proto)}`
    portCounts[key] = (portCounts[key] || 0) + 1
  }

  const topPorts = Object.entries(portCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([port, count]) => ({ port, count }))

  return {
    totalScans: data.scans.length,
    totalHosts: allHosts.size,
    uniquePorts: allPorts.size,
    totalResponses: allReports.length,
    topPorts,
  }
}
