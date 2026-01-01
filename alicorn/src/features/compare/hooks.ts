/**
 * Scan comparison hooks
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { getDatabase } from '@/lib/database'
import type { ScanComparisonResult, ScanOption, CompareViewMode } from './types'
import { compareScans, parseCompareUrl } from './compare-utils'

const db = getDatabase()

// =============================================================================
// Query Keys
// =============================================================================

export const compareKeys = {
  all: ['compare'] as const,
  comparison: (scanAId: number, scanBId: number) =>
    [...compareKeys.all, 'comparison', scanAId, scanBId] as const,
  options: () => [...compareKeys.all, 'options'] as const,
}

// =============================================================================
// Scan Options Hook
// =============================================================================

export function useScanOptions() {
  return useQuery({
    queryKey: compareKeys.options(),
    queryFn: async (): Promise<ScanOption[]> => {
      const scans = await db.getScans({ limit: 200 })
      return scans.map((s) => ({
        scansId: s.scans_id,
        label: `Scan #${s.scans_id}`,
        targetStr: s.target_str,
        time: s.s_time,
      }))
    },
    staleTime: 60000,
  })
}

// =============================================================================
// Scan Comparison Hook
// =============================================================================

export function useScanComparison(scanAId: number | undefined, scanBId: number | undefined) {
  return useQuery({
    queryKey: compareKeys.comparison(scanAId ?? 0, scanBId ?? 0),
    queryFn: async (): Promise<ScanComparisonResult | null> => {
      if (!scanAId || !scanBId) return null

      // Fetch both scans and their reports in parallel
      const [scanA, scanB, reportsA, reportsB] = await Promise.all([
        db.getScan(scanAId),
        db.getScan(scanBId),
        db.getIpReports(scanAId),
        db.getIpReports(scanBId),
      ])

      if (!scanA || !scanB) return null

      return compareScans(scanA, scanB, reportsA, reportsB)
    },
    enabled: !!scanAId && !!scanBId && scanAId !== scanBId,
    staleTime: 30000,
  })
}

// =============================================================================
// URL State Hook
// =============================================================================

export function useCompareUrlState() {
  const [searchParams, setSearchParams] = useSearchParams()

  const { scanA, scanB } = useMemo(
    () => parseCompareUrl(searchParams),
    [searchParams]
  )

  const setScanA = (id: number | undefined) => {
    const newParams = new URLSearchParams(searchParams)
    if (id !== undefined) {
      newParams.set('a', id.toString())
    } else {
      newParams.delete('a')
    }
    setSearchParams(newParams)
  }

  const setScanB = (id: number | undefined) => {
    const newParams = new URLSearchParams(searchParams)
    if (id !== undefined) {
      newParams.set('b', id.toString())
    } else {
      newParams.delete('b')
    }
    setSearchParams(newParams)
  }

  const setScans = (aId: number | undefined, bId: number | undefined) => {
    const newParams = new URLSearchParams()
    if (aId !== undefined) newParams.set('a', aId.toString())
    if (bId !== undefined) newParams.set('b', bId.toString())
    setSearchParams(newParams)
  }

  const clearScans = () => {
    setSearchParams(new URLSearchParams())
  }

  const viewMode: CompareViewMode = (scanA && scanB) ? 'comparison' : 'matrix'

  return {
    scanA,
    scanB,
    setScanA,
    setScanB,
    setScans,
    clearScans,
    viewMode,
  }
}
