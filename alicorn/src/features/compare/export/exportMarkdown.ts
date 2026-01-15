/**
 * Markdown Export for Multi-Scan Comparison
 *
 * Generates a report-ready Markdown document with sections for
 * summary, changes, and detailed findings.
 *
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import type { MultiScanComparisonResult, MultiScanPortDiff } from '../types'

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format timestamp from scan s_time
 */
function formatDate(sTime: number): string {
  const date = new Date(sTime * 1000)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Get change events for a port between consecutive scans
 */
function getPortChangeEvents(
  portDiff: MultiScanPortDiff,
  hostAddr: string,
  scans: { scan_id: number; s_time: number }[]
): string[] {
  const events: string[] = []

  for (let i = 1; i < portDiff.presence.length; i++) {
    const prev = portDiff.presence[i - 1]
    const curr = portDiff.presence[i]
    const scan = scans[i]

    // Port appeared
    if (prev.status === 'absent' && curr.status === 'present') {
      events.push(`- **+** \`${hostAddr}\`: Port ${portDiff.port}/${portDiff.protocol} appeared (TTL: ${curr.info?.ttl ?? 'N/A'}) [Scan #${scan.scan_id}]`)
    }
    // Port disappeared
    else if (prev.status === 'present' && curr.status === 'absent') {
      events.push(`- **-** \`${hostAddr}\`: Port ${portDiff.port}/${portDiff.protocol} disappeared [Scan #${scan.scan_id}]`)
    }
    // TTL changed
    else if (
      prev.status === 'present' &&
      curr.status === 'present' &&
      prev.info?.ttl !== curr.info?.ttl
    ) {
      events.push(`- **~** \`${hostAddr}\`: Port ${portDiff.port}/${portDiff.protocol} TTL changed: ${prev.info?.ttl} → ${curr.info?.ttl} [Scan #${scan.scan_id}]`)
    }
  }

  return events
}

// =============================================================================
// Export Function
// =============================================================================

/**
 * Export multi-scan comparison to Markdown format
 *
 * @param data - Multi-scan comparison result
 * @param note - Optional note to include
 * @returns Markdown string ready for download
 */
export function exportMultiScanToMarkdown(
  data: MultiScanComparisonResult,
  note?: string
): string {
  const { scans, hostDiffs, summary } = data
  const lines: string[] = []

  // Title
  lines.push('# Scan Comparison Report')
  lines.push('')

  // Metadata
  lines.push(`**Generated:** ${new Date().toLocaleString()}`)
  lines.push('')

  if (note) {
    lines.push('## Note')
    lines.push('')
    lines.push(note)
    lines.push('')
  }

  // Scan info
  lines.push('## Scans Compared')
  lines.push('')
  lines.push('| Scan ID | Target | Mode | Start Time |')
  lines.push('|---------|--------|------|------------|')
  for (const scan of scans) {
    lines.push(`| #${scan.scan_id} | ${scan.target_str || 'N/A'} | ${scan.mode_str || 'N/A'} | ${formatDate(scan.s_time)} |`)
  }
  lines.push('')

  // Summary statistics
  lines.push('## Summary')
  lines.push('')
  lines.push('| Metric | Value |')
  lines.push('|--------|-------|')
  lines.push(`| Total Scans | ${summary.scanCount} |`)
  lines.push(`| Unique Hosts | ${summary.totalHosts} |`)
  lines.push(`| Hosts in All Scans | ${summary.hostsInAllScans} |`)
  lines.push(`| Hosts in Some Scans | ${summary.hostsInSomeScans} |`)
  lines.push(`| Hosts in One Scan | ${summary.hostsInOneScan} |`)
  lines.push(`| Unique Ports | ${summary.totalPorts} |`)
  lines.push(`| Ports in All Scans | ${summary.portsInAllScans} |`)
  lines.push(`| Ports with Changes | ${summary.portsWithChanges} |`)
  lines.push('')

  // ASN Summary (if ASN data available)
  const hostsWithAsn = hostDiffs.filter(h => h.asnNumber !== undefined)
  if (hostsWithAsn.length > 0) {
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

    lines.push('## ASN Distribution')
    lines.push('')
    lines.push('| ASN | Organization | Host Count |')
    lines.push('|-----|--------------|------------|')
    const asnEntries = Array.from(asnMap.entries()).sort(([a], [b]) => a - b)
    for (const [asn, hosts] of asnEntries) {
      lines.push(`| AS${asn} | ${hosts[0].asnOrg || 'Unknown'} | ${hosts.length} |`)
    }
    lines.push('')
  }

  // Collect all change events
  const allEvents: string[] = []
  for (const host of hostDiffs) {
    for (const port of host.portDiffs) {
      const events = getPortChangeEvents(port, host.ipAddr, scans)
      allEvents.push(...events)
    }
  }

  if (allEvents.length > 0) {
    lines.push('## Timeline of Changes')
    lines.push('')
    lines.push('Changes detected between consecutive scans:')
    lines.push('')
    lines.push(...allEvents)
    lines.push('')
  }

  // Hosts that appeared/disappeared
  const newHosts = hostDiffs.filter(h =>
    h.presence[0]?.status === 'absent' &&
    h.presence.some(p => p.status === 'present')
  )
  const lostHosts = hostDiffs.filter(h =>
    h.presence[0]?.status === 'present' &&
    h.presence[h.presence.length - 1]?.status === 'absent'
  )

  if (newHosts.length > 0) {
    lines.push('## New Hosts')
    lines.push('')
    lines.push('Hosts that appeared during the scan period:')
    lines.push('')
    for (const host of newHosts) {
      const ports = host.portDiffs.filter(p => p.presentCount > 0)
      lines.push(`- **\`${host.ipAddr}\`** - ${ports.length} port(s): ${ports.map(p => `${p.port}/${p.protocol}`).join(', ')}`)
    }
    lines.push('')
  }

  if (lostHosts.length > 0) {
    lines.push('## Lost Hosts')
    lines.push('')
    lines.push('Hosts that stopped responding:')
    lines.push('')
    for (const host of lostHosts) {
      lines.push(`- **\`${host.ipAddr}\`** - Last seen: Scan #${host.lastSeenScanId}`)
    }
    lines.push('')
  }

  // Persistent hosts with changes
  const persistentWithChanges = hostDiffs.filter(h =>
    h.presentCount === scans.length && h.hasChanges
  )

  if (persistentWithChanges.length > 0) {
    lines.push('## Hosts with Port Changes')
    lines.push('')
    lines.push('Hosts present in all scans but with port changes:')
    lines.push('')
    for (const host of persistentWithChanges) {
      const changedPorts = host.portDiffs.filter(p => p.hasChanges)
      lines.push(`- **\`${host.ipAddr}\`** - ${changedPorts.length} port(s) changed`)
    }
    lines.push('')
  }

  // Detailed host table
  lines.push('## Host Details')
  lines.push('')
  const hasAsnInDetails = hostDiffs.some(h => h.asnNumber !== undefined)
  if (hasAsnInDetails) {
    lines.push('| Host | ASN | Status | Port Count | First Seen | Last Seen |')
    lines.push('|------|-----|--------|------------|------------|-----------|')
    for (const host of hostDiffs) {
      const status = host.presentCount === scans.length ? 'All' :
        host.presentCount === 1 ? 'One' : 'Some'
      const portCount = host.portDiffs.length
      const asnStr = host.asnNumber !== undefined ? `AS${host.asnNumber}` : '-'
      lines.push(`| \`${host.ipAddr}\` | ${asnStr} | ${status} | ${portCount} | #${host.firstSeenScanId} | #${host.lastSeenScanId} |`)
    }
  } else {
    lines.push('| Host | Status | Port Count | First Seen | Last Seen |')
    lines.push('|------|--------|------------|------------|-----------|')
    for (const host of hostDiffs) {
      const status = host.presentCount === scans.length ? 'All' :
        host.presentCount === 1 ? 'One' : 'Some'
      const portCount = host.portDiffs.length
      lines.push(`| \`${host.ipAddr}\` | ${status} | ${portCount} | #${host.firstSeenScanId} | #${host.lastSeenScanId} |`)
    }
  }
  lines.push('')

  // Footer
  lines.push('---')
  lines.push('')
  lines.push('*Report generated by Alicorn Scan Comparison*')

  return lines.join('\n')
}

/**
 * Trigger Markdown file download in browser
 *
 * @param mdContent - Markdown string content
 * @param filename - Filename for download
 */
export function downloadMarkdown(mdContent: string, filename: string): void {
  const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' })
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
