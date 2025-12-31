/**
 * Scan timeline chart using Recharts
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ScanTimelinePoint } from './types'

interface ScanTimelineProps {
  data: ScanTimelinePoint[] | undefined
  isLoading: boolean
}

export function ScanTimeline({ data, isLoading }: ScanTimelineProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Scan Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center text-muted text-sm">
            Loading...
          </div>
        ) : !data || data.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-muted text-sm">
            No scan data in selected time range
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="scanGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="responseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
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
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => {
                    const date = new Date(value)
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  }}
                />
                <YAxis
                  stroke="hsl(var(--muted))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => value.toString()}
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
                    })
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="scans"
                  stroke="hsl(var(--primary))"
                  fill="url(#scanGradient)"
                  strokeWidth={2}
                  name="Scans"
                />
                <Area
                  type="monotone"
                  dataKey="responses"
                  stroke="hsl(var(--accent))"
                  fill="url(#responseGradient)"
                  strokeWidth={2}
                  name="Responses"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
