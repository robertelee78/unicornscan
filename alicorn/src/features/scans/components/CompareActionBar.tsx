/**
 * Floating action bar for scan comparison workflow
 * Appears when 2+ scans are selected, provides Compare and Clear actions
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useNavigate } from 'react-router-dom'
import { GitCompare, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CompareActionBarProps {
  /** Set of selected scan IDs */
  selectedIds: Set<number>
  /** Number of selected scans */
  selectedCount: number
  /** True when 2+ scans are selected */
  canCompare: boolean
  /** Callback to clear all selections */
  onClearSelection: () => void
  /** Optional additional CSS classes */
  className?: string
}

/**
 * Floating action bar that appears at the bottom of the viewport
 * when 2+ scans are selected for comparison.
 *
 * Contains:
 * - Selection count ("3 scans selected")
 * - "Compare" primary button (navigates to comparison dashboard)
 * - "Clear Selection" secondary button
 *
 * @example
 * ```tsx
 * <CompareActionBar
 *   selectedIds={selectedIds}
 *   selectedCount={selectedCount}
 *   canCompare={canCompare}
 *   onClearSelection={clearSelection}
 * />
 * ```
 */
export function CompareActionBar({
  selectedIds,
  selectedCount,
  canCompare,
  onClearSelection,
  className,
}: CompareActionBarProps) {
  const navigate = useNavigate()

  // Don't render if we can't compare (need 2+ scans)
  if (!canCompare) {
    return null
  }

  const handleCompare = () => {
    // Build URL with comma-separated scan IDs
    const ids = Array.from(selectedIds).join(',')
    navigate(`/scans/compare?ids=${ids}`)
  }

  return (
    <div
      className={cn(
        // Fixed position at bottom of viewport
        'fixed bottom-0 left-0 right-0 z-50',
        // Account for sidebar (w-64 = 16rem)
        'ml-64',
        // Styling
        'bg-surface border-t border-border shadow-lg',
        // Animation
        'animate-in slide-in-from-bottom-4 duration-200',
        className
      )}
    >
      <div className="container mx-auto px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Selection count */}
          <div className="flex items-center gap-2 text-sm">
            <GitCompare className="h-4 w-4 text-primary" />
            <span className="font-medium">
              {selectedCount} scan{selectedCount !== 1 ? 's' : ''} selected
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4 mr-1" />
              Clear Selection
            </Button>
            <Button
              size="sm"
              onClick={handleCompare}
              className="gap-2"
            >
              <GitCompare className="h-4 w-4" />
              Compare
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
