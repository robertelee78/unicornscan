/**
 * Host tracking timeline types
 * Enhanced timeline with change events, filtering, and bookmarking
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// =============================================================================
// Port Observation Types
// =============================================================================

/**
 * Individual observation of a port in a specific scan
 */
export interface PortObservation {
  /** Scan ID where observed */
  scan_id: number
  /** Scan timestamp */
  timestamp: number
  /** Port number */
  port: number
  /** Protocol */
  protocol: 'tcp' | 'udp' | 'other'
  /** TTL value observed */
  ttl: number
  /** TCP flags or response subtype */
  flags: number
  /** TCP window size (TCP only) */
  windowSize?: number
}

/**
 * Change types for port state transitions
 */
export type ChangeType =
  | 'appeared'     // Port first seen
  | 'disappeared'  // Port no longer responding
  | 'reappeared'   // Port responding again after gap
  | 'ttl_changed'  // TTL value changed (possible routing/OS change)
  | 'flags_changed' // Response flags changed
  | 'window_changed' // TCP window size changed

/**
 * Severity levels for changes
 */
export type ChangeSeverity = 'info' | 'minor' | 'notable' | 'significant'

/**
 * A state change event for a port
 */
export interface PortStateChange {
  /** Change type */
  type: ChangeType
  /** Timestamp of change */
  timestamp: number
  /** Scan ID where change detected */
  scan_id: number
  /** Port number */
  port: number
  /** Protocol */
  protocol: 'tcp' | 'udp' | 'other'
  /** Previous observation (null for 'appeared') */
  previous: PortObservation | null
  /** Current observation (null for 'disappeared') */
  current: PortObservation | null
  /** Severity of this change */
  severity: ChangeSeverity
  /** Human-readable description */
  description: string
}

// =============================================================================
// Port Tracking Types
// =============================================================================

/**
 * Complete tracking record for a single port
 */
export interface PortTrack {
  /** Port number */
  port: number
  /** Protocol */
  protocol: 'tcp' | 'udp' | 'other'
  /** Unique key for this port/protocol combo */
  key: string
  /** All observations of this port */
  observations: PortObservation[]
  /** All detected changes */
  changes: PortStateChange[]
  /** First seen timestamp */
  firstSeen: number
  /** Last seen timestamp */
  lastSeen: number
  /** Is currently active (seen in most recent scan) */
  isActive: boolean
  /** Total observation count */
  observationCount: number
  /** Count of gaps (periods not seen) */
  gapCount: number
}

// =============================================================================
// Timeline Data Types
// =============================================================================

/**
 * Scan point on the timeline
 */
export interface TimelineScanPoint {
  scan_id: number
  timestamp: number
  date: string
  portCount: number
  hasChanges: boolean
  changeCount: number
}

/**
 * Complete host timeline data
 */
export interface HostTimelineData {
  /** Host IP address */
  hostIp: string
  /** All port tracking records */
  tracks: PortTrack[]
  /** All change events (sorted by time) */
  allChanges: PortStateChange[]
  /** Timeline scan points */
  scanPoints: TimelineScanPoint[]
  /** Time range covered */
  timeRange: {
    start: number
    end: number
  }
  /** Summary statistics */
  summary: TimelineSummary
}

/**
 * Summary statistics for the timeline
 */
export interface TimelineSummary {
  /** Total unique ports tracked */
  totalPorts: number
  /** Total change events */
  totalChanges: number
  /** Ports currently active */
  activePorts: number
  /** Ports that disappeared */
  inactivePorts: number
  /** Scans analyzed */
  scanCount: number
  /** Count by change type */
  changesByType: Record<ChangeType, number>
  /** Ports with significant changes */
  portsWithSignificantChanges: number
}

// =============================================================================
// Filter Types
// =============================================================================

/**
 * Timeline filter state
 */
export interface TimelineFilter {
  /** Filter by protocols */
  protocols: ('tcp' | 'udp' | 'other')[]
  /** Filter by change types */
  changeTypes: ChangeType[]
  /** Filter by severity levels */
  severities: ChangeSeverity[]
  /** Filter by port numbers or ranges */
  portFilter: string
  /** Show only ports with changes */
  changesOnly: boolean
  /** Show only active ports */
  activeOnly: boolean
}

