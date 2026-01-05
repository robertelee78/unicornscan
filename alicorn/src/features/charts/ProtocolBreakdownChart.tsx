/**
 * Protocol breakdown chart component
 * Shows TCP/UDP response distribution with SYN+ACK and banner breakdown
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
import type { ProtocolBreakdownData } from './types'

// =============================================================================
// Color Configuration
// =============================================================================

const PROTOCOL_COLORS = {
  tcpTotal: 'var(--color-chart-tcp)',           // Blue for TCP
  tcpSynAck: 'var(--color-success)',            // Green for open ports
  tcpWithBanner: 'var(--color-chart-icmp)',     // Cyan for banners
  udpTotal: 'var(--color-chart-udp)',           // Purple for UDP
}

// =============================================================================
// Props
// =============================================================================

interface ProtocolBreakdownChartProps {
  data: ProtocolBreakdownData | undefined
  isLoading: boolean
  title?: string
  height?: number
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function ProtocolBreakdownChart({
  data,
  isLoading,
  title = 'Protocol Breakdown',
  height = 280,
  className,
}: ProtocolBreakdownChartProps) {
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

  if (!data) {
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

  // Prepare chart data - horizontal bars
  const chartData = [
    {
      name: 'TCP Total',
      value: data.tcpTotal,
      color: PROTOCOL_COLORS.tcpTotal,
      description: 'All TCP responses',
    },
    {
      name: 'TCP SYN+ACK',
      value: data.tcpSynAck,
      color: PROTOCOL_COLORS.tcpSynAck,
      description: 'Open ports (accepting connections)',
    },
    {
      name: 'TCP w/ Banner',
      value: data.tcpWithBanner,
      color: PROTOCOL_COLORS.tcpWithBanner,
      description: 'Services that sent application data',
    },
    {
      name: 'UDP Total',
      value: data.udpTotal,
      color: PROTOCOL_COLORS.udpTotal,
      description: 'All UDP responses',
    },
  ]

  const totalResponses = data.tcpTotal + data.udpTotal

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {totalResponses.toLocaleString()} total responses
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
                horizontal={true}
                vertical={false}
              />
              <XAxis
                type="number"
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => value.toLocaleString()}
              />
              <YAxis
                type="category"
                dataKey="name"
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={95}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-popover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
                cursor={{ fill: 'color-mix(in srgb, var(--color-muted) 30%, transparent)' }}
                formatter={(value, _name, props) => {
                  const item = props.payload
                  const percentage = totalResponses > 0
                    ? ((Number(value) / totalResponses) * 100).toFixed(1)
                    : '0'
                  return [
                    <span key="value">
                      <strong>{Number(value).toLocaleString()}</strong>
                      <span className="text-muted-foreground ml-1">({percentage}%)</span>
                    </span>,
                    item.name,
                  ]
                }}
                labelFormatter={() => null}
              />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                barSize={24}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Relationship indicator */}
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground justify-center">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PROTOCOL_COLORS.tcpTotal }} />
              <span>TCP responses</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PROTOCOL_COLORS.tcpSynAck }} />
              <span>Open ports (SYN+ACK)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PROTOCOL_COLORS.tcpWithBanner }} />
              <span>With banner data</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PROTOCOL_COLORS.udpTotal }} />
              <span>UDP responses</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default ProtocolBreakdownChart
