/**
 * TCP flag badge with color coding
 * Shared infrastructure for scan and host features
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TCP_FLAGS, decodeTcpFlags } from '@/types/database'

// =============================================================================
// Constants
// =============================================================================

const FLAG_COLORS: Record<string, string> = {
  SYN: 'bg-emerald-600 text-white',
  ACK: 'bg-blue-600 text-white',
  FIN: 'bg-amber-600 text-white',
  RST: 'bg-red-600 text-white',
  PSH: 'bg-purple-600 text-white',
  URG: 'bg-orange-600 text-white',
  ECE: 'bg-cyan-600 text-white',
  CWR: 'bg-pink-600 text-white',
}

const FLAG_DESCRIPTIONS: Record<string, string> = {
  SYN: 'Synchronize - Connection initiation',
  ACK: 'Acknowledge - Confirms receipt',
  FIN: 'Finish - Connection termination',
  RST: 'Reset - Abort connection',
  PSH: 'Push - Immediate data delivery',
  URG: 'Urgent - Priority data',
  ECE: 'ECN-Echo - Congestion notification',
  CWR: 'Congestion Window Reduced',
}

// =============================================================================
// Components
// =============================================================================

interface TcpFlagBadgeProps {
  flag: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Single TCP flag badge with color coding
 */
export function TcpFlagBadge({ flag, size = 'sm' }: TcpFlagBadgeProps) {
  const colorClass = FLAG_COLORS[flag] || 'bg-muted text-foreground'

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0',
    md: 'text-xs px-2 py-0.5',
    lg: 'text-sm px-2.5 py-1',
  }

  return (
    <Badge
      variant="outline"
      className={cn('border-0', sizeClasses[size], colorClass)}
      title={FLAG_DESCRIPTIONS[flag]}
    >
      {flag}
    </Badge>
  )
}

interface TcpFlagsDisplayProps {
  /** Array of flag names (e.g., ['SYN', 'ACK']) or numeric flags value */
  flags: string[] | number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Display multiple TCP flags as colored badges
 */
export function TcpFlagsDisplay({ flags, size = 'sm', className }: TcpFlagsDisplayProps) {
  // Decode numeric flags if needed
  const flagArray = typeof flags === 'number' ? decodeTcpFlags(flags) : flags

  if (flagArray.length === 0) {
    return <span className="text-muted">—</span>
  }

  return (
    <div className={cn('flex gap-1 flex-wrap', className)}>
      {flagArray.map((flag) => (
        <TcpFlagBadge key={flag} flag={flag} size={size} />
      ))}
    </div>
  )
}

interface TcpFlagsCompactProps {
  flags: number
  className?: string
}

/**
 * Compact TCP flags display as letter abbreviations (e.g., "SA" for SYN+ACK)
 */
export function TcpFlagsCompact({ flags, className }: TcpFlagsCompactProps) {
  const parts: string[] = []

  if (flags & TCP_FLAGS.SYN) parts.push('S')
  if (flags & TCP_FLAGS.ACK) parts.push('A')
  if (flags & TCP_FLAGS.FIN) parts.push('F')
  if (flags & TCP_FLAGS.RST) parts.push('R')
  if (flags & TCP_FLAGS.PSH) parts.push('P')
  if (flags & TCP_FLAGS.URG) parts.push('U')
  if (flags & TCP_FLAGS.ECE) parts.push('E')
  if (flags & TCP_FLAGS.CWR) parts.push('C')

  if (parts.length === 0) {
    return <span className="text-muted">—</span>
  }

  // Determine color based on most significant flag
  const getColorClass = () => {
    if (flags & TCP_FLAGS.RST) return 'text-red-500'
    if (flags & TCP_FLAGS.SYN && flags & TCP_FLAGS.ACK) return 'text-emerald-500'
    if (flags & TCP_FLAGS.SYN) return 'text-emerald-400'
    if (flags & TCP_FLAGS.FIN) return 'text-amber-500'
    return 'text-blue-500'
  }

  return (
    <span className={cn('font-mono font-bold', getColorClass(), className)}>
      {parts.join('')}
    </span>
  )
}

export default TcpFlagsDisplay
