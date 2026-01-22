/**
 * Chart feature hooks
 * Data fetching and transformation for port trend visualizations
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useQuery } from '@tanstack/react-query'
import { getDatabase } from '@/lib/database'
import { IP_PROTOCOLS } from '@/types/database'
import type { TimeRange } from '@/features/dashboard/types'
import { getTimeRangeSeconds } from '@/features/dashboard/types'
import type {
  PortTrendPoint,
  HostPortTrend,
  PortLifespan,
  PortTimelineData,
  ProtocolBreakdown,
  ServiceDistributionData,
  ServiceDistributionEntry,
  TTLDistributionData,
  TTLBucket,
  WindowSizeDistributionData,
  WindowSizeBucket,
  PortActivityHeatmapData,
  HeatmapCell,
  ScanPerformanceStats,
  ProtocolBreakdownData,
  // Adaptive heatmap types
  AdaptiveHeatmapData,
  AdaptiveHeatmapCell,
  TimeGranularity,
} from './types'
import { getServiceName, DEFAULT_ADAPTIVE_HEATMAP_CONFIG } from './types'

const db = getDatabase()

// =============================================================================
// Query Keys
// =============================================================================

export const chartKeys = {
  all: ['charts'] as const,
  hostTrend: (hostIp: string, timeRange: TimeRange) =>
    [...chartKeys.all, 'hostTrend', hostIp, timeRange] as const,
  hostTimeline: (hostIp: string) =>
    [...chartKeys.all, 'hostTimeline', hostIp] as const,
  globalProtocol: (timeRange: TimeRange) =>
    [...chartKeys.all, 'globalProtocol', timeRange] as const,
  comparison: (hostIps: string[], timeRange: TimeRange) =>
    [...chartKeys.all, 'comparison', hostIps.join(','), timeRange] as const,
  // Phase 3.3 keys
  serviceDistribution: (timeRange: TimeRange) =>
    [...chartKeys.all, 'serviceDistribution', timeRange] as const,
  ttlDistribution: (timeRange: TimeRange) =>
    [...chartKeys.all, 'ttlDistribution', timeRange] as const,
  windowSizeDistribution: (timeRange: TimeRange) =>
    [...chartKeys.all, 'windowSizeDistribution', timeRange] as const,
  portActivityHeatmap: (timeRange: TimeRange) =>
    [...chartKeys.all, 'portActivityHeatmap', timeRange] as const,
  // Phase 3.4 keys
  scanPerformance: (timeRange: TimeRange) =>
    [...chartKeys.all, 'scanPerformance', timeRange] as const,
  protocolBreakdown: (timeRange: TimeRange) =>
    [...chartKeys.all, 'protocolBreakdown', timeRange] as const,
}

// =============================================================================
// Host Port Trend Hook
// =============================================================================

/**
 * Get port trend data for a specific host
 * Shows how port count changes over time across scans
 */
