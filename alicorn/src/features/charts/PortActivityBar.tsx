/**
 * Port activity bar component for sparse data visualization
 * Horizontal bar showing port, service, activity count, and trend sparkline
 * Used when time range produces sparse data (e.g., single day)
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { getServiceName } from './types'
import { PortSparkline, type SparklineDataPoint } from './PortSparkline'

// =============================================================================
// Types
// =============================================================================

export interface PortActivityBarProps {
  /** Port number */
  port: number
  /** Total activity count for this port */
  count: number
  /** Maximum count across all ports (for bar width normalization) */
  maxCount: number
  /** Time series data for sparkline trend visualization */
  sparklineData?: SparklineDataPoint[]
  /** Bar and sparkline color (defaults to primary) */
  color?: string
  /** Show inline sparkline (default: true) */
  showSparkline?: boolean
  /** Additional CSS classes */
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function PortActivityBar({
  port,
  count,
  maxCount,
  sparklineData = [],
  color = 'var(--color-primary)',
  showSparkline = true,
  className,
}: PortActivityBarProps) {
  const serviceName = getServiceName(port)
  const hasKnownService = serviceName !== 'Unknown'
  const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0
  const hasSparklineData = sparklineData.length > 0 && sparklineData.some(d => d.value > 0)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'flex items-center gap-2 py-1.5 px-2 rounded-md',
            'hover:bg-muted/50 transition-colors cursor-pointer',
            'group',
            className
          )}
          role="listitem"
          aria-label={`Port ${port}${hasKnownService ? ` (${serviceName})` : ''}: ${count} observations`}
        >
          {/* Port info - fixed width for alignment */}
          <div className="flex-shrink-0 w-[90px] flex items-baseline gap-1.5 overflow-hidden">
            <span className="font-mono font-medium text-sm tabular-nums">
              {port}
            </span>
            {hasKnownService && (
              <span className="text-xs text-muted-foreground truncate">
                {serviceName}
              </span>
            )}
          </div>

          {/* Activity bar container */}
          <div className="flex-grow min-w-[100px] h-5 bg-muted/30 rounded-sm overflow-hidden relative">
            {/* Filled bar */}
            <div
              className={cn(
                'h-full rounded-sm transition-all duration-300',
                'group-hover:brightness-110'
              )}
              style={{
                width: `${Math.max(percentage, count > 0 ? 3 : 0)}%`,
                backgroundColor: color,
                opacity: count > 0 ? 0.85 : 0,
              }}
            />
            {/* Subtle pattern overlay for visual interest */}
            {count > 0 && percentage >= 10 && (
              <div
                className="absolute inset-y-0 left-0 pointer-events-none opacity-10"
                style={{
                  width: `${percentage}%`,
                  background: 'repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(255,255,255,0.1) 4px, rgba(255,255,255,0.1) 8px)',
                }}
              />
            )}
          </div>

          {/* Count value - right aligned */}
          <div className="flex-shrink-0 w-[56px] text-right">
            <span className="text-xs font-medium tabular-nums">
              {count.toLocaleString()}
            </span>
          </div>

          {/* Inline sparkline for trend */}
          {showSparkline && (
            <div className="flex-shrink-0">
              <PortSparkline
                data={hasSparklineData ? sparklineData : []}
                width={64}
                height={20}
                color={color}
                showTooltip={false}
              />
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" align="start">
        <div className="text-xs space-y-1">
          <div className="font-medium">
            Port {port}
            {hasKnownService && (
              <span className="font-normal text-muted-foreground ml-1">
                ({serviceName})
              </span>
            )}
          </div>
          <div>
            <span className="text-green-500 font-medium">
              {count.toLocaleString()}
            </span>
            <span className="text-muted-foreground ml-1">observations</span>
          </div>
          {percentage > 0 && (
            <div className="text-muted-foreground">
              {percentage.toFixed(1)}% of peak activity
            </div>
          )}
          {hasSparklineData && (
            <div className="text-muted-foreground pt-1 border-t border-border mt-1">
              {sparklineData.length} data points in trend
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export default PortActivityBar
