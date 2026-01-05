/**
 * Protocol indicator badge
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { IP_PROTOCOLS } from '@/types/database'
import type { Protocol } from './types'

interface ProtocolBadgeProps {
  protocol: Protocol | number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const PROTOCOL_COLORS: Record<Protocol, string> = {
  tcp: 'bg-blue-600 text-white',
  udp: 'bg-emerald-600 text-white',
  icmp: 'bg-amber-600 text-white',
  other: 'bg-muted text-foreground',
}

/**
 * Convert numeric protocol to string
 */
function normalizeProtocol(protocol: Protocol | number): Protocol {
  if (typeof protocol === 'string') return protocol
  switch (protocol) {
    case IP_PROTOCOLS.TCP: return 'tcp'
    case IP_PROTOCOLS.UDP: return 'udp'
    case IP_PROTOCOLS.ICMP: return 'icmp'
    default: return 'other'
  }
}

/**
 * Display protocol type with colored badge
 */
export function ProtocolBadge({ protocol, size = 'sm', className }: ProtocolBadgeProps) {
  const normalizedProtocol = normalizeProtocol(protocol)

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0 uppercase',
    md: 'text-xs px-2 py-0.5 uppercase',
    lg: 'text-sm px-2.5 py-1 uppercase',
  }

  const colorClass = PROTOCOL_COLORS[normalizedProtocol]

  return (
    <Badge
      variant="outline"
      className={cn(
        'border-0 font-medium',
        sizeClasses[size],
        colorClass,
        className
      )}
    >
      {normalizedProtocol}
    </Badge>
  )
}

interface ProtocolTextProps {
  protocol: Protocol | number
  uppercase?: boolean
  className?: string
}

/**
 * Simple protocol text without badge styling
 */
export function ProtocolText({ protocol, uppercase = true, className }: ProtocolTextProps) {
  const normalizedProtocol = normalizeProtocol(protocol)

  const colorClass = {
    tcp: 'text-blue-500',
    udp: 'text-emerald-500',
    icmp: 'text-amber-500',
    other: 'text-muted-foreground',
  }[normalizedProtocol]

  return (
    <span className={cn('font-medium', colorClass, className)}>
      {uppercase ? normalizedProtocol.toUpperCase() : normalizedProtocol}
    </span>
  )
}
