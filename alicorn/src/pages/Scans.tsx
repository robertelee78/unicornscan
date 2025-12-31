/**
 * Scans list page - thin wrapper over scans feature module
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ScanTable,
  ScanFilterBar,
  Pagination,
  useScanList,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  DEFAULT_PAGINATION,
  type ScanFilters,
  type SortState,
  type SortField,
  type PaginationState,
} from '@/features/scans'

export function Scans() {
  const [filters, setFilters] = useState<ScanFilters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)
  const [pagination, setPagination] = useState<PaginationState>(DEFAULT_PAGINATION)

  const { data: scans, total, isLoading, error } = useScanList(filters, sort, pagination)

  // Handle column header click for sorting
  const handleSort = useCallback((field: SortField) => {
    setSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
    }))
    // Reset to first page when sorting changes
    setPagination((prev) => ({ ...prev, page: 1 }))
  }, [])

  // Reset to first page when filters change
  const handleFilterChange = useCallback((newFilters: ScanFilters) => {
    setFilters(newFilters)
    setPagination((prev) => ({ ...prev, page: 1 }))
  }, [])

  if (error) {
    return (
      <div className="text-error">
        Error loading scans: {error.message}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Scans</h1>
        <p className="text-muted mt-1">Browse scan history</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Scan History</CardTitle>
          </div>
          <ScanFilterBar filters={filters} onChange={handleFilterChange} />
        </CardHeader>
        <CardContent className="space-y-4">
          <ScanTable
            scans={scans}
            sort={sort}
            onSort={handleSort}
            isLoading={isLoading}
          />
          <Pagination
            pagination={pagination}
            total={total}
            onChange={setPagination}
          />
        </CardContent>
      </Card>
    </div>
  )
}
