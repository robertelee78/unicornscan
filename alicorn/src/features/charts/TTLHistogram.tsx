/**
 * TTL distribution histogram component
 * Shows TTL value distribution for OS fingerprinting insights
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { TTLDistributionData } from './types'

// =============================================================================
// OS-based colors
// =============================================================================

const OS_COLORS = {
  linux: 'var(--color-os-linux)',     // Orange - Linux/Unix
  windows: 'var(--color-os-windows)', // Blue - Windows
  router: 'var(--color-os-router)',   // Green - Network devices
  unknown: 'var(--color-os-unknown)', // Gray - Unknown
}

// =============================================================================
// Props
// =============================================================================

interface TTLHistogramProps {
  data: TTLDistributionData | undefined
  isLoading: boolean
  title?: string
  height?: number
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function TTLHistogram({
  data,
  isLoading,
  title = 'TTL Distribution',
  height = 300,
  className,
}: TTLHistogramProps) {
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
            No TTL data available
          </div>
        </CardContent>
      </Card>
    )
  }

  // Calculate total for percentages
  const total = data.osBreakdown.linux + data.osBreakdown.windows +
                data.osBreakdown.router + data.osBreakdown.unknown

  const osPercentages = {
    linux: total > 0 ? ((data.osBreakdown.linux / total) * 100).toFixed(1) : '0',
    windows: total > 0 ? ((data.osBreakdown.windows / total) * 100).toFixed(1) : '0',
    router: total > 0 ? ((data.osBreakdown.router / total) * 100).toFixed(1) : '0',
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {data.totalResponses.toLocaleString()} responses
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.buckets}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
                vertical={false}
              />
              <XAxis
                dataKey="ttl"
                stroke="var(--color-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                label={{
                  value: 'TTL Value',
                  position: 'insideBottom',
                  offset: -5,
                  fontSize: 11,
                  fill: 'var(--color-muted)',
                }}
              />
              <YAxis
                stroke="var(--color-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
                formatter={(value, _name, props) => {
                  const osGuess = props.payload.osGuess
                  const osLabel = osGuess === 'linux' ? 'Linux/Unix' :
                                  osGuess === 'windows' ? 'Windows' :
                                  osGuess === 'router' ? 'Router/Device' : 'Unknown'
                  return [`${value} (${osLabel})`, 'Count']
                }}
                labelFormatter={(label) => `TTL: ${label}`}
              />
              <Legend
                verticalAlign="top"
                height={36}
                iconType="circle"
                iconSize={8}
                content={() => (
                  <div className="flex justify-center gap-4 text-xs mt-2 text-foreground">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: OS_COLORS.linux }} />
                      <span>Linux/Unix (≤64)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: OS_COLORS.windows }} />
                      <span>Windows (65-128)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: OS_COLORS.router }} />
                      <span>Router/Device (129-255)</span>
                    </div>
                  </div>
                )}
              />

              {/* Reference lines for common initial TTL values */}
              <ReferenceLine
                x={64}
                stroke={OS_COLORS.linux}
                strokeDasharray="3 3"
                strokeOpacity={0.7}
              />
              <ReferenceLine
                x={128}
                stroke={OS_COLORS.windows}
                strokeDasharray="3 3"
                strokeOpacity={0.7}
              />
              <ReferenceLine
                x={255}
                stroke={OS_COLORS.router}
                strokeDasharray="3 3"
                strokeOpacity={0.7}
              />

              <Bar dataKey="count" name="Count" radius={[2, 2, 0, 0]}>
                {data.buckets.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={OS_COLORS[entry.osGuess]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* OS breakdown summary */}
        <div className="mt-4 grid grid-cols-3 gap-4 text-center text-xs">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1.5 mb-1">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: OS_COLORS.linux }}
              />
              <span className="text-muted-foreground">Linux/Unix</span>
            </div>
            <div className="font-medium">
              {data.osBreakdown.linux.toLocaleString()}
              <span className="text-muted-foreground ml-1">({osPercentages.linux}%)</span>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1.5 mb-1">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: OS_COLORS.windows }}
              />
              <span className="text-muted-foreground">Windows</span>
            </div>
            <div className="font-medium">
              {data.osBreakdown.windows.toLocaleString()}
              <span className="text-muted-foreground ml-1">({osPercentages.windows}%)</span>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1.5 mb-1">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: OS_COLORS.router }}
              />
              <span className="text-muted-foreground">Router/Device</span>
            </div>
            <div className="font-medium">
              {data.osBreakdown.router.toLocaleString()}
              <span className="text-muted-foreground ml-1">({osPercentages.router}%)</span>
            </div>
          </div>
        </div>

        {/* Most common TTL indicator */}
        <div className="mt-3 pt-3 border-t border-border text-center text-xs text-muted-foreground">
          Most common TTL: <span className="font-medium text-foreground">{data.mostCommonTTL}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default TTLHistogram
