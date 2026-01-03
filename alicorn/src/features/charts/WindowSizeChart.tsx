/**
 * TCP Window Size distribution chart
 * Shows window size distribution for OS fingerprinting insights
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { WindowSizeDistributionData } from './types'

// =============================================================================
// Color palette for window sizes
// =============================================================================

const WINDOW_COLORS = [
  'var(--color-palette-2)',   // Blue
  'var(--color-palette-1)',   // Green
  'var(--color-palette-3)',   // Amber
  'var(--color-palette-4)',   // Red
  'var(--color-palette-5)',   // Violet
  'var(--color-palette-6)',   // Cyan
  'var(--color-palette-7)',   // Pink
  'var(--color-palette-8)',   // Lime
  'var(--color-palette-9)',   // Orange
  'var(--color-palette-10)',  // Indigo
]

// =============================================================================
// Props
// =============================================================================

interface WindowSizeChartProps {
  data: WindowSizeDistributionData | undefined
  isLoading: boolean
  title?: string
  height?: number
  maxItems?: number
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function WindowSizeChart({
  data,
  isLoading,
  title = 'TCP Window Size Distribution',
  height = 280,
  maxItems = 10,
  className,
}: WindowSizeChartProps) {
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

  if (!data || data.buckets.length === 0) {
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
            No TCP window size data available
          </div>
        </CardContent>
      </Card>
    )
  }

  // Limit to top N items
  const topBuckets = data.buckets.slice(0, maxItems)

  // Add color to each bucket
  const chartData = topBuckets.map((bucket, index) => ({
    ...bucket,
    displayLabel: `${bucket.label} (${bucket.windowSize})`,
    color: WINDOW_COLORS[index % WINDOW_COLORS.length],
  }))

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {data.totalResponses.toLocaleString()} TCP responses
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                horizontal={true}
                vertical={false}
              />
              <XAxis
                type="number"
                stroke="hsl(var(--muted))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                stroke="hsl(var(--muted))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={55}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--surface))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
                formatter={(value, _name, props) => [
                  `${value} (${props.payload.percentage.toFixed(1)}%)`,
                  `Window Size: ${props.payload.windowSize}`,
                ]}
                labelFormatter={(label) => `Size: ${label}`}
              />
              <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Most common window size */}
        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Most common window size:</span>
            <span className="font-medium">
              {data.mostCommonSize.toLocaleString()} bytes
              {data.mostCommonSize >= 1024 && (
                <span className="text-muted-foreground ml-1">
                  ({Math.round(data.mostCommonSize / 1024)}KB)
                </span>
              )}
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <p className="italic">
              Window size values can help identify operating systems:
            </p>
            <ul className="mt-1 ml-4 list-disc space-y-0.5">
              <li>Windows: typically 8192, 16384, 65535</li>
              <li>Linux: varies, often 5840, 14600, 29200</li>
              <li>macOS: often 65535</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default WindowSizeChart
