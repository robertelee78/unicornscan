/**
 * Timeline computation utilities
 * Change detection and analysis algorithms
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import type { IpReport, Scan } from '@/types/database'
import { IP_PROTOCOLS } from '@/types/database'
import type {
  PortObservation,
  PortStateChange,
  PortTrack,
  HostTimelineData,
  TimelineScanPoint,
  TimelineSummary,
  ChangeType,
  ChangeSeverity,
  TimelineFilter,
} from './types'

// =============================================================================
// Observation Building
// =============================================================================

/**
 * Convert an IpReport to a PortObservation
 */
export function reportToObservation(report: IpReport, scan: Scan): PortObservation {
  const protocol = report.proto === IP_PROTOCOLS.TCP ? 'tcp'
    : report.proto === IP_PROTOCOLS.UDP ? 'udp'
    : 'other'

  return {
    scan_id: scan.scan_id,
    timestamp: scan.s_time,
    port: report.dport,
    protocol,
    ttl: report.ttl,
    flags: report.type,  // TCP flags are in type field (not flags which is CRC errors)
    windowSize: report.proto === IP_PROTOCOLS.TCP ? report.window_size : undefined,
  }
}

/**
 * Generate a unique key for a port/protocol combo
 */
export function getPortKey(port: number, protocol: string): string {
  return `${port}-${protocol}`
}

// =============================================================================
// Change Detection
// =============================================================================

/**
 * Determine severity of a change
 */
function determineSeverity(type: ChangeType, prev: PortObservation | null, curr: PortObservation | null): ChangeSeverity {
  switch (type) {
    case 'appeared':
      // New port appearing is notable
      return 'notable'
    case 'disappeared':
      // Port disappearing is significant
      return 'significant'
    case 'reappeared':
      // Port coming back is notable
      return 'notable'
    case 'ttl_changed':
      // TTL changes could indicate routing changes or OS changes
      if (prev && curr) {
        const diff = Math.abs(prev.ttl - curr.ttl)
        if (diff >= 64) return 'significant' // Likely different OS
        if (diff >= 10) return 'notable'     // Possible routing change
        return 'minor'
      }
      return 'minor'
    case 'flags_changed':
      // Flag changes are minor unless dramatic
      return 'minor'
    case 'window_changed':
      // Window size changes are usually minor
      if (prev && curr && prev.windowSize && curr.windowSize) {
        const ratio = curr.windowSize / prev.windowSize
        if (ratio > 10 || ratio < 0.1) return 'notable' // Order of magnitude change
      }
      return 'info'
  }
}

/**
 * Generate human-readable description for a change
 */
function generateChangeDescription(
  type: ChangeType,
  port: number,
  protocol: string,
  prev: PortObservation | null,
  curr: PortObservation | null
): string {
  const portStr = `${port}/${protocol}`

  switch (type) {
    case 'appeared':
      return `Port ${portStr} first appeared`
    case 'disappeared':
      return `Port ${portStr} no longer responding`
    case 'reappeared':
      return `Port ${portStr} responding again after gap`
    case 'ttl_changed':
      if (prev && curr) {
        return `Port ${portStr} TTL changed: ${prev.ttl} → ${curr.ttl}`
      }
      return `Port ${portStr} TTL changed`
    case 'flags_changed':
      if (prev && curr) {
        return `Port ${portStr} flags changed: 0x${prev.flags.toString(16)} → 0x${curr.flags.toString(16)}`
      }
      return `Port ${portStr} flags changed`
    case 'window_changed':
      if (prev && curr && prev.windowSize !== undefined && curr.windowSize !== undefined) {
        return `Port ${portStr} window size changed: ${prev.windowSize} → ${curr.windowSize}`
      }
      return `Port ${portStr} window size changed`
  }
}

/**
 * Detect changes between consecutive observations
 */
