/**
 * Service information display component
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { cn } from '@/lib/utils'
import { getPortInfo } from './well-known-ports'

interface ServiceInfoProps {
  port?: number
  serviceName?: string | null
  serviceVersion?: string | null
  banner?: string | null
  showPort?: boolean
  compact?: boolean
  className?: string
}

/**
 * Display service information with name, version, and banner
 * Will use well-known port database as fallback if no explicit service name provided
 */
export function ServiceInfo({
  port,
  serviceName,
  serviceVersion,
  banner,
  showPort = false,
  compact = false,
  className,
}: ServiceInfoProps) {
  // Determine display name
  const portInfo = port !== undefined ? getPortInfo(port) : undefined
  const displayName = serviceName || portInfo?.name
  const description = !serviceName && portInfo ? portInfo.description : null

  if (!displayName && !serviceVersion && !banner) {
    return <span className="text-muted">—</span>
  }

  if (compact) {
    return (
      <span className={cn('font-mono text-sm', className)}>
        {showPort && port !== undefined && <span className="text-muted-foreground">{port}/</span>}
        {displayName && <span className="font-medium">{displayName}</span>}
        {serviceVersion && <span className="text-muted-foreground ml-1">{serviceVersion}</span>}
      </span>
    )
  }

  return (
    <div className={cn('space-y-1', className)}>
      {/* Service Name */}
      {displayName && (
        <div className="flex items-center gap-2">
          {showPort && port !== undefined && (
            <span className="font-mono text-muted-foreground">{port}/</span>
          )}
          <span className="font-medium">{displayName}</span>
          {serviceVersion && (
            <span className="text-sm text-muted-foreground">{serviceVersion}</span>
          )}
        </div>
      )}

      {/* Description from well-known ports */}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      {/* Banner */}
      {banner && (
        <pre className="text-xs bg-muted/50 p-2 rounded font-mono overflow-x-auto max-w-full">
          {banner}
        </pre>
      )}
    </div>
  )
}

interface ServiceBadgeProps {
  serviceName?: string | null
  port?: number
  className?: string
}

/**
 * Compact service name badge
 */
export function ServiceBadge({ serviceName, port, className }: ServiceBadgeProps) {
  const portInfo = port !== undefined ? getPortInfo(port) : undefined
  const displayName = serviceName || portInfo?.name

  if (!displayName) {
    return <span className="text-muted">unknown</span>
  }

  return (
    <span className={cn('font-mono text-sm', className)}>
      {displayName}
    </span>
  )
}
