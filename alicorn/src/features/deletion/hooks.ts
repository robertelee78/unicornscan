/**
 * Scan deletion hooks
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDatabase } from '@/lib/database'
import type { ScanDeleteStats, DeleteScanResult, BulkDeleteState } from './types'

// =============================================================================
// Get scan stats for deletion confirmation
// =============================================================================

export function useScanDeleteStats(scan_id: number | null) {
  const db = getDatabase()

  return useQuery<ScanDeleteStats | null>({
    queryKey: ['scan-delete-stats', scan_id],
    queryFn: () => (scan_id ? db.getScanDeleteStats(scan_id) : null),
    enabled: scan_id !== null,
    staleTime: 30_000, // 30 seconds
  })
}

// =============================================================================
// Single scan deletion
// =============================================================================

export function useScanDeletion(options?: {
  onSuccess?: (result: DeleteScanResult) => void
  onError?: (error: Error) => void
}) {
  const db = getDatabase()
  const queryClient = useQueryClient()

  return useMutation<DeleteScanResult, Error, number>({
    mutationFn: async (scan_id: number) => {
      const result = await db.deleteScan(scan_id)
      if (!result.success) {
        throw new Error(result.error || 'Deletion failed')
      }
      return result
    },
    onSuccess: (result) => {
      // Invalidate all scan-related queries
      queryClient.invalidateQueries({ queryKey: ['scans'] })
      queryClient.invalidateQueries({ queryKey: ['scan', result.scan_id] })
      queryClient.invalidateQueries({ queryKey: ['scan-list'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['recent-scans'] })
      options?.onSuccess?.(result)
    },
    onError: options?.onError,
  })
}

// =============================================================================
// Bulk scan deletion
// =============================================================================

export function useBulkScanDeletion(options?: {
  onProgress?: (current: number, total: number, currentTarget?: string) => void
  onComplete?: (results: DeleteScanResult[]) => void
  onError?: (error: Error, scan_id: number) => void
}) {
  const db = getDatabase()
  const queryClient = useQueryClient()
  const [state, setState] = useState<BulkDeleteState>({
    selectedIds: new Set(),
    isDeleting: false,
    progress: { current: 0, total: 0 },
  })

  const deleteScans = useCallback(async (scan_ids: number[]) => {
    if (scan_ids.length === 0) return []

    setState((prev) => ({
      ...prev,
      isDeleting: true,
      progress: { current: 0, total: scan_ids.length },
    }))

    const results: DeleteScanResult[] = []

    for (let i = 0; i < scan_ids.length; i++) {
      const scan_id = scan_ids[i]

      try {
        // Get scan info for progress display
        const stats = await db.getScanDeleteStats(scan_id)
        const currentTarget = stats?.target

        setState((prev) => ({
          ...prev,
          progress: { current: i, total: scan_ids.length, currentScan: currentTarget },
        }))
        options?.onProgress?.(i, scan_ids.length, currentTarget)

        const result = await db.deleteScan(scan_id)
        results.push(result)

        if (!result.success) {
          options?.onError?.(new Error(result.error || 'Deletion failed'), scan_id)
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error')
        options?.onError?.(error, scan_id)
        results.push({
          success: false,
          scan_id: scan_id,
          deleted: { reports: 0, arp: 0, hops: 0, notes: 0, tags: 0 },
          error: error.message,
        })
      }
    }

    // Update state and invalidate queries
    setState((prev) => ({
      ...prev,
      isDeleting: false,
      selectedIds: new Set(),
      progress: { current: scan_ids.length, total: scan_ids.length },
    }))

    // Invalidate all scan-related queries
    queryClient.invalidateQueries({ queryKey: ['scans'] })
    queryClient.invalidateQueries({ queryKey: ['scan-list'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['recent-scans'] })

    options?.onComplete?.(results)
    return results
  }, [db, queryClient, options])

  const toggleSelection = useCallback((scan_id: number) => {
    setState((prev) => {
      const newSelected = new Set(prev.selectedIds)
      if (newSelected.has(scan_id)) {
        newSelected.delete(scan_id)
      } else {
        newSelected.add(scan_id)
      }
      return { ...prev, selectedIds: newSelected }
    })
  }, [])

  const selectAll = useCallback((scan_ids: number[]) => {
    setState((prev) => ({
      ...prev,
      selectedIds: new Set(scan_ids),
    }))
  }, [])

  const clearSelection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedIds: new Set(),
    }))
  }, [])

  return {
    ...state,
    deleteScans,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected: (scan_id: number) => state.selectedIds.has(scan_id),
    selectedCount: state.selectedIds.size,
  }
}

// =============================================================================
// Session-based undo tracking (within browser session only)
// =============================================================================

interface DeletedScanRecord {
  scan_id: number
  target: string
  deleted_at: number
  result: DeleteScanResult
}

const deleted_scans_history: DeletedScanRecord[] = []
const MAX_UNDO_HISTORY = 20
const UNDO_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

export function recordDeletion(result: DeleteScanResult, target: string): void {
  if (!result.success) return

  deleted_scans_history.unshift({
    scan_id: result.scan_id,
    target,
    deleted_at: Date.now(),
    result,
  })

  // Trim to max size
  while (deleted_scans_history.length > MAX_UNDO_HISTORY) {
    deleted_scans_history.pop()
  }
}

export function getRecentDeletions(): DeletedScanRecord[] {
  const cutoff = Date.now() - UNDO_WINDOW_MS
  return deleted_scans_history.filter((r) => r.deleted_at > cutoff)
}

export function clearDeletionHistory(): void {
  deleted_scans_history.length = 0
}

// Note: Actual undo (restore) would require database-level implementation
// For now, we just track what was deleted for informational purposes
