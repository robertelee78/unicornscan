/**
 * Scan comparison types
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import type { Scan } from '@/types/database'

// =============================================================================
// Diff Status Types
// =============================================================================

export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'

// =============================================================================
// Host Comparison Types
// =============================================================================

export interface HostDiff {
  /** IP address */
  ipAddr: string
  /** Hostname if available */
  hostname?: string
  /** Diff status for this host */
  status: DiffStatus
  /** Ports in scan A */
  portsA: PortInfo[]
  /** Ports in scan B */
  portsB: PortInfo[]
  /** Port-level changes */
  portDiffs: PortDiff[]
}

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

export interface PortDiff {
  /** Port number */
  port: number
  /** Protocol */
  protocol: string
  /** Diff status for this port */
  status: DiffStatus
  /** Info from scan A (if present) */
  infoA?: PortInfo
  /** Info from scan B (if present) */
  infoB?: PortInfo
}

// =============================================================================
// Comparison Result Types
// =============================================================================

export interface ScanComparisonResult {
  /** Scan A metadata */
  scanA: Scan
  /** Scan B metadata */
  scanB: Scan
  /** Host-level diffs */
  hostDiffs: HostDiff[]
  /** Summary statistics */
  summary: ComparisonSummary
}

export interface ComparisonSummary {
  /** Total hosts in scan A */
  totalHostsA: number
  /** Total hosts in scan B */
  totalHostsB: number
  /** Hosts only in scan A (removed) */
  hostsRemoved: number
  /** Hosts only in scan B (added) */
  hostsAdded: number
  /** Hosts in both with changes */
  hostsChanged: number
  /** Hosts in both with no changes */
  hostsUnchanged: number
  /** Total ports in scan A */
  totalPortsA: number
  /** Total ports in scan B */
  totalPortsB: number
  /** Ports only in scan A (closed) */
  portsClosed: number
  /** Ports only in scan B (opened) */
  portsOpened: number
  /** Ports with different properties */
  portsModified: number
}

// =============================================================================
// Scan Selector Types
// =============================================================================

export interface ScanOption {
  scansId: number
  label: string
  targetStr: string
  time: number
}

// =============================================================================
// View Mode
// =============================================================================

export type CompareViewMode = 'matrix' | 'comparison'

// =============================================================================
// Filter Types
// =============================================================================

export type HostFilterType = 'all' | 'added' | 'removed' | 'changed' | 'unchanged'
