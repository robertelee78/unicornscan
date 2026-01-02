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
  scan_id: number        // Reference to scan
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
  first_scan_id: number
  last_scan_id: number
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
  scan_id?: number
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

// =============================================================================
// Service Distribution (Phase 3.3)
// =============================================================================

/**
 * Service distribution data point
 * Derived from port→service name mapping
 */
export interface ServiceDistributionEntry {
  serviceName: string
  port: number
  protocol: 'tcp' | 'udp'
  count: number
  percentage: number
}

/**
 * Aggregated service distribution
 */
export interface ServiceDistributionData {
  entries: ServiceDistributionEntry[]
  totalResponses: number
  uniqueServices: number
}

// =============================================================================
// TTL Distribution (Phase 3.3)
// =============================================================================

/**
 * TTL bucket for histogram
 */
export interface TTLBucket {
  ttl: number
  count: number
  osGuess: 'linux' | 'windows' | 'router' | 'unknown'
}

/**
 * TTL distribution data
 */
export interface TTLDistributionData {
  buckets: TTLBucket[]
  totalResponses: number
  mostCommonTTL: number
  osBreakdown: {
    linux: number
    windows: number
    router: number
    unknown: number
  }
}

// =============================================================================
// Window Size Distribution (Phase 3.3)
// =============================================================================

/**
 * Window size bucket for histogram
 */
export interface WindowSizeBucket {
  windowSize: number
  label: string   // e.g., "64KB", "16KB"
  count: number
  percentage: number
}

/**
 * Window size distribution data
 */
export interface WindowSizeDistributionData {
  buckets: WindowSizeBucket[]
  totalResponses: number
  mostCommonSize: number
}

// =============================================================================
// Port Activity Heatmap (Phase 3.3)
// =============================================================================

/**
 * Single cell in the port activity heatmap
 */
export interface HeatmapCell {
  port: number
  date: string       // ISO date string
  timestamp: number
  count: number
  intensity: number  // Normalized 0-1 for color scaling
}

/**
 * Port activity heatmap data
 */
export interface PortActivityHeatmapData {
  cells: HeatmapCell[]
  ports: number[]      // Y-axis: sorted unique ports
  dates: string[]      // X-axis: sorted unique dates
  maxCount: number     // For color scaling
}

// =============================================================================
// Service Name Mapping (Phase 3.3)
// =============================================================================

/**
 * Common port to service name mapping
 * Used for deriving service distribution from port data
 */
export const PORT_SERVICE_MAP: Record<number, string> = {
  21: 'FTP',
  22: 'SSH',
  23: 'Telnet',
  25: 'SMTP',
  53: 'DNS',
  69: 'TFTP',
  80: 'HTTP',
  110: 'POP3',
  111: 'RPC',
  123: 'NTP',
  135: 'MSRPC',
  137: 'NetBIOS-NS',
  138: 'NetBIOS-DGM',
  139: 'NetBIOS-SSN',
  143: 'IMAP',
  161: 'SNMP',
  162: 'SNMP-Trap',
  389: 'LDAP',
  443: 'HTTPS',
  445: 'SMB',
  465: 'SMTPS',
  514: 'Syslog',
  587: 'Submission',
  636: 'LDAPS',
  993: 'IMAPS',
  995: 'POP3S',
  1080: 'SOCKS',
  1433: 'MSSQL',
  1434: 'MSSQL-UDP',
  1521: 'Oracle',
  1723: 'PPTP',
  2049: 'NFS',
  2181: 'ZooKeeper',
  3306: 'MySQL',
  3389: 'RDP',
  5432: 'PostgreSQL',
  5672: 'AMQP',
  5900: 'VNC',
  6379: 'Redis',
  6443: 'Kubernetes',
  8080: 'HTTP-Alt',
  8443: 'HTTPS-Alt',
  9092: 'Kafka',
  9200: 'Elasticsearch',
  11211: 'Memcached',
  27017: 'MongoDB',
  27018: 'MongoDB-Shard',
}

/**
 * Get service name from port number
 */
export function getServiceName(port: number): string {
  return PORT_SERVICE_MAP[port] || 'Unknown'
}

// =============================================================================
// Heatmap Color Scale
// =============================================================================

/**
 * Color scale for heatmap (from light to dark)
 */
export const HEATMAP_COLORS = [
  '#f0fdf4',  // Very light green (0)
  '#dcfce7',  // Light green (0.1)
  '#bbf7d0',  // (0.2)
  '#86efac',  // (0.3)
  '#4ade80',  // (0.4)
  '#22c55e',  // Medium green (0.5)
  '#16a34a',  // (0.6)
  '#15803d',  // (0.7)
  '#166534',  // (0.8)
  '#14532d',  // Dark green (0.9-1.0)
] as const

/**
 * Get color for heatmap intensity (0-1)
 */
export function getHeatmapColor(intensity: number): string {
  const idx = Math.min(Math.floor(intensity * HEATMAP_COLORS.length), HEATMAP_COLORS.length - 1)
  return HEATMAP_COLORS[idx]
}
