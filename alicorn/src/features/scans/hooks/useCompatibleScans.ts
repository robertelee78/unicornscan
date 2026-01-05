/**
 * Compatible scans filter hook
 * Filters scan list to only show scans compatible for comparison
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo } from 'react'
import type { ScanSummary } from '@/types/database'

export interface CompatibilityFilterCriteria {
  /** Target string being matched (e.g., "192.168.1.0/24") */
  targetStr: string | null
  /** Mode string being matched (e.g., "TCP SYN") */
  modeStr: string | null
}

export interface UseCompatibleScansResult {
  /** Filtered list of compatible scans */
  compatibleScans: ScanSummary[]
  /** True when a filter is active (base scan selected) */
  isFiltering: boolean
  /** The criteria being matched */
  filterCriteria: CompatibilityFilterCriteria | null
  /** Number of compatible scans */
  compatibleCount: number
  /** Number of scans filtered out (not compatible) */
  excludedCount: number
}

/**
 * Hook for filtering scans to only show those compatible for comparison.
 *
 * Compatibility is determined by matching both:
 * - target_str: Must be exactly the same target specification
 * - mode_str: Must be the same scan mode (TCP SYN, UDP, etc.)
 *
 * This ensures meaningful comparisons - comparing a TCP SYN scan of
 * 192.168.1.0/24 with a UDP scan of 10.0.0.0/8 would be meaningless.
 *
 * @param allScans - Full list of scans from the database
 * @param baseScanId - ID of the first selected scan (determines filter criteria)
 *
 * @example
 * ```tsx
 * const { compatibleScans, isFiltering, filterCriteria } = useCompatibleScans(
 *   allScans,
 *   selectedIds.size > 0 ? Array.from(selectedIds)[0] : null
 * )
 *
 * // Show filter chip when filtering
 * {isFiltering && (
 *   <FilterChip>
 *     Showing scans matching: {filterCriteria?.targetStr} ({filterCriteria?.modeStr})
 *   </FilterChip>
 * )}
 * ```
 */
export function useCompatibleScans(
  allScans: ScanSummary[],
  baseScanId: number | null
): UseCompatibleScansResult {
  // Find the base scan to extract filter criteria
  const baseScan = useMemo(() => {
    if (baseScanId === null) return null
    return allScans.find((s) => s.scan_id === baseScanId) || null
  }, [allScans, baseScanId])

  // Extract filter criteria from base scan
  const filterCriteria = useMemo<CompatibilityFilterCriteria | null>(() => {
    if (!baseScan) return null
    return {
      targetStr: baseScan.target_str,
      modeStr: baseScan.mode_str,
    }
  }, [baseScan])

  // Filter scans to only those with matching target_str AND mode_str
  const compatibleScans = useMemo(() => {
    // If no base scan, return all scans (no filtering)
    if (!baseScan || !filterCriteria) {
      return allScans
    }

    return allScans.filter((scan) => {
      // Both target_str and mode_str must match exactly
      const targetMatches = scan.target_str === filterCriteria.targetStr
      const modeMatches = scan.mode_str === filterCriteria.modeStr
      return targetMatches && modeMatches
    })
  }, [allScans, baseScan, filterCriteria])

  const isFiltering = baseScanId !== null && baseScan !== null

  return {
    compatibleScans,
    isFiltering,
    filterCriteria: isFiltering ? filterCriteria : null,
    compatibleCount: compatibleScans.length,
    excludedCount: isFiltering ? allScans.length - compatibleScans.length : 0,
  }
}
