/**
 * Compare feature exports
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

// Components
export { ComparisonDashboard, type ViewType } from './ComparisonDashboard'
export { ComparisonHeader, type ExportFormat } from './ComparisonHeader'
export { SavedComparisons } from './SavedComparisons'

// Visualization Views
export { SideBySideView, TimelineView, UnifiedDiffView, MatrixHeatmapView } from './views'

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
