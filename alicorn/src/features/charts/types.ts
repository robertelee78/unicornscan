/**
 * Chart feature types
 * Data structures for port trend and timeline visualizations
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// =============================================================================
// Port Trend Data
// =============================================================================

/**
 * A single point on the port trend chart
 * Represents port counts at a specific scan/time
 */
export interface PortTrendPoint {
  timestamp: number       // Unix timestamp of scan
  date: string           // ISO date string for display
  scansId: number        // Reference to scan
  totalPorts: number     // Total unique ports observed
  tcpPorts: number       // TCP port count
  udpPorts: number       // UDP port count
  newPorts: number       // Ports not seen in previous scan
  removedPorts: number   // Ports seen before but not in this scan
}

/**
 * Port trend data for a single host
 */
export interface HostPortTrend {
  hostIp: string
  hostname?: string
  points: PortTrendPoint[]
  summary: {
    minPorts: number
    maxPorts: number
    avgPorts: number
    totalUniquePorts: number
    scanCount: number
  }
}

// =============================================================================
// Port Timeline Data
// =============================================================================

/**
 * Lifespan of a single port
 * When it was first seen and last seen
 */
export interface PortLifespan {
  port: number
  protocol: 'tcp' | 'udp' | 'other'
  firstSeen: number      // Unix timestamp
  lastSeen: number       // Unix timestamp
  firstScansId: number
  lastScansId: number
  observationCount: number  // How many scans observed this port
  isActive: boolean      // Was it seen in the most recent scan?
}

/**
 * Timeline data showing port appearances over time
 */
export interface PortTimelineData {
  hostIp: string
  ports: PortLifespan[]
  timeRange: {
    start: number
    end: number
  }
}

// =============================================================================
// Protocol Distribution
// =============================================================================

/**
 * Protocol breakdown for a scan or time period
 */
export interface ProtocolBreakdown {
  timestamp: number
  date: string
  scansId?: number
  tcp: number
  udp: number
  icmp: number
  other: number
  total: number
}

// =============================================================================
// Multi-Host Comparison
// =============================================================================

/**
 * Comparison point for overlaying multiple hosts
 */
export interface ComparisonPoint {
  timestamp: number
  date: string
  [hostIp: string]: number | string  // Dynamic keys for each host's port count
}

/**
 * Configuration for host comparison chart
 */
export interface ComparisonConfig {
  hosts: string[]           // Host IPs to compare
  hostLabels: Map<string, string>  // IP -> display label
  colors: Map<string, string>      // IP -> chart color
}

// =============================================================================
// Chart Configuration
// =============================================================================

export interface ChartConfig {
  showTcp: boolean
  showUdp: boolean
  showTotal: boolean
  showNewPorts: boolean
  showRemovedPorts: boolean
  chartType: 'line' | 'area' | 'bar'
  stacked: boolean
}

export const DEFAULT_CHART_CONFIG: ChartConfig = {
  showTcp: true,
  showUdp: true,
  showTotal: true,
  showNewPorts: false,
  showRemovedPorts: false,
  chartType: 'area',
  stacked: false,
}

// =============================================================================
// Color Constants
// =============================================================================

export const CHART_COLORS = {
  total: 'hsl(var(--primary))',
  tcp: '#22c55e',      // Green
  udp: '#3b82f6',      // Blue
  icmp: '#f59e0b',     // Amber
  other: '#6b7280',    // Gray
  newPorts: '#10b981', // Emerald
  removedPorts: '#ef4444', // Red
} as const
