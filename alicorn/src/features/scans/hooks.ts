/**
 * Scans feature hooks with server-side pagination
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getDatabase, type FilteredScansOptions } from '@/lib/database'
import type { ScanSummary } from '@/types/database'
import type { ScanFilters, SortState, PaginationState } from './types'

const db = getDatabase()

// =============================================================================
// Query Keys
// =============================================================================

export const scanListKeys = {
  all: ['scanList'] as const,
  filtered: (options: FilteredScansOptions) => [...scanListKeys.all, 'filtered', options] as const,
  profiles: () => [...scanListKeys.all, 'profiles'] as const,
  modes: () => [...scanListKeys.all, 'modes'] as const,
}

// =============================================================================
// Hooks
// =============================================================================

interface UseScanListResult {
  data: ScanSummary[]
  total: number
  isLoading: boolean
  error: Error | null
}

export function useScanList(
  filters: ScanFilters,
  sort: SortState,
  pagination: PaginationState
): UseScanListResult {
  // Convert to FilteredScansOptions
  const options: FilteredScansOptions = useMemo(() => ({
    search: filters.search || undefined,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    profiles: filters.profiles.length > 0 ? filters.profiles : undefined,
    modes: filters.modes.length > 0 ? filters.modes : undefined,
    sortField: sort.field === 'host_count' || sort.field === 'port_count' || sort.field === 'duration'
      ? 's_time'  // Fall back for fields not supported server-side
      : sort.field,
    sortDirection: sort.direction,
    offset: (pagination.page - 1) * pagination.pageSize,
    limit: pagination.pageSize,
  }), [filters, sort, pagination])

  const { data, isLoading, error } = useQuery({
    queryKey: scanListKeys.filtered(options),
    queryFn: () => db.getFilteredScans(options),
    staleTime: 30000,
  })

  return {
    data: data?.data || [],
    total: data?.total || 0,
    isLoading,
    error: error as Error | null,
  }
}

export function useAvailableProfiles() {
  const { data: result } = useQuery({
    queryKey: scanListKeys.profiles(),
    queryFn: () => db.getFilteredScans({ limit: 1000 }),
    staleTime: 60000,
  })

  return useMemo(() => {
    if (!result?.data) return []
    return [...new Set(result.data.map((s) => s.profile))].sort()
  }, [result])
}

export function useAvailableModes() {
  const { data: result } = useQuery({
    queryKey: scanListKeys.modes(),
    queryFn: () => db.getFilteredScans({ limit: 1000 }),
    staleTime: 60000,
  })

  return useMemo(() => {
    if (!result?.data) return []
    return [...new Set(result.data.map((s) => s.mode_str).filter(Boolean) as string[])].sort()
  }, [result])
}
