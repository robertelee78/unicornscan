/**
 * Scan Comparison page - hosts the comparison dashboard
 * Parses ?ids=1,2,3 query parameter to get selected scan IDs
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  ComparisonDashboard,
  ComparisonHeader,
  useMultiScanComparison,
  useSavedComparisons,
  useSavedComparisonByScanIds,
  exportMultiScanToCSV,
  downloadCSV,
  exportMultiScanToJSON,
  downloadJSON,
  exportMultiScanToMarkdown,
  downloadMarkdown,
  type ExportFormat,
} from '@/features/compare'
import { useToast } from '@/features/toast'

// =============================================================================
// Constants
// =============================================================================

const DEBOUNCE_DELAY_MS = 500

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse and validate scan IDs from URL query parameter
 * Returns array of valid numeric IDs, or empty array if invalid
 */
function parseIdsParam(idsParam: string | null): number[] {
  if (!idsParam) return []

  const ids = idsParam
    .split(',')
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !isNaN(id) && id > 0)

  // Return unique IDs only
  return [...new Set(ids)]
}

// =============================================================================
// Page Component
// =============================================================================

/**
 * Scan Comparison page component
 *
 * URL format: /scans/compare?ids=1,2,3
 *
 * Validates that:
 * - At least 2 scan IDs are provided
 * - All IDs are valid positive integers
 *
 * Features:
 * - Auto-saves comparison when note is added (debounced 500ms)
 * - Prompts before removing bookmark when note is cleared
 */
