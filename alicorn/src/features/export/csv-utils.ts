/**
 * CSV export utilities
 * Functions for converting scan/host data to CSV format
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
  ScanCSVRow,
  ReportCSVRow,
  HostCSVRow,
} from './types'

// =============================================================================
// Field Configuration by Depth
// =============================================================================

const SCAN_FIELDS: Record<MetadataDepth, (keyof ScanCSVRow)[]> = {
  basic: ['scan_id', 'start_time', 'target', 'host_count', 'port_count'],
  standard: ['scan_id', 'start_time', 'end_time', 'duration_seconds', 'profile', 'target', 'port_range', 'mode', 'host_count', 'port_count'],
  full: ['scan_id', 'start_time', 'end_time', 'duration_seconds', 'profile', 'user', 'target', 'port_range', 'mode', 'pps', 'host_count', 'port_count', 'notes'],
}

const REPORT_FIELDS: Record<MetadataDepth, (keyof ReportCSVRow)[]> = {
  basic: ['scan_id', 'host_ip', 'port', 'protocol'],
  standard: ['scan_id', 'report_id', 'host_ip', 'port', 'protocol', 'ttl', 'flags_decoded', 'timestamp', 'service'],
  full: ['scan_id', 'report_id', 'host_ip', 'port', 'protocol', 'ttl', 'flags', 'flags_decoded', 'timestamp', 'window_size', 'service'],
}

const HOST_FIELDS: Record<MetadataDepth, (keyof HostCSVRow)[]> = {
  basic: ['host_id', 'ip_addr', 'open_port_count'],
  standard: ['host_id', 'ip_addr', 'hostname', 'first_seen', 'last_seen', 'scan_count', 'open_port_count'],
  full: ['host_id', 'ip_addr', 'hostname', 'mac_addr', 'os_guess', 'first_seen', 'last_seen', 'scan_count', 'open_port_count'],
}

// =============================================================================
// CSV Formatting
// =============================================================================

/**
 * Escape a field for CSV (handle commas, quotes, newlines)
 */
