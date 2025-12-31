/**
 * Chart feature hooks
 * Data fetching and transformation for port trend visualizations
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
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
} from './types'

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
        const reports = await db.getIpReportsByHost(scan.scans_id, hostIp)

        if (reports.length === 0) continue

        // Count ports by protocol
        const currentPorts = new Set<string>()
        let tcpCount = 0
        let udpCount = 0

        for (const report of reports) {
          const key = `${report.dport}-${report.proto}`
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
          scansId: scan.scans_id,
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
        const reports = await db.getIpReportsByHost(scan.scans_id, hostIp)
        for (const report of reports) {
          allUniquePorts.add(`${report.dport}-${report.proto}`)
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
      let lastScansId = 0
      let timeStart = Infinity
      let timeEnd = 0

      for (const scan of sortedScans) {
        const reports = await db.getIpReportsByHost(scan.scans_id, hostIp)

        if (reports.length === 0) continue

        timeStart = Math.min(timeStart, scan.s_time)
        timeEnd = Math.max(timeEnd, scan.s_time)
        lastScansId = scan.scans_id

        for (const report of reports) {
          const key = `${report.dport}-${report.proto}`
          const protocol = report.proto === IP_PROTOCOLS.TCP ? 'tcp'
            : report.proto === IP_PROTOCOLS.UDP ? 'udp'
            : 'other'

          const existing = portMap.get(key)
          if (existing) {
            existing.lastSeen = scan.s_time
            existing.lastScansId = scan.scans_id
            existing.observationCount++
          } else {
            portMap.set(key, {
              port: report.dport,
              protocol,
              firstSeen: scan.s_time,
              lastSeen: scan.s_time,
              firstScansId: scan.scans_id,
              lastScansId: scan.scans_id,
              observationCount: 1,
              isActive: false, // Will update below
            })
          }
        }
      }

      // Mark ports as active if seen in last scan
      for (const lifespan of portMap.values()) {
        lifespan.isActive = lifespan.lastScansId === lastScansId
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
        const reports = await db.getIpReports(scan.scans_id)

        let tcp = 0, udp = 0, icmp = 0, other = 0

        for (const report of reports) {
          if (report.proto === IP_PROTOCOLS.TCP) tcp++
          else if (report.proto === IP_PROTOCOLS.UDP) udp++
          else if (report.proto === IP_PROTOCOLS.ICMP) icmp++
          else other++
        }

        if (tcp + udp + icmp + other > 0) {
          breakdowns.push({
            timestamp: scan.s_time,
            date: new Date(scan.s_time * 1000).toISOString().split('T')[0],
            scansId: scan.scans_id,
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
          const reports = await db.getIpReportsByHost(scan.scans_id, hostIp)

          if (reports.length === 0) continue

          const uniquePorts = new Set(reports.map(r => `${r.dport}-${r.proto}`))
          const tcpCount = reports.filter(r => r.proto === IP_PROTOCOLS.TCP).length
          const udpCount = reports.filter(r => r.proto === IP_PROTOCOLS.UDP).length

          points.push({
            timestamp: scan.s_time,
            date: new Date(scan.s_time * 1000).toISOString().split('T')[0],
            scansId: scan.scans_id,
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
