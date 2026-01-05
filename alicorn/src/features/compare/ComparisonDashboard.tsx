/**
 * ComparisonDashboard - Main layout for scan comparison visualization
 *
 * Features a 4-quadrant layout with one primary view (60-70% viewport)
 * and three thumbnail views. Clicking a thumbnail swaps it with the primary.
 *
 * View types:
 * 1. Side-by-side - Columns per scan, rows for hosts/ports
 * 2. Timeline - Chronological changes over time
 * 3. Unified diff - Merged view with color-coded changes
 * 4. Matrix heatmap - Grid showing presence across scans
 *
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback } from 'react'
import {
  Columns,
  Clock,
  GitMerge,
  Grid3X3,
  Maximize2,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useMultiScanComparison } from './hooks'
import { SideBySideView, TimelineView, UnifiedDiffView } from './views'
import type { MultiScanComparisonResult } from './types'

// =============================================================================
// Types
// =============================================================================

/**
 * The four available visualization modes
 */
export type ViewType = 'side-by-side' | 'timeline' | 'unified-diff' | 'matrix-heatmap'

interface ViewConfig {
  id: ViewType
  label: string
  description: string
  icon: React.ReactNode
}

interface ComparisonDashboardProps {
  /** Array of scan IDs to compare (2-5+) */
  scanIds: number[]
  /** Optional CSS class */
  className?: string
}

// =============================================================================
// View Configuration
// =============================================================================

const VIEW_CONFIGS: ViewConfig[] = [
  {
    id: 'side-by-side',
    label: 'Side by Side',
    description: 'Columns for each scan, rows for hosts',
    icon: <Columns className="h-4 w-4" />,
  },
  {
    id: 'timeline',
    label: 'Timeline',
    description: 'Chronological view of changes',
    icon: <Clock className="h-4 w-4" />,
  },
  {
    id: 'unified-diff',
    label: 'Unified Diff',
    description: 'Merged view with color-coded changes',
    icon: <GitMerge className="h-4 w-4" />,
  },
  {
    id: 'matrix-heatmap',
    label: 'Matrix Heatmap',
    description: 'Grid showing presence across scans',
    icon: <Grid3X3 className="h-4 w-4" />,
  },
]

// =============================================================================
// Placeholder View Component
// =============================================================================

interface ViewRendererProps {
  viewType: ViewType
  data: MultiScanComparisonResult | null | undefined
  isLoading: boolean
  error: Error | null
  scanIds: number[]
  isThumbnail?: boolean
}

/**
 * Renders the appropriate visualization view based on viewType.
 * Shows loading/error states and placeholders for unimplemented views.
 */
function ViewRenderer({ viewType, data, isLoading, error, scanIds, isThumbnail }: ViewRendererProps) {
  const config = VIEW_CONFIGS.find((v) => v.id === viewType)!

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">Failed to load comparison data</p>
        <p className="text-xs text-muted-foreground">{error.message}</p>
      </div>
    )
  }

  // No data state
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No comparison data available</p>
      </div>
    )
  }

  // Render actual views (implemented) or placeholders (not yet implemented)
  switch (viewType) {
    case 'side-by-side':
      return isThumbnail ? (
        <ViewPlaceholder config={config} isThumbnail />
      ) : (
        <SideBySideView data={data} className="h-full" />
      )

    case 'timeline':
      return isThumbnail ? (
        <ViewPlaceholder config={config} isThumbnail />
      ) : (
        <TimelineView data={data} className="h-full" />
      )

    case 'unified-diff':
      return isThumbnail ? (
        <ViewPlaceholder config={config} isThumbnail />
      ) : (
        <UnifiedDiffView data={data} className="h-full" />
      )

    case 'matrix-heatmap':
    default:
      return <ViewPlaceholder config={config} scanIds={scanIds} isThumbnail={isThumbnail} />
  }
}

interface ViewPlaceholderProps {
  config: ViewConfig
  scanIds?: number[]
  isThumbnail?: boolean
}

/**
 * Placeholder component for views not yet implemented.
 */
