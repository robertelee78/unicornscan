/**
 * Export feature types
 * Defines export formats, options, and metadata depth configurations
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import type { Scan, IpReport, ArpReport, Host, GeoIPRecord, Service } from '@/types/database'

// =============================================================================
// Export Formats
// =============================================================================

export type ExportFormat = 'csv' | 'json' | 'pdf'

export interface ExportFormatOption {
  id: ExportFormat
  label: string
  description: string
  icon: string
  supportsCharts: boolean
}

export const EXPORT_FORMATS: ExportFormatOption[] = [
  {
    id: 'csv',
    label: 'CSV',
    description: 'Comma-separated values for spreadsheets',
    icon: 'table',
    supportsCharts: false,
  },
  {
    id: 'json',
    label: 'JSON',
    description: 'Structured data for programmatic use',
    icon: 'braces',
    supportsCharts: false,
  },
  {
    id: 'pdf',
    label: 'PDF',
    description: 'Formatted report with tables and charts',
    icon: 'file-text',
    supportsCharts: true,
  },
]

// =============================================================================
// Metadata Depth
// =============================================================================

export type MetadataDepth = 'basic' | 'standard' | 'full'

export interface MetadataDepthOption {
  id: MetadataDepth
  label: string
  description: string
  fields: string[]
}

export const METADATA_DEPTHS: MetadataDepthOption[] = [
  {
    id: 'basic',
    label: 'Basic',
    description: 'Essential fields only (ID, IP, port)',
    fields: ['id', 'ip', 'port', 'protocol', 'timestamp'],
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Common fields plus state info',
    fields: ['id', 'ip', 'port', 'protocol', 'timestamp', 'ttl', 'flags', 'service', 'state'],
  },
  {
    id: 'full',
    label: 'Full',
    description: 'All available metadata including raw packet data',
    fields: ['*'], // All fields
  },
]

// =============================================================================
// Export File Options (MuseScore-style)
// =============================================================================

export type FileOutputMode = 'individual' | 'combined'

export interface FileOutputOption {
  id: FileOutputMode
  label: string
  description: string
}

export const FILE_OUTPUT_OPTIONS: FileOutputOption[] = [
  {
    id: 'combined',
    label: 'Combined File',
    description: 'All selected items in a single file',
  },
  {
    id: 'individual',
    label: 'Individual Files',
    description: 'Separate file for each selected item (ZIP archive)',
  },
]

// =============================================================================
// Content Selection
// =============================================================================

export type ContentType = 'scan' | 'host' | 'ports' | 'summary' | 'geoip' | 'services'

export interface ContentOption {
  id: ContentType
  label: string
  description: string
  available: boolean
}

// =============================================================================
// Export Context Types
// =============================================================================

export type ExportContext = 'scan-detail' | 'scan-list' | 'host-detail' | 'host-list' | 'compare'

// =============================================================================
// Export Options (Complete Configuration)
// =============================================================================

export interface ExportOptions {
  format: ExportFormat
  metadataDepth: MetadataDepth
  fileOutput: FileOutputMode

  // Content selection
  includeScanMetadata: boolean
  includeReports: boolean
  includeHosts: boolean
  includeGeoIP: boolean
  includeServices: boolean
  includeArp: boolean

  // PDF-specific options
  includeCharts: boolean
  includeSummaryStats: boolean
  pageOrientation: 'portrait' | 'landscape'

  // Filters applied (for metadata in export)
  appliedFilters?: Record<string, unknown>
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: 'csv',
  metadataDepth: 'standard',
  fileOutput: 'combined',

  includeScanMetadata: true,
  includeReports: true,
  includeHosts: true,
  includeGeoIP: false,
  includeServices: true,
  includeArp: false,

  includeCharts: true,
  includeSummaryStats: true,
  pageOrientation: 'landscape',
}

// =============================================================================
// Export Data Structures
// =============================================================================

export interface ScanExportData {
  scan: Scan
  reports: IpReport[]
  arpReports?: ArpReport[]
  hosts?: Host[]
  geoip?: GeoIPRecord[]
  services?: Service[]
}

export interface HostExportData {
  host: Host
  reports: IpReport[]
  scanHistory: { scansId: number; scanTime: number; portsFound: number }[]
  geoip?: GeoIPRecord[]
  services?: Service[]
}

export interface BulkExportData {
  scans: ScanExportData[]
  timestamp: number
  filters?: Record<string, unknown>
}

// =============================================================================
// Export Result
// =============================================================================

export interface ExportResult {
  success: boolean
  filename: string
  blob?: Blob
  error?: string
}

// =============================================================================
// Selection State (for bulk export)
// =============================================================================

export type SelectionMode = 'none' | 'selected' | 'filtered' | 'all'

export interface SelectionState {
  mode: SelectionMode
  selectedIds: Set<number>
}

export const DEFAULT_SELECTION: SelectionState = {
  mode: 'none',
  selectedIds: new Set(),
}

// =============================================================================
// CSV Row Types
// =============================================================================

export interface ScanCSVRow {
  scan_id: number
  start_time: string
  end_time: string
  duration_seconds: number
  profile: string
  user: string
  target: string
  port_range: string
  mode: string
  pps: number
  host_count: number
  port_count: number
  notes: string
}

export interface ReportCSVRow {
  scan_id: number
  report_id: number
  host_ip: string
  port: number
  protocol: string
  ttl: number
  flags: number
  flags_decoded: string
  timestamp: string
  window_size: number
  service?: string
}

export interface HostCSVRow {
  host_id: number
  ip_addr: string
  hostname: string
  mac_addr: string
  os_guess: string
  first_seen: string
  last_seen: string
  scan_count: number
  open_port_count: number
}

// =============================================================================
// PDF Report Types
// =============================================================================

export interface PDFReportSection {
  id: string
  title: string
  type: 'table' | 'chart' | 'text' | 'summary'
  data: unknown
}

export interface PDFChartConfig {
  type: 'bar' | 'pie' | 'line'
  title: string
  width: number
  height: number
  data: { label: string; value: number; color?: string }[]
}

export interface PDFSummaryStats {
  totalHosts: number
  totalPorts: number
  uniquePorts: number
  topPorts: { port: number; count: number }[]
  protocolDistribution: { protocol: string; count: number }[]
  osDistribution: { os: string; count: number }[]
}
