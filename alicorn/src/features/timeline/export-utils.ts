/**
 * Timeline export utilities
 * Export timeline data as JSON, CSV, or image
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import type {
  HostTimelineData,
  TimelineExportOptions,
} from './types'
import { getChangeTypeLabel, getChangeTypeColor } from './types'
import { formatTimestamp } from './timeline-utils'

// =============================================================================
// CSV Export
// =============================================================================

function escapeCSV(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Export timeline changes to CSV
 */
export function exportChangesToCSV(
  data: HostTimelineData,
  options: { visibleOnly?: boolean; startTs?: number; endTs?: number } = {}
): string {
  const lines: string[] = []

  // Header with metadata
  lines.push('# Host Timeline - Change Events')
  lines.push(`# Host: ${data.hostIp}`)
  lines.push(`# Generated: ${new Date().toISOString()}`)
  lines.push(`# Total Changes: ${data.allChanges.length}`)
  lines.push('')

  // Column headers
  lines.push('Timestamp,Date,Scan ID,Port,Protocol,Change Type,Severity,Description,Previous TTL,Current TTL,Previous Flags,Current Flags')

  // Filter changes if needed
  let changes = data.allChanges
  if (options.visibleOnly && options.startTs !== undefined && options.endTs !== undefined) {
    changes = changes.filter(c => c.timestamp >= options.startTs! && c.timestamp <= options.endTs!)
  }

  // Data rows
  for (const change of changes) {
    lines.push([
      change.timestamp,
      escapeCSV(formatTimestamp(change.timestamp, 'datetime')),
      change.scan_id,
      change.port,
      escapeCSV(change.protocol),
      escapeCSV(getChangeTypeLabel(change.type)),
      escapeCSV(change.severity),
      escapeCSV(change.description),
      change.previous?.ttl ?? '',
      change.current?.ttl ?? '',
      change.previous ? `0x${change.previous.flags.toString(16)}` : '',
      change.current ? `0x${change.current.flags.toString(16)}` : '',
    ].join(','))
  }

  return lines.join('\n')
}

/**
 * Export port tracks to CSV
 */
export function exportTracksToCSV(
  data: HostTimelineData,
  options: { includeObservations?: boolean } = {}
): string {
  const lines: string[] = []

  // Header with metadata
  lines.push('# Host Timeline - Port Tracks')
  lines.push(`# Host: ${data.hostIp}`)
  lines.push(`# Generated: ${new Date().toISOString()}`)
  lines.push(`# Total Ports: ${data.tracks.length}`)
  lines.push('')

  // Track summary section
  lines.push('# Port Summary')
  lines.push('Port,Protocol,First Seen,Last Seen,Observations,Changes,Gaps,Active')

  for (const track of data.tracks) {
    lines.push([
      track.port,
      escapeCSV(track.protocol),
      escapeCSV(formatTimestamp(track.firstSeen, 'datetime')),
      escapeCSV(formatTimestamp(track.lastSeen, 'datetime')),
      track.observationCount,
      track.changes.length,
      track.gapCount,
      track.isActive ? 'Yes' : 'No',
    ].join(','))
  }

  // Observation details if requested
  if (options.includeObservations) {
    lines.push('')
    lines.push('# Detailed Observations')
    lines.push('Port,Protocol,Scan ID,Timestamp,Date,TTL,Flags,Window Size')

    for (const track of data.tracks) {
      for (const obs of track.observations) {
        lines.push([
          obs.port,
          escapeCSV(obs.protocol),
          obs.scan_id,
          obs.timestamp,
          escapeCSV(formatTimestamp(obs.timestamp, 'datetime')),
          obs.ttl,
          `0x${obs.flags.toString(16)}`,
          obs.windowSize ?? '',
        ].join(','))
      }
    }
  }

  return lines.join('\n')
}

// =============================================================================
// JSON Export
// =============================================================================

/**
 * Export timeline to JSON
 */
