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

export function useScanDeleteStats(scansId: number | null) {
  const db = getDatabase()

  return useQuery<ScanDeleteStats | null>({
    queryKey: ['scan-delete-stats', scansId],
    queryFn: () => (scansId ? db.getScanDeleteStats(scansId) : null),
    enabled: scansId !== null,
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
    mutationFn: async (scansId: number) => {
      const result = await db.deleteScan(scansId)
      if (!result.success) {
        throw new Error(result.error || 'Deletion failed')
      }
      return result
    },
    onSuccess: (result) => {
      // Invalidate all scan-related queries
      queryClient.invalidateQueries({ queryKey: ['scans'] })
      queryClient.invalidateQueries({ queryKey: ['scan', result.scansId] })
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
  onError?: (error: Error, scansId: number) => void
}) {
  const db = getDatabase()
  const queryClient = useQueryClient()
  const [state, setState] = useState<BulkDeleteState>({
    selectedIds: new Set(),
    isDeleting: false,
    progress: { current: 0, total: 0 },
  })

  const deleteScans = useCallback(async (scanIds: number[]) => {
    if (scanIds.length === 0) return []

    setState((prev) => ({
      ...prev,
      isDeleting: true,
      progress: { current: 0, total: scanIds.length },
    }))

    const results: DeleteScanResult[] = []

    for (let i = 0; i < scanIds.length; i++) {
      const scanId = scanIds[i]

      try {
        // Get scan info for progress display
        const stats = await db.getScanDeleteStats(scanId)
        const currentTarget = stats?.target

        setState((prev) => ({
          ...prev,
          progress: { current: i, total: scanIds.length, currentScan: currentTarget },
        }))
        options?.onProgress?.(i, scanIds.length, currentTarget)

        const result = await db.deleteScan(scanId)
        results.push(result)

        if (!result.success) {
          options?.onError?.(new Error(result.error || 'Deletion failed'), scanId)
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error')
        options?.onError?.(error, scanId)
        results.push({
          success: false,
          scansId: scanId,
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
      progress: { current: scanIds.length, total: scanIds.length },
    }))

    // Invalidate all scan-related queries
    queryClient.invalidateQueries({ queryKey: ['scans'] })
    queryClient.invalidateQueries({ queryKey: ['scan-list'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['recent-scans'] })

    options?.onComplete?.(results)
    return results
  }, [db, queryClient, options])

  const toggleSelection = useCallback((scansId: number) => {
    setState((prev) => {
      const newSelected = new Set(prev.selectedIds)
      if (newSelected.has(scansId)) {
        newSelected.delete(scansId)
      } else {
        newSelected.add(scansId)
      }
      return { ...prev, selectedIds: newSelected }
    })
  }, [])

  const selectAll = useCallback((scanIds: number[]) => {
    setState((prev) => ({
      ...prev,
      selectedIds: new Set(scanIds),
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
    isSelected: (scansId: number) => state.selectedIds.has(scansId),
    selectedCount: state.selectedIds.size,
  }
}

// =============================================================================
// Session-based undo tracking (within browser session only)
// =============================================================================

interface DeletedScanRecord {
  scansId: number
  target: string
  deletedAt: number
  result: DeleteScanResult
}

const deletedScansHistory: DeletedScanRecord[] = []
const MAX_UNDO_HISTORY = 20
const UNDO_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

export function recordDeletion(result: DeleteScanResult, target: string): void {
  if (!result.success) return

  deletedScansHistory.unshift({
    scansId: result.scansId,
    target,
    deletedAt: Date.now(),
    result,
  })

  // Trim to max size
  while (deletedScansHistory.length > MAX_UNDO_HISTORY) {
    deletedScansHistory.pop()
  }
}

export function getRecentDeletions(): DeletedScanRecord[] {
  const cutoff = Date.now() - UNDO_WINDOW_MS
  return deletedScansHistory.filter((r) => r.deletedAt > cutoff)
}

export function clearDeletionHistory(): void {
  deletedScansHistory.length = 0
}

// Note: Actual undo (restore) would require database-level implementation
// For now, we just track what was deleted for informational purposes
