/**
 * Port trend chart component
 * Shows port count changes over time using Recharts
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { HostPortTrend, ChartConfig } from './types'
import { CHART_COLORS, DEFAULT_CHART_CONFIG } from './types'

// =============================================================================
// Props
// =============================================================================

interface PortTrendChartProps {
  data: HostPortTrend | undefined
  isLoading: boolean
  config?: Partial<ChartConfig>
  title?: string
  height?: number
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function PortTrendChart({
  data,
  isLoading,
  config: configOverride,
  title = 'Port Trend',
  height = 300,
  className,
}: PortTrendChartProps) {
  const config: ChartConfig = { ...DEFAULT_CHART_CONFIG, ...configOverride }

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

  if (!data || data.points.length === 0) {
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
            No port data available for this host
          </div>
        </CardContent>
      </Card>
    )
  }

  const ChartComponent = config.chartType === 'line' ? LineChart : AreaChart

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-xs">
              {data.summary.scanCount} scans
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {data.summary.totalUniquePorts} unique ports
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ChartComponent
              data={data.points}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.total} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.total} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="tcpGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.tcp} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.tcp} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="udpGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.udp} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.udp} stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />

              <XAxis
                dataKey="date"
                stroke="hsl(var(--muted))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => {
                  const date = new Date(value)
                  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                }}
              />

              <YAxis
                stroke="hsl(var(--muted))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--surface))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
                labelFormatter={(label) => {
                  const date = new Date(label)
                  return date.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                }}
              />

              <Legend
                verticalAlign="top"
                height={36}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ color: 'hsl(var(--foreground))' }}
              />

              {config.chartType === 'area' ? (
                <>
                  {config.showTotal && (
                    <Area
                      type="monotone"
                      dataKey="totalPorts"
                      name="Total Ports"
                      stroke={CHART_COLORS.total}
                      fill="url(#totalGradient)"
                      strokeWidth={2}
                      stackId={config.stacked ? 'stack' : undefined}
                    />
                  )}
                  {config.showTcp && (
                    <Area
                      type="monotone"
                      dataKey="tcpPorts"
                      name="TCP"
                      stroke={CHART_COLORS.tcp}
                      fill="url(#tcpGradient)"
                      strokeWidth={2}
                      stackId={config.stacked ? 'stack' : undefined}
                    />
                  )}
                  {config.showUdp && (
                    <Area
                      type="monotone"
                      dataKey="udpPorts"
                      name="UDP"
                      stroke={CHART_COLORS.udp}
                      fill="url(#udpGradient)"
                      strokeWidth={2}
                      stackId={config.stacked ? 'stack' : undefined}
                    />
                  )}
                </>
              ) : (
                <>
                  {config.showTotal && (
                    <Line
                      type="monotone"
                      dataKey="totalPorts"
                      name="Total Ports"
                      stroke={CHART_COLORS.total}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  )}
                  {config.showTcp && (
                    <Line
                      type="monotone"
                      dataKey="tcpPorts"
                      name="TCP"
                      stroke={CHART_COLORS.tcp}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  )}
                  {config.showUdp && (
                    <Line
                      type="monotone"
                      dataKey="udpPorts"
                      name="UDP"
                      stroke={CHART_COLORS.udp}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  )}
                </>
              )}
            </ChartComponent>
          </ResponsiveContainer>
        </div>

        {/* Summary stats */}
        <div className="mt-4 grid grid-cols-4 gap-4 text-center text-xs">
          <div>
            <div className="text-muted-foreground">Min</div>
            <div className="font-medium">{data.summary.minPorts}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Max</div>
            <div className="font-medium">{data.summary.maxPorts}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Avg</div>
            <div className="font-medium">{data.summary.avgPorts}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Total Unique</div>
            <div className="font-medium">{data.summary.totalUniquePorts}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default PortTrendChart