export function exportTimelineToJSON(
  data: HostTimelineData,
  options: TimelineExportOptions
): string {
  const exportData: Record<string, unknown> = {
    metadata: {
      hostIp: data.hostIp,
      generatedAt: new Date().toISOString(),
      timeRange: {
        start: data.timeRange.start,
        end: data.timeRange.end,
        startDate: formatTimestamp(data.timeRange.start, 'datetime'),
        endDate: formatTimestamp(data.timeRange.end, 'datetime'),
      },
    },
    summary: data.summary,
    scanPoints: data.scanPoints,
  }

  if (options.includeChanges) {
    exportData.changes = data.allChanges.map(change => ({
      type: change.type,
      typeLabel: getChangeTypeLabel(change.type),
      timestamp: change.timestamp,
      date: formatTimestamp(change.timestamp, 'datetime'),
      scan_id: change.scan_id,
      port: change.port,
      protocol: change.protocol,
      severity: change.severity,
      description: change.description,
      previous: change.previous ? {
        ttl: change.previous.ttl,
        flags: change.previous.flags,
        windowSize: change.previous.windowSize,
      } : null,
      current: change.current ? {
        ttl: change.current.ttl,
        flags: change.current.flags,
        windowSize: change.current.windowSize,
      } : null,
    }))
  }

  if (options.includeObservations) {
    exportData.tracks = data.tracks.map(track => ({
      port: track.port,
      protocol: track.protocol,
      firstSeen: track.firstSeen,
      lastSeen: track.lastSeen,
      isActive: track.isActive,
      observationCount: track.observationCount,
      changeCount: track.changes.length,
      gapCount: track.gapCount,
      observations: track.observations.map(obs => ({
        scan_id: obs.scan_id,
        timestamp: obs.timestamp,
        date: formatTimestamp(obs.timestamp, 'datetime'),
        ttl: obs.ttl,
        flags: obs.flags,
        windowSize: obs.windowSize,
      })),
    }))
  } else {
    // Just track summaries without observations
    exportData.tracks = data.tracks.map(track => ({
      port: track.port,
      protocol: track.protocol,
      firstSeen: track.firstSeen,
      firstSeenDate: formatTimestamp(track.firstSeen, 'datetime'),
      lastSeen: track.lastSeen,
      lastSeenDate: formatTimestamp(track.lastSeen, 'datetime'),
      isActive: track.isActive,
      observationCount: track.observationCount,
      changeCount: track.changes.length,
      gapCount: track.gapCount,
    }))
  }

  return JSON.stringify(exportData, null, 2)
}

// =============================================================================
// SVG Export
// =============================================================================

/**
 * Generate SVG visualization of the timeline
 */
