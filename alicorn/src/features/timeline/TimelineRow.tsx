/**
 * Timeline row component
 * Displays a single port track with observations and change events
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { PortTrack, PortStateChange } from './types'
import { getChangeTypeColor, getChangeTypeLabel, getSeverityVariant } from './types'
import { formatTimestamp } from './timeline-utils'

// =============================================================================
// Props
// =============================================================================

interface TimelineRowProps {
  track: PortTrack
  /** Full time range (for calculating positions) */
  timeRange: { start: number; end: number }
  /** Visible time range (for clipping) */
  visibleRange: { start: number; end: number }
  /** Label column width */
  labelWidth: number
  /** Row height */
  rowHeight: number
  /** Whether this row is selected */
  isSelected: boolean
  /** Selection callback */
  onSelect: (key: string) => void
  /** Event click callback */
  onEventClick: (change: PortStateChange) => void
}

// =============================================================================
// Constants
// =============================================================================

const PROTOCOL_COLORS = {
  tcp: 'var(--color-timeline-tcp)',     // blue
  udp: 'var(--color-timeline-udp)',     // purple
  other: 'var(--color-timeline-other)', // gray
}

// =============================================================================
// Component
// =============================================================================

export function TimelineRow({
  track,
  timeRange: _timeRange,
  visibleRange,
  labelWidth,
  rowHeight,
  isSelected,
  onSelect,
  onEventClick,
}: TimelineRowProps) {
  // Note: timeRange available for future use in absolute positioning
  void _timeRange
  // Calculate bar positioning
  const barPosition = useMemo(() => {
    const duration = visibleRange.end - visibleRange.start || 1

    // Clamp track times to visible range
    const clampedStart = Math.max(track.firstSeen, visibleRange.start)
    const clampedEnd = Math.min(track.lastSeen, visibleRange.end)

    // Check if track is visible at all
    if (clampedStart > visibleRange.end || clampedEnd < visibleRange.start) {
      return null
    }

    const leftPercent = ((clampedStart - visibleRange.start) / duration) * 100
    const widthPercent = ((clampedEnd - clampedStart) / duration) * 100

    return {
      left: leftPercent,
      width: Math.max(widthPercent, 0.5), // Min 0.5% for visibility
    }
  }, [track, visibleRange])

  // Filter visible events
  const visibleChanges = useMemo(() => {
    return track.changes.filter(
      c => c.timestamp >= visibleRange.start && c.timestamp <= visibleRange.end
    )
  }, [track.changes, visibleRange])

  // Calculate event positions
  const eventPositions = useMemo(() => {
    const duration = visibleRange.end - visibleRange.start || 1
    return visibleChanges.map(change => ({
      change,
      percent: ((change.timestamp - visibleRange.start) / duration) * 100,
    }))
  }, [visibleChanges, visibleRange])

  const barColor = PROTOCOL_COLORS[track.protocol] || PROTOCOL_COLORS.other
  const opacity = track.isActive ? 1 : 0.5

  return (
    <div
      className={cn(
        'flex items-center group hover:bg-muted/50 transition-colors cursor-pointer',
        isSelected && 'bg-muted/70'
      )}
      style={{ height: rowHeight }}
      onClick={() => onSelect(track.key)}
    >
      {/* Port label */}
      <div
        className="shrink-0 text-xs font-mono pr-3 text-right flex items-center justify-end gap-1"
        style={{ width: labelWidth }}
      >
        <span className={cn(
          track.isActive ? 'text-foreground' : 'text-muted-foreground'
        )}>
          {track.port}
        </span>
        <span className="text-muted-foreground">/{track.protocol}</span>
        {track.changes.length > 0 && (
          <Badge
            variant={track.changes.some(c => c.severity === 'significant') ? 'destructive' : 'secondary'}
            className="h-4 px-1 text-[10px]"
          >
            {track.changes.length}
          </Badge>
        )}
      </div>

      {/* Timeline track */}
      <div className="flex-1 relative h-5 mx-1">
        {/* Background track */}
        <div className="absolute inset-0 bg-muted/30 rounded" />

        {/* Port lifespan bar */}
        {barPosition && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'absolute h-full rounded transition-all',
                  'group-hover:brightness-110'
                )}
                style={{
                  left: `${barPosition.left}%`,
                  width: `${barPosition.width}%`,
                  backgroundColor: barColor,
                  opacity,
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <PortTooltipContent track={track} />
            </TooltipContent>
          </Tooltip>
        )}

        {/* Event markers */}
        {eventPositions.map(({ change, percent }, index) => (
          <EventMarker
            key={index}
            change={change}
            leftPercent={percent}
            rowHeight={rowHeight}
            onClick={() => onEventClick(change)}
          />
        ))}

        {/* Active indicator */}
        {track.isActive && barPosition && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-500 border border-background z-10"
            style={{ left: `calc(${barPosition.left + barPosition.width}% + 2px)` }}
          />
        )}
      </div>

      {/* Observation count */}
      <div className="w-10 text-xs text-muted-foreground text-center shrink-0">
        {track.observationCount}
      </div>
    </div>
  )
}

// =============================================================================
// Event Marker
// =============================================================================

interface EventMarkerProps {
  change: PortStateChange
  leftPercent: number
  rowHeight: number
  onClick: () => void
}

function EventMarker({ change, leftPercent, onClick }: EventMarkerProps) {
  const color = getChangeTypeColor(change.type)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            'absolute top-1/2 -translate-y-1/2 -translate-x-1/2',
            'w-3 h-3 rounded-full border-2 border-background',
            'cursor-pointer hover:scale-125 transition-transform z-20',
            change.severity === 'significant' && 'animate-pulse'
          )}
          style={{
            left: `${leftPercent}%`,
            backgroundColor: color,
          }}
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <EventTooltipContent change={change} />
      </TooltipContent>
    </Tooltip>
  )
}

// =============================================================================
// Tooltip Content
// =============================================================================

function PortTooltipContent({ track }: { track: PortTrack }) {
  return (
    <div className="space-y-1 text-xs">
      <p className="font-medium">
        Port {track.port}/{track.protocol}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
        <span>First seen:</span>
        <span>{formatTimestamp(track.firstSeen, 'datetime')}</span>
        <span>Last seen:</span>
        <span>{formatTimestamp(track.lastSeen, 'datetime')}</span>
        <span>Observations:</span>
        <span>{track.observationCount}</span>
        <span>Changes:</span>
        <span>{track.changes.length}</span>
        {track.gapCount > 0 && (
          <>
            <span>Gaps:</span>
            <span>{track.gapCount}</span>
          </>
        )}
      </div>
      {track.isActive && (
        <Badge variant="default" className="mt-1">Active</Badge>
      )}
    </div>
  )
}

function EventTooltipContent({ change }: { change: PortStateChange }) {
  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: getChangeTypeColor(change.type) }}
        />
        <span className="font-medium">{getChangeTypeLabel(change.type)}</span>
        <Badge variant={getSeverityVariant(change.severity)} className="text-[10px]">
          {change.severity}
        </Badge>
      </div>
      <p className="text-muted-foreground">{change.description}</p>
      <p className="text-muted-foreground">
        {formatTimestamp(change.timestamp, 'datetime')}
      </p>
      {(change.previous || change.current) && (
        <div className="pt-1 border-t mt-1">
          {change.previous && (
            <p>Before: TTL={change.previous.ttl}, flags=0x{change.previous.flags.toString(16)}</p>
          )}
          {change.current && (
            <p>After: TTL={change.current.ttl}, flags=0x{change.current.flags.toString(16)}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default TimelineRow
