/**
 * Port activity heatmap component with adaptive rendering
 * Shows port activity over time in grid (dense data) or bars (sparse data)
 * Supports collapsible category grouping in bar mode
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo, useState } from 'react'
import { LayoutGrid, Calendar, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AdaptiveHeatmapData, SparklineDataPoint, GroupedPortData, PortCategory } from './types'
import { getHeatmapColor, getServiceName } from './types'
import { PortActivityBar } from './PortActivityBar'
import { CategoryHeader } from './CategoryHeader'
import { groupPortsByCategory } from './portCategories'

// =============================================================================
// Types & Constants
// =============================================================================

/** Sort options for port display */
type SortOption = 'category' | 'activity' | 'port'

/** Sort option labels for display */
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'category', label: 'By Category' },
  { value: 'activity', label: 'By Activity' },
  { value: 'port', label: 'By Port Number' },
]

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
  sortOption: SortOption
}

function BarModeRenderer({ data, height, sortOption }: BarModeProps) {
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

  // Sort ports for flat list modes
  const flatSortedPorts = useMemo(() => {
    if (sortOption === 'category') return [] // Not used in category mode

    const sorted = [...data.ports]
    if (sortOption === 'activity') {
      sorted.sort((a, b) => {
        const countA = portData.get(a)?.count || 0
        const countB = portData.get(b)?.count || 0
        return countB - countA // Descending by activity
      })
    } else if (sortOption === 'port') {
      sorted.sort((a, b) => a - b) // Ascending by port number
    }
    return sorted
  }, [data.ports, portData, sortOption])

  // Category-grouped mode
  if (sortOption === 'category') {
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

  // Flat list mode (activity or port number sort)
  return (
    <div
      className="space-y-0.5 overflow-y-auto"
      style={{ maxHeight: height - 60 }}
      role="list"
      aria-label={`Port activity sorted by ${sortOption}`}
    >
      {flatSortedPorts.map((port) => {
        const info = portData.get(port)
        if (!info) return null

        const category = groupPortsByCategory([port])[0]
        const color = category?.config.color || 'var(--color-primary)'

        return (
          <PortActivityBar
            key={port}
            port={port}
            count={info.count}
            maxCount={maxCount}
            sparklineData={info.sparklineData}
            color={color}
            showSparkline={data.timeKeys.length > 1}
          />
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
  sortOption: SortOption
}

function GridModeRenderer({ data, height, sortOption }: GridModeProps) {
  // Build grid data structure with sorted ports
  const gridData = useMemo(() => {
    const cellMap = new Map<string, number>()
    const portTotals = new Map<number, number>()

    // Calculate totals and build cell map
    for (const cell of data.cells) {
      cellMap.set(`${cell.port}-${cell.timeKey}`, cell.count)
      portTotals.set(cell.port, (portTotals.get(cell.port) || 0) + cell.count)
    }

    // Sort ports based on option
    let sortedPorts = [...data.ports]
    if (sortOption === 'activity') {
      sortedPorts.sort((a, b) => {
        const countA = portTotals.get(a) || 0
        const countB = portTotals.get(b) || 0
        return countB - countA
      })
    } else if (sortOption === 'port') {
      sortedPorts.sort((a, b) => a - b)
    } else {
      // Category sort: group by category, then by activity within category
      const grouped = groupPortsByCategory(sortedPorts, portTotals)
      sortedPorts = grouped.flatMap((g) =>
        [...g.ports].sort((a, b) => {
          const countA = portTotals.get(a) || 0
          const countB = portTotals.get(b) || 0
          return countB - countA
        })
      )
    }

    return {
      cellMap,
      ports: sortedPorts,
      timeKeys: data.timeKeys,
      timeLabels: data.timeLabels,
      maxCount: data.maxCount,
      granularity: data.granularity,
    }
  }, [data, sortOption])

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
  // Sort preference state
  const [sortOption, setSortOption] = useState<SortOption>('category')

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
            className="flex flex-col items-center justify-center text-center"
            style={{ height }}
          >
            {/* Icon illustration */}
            <div className="rounded-full bg-muted p-4 mb-4">
              <LayoutGrid className="h-8 w-8 text-muted-foreground" />
            </div>

            {/* Title */}
            <h3 className="text-lg font-semibold mb-2">No Port Activity Data</h3>

            {/* Explanation */}
            <p className="text-muted-foreground text-sm max-w-md mb-4">
              No port activity was recorded in the selected time range. This could happen if:
            </p>

            {/* Possible reasons */}
            <ul className="text-muted-foreground text-sm text-left space-y-1 mb-4">
              <li className="flex items-center gap-2">
                <Info className="h-3.5 w-3.5 flex-shrink-0" />
                <span>No scans were run during this period</span>
              </li>
              <li className="flex items-center gap-2">
                <Info className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Scans did not discover any open ports</span>
              </li>
              <li className="flex items-center gap-2">
                <Info className="h-3.5 w-3.5 flex-shrink-0" />
                <span>The time filter is too narrow</span>
              </li>
            </ul>

            {/* Suggestion */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
              <Calendar className="h-4 w-4" />
              <span>Try expanding the time range or running new scans</span>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex gap-2 items-center flex-wrap">
            {/* Sort control */}
            <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
              <SelectTrigger className="h-7 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <BarModeRenderer data={data} height={height} sortOption={sortOption} />
          ) : (
            <GridModeRenderer data={data} height={height} sortOption={sortOption} />
          )}
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}

export default PortActivityHeatmap
