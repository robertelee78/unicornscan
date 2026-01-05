/**
 * Port activity heatmap component with adaptive rendering
 * Shows port activity over time in grid (dense data) or bars (sparse data)
 * Supports collapsible category grouping in bar mode
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import type { AdaptiveHeatmapData, SparklineDataPoint, GroupedPortData, PortCategory } from './types'
import { getHeatmapColor, getServiceName } from './types'
import { PortActivityBar } from './PortActivityBar'
import { CategoryHeader } from './CategoryHeader'
import { groupPortsByCategory } from './portCategories'

// =============================================================================
// Constants
// =============================================================================

/** Threshold for switching between bar and grid rendering modes */
const SPARSE_DATA_THRESHOLD = 3

// =============================================================================
// Props
// =============================================================================

interface PortActivityHeatmapProps {
  data: AdaptiveHeatmapData | undefined
  isLoading: boolean
  title?: string
  height?: number
  className?: string
}

// =============================================================================
// Bar Mode Renderer (Sparse Data) with Category Groups
// =============================================================================

interface BarModeProps {
  data: AdaptiveHeatmapData
  height: number
}

function BarModeRenderer({ data, height }: BarModeProps) {
  // Track which categories are expanded (all expanded by default)
  const [expandedCategories, setExpandedCategories] = useState<Set<PortCategory>>(
    () => new Set(['web', 'database', 'remote-access', 'email', 'file-transfer', 'directory', 'messaging', 'monitoring', 'other'])
  )

  // Calculate total counts and sparkline data per port
  const portData = useMemo(() => {
    const result: Map<number, { count: number; sparklineData: SparklineDataPoint[] }> = new Map()

    // Initialize with all ports
    for (const port of data.ports) {
      result.set(port, { count: 0, sparklineData: [] })
    }

    // Build time-indexed maps per port
    const timeIndexedData = new Map<number, Map<string, number>>()
    for (const port of data.ports) {
      timeIndexedData.set(port, new Map())
    }

    // Aggregate data from cells
    for (const cell of data.cells) {
      const portInfo = result.get(cell.port)
      const timeMap = timeIndexedData.get(cell.port)
      if (portInfo && timeMap) {
        portInfo.count += cell.count
        timeMap.set(cell.timeKey, cell.count)
      }
    }

    // Build sparkline data in time order
    for (const port of data.ports) {
      const portInfo = result.get(port)
      const timeMap = timeIndexedData.get(port)
      if (portInfo && timeMap) {
        portInfo.sparklineData = data.timeKeys.map((tk, idx) => ({
          timeKey: tk,
          value: timeMap.get(tk) || 0,
          label: data.timeLabels[idx],
        }))
      }
    }

    return result
  }, [data])

  // Calculate max count for normalization (across all ports)
  const maxCount = useMemo(() => {
    let max = 0
    for (const { count } of portData.values()) {
      max = Math.max(max, count)
    }
    return max
  }, [portData])

  // Create activity map for grouping
  const activityMap = useMemo(() => {
    const map = new Map<number, number>()
    for (const [port, { count }] of portData) {
      map.set(port, count)
    }
    return map
  }, [portData])

  // Group ports by category with activity totals
  const groupedPorts = useMemo(() => {
    const groups = groupPortsByCategory(data.ports, activityMap)
    // Sort by total activity descending
    return groups.sort((a, b) => b.totalActivity - a.totalActivity)
  }, [data.ports, activityMap])

  // Toggle category expansion
  const toggleCategory = (category: PortCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  return (
    <div
      className="space-y-1 overflow-y-auto"
      style={{ maxHeight: height - 60 }}
      role="list"
      aria-label="Port activity by category"
    >
      {groupedPorts.map((group) => {
        const isExpanded = expandedCategories.has(group.category)

        // Sort ports within category by activity descending
        const sortedPorts = [...group.ports].sort((a, b) => {
          const countA = portData.get(a)?.count || 0
          const countB = portData.get(b)?.count || 0
          return countB - countA
        })

        return (
          <Collapsible
            key={group.category}
            open={isExpanded}
            onOpenChange={() => toggleCategory(group.category)}
          >
            <CategoryHeader
              config={group.config}
              portCount={group.ports.length}
              totalActivity={group.totalActivity}
              isExpanded={isExpanded}
            />
            <CollapsibleContent className="pl-2">
              <div className="space-y-0.5 pt-1">
                {sortedPorts.map((port) => {
                  const info = portData.get(port)
                  if (!info) return null

                  return (
                    <PortActivityBar
                      key={port}
                      port={port}
                      count={info.count}
                      maxCount={maxCount}
                      sparklineData={info.sparklineData}
                      color={group.config.color}
                      showSparkline={data.timeKeys.length > 1}
                    />
                  )
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}

// =============================================================================
// Grid Mode Renderer (Dense Data)
// =============================================================================

interface GridModeProps {
  data: AdaptiveHeatmapData
  height: number
}

function GridModeRenderer({ data, height }: GridModeProps) {
  // Build grid data structure
  const gridData = useMemo(() => {
    const cellMap = new Map<string, number>()
    for (const cell of data.cells) {
      cellMap.set(`${cell.port}-${cell.timeKey}`, cell.count)
    }

    return {
      cellMap,
      ports: data.ports,
      timeKeys: data.timeKeys,
      timeLabels: data.timeLabels,
      maxCount: data.maxCount,
      granularity: data.granularity,
    }
  }, [data])

  // Calculate cell dimensions
  const cellSize = Math.min(
    Math.floor((height - 100) / gridData.ports.length),
    28
  )
  const cellGap = 2

  // Determine how often to show labels based on column count
  const labelFrequency = Math.max(1, Math.ceil(gridData.timeKeys.length / 12))

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Time labels (X-axis) */}
        <div className="flex mb-1" style={{ marginLeft: '80px' }}>
          {gridData.timeLabels.map((label, idx) => (
            <div
              key={gridData.timeKeys[idx]}
              className="text-[10px] text-muted-foreground"
              style={{
                width: cellSize,
                marginRight: cellGap,
                textAlign: 'center',
                transform: 'rotate(-45deg)',
                transformOrigin: 'left bottom',
                whiteSpace: 'nowrap',
              }}
            >
              {idx % labelFrequency === 0 ? label : ''}
            </div>
          ))}
        </div>

        {/* Grid rows */}
        <div className="flex flex-col" style={{ gap: cellGap }}>
          {gridData.ports.map((port) => (
            <div key={port} className="flex items-center">
              {/* Port label (Y-axis) */}
              <div
                className="text-xs text-muted-foreground text-right pr-2 flex-shrink-0"
                style={{ width: '78px' }}
              >
                <span className="font-mono font-medium">{port}</span>
                <span className="text-[10px] ml-1 opacity-70">
                  {getServiceName(port) !== 'Unknown' ? getServiceName(port) : ''}
                </span>
              </div>

              {/* Cells for this port */}
              <div className="flex" style={{ gap: cellGap }}>
                {gridData.timeKeys.map((timeKey, idx) => {
                  const count = gridData.cellMap.get(`${port}-${timeKey}`) || 0
                  const intensity = gridData.maxCount > 0 ? count / gridData.maxCount : 0
                  const color = count > 0 ? getHeatmapColor(intensity) : 'var(--color-muted)'

                  return (
                    <Tooltip key={`${port}-${timeKey}`}>
                      <TooltipTrigger asChild>
                        <div
                          className="rounded-sm cursor-pointer transition-transform hover:scale-110 hover:z-10"
                          style={{
                            width: cellSize,
                            height: cellSize,
                            backgroundColor: color,
                            opacity: count > 0 ? 1 : 0.15,
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          <div className="font-medium">
                            Port {port} ({getServiceName(port)})
                          </div>
                          <div className="text-muted-foreground">
                            {gridData.timeLabels[idx]}
                          </div>
                          <div className="mt-1">
                            {count > 0 ? (
                              <span className="text-green-500">{count} observations</span>
                            ) : (
                              <span className="text-muted-foreground">No activity</span>
                            )}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Color legend */}
        <div className="mt-4 flex items-center justify-center gap-2">
          <span className="text-xs text-muted-foreground">Less</span>
          <div className="flex gap-0.5">
            {[0, 0.2, 0.4, 0.6, 0.8, 1].map((intensity) => (
              <div
                key={intensity}
                className="w-4 h-4 rounded-sm"
                style={{ backgroundColor: getHeatmapColor(intensity) }}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">More</span>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function PortActivityHeatmap({
  data,
  isLoading,
  title = 'Port Activity Heatmap',
  height = 400,
  className,
}: PortActivityHeatmapProps) {
  // Determine rendering mode based on data density
  const renderMode = useMemo(() => {
    if (!data) return 'empty'
    if (data.ports.length === 0 || data.timeKeys.length === 0) return 'empty'
    return data.timeKeys.length <= SPARSE_DATA_THRESHOLD ? 'bars' : 'grid'
  }, [data])

  // Format date range for display
  const dateRangeLabel = useMemo(() => {
    if (!data?.dateRange) return ''
    const { start, end, daySpan } = data.dateRange
    if (daySpan <= 1) {
      return new Date(start).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    }
    return `${new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }, [data])

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

  if (renderMode === 'empty' || !data) {
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
            No port activity data available
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex gap-2 items-center">
            {dateRangeLabel && (
              <span className="text-xs text-muted-foreground">{dateRangeLabel}</span>
            )}
            <Badge variant="secondary" className="text-xs">
              {data.ports.length} ports
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {data.timeKeys.length} {data.granularity === 'hourly' ? 'hours' : 'days'}
            </Badge>
            <Badge variant="outline" className="text-xs capitalize">
              {renderMode}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          {renderMode === 'bars' ? (
            <BarModeRenderer data={data} height={height} />
          ) : (
            <GridModeRenderer data={data} height={height} />
          )}
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}

export default PortActivityHeatmap
