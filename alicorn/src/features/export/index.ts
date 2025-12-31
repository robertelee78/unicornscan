/**
 * Export feature module
 * Public exports for the export functionality
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// Types
export type {
  ExportFormat,
  MetadataDepth,
  FileOutputMode,
  ExportOptions,
  ExportContext,
  ScanExportData,
  HostExportData,
  BulkExportData,
  ExportResult,
  SelectionMode,
  SelectionState,
  ScanCSVRow,
  ReportCSVRow,
  HostCSVRow,
  PDFSummaryStats,
  PDFChartConfig,
} from './types'

export {
  EXPORT_FORMATS,
  METADATA_DEPTHS,
  FILE_OUTPUT_OPTIONS,
  DEFAULT_EXPORT_OPTIONS,
  DEFAULT_SELECTION,
} from './types'

// Components
export { ExportDialog } from './ExportDialog'
export { ExportButton, ExportDropdown, SelectionExportButton } from './ExportButton'

// Hooks
export {
  useSelection,
  useExportDialog,
  useScanExport,
  useHostExport,
  useBulkScansExport,
  useHostsListExport,
  useScansListExport,
  quickExportScan,
  quickExportHost,
} from './hooks'

// Utilities (for advanced usage)
export {
  exportScanToCSV,
  exportHostToCSV,
  exportBulkScansToCSV,
  exportHostsListToCSV,
  exportScansListToCSV,
  escapeCSVField,
  objectsToCSV,
} from './csv-utils'

export {
  exportScanToJSON,
  exportHostToJSON,
  exportBulkScansToJSON,
  exportHostsListToJSON,
  exportScansListToJSON,
} from './json-utils'

export {
  exportScanToPDF,
  exportHostToPDF,
  exportBulkScansToPDF,
  exportHostsListToPDF,
} from './pdf-utils'

export {
  downloadString,
  downloadBlob,
  generateFilename,
  scanFilename,
  hostFilename,
  bulkFilename,
  createZipArchive,
  exportAsIndividualFiles,
} from './download-utils'
