/**
 * Delete confirmation dialog with cascading delete warning
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { AlertTriangle, Trash2, Loader2 } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { formatTimestamp } from '@/lib/utils'
import { useScanDeleteStats } from './hooks'
import type { ScanDeleteStats } from './types'

// =============================================================================
// Single scan delete dialog
// =============================================================================

interface DeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scan_id: number
  onConfirm: () => void
  isDeleting?: boolean
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  scan_id,
  onConfirm,
  isDeleting = false,
}: DeleteConfirmDialogProps) {
  const { data: stats, isLoading: statsLoading } = useScanDeleteStats(open ? scan_id : null)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Scan #{scan_id}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                This action cannot be undone. The scan and all associated data will be permanently deleted.
              </p>

              {statsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading scan details...
                </div>
              ) : stats ? (
                <ScanDeleteSummary stats={stats} />
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            disabled={isDeleting || statsLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Scan
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// =============================================================================
// Bulk delete dialog
// =============================================================================

interface BulkDeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scan_ids: number[]
  onConfirm: () => void
  isDeleting?: boolean
  progress?: {
    current: number
    total: number
    currentScan?: string
  }
}

export function BulkDeleteConfirmDialog({
  open,
  onOpenChange,
  scan_ids,
  onConfirm,
  isDeleting = false,
  progress,
}: BulkDeleteConfirmDialogProps) {
  const count = scan_ids.length

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete {count} Scan{count !== 1 ? 's' : ''}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                You are about to delete <strong>{count}</strong> scan{count !== 1 ? 's' : ''} and all their associated data.
                This action cannot be undone.
              </p>

              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive font-medium">
                  Warning: This will permanently delete:
                </p>
                <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside space-y-1">
                  <li>All port scan results</li>
                  <li>All ARP discovery data</li>
                  <li>All traceroute/hop data</li>
                  <li>All notes and tags</li>
                  <li>All GeoIP records</li>
                </ul>
              </div>

              {isDeleting && progress && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Deleting...</span>
                    <span>{progress.current} of {progress.total}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-destructive h-2 rounded-full transition-all"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                  {progress.currentScan && (
                    <p className="text-xs text-muted-foreground truncate">
                      Current: {progress.currentScan}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-1">
                {scan_ids.slice(0, 10).map((id) => (
                  <Badge key={id} variant="secondary" className="text-xs">
                    #{id}
                  </Badge>
                ))}
                {scan_ids.length > 10 && (
                  <Badge variant="outline" className="text-xs">
                    +{scan_ids.length - 10} more
                  </Badge>
                )}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete {count} Scan{count !== 1 ? 's' : ''}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// =============================================================================
// Scan delete summary (shows what will be deleted)
// =============================================================================

interface ScanDeleteSummaryProps {
  stats: ScanDeleteStats
}

function ScanDeleteSummary({ stats }: ScanDeleteSummaryProps) {
  const items = [
    { label: 'Port responses', count: stats.port_count },
    { label: 'Unique hosts', count: stats.host_count },
    { label: 'ARP records', count: stats.arp_count },
    { label: 'Traceroute hops', count: stats.hop_count },
    { label: 'Notes', count: stats.note_count },
    { label: 'Tags', count: stats.tag_count },
  ].filter((item) => item.count > 0)

  return (
    <div className="space-y-3">
      {/* Scan info */}
      <div className="p-3 rounded-md bg-muted/50 border">
        <p className="font-medium text-foreground">{stats.target}</p>
        <p className="text-xs text-muted-foreground mt-1">
          Scan #{stats.scan_id} - {formatTimestamp(stats.scan_time)}
        </p>
      </div>

      {/* What will be deleted */}
      {items.length > 0 && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive font-medium mb-2">
            The following data will be deleted:
          </p>
          <ul className="text-sm text-muted-foreground space-y-1">
            {items.map((item) => (
              <li key={item.label} className="flex justify-between">
                <span>{item.label}</span>
                <span className="font-mono">{item.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default DeleteConfirmDialog
