/**
 * CSV Export for Multi-Scan Comparison
 *
 * Exports comparison data as a flat CSV table with one row per host/port combination.
 * Includes metadata header and summary section.
 *
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import type { MultiScanComparisonResult, MultiScanPortDiff } from '../types'

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Escape a value for CSV format
 */
function escapeCSV(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Format timestamp from scan s_time
 */
function formatTimestamp(sTime: number): string {
  const date = new Date(sTime * 1000)
  return date.toISOString()
}

/**
 * Get status string for a port across scans
 */
function getPortStatus(portDiff: MultiScanPortDiff, scanCount: number): string {
  if (portDiff.presentCount === scanCount) {
    return portDiff.hasChanges ? 'changed' : 'unchanged'
  } else if (portDiff.presentCount === 0) {
    return 'never'
  } else if (portDiff.firstSeenScanId === portDiff.lastSeenScanId) {
    return 'transient'
  } else {
    return 'intermittent'
  }
}

/**
 * Get scan presence string (which scan IDs the port appears in)
 */
function getPresenceString(portDiff: MultiScanPortDiff): string {
  const presentScanIds = portDiff.presence
    .filter(p => p.status === 'present')
    .map(p => p.scanId)
  return presentScanIds.join(';')
}

/**
 * Get TTL values string across scans
 */
function getTtlString(portDiff: MultiScanPortDiff): string {
  const ttlValues = portDiff.presence
    .filter(p => p.status === 'present' && p.info?.ttl !== undefined)
    .map(p => `${p.scanId}:${p.info!.ttl}`)
  return ttlValues.join(';')
}

// =============================================================================
// Export Function
// =============================================================================

/**
 * Export multi-scan comparison to CSV format
 *
 * @param data - Multi-scan comparison result
 * @param note - Optional note to include in header
 * @returns CSV string ready for download
 */
export function exportMultiScanToCSV(
  data: MultiScanComparisonResult,
  note?: string
): string {
  const lines: string[] = []
  const { scans, hostDiffs, summary } = data

  // Metadata header
  lines.push('# Multi-Scan Comparison Report')
  lines.push(`# Generated: ${new Date().toISOString()}`)
  lines.push(`# Scans Compared: ${scans.length}`)
  lines.push(`# Scan IDs: ${scans.map(s => s.scan_id).join(', ')}`)
  if (scans[0]?.target_str) {
    lines.push(`# Target: ${scans[0].target_str}`)
  }
  if (scans[0]?.mode_str) {
    lines.push(`# Mode: ${scans[0].mode_str}`)
  }
  if (note) {
    lines.push(`# Note: ${note}`)
  }
  lines.push('')

  // Scan timeline
  lines.push('# Scan Timeline')
  lines.push('Scan ID,Start Time,Target,Mode')
  for (const scan of scans) {
    lines.push([
      scan.scan_id,
      formatTimestamp(scan.s_time),
      escapeCSV(scan.target_str),
      escapeCSV(scan.mode_str),
    ].join(','))
  }
  lines.push('')

  // Summary statistics
  lines.push('# Summary Statistics')
  lines.push('Metric,Value')
  lines.push(`Total Scans,${summary.scanCount}`)
  lines.push(`Total Unique Hosts,${summary.totalHosts}`)
  lines.push(`Hosts in All Scans,${summary.hostsInAllScans}`)
  lines.push(`Hosts in Some Scans,${summary.hostsInSomeScans}`)
  lines.push(`Hosts in One Scan Only,${summary.hostsInOneScan}`)
  lines.push(`Total Unique Ports,${summary.totalPorts}`)
  lines.push(`Ports in All Scans,${summary.portsInAllScans}`)
  lines.push(`Ports with Changes,${summary.portsWithChanges}`)
  lines.push('')

  // Check if any hosts have ASN data
  const hostsWithAsn = hostDiffs.filter(h => h.asnNumber !== undefined)
  const hasAsnData = hostsWithAsn.length > 0

  // ASN Summary (if ASN data available)
  if (hasAsnData) {
    // Group hosts by ASN
    const asnMap = new Map<number, typeof hostDiffs>()
    for (const host of hostDiffs) {
      if (host.asnNumber !== undefined) {
        const existing = asnMap.get(host.asnNumber)
        if (existing) {
          existing.push(host)
        } else {
          asnMap.set(host.asnNumber, [host])
        }
      }
    }

    lines.push('# ASN Summary')
    lines.push('ASN,Organization,Host Count')
    const asnEntries = Array.from(asnMap.entries()).sort(([a], [b]) => a - b)
    for (const [asn, hosts] of asnEntries) {
      lines.push([
        `AS${asn}`,
        escapeCSV(hosts[0].asnOrg || ''),
        hosts.length,
      ].join(','))
    }
    lines.push('')
  }

  // Host summary (now includes ASN columns)
  lines.push('# Host Summary')
  const hostHeaders = hasAsnData
    ? 'Host,ASN,ASN Org,CIDR Group,Status,Present In,First Seen Scan,Last Seen Scan,Port Count'
    : 'Host,Status,Present In,First Seen Scan,Last Seen Scan,Port Count'
  lines.push(hostHeaders)

  for (const host of hostDiffs) {
    const status = host.presentCount === scans.length ? 'all' :
      host.presentCount === 1 ? 'one' : 'some'
    const presentIn = host.presence
      .filter(p => p.status === 'present')
      .map(p => p.scanId)
      .join(';')

    if (hasAsnData) {
      lines.push([
        escapeCSV(host.ipAddr),
        host.asnNumber !== undefined ? `AS${host.asnNumber}` : '',
        escapeCSV(host.asnOrg || ''),
        escapeCSV(host.cidrGroup || ''),
        status,
        presentIn,
        host.firstSeenScanId,
        host.lastSeenScanId,
        host.portDiffs.length,
      ].join(','))
    } else {
      lines.push([
        escapeCSV(host.ipAddr),
        status,
        presentIn,
        host.firstSeenScanId,
        host.lastSeenScanId,
        host.portDiffs.length,
      ].join(','))
    }
  }
  lines.push('')

  // Port-level details (main data table)
  lines.push('# Port Details')
  const portHeaders = hasAsnData
    ? 'Host,ASN,Port,Protocol,Status,Present In Scans,TTL Values,First Seen Scan,Last Seen Scan'
    : 'Host,Port,Protocol,Status,Present In Scans,TTL Values,First Seen Scan,Last Seen Scan'
  lines.push(portHeaders)

  for (const host of hostDiffs) {
    for (const port of host.portDiffs) {
      const status = getPortStatus(port, scans.length)

      if (hasAsnData) {
        lines.push([
          escapeCSV(host.ipAddr),
          host.asnNumber !== undefined ? `AS${host.asnNumber}` : '',
          port.port,
          escapeCSV(port.protocol),
          status,
          escapeCSV(getPresenceString(port)),
          escapeCSV(getTtlString(port)),
          port.firstSeenScanId,
          port.lastSeenScanId,
        ].join(','))
      } else {
        lines.push([
          escapeCSV(host.ipAddr),
          port.port,
          escapeCSV(port.protocol),
          status,
          escapeCSV(getPresenceString(port)),
          escapeCSV(getTtlString(port)),
          port.firstSeenScanId,
          port.lastSeenScanId,
        ].join(','))
      }
    }
  }

  return lines.join('\n')
}

/**
 * Trigger CSV file download in browser
 *
 * @param csvContent - CSV string content
 * @param filename - Filename for download
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