function detectChangeBetween(
  prev: PortObservation,
  curr: PortObservation
): ChangeType[] {
  const changes: ChangeType[] = []

  // TTL change
  if (prev.ttl !== curr.ttl) {
    changes.push('ttl_changed')
  }

  // Flags change
  if (prev.flags !== curr.flags) {
    changes.push('flags_changed')
  }

  // Window size change (TCP only)
  if (
    prev.windowSize !== undefined &&
    curr.windowSize !== undefined &&
    prev.windowSize !== curr.windowSize
  ) {
    changes.push('window_changed')
  }

  return changes
}

// =============================================================================
// Timeline Building
// =============================================================================

/**
 * Build complete timeline data for a host
 */
export function buildHostTimeline(
  hostIp: string,
  scans: Scan[],
  reportsByScansId: Map<number, IpReport[]>
): HostTimelineData {
  // Sort scans chronologically
  const sortedScans = [...scans].sort((a, b) => a.s_time - b.s_time)

  if (sortedScans.length === 0) {
    return {
      hostIp,
      tracks: [],
      allChanges: [],
      scanPoints: [],
      timeRange: { start: 0, end: 0 },
      summary: {
        totalPorts: 0,
        totalChanges: 0,
        activePorts: 0,
        inactivePorts: 0,
        scanCount: 0,
        changesByType: {
          appeared: 0,
          disappeared: 0,
          reappeared: 0,
          ttl_changed: 0,
          flags_changed: 0,
          window_changed: 0,
        },
        portsWithSignificantChanges: 0,
      },
    }
  }

  // Track ports across scans
  const portMap = new Map<string, {
    observations: PortObservation[]
    lastSeenIndex: number  // Index of last scan where seen
  }>()

  const scanPoints: TimelineScanPoint[] = []
  const allChanges: PortStateChange[] = []

  // Process each scan
  for (let scanIndex = 0; scanIndex < sortedScans.length; scanIndex++) {
    const scan = sortedScans[scanIndex]
    const reports = reportsByScansId.get(scan.scan_id) || []

    const seenInThisScan = new Set<string>()
    let changesInScan = 0

    // Process each report in this scan
    for (const report of reports) {
      const observation = reportToObservation(report, scan)
      const key = getPortKey(observation.port, observation.protocol)
      seenInThisScan.add(key)

      const existing = portMap.get(key)

      if (!existing) {
        // First time seeing this port - "appeared" event
        portMap.set(key, {
          observations: [observation],
          lastSeenIndex: scanIndex,
        })

        const change: PortStateChange = {
          type: 'appeared',
          timestamp: scan.s_time,
          scan_id: scan.scan_id,
          port: observation.port,
          protocol: observation.protocol,
          previous: null,
          current: observation,
          severity: determineSeverity('appeared', null, observation),
          description: generateChangeDescription('appeared', observation.port, observation.protocol, null, observation),
        }
        allChanges.push(change)
        changesInScan++
      } else {
        // Seen before
        const prevObservation = existing.observations[existing.observations.length - 1]
        const wasGap = existing.lastSeenIndex < scanIndex - 1

        if (wasGap) {
          // Was missing for at least one scan - "reappeared" event
          const change: PortStateChange = {
            type: 'reappeared',
            timestamp: scan.s_time,
            scan_id: scan.scan_id,
            port: observation.port,
            protocol: observation.protocol,
            previous: prevObservation,
            current: observation,
            severity: determineSeverity('reappeared', prevObservation, observation),
            description: generateChangeDescription('reappeared', observation.port, observation.protocol, prevObservation, observation),
          }
          allChanges.push(change)
          changesInScan++
        }

        // Check for property changes
        const propertyChanges = detectChangeBetween(prevObservation, observation)
        for (const changeType of propertyChanges) {
          const change: PortStateChange = {
            type: changeType,
            timestamp: scan.s_time,
            scan_id: scan.scan_id,
            port: observation.port,
            protocol: observation.protocol,
            previous: prevObservation,
            current: observation,
            severity: determineSeverity(changeType, prevObservation, observation),
            description: generateChangeDescription(changeType, observation.port, observation.protocol, prevObservation, observation),
          }
          allChanges.push(change)
          changesInScan++
        }

        existing.observations.push(observation)
        existing.lastSeenIndex = scanIndex
      }
    }

    // Check for ports that disappeared (seen before but not in this scan)
    // Only check ports that were seen in the immediately previous scan
    if (scanIndex > 0) {
      for (const [key, data] of portMap) {
        if (data.lastSeenIndex === scanIndex - 1 && !seenInThisScan.has(key)) {
          const lastObs = data.observations[data.observations.length - 1]
          const change: PortStateChange = {
            type: 'disappeared',
            timestamp: scan.s_time,
            scan_id: scan.scan_id,
            port: lastObs.port,
            protocol: lastObs.protocol,
            previous: lastObs,
            current: null,
            severity: determineSeverity('disappeared', lastObs, null),
            description: generateChangeDescription('disappeared', lastObs.port, lastObs.protocol, lastObs, null),
          }
          allChanges.push(change)
          changesInScan++
        }
      }
    }

    // Build scan point
    scanPoints.push({
      scan_id: scan.scan_id,
      timestamp: scan.s_time,
      date: new Date(scan.s_time * 1000).toISOString().split('T')[0],
      portCount: seenInThisScan.size,
      hasChanges: changesInScan > 0,
      changeCount: changesInScan,
    })
  }

  // Build final port tracks
  const tracks: PortTrack[] = []
  const lastScanIndex = sortedScans.length - 1

  for (const [key, data] of portMap) {
    const observations = data.observations
    const firstObs = observations[0]
    const lastObs = observations[observations.length - 1]

    // Count gaps
    let gapCount = 0
    let prevScanIndex = -1
    for (const obs of observations) {
      const scanIndex = sortedScans.findIndex(s => s.scan_id === obs.scan_id)
      if (prevScanIndex >= 0 && scanIndex > prevScanIndex + 1) {
        gapCount++
      }
      prevScanIndex = scanIndex
    }

    // Get changes for this port
    const portChanges = allChanges.filter(
      c => c.port === firstObs.port && c.protocol === firstObs.protocol
    )

    tracks.push({
      port: firstObs.port,
      protocol: firstObs.protocol,
      key,
      observations,
      changes: portChanges,
      firstSeen: firstObs.timestamp,
      lastSeen: lastObs.timestamp,
      isActive: data.lastSeenIndex === lastScanIndex,
      observationCount: observations.length,
      gapCount,
    })
  }

  // Sort tracks by first seen, then port number
  tracks.sort((a, b) => {
    if (a.firstSeen !== b.firstSeen) return a.firstSeen - b.firstSeen
    return a.port - b.port
  })

  // Sort all changes by time
  allChanges.sort((a, b) => a.timestamp - b.timestamp)

  // Build summary
  const changesByType: Record<ChangeType, number> = {
    appeared: 0,
    disappeared: 0,
    reappeared: 0,
    ttl_changed: 0,
    flags_changed: 0,
    window_changed: 0,
  }
  for (const change of allChanges) {
    changesByType[change.type]++
  }

  const portsWithSignificantChanges = new Set(
    allChanges
      .filter(c => c.severity === 'significant')
      .map(c => getPortKey(c.port, c.protocol))
  ).size

  const summary: TimelineSummary = {
    totalPorts: tracks.length,
    totalChanges: allChanges.length,
    activePorts: tracks.filter(t => t.isActive).length,
    inactivePorts: tracks.filter(t => !t.isActive).length,
    scanCount: sortedScans.length,
    changesByType,
    portsWithSignificantChanges,
  }

  return {
    hostIp,
    tracks,
    allChanges,
    scanPoints,
    timeRange: {
      start: sortedScans[0].s_time,
      end: sortedScans[lastScanIndex].s_time,
    },
    summary,
  }
}

