/**
 * Scan deletion types
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// =============================================================================
// Stats for confirmation dialog
// =============================================================================

export interface ScanDeleteStats {
  scan_id: number
  target: string
  scan_time: number
  port_count: number
  host_count: number
  arp_count: number
  hop_count: number
  note_count: number
  tag_count: number
}

// =============================================================================
// Delete operation result
// =============================================================================

export interface DeleteScanResult {
  success: boolean
  scan_id: number
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
  scan_id: number
  target: string
  onConfirm: () => void
  onCancel: () => void
  isLoading?: boolean
}

export interface BulkDeleteConfirmProps {
  scan_ids: number[]
  scans: Array<{ scan_id: number; target: string }>
  onConfirm: () => void
  onCancel: () => void
  isLoading?: boolean
}
