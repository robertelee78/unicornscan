/**
 * Comparison export utilities
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import type { ScanComparisonResult } from './types'

// =============================================================================
// CSV Export
// =============================================================================

function escapeCSV(value: string | number | undefined): string {
  if (value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function exportComparisonToCSV(result: ScanComparisonResult): string {
  const lines: string[] = []

  // Header with metadata
  lines.push('# Scan Comparison Report')
  lines.push(`# Generated: ${new Date().toISOString()}`)
  lines.push(`# Scan A: #${result.scanA.scan_id} - ${result.scanA.target_str}`)
  lines.push(`# Scan B: #${result.scanB.scan_id} - ${result.scanB.target_str}`)
  lines.push('')

  // Summary section
  lines.push('# Summary')
  lines.push('Metric,Value')
  lines.push(`Hosts in Scan A,${result.summary.totalHostsA}`)
  lines.push(`Hosts in Scan B,${result.summary.totalHostsB}`)
  lines.push(`Hosts Added,${result.summary.hostsAdded}`)
  lines.push(`Hosts Removed,${result.summary.hostsRemoved}`)
  lines.push(`Hosts Changed,${result.summary.hostsChanged}`)
  lines.push(`Hosts Unchanged,${result.summary.hostsUnchanged}`)
  lines.push(`Ports Opened,${result.summary.portsOpened}`)
  lines.push(`Ports Closed,${result.summary.portsClosed}`)
  lines.push(`Ports Modified,${result.summary.portsModified}`)
  lines.push('')

  // Host differences
  lines.push('# Host Differences')
  lines.push('IP Address,Hostname,Status,Ports A,Ports B,Ports Added,Ports Removed,Ports Changed')

  for (const host of result.hostDiffs) {
    const portsAdded = host.portDiffs.filter(p => p.status === 'added').length
    const portsRemoved = host.portDiffs.filter(p => p.status === 'removed').length
    const portsChanged = host.portDiffs.filter(p => p.status === 'changed').length

    lines.push([
      escapeCSV(host.ipAddr),
      escapeCSV(host.hostname || ''),
      escapeCSV(host.status),
      host.portsA.length,
      host.portsB.length,
      portsAdded,
      portsRemoved,
      portsChanged,
    ].join(','))
  }
  lines.push('')

  // Port-level details
  lines.push('# Port Details')
  lines.push('Host,Port,Protocol,Status,TTL A,Flags A,TTL B,Flags B')

  for (const host of result.hostDiffs) {
    for (const port of host.portDiffs) {
      lines.push([
        escapeCSV(host.ipAddr),
        port.port,
        escapeCSV(port.protocol),
        escapeCSV(port.status),
        port.infoA?.ttl ?? '',
        port.infoA?.flags ?? '',
        port.infoB?.ttl ?? '',
        port.infoB?.flags ?? '',
      ].join(','))
    }
  }

  return lines.join('\n')
}

// =============================================================================
// JSON Export
// =============================================================================

export function exportComparisonToJSON(result: ScanComparisonResult): string {
  const exportData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      scanA: {
        id: result.scanA.scan_id,
        target: result.scanA.target_str,
        time: result.scanA.s_time,
        mode: result.scanA.mode_str,
      },
      scanB: {
        id: result.scanB.scan_id,
        target: result.scanB.target_str,
        time: result.scanB.s_time,
        mode: result.scanB.mode_str,
      },
    },
    summary: result.summary,
    hostDiffs: result.hostDiffs.map(host => ({
      ipAddr: host.ipAddr,
      hostname: host.hostname,
      status: host.status,
      portsInA: host.portsA.length,
      portsInB: host.portsB.length,
      portChanges: {
        added: host.portDiffs.filter(p => p.status === 'added').length,
        removed: host.portDiffs.filter(p => p.status === 'removed').length,
        changed: host.portDiffs.filter(p => p.status === 'changed').length,
        unchanged: host.portDiffs.filter(p => p.status === 'unchanged').length,
      },
      ports: host.portDiffs.map(port => ({
        port: port.port,
        protocol: port.protocol,
        status: port.status,
        scanA: port.infoA ? {
          ttl: port.infoA.ttl,
          flags: port.infoA.flags,
        } : null,
        scanB: port.infoB ? {
          ttl: port.infoB.ttl,
          flags: port.infoB.flags,
        } : null,
      })),
    })),
  }

  return JSON.stringify(exportData, null, 2)
}
