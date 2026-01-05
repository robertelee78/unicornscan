/**
 * Port badge with service name and coloring
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getPortInfo, isDangerousPort, getCategoryColor } from './well-known-ports'

interface PortBadgeProps {
  port: number
  showService?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Display a port number with optional service name and category-based coloring
 */
export function PortBadge({ port, showService = true, size = 'md', className }: PortBadgeProps) {
  const portInfo = getPortInfo(port)
  const isDangerous = isDangerousPort(port)

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0',
    md: 'text-xs px-2 py-0.5',
    lg: 'text-sm px-2.5 py-1',
  }

  // Determine background color based on category or danger level
  const getBgClass = () => {
    if (isDangerous) return 'bg-red-600/10 border-red-500/30'
    if (!portInfo) return 'bg-muted border-border'

    switch (portInfo.category) {
      case 'web': return 'bg-blue-600/10 border-blue-500/30'
      case 'database': return 'bg-purple-600/10 border-purple-500/30'
      case 'mail': return 'bg-amber-600/10 border-amber-500/30'
      case 'file': return 'bg-green-600/10 border-green-500/30'
      case 'remote': return 'bg-orange-600/10 border-orange-500/30'
      case 'security': return 'bg-cyan-600/10 border-cyan-500/30'
      case 'messaging': return 'bg-pink-600/10 border-pink-500/30'
      default: return 'bg-muted border-border'
    }
  }

  const textColorClass = portInfo ? getCategoryColor(portInfo.category) : 'text-muted-foreground'

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-mono',
        sizeClasses[size],
        getBgClass(),
        isDangerous && 'border-port-category-danger/50',
        className
      )}
    >
      <span className={cn('font-bold', isDangerous ? 'text-port-category-danger' : textColorClass)}>
        {port}
      </span>
      {showService && portInfo && (
        <span className="ml-1 text-muted-foreground font-normal">
          /{portInfo.name}
        </span>
      )}
    </Badge>
  )
}

interface PortNumberProps {
  port: number
  className?: string
}

/**
 * Simple port number display without badge styling
 */
export function PortNumber({ port, className }: PortNumberProps) {
  const portInfo = getPortInfo(port)
  const isDangerous = isDangerousPort(port)

  return (
    <span className={cn('font-mono', className)}>
      <span className={cn(isDangerous && 'text-port-category-danger')}>
        {port}
      </span>
      {portInfo && (
        <span className="text-muted-foreground">
          /{portInfo.name}
        </span>
      )}
    </span>
  )
}
