/**
 * Scan comparison types
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import type { Scan } from '@/types/database'

// =============================================================================
// Port Info Type (shared)
// =============================================================================

export interface PortInfo {
  /** Port number */
  port: number
  /** Protocol: 'tcp' | 'udp' | 'other' */
  protocol: string
  /** TTL value */
  ttl: number
  /** Response flags/subtype */
  flags: number
  /** Sport for the report */
  sport?: number
}

// =============================================================================
// Multi-Scan Comparison Types (2-5+ scans)
// =============================================================================

/**
 * Presence status for a host or port across multiple scans
 */
export type PresenceStatus = 'present' | 'absent'

/**
 * Port presence info for a single scan
 */
export interface MultiScanPortPresence {
  /** Scan ID */
  scanId: number
  /** Whether port was found in this scan */
  status: PresenceStatus
  /** Port info if present */
  info?: PortInfo
}

/**
 * Port info aggregated across multiple scans
 */
export interface MultiScanPortDiff {
  /** Port number */
  port: number
  /** Protocol (tcp, udp, other) */
  protocol: string
  /** Presence in each scan (ordered chronologically) */
  presence: MultiScanPortPresence[]
  /** First scan ID where port was seen */
  firstSeenScanId: number
  /** Last scan ID where port was seen */
  lastSeenScanId: number
  /** Number of scans where port is present */
  presentCount: number
  /** True if port status changed between any consecutive scans */
  hasChanges: boolean
}

/**
 * Host presence info for a single scan
 */
export interface MultiScanHostPresence {
  /** Scan ID */
  scanId: number
  /** Whether host was found in this scan */
  status: PresenceStatus
  /** Number of ports found for this host in this scan */
  portCount: number
}

/**
 * Host info aggregated across multiple scans
 */
export interface MultiScanHostDiff {
  /** IP address */
  ipAddr: string
  /** Hostname if available */
  hostname?: string
  /** Presence in each scan (ordered chronologically) */
  presence: MultiScanHostPresence[]
  /** First scan ID where host was seen */
  firstSeenScanId: number
  /** Last scan ID where host was seen */
  lastSeenScanId: number
  /** Number of scans where host is present */
  presentCount: number
  /** True if host presence changed between any consecutive scans */
  hasChanges: boolean
  /** Port diffs for this host across all scans */
  portDiffs: MultiScanPortDiff[]
}

/**
 * Summary statistics for multi-scan comparison
 */
export interface MultiScanSummary {
  /** Total number of scans being compared */
  scanCount: number
  /** Total unique hosts across all scans */
  totalHosts: number
  /** Hosts that appear in all scans */
  hostsInAllScans: number
  /** Hosts that appear in some but not all scans */
  hostsInSomeScans: number
  /** Hosts that only appear in one scan */
  hostsInOneScan: number
  /** Total unique ports across all scans */
  totalPorts: number
  /** Ports that appear in all scans */
  portsInAllScans: number
  /** Ports with status changes across scans */
  portsWithChanges: number
}

/**
 * Complete multi-scan comparison result
 */
export interface MultiScanComparisonResult {
  /** Scans being compared (ordered chronologically by s_time) */
  scans: Scan[]
  /** Host diffs across all scans */
  hostDiffs: MultiScanHostDiff[]
  /** Summary statistics */
  summary: MultiScanSummary
}

// =============================================================================
// Filter Types
// =============================================================================

export type HostFilterType = 'all' | 'added' | 'removed' | 'changed' | 'unchanged'

// =============================================================================
// Saved Comparison Types
// =============================================================================

/**
 * A saved comparison stored in localStorage
 */
export interface SavedComparison {
  /** Unique identifier (UUID) */
  id: string
  /** Scan IDs being compared */
  scanIds: number[]
  /** User-provided note/description */
  note: string
  /** Target string from first scan (for display) */
  targetStr?: string
  /** Mode string from first scan (for display) */
  modeStr?: string
  /** When the comparison was first saved (ISO timestamp) */
  createdAt: string
  /** When the comparison was last updated (ISO timestamp) */
  updatedAt: string
}
