/**
 * Port sparkline component for inline activity trends
 * Minimal chart showing port activity over time
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import type { Payload, ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent'

// =============================================================================
// Types
// =============================================================================

export interface SparklineDataPoint {
  /** Time key or label for this point */
  timeKey: string
  /** Value at this point */
  value: number
  /** Optional display label for tooltip */
  label?: string
}

export interface PortSparklineProps {
  /** Data points for the sparkline */
  data: SparklineDataPoint[]
  /** Width in pixels (default: 80) */
  width?: number
  /** Height in pixels (default: 24) */
  height?: number
  /** Line/fill color (default: primary) */
  color?: string
  /** Show tooltip on hover (default: true) */
  showTooltip?: boolean
  /** Additional CSS classes */
  className?: string
}

// =============================================================================
// Custom Tooltip
// =============================================================================

/** Custom tooltip content props - subset of what Recharts passes */
interface SparklineTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<Payload<ValueType, NameType>>
}

function SparklineTooltip({
  active,
  payload,
}: SparklineTooltipProps) {
  if (!active || !payload || !payload.length) return null

  const data = payload[0].payload as SparklineDataPoint
  const value = payload[0].value as number

  return (
    <div className="bg-popover border border-border rounded px-2 py-1 shadow-md">
      <div className="text-xs">
        {data.label && (
          <div className="text-muted-foreground">{data.label}</div>
        )}
        <div className="font-medium">{value.toLocaleString()}</div>
      </div>
    </div>
  )
}

// =============================================================================
// Component
// =============================================================================

export function PortSparkline({
  data,
  width = 80,
  height = 24,
  color = 'var(--color-primary)',
  showTooltip = true,
  className,
}: PortSparklineProps) {
  // Memoize empty check
  const hasData = useMemo(() => {
    return data.length > 0 && data.some(d => d.value > 0)
  }, [data])

  if (!hasData) {
    // Render empty placeholder for consistent sizing
    return (
      <div
        className={className}
        style={{ width, height }}
        aria-label="No activity data"
      >
        <div
          className="h-full w-full flex items-center justify-center text-muted-foreground"
          style={{ fontSize: '8px' }}
        >
          —
        </div>
      </div>
    )
  }

  return (
    <div
      className={className}
      style={{ width, height }}
      aria-label={`Sparkline showing ${data.length} data points`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
        >
          {showTooltip && (
            <Tooltip
              content={<SparklineTooltip />}
              cursor={false}
              allowEscapeViewBox={{ x: true, y: true }}
            />
          )}
          <defs>
            <linearGradient id={`sparkline-gradient-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#sparkline-gradient-${color.replace(/[^a-z0-9]/gi, '')})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default PortSparkline
