/**
 * Host Activity Matrix types
 * Types for the host vs scan matrix visualization
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import type { Scan } from '@/types/database'

// =============================================================================
// View Modes
// =============================================================================

/**
 * Matrix view mode options
 * - side-by-side: Show both baseline and current scans side by side
 * - diff-only: Show only cells that have changes
 * - composite: Show superset of all ports across selected scans
 */
export type ViewMode = 'side-by-side' | 'diff-only' | 'composite'

export const VIEW_MODE_OPTIONS: { value: ViewMode; label: string; description: string }[] = [
  {
    value: 'side-by-side',
    label: 'Side by Side',
    description: 'Compare baseline and current scans in adjacent columns',
  },
  {
    value: 'diff-only',
    label: 'Changes Only',
    description: 'Show only hosts and scans with port changes',
  },
  {
    value: 'composite',
    label: 'Composite',
    description: 'Superset view showing all ports ever observed',
  },
]

// =============================================================================
// Port Identity
// =============================================================================

/**
 * Unique identifier for a port (port number + protocol)
 * Format: "port/protocol" e.g., "80/tcp", "53/udp"
 */
export type PortKey = string

/**
 * Create a PortKey from port and protocol
 */
export function makePortKey(port: number, protocol: number | 'tcp' | 'udp'): PortKey {
  const proto = typeof protocol === 'number'
    ? (protocol === 6 ? 'tcp' : protocol === 17 ? 'udp' : `proto-${protocol}`)
    : protocol
  return `${port}/${proto}`
}

/**
 * Parse a PortKey into port and protocol
 */
export function parsePortKey(key: PortKey): { port: number; protocol: string } {
  const [portStr, protocol] = key.split('/')
  return { port: parseInt(portStr, 10), protocol }
}

// =============================================================================
// Cell Status
// =============================================================================

/**
 * Status of a matrix cell indicating port changes relative to baseline
 */
export type CellStatus =
  | 'new'       // Ports appeared that weren't in baseline (green)
  | 'removed'   // Ports disappeared that were in baseline (red)
  | 'mixed'     // Both new and removed ports (amber)
  | 'unchanged' // Same ports as baseline (gray)
  | 'first'     // This is the baseline scan (blue outline)
  | 'empty'     // No ports observed in either scan

/**
 * Get CSS color class for a cell status
 */
export function getCellStatusColor(status: CellStatus): string {
  switch (status) {
    case 'new':
      return 'bg-green-500'
    case 'removed':
      return 'bg-red-500'
    case 'mixed':
      return 'bg-amber-500'
    case 'unchanged':
      return 'bg-gray-400'
    case 'first':
      return 'bg-blue-500'
    case 'empty':
      return 'bg-muted'
  }
}

/**
 * Get human-readable label for a cell status
 */
export function getCellStatusLabel(status: CellStatus): string {
  switch (status) {
    case 'new':
      return 'New ports detected'
    case 'removed':
      return 'Ports no longer responding'
    case 'mixed':
      return 'Some ports added, some removed'
    case 'unchanged':
      return 'No changes from baseline'
    case 'first':
      return 'Baseline scan (reference)'
    case 'empty':
      return 'No ports observed'
  }
}

// =============================================================================
// Matrix Cell Data
// =============================================================================

/**
 * Data for a single cell in the activity matrix
 */
export interface MatrixCell {
  /** Host IP address */
  hostIp: string
  /** Scan ID */
  scan_id: number
  /** Scan timestamp */
  timestamp: number
  /** Ports observed in this scan for this host */
  currentPorts: Set<PortKey>
  /** Ports in the baseline scan for this host (null if this is baseline) */
  baselinePorts: Set<PortKey> | null
  /** Ports that are new compared to baseline */
  newPorts: PortKey[]
  /** Ports that were removed compared to baseline */
  removedPorts: PortKey[]
  /** Cell status */
  status: CellStatus
  /** Is this the baseline scan? */
  isBaseline: boolean
}

/**
 * Serializable version of MatrixCell for caching/export
 */
export interface MatrixCellSerialized {
  hostIp: string
  scan_id: number
  timestamp: number
  currentPorts: PortKey[]
  baselinePorts: PortKey[] | null
  newPorts: PortKey[]
  removedPorts: PortKey[]
  status: CellStatus
  isBaseline: boolean
}

