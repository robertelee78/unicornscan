/**
 * TCP flag badge with color coding
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface TcpFlagBadgeProps {
  flag: string
}

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

export function TcpFlagBadge({ flag }: TcpFlagBadgeProps) {
  const colorClass = FLAG_COLORS[flag] || 'bg-muted text-muted-foreground'

  return (
    <Badge
      variant="outline"
      className={cn('border-0 text-[10px] px-1.5 py-0', colorClass)}
    >
      {flag}
    </Badge>
  )
}

interface TcpFlagsDisplayProps {
  flags: string[]
  className?: string
}

export function TcpFlagsDisplay({ flags, className }: TcpFlagsDisplayProps) {
  if (flags.length === 0) {
    return <span className="text-muted">-</span>
  }

  return (
    <div className={cn('flex gap-1 flex-wrap', className)}>
      {flags.map((flag) => (
        <TcpFlagBadge key={flag} flag={flag} />
      ))}
    </div>
  )
}