export function useHostPortTrend(hostIp: string, timeRange: TimeRange = 'all') {
  const sinceTimestamp = getSinceTimestamp(timeRange)

  return useQuery({
    queryKey: chartKeys.hostTrend(hostIp, timeRange),
    queryFn: async (): Promise<HostPortTrend> => {
      // Get all scans within time range
      const scans = await db.getScans({ limit: 500 })
      const filteredScans = sinceTimestamp
        ? scans.filter(s => s.s_time >= sinceTimestamp)
        : scans

      // Sort scans by time ascending for trend calculation
      const sortedScans = [...filteredScans].sort((a, b) => a.s_time - b.s_time)

      const points: PortTrendPoint[] = []
      let previousPorts = new Set<string>() // "port-protocol" keys

      for (const scan of sortedScans) {
        const reports = await db.getIpReportsByHost(scan.scan_id, hostIp)

        if (reports.length === 0) continue

        // Count ports by protocol
        const currentPorts = new Set<string>()
        let tcpCount = 0
        let udpCount = 0

        for (const report of reports) {
          const key = `${report.sport}-${report.proto}`
          currentPorts.add(key)

          if (report.proto === IP_PROTOCOLS.TCP) {
            tcpCount++
          } else if (report.proto === IP_PROTOCOLS.UDP) {
            udpCount++
          }
        }

        // Calculate new and removed ports
        const newPorts = [...currentPorts].filter(p => !previousPorts.has(p)).length
        const removedPorts = [...previousPorts].filter(p => !currentPorts.has(p)).length

        points.push({
          timestamp: scan.s_time,
          date: new Date(scan.s_time * 1000).toISOString().split('T')[0],
          scan_id: scan.scan_id,
          totalPorts: currentPorts.size,
          tcpPorts: tcpCount,
          udpPorts: udpCount,
          newPorts,
          removedPorts,
        })

        previousPorts = currentPorts
      }

      // Calculate summary statistics
      const portCounts = points.map(p => p.totalPorts)
      const allUniquePorts = new Set<string>()

      // Re-iterate to get all unique ports
      for (const scan of sortedScans) {
        const reports = await db.getIpReportsByHost(scan.scan_id, hostIp)
        for (const report of reports) {
          allUniquePorts.add(`${report.sport}-${report.proto}`)
        }
      }

      return {
        hostIp,
        points,
        summary: {
          minPorts: portCounts.length > 0 ? Math.min(...portCounts) : 0,
          maxPorts: portCounts.length > 0 ? Math.max(...portCounts) : 0,
          avgPorts: portCounts.length > 0
            ? Math.round(portCounts.reduce((a, b) => a + b, 0) / portCounts.length)
            : 0,
          totalUniquePorts: allUniquePorts.size,
          scanCount: points.length,
        },
      }
    },
    enabled: !!hostIp,
    staleTime: 60000,
  })
}

// =============================================================================
// Port Timeline Hook
// =============================================================================

/**
 * Get port timeline data showing when each port appeared and disappeared
 */
export function usePortTimeline(hostIp: string) {
  return useQuery({
    queryKey: chartKeys.hostTimeline(hostIp),
    queryFn: async (): Promise<PortTimelineData> => {
      const scans = await db.getScans({ limit: 500 })
      const sortedScans = [...scans].sort((a, b) => a.s_time - b.s_time)

      // Track port lifespans
      const portMap = new Map<string, PortLifespan>()
      let last_scan_id = 0
      let timeStart = Infinity
      let timeEnd = 0

      for (const scan of sortedScans) {
        const reports = await db.getIpReportsByHost(scan.scan_id, hostIp)

        if (reports.length === 0) continue

        timeStart = Math.min(timeStart, scan.s_time)
        timeEnd = Math.max(timeEnd, scan.s_time)
        last_scan_id = scan.scan_id

        for (const report of reports) {
          const key = `${report.sport}-${report.proto}`
          const protocol = report.proto === IP_PROTOCOLS.TCP ? 'tcp'
            : report.proto === IP_PROTOCOLS.UDP ? 'udp'
            : 'other'

          const existing = portMap.get(key)
          if (existing) {
            existing.lastSeen = scan.s_time
            existing.last_scan_id = scan.scan_id
            existing.observationCount++
          } else {
            portMap.set(key, {
              port: report.sport,
              protocol,
              firstSeen: scan.s_time,
              lastSeen: scan.s_time,
              first_scan_id: scan.scan_id,
              last_scan_id: scan.scan_id,
              observationCount: 1,
              isActive: false, // Will update below
            })
          }
        }
      }

      // Mark ports as active if seen in last scan
      for (const lifespan of portMap.values()) {
        lifespan.isActive = lifespan.last_scan_id === last_scan_id
      }

      // Sort by first seen, then port number
      const ports = [...portMap.values()].sort((a, b) => {
        if (a.firstSeen !== b.firstSeen) return a.firstSeen - b.firstSeen
        return a.port - b.port
      })

      return {
        hostIp,
        ports,
        timeRange: {
          start: timeStart === Infinity ? 0 : timeStart,
          end: timeEnd,
        },
      }
    },
    enabled: !!hostIp,
    staleTime: 60000,
  })
}