// =============================================================================
// Filtering
// =============================================================================

/**
 * Parse port filter string into a filter function
 * Supports: "80", "80,443", "1-1024", "80,443,8000-9000"
 */
export function parsePortFilter(filter: string): (port: number) => boolean {
  if (!filter.trim()) {
    return () => true
  }

  const parts = filter.split(',').map(p => p.trim()).filter(Boolean)
  const ranges: { min: number; max: number }[] = []
  const singles: number[] = []

  for (const part of parts) {
    if (part.includes('-')) {
      const [minStr, maxStr] = part.split('-')
      const min = parseInt(minStr, 10)
      const max = parseInt(maxStr, 10)
      if (!isNaN(min) && !isNaN(max)) {
        ranges.push({ min, max })
      }
    } else {
      const port = parseInt(part, 10)
      if (!isNaN(port)) {
        singles.push(port)
      }
    }
  }

  return (port: number) => {
    if (singles.includes(port)) return true
    for (const range of ranges) {
      if (port >= range.min && port <= range.max) return true
    }
    return false
  }
}

/**
 * Apply filters to timeline data
 */
export function applyFilters(
  data: HostTimelineData,
  filter: TimelineFilter
): HostTimelineData {
  const portFilterFn = parsePortFilter(filter.portFilter)

  // Filter tracks
  const filteredTracks = data.tracks.filter(track => {
    // Protocol filter
    if (!filter.protocols.includes(track.protocol)) return false

    // Port filter
    if (!portFilterFn(track.port)) return false

    // Active only
    if (filter.activeOnly && !track.isActive) return false

    // Changes only
    if (filter.changesOnly && track.changes.length === 0) return false

    // Severity filter - at least one change matches severity
    if (filter.changesOnly) {
      const hasMatchingChange = track.changes.some(
        c => filter.severities.includes(c.severity) && filter.changeTypes.includes(c.type)
      )
      if (!hasMatchingChange) return false
    }

    return true
  })

  // Filter changes
  const filteredChanges = data.allChanges.filter(change => {
    if (!filter.protocols.includes(change.protocol)) return false
    if (!filter.changeTypes.includes(change.type)) return false
    if (!filter.severities.includes(change.severity)) return false
    if (!portFilterFn(change.port)) return false
    return true
  })

  // Rebuild summary
  const changesByType: Record<ChangeType, number> = {
    appeared: 0,
    disappeared: 0,
    reappeared: 0,
    ttl_changed: 0,
    flags_changed: 0,
    window_changed: 0,
  }
  for (const change of filteredChanges) {
    changesByType[change.type]++
  }

  const portsWithSignificantChanges = new Set(
    filteredChanges
      .filter(c => c.severity === 'significant')
      .map(c => getPortKey(c.port, c.protocol))
  ).size

  return {
    ...data,
    tracks: filteredTracks,
    allChanges: filteredChanges,
    summary: {
      totalPorts: filteredTracks.length,
      totalChanges: filteredChanges.length,
      activePorts: filteredTracks.filter(t => t.isActive).length,
      inactivePorts: filteredTracks.filter(t => !t.isActive).length,
      scanCount: data.summary.scanCount,
      changesByType,
      portsWithSignificantChanges,
    },
  }
}

