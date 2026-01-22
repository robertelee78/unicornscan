/**
 * Port timeline visualization
 * Gantt-style chart showing when ports were observed over time
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { PortTimelineData, PortLifespan } from './types'
import { CHART_COLORS } from './types'

// =============================================================================
// Props
// =============================================================================

interface PortTimelineProps {
  data: PortTimelineData | undefined
  isLoading: boolean
  title?: string
  maxPorts?: number
  height?: number
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function PortTimeline({
  data,
  isLoading,
  title = 'Port Timeline',
  maxPorts = 20,
  height = 400,
  className,
}: PortTimelineProps) {
  // Calculate timeline dimensions
  const timelineData = useMemo(() => {
    if (!data || data.ports.length === 0) return null

    const { start, end } = data.timeRange
    const duration = end - start || 1 // Avoid division by zero

    // Sort ports by first seen, take top N
    const sortedPorts = [...data.ports]
      .sort((a, b) => a.firstSeen - b.firstSeen)
      .slice(0, maxPorts)

    return {
      ports: sortedPorts,
      start,
      end,
      duration,
    }
  }, [data, maxPorts])

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
            <span className="text-muted-foreground text-sm">Loading...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!timelineData) {
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
            No port timeline data available
          </div>
        </CardContent>
      </Card>
    )
  }

  const { ports, start, end, duration } = timelineData
  const rowHeight = 28
  const labelWidth = 100
  const contentHeight = Math.min(height - 60, ports.length * rowHeight + 40)

  // Format timestamp for display
  const formatTime = (ts: number) => {
    const date = new Date(ts * 1000)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Get color for protocol
  const getProtocolColor = (protocol: string) => {
    switch (protocol) {
      case 'tcp': return CHART_COLORS.tcp
      case 'udp': return CHART_COLORS.udp
      default: return CHART_COLORS.other
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-xs">
              {data?.ports.length ?? 0} ports
            </Badge>
            {ports.length < (data?.ports.length ?? 0) && (
              <Badge variant="outline" className="text-xs">
                Showing {ports.length}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: contentHeight }} className="overflow-y-auto">
          {/* Timeline header with time markers */}
          <div className="flex border-b pb-2 mb-2 sticky top-0 bg-card z-10">
            <div style={{ width: labelWidth }} className="shrink-0" />
            <div className="flex-1 flex justify-between text-xs text-muted-foreground px-1">
              <span>{formatTime(start)}</span>
              <span>{formatTime(start + duration * 0.25)}</span>
              <span>{formatTime(start + duration * 0.5)}</span>
              <span>{formatTime(start + duration * 0.75)}</span>
              <span>{formatTime(end)}</span>
            </div>
          </div>

          {/* Port rows */}
          {ports.map((port) => (
            <PortRow
              key={`${port.port}-${port.protocol}`}
              port={port}
              start={start}
              duration={duration}
              labelWidth={labelWidth}
              rowHeight={rowHeight}
              getProtocolColor={getProtocolColor}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t flex justify-center gap-6 text-xs">
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: CHART_COLORS.tcp }}
            />
            <span className="text-muted-foreground">TCP</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: CHART_COLORS.udp }}
            />
            <span className="text-muted-foreground">UDP</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">Active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-gray-400" />
            <span className="text-muted-foreground">Inactive</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// =============================================================================
// Port Row Component
// =============================================================================

interface PortRowProps {
  port: PortLifespan
  start: number
  duration: number
  labelWidth: number
  rowHeight: number
  getProtocolColor: (protocol: string) => string
}

function PortRow({
  port,
  start,
  duration,
  labelWidth,
  rowHeight,
  getProtocolColor,
}: PortRowProps) {
  // Calculate bar position and width
  const leftPercent = ((port.firstSeen - start) / duration) * 100
  const widthPercent = ((port.lastSeen - port.firstSeen) / duration) * 100 || 1 // Min 1% for visibility

  const barColor = getProtocolColor(port.protocol)
  const opacity = port.isActive ? 1 : 0.5

  return (
    <div
      className="flex items-center group hover:bg-muted/50 rounded"
      style={{ height: rowHeight }}
    >
      {/* Port label */}
      <div
        className="shrink-0 text-xs font-mono pr-2 text-right"
        style={{ width: labelWidth }}
      >
        <span className={cn(
          port.isActive ? 'text-foreground' : 'text-muted-foreground'
        )}>
          {port.port}
        </span>
        <span className="text-muted-foreground">/{port.protocol}</span>
      </div>

      {/* Timeline bar */}
      <div className="flex-1 relative h-4">
        {/* Background track */}
        <div className="absolute inset-0 bg-muted/30 rounded" />

        {/* Active bar */}
        <div
          className="absolute h-full rounded transition-all group-hover:brightness-110"
          style={{
            left: `${leftPercent}%`,
            width: `${Math.max(widthPercent, 1)}%`,
            backgroundColor: barColor,
            opacity,
          }}
          title={`Port ${port.port}/${port.protocol}: ${formatDateRange(port.firstSeen, port.lastSeen)} (${port.observationCount} observations)`}
        >
          {/* Active indicator dot */}
          {port.isActive && (
            <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-500 border border-background" />
          )}
        </div>
      </div>

      {/* Observation count */}
      <div className="w-8 text-xs text-muted-foreground text-center shrink-0">
        {port.observationCount}
      </div>
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================

function formatDateRange(start: number, end: number): string {
  const startDate = new Date(start * 1000)
  const endDate = new Date(end * 1000)

  const startStr = startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const endStr = endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  if (startStr === endStr) {
    return startStr
  }

  return `${startStr} - ${endStr}`
}

export default PortTimeline
