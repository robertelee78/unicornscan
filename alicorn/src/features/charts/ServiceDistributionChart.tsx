/**
 * Service distribution chart component
 * Pie/donut chart showing service distribution across scans
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ServiceDistributionData } from './types'

// =============================================================================
// Color palette for services
// =============================================================================

const SERVICE_COLORS = [
  'var(--color-palette-1)',   // Green
  'var(--color-palette-2)',   // Blue
  'var(--color-palette-3)',   // Amber
  'var(--color-palette-4)',   // Red
  'var(--color-palette-5)',   // Violet
  'var(--color-palette-6)',   // Cyan
  'var(--color-palette-7)',   // Pink
  'var(--color-palette-8)',   // Lime
  'var(--color-palette-9)',   // Orange
  'var(--color-palette-10)',  // Indigo
  'var(--color-palette-11)',  // Teal
  'var(--color-palette-12)',  // Purple
]

// =============================================================================
// Props
// =============================================================================

interface ServiceDistributionChartProps {
  data: ServiceDistributionData | undefined
  isLoading: boolean
  variant?: 'pie' | 'bar'
  title?: string
  height?: number
  maxItems?: number
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function ServiceDistributionChart({
  data,
  isLoading,
  variant = 'pie',
  title = 'Service Distribution',
  height = 300,
  maxItems = 10,
  className,
}: ServiceDistributionChartProps) {
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

  if (!data || data.entries.length === 0) {
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
            No service data available
          </div>
        </CardContent>
      </Card>
    )
  }

  // Limit to top N items for chart clarity
  const topItems = data.entries.slice(0, maxItems)
  const othersCount = data.entries.slice(maxItems).reduce((sum, e) => sum + e.count, 0)

  // Prepare chart data
  const chartData = topItems.map((entry, index) => ({
    name: `${entry.serviceName} (${entry.port}/${entry.protocol})`,
    shortName: entry.serviceName,
    value: entry.count,
    percentage: entry.percentage,
    color: SERVICE_COLORS[index % SERVICE_COLORS.length],
  }))

  // Add "Others" category if there are more items
  if (othersCount > 0) {
    chartData.push({
      name: 'Others',
      shortName: 'Others',
      value: othersCount,
      percentage: (othersCount / data.totalResponses) * 100,
      color: 'var(--color-chart-other)', // Gray
    })
  }

  if (variant === 'bar') {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{title}</CardTitle>
            <div className="flex gap-2">
              <Badge variant="secondary" className="text-xs">
                {data.totalResponses.toLocaleString()} responses
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {data.uniqueServices} services
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  horizontal={true}
                  vertical={false}
                />
                <XAxis
                  type="number"
                  stroke="var(--color-muted)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="var(--color-muted)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={75}
                  tickFormatter={(value) => {
                    // Truncate long names
                    return value.length > 12 ? value.substring(0, 12) + '...' : value
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                  formatter={(value, _name, props) => [
                    `${value} (${props.payload.percentage.toFixed(1)}%)`,
                    'Count',
                  ]}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Pie chart (default)
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-xs">
              {data.totalResponses.toLocaleString()} responses
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {data.uniqueServices} services
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                label={({ cx, cy, midAngle, outerRadius, name, percent }: {
                  cx?: number; cy?: number; midAngle?: number; outerRadius?: number;
                  name?: string; percent?: number
                }) => {
                  const RADIAN = Math.PI / 180
                  const radius = (outerRadius ?? 90) + 15
                  const x = (cx ?? 0) + radius * Math.cos(-((midAngle ?? 0) * RADIAN))
                  const y = (cy ?? 0) + radius * Math.sin(-((midAngle ?? 0) * RADIAN))
                  return (
                    <text
                      x={x}
                      y={y}
                      fill="var(--color-foreground)"
                      textAnchor={x > (cx ?? 0) ? 'start' : 'end'}
                      dominantBaseline="central"
                      fontSize={11}
                    >
                      {`${(name || '').split(' ')[0]} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    </text>
                  )
                }}
                labelLine={false}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
                formatter={(value, _name, props) => [
                  `${value} (${props.payload.percentage.toFixed(1)}%)`,
                  props.payload.name,
                ]}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ color: 'var(--color-foreground)' }}
                formatter={(value) => (
                  <span className="text-xs">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export default ServiceDistributionChart
