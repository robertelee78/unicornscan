/**
 * Activity Matrix feature exports
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// Types
export type {
  ViewMode,
  PortKey,
  CellStatus,
  MatrixCell,
  MatrixCellSerialized,
  BaselineMode,
  MatrixFilters,
  HostRowData,
  ScanColumnData,
  ActivityMatrixData,
  MatrixSummary,
  DiffDialogData,
  MatrixExportRow,
} from './types'

export {
  VIEW_MODE_OPTIONS,
  DEFAULT_MATRIX_FILTERS,
  makePortKey,
  parsePortKey,
  getCellStatusColor,
  getCellStatusLabel,
} from './types'

// Hooks
export {
  activityMatrixKeys,
  useMatrixFilters,
  useMatrixScans,
  useActivityMatrix,
  useCellDiff,
  useBaselineScanOptions,
} from './hooks'

// Components
export { HostActivityMatrix } from './HostActivityMatrix'
export { MatrixCellDisplay } from './MatrixCell'
export { MatrixFiltersPanel } from './MatrixFilters'
export { MatrixDiffDialog } from './MatrixDiffDialog'

// Export utilities
export {
  matrixToCSV,
  downloadCSV,
  exportMatrixToCSV,
  exportSummaryToCSV,
  exportChangesToCSV,
} from './export-utils'
