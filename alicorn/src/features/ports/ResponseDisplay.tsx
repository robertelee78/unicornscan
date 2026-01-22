/**
 * Response type display for unicornscan results
 * Shows what actually came back: TCP flags, ICMP type/code, UDP response
 * Unicornscan philosophy: record the raw stimulus/response, let the analyst interpret
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { IP_PROTOCOLS } from '@/types/database'
import { TcpFlagsDisplay } from './TcpFlagBadge'
import { classifyResponse } from './response-utils'

// =============================================================================
// Components
// =============================================================================

interface ResponseBadgeProps {
  protocol: number
  flags: number
  icmpType?: number
  icmpCode?: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Badge showing the response category (SYN+ACK, RST, ICMP Unreachable, etc.)
 */
export function ResponseBadge({
  protocol,
  flags,
  icmpType,
  icmpCode,
  size = 'sm',
  className,
}: ResponseBadgeProps) {
  const classification = classifyResponse(protocol, flags, icmpType, icmpCode)

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0',
    md: 'text-xs px-2 py-0.5',
    lg: 'text-sm px-2.5 py-1',
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        'border-0 font-medium',
        sizeClasses[size],
        classification.colorClass,
        className
      )}
      title={classification.detail}
    >
      {classification.summary}
    </Badge>
  )
}

interface ResponseDisplayProps {
  protocol: number
  flags: number
  icmpType?: number
  icmpCode?: number
  showFlags?: boolean  // Show individual TCP flags as badges
  compact?: boolean
  className?: string
}

/**
 * Full response display - shows response type and optionally individual flags
 */
export function ResponseDisplay({
  protocol,
  flags,
  icmpType,
  icmpCode,
  showFlags = false,
  compact = false,
  className,
}: ResponseDisplayProps) {
  const classification = classifyResponse(protocol, flags, icmpType, icmpCode)

  // For TCP, optionally show individual flag badges
  if (protocol === IP_PROTOCOLS.TCP && showFlags) {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <TcpFlagsDisplay flags={flags} size={compact ? 'sm' : 'md'} />
        {!compact && (
          <span className="text-xs text-muted-foreground">
            {classification.detail}
          </span>
        )}
      </div>
    )
  }

  // For other protocols or when not showing individual flags
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <ResponseBadge
        protocol={protocol}
        flags={flags}
        icmpType={icmpType}
        icmpCode={icmpCode}
        size={compact ? 'sm' : 'md'}
      />
      {!compact && (
        <span className="text-xs text-muted-foreground">
          {classification.detail}
        </span>
      )}
    </div>
  )
}

export default ResponseDisplay
