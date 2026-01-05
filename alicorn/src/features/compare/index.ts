/**
 * Compare feature exports
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// Components
export { ComparisonDashboard, type ViewType } from './ComparisonDashboard'
export { ComparisonHeader, type ExportFormat } from './ComparisonHeader'
export { ScanSelector } from './ScanSelector'
export { ComparisonSummary } from './ComparisonSummary'
export { HostDiffTable } from './HostDiffTable'
export { ComparisonView } from './ComparisonView'

// Visualization Views
export { SideBySideView, TimelineView, UnifiedDiffView, MatrixHeatmapView } from './views'

// Hooks (legacy 2-scan comparison)
export {
  useScanOptions,
  useScanComparison,
  useCompareUrlState,
} from './hooks'

// Hooks (multi-scan comparison)
export {
  useMultiScanComparison,
  multiCompareKeys,
  type UseMultiScanComparisonResult,
} from './hooks/index'

// Hooks (saved comparisons)
export {
  useSavedComparisons,
  useSavedComparisonByScanIds,
  savedCompareKeys,
  type UseSavedComparisonsResult,
} from './hooks/index'

// Utilities
export { compareScans, parseCompareUrl, buildCompareUrl } from './compare-utils'
export { exportComparisonToCSV, exportComparisonToJSON } from './export-utils'

// Multi-scan export utilities
export {
  exportMultiScanToCSV,
  downloadCSV,
  exportMultiScanToJSON,
  downloadJSON,
  exportMultiScanToMarkdown,
  downloadMarkdown,
} from './export'

// Types
export * from './types'