export function exportTimelineToSVG(
  data: HostTimelineData,
  options: { width?: number; visibleStart?: number; visibleEnd?: number } = {}
): string {
  const width = options.width || 1200
  const rowHeight = 24
  const labelWidth = 100
  const timelineWidth = width - labelWidth - 50
  const padding = 20

  const visibleStart = options.visibleStart ?? data.timeRange.start
  const visibleEnd = options.visibleEnd ?? data.timeRange.end
  const duration = visibleEnd - visibleStart || 1

  // Filter and sort tracks
  const tracks = data.tracks
    .filter(t => t.lastSeen >= visibleStart && t.firstSeen <= visibleEnd)
    .slice(0, 30) // Limit to 30 rows for reasonable SVG size

  const height = tracks.length * rowHeight + 100 + padding * 2

  const lines: string[] = []

  // SVG header
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`)

  // Styles
  lines.push(`<style>
    .label { font: 11px monospace; fill: #666; }
    .header { font: bold 14px sans-serif; fill: #333; }
    .time-label { font: 10px sans-serif; fill: #999; }
    .track-bar { rx: 2; }
    .event-marker { cursor: pointer; }
    .grid-line { stroke: #eee; stroke-width: 1; }
  </style>`)

  // Background
  lines.push(`<rect width="${width}" height="${height}" fill="white"/>`)

  // Title
  lines.push(`<text x="${padding}" y="${padding + 16}" class="header">Port Timeline - ${data.hostIp}</text>`)
  lines.push(`<text x="${padding}" y="${padding + 32}" class="time-label">${formatTimestamp(visibleStart)} - ${formatTimestamp(visibleEnd)}</text>`)

  const contentTop = padding + 50

  // Time axis
  const timeMarkers = 5
  for (let i = 0; i <= timeMarkers; i++) {
    const x = labelWidth + (timelineWidth * i / timeMarkers)
    const ts = visibleStart + (duration * i / timeMarkers)
    lines.push(`<line x1="${x}" y1="${contentTop}" x2="${x}" y2="${contentTop + tracks.length * rowHeight}" class="grid-line"/>`)
    lines.push(`<text x="${x}" y="${contentTop - 5}" class="time-label" text-anchor="middle">${formatTimestamp(ts)}</text>`)
  }

  // Port rows
  tracks.forEach((track, index) => {
    const y = contentTop + index * rowHeight

    // Label
    lines.push(`<text x="${labelWidth - 5}" y="${y + rowHeight / 2 + 4}" class="label" text-anchor="end">${track.port}/${track.protocol}</text>`)

    // Track background
    lines.push(`<rect x="${labelWidth}" y="${y + 2}" width="${timelineWidth}" height="${rowHeight - 4}" fill="#f5f5f5" rx="2"/>`)

    // Calculate bar position
    const barStart = Math.max(0, ((track.firstSeen - visibleStart) / duration) * timelineWidth)
    const barEnd = Math.min(timelineWidth, ((track.lastSeen - visibleStart) / duration) * timelineWidth)
    const barWidth = Math.max(barEnd - barStart, 4)

    // Protocol color
    const color = track.protocol === 'tcp' ? '#3b82f6' : track.protocol === 'udp' ? '#8b5cf6' : '#6b7280'
    const opacity = track.isActive ? 1 : 0.5

    // Bar
    lines.push(`<rect x="${labelWidth + barStart}" y="${y + 4}" width="${barWidth}" height="${rowHeight - 8}" fill="${color}" opacity="${opacity}" class="track-bar"/>`)

    // Change event markers
    for (const change of track.changes) {
      if (change.timestamp >= visibleStart && change.timestamp <= visibleEnd) {
        const cx = labelWidth + ((change.timestamp - visibleStart) / duration) * timelineWidth
        const eventColor = getChangeTypeColor(change.type)
        lines.push(`<circle cx="${cx}" cy="${y + rowHeight / 2}" r="4" fill="${eventColor}" class="event-marker"><title>${change.description}</title></circle>`)
      }
    }

    // Active indicator
    if (track.isActive) {
      lines.push(`<circle cx="${labelWidth + barStart + barWidth + 5}" cy="${y + rowHeight / 2}" r="3" fill="#22c55e"/>`)
    }
  })

  // Legend
  const legendY = contentTop + tracks.length * rowHeight + 20
  const legendItems = [
    { label: 'TCP', color: '#3b82f6' },
    { label: 'UDP', color: '#8b5cf6' },
    { label: 'Active', color: '#22c55e' },
    { label: 'Appeared', color: getChangeTypeColor('appeared') },
    { label: 'Disappeared', color: getChangeTypeColor('disappeared') },
    { label: 'Changed', color: getChangeTypeColor('ttl_changed') },
  ]

  let legendX = labelWidth
  for (const item of legendItems) {
    lines.push(`<circle cx="${legendX}" cy="${legendY}" r="5" fill="${item.color}"/>`)
    lines.push(`<text x="${legendX + 10}" y="${legendY + 4}" class="time-label">${item.label}</text>`)
    legendX += 80
  }

  lines.push('</svg>')

  return lines.join('\n')
}

// =============================================================================
// Download Helpers
// =============================================================================

/**
 * Trigger file download
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export timeline with given options
 */
export function exportTimeline(
  data: HostTimelineData,
  options: TimelineExportOptions,
  visibleRange?: { start: number; end: number }
): void {
  const timestamp = new Date().toISOString().split('T')[0]
  const baseFilename = `timeline-${data.hostIp.replace(/\./g, '-')}-${timestamp}`

  switch (options.format) {
    case 'json': {
      const content = exportTimelineToJSON(data, options)
      downloadFile(content, `${baseFilename}.json`, 'application/json')
      break
    }
    case 'csv': {
      // Export both changes and tracks as separate files or combined
      if (options.includeChanges) {
        const changesCSV = exportChangesToCSV(data, {
          visibleOnly: options.visibleOnly,
          startTs: visibleRange?.start,
          endTs: visibleRange?.end,
        })
        downloadFile(changesCSV, `${baseFilename}-changes.csv`, 'text/csv')
      }
      if (options.includeObservations || !options.includeChanges) {
        const tracksCSV = exportTracksToCSV(data, {
          includeObservations: options.includeObservations,
        })
        downloadFile(tracksCSV, `${baseFilename}-tracks.csv`, 'text/csv')
      }
      break
    }
    case 'svg': {
      const svg = exportTimelineToSVG(data, {
        width: options.imageWidth,
        visibleStart: options.visibleOnly ? visibleRange?.start : undefined,
        visibleEnd: options.visibleOnly ? visibleRange?.end : undefined,
      })
      downloadFile(svg, `${baseFilename}.svg`, 'image/svg+xml')
      break
    }
    case 'png': {
      // Generate SVG first, then convert to PNG via canvas
      const svg = exportTimelineToSVG(data, {
        width: options.imageWidth,
        visibleStart: options.visibleOnly ? visibleRange?.start : undefined,
        visibleEnd: options.visibleOnly ? visibleRange?.end : undefined,
      })
      svgToPng(svg, `${baseFilename}.png`)
      break
    }
  }
}

/**
 * Convert SVG to PNG and download
 */
function svgToPng(svgContent: string, filename: string): void {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const img = new Image()
  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  img.onload = () => {
    canvas.width = img.width
    canvas.height = img.height
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)

    canvas.toBlob((blob) => {
      if (blob) {
        const pngUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = pngUrl
        a.download = filename
        a.click()
        URL.revokeObjectURL(pngUrl)
      }
    }, 'image/png')

    URL.revokeObjectURL(url)
  }

  img.src = url
}
