/**
 * IP Type distribution chart component
 * Pie/donut chart showing distribution of IP types (residential, datacenter, etc.)
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { IP_TYPE_CONFIG } from '../types'
import type { GeoIPTypeDistribution } from '../types'

// =============================================================================
// Props
// =============================================================================

interface IpTypeChartProps {
  data: GeoIPTypeDistribution[] | undefined
  isLoading: boolean
  title?: string
  height?: number
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function IpTypeChart({
  data,
  isLoading,
  title = 'IP Type Distribution',
  height = 300,
  className,
}: IpTypeChartProps) {
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

  // If no data or all unknown, show "not available" message
  const hasTypeData = data && data.some((d) => d.ip_type !== 'unknown')

  if (!hasTypeData) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex flex-col items-center justify-center text-muted-foreground text-sm"
            style={{ height }}
          >
            <span>No IP type data available</span>
            <span className="text-xs mt-1">
              (Requires extended GeoIP database with IP classification)
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const totalHosts = data!.reduce((sum, d) => sum + d.count, 0)

  // Prepare chart data with colors from IP_TYPE_CONFIG
  const chartData = data!
    .filter((d) => d.count > 0)
    .map((d) => ({
      name: IP_TYPE_CONFIG[d.ip_type].label,
      value: d.count,
      percentage: d.percentage,
      color: IP_TYPE_CONFIG[d.ip_type].color,
      description: IP_TYPE_CONFIG[d.ip_type].description,
    }))
    .sort((a, b) => b.value - a.value)

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {totalHosts} hosts classified
          </Badge>
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
                      {`${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
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
                  backgroundColor: 'hsl(var(--surface))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
                formatter={(value, _name, props) => [
                  `${value} hosts (${props.payload.percentage.toFixed(1)}%)`,
                  props.payload.name,
                ]}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value) => (
                  <span className="text-xs">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend with descriptions */}
        <div className="mt-2 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            {chartData.slice(0, 4).map((item) => (
              <div key={item.name} className="flex items-start gap-2">
                <div
                  className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <div>
                  <span className="font-medium">{item.name}</span>
                  <p className="text-muted-foreground text-[10px] leading-tight">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default IpTypeChart
