/**
 * Protocol distribution chart
 * Stacked bar chart showing TCP vs UDP distribution over time
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useNavigate } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ProtocolBreakdown } from './types'
import { CHART_COLORS } from './types'

// =============================================================================
// Props
// =============================================================================

interface ProtocolDistributionProps {
  data: ProtocolBreakdown[] | undefined
  isLoading: boolean
  variant?: 'bar' | 'pie'
  title?: string
  height?: number
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function ProtocolDistribution({
  data,
  isLoading,
  variant = 'bar',
  title = 'Protocol Distribution',
  height = 250,
  className,
}: ProtocolDistributionProps) {
  const navigate = useNavigate()

  // Handle bar click to navigate to scan details
  const handleBarClick = (scanId: number | undefined) => {
    if (scanId) {
      navigate(`/scans/${scanId}`)
    }
  }
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

  if (!data || data.length === 0) {
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
            No protocol data available
          </div>
        </CardContent>
      </Card>
    )
  }

  // Aggregate for pie chart
  const totals = data.reduce(
    (acc, d) => ({
      tcp: acc.tcp + d.tcp,
      udp: acc.udp + d.udp,
      icmp: acc.icmp + d.icmp,
      other: acc.other + d.other,
    }),
    { tcp: 0, udp: 0, icmp: 0, other: 0 }
  )

  const pieData = [
    { name: 'TCP', value: totals.tcp, color: CHART_COLORS.tcp },
    { name: 'UDP', value: totals.udp, color: CHART_COLORS.udp },
    { name: 'ICMP', value: totals.icmp, color: CHART_COLORS.icmp },
    { name: 'Other', value: totals.other, color: CHART_COLORS.other },
  ].filter(d => d.value > 0)

  const total = totals.tcp + totals.udp + totals.icmp + totals.other

  if (variant === 'pie') {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ cx, cy, midAngle, outerRadius, name, percent }: {
                    cx?: number; cy?: number; midAngle?: number; outerRadius?: number;
                    name?: string; percent?: number
                  }) => {
                    const RADIAN = Math.PI / 180
                    const radius = (outerRadius ?? 80) + 15
                    const x = (cx ?? 0) + radius * Math.cos(-((midAngle ?? 0) * RADIAN))
                    const y = (cy ?? 0) + radius * Math.sin(-((midAngle ?? 0) * RADIAN))
                    return (
                      <text
                        x={x}
                        y={y}
                        fill="hsl(var(--foreground))"
                        textAnchor={x > (cx ?? 0) ? 'start' : 'end'}
                        dominantBaseline="central"
                        fontSize={11}
                      >
                        {`${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      </text>
                    )
                  }}
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--surface))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                  formatter={(value) => [
                    `${value} (${(((value as number) / total) * 100).toFixed(1)}%)`,
                    'Count',
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend below chart */}
          <div className="mt-2 flex justify-center gap-4 text-xs">
            {pieData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-muted-foreground">{entry.name}</span>
                <span className="font-medium">{entry.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Bar chart (default)
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />

              <XAxis
                dataKey="scan_id"
                stroke="hsl(var(--muted))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value, index) => {
                  // Show scan ID with abbreviated date
                  const item = data[index]
                  if (!item) return `#${value}`
                  const date = new Date(item.date)
                  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  return `#${value} (${dateStr})`
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
                labelFormatter={(scanId, payload) => {
                  // Get the date from the payload
                  const item = payload?.[0]?.payload
                  if (!item) return `Scan #${scanId}`
                  const date = new Date(item.date)
                  const dateStr = date.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })
                  return `Scan #${scanId} - ${dateStr}`
                }}
                wrapperStyle={{ cursor: 'pointer' }}
              />

              <Legend
                verticalAlign="top"
                height={36}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ color: 'hsl(var(--foreground))' }}
              />

              <Bar
                dataKey="tcp"
                name="TCP"
                stackId="protocol"
                fill={CHART_COLORS.tcp}
                radius={[0, 0, 0, 0]}
                cursor="pointer"
                onClick={(barData) => handleBarClick((barData as unknown as ProtocolBreakdown)?.scan_id)}
              />
              <Bar
                dataKey="udp"
                name="UDP"
                stackId="protocol"
                fill={CHART_COLORS.udp}
                radius={[0, 0, 0, 0]}
                cursor="pointer"
                onClick={(barData) => handleBarClick((barData as unknown as ProtocolBreakdown)?.scan_id)}
              />
              {totals.icmp > 0 && (
                <Bar
                  dataKey="icmp"
                  name="ICMP"
                  stackId="protocol"
                  fill={CHART_COLORS.icmp}
                  radius={[0, 0, 0, 0]}
                  cursor="pointer"
                  onClick={(barData) => handleBarClick((barData as unknown as ProtocolBreakdown)?.scan_id)}
                />
              )}
              {totals.other > 0 && (
                <Bar
                  dataKey="other"
                  name="Other"
                  stackId="protocol"
                  fill={CHART_COLORS.other}
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(barData) => handleBarClick((barData as unknown as ProtocolBreakdown)?.scan_id)}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export default ProtocolDistribution