export function escapeCSVField(field: string | number | null | undefined): string {
  const str = String(field ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Convert array of objects to CSV string
 */
export function objectsToCSV<T>(
  objects: T[],
  fields: (keyof T)[]
): string {
  if (objects.length === 0) {
    return (fields as string[]).join(',') + '\n'
  }

  const headerLine = (fields as string[]).join(',')
  const dataLines = objects.map((obj) =>
    fields.map((field) => escapeCSVField(obj[field] as string | number)).join(',')
  )

  return [headerLine, ...dataLines].join('\n')
}

// =============================================================================
// Data Transformation
// =============================================================================

/**
 * Convert Scan to CSV row
 */
export function scanToCSVRow(scan: Scan, hostCount: number, portCount: number): ScanCSVRow {
  return {
    scan_id: scan.scans_id,
    start_time: new Date(scan.s_time * 1000).toISOString(),
    end_time: new Date(scan.e_time * 1000).toISOString(),
    duration_seconds: scan.e_time - scan.s_time,
    profile: scan.profile,
    user: scan.user,
    target: scan.target_str ?? '',
    port_range: scan.port_str ?? '',
    mode: scan.mode_str ?? '',
    pps: scan.pps ?? 0,
    host_count: hostCount,
    port_count: portCount,
    notes: scan.scan_notes ?? '',
  }
}

/**
 * Convert IpReport to CSV row
 */
export function reportToCSVRow(report: IpReport, service?: string): ReportCSVRow {
  return {
    scan_id: report.scans_id,
    report_id: report.ipreport_id,
    host_ip: report.host_addr,
    port: report.dport,
    protocol: getProtocolName(report.proto),
    ttl: report.ttl,
    flags: report.flags,
    flags_decoded: decodeTcpFlags(report.flags).join(','),
    timestamp: new Date(report.tstamp * 1000).toISOString(),
    window_size: report.window_size,
    service,
  }
}

/**
 * Convert Host to CSV row
 */
export function hostToCSVRow(host: Host): HostCSVRow {
  return {
    host_id: host.host_id,
    ip_addr: host.ip_addr ?? host.host_addr,
    hostname: host.hostname ?? '',
    mac_addr: host.mac_addr ?? '',
    os_guess: host.os_guess ?? '',
    first_seen: new Date(parseTimestamp(host.first_seen) * 1000).toISOString(),
    last_seen: new Date(parseTimestamp(host.last_seen) * 1000).toISOString(),
    scan_count: host.scan_count,
    port_count: host.port_count ?? 0,
  }
}

// =============================================================================
// Export Functions
// =============================================================================

/**
 * Export single scan data to CSV
 */
export function exportScanToCSV(
  data: ScanExportData,
  depth: MetadataDepth
): string {
  const sections: string[] = []

  // Scan metadata section
  const hostCount = new Set(data.reports.map((r) => r.host_addr)).size
  const portCount = new Set(data.reports.map((r) => `${r.dport}/${r.proto}`)).size
  const scanRow = scanToCSVRow(data.scan, hostCount, portCount)

  sections.push('# Scan Metadata')
  sections.push(objectsToCSV([scanRow], SCAN_FIELDS[depth]))
  sections.push('')

  // Reports section
  sections.push('# Port Reports')
  const reportRows = data.reports.map((r) => reportToCSVRow(r))
  sections.push(objectsToCSV(reportRows, REPORT_FIELDS[depth]))

  return sections.join('\n')
}

/**
 * Export single host data to CSV
 */
export function exportHostToCSV(
  data: HostExportData,
  depth: MetadataDepth
): string {
  const sections: string[] = []

  // Host metadata section
  const hostRow = hostToCSVRow(data.host)

  sections.push('# Host Metadata')
  sections.push(objectsToCSV([hostRow], HOST_FIELDS[depth]))
  sections.push('')

  // Reports section
  sections.push('# Port History')
  const reportRows = data.reports.map((r) => reportToCSVRow(r))
  sections.push(objectsToCSV(reportRows, REPORT_FIELDS[depth]))

  return sections.join('\n')
}

/**
 * Export multiple scans to CSV (bulk export)
 */
export function exportBulkScansToCSV(
  data: BulkExportData,
  depth: MetadataDepth
): string {
  const sections: string[] = []

  // Export header
  sections.push(`# Bulk Scan Export`)
  sections.push(`# Generated: ${new Date(data.timestamp).toISOString()}`)
  sections.push(`# Scans: ${data.scans.length}`)
  sections.push('')

  // Aggregate scan list
  sections.push('# Scan Summary')
  const scanRows = data.scans.map((s) => {
    const hostCount = new Set(s.reports.map((r) => r.host_addr)).size
    const portCount = new Set(s.reports.map((r) => `${r.dport}/${r.proto}`)).size
    return scanToCSVRow(s.scan, hostCount, portCount)
  })
  sections.push(objectsToCSV(scanRows, SCAN_FIELDS[depth]))
  sections.push('')

  // Aggregate all reports
  sections.push('# All Port Reports')
  const allReports: ReportCSVRow[] = []
  for (const scanData of data.scans) {
    allReports.push(...scanData.reports.map((r) => reportToCSVRow(r)))
  }
  sections.push(objectsToCSV(allReports, REPORT_FIELDS[depth]))

  return sections.join('\n')
}

/**
 * Export hosts list to CSV
 */
export function exportHostsListToCSV(
  hosts: Host[],
  depth: MetadataDepth
): string {
  const hostRows = hosts.map(hostToCSVRow)
  return objectsToCSV(hostRows, HOST_FIELDS[depth])
}

/**
 * Export scans list to CSV
 */
export function exportScansListToCSV(
  scans: Array<Scan & { host_count: number; port_count: number }>,
  depth: MetadataDepth
): string {
  const scanRows = scans.map((s) => scanToCSVRow(s, s.host_count, s.port_count))
  return objectsToCSV(scanRows, SCAN_FIELDS[depth])
}