// =============================================================================
// Matrix Filters
// =============================================================================

/**
 * Baseline selection mode
 */
export type BaselineMode =
  | 'previous' // Compare each scan to the scan immediately before it
  | 'first'    // Compare all scans to the first scan in range
  | 'specific' // Compare to a user-selected scan

/**
 * Filter options for the activity matrix
 */
export interface MatrixFilters {
  /** Time range for scans to include */
  timeRange: 'all' | '1h' | '24h' | '7d' | '30d' | '90d'
  /** Baseline selection mode */
  baselineMode: BaselineMode
  /** Specific baseline scan ID (when baselineMode is 'specific') */
  baselineScansId: number | null
  /** Subnet filter (CIDR notation, e.g., "192.168.1.0/24") */
  subnet: string | null
  /** Port range filter */
  portRange: { min: number; max: number } | null
  /** Protocol filter */
  protocols: ('tcp' | 'udp')[]
  /** View mode */
  viewMode: ViewMode
}

/**
 * Default filter values
 */
export const DEFAULT_MATRIX_FILTERS: MatrixFilters = {
  timeRange: 'all',
  baselineMode: 'previous',
  baselineScansId: null,
  subnet: null,
  portRange: null,
  protocols: ['tcp', 'udp'],
  viewMode: 'side-by-side',
}

// =============================================================================
// Matrix Row/Column Data
// =============================================================================

/**
 * Data for a single host (row) in the matrix
 */
export interface HostRowData {
  /** Host IP address */
  hostIp: string
  /** Cells for each scan column */
  cells: Map<number, MatrixCell>
  /** Total number of scans with changes */
  changedScanCount: number
  /** Total unique ports observed across all scans */
  totalUniquePorts: number
  /** Is this host visible in current view mode? */
  isVisible: boolean
}

/**
 * Data for a single scan (column) in the matrix
 */
export interface ScanColumnData {
  /** Scan record */
  scan: Scan
  /** Is this the baseline scan? */
  isBaseline: boolean
  /** Number of hosts with changes in this scan */
  changedHostCount: number
}

// =============================================================================
// Full Matrix Data
// =============================================================================

/**
 * Complete activity matrix data structure
 */
export interface ActivityMatrixData {
  /** Rows indexed by host IP */
  rows: Map<string, HostRowData>
  /** Columns indexed by scan ID */
  columns: Map<number, ScanColumnData>
  /** Ordered list of host IPs (for rendering) */
  hostOrder: string[]
  /** Ordered list of scan IDs (for rendering, by timestamp) */
  scanOrder: number[]
  /** Applied filters */
  filters: MatrixFilters
  /** Summary statistics */
  summary: MatrixSummary
}

/**
 * Matrix summary statistics
 */
export interface MatrixSummary {
  /** Total number of hosts */
  totalHosts: number
  /** Number of hosts with changes */
  hostsWithChanges: number
  /** Total number of scans */
  totalScans: number
  /** Number of scans with changes */
  scansWithChanges: number
  /** Total cells with new ports */
  cellsWithNewPorts: number
  /** Total cells with removed ports */
  cellsWithRemovedPorts: number
  /** Total cells with mixed changes */
  cellsWithMixedChanges: number
  /** All unique ports across all cells */
  allUniquePorts: Set<PortKey>
}

// =============================================================================
// Diff Dialog Data
// =============================================================================

/**
 * Detailed diff data for the dialog
 */
export interface DiffDialogData {
  /** Host IP address */
  hostIp: string
  /** Current scan */
  currentScan: Scan
  /** Baseline scan (null if this is the first observation) */
  baselineScan: Scan | null
  /** Ports in current scan */
  currentPorts: PortKey[]
  /** Ports in baseline scan */
  baselinePorts: PortKey[]
  /** New ports (in current but not baseline) */
  newPorts: PortKey[]
  /** Removed ports (in baseline but not current) */
  removedPorts: PortKey[]
  /** Unchanged ports (in both) */
  unchangedPorts: PortKey[]
  /** Cell status */
  status: CellStatus
}

// =============================================================================
// Export Types
// =============================================================================

/**
 * CSV export row format
 */
export interface MatrixExportRow {
  host_ip: string
  scan_id: number
  scan_time: string
  status: CellStatus
  current_ports: string
  baseline_ports: string
  new_ports: string
  removed_ports: string
}
