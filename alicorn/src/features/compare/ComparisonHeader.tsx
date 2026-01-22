/**
 * ComparisonHeader - Header bar for scan comparison page
 *
 * Contains:
 * - Back to scans button
 * - Scan IDs and target info display
 * - Inline note text field (auto-saves when implemented)
 * - Bookmark button/icon
 * - Export dropdown (CSV, JSON, Markdown)
 *
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Download,
  FileJson,
  FileText,
  FileDown,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// =============================================================================
// Types
// =============================================================================

export type ExportFormat = 'csv' | 'json' | 'markdown'

interface ComparisonHeaderProps {
  /** Array of scan IDs being compared */
  scanIds: number[]
  /** Target string (e.g., IP range) - from first selected scan */
  targetStr?: string | null
  /** Mode string (e.g., "TCP SYN") - from first selected scan */
  modeStr?: string | null
  /** Current note value */
  note?: string
  /** Callback when note changes */
  onNoteChange?: (note: string) => void
  /** Whether comparison is bookmarked */
  isBookmarked?: boolean
  /** Callback when bookmark is toggled */
  onBookmarkToggle?: () => void
  /** Callback when export is requested */
  onExport?: (format: ExportFormat) => void
  /** Whether export is in progress */
  isExporting?: boolean
  /** Whether save is in progress */
  isSaving?: boolean
  /** Optional CSS class */
  className?: string
}

// =============================================================================
// Export Menu Item Component
// =============================================================================

interface ExportMenuItemProps {
  icon: React.ReactNode
  label: string
  description: string
  onClick: () => void
  disabled?: boolean
}

function ExportMenuItem({ icon, label, description, onClick, disabled }: ExportMenuItemProps) {
  return (
    <DropdownMenuItem
      onClick={onClick}
      disabled={disabled}
      className="flex items-start gap-3 p-3"
    >
      <div className="mt-0.5">{icon}</div>
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
    </DropdownMenuItem>
  )
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * ComparisonHeader - Header component for comparison dashboard
 *
 * Provides navigation, metadata display, notes, bookmarking, and export.
 *
 * @example
 * ```tsx
 * <ComparisonHeader
 *   scanIds={[1, 2, 3]}
 *   targetStr="192.168.1.0/24"
 *   modeStr="TCP SYN"
 *   note={note}
 *   onNoteChange={setNote}
 *   isBookmarked={isBookmarked}
 *   onBookmarkToggle={toggleBookmark}
 *   onExport={handleExport}
 * />
 * ```
 */
export function ComparisonHeader({
  scanIds,
  targetStr,
  modeStr,
  note = '',
  onNoteChange,
  isBookmarked = false,
  onBookmarkToggle,
  onExport,
  isExporting = false,
  isSaving = false,
  className,
}: ComparisonHeaderProps) {
  const navigate = useNavigate()
  const [localNote, setLocalNote] = useState(note)

  // Handle note input change
  const handleNoteChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalNote(value)
    onNoteChange?.(value)
  }, [onNoteChange])

  // Handle export click
  const handleExport = useCallback((format: ExportFormat) => {
    onExport?.(format)
  }, [onExport])

  // Handle back navigation
  const handleBack = useCallback(() => {
    navigate('/scans')
  }, [navigate])

  return (
    <div className={cn(
      'flex items-center gap-4 p-4 bg-surface border-b border-border',
      className
    )}>
      {/* Back button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="shrink-0"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Scans
            </Button>
          </TooltipTrigger>
          <TooltipContent>Back to scan list</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Divider */}
      <div className="h-6 w-px bg-border" />

      {/* Scan info */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm text-muted-foreground">Comparing:</span>
        <div className="flex items-center gap-1">
          {scanIds.map((id, index) => (
            <Badge key={id} variant="secondary" className="text-xs">
              #{id}
              {index < scanIds.length - 1 && <span className="ml-1 text-muted-foreground">•</span>}
            </Badge>
          ))}
        </div>
      </div>

      {/* Target and mode badges */}
      {(targetStr || modeStr) && (
        <>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2">
            {targetStr && (
              <Badge variant="outline" className="text-xs">
                {targetStr}
              </Badge>
            )}
            {modeStr && (
              <Badge variant="outline" className="text-xs">
                {modeStr}
              </Badge>
            )}
          </div>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Note input */}
      <div className="flex items-center gap-2 w-64">
        <Input
          type="text"
          placeholder="Add a note..."
          value={localNote}
          onChange={handleNoteChange}
          className="h-8 text-sm"
          aria-label="Comparison note"
        />
        {isSaving && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
        )}
      </div>

      {/* Bookmark button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onBookmarkToggle}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark comparison'}
              aria-pressed={isBookmarked}
              className={cn(
                'shrink-0',
                isBookmarked && 'text-primary'
              )}
            >
              {isBookmarked ? (
                <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Bookmark className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isBookmarked ? 'Remove bookmark' : 'Bookmark comparison'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Export dropdown */}
      <DropdownMenu>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isExporting}
                  className="shrink-0"
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Download className="h-4 w-4 mr-1" />
                  )}
                  Export
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Export comparison results</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Export Format</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <ExportMenuItem
            icon={<FileText className="h-4 w-4 text-green-500" />}
            label="CSV"
            description="Spreadsheet-compatible format"
            onClick={() => handleExport('csv')}
            disabled={isExporting}
          />
          <ExportMenuItem
            icon={<FileJson className="h-4 w-4 text-blue-500" />}
            label="JSON"
            description="Structured data format"
            onClick={() => handleExport('json')}
            disabled={isExporting}
          />
          <ExportMenuItem
            icon={<FileDown className="h-4 w-4 text-purple-500" />}
            label="Markdown"
            description="Report-ready document"
            onClick={() => handleExport('markdown')}
            disabled={isExporting}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
