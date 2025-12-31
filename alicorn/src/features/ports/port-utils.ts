/**
 * Port table utilities and constants
 * Separated from component file to allow Fast Refresh
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import type { IpReport } from '@/types/database'

// =============================================================================
// Types
// =============================================================================

export type PortTableColumn =
  | 'host'
  | 'port'
  | 'protocol'
  | 'response'    // What came back (SYN+ACK, RST, ICMP unreachable, etc.)
  | 'flags'       // Raw TCP flags (for detailed analysis)
  | 'ttl'
  | 'window'
  | 'service'     // Service name (if fingerprinted)
  | 'banner'      // Banner/payload preview
  | 'timestamp'

export type SortDirection = 'asc' | 'desc' | null

export interface PortTableSort {
  column: PortTableColumn | null
  direction: SortDirection
}

export interface PortTableRow {
  id: string | number
  hostAddr?: string
  port: number
  protocol: number  // IP protocol number (6=TCP, 17=UDP, 1=ICMP)
  /** TCP flags (subtype field) or ICMP type for classification */
  responseFlags: number
  /** ICMP code (if protocol is ICMP) */
  icmpCode?: number
  ttl?: number
  windowSize?: number
  timestamp?: number
  // Service info (from -msf mode or fingerprint module)
  serviceName?: string
  serviceVersion?: string
  banner?: string
  // Raw payload data (from -msf or -mU mode)
  payloadData?: Uint8Array
}

// =============================================================================
// Column Configuration
// =============================================================================

export interface ColumnConfig {
  key: PortTableColumn
  label: string
  sortable: boolean
  width?: string
  align?: 'left' | 'center' | 'right'
}

export const COLUMN_CONFIG: Record<PortTableColumn, ColumnConfig> = {
  host: { key: 'host', label: 'Host', sortable: true, align: 'left' },
  port: { key: 'port', label: 'Port', sortable: true, align: 'left' },
  protocol: { key: 'protocol', label: 'Proto', sortable: true, align: 'left', width: '70px' },
  response: { key: 'response', label: 'Response', sortable: true, align: 'left' },
  flags: { key: 'flags', label: 'Flags', sortable: true, align: 'left' },
  ttl: { key: 'ttl', label: 'TTL', sortable: true, align: 'right', width: '60px' },
  window: { key: 'window', label: 'Window', sortable: true, align: 'right', width: '80px' },
  service: { key: 'service', label: 'Service', sortable: true, align: 'left' },
  banner: { key: 'banner', label: 'Banner', sortable: false, align: 'left' },
  timestamp: { key: 'timestamp', label: 'Time', sortable: true, align: 'left' },
}

// Default columns for typical scan results view
export const DEFAULT_COLUMNS: PortTableColumn[] = [
  'port', 'protocol', 'response', 'ttl', 'window', 'service', 'timestamp'
]

// Columns for detailed analysis (all TCP data)
export const DETAILED_COLUMNS: PortTableColumn[] = [
  'host', 'port', 'protocol', 'response', 'flags', 'ttl', 'window', 'service', 'banner', 'timestamp'
]

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert IpReport to PortTableRow
 */
export function ipReportToPortTableRow(report: IpReport): PortTableRow {
  return {
    id: report.ipreport_id,
    hostAddr: report.host_addr,
    port: report.dport,
    protocol: report.proto,
    responseFlags: report.subtype,  // TCP flags or ICMP type stored in subtype
    ttl: report.ttl,
    windowSize: report.window_size,
    timestamp: report.tstamp,
  }
}

/**
 * Convert array of IpReports to PortTableRows
 */
export function ipReportsToPortTableRows(reports: IpReport[]): PortTableRow[] {
  return reports.map(ipReportToPortTableRow)
}

/**
 * Get color class for TTL value (OS fingerprinting hint)
 * Common defaults: Linux=64, Windows=128, Cisco=255
 */
export function getTtlColorClass(ttl: number): string {
  if (ttl <= 32) return 'text-red-400'      // Very low TTL - many hops or unusual
  if (ttl <= 64) return 'text-amber-400'    // Linux/Unix nearby
  if (ttl <= 128) return 'text-blue-400'    // Windows nearby
  return 'text-green-400'                    // Router/high TTL
}
