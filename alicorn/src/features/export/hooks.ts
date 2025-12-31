/**
 * Export hooks
 * React hooks for managing export state and operations
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback, useMemo } from 'react'
import type { Scan, IpReport, Host, ScanSummary } from '@/types/database'
import type {
  ExportOptions,
  ExportFormat,
  ScanExportData,
  HostExportData,
  BulkExportData,
  SelectionState,
  SelectionMode,
} from './types'
import { DEFAULT_EXPORT_OPTIONS, DEFAULT_SELECTION } from './types'
import { exportScanToCSV, exportHostToCSV, exportBulkScansToCSV, exportHostsListToCSV, exportScansListToCSV } from './csv-utils'
import { exportScanToJSON, exportHostToJSON, exportBulkScansToJSON, exportHostsListToJSON, exportScansListToJSON } from './json-utils'
import { exportScanToPDF, exportHostToPDF, exportBulkScansToPDF, exportHostsListToPDF } from './pdf-utils'
import { downloadString, downloadBlob, scanFilename, hostFilename, bulkFilename, exportAsIndividualFiles } from './download-utils'

// =============================================================================
// Selection Hook
// =============================================================================

export interface UseSelectionReturn {
  selection: SelectionState
  isSelected: (id: number) => boolean
  toggleSelection: (id: number) => void
  selectAll: (ids: number[]) => void
  clearSelection: () => void
  setMode: (mode: SelectionMode) => void
  selectedIds: number[]
}

export function useSelection(): UseSelectionReturn {
  const [selection, setSelection] = useState<SelectionState>(DEFAULT_SELECTION)

  const isSelected = useCallback((id: number) => {
    return selection.selectedIds.has(id)
  }, [selection.selectedIds])

  const toggleSelection = useCallback((id: number) => {
    setSelection((prev) => {
      const newSet = new Set(prev.selectedIds)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return {
        mode: newSet.size > 0 ? 'selected' : 'none',
        selectedIds: newSet,
      }
    })
  }, [])

  const selectAll = useCallback((ids: number[]) => {
    setSelection({
      mode: 'selected',
      selectedIds: new Set(ids),
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelection(DEFAULT_SELECTION)
  }, [])

  const setMode = useCallback((mode: SelectionMode) => {
    setSelection((prev) => ({ ...prev, mode }))
  }, [])

  const selectedIds = useMemo(() => [...selection.selectedIds], [selection.selectedIds])

  return {
    selection,
    isSelected,
    toggleSelection,
    selectAll,
    clearSelection,
    setMode,
    selectedIds,
  }
}

// =============================================================================
// Export Dialog Hook
// =============================================================================

export interface UseExportDialogReturn {
  isOpen: boolean
  openDialog: () => void
  closeDialog: () => void
  options: ExportOptions
  setOptions: (options: ExportOptions) => void
  resetOptions: () => void
}

export function useExportDialog(): UseExportDialogReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS)

  const openDialog = useCallback(() => setIsOpen(true), [])
  const closeDialog = useCallback(() => setIsOpen(false), [])
  const resetOptions = useCallback(() => setOptions(DEFAULT_EXPORT_OPTIONS), [])

  return {
    isOpen,
    openDialog,
    closeDialog,
    options,
    setOptions,
    resetOptions,
  }
}

// =============================================================================
// Single Scan Export Hook
// =============================================================================

export interface UseScanExportReturn {
  exportScan: (options: ExportOptions) => void
  isExporting: boolean
}

export function useScanExport(
  scan: Scan | null,
  reports: IpReport[]
): UseScanExportReturn {
  const [isExporting, setIsExporting] = useState(false)

  const exportScan = useCallback(async (options: ExportOptions) => {
    if (!scan) return

    setIsExporting(true)
    try {
      const data: ScanExportData = { scan, reports }

      switch (options.format) {
        case 'csv': {
          const csv = exportScanToCSV(data, options.metadataDepth)
          downloadString(csv, scanFilename(scan.scans_id, 'csv'), 'csv')
          break
        }
        case 'json': {
          const json = exportScanToJSON(data, options.metadataDepth)
          downloadString(json, scanFilename(scan.scans_id, 'json'), 'json')
          break
        }
        case 'pdf': {
          const blob = exportScanToPDF(data, options)
          downloadBlob(blob, scanFilename(scan.scans_id, 'pdf'))
          break
        }
      }
    } finally {
      setIsExporting(false)
    }
  }, [scan, reports])

  return { exportScan, isExporting }
}

// =============================================================================
// Single Host Export Hook
// =============================================================================

export interface UseHostExportReturn {
  exportHost: (options: ExportOptions) => void
  isExporting: boolean
}

export function useHostExport(
  host: Host | null,
  reports: IpReport[],
  scanHistory: { scansId: number; scanTime: number; portsFound: number }[] = []
): UseHostExportReturn {
  const [isExporting, setIsExporting] = useState(false)

  const exportHost = useCallback(async (options: ExportOptions) => {
    if (!host) return

    setIsExporting(true)
    try {
      const data: HostExportData = { host, reports, scanHistory }

      switch (options.format) {
        case 'csv': {
          const csv = exportHostToCSV(data, options.metadataDepth)
          downloadString(csv, hostFilename(host.ip_addr, 'csv'), 'csv')
          break
        }
        case 'json': {
          const json = exportHostToJSON(data, options.metadataDepth)
          downloadString(json, hostFilename(host.ip_addr, 'json'), 'json')
          break
        }
        case 'pdf': {
          const blob = exportHostToPDF(data, options)
          downloadBlob(blob, hostFilename(host.ip_addr, 'pdf'))
          break
        }
      }
    } finally {
      setIsExporting(false)
    }
  }, [host, reports, scanHistory])

  return { exportHost, isExporting }
}

// =============================================================================
// Bulk Scans Export Hook
// =============================================================================

export interface UseBulkScansExportReturn {
  exportBulkScans: (options: ExportOptions) => Promise<void>
  isExporting: boolean
}

export function useBulkScansExport(
  scans: Array<{ scan: Scan; reports: IpReport[] }>,
  filters?: Record<string, unknown>
): UseBulkScansExportReturn {
  const [isExporting, setIsExporting] = useState(false)

  const exportBulkScans = useCallback(async (options: ExportOptions) => {
    if (scans.length === 0) return

    setIsExporting(true)
    try {
      const data: BulkExportData = {
        scans,
        timestamp: Date.now(),
        filters,
      }

      if (options.fileOutput === 'individual') {
        // Export as individual files in ZIP
        const items = scans.map((s) => {
          const scanData: ScanExportData = { scan: s.scan, reports: s.reports }
          let content: string | Blob

          switch (options.format) {
            case 'csv':
              content = exportScanToCSV(scanData, options.metadataDepth)
              break
            case 'json':
              content = exportScanToJSON(scanData, options.metadataDepth)
              break
            case 'pdf':
              content = exportScanToPDF(scanData, options)
              break
          }

          return {
            id: `scan-${s.scan.scans_id}`,
            content,
            format: options.format,
          }
        })

        await exportAsIndividualFiles(items, bulkFilename('scans', 'csv').replace('.csv', '.zip'))
      } else {
        // Export as combined file
        switch (options.format) {
          case 'csv': {
            const csv = exportBulkScansToCSV(data, options.metadataDepth)
            downloadString(csv, bulkFilename('scans', 'csv'), 'csv')
            break
          }
          case 'json': {
            const json = exportBulkScansToJSON(data, options.metadataDepth)
            downloadString(json, bulkFilename('scans', 'json'), 'json')
            break
          }
          case 'pdf': {
            const blob = exportBulkScansToPDF(data, options)
            downloadBlob(blob, bulkFilename('scans', 'pdf'))
            break
          }
        }
      }
    } finally {
      setIsExporting(false)
    }
  }, [scans, filters])

  return { exportBulkScans, isExporting }
}

// =============================================================================
// Hosts List Export Hook
// =============================================================================

export interface UseHostsListExportReturn {
  exportHostsList: (options: ExportOptions) => void
  isExporting: boolean
}

export function useHostsListExport(hosts: Host[]): UseHostsListExportReturn {
  const [isExporting, setIsExporting] = useState(false)

  const exportHostsList = useCallback(async (options: ExportOptions) => {
    if (hosts.length === 0) return

    setIsExporting(true)
    try {
      switch (options.format) {
        case 'csv': {
          const csv = exportHostsListToCSV(hosts, options.metadataDepth)
          downloadString(csv, bulkFilename('hosts', 'csv'), 'csv')
          break
        }
        case 'json': {
          const json = exportHostsListToJSON(hosts, options.metadataDepth)
          downloadString(json, bulkFilename('hosts', 'json'), 'json')
          break
        }
        case 'pdf': {
          const blob = exportHostsListToPDF(hosts, options)
          downloadBlob(blob, bulkFilename('hosts', 'pdf'))
          break
        }
      }
    } finally {
      setIsExporting(false)
    }
  }, [hosts])

  return { exportHostsList, isExporting }
}

// =============================================================================
// Scans List Export Hook
// =============================================================================

export interface UseScansListExportReturn {
  exportScansList: (options: ExportOptions) => void
  isExporting: boolean
}

export function useScansListExport(
  scans: ScanSummary[]
): UseScansListExportReturn {
  const [isExporting, setIsExporting] = useState(false)

  const exportScansList = useCallback(async (options: ExportOptions) => {
    if (scans.length === 0) return

    setIsExporting(true)
    try {
      // Transform ScanSummary to the format expected by export functions
      const exportableScans = scans.map((s) => ({
        ...s,
        // Map ScanSummary fields to expected fields
        est_e_time: s.e_time,
        senders: 0,
        listeners: 0,
        scan_iter: 0,
        options: 0,
        payload_group: 0,
        dronestr: '',
        covertness: 0,
        modules: '',
        user: '',
        pcap_dumpfile: null,
        pcap_readfile: null,
        port_str: '',
        pps: 0,
        src_port: 0,
        mode: '',
        mode_flags: null,
        num_phases: null,
        scan_metadata: null,
        scan_notes: null,
        host_count: s.host_count,
        port_count: s.port_count,
      }))

      switch (options.format) {
        case 'csv': {
          const csv = exportScansListToCSV(exportableScans, options.metadataDepth)
          downloadString(csv, bulkFilename('scans', 'csv'), 'csv')
          break
        }
        case 'json': {
          const json = exportScansListToJSON(exportableScans, options.metadataDepth)
          downloadString(json, bulkFilename('scans', 'json'), 'json')
          break
        }
        case 'pdf': {
          // For scans list PDF, convert to bulk format
          const bulkData: BulkExportData = {
            scans: exportableScans.map((s) => ({ scan: s as Scan & { host_count: number; port_count: number }, reports: [] })),
            timestamp: Date.now(),
          }
          const blob = exportBulkScansToPDF(bulkData, options)
          downloadBlob(blob, bulkFilename('scans', 'pdf'))
          break
        }
      }
    } finally {
      setIsExporting(false)
    }
  }, [scans])

  return { exportScansList, isExporting }
}

// =============================================================================
// Quick Export Functions (no dialog)
// =============================================================================

export function quickExportScan(
  scan: Scan,
  reports: IpReport[],
  format: ExportFormat = 'csv'
): void {
  const data: ScanExportData = { scan, reports }
  const options = { ...DEFAULT_EXPORT_OPTIONS, format }

  switch (format) {
    case 'csv': {
      const csv = exportScanToCSV(data, options.metadataDepth)
      downloadString(csv, scanFilename(scan.scans_id, 'csv'), 'csv')
      break
    }
    case 'json': {
      const json = exportScanToJSON(data, options.metadataDepth)
      downloadString(json, scanFilename(scan.scans_id, 'json'), 'json')
      break
    }
    case 'pdf': {
      const blob = exportScanToPDF(data, options)
      downloadBlob(blob, scanFilename(scan.scans_id, 'pdf'))
      break
    }
  }
}

export function quickExportHost(
  host: Host,
  reports: IpReport[],
  format: ExportFormat = 'csv'
): void {
  const data: HostExportData = { host, reports, scanHistory: [] }
  const options = { ...DEFAULT_EXPORT_OPTIONS, format }

  switch (format) {
    case 'csv': {
      const csv = exportHostToCSV(data, options.metadataDepth)
      downloadString(csv, hostFilename(host.ip_addr, 'csv'), 'csv')
      break
    }
    case 'json': {
      const json = exportHostToJSON(data, options.metadataDepth)
      downloadString(json, hostFilename(host.ip_addr, 'json'), 'json')
      break
    }
    case 'pdf': {
      const blob = exportHostToPDF(data, options)
      downloadBlob(blob, hostFilename(host.ip_addr, 'pdf'))
      break
    }
  }
}
