/**
 * JSON Export for Multi-Scan Comparison
 *
 * Exports full structured comparison data as JSON.
 * Includes metadata, summary, and complete diff data.
 *
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import type { MultiScanComparisonResult } from '../types'

// =============================================================================
// Types
// =============================================================================

interface JsonExportData {
  metadata: {
    generatedAt: string
    version: string
    scanCount: number
    note?: string
  }
  scans: Array<{
    id: number
    target: string | null
    mode: string | null
    startTime: string
    endTime: string
  }>
  summary: {
    scanCount: number
    totalHosts: number
    hostsInAllScans: number
    hostsInSomeScans: number
    hostsInOneScan: number
    totalPorts: number
    portsInAllScans: number
    portsWithChanges: number
  }
  hosts: Array<{
    ipAddr: string
    hostname?: string
    presence: Array<{
      scanId: number
      status: 'present' | 'absent'
      portCount: number
    }>
    firstSeenScanId: number
    lastSeenScanId: number
    presentCount: number
    hasChanges: boolean
    ports: Array<{
      port: number
      protocol: string
      presence: Array<{
        scanId: number
        status: 'present' | 'absent'
        info?: {
          ttl?: number
          flags?: number
        }
      }>
      firstSeenScanId: number
      lastSeenScanId: number
      presentCount: number
      hasChanges: boolean
    }>
  }>
}

// =============================================================================
// Export Function
// =============================================================================

/**
 * Export multi-scan comparison to JSON format
 *
 * @param data - Multi-scan comparison result
 * @param note - Optional note to include in metadata
 * @returns JSON string ready for download
 */
export function exportMultiScanToJSON(
  data: MultiScanComparisonResult,
  note?: string
): string {
  const { scans, hostDiffs, summary } = data

  const exportData: JsonExportData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      version: '2.0',
      scanCount: scans.length,
      ...(note && { note }),
    },
    scans: scans.map(scan => ({
      id: scan.scan_id,
      target: scan.target_str,
      mode: scan.mode_str,
      startTime: new Date(scan.s_time * 1000).toISOString(),
      endTime: new Date(scan.e_time * 1000).toISOString(),
    })),
    summary: {
      scanCount: summary.scanCount,
      totalHosts: summary.totalHosts,
      hostsInAllScans: summary.hostsInAllScans,
      hostsInSomeScans: summary.hostsInSomeScans,
      hostsInOneScan: summary.hostsInOneScan,
      totalPorts: summary.totalPorts,
      portsInAllScans: summary.portsInAllScans,
      portsWithChanges: summary.portsWithChanges,
    },
    hosts: hostDiffs.map(host => ({
      ipAddr: host.ipAddr,
      hostname: host.hostname,
      presence: host.presence.map(p => ({
        scanId: p.scanId,
        status: p.status,
        portCount: p.portCount,
      })),
      firstSeenScanId: host.firstSeenScanId,
      lastSeenScanId: host.lastSeenScanId,
      presentCount: host.presentCount,
      hasChanges: host.hasChanges,
      ports: host.portDiffs.map(port => ({
        port: port.port,
        protocol: port.protocol,
        presence: port.presence.map(p => ({
          scanId: p.scanId,
          status: p.status,
          ...(p.info && {
            info: {
              ttl: p.info.ttl,
              flags: p.info.flags,
            },
          }),
        })),
        firstSeenScanId: port.firstSeenScanId,
        lastSeenScanId: port.lastSeenScanId,
        presentCount: port.presentCount,
        hasChanges: port.hasChanges,
      })),
    })),
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * Trigger JSON file download in browser
 *
 * @param jsonContent - JSON string content
 * @param filename - Filename for download
 */
export function downloadJSON(jsonContent: string, filename: string): void {
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' })
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