// =============================================================================
// Global Protocol Distribution Hook
// =============================================================================

/**
 * Get protocol distribution across all scans
 */
export function useGlobalProtocolDistribution(timeRange: TimeRange = 'all') {
  const sinceTimestamp = getSinceTimestamp(timeRange)

  return useQuery({
    queryKey: chartKeys.globalProtocol(timeRange),
    queryFn: async (): Promise<ProtocolBreakdown[]> => {
      const scans = await db.getScans({ limit: 100 })
      const filteredScans = sinceTimestamp
        ? scans.filter(s => s.s_time >= sinceTimestamp)
        : scans

      const sortedScans = [...filteredScans].sort((a, b) => a.s_time - b.s_time)
      const breakdowns: ProtocolBreakdown[] = []

      for (const scan of sortedScans) {
        const reports = await db.getIpReports(scan.scan_id)

        // Count unique (host_addr, sport) pairs per protocol
        const tcpPairs = new Set<string>()
        const udpPairs = new Set<string>()
        const icmpPairs = new Set<string>()
        const otherPairs = new Set<string>()

        for (const report of reports) {
          const key = `${report.host_addr}:${report.sport}`
          if (report.proto === IP_PROTOCOLS.TCP) tcpPairs.add(key)
          else if (report.proto === IP_PROTOCOLS.UDP) udpPairs.add(key)
          else if (report.proto === IP_PROTOCOLS.ICMP) icmpPairs.add(key)
          else otherPairs.add(key)
        }

        const tcp = tcpPairs.size
        const udp = udpPairs.size
        const icmp = icmpPairs.size
        const other = otherPairs.size

        if (tcp + udp + icmp + other > 0) {
          breakdowns.push({
            timestamp: scan.s_time,
            date: new Date(scan.s_time * 1000).toISOString().split('T')[0],
            scan_id: scan.scan_id,
            tcp,
            udp,
            icmp,
            other,
            total: tcp + udp + icmp + other,
          })
        }
      }

      return breakdowns
    },
    staleTime: 60000,
  })
}

// =============================================================================
// Multi-Host Comparison Hook
// =============================================================================

/**
 * Get port trends for multiple hosts for comparison
 */
export function useHostComparison(hostIps: string[], timeRange: TimeRange = 'all') {
  const sinceTimestamp = getSinceTimestamp(timeRange)

  return useQuery({
    queryKey: chartKeys.comparison(hostIps, timeRange),
    queryFn: async () => {
      const trends: HostPortTrend[] = []

      for (const hostIp of hostIps) {
        const scans = await db.getScans({ limit: 500 })
        const filteredScans = sinceTimestamp
          ? scans.filter(s => s.s_time >= sinceTimestamp)
          : scans

        const sortedScans = [...filteredScans].sort((a, b) => a.s_time - b.s_time)
        const points: PortTrendPoint[] = []

        for (const scan of sortedScans) {
          const reports = await db.getIpReportsByHost(scan.scan_id, hostIp)

          if (reports.length === 0) continue

          const uniquePorts = new Set(reports.map(r => `${r.sport}-${r.proto}`))
          const tcpCount = reports.filter(r => r.proto === IP_PROTOCOLS.TCP).length
          const udpCount = reports.filter(r => r.proto === IP_PROTOCOLS.UDP).length

          points.push({
            timestamp: scan.s_time,
            date: new Date(scan.s_time * 1000).toISOString().split('T')[0],
            scan_id: scan.scan_id,
            totalPorts: uniquePorts.size,
            tcpPorts: tcpCount,
            udpPorts: udpCount,
            newPorts: 0, // Not tracking for comparison
            removedPorts: 0,
          })
        }

        const portCounts = points.map(p => p.totalPorts)

        trends.push({
          hostIp,
          points,
          summary: {
            minPorts: portCounts.length > 0 ? Math.min(...portCounts) : 0,
            maxPorts: portCounts.length > 0 ? Math.max(...portCounts) : 0,
            avgPorts: portCounts.length > 0
              ? Math.round(portCounts.reduce((a, b) => a + b, 0) / portCounts.length)
              : 0,
            totalUniquePorts: 0, // Not tracking for comparison
            scanCount: points.length,
          },
        })
      }

      return trends
    },
    enabled: hostIps.length > 0,
    staleTime: 60000,
  })
}

