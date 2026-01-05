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
export { SideBySideView } from './views'

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

// Utilities
export { compareScans, parseCompareUrl, buildCompareUrl } from './compare-utils'
export { exportComparisonToCSV, exportComparisonToJSON } from './export-utils'

// Types
export * from './types'