function ViewPlaceholder({ config, scanIds, isThumbnail }: ViewPlaceholderProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center h-full gap-2',
      isThumbnail ? 'p-2' : 'p-8'
    )}>
      <div className={cn(
        'rounded-full bg-primary/10 flex items-center justify-center',
        isThumbnail ? 'p-2' : 'p-4'
      )}>
        {config.icon}
      </div>
      <div className="text-center">
        <p className={cn(
          'font-medium',
          isThumbnail ? 'text-xs' : 'text-sm'
        )}>
          {config.label}
        </p>
        {!isThumbnail && (
          <>
            <p className="text-xs text-muted-foreground mt-1">
              {config.description}
            </p>
            {scanIds && (
              <p className="text-xs text-muted-foreground mt-2">
                View coming soon...
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Thumbnail Card Component
// =============================================================================

interface ThumbnailCardProps {
  viewType: ViewType
  data: MultiScanComparisonResult | null | undefined
  isLoading: boolean
  error: Error | null
  scanIds: number[]
  onClick: () => void
}

function ThumbnailCard({ viewType, data, isLoading, error, scanIds, onClick }: ThumbnailCardProps) {
  const config = VIEW_CONFIGS.find((v) => v.id === viewType)!

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-200 hover:border-primary/50',
        'h-full overflow-hidden'
      )}
      onClick={onClick}
    >
      <CardHeader className="p-2 pb-0">
        <CardTitle className="text-xs flex items-center gap-1.5">
          {config.icon}
          <span className="truncate">{config.label}</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-5 w-5 p-0"
            onClick={(e) => {
              e.stopPropagation()
              onClick()
            }}
            title="Expand to primary view"
          >
            <Maximize2 className="h-3 w-3" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-1">
        <div className="h-24 bg-muted/30 rounded-md overflow-hidden">
          <ViewRenderer
            viewType={viewType}
            data={data}
            isLoading={isLoading}
            error={error}
            scanIds={scanIds}
            isThumbnail
          />
        </div>
      </CardContent>
    </Card>
  )
}

// =============================================================================
// Main Dashboard Component
// =============================================================================

/**
 * ComparisonDashboard - Main comparison visualization layout
 *
 * Layout: Primary view takes 60-70% of viewport height,
 * with 3 thumbnail views in a row below it.
 *
 * Clicking a thumbnail swaps it with the primary view.
 *
 * @example
 * ```tsx
 * <ComparisonDashboard scanIds={[1, 2, 3]} />
 * ```
 */
export function ComparisonDashboard({ scanIds, className }: ComparisonDashboardProps) {
  // Track which view is in the primary position
  const [primaryView, setPrimaryView] = useState<ViewType>('side-by-side')

  // Fetch comparison data
  const { data, isLoading, error } = useMultiScanComparison(scanIds)

  // Get the thumbnail views (all views except the primary)
  const thumbnailViews = VIEW_CONFIGS.filter((v) => v.id !== primaryView)

  // Handle thumbnail click - swap with primary
  const handleThumbnailClick = useCallback((viewType: ViewType) => {
    setPrimaryView(viewType)
  }, [])

  const primaryConfig = VIEW_CONFIGS.find((v) => v.id === primaryView)!

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Primary View */}
      <Card className="flex-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            {primaryConfig.icon}
            {primaryConfig.label}
            <span className="text-sm font-normal text-muted-foreground ml-2">
              {primaryConfig.description}
            </span>
            {data && (
              <span className="text-sm font-normal text-muted-foreground ml-auto">
                {data.summary.totalHosts} hosts, {data.summary.totalPorts} ports
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {/* Primary view content area - minimum height for good visibility */}
          <div className="min-h-[400px] max-h-[600px] bg-muted/20 rounded-lg border border-border overflow-auto">
            <ViewRenderer
              viewType={primaryView}
              data={data}
              isLoading={isLoading}
              error={error}
              scanIds={scanIds}
            />
          </div>
        </CardContent>
      </Card>

      {/* Thumbnail Views Row */}
      <div className="grid grid-cols-3 gap-4">
        {thumbnailViews.map((view) => (
          <ThumbnailCard
            key={view.id}
            viewType={view.id}
            data={data}
            isLoading={isLoading}
            error={error}
            scanIds={scanIds}
            onClick={() => handleThumbnailClick(view.id)}
          />
        ))}
      </div>
    </div>
  )
}