// =============================================================================
// Helpers
// =============================================================================

function getSinceTimestamp(timeRange: TimeRange): number | null {
  const seconds = getTimeRangeSeconds(timeRange)
  if (seconds === null) return null
  return Math.floor(Date.now() / 1000) - seconds
}

// =============================================================================
// Service Distribution Hook (Phase 3.3)
// =============================================================================

/**
 * Get service distribution data derived from port observations
 * Maps ports to service names and counts occurrences
 */
export function useServiceDistribution(timeRange: TimeRange = 'all') {
  const sinceTimestamp = getSinceTimestamp(timeRange)

  return useQuery({
    queryKey: chartKeys.serviceDistribution(timeRange),
    queryFn: async (): Promise<ServiceDistributionData> => {
      const scans = await db.getScans({ limit: 100 })
      const filteredScans = sinceTimestamp
        ? scans.filter(s => s.s_time >= sinceTimestamp)
        : scans

      // Count port occurrences across all scans
      const portCounts = new Map<string, { port: number; protocol: 'tcp' | 'udp'; count: number }>()
      let totalResponses = 0

      for (const scan of filteredScans) {
        const reports = await db.getIpReports(scan.scan_id)

        for (const report of reports) {
          const protocol = report.proto === IP_PROTOCOLS.TCP ? 'tcp' : 'udp'
          const key = `${report.sport}-${protocol}`

          const existing = portCounts.get(key)
          if (existing) {
            existing.count++
          } else {
            portCounts.set(key, {
              port: report.sport,
              protocol,
              count: 1,
            })
          }
          totalResponses++
        }
      }

      // Convert to entries with service names
      const entries: ServiceDistributionEntry[] = [...portCounts.values()]
        .map(({ port, protocol, count }) => ({
          serviceName: getServiceName(port),
          port,
          protocol,
          count,
          percentage: totalResponses > 0 ? (count / totalResponses) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count)

      // Group by service name for unique count
      const uniqueServices = new Set(entries.map(e => e.serviceName))

      return {
        entries,
        totalResponses,
        uniqueServices: uniqueServices.size,
      }
    },
    staleTime: 60000,
  })
}

// =============================================================================
// TTL Distribution Hook (Phase 3.3)
// =============================================================================

/**
 * Infer OS family from TTL value
 */
function inferOsFromTtl(ttl: number): 'linux' | 'windows' | 'router' | 'unknown' {
  // Common initial TTL values:
  // Linux/Unix: 64
  // Windows: 128
  // Routers/Network devices: 255
  // Adjust for typical hop count (1-30 hops)
  if (ttl <= 0) return 'unknown'
  if (ttl <= 64) return 'linux'      // 64 - hops
  if (ttl <= 128) return 'windows'   // 128 - hops
  if (ttl <= 255) return 'router'    // 255 - hops
  return 'unknown'
}

/**
 * Get TTL distribution data for OS fingerprinting insights
 */
export function useTTLDistribution(timeRange: TimeRange = 'all') {
  const sinceTimestamp = getSinceTimestamp(timeRange)

  return useQuery({
    queryKey: chartKeys.ttlDistribution(timeRange),
    queryFn: async (): Promise<TTLDistributionData> => {
      const scans = await db.getScans({ limit: 100 })
      const filteredScans = sinceTimestamp
        ? scans.filter(s => s.s_time >= sinceTimestamp)
        : scans

      // Count TTL occurrences
      const ttlCounts = new Map<number, number>()
      let totalResponses = 0

      for (const scan of filteredScans) {
        const reports = await db.getIpReports(scan.scan_id)

        for (const report of reports) {
          if (report.ttl !== undefined && report.ttl > 0) {
            ttlCounts.set(report.ttl, (ttlCounts.get(report.ttl) || 0) + 1)
            totalResponses++
          }
        }
      }

      // Convert to buckets
      const buckets: TTLBucket[] = [...ttlCounts.entries()]
        .map(([ttl, count]) => ({
          ttl,
          count,
          osGuess: inferOsFromTtl(ttl),
        }))
        .sort((a, b) => a.ttl - b.ttl)

      // Calculate OS breakdown
      const osBreakdown = {
        linux: 0,
        windows: 0,
        router: 0,
        unknown: 0,
      }

      for (const bucket of buckets) {
        osBreakdown[bucket.osGuess] += bucket.count
      }

      // Find most common TTL
      let mostCommonTTL = 0
      let maxCount = 0
      for (const [ttl, count] of ttlCounts) {
        if (count > maxCount) {
          maxCount = count
          mostCommonTTL = ttl
        }
      }

      return {
        buckets,
        totalResponses,
        mostCommonTTL,
        osBreakdown,
      }
    },
    staleTime: 60000,
  })
}

// =============================================================================
// Window Size Distribution Hook (Phase 3.3)
// =============================================================================

/**
 * Format window size for display
 */
function formatWindowSize(size: number): string {
  if (size >= 65536) return `${Math.round(size / 1024)}KB`
  if (size >= 1024) return `${Math.round(size / 1024)}KB`
  return `${size}B`
}

/**
 * Get TCP window size distribution for OS fingerprinting
 */
export function useWindowSizeDistribution(timeRange: TimeRange = 'all') {
  const sinceTimestamp = getSinceTimestamp(timeRange)

  return useQuery({
    queryKey: chartKeys.windowSizeDistribution(timeRange),
    queryFn: async (): Promise<WindowSizeDistributionData> => {
      const scans = await db.getScans({ limit: 100 })
      const filteredScans = sinceTimestamp
        ? scans.filter(s => s.s_time >= sinceTimestamp)
        : scans

      // Count window size occurrences
      const sizeCounts = new Map<number, number>()
      let totalResponses = 0

      for (const scan of filteredScans) {
        const reports = await db.getIpReports(scan.scan_id)

        for (const report of reports) {
          // Only TCP has window size
          if (report.proto === IP_PROTOCOLS.TCP && report.window_size !== undefined && report.window_size > 0) {
            sizeCounts.set(report.window_size, (sizeCounts.get(report.window_size) || 0) + 1)
            totalResponses++
          }
        }
      }

      // Convert to buckets, sorted by count
      const buckets: WindowSizeBucket[] = [...sizeCounts.entries()]
        .map(([windowSize, count]) => ({
          windowSize,
          label: formatWindowSize(windowSize),
          count,
          percentage: totalResponses > 0 ? (count / totalResponses) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count)

      // Find most common size
      let mostCommonSize = 0
      let maxCount = 0
      for (const [size, count] of sizeCounts) {
        if (count > maxCount) {
          maxCount = count
          mostCommonSize = size
        }
      }

      return {
        buckets,
        totalResponses,
        mostCommonSize,
      }
    },
    staleTime: 60000,
  })
}

// =============================================================================
// Port Activity Heatmap Hook (Phase 3.3 - Enhanced with Adaptive Granularity)
// =============================================================================

/**
 * Helper to calculate day span between two dates
 */
function calculateDaySpan(startDate: string, endDate: string): number {
  const start = new Date(startDate).getTime()
  const end = new Date(endDate).getTime()
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
}

/**
 * Helper to format time label based on granularity
 * Uses UTC to match timeKey generation
 */
function formatTimeLabel(timeKey: string, granularity: TimeGranularity): string {
  if (granularity === 'hourly') {
    // timeKey is "YYYY-MM-DDTHH"
    const [datePart, hour] = timeKey.split('T')
    const date = new Date(datePart + 'T00:00:00Z') // Parse as UTC
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
    return `${dayName} ${hour}:00`
  } else {
    // timeKey is "YYYY-MM-DD"
    const date = new Date(timeKey + 'T00:00:00Z') // Parse as UTC
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  }
}

/**
 * Get port activity heatmap data with adaptive time granularity
 * Uses hourly buckets for < 7 days, daily buckets for >= 7 days
 */
export function usePortActivityHeatmap(timeRange: TimeRange = 'all', maxPorts: number = 20) {
  const sinceTimestamp = getSinceTimestamp(timeRange)

  return useQuery({
    queryKey: chartKeys.portActivityHeatmap(timeRange),
    queryFn: async (): Promise<AdaptiveHeatmapData> => {
      const scans = await db.getScans({ limit: 100 })
      const filteredScans = sinceTimestamp
        ? scans.filter(s => s.s_time >= sinceTimestamp)
        : scans

      const sortedScans = [...filteredScans].sort((a, b) => a.s_time - b.s_time)

      if (sortedScans.length === 0) {
        const now = new Date().toISOString().split('T')[0]
        return {
          cells: [],
          ports: [],
          timeKeys: [],
          timeLabels: [],
          maxCount: 0,
          granularity: 'daily',
          dateRange: { start: now, end: now, daySpan: 1 },
        }
      }

      // Determine date range and granularity (use UTC consistently)
      const firstScan = new Date(sortedScans[0].s_time * 1000)
      const lastScan = new Date(sortedScans[sortedScans.length - 1].s_time * 1000)
      const firstScanDate = firstScan.toISOString().split('T')[0]
      const lastScanDate = lastScan.toISOString().split('T')[0]
      const daySpan = calculateDaySpan(firstScanDate, lastScanDate)

      // Use hourly granularity for < 7 days, daily for >= 7 days
      const granularity: TimeGranularity = daySpan < DEFAULT_ADAPTIVE_HEATMAP_CONFIG.hourlyThresholdDays
        ? 'hourly'
        : 'daily'

      // Track port activity per time bucket
      const activityMap = new Map<string, number>() // "port-timeKey" -> count
      const portCounts = new Map<number, number>()  // port -> total count
      const allTimeKeys = new Set<string>()

      for (const scan of sortedScans) {
        const scanDate = new Date(scan.s_time * 1000)
        // Use UTC consistently to avoid timezone mixing bugs
        const year = scanDate.getUTCFullYear()
        const month = (scanDate.getUTCMonth() + 1).toString().padStart(2, '0')
        const day = scanDate.getUTCDate().toString().padStart(2, '0')
        const hour = scanDate.getUTCHours().toString().padStart(2, '0')
        const datePart = `${year}-${month}-${day}`

        // Create time key based on granularity
        const timeKey = granularity === 'hourly'
          ? `${datePart}T${hour}`
          : datePart

        allTimeKeys.add(timeKey)

        const reports = await db.getIpReports(scan.scan_id)

        for (const report of reports) {
          const key = `${report.sport}-${timeKey}`
          activityMap.set(key, (activityMap.get(key) || 0) + 1)
          portCounts.set(report.sport, (portCounts.get(report.sport) || 0) + 1)
        }
      }

      // Get top N ports by frequency
      const topPorts = [...portCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxPorts)
        .map(([port]) => port)
        .sort((a, b) => a - b)

      const timeKeys = [...allTimeKeys].sort()
      const timeLabels = timeKeys.map(tk => formatTimeLabel(tk, granularity))

      // Find max count for intensity scaling
      let maxCount = 0
      for (const count of activityMap.values()) {
        maxCount = Math.max(maxCount, count)
      }

      // Build cells for heatmap
      const cells: AdaptiveHeatmapCell[] = []

      for (const port of topPorts) {
        for (const timeKey of timeKeys) {
          const key = `${port}-${timeKey}`
          const count = activityMap.get(key) || 0

          // Extract date and hour from timeKey
          const datePart = timeKey.includes('T') ? timeKey.split('T')[0] : timeKey
          const hourPart = timeKey.includes('T') ? parseInt(timeKey.split('T')[1], 10) : undefined

          cells.push({
            port,
            date: datePart,
            timestamp: new Date(datePart).getTime() / 1000,
            count,
            intensity: maxCount > 0 ? count / maxCount : 0,
            hour: hourPart,
            timeKey,
          })
        }
      }

      return {
        cells,
        ports: topPorts,
        timeKeys,
        timeLabels,
        maxCount,
        granularity,
        dateRange: {
          start: firstScanDate,
          end: lastScanDate,
          daySpan,
        },
      }
    },
    staleTime: 60000,
  })
}

/**
 * Legacy hook that returns the old PortActivityHeatmapData format
 * Kept for backward compatibility with existing components
 * @deprecated Use usePortActivityHeatmap which returns AdaptiveHeatmapData
 */
export function usePortActivityHeatmapLegacy(timeRange: TimeRange = 'all', maxPorts: number = 20) {
  const sinceTimestamp = getSinceTimestamp(timeRange)

  return useQuery({
    queryKey: [...chartKeys.portActivityHeatmap(timeRange), 'legacy'] as const,
    queryFn: async (): Promise<PortActivityHeatmapData> => {
      const scans = await db.getScans({ limit: 100 })
      const filteredScans = sinceTimestamp
        ? scans.filter(s => s.s_time >= sinceTimestamp)
        : scans

      const sortedScans = [...filteredScans].sort((a, b) => a.s_time - b.s_time)

      // Track port activity per date
      const activityMap = new Map<string, number>() // "port-date" -> count
      const portCounts = new Map<number, number>()  // port -> total count
      const allDates = new Set<string>()

      for (const scan of sortedScans) {
        const date = new Date(scan.s_time * 1000).toISOString().split('T')[0]
        allDates.add(date)

        const reports = await db.getIpReports(scan.scan_id)

        for (const report of reports) {
          const key = `${report.sport}-${date}`
          activityMap.set(key, (activityMap.get(key) || 0) + 1)
          portCounts.set(report.sport, (portCounts.get(report.sport) || 0) + 1)
        }
      }

      // Get top N ports by frequency
      const topPorts = [...portCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxPorts)
        .map(([port]) => port)
        .sort((a, b) => a - b)

      const dates = [...allDates].sort()

      // Find max count for intensity scaling
      let maxCount = 0
      for (const count of activityMap.values()) {
        maxCount = Math.max(maxCount, count)
      }

      // Build cells for heatmap
      const cells: HeatmapCell[] = []

      for (const port of topPorts) {
        for (const date of dates) {
          const key = `${port}-${date}`
          const count = activityMap.get(key) || 0

          cells.push({
            port,
            date,
            timestamp: new Date(date).getTime() / 1000,
            count,
            intensity: maxCount > 0 ? count / maxCount : 0,
          })
        }
      }

      return {
        cells,
        ports: topPorts,
        dates,
        maxCount,
      }
    },
    staleTime: 60000,
  })
}

// =============================================================================
// Scan Performance Stats Hook (Phase 3.4)
// =============================================================================

/**
 * Get aggregated scan performance statistics for the Statistics page.
 * Returns response rate, host hit rate, and packet counts.
 */
export function useScanPerformanceStats(timeRange: TimeRange = 'all') {
  const sinceTimestamp = getSinceTimestamp(timeRange)

  return useQuery({
    queryKey: chartKeys.scanPerformance(timeRange),
    queryFn: async (): Promise<ScanPerformanceStats> => {
      return db.getScanPerformanceStats({ since: sinceTimestamp })
    },
    staleTime: 60000,
  })
}

// =============================================================================
// Protocol Breakdown Hook (Phase 3.4)
// =============================================================================

/**
 * Get protocol breakdown for the Statistics page.
 * Returns TCP/UDP counts and TCP SYN+ACK/banner breakdowns.
 */
export function useProtocolBreakdown(timeRange: TimeRange = 'all') {
  const sinceTimestamp = getSinceTimestamp(timeRange)

  return useQuery({
    queryKey: chartKeys.protocolBreakdown(timeRange),
    queryFn: async (): Promise<ProtocolBreakdownData> => {
      return db.getProtocolBreakdown({ since: sinceTimestamp })
    },
    staleTime: 60000,
  })
}
