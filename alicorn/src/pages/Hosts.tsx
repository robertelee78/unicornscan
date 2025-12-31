/**
 * Hosts list page - thin wrapper over hosts feature module
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  HostTable,
  HostFilterBar,
  Pagination,
  useHostList,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  DEFAULT_PAGINATION,
  type HostFilters,
  type SortState,
  type SortField,
  type PaginationState,
} from '@/features/hosts'
import {
  ExportDialog,
  ExportDropdown,
  useExportDialog,
  useHostsListExport,
  type ExportFormat,
} from '@/features/export'

export function Hosts() {
  const [filters, setFilters] = useState<HostFilters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)
  const [pagination, setPagination] = useState<PaginationState>(DEFAULT_PAGINATION)

  const { data: hosts, total, isLoading, error } = useHostList(filters, sort, pagination)

  // Export functionality
  const exportDialog = useExportDialog()
  const { exportHostsList, isExporting } = useHostsListExport(hosts)

  // Quick export handler
  const handleQuickExport = useCallback((format: ExportFormat) => {
    exportHostsList({ ...exportDialog.options, format })
  }, [exportHostsList, exportDialog.options])

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
  const handleFilterChange = useCallback((newFilters: HostFilters) => {
    setFilters(newFilters)
    setPagination((prev) => ({ ...prev, page: 1 }))
  }, [])

  if (error) {
    return (
      <div className="text-error">
        Error loading hosts: {error.message}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hosts</h1>
        <p className="text-muted mt-1">Discovered hosts across all scans</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Host Inventory</CardTitle>
            <ExportDropdown
              onExport={handleQuickExport}
              onOpenDialog={exportDialog.openDialog}
              disabled={hosts.length === 0}
            />
          </div>
          <HostFilterBar filters={filters} onChange={handleFilterChange} />
        </CardHeader>
        <CardContent className="space-y-4">
          <HostTable
            hosts={hosts}
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

      {/* Export Dialog */}
      <ExportDialog
        open={exportDialog.isOpen}
        onOpenChange={(open) => !open && exportDialog.closeDialog()}
        context="host-list"
        onExport={(options) => {
          exportHostsList(options)
          exportDialog.closeDialog()
        }}
        isExporting={isExporting}
        filteredCount={hosts.length}
        totalCount={total}
      />
    </div>
  )
}
