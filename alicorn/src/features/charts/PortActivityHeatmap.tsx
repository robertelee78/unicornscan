/**
 * Port activity heatmap component
 * Shows port activity over time in a grid visualization
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { PortActivityHeatmapData } from './types'
import { getHeatmapColor, getServiceName } from './types'

// =============================================================================
// Props
// =============================================================================

interface PortActivityHeatmapProps {
  data: PortActivityHeatmapData | undefined
  isLoading: boolean
  title?: string
  height?: number
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function PortActivityHeatmap({
  data,
  isLoading,
  title = 'Port Activity Heatmap',
  height = 400,
  className,
}: PortActivityHeatmapProps) {
  // Build grid data structure
  const gridData = useMemo(() => {
    if (!data) return null

    // Create a map for quick cell lookup
    const cellMap = new Map<string, number>()
    for (const cell of data.cells) {
      cellMap.set(`${cell.port}-${cell.date}`, cell.count)
    }

    return {
      cellMap,
      ports: data.ports,
      dates: data.dates,
      maxCount: data.maxCount,
    }
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

  if (!gridData || gridData.ports.length === 0 || gridData.dates.length === 0) {
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

  // Calculate cell dimensions based on available space
  const cellSize = Math.min(
    Math.floor((height - 100) / gridData.ports.length),
    28
  )
  const cellGap = 2

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-xs">
              {gridData.ports.length} ports
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {gridData.dates.length} days
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              {/* Date labels (X-axis) */}
              <div className="flex mb-1" style={{ marginLeft: '70px' }}>
                {gridData.dates.map((date, idx) => (
                  <div
                    key={date}
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
                    {idx % Math.ceil(gridData.dates.length / 7) === 0
                      ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : ''
                    }
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
                      style={{ width: '68px' }}
                    >
                      <span className="font-medium">{port}</span>
                      <span className="text-[10px] ml-1 opacity-70">
                        {getServiceName(port) !== 'Unknown' ? getServiceName(port) : ''}
                      </span>
                    </div>

                    {/* Cells for this port */}
                    <div className="flex" style={{ gap: cellGap }}>
                      {gridData.dates.map((date) => {
                        const count = gridData.cellMap.get(`${port}-${date}`) || 0
                        const intensity = gridData.maxCount > 0 ? count / gridData.maxCount : 0
                        const color = count > 0 ? getHeatmapColor(intensity) : 'hsl(var(--muted))'

                        return (
                          <Tooltip key={`${port}-${date}`}>
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
                                  {new Date(date).toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                  })}
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
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}

export default PortActivityHeatmap