// =============================================================================
// View State Utilities
// =============================================================================

/**
 * Calculate visible time range based on zoom level
 */
export function calculateVisibleRange(
  fullRange: { start: number; end: number },
  zoomLevel: number,
  centerTimestamp?: number
): { start: number; end: number } {
  const fullDuration = fullRange.end - fullRange.start
  const visibleDuration = fullDuration / zoomLevel

  if (!centerTimestamp) {
    // Default to centering on the middle
    centerTimestamp = fullRange.start + fullDuration / 2
  }

  // Calculate start and end
  let start = centerTimestamp - visibleDuration / 2
  let end = centerTimestamp + visibleDuration / 2

  // Clamp to full range
  if (start < fullRange.start) {
    start = fullRange.start
    end = start + visibleDuration
  }
  if (end > fullRange.end) {
    end = fullRange.end
    start = Math.max(fullRange.start, end - visibleDuration)
  }

  return { start, end }
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(ts: number, format: 'date' | 'datetime' | 'time' = 'date'): string {
  const date = new Date(ts * 1000)

  switch (format) {
    case 'date':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    case 'datetime':
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    case 'time':
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
}

/**
 * Format duration between two timestamps
 */
export function formatDuration(startTs: number, endTs: number): string {
  const seconds = endTs - startTs
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}
