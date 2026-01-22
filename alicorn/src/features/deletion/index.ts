/**
 * Deletion feature exports
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

// Components
export { DeleteConfirmDialog, BulkDeleteConfirmDialog } from './DeleteConfirmDialog'

// Hooks
export {
  useScanDeleteStats,
  useScanDeletion,
  useBulkScanDeletion,
  recordDeletion,
  getRecentDeletions,
  clearDeletionHistory,
} from './hooks'

// Types
export type {
  ScanDeleteStats,
  DeleteScanResult,
  BulkDeleteState,
  DeleteMode,
  DeleteConfirmProps,
  BulkDeleteConfirmProps,
} from './types'
