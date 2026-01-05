/**
 * Scans list page - thin wrapper over scans feature module
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback, useMemo } from 'react'
import { Trash2, X, Filter } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ScanTable,
  ScanFilterBar,
  Pagination,
  CompareActionBar,
  useScanList,
  useCompatibleScans,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  DEFAULT_PAGINATION,
  type ScanFilters,
  type SortState,
  type SortField,
  type PaginationState,
} from '@/features/scans'
import { ErrorFallback } from '@/components/error'
import {
  ExportDialog,
  ExportDropdown,
  useExportDialog,
  useScansListExport,
  type ExportFormat,
} from '@/features/export'
import {
  BulkDeleteConfirmDialog,
  useBulkScanDeletion,
} from '@/features/deletion'
import { useToast } from '@/features/toast'

export function Scans() {
  const [filters, setFilters] = useState<ScanFilters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)
  const [pagination, setPagination] = useState<PaginationState>(DEFAULT_PAGINATION)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const { success: toastSuccess, error: toastError } = useToast()

  const { data: scans, total, isLoading, error } = useScanList(filters, sort, pagination)

  // Get the first selected scan ID to use as the base for compatibility filtering
  const baseScanId = useMemo(() => {
    if (selectedIds.size === 0) return null
    // Get the first selected scan (the one that establishes filter criteria)
    return Array.from(selectedIds)[0]
  }, [selectedIds])

  // Filter scans to only show compatible ones when a scan is selected
  const { compatibleScans, isFiltering, filterCriteria } = useCompatibleScans(scans, baseScanId)

  // Use compatible scans when filtering, otherwise use all scans
  const displayedScans = isFiltering ? compatibleScans : scans

  // Export functionality
  const exportDialog = useExportDialog()
  const { exportScansList, isExporting } = useScansListExport(scans)

  // Bulk deletion functionality
  const {
    selectedIds,
    isDeleting,
    progress,
    deleteScans,
    toggleSelection,
    selectAll,
    clearSelection,
    selectedCount,
  } = useBulkScanDeletion({
    onComplete: (results) => {
      const successCount = results.filter((r) => r.success).length
      const failCount = results.length - successCount

      if (failCount === 0) {
        toastSuccess(
          'Scans deleted',
          `Successfully deleted ${successCount} scan${successCount !== 1 ? 's' : ''}.`
        )
      } else if (successCount > 0) {
        toastError(
          'Some deletions failed',
          `Deleted ${successCount} scan${successCount !== 1 ? 's' : ''}, but ${failCount} failed.`
        )
      } else {
        toastError('Deletion failed', 'Could not delete the selected scans.')
      }

      setBulkDeleteOpen(false)
    },
    onError: (error, scan_id) => {
      toastError(`Failed to delete scan #${scan_id}`, error.message)
    },
  })

  // Quick export handler
  const handleQuickExport = useCallback((format: ExportFormat) => {
    exportScansList({ ...exportDialog.options, format })
  }, [exportScansList, exportDialog.options])

  // Handle bulk delete
  const handleBulkDelete = useCallback(() => {
    setBulkDeleteOpen(true)
  }, [])

  const handleConfirmBulkDelete = useCallback(() => {
    deleteScans(Array.from(selectedIds))
  }, [deleteScans, selectedIds])

  // Handle select all (toggle)
  const handleSelectAll = useCallback((ids: number[]) => {
    if (ids.length === 0) {
      clearSelection()
    } else {
      selectAll(ids)
    }
  }, [clearSelection, selectAll])

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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Scans</h1>
          <p className="text-muted mt-1">Browse scan history</p>
        </div>
        <ErrorFallback
          error={error}
          resetError={() => window.location.reload()}
        />
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
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg">Scan History</CardTitle>
              {selectedCount > 0 && (
                <span className="text-sm text-muted-foreground">
                  {selectedCount} selected
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Bulk delete button (only when items selected) */}
              {selectedCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDelete}
                  className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete ({selectedCount})
                </Button>
              )}

              {/* Export dropdown */}
              <ExportDropdown
                onExport={handleQuickExport}
                onOpenDialog={exportDialog.openDialog}
                disabled={displayedScans.length === 0}
              />
            </div>
          </div>
          <ScanFilterBar filters={filters} onChange={handleFilterChange} />
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Compatibility filter chip - shown when filtering by first selected scan */}
          {isFiltering && filterCriteria && (
            <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
              <Filter className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm">
                Showing scans matching:{' '}
                <Badge variant="outline" className="mx-1">
                  {filterCriteria.targetStr || 'Unknown target'}
                </Badge>
                <Badge variant="secondary" className="mx-1">
                  {filterCriteria.modeStr || 'Unknown mode'}
                </Badge>
              </span>
              <span className="text-sm text-muted-foreground">
                ({displayedScans.length} compatible)
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 w-6 p-0"
                onClick={clearSelection}
                aria-label="Clear filter"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          <ScanTable
            scans={displayedScans}
            sort={sort}
            onSort={handleSort}
            isLoading={isLoading}
            selectedIds={selectedIds}
            onSelectionChange={toggleSelection}
            onSelectAll={handleSelectAll}
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
        context="scan-list"
        onExport={(options) => {
          exportScansList(options)
          exportDialog.closeDialog()
        }}
        isExporting={isExporting}
        filteredCount={displayedScans.length}
        totalCount={total}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <BulkDeleteConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        scan_ids={Array.from(selectedIds)}
        onConfirm={handleConfirmBulkDelete}
        isDeleting={isDeleting}
        progress={progress}
      />

      {/* Compare Action Bar - floating bar at bottom when 2+ scans selected */}
      <CompareActionBar
        selectedIds={selectedIds}
        selectedCount={selectedCount}
        canCompare={selectedCount >= 2}
        onClearSelection={clearSelection}
      />
    </div>
  )
}
