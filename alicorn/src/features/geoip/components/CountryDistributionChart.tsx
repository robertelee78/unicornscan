/**
 * Country distribution chart component
 * Horizontal bar chart showing top countries by host count
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
import type { GeoIPCountryStats } from '@/types/database'

// =============================================================================
// Color palette for countries
// =============================================================================

const COUNTRY_COLORS = [
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
]

// =============================================================================
// Props
// =============================================================================

interface CountryDistributionChartProps {
  data: GeoIPCountryStats[] | undefined
  isLoading: boolean
  title?: string
  height?: number
  maxCountries?: number
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function CountryDistributionChart({
  data,
  isLoading,
  title = 'Top Countries',
  height = 300,
  maxCountries = 10,
  className,
}: CountryDistributionChartProps) {
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
            No country data available
          </div>
        </CardContent>
      </Card>
    )
  }

  // Sort by host count and take top N
  const topCountries = [...data]
    .sort((a, b) => b.host_count - a.host_count)
    .slice(0, maxCountries)

  const totalHosts = data.reduce((sum, c) => sum + c.host_count, 0)

  // Prepare chart data
  const chartData = topCountries.map((country, index) => ({
    name: country.country_name || country.country_code || 'Unknown',
    code: country.country_code || '??',
    count: country.host_count,
    percentage: ((country.host_count / totalHosts) * 100).toFixed(1),
    color: COUNTRY_COLORS[index % COUNTRY_COLORS.length],
  }))

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-xs">
              {data.length} countries
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {totalHosts} hosts
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
                  `${value} hosts (${props.payload.percentage}%)`,
                  props.payload.name,
                ]}
                labelFormatter={() => ''}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
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

export default CountryDistributionChart
