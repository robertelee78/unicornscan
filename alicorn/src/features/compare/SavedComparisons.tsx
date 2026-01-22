/**
 * SavedComparisons - List of bookmarked scan comparisons
 *
 * Displays a table of saved comparisons with:
 * - Note/description
 * - Scan count and IDs
 * - Target information
 * - Created/updated dates
 * - Actions (View, Delete)
 *
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Trash2, Loader2, Bookmark, Calendar, Target, Hash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useSavedComparisons } from './hooks/useSavedComparisons'
import type { SavedComparison } from './types'
import { useToast } from '@/features/toast'

// =============================================================================
// Types
// =============================================================================

interface SavedComparisonsProps {
  /** Optional CSS class */
  className?: string
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format ISO date string for display
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(isoDate)
}

// =============================================================================
// Empty State Component
// =============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Bookmark className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No Saved Comparisons</h3>
      <p className="text-muted-foreground max-w-md">
        When you compare scans and add notes, they will be saved here automatically.
        Select scans from the All Scans tab and click Compare to get started.
      </p>
    </div>
  )
}

// =============================================================================
// Comparison Row Component
// =============================================================================

interface ComparisonRowProps {
  comparison: SavedComparison
  onView: (comparison: SavedComparison) => void
  onDelete: (comparison: SavedComparison) => void
}

function ComparisonRow({ comparison, onView, onDelete }: ComparisonRowProps) {
  return (
    <TableRow className="hover:bg-muted/50">
      {/* Note column */}
      <TableCell className="font-medium max-w-[300px]">
        <div className="truncate" title={comparison.note || 'No note'}>
          {comparison.note || (
            <span className="text-muted-foreground italic">No note</span>
          )}
        </div>
      </TableCell>

      {/* Scans column */}
      <TableCell>
        <div className="flex items-center gap-2">
          <Hash className="h-3.5 w-3.5 text-muted-foreground" />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help">
                  {comparison.scanIds.length} scans
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Scan IDs: {comparison.scanIds.join(', ')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </TableCell>

      {/* Target column */}
      <TableCell>
        {comparison.targetStr ? (
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <Badge variant="outline" className="font-mono text-xs">
              {comparison.targetStr}
            </Badge>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>

      {/* Mode column */}
      <TableCell>
        {comparison.modeStr ? (
          <Badge variant="secondary" className="text-xs">
            {comparison.modeStr}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>

      {/* Created column */}
      <TableCell>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-sm">
                  {formatRelativeTime(comparison.createdAt)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Created: {formatDate(comparison.createdAt)}</p>
                {comparison.updatedAt !== comparison.createdAt && (
                  <p>Updated: {formatDate(comparison.updatedAt)}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </TableCell>

      {/* Actions column */}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onView(comparison)}
                  className="h-8 w-8 p-0"
                >
                  <Eye className="h-4 w-4" />
                  <span className="sr-only">View comparison</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View comparison</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(comparison)}
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Delete comparison</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete comparison</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </TableCell>
    </TableRow>
  )
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * SavedComparisons - Display and manage saved scan comparisons
 *
 * @example
 * ```tsx
 * <SavedComparisons className="mt-4" />
 * ```
 */
export function SavedComparisons({ className }: SavedComparisonsProps) {
  const navigate = useNavigate()
  const { data: comparisons, isLoading, remove, isMutating } = useSavedComparisons()
  const { info, error: showError } = useToast()

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<SavedComparison | null>(null)

  // Handle view - navigate to comparison page
  const handleView = useCallback(
    (comparison: SavedComparison) => {
      const idsParam = comparison.scanIds.join(',')
      navigate(`/scans/compare?ids=${idsParam}`)
    },
    [navigate]
  )

  // Handle delete click - show confirmation
  const handleDeleteClick = useCallback((comparison: SavedComparison) => {
    setDeleteTarget(comparison)
  }, [])

  // Handle confirm delete
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return

    try {
      await remove(deleteTarget.id)
      info('Comparison deleted', 'Removed from saved comparisons')
    } catch (err) {
      showError(
        'Delete failed',
        err instanceof Error ? err.message : 'Unknown error'
      )
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget, remove, info, showError])

  // Handle cancel delete
  const handleCancelDelete = useCallback(() => {
    setDeleteTarget(null)
  }, [])

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Empty state
  if (comparisons.length === 0) {
    return (
      <div className={className}>
        <EmptyState />
      </div>
    )
  }

  return (
    <div className={className}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">Note</TableHead>
            <TableHead className="w-[100px]">Scans</TableHead>
            <TableHead className="w-[150px]">Target</TableHead>
            <TableHead className="w-[100px]">Mode</TableHead>
            <TableHead className="w-[120px]">Created</TableHead>
            <TableHead className="w-[80px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {comparisons.map((comparison) => (
            <ComparisonRow
              key={comparison.id}
              comparison={comparison}
              onView={handleView}
              onDelete={handleDeleteClick}
            />
          ))}
        </TableBody>
      </Table>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && handleCancelDelete()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Saved Comparison?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this comparison from your saved list.
              {deleteTarget?.note && (
                <span className="block mt-2 font-medium text-foreground">
                  &quot;{deleteTarget.note}&quot;
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete} disabled={isMutating}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isMutating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isMutating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