/**
 * Default filter state
 */
export const DEFAULT_FILTER: TimelineFilter = {
  protocols: ['tcp', 'udp', 'other'],
  changeTypes: ['appeared', 'disappeared', 'reappeared', 'ttl_changed', 'flags_changed', 'window_changed'],
  severities: ['info', 'minor', 'notable', 'significant'],
  portFilter: '',
  changesOnly: false,
  activeOnly: false,
}

// =============================================================================
// View State Types
// =============================================================================

/**
 * Timeline view/zoom state
 */
export interface TimelineViewState {
  /** Start of visible range (timestamp) */
  viewStart: number | null
  /** End of visible range (timestamp) */
  viewEnd: number | null
  /** Zoom level (1 = full range, 2 = half, etc.) */
  zoomLevel: number
  /** Currently selected port key */
  selectedPort: string | null
  /** Currently selected event index */
  selectedEvent: number | null
}

/**
 * Default view state
 */
export const DEFAULT_VIEW_STATE: TimelineViewState = {
  viewStart: null,
  viewEnd: null,
  zoomLevel: 1,
  selectedPort: null,
  selectedEvent: null,
}

// =============================================================================
// URL State Types
// =============================================================================

/**
 * State that can be persisted in URL params
 */
export interface TimelineUrlState {
  /** View start (as ISO date or timestamp) */
  from?: string
  /** View end (as ISO date or timestamp) */
  to?: string
  /** Zoom level */
  zoom?: number
  /** Selected port key */
  port?: string
  /** Comma-separated protocols filter */
  protocols?: string
  /** Changes only toggle */
  changes?: '1' | '0'
}

// =============================================================================
// Export Types
// =============================================================================

/**
 * Timeline export format
 */
export type TimelineExportFormat = 'json' | 'csv' | 'png' | 'svg'

/**
 * Timeline export options
 */
export interface TimelineExportOptions {
  format: TimelineExportFormat
  /** Include all data or only visible range */
  visibleOnly: boolean
  /** Include change events */
  includeChanges: boolean
  /** Include raw observations */
  includeObservations: boolean
  /** For image export: width in pixels */
  imageWidth?: number
}

// =============================================================================
// Display Helpers
// =============================================================================

/**
 * Get display color for change type
 */
export function getChangeTypeColor(type: ChangeType): string {
  switch (type) {
    case 'appeared':
      return '#22c55e' // green
    case 'disappeared':
      return '#ef4444' // red
    case 'reappeared':
      return '#3b82f6' // blue
    case 'ttl_changed':
      return '#f59e0b' // amber
    case 'flags_changed':
      return '#8b5cf6' // purple
    case 'window_changed':
      return '#06b6d4' // cyan
  }
}

/**
 * Get display label for change type
 */
export function getChangeTypeLabel(type: ChangeType): string {
  switch (type) {
    case 'appeared':
      return 'Appeared'
    case 'disappeared':
      return 'Disappeared'
    case 'reappeared':
      return 'Reappeared'
    case 'ttl_changed':
      return 'TTL Changed'
    case 'flags_changed':
      return 'Flags Changed'
    case 'window_changed':
      return 'Window Changed'
  }
}

/**
 * Get icon for change type (lucide icon name)
 */
export function getChangeTypeIcon(type: ChangeType): string {
  switch (type) {
    case 'appeared':
      return 'plus-circle'
    case 'disappeared':
      return 'minus-circle'
    case 'reappeared':
      return 'refresh-cw'
    case 'ttl_changed':
      return 'route'
    case 'flags_changed':
      return 'flag'
    case 'window_changed':
      return 'maximize-2'
  }
}

/**
 * Get severity badge variant
 */
export function getSeverityVariant(severity: ChangeSeverity): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (severity) {
    case 'info':
      return 'secondary'
    case 'minor':
      return 'outline'
    case 'notable':
      return 'default'
    case 'significant':
      return 'destructive'
  }
}
