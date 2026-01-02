/**
 * Matrix export utilities
 * Functions for exporting activity matrix data to CSV
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import type { ActivityMatrixData, MatrixExportRow, PortKey } from './types'

// =============================================================================
// CSV Export
// =============================================================================

/**
 * Convert activity matrix data to CSV format
 */
export function matrixToCSV(data: ActivityMatrixData): string {
  const rows: MatrixExportRow[] = []

  // Iterate through all cells in the matrix
  for (const hostIp of data.hostOrder) {
    const row = data.rows.get(hostIp)
    if (!row) continue

    for (const scan_id of data.scanOrder) {
      const cell = row.cells.get(scan_id)
      if (!cell) continue

      const column = data.columns.get(scan_id)
      if (!column) continue

      rows.push({
        host_ip: hostIp,
        scan_id: scan_id,
        scan_time: new Date(column.scan.s_time * 1000).toISOString(),
        status: cell.status,
        current_ports: portsToString([...cell.currentPorts]),
        baseline_ports: cell.baselinePorts ? portsToString([...cell.baselinePorts]) : '',
        new_ports: portsToString(cell.newPorts),
        removed_ports: portsToString(cell.removedPorts),
      })
    }
  }

  return rowsToCSV(rows)
}

/**
 * Convert array of port keys to semicolon-separated string
 */
function portsToString(ports: PortKey[]): string {
  return ports.sort((a, b) => {
    const [portA] = a.split('/')
    const [portB] = b.split('/')
    return parseInt(portA, 10) - parseInt(portB, 10)
  }).join(';')
}

/**
 * Convert array of row objects to CSV string
 */
function rowsToCSV(rows: MatrixExportRow[]): string {
  if (rows.length === 0) {
    return 'host_ip,scan_id,scan_time,status,current_ports,baseline_ports,new_ports,removed_ports\n'
  }

  // Headers
  const headers = Object.keys(rows[0]) as (keyof MatrixExportRow)[]
  const headerLine = headers.join(',')

  // Data rows
  const dataLines = rows.map((row) =>
    headers.map((header) => escapeCSVField(String(row[header]))).join(',')
  )

  return [headerLine, ...dataLines].join('\n')
}

/**
 * Escape a field for CSV (handle commas, quotes, newlines)
 */
function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`
  }
  return field
}

// =============================================================================
// Download Helpers
// =============================================================================

/**
 * Trigger download of CSV file
 */
export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, 100)
}

/**
 * Export matrix data to CSV file with auto-generated filename
 */
export function exportMatrixToCSV(data: ActivityMatrixData): void {
  const csv = matrixToCSV(data)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `activity-matrix-${timestamp}.csv`
  downloadCSV(csv, filename)
}

// =============================================================================
// Summary Export
// =============================================================================

/**
 * Export summary statistics to CSV
 */
export function exportSummaryToCSV(data: ActivityMatrixData): void {
  const { summary, filters } = data

  const rows = [
    ['Metric', 'Value'],
    ['Total Hosts', summary.totalHosts.toString()],
    ['Hosts with Changes', summary.hostsWithChanges.toString()],
    ['Total Scans', summary.totalScans.toString()],
    ['Scans with Changes', summary.scansWithChanges.toString()],
    ['Cells with New Ports', summary.cellsWithNewPorts.toString()],
    ['Cells with Removed Ports', summary.cellsWithRemovedPorts.toString()],
    ['Cells with Mixed Changes', summary.cellsWithMixedChanges.toString()],
    ['Total Unique Ports', summary.allUniquePorts.size.toString()],
    ['', ''],
    ['Filters', ''],
    ['Time Range', filters.timeRange],
    ['View Mode', filters.viewMode],
    ['Baseline Mode', filters.baselineMode],
    ['Subnet Filter', filters.subnet || 'None'],
    ['Port Range', filters.portRange ? `${filters.portRange.min}-${filters.portRange.max}` : 'All'],
    ['Protocols', filters.protocols.join(', ')],
  ]

  const csv = rows.map((row) => row.map(escapeCSVField).join(',')).join('\n')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `activity-matrix-summary-${timestamp}.csv`
  downloadCSV(csv, filename)
}

// =============================================================================
// Changes-Only Export
// =============================================================================

/**
 * Export only cells with changes to CSV
 */
export function exportChangesToCSV(data: ActivityMatrixData): void {
  const rows: MatrixExportRow[] = []

  for (const hostIp of data.hostOrder) {
    const row = data.rows.get(hostIp)
    if (!row) continue

    for (const scan_id of data.scanOrder) {
      const cell = row.cells.get(scan_id)
      if (!cell) continue

      // Only include cells with actual changes
      if (cell.status === 'new' || cell.status === 'removed' || cell.status === 'mixed') {
        const column = data.columns.get(scan_id)
        if (!column) continue

        rows.push({
          host_ip: hostIp,
          scan_id: scan_id,
          scan_time: new Date(column.scan.s_time * 1000).toISOString(),
          status: cell.status,
          current_ports: portsToString([...cell.currentPorts]),
          baseline_ports: cell.baselinePorts ? portsToString([...cell.baselinePorts]) : '',
          new_ports: portsToString(cell.newPorts),
          removed_ports: portsToString(cell.removedPorts),
        })
      }
    }
  }

  const csv = rowsToCSV(rows)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `activity-matrix-changes-${timestamp}.csv`
  downloadCSV(csv, filename)
}