export function ScansCompare() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // Parse scan IDs from URL
  const scanIds = useMemo(() => {
    return parseIdsParam(searchParams.get('ids'))
  }, [searchParams])

  // Validate we have enough scans to compare
  const hasEnoughScans = scanIds.length >= 2

  // Toast notifications
  const { info, error: showError } = useToast()

  // Fetch comparison data for exports
  const { data: comparisonData } = useMultiScanComparison(scanIds)

  // Saved comparison hooks
  const { save, remove, isMutating } = useSavedComparisons()
  const { data: existingSaved } = useSavedComparisonByScanIds(scanIds)

  // Note and bookmark state
  const [note, setNote] = useState('')
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [showRemoveDialog, setShowRemoveDialog] = useState(false)

  // Track if user is currently editing (for debounce)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingNoteRef = useRef<string | null>(null)

  // Initialize state from existing saved comparison
  useEffect(() => {
    if (existingSaved) {
      setNote(existingSaved.note)
      setIsBookmarked(true)
    }
  }, [existingSaved])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Debounced save function
  const debouncedSave = useCallback(
    (newNote: string) => {
      // Clear any existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      pendingNoteRef.current = newNote

      debounceTimerRef.current = setTimeout(async () => {
        if (pendingNoteRef.current && pendingNoteRef.current.trim()) {
          try {
            await save({
              scanIds,
              note: pendingNoteRef.current,
              targetStr: comparisonData?.scans[0]?.target_str ?? undefined,
              modeStr: comparisonData?.scans[0]?.mode_str ?? undefined,
            })
            setIsBookmarked(true)
            info('Comparison saved', 'Auto-saved with your note')
          } catch (err) {
            showError(
              'Save failed',
              err instanceof Error ? err.message : 'Unknown error'
            )
          }
        }
        pendingNoteRef.current = null
      }, DEBOUNCE_DELAY_MS)
    },
    [scanIds, comparisonData, save, info, showError]
  )

  // Handle note changes with auto-save
  const handleNoteChange = useCallback(
    (newNote: string) => {
      setNote(newNote)

      // If note is being cleared and comparison is bookmarked, show dialog
      if (!newNote.trim() && isBookmarked) {
        // Clear pending save
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current)
          pendingNoteRef.current = null
        }
        setShowRemoveDialog(true)
        return
      }

      // Auto-save when note has content
      if (newNote.trim()) {
        debouncedSave(newNote)
      }
    },
    [isBookmarked, debouncedSave]
  )

  // Handle confirm remove bookmark
  const handleConfirmRemove = useCallback(async () => {
    if (existingSaved) {
      try {
        await remove(existingSaved.id)
        setIsBookmarked(false)
        setNote('')
        info('Bookmark removed', 'Comparison removed from saved list')
      } catch (err) {
        showError(
          'Remove failed',
          err instanceof Error ? err.message : 'Unknown error'
        )
      }
    }
    setShowRemoveDialog(false)
  }, [existingSaved, remove, info, showError])

  // Handle cancel remove
  const handleCancelRemove = useCallback(() => {
    // Restore the note
    if (existingSaved) {
      setNote(existingSaved.note)
    }
    setShowRemoveDialog(false)
  }, [existingSaved])

  // Handle manual bookmark toggle
  const handleBookmarkToggle = useCallback(async () => {
    if (isBookmarked) {
      // Show confirmation dialog if bookmarked
      setShowRemoveDialog(true)
    } else {
      // Save with empty note (just bookmark)
      try {
        await save({
          scanIds,
          note: note || '',
          targetStr: comparisonData?.scans[0]?.target_str ?? undefined,
          modeStr: comparisonData?.scans[0]?.mode_str ?? undefined,
        })
        setIsBookmarked(true)
        info('Comparison bookmarked', 'Added to saved comparisons')
      } catch (err) {
        showError(
          'Bookmark failed',
          err instanceof Error ? err.message : 'Unknown error'
        )
      }
    }
  }, [isBookmarked, scanIds, note, comparisonData, save, info, showError])

  // Handle export - generate and download file
  const handleExport = useCallback(
    (format: ExportFormat) => {
      if (!comparisonData) {
        showError('Export failed', 'Comparison data not loaded yet')
        return
      }

      setIsExporting(true)

      try {
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, '-')
          .slice(0, 19)
        const scanIdsStr = scanIds.join('-')

        switch (format) {
          case 'csv': {
            const csvContent = exportMultiScanToCSV(
              comparisonData,
              note || undefined
            )
            const filename = `scan-comparison-${scanIdsStr}-${timestamp}.csv`
            downloadCSV(csvContent, filename)
            info('Export complete', `Downloaded ${filename}`)
            break
          }
          case 'json': {
            const jsonContent = exportMultiScanToJSON(
              comparisonData,
              note || undefined
            )
            const filename = `scan-comparison-${scanIdsStr}-${timestamp}.json`
            downloadJSON(jsonContent, filename)
            info('Export complete', `Downloaded ${filename}`)
            break
          }
          case 'markdown': {
            const mdContent = exportMultiScanToMarkdown(
              comparisonData,
              note || undefined
            )
            const filename = `scan-comparison-${scanIdsStr}-${timestamp}.md`
            downloadMarkdown(mdContent, filename)
            info('Export complete', `Downloaded ${filename}`)
            break
          }
        }
      } catch (err) {
        showError(
          'Export failed',
          err instanceof Error ? err.message : 'Unknown error'
        )
      } finally {
        setIsExporting(false)
      }
    },
    [comparisonData, scanIds, note, info, showError]
  )

  // Handle invalid state - not enough scans
  if (!hasEnoughScans) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/scans')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Scans
          </Button>
        </div>

        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center gap-4">
              <div className="rounded-full bg-warning/10 p-4">
                <AlertTriangle className="h-8 w-8 text-warning" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">
                  Not Enough Scans Selected
                </h2>
                <p className="text-muted-foreground max-w-md">
                  You need to select at least 2 scans to compare. Go to the{' '}
                  <Link to="/scans" className="text-primary hover:underline">
                    Scans page
                  </Link>{' '}
                  and select the scans you want to compare using the checkboxes.
                </p>
              </div>
              <Button onClick={() => navigate('/scans')} className="mt-4">
                Go to Scans
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Comparison Header with notes, bookmark, and export */}
      <ComparisonHeader
        scanIds={scanIds}
        targetStr={comparisonData?.scans[0]?.target_str}
        modeStr={comparisonData?.scans[0]?.mode_str}
        note={note}
        onNoteChange={handleNoteChange}
        isBookmarked={isBookmarked}
        onBookmarkToggle={handleBookmarkToggle}
        onExport={handleExport}
        isExporting={isExporting}
        isSaving={isMutating}
      />

      {/* Comparison Dashboard with 4 visualization modes */}
      <div className="flex-1 p-6 space-y-6">
        <ComparisonDashboard scanIds={scanIds} />
      </div>

      {/* Remove bookmark confirmation dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Saved Comparison?</AlertDialogTitle>
            <AlertDialogDescription>
              Clearing the note will remove this comparison from your saved
              list. You can re-save it later by adding a new note.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelRemove}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemove}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
