/**
 * Scan selection hook for comparison workflow
 * Manages selection state for comparing multiple scans
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback, useMemo } from 'react'

export interface ScanSelectionState {
  selectedIds: Set<number>
}

export interface UseScanSelectionResult {
  /** Set of currently selected scan IDs */
  selectedIds: Set<number>
  /** Number of currently selected scans */
  selectedCount: number
  /** True when 2 or more scans are selected (minimum for comparison) */
  canCompare: boolean
  /** Toggle selection of a single scan */
  toggleSelection: (scanId: number) => void
  /** Select all given scan IDs (replaces current selection) */
  selectAll: (scanIds: number[]) => void
  /** Clear all selections */
  clearSelection: () => void
  /** Check if a specific scan is selected */
  isSelected: (scanId: number) => boolean
}

/**
 * Hook for managing scan selection state in the comparison workflow.
 *
 * Unlike bulk deletion, this hook is focused purely on selection state
 * without any mutation logic. It tracks which scans are selected for
 * comparison and provides utilities to manipulate the selection.
 *
 * @example
 * ```tsx
 * const { selectedIds, toggleSelection, canCompare } = useScanSelection()
 *
 * // In table row
 * <Checkbox
 *   checked={selectedIds.has(scan.id)}
 *   onChange={() => toggleSelection(scan.id)}
 * />
 *
 * // Compare button
 * <Button disabled={!canCompare}>Compare Selected</Button>
 * ```
 */
export function useScanSelection(): UseScanSelectionResult {
  const [state, setState] = useState<ScanSelectionState>({
    selectedIds: new Set(),
  })

  const toggleSelection = useCallback((scanId: number) => {
    setState((prev) => {
      const newSelected = new Set(prev.selectedIds)
      if (newSelected.has(scanId)) {
        newSelected.delete(scanId)
      } else {
        newSelected.add(scanId)
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

  const isSelected = useCallback(
    (scanId: number) => state.selectedIds.has(scanId),
    [state.selectedIds]
  )

  const selectedCount = useMemo(
    () => state.selectedIds.size,
    [state.selectedIds]
  )

  const canCompare = useMemo(
    () => state.selectedIds.size >= 2,
    [state.selectedIds]
  )

  return {
    selectedIds: state.selectedIds,
    selectedCount,
    canCompare,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
  }
}
