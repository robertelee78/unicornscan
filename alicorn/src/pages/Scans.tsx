/**
 * Scans list page - thin wrapper over scans feature module
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
  const [showSelection, setShowSelection] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const { success: toastSuccess, error: toastError } = useToast()

  const { data: scans, total, isLoading, error } = useScanList(filters, sort, pagination)

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
      setShowSelection(false)
    },
    onError: (error, scan_id) => {
      toastError(`Failed to delete scan #${scan_id}`, error.message)
    },
  })

  // Quick export handler
  const handleQuickExport = useCallback((format: ExportFormat) => {
    exportScansList({ ...exportDialog.options, format })
  }, [exportScansList, exportDialog.options])

  // Toggle selection mode
  const handleToggleSelection = useCallback(() => {
    if (showSelection) {
      clearSelection()
    }
    setShowSelection((prev) => !prev)
  }, [showSelection, clearSelection])

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
              {showSelection && selectedCount > 0 && (
                <span className="text-sm text-muted-foreground">
                  {selectedCount} selected
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Selection mode toggle */}
              <Button
                variant={showSelection ? 'secondary' : 'outline'}
                size="sm"
                onClick={handleToggleSelection}
              >
                {showSelection ? 'Cancel' : 'Select'}
              </Button>

              {/* Bulk delete button (only when items selected) */}
              {showSelection && selectedCount > 0 && (
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
                disabled={scans.length === 0}
              />
            </div>
          </div>
          <ScanFilterBar filters={filters} onChange={handleFilterChange} />
        </CardHeader>
        <CardContent className="space-y-4">
          <ScanTable
            scans={scans}
            sort={sort}
            onSort={handleSort}
            isLoading={isLoading}
            showSelection={showSelection}
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
        filteredCount={scans.length}
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
    </div>
  )
}
