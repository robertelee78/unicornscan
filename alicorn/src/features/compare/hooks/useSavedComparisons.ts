/**
 * useSavedComparisons - Hook for CRUD operations on saved comparisons
 *
 * Provides localStorage-based persistence for saved scan comparisons.
 * Uses React Query for caching and cache invalidation.
 *
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { SavedComparison } from '../types'

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'alicorn_saved_comparisons'

// =============================================================================
// Query Keys
// =============================================================================

export const savedCompareKeys = {
  all: ['saved-comparisons'] as const,
  list: () => [...savedCompareKeys.all, 'list'] as const,
  detail: (id: string) => [...savedCompareKeys.all, 'detail', id] as const,
  byScanIds: (scanIds: number[]) =>
    [...savedCompareKeys.all, 'by-scan-ids', scanIds.sort().join(',')] as const,
}

// =============================================================================
// Storage Functions
// =============================================================================

/**
 * Get all saved comparisons from localStorage
 */
function getStoredComparisons(): SavedComparison[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    console.error('Failed to parse saved comparisons from localStorage')
    return []
  }
}

/**
 * Save all comparisons to localStorage
 */
function setStoredComparisons(comparisons: SavedComparison[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(comparisons))
  } catch (e) {
    console.error('Failed to save comparisons to localStorage:', e)
    throw new Error('Failed to save comparison. Storage may be full.')
  }
}

/**
 * Generate a UUID for new comparisons
 */
function generateId(): string {
  return crypto.randomUUID()
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get all saved comparisons
 */
async function getSavedComparisons(): Promise<SavedComparison[]> {
  return getStoredComparisons()
}

/**
 * Find a saved comparison by scan IDs
 */
async function getSavedComparisonByScanIds(
  scanIds: number[]
): Promise<SavedComparison | null> {
  const all = getStoredComparisons()
  const sortedIds = [...scanIds].sort((a, b) => a - b)
  return (
    all.find((c) => {
      const cSorted = [...c.scanIds].sort((a, b) => a - b)
      if (cSorted.length !== sortedIds.length) return false
      return cSorted.every((id, i) => id === sortedIds[i])
    }) ?? null
  )
}

/**
 * Save a new comparison
 */
interface SaveComparisonInput {
  scanIds: number[]
  note: string
  targetStr?: string
  modeStr?: string
}

async function saveComparison(input: SaveComparisonInput): Promise<SavedComparison> {
  const all = getStoredComparisons()

  // Check if comparison with these scan IDs already exists
  const sortedIds = [...input.scanIds].sort((a, b) => a - b)
  const existing = all.find((c) => {
    const cSorted = [...c.scanIds].sort((a, b) => a - b)
    if (cSorted.length !== sortedIds.length) return false
    return cSorted.every((id, i) => id === sortedIds[i])
  })

  if (existing) {
    // Update existing instead of creating duplicate
    const updated: SavedComparison = {
      ...existing,
      note: input.note,
      updatedAt: new Date().toISOString(),
    }
    const newAll = all.map((c) => (c.id === existing.id ? updated : c))
    setStoredComparisons(newAll)
    return updated
  }

  // Create new comparison
  const now = new Date().toISOString()
  const comparison: SavedComparison = {
    id: generateId(),
    scanIds: input.scanIds,
    note: input.note,
    targetStr: input.targetStr,
    modeStr: input.modeStr,
    createdAt: now,
    updatedAt: now,
  }

  setStoredComparisons([comparison, ...all])
  return comparison
}

/**
 * Update an existing comparison's note
 */
interface UpdateComparisonInput {
  id: string
  note: string
}

async function updateComparison(
  input: UpdateComparisonInput
): Promise<SavedComparison> {
  const all = getStoredComparisons()
  const index = all.findIndex((c) => c.id === input.id)

  if (index === -1) {
    throw new Error(`Comparison with id ${input.id} not found`)
  }

  const updated: SavedComparison = {
    ...all[index],
    note: input.note,
    updatedAt: new Date().toISOString(),
  }

  const newAll = [...all]
  newAll[index] = updated
  setStoredComparisons(newAll)

  return updated
}

/**
 * Delete a saved comparison
 */
async function deleteComparison(id: string): Promise<void> {
  const all = getStoredComparisons()
  const filtered = all.filter((c) => c.id !== id)

  if (filtered.length === all.length) {
    throw new Error(`Comparison with id ${id} not found`)
  }

  setStoredComparisons(filtered)
}

// =============================================================================
// Hooks
// =============================================================================

export interface UseSavedComparisonsResult {
  /** List of all saved comparisons */
  data: SavedComparison[]
  /** Loading state */
  isLoading: boolean
  /** Error state */
  isError: boolean
  /** Error object if any */
  error: Error | null
  /** Save a new comparison (or update if same scanIds exist) */
  save: (input: SaveComparisonInput) => Promise<SavedComparison>
  /** Update an existing comparison's note */
  update: (input: UpdateComparisonInput) => Promise<SavedComparison>
  /** Delete a comparison by ID */
  remove: (id: string) => Promise<void>
  /** Check if mutations are in progress */
  isMutating: boolean
}

/**
 * Hook for managing saved comparisons
 *
 * Provides CRUD operations with React Query caching.
 *
 * @example
 * ```tsx
 * const { data, save, remove, isLoading } = useSavedComparisons()
 *
 * // Save a new comparison
 * await save({ scanIds: [1, 2, 3], note: 'Initial network scan' })
 *
 * // Update a comparison's note
 * await update({ id: 'abc-123', note: 'Updated note' })
 *
 * // Delete a comparison
 * await remove('abc-123')
 * ```
 */
export function useSavedComparisons(): UseSavedComparisonsResult {
  const queryClient = useQueryClient()

  // Query for list of saved comparisons
  const query = useQuery({
    queryKey: savedCompareKeys.list(),
    queryFn: getSavedComparisons,
    staleTime: 0, // Always fresh from localStorage
  })

  // Mutation for saving
  const saveMutation = useMutation({
    mutationFn: saveComparison,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedCompareKeys.all })
    },
  })

  // Mutation for updating
  const updateMutation = useMutation({
    mutationFn: updateComparison,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedCompareKeys.all })
    },
  })

  // Mutation for deleting
  const deleteMutation = useMutation({
    mutationFn: deleteComparison,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedCompareKeys.all })
    },
  })

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    save: saveMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    remove: deleteMutation.mutateAsync,
    isMutating:
      saveMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending,
  }
}

/**
 * Hook to get a saved comparison by scan IDs
 *
 * Useful for checking if current comparison is already saved.
 *
 * @param scanIds - Array of scan IDs to look up
 * @returns The saved comparison if found, null otherwise
 */
export function useSavedComparisonByScanIds(scanIds: number[]) {
  return useQuery({
    queryKey: savedCompareKeys.byScanIds(scanIds),
    queryFn: () => getSavedComparisonByScanIds(scanIds),
    enabled: scanIds.length >= 2,
    staleTime: 0,
  })
}
