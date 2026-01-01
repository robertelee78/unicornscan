/**
 * Scan deletion types
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// =============================================================================
// Stats for confirmation dialog
// =============================================================================

export interface ScanDeleteStats {
  scansId: number
  target: string
  scanTime: number
  portCount: number
  hostCount: number
  arpCount: number
  hopCount: number
  noteCount: number
  tagCount: number
}

// =============================================================================
// Delete operation result
// =============================================================================

export interface DeleteScanResult {
  success: boolean
  scansId: number
  deleted: {
    reports: number
    arp: number
    hops: number
    notes: number
    tags: number
  }
  error?: string
}

// =============================================================================
// Bulk delete state
// =============================================================================

export interface BulkDeleteState {
  selectedIds: Set<number>
  isDeleting: boolean
  progress: {
    current: number
    total: number
    currentScan?: string
  }
}

// =============================================================================
// Delete mode
// =============================================================================

export type DeleteMode = 'permanent'
// Future: 'archive' for soft-delete when schema supports it

// =============================================================================
// Delete confirmation props
// =============================================================================

export interface DeleteConfirmProps {
  scansId: number
  target: string
  onConfirm: () => void
  onCancel: () => void
  isLoading?: boolean
}

export interface BulkDeleteConfirmProps {
  scanIds: number[]
  scans: Array<{ scansId: number; target: string }>
  onConfirm: () => void
  onCancel: () => void
  isLoading?: boolean
}
