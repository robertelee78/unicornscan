/**
 * Service distribution chart component
 * Pie/donut chart showing service distribution across scans
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
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
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#84cc16', // Lime
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#a855f7', // Purple
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
      color: '#6b7280', // Gray
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
                  dataKey="name"
                  stroke="hsl(var(--muted))"
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
                    backgroundColor: 'hsl(var(--surface))',
                    border: '1px solid hsl(var(--border))',
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
                label={({ name, percent }: { name?: string; percent?: number }) =>
                  `${(name || '').split(' ')[0]} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {chartData.map((entry, index) => (
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
