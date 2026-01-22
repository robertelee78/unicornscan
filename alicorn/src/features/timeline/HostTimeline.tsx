/**
 * Host timeline component
 * Enhanced timeline visualization with change events, filtering, and zoom
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TimelineControls } from './TimelineControls'
import { TimelineRow } from './TimelineRow'
import { TimelineExportDialog } from './TimelineExportDialog'
import { useTimelineState } from './hooks'
import type { PortStateChange } from './types'
import { formatTimestamp } from './timeline-utils'

// =============================================================================
// Props
// =============================================================================

interface HostTimelineProps {
  hostIp: string
  title?: string
  maxPorts?: number
  height?: number
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function HostTimeline({
  hostIp,
  title = 'Port Activity Timeline',
  maxPorts = 30,
  height = 500,
  className,
}: HostTimelineProps) {
  const {
    // Data
    data,
    rawData,
    isLoading,
    error,

    // Filter
    filter,
    updateFilter,
    resetFilter,

    // View
    viewState,
    visibleRange,
    zoomIn,
    zoomOut,
    resetZoom,
    panLeft,
    panRight,
    selectPort,
    canZoomIn,
    canZoomOut,
    canPanLeft,
    canPanRight,
  } = useTimelineState(hostIp)

  // Export dialog state
  const [exportOpen, setExportOpen] = useState(false)

  // Selected event state
  const [selectedEvent, setSelectedEvent] = useState<PortStateChange | null>(null)

  // Get displayed tracks (limited to maxPorts)
  const displayedTracks = useMemo(() => {
    if (!data) return []
    return data.tracks.slice(0, maxPorts)
  }, [data, maxPorts])

  // Handle event click
  const handleEventClick = useCallback((change: PortStateChange) => {
    setSelectedEvent(change)
  }, [])

  // Calculate dimensions
  const rowHeight = 28
  const labelWidth = 120
  const contentHeight = Math.min(height - 120, displayedTracks.length * rowHeight + 40)

  // Loading state
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex items-center justify-center bg-muted/20 animate-pulse rounded"
            style={{ height }}
          >
            <span className="text-muted-foreground text-sm">Loading timeline...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex items-center justify-center text-error text-sm"
            style={{ height }}
          >
            Error loading timeline: {error.message}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Empty state
  if (!data || data.tracks.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex items-center justify-center text-muted-foreground text-sm"
            style={{ height }}
          >
            No port timeline data available for this host
          </div>
        </CardContent>
      </Card>
    )
  }

  const effectiveVisibleRange = visibleRange || data.timeRange

  return (
    <TooltipProvider>
      <Card className={className}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{title}</CardTitle>
              <Badge variant="secondary" className="text-xs">
                {data.tracks.length} ports
              </Badge>
              {displayedTracks.length < data.tracks.length && (
                <Badge variant="outline" className="text-xs">
                  Showing {displayedTracks.length}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Controls */}
          <TimelineControls
            summary={data.summary}
            zoomLevel={viewState.zoomLevel}
            canZoomIn={canZoomIn}
            canZoomOut={canZoomOut}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onResetZoom={resetZoom}
            canPanLeft={!!canPanLeft}
            canPanRight={!!canPanRight}
            onPanLeft={panLeft}
            onPanRight={panRight}
            visibleRange={effectiveVisibleRange}
            fullRange={data.timeRange}
            filter={filter}
            onFilterChange={updateFilter}
            onResetFilter={resetFilter}
            onExport={() => setExportOpen(true)}
          />

          {/* Timeline visualization */}
          <div style={{ height: contentHeight }} className="overflow-y-auto">
            {/* Time axis header */}
            <TimelineHeader
              visibleRange={effectiveVisibleRange}
              labelWidth={labelWidth}
            />

            {/* Port rows */}
            {displayedTracks.map((track) => (
              <TimelineRow
                key={track.key}
                track={track}
                timeRange={data.timeRange}
                visibleRange={effectiveVisibleRange}
                labelWidth={labelWidth}
                rowHeight={rowHeight}
                isSelected={viewState.selectedPort === track.key}
                onSelect={selectPort}
                onEventClick={handleEventClick}
              />
            ))}
          </div>

          {/* Legend */}
          <TimelineLegend />

          {/* Selected event details */}
          {selectedEvent && (
            <EventDetailPanel
              event={selectedEvent}
              onClose={() => setSelectedEvent(null)}
            />
          )}
        </CardContent>
      </Card>

      {/* Export dialog */}
      {rawData && (
        <TimelineExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          data={rawData}
          visibleRange={visibleRange || undefined}
        />
      )}
    </TooltipProvider>
  )
}

// =============================================================================
// Timeline Header (time axis)
// =============================================================================

interface TimelineHeaderProps {
  visibleRange: { start: number; end: number }
  labelWidth: number
}

function TimelineHeader({ visibleRange, labelWidth }: TimelineHeaderProps) {
  const { start, end } = visibleRange
  const duration = end - start || 1

  const markers = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="flex border-b pb-2 mb-2 sticky top-0 bg-card z-10">
      <div style={{ width: labelWidth }} className="shrink-0" />
      <div className="flex-1 flex justify-between text-xs text-muted-foreground px-1">
        {markers.map((fraction, i) => (
          <span key={i}>{formatTimestamp(start + duration * fraction)}</span>
        ))}
      </div>
      <div className="w-10 shrink-0 text-xs text-muted-foreground text-center">
        Obs
      </div>
    </div>
  )
}

// =============================================================================
// Legend
// =============================================================================

function TimelineLegend() {
  return (
    <div className="pt-4 border-t flex flex-wrap justify-center gap-4 text-xs">
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--color-timeline-tcp)' }} />
        <span className="text-muted-foreground">TCP</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--color-timeline-udp)' }} />
        <span className="text-muted-foreground">UDP</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--color-timeline-active)' }} />
        <span className="text-muted-foreground">Active</span>
      </div>
      <div className="border-l pl-4 flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--color-timeline-active)' }} />
        <span className="text-muted-foreground">Appeared</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--color-timeline-closed)' }} />
        <span className="text-muted-foreground">Disappeared</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--color-timeline-tcp)' }} />
        <span className="text-muted-foreground">Reappeared</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--color-timeline-filtered)' }} />
        <span className="text-muted-foreground">Changed</span>
      </div>
    </div>
  )
}

// =============================================================================
// Event Detail Panel
// =============================================================================

interface EventDetailPanelProps {
  event: PortStateChange
  onClose: () => void
}

function EventDetailPanel({ event, onClose }: EventDetailPanelProps) {
  return (
    <div className="mt-4 p-4 bg-muted/30 rounded-lg border">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium text-sm">
            {event.description}
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            {formatTimestamp(event.timestamp, 'datetime')} (Scan #{event.scan_id})
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ✕
        </button>
      </div>

      {(event.previous || event.current) && (
        <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
          {event.previous && (
            <div>
              <p className="font-medium mb-1">Before</p>
              <p>TTL: {event.previous.ttl}</p>
              <p>Flags: 0x{event.previous.flags.toString(16)}</p>
              {event.previous.windowSize !== undefined && (
                <p>Window: {event.previous.windowSize}</p>
              )}
            </div>
          )}
          {event.current && (
            <div>
              <p className="font-medium mb-1">After</p>
              <p>TTL: {event.current.ttl}</p>
              <p>Flags: 0x{event.current.flags.toString(16)}</p>
              {event.current.windowSize !== undefined && (
                <p>Window: {event.current.windowSize}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default HostTimeline
