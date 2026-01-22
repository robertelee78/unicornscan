/**
 * Connection status banner - shows when offline
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useEffect } from 'react'
import { WifiOff, Wifi, X } from 'lucide-react'
import { useOnlineStatus } from './useOnlineStatus'
import { cn } from '@/lib/utils'

interface ConnectionBannerProps {
  className?: string
}

export function ConnectionBanner({ className }: ConnectionBannerProps) {
  const { isOnline, wasOffline } = useOnlineStatus()
  const [showReconnected, setShowReconnected] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Show "back online" message when reconnecting after being offline
  // Note: setState in effect is intentional here - we're responding to external events
  useEffect(() => {
    if (isOnline && wasOffline) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowReconnected(true)
      setDismissed(false)
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setShowReconnected(false)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [isOnline, wasOffline])

  // Reset dismissed state when going offline
  // Note: setState in effect is intentional here - we're responding to external events
  useEffect(() => {
    if (!isOnline) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(false)
    }
  }, [isOnline])

  // Don't render if online and nothing to show
  if (isOnline && !showReconnected) {
    return null
  }

  // Don't render if dismissed (only for reconnected message)
  if (dismissed && isOnline) {
    return null
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium',
        isOnline
          ? 'bg-green-500/10 text-green-700 dark:text-green-400 border-b border-green-500/20'
          : 'bg-warning/10 text-warning border-b border-warning/20',
        className
      )}
      role="status"
      aria-live="polite"
    >
      {isOnline ? (
        <>
          <Wifi className="h-4 w-4" />
          <span>Back online</span>
          <span className="text-muted">— Cached data is now being refreshed</span>
          <button
            onClick={() => setDismissed(true)}
            className="ml-2 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10"
            aria-label="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span>You're offline</span>
          <span className="text-muted">— Showing cached data</span>
        </>
      )}
    </div>
  )
}

/**
 * Compact connection indicator for header
 */
export function ConnectionIndicator({ className }: { className?: string }) {
  const { isOnline } = useOnlineStatus()

  if (isOnline) {
    return null // Don't show anything when online
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium',
        'bg-warning/10 text-warning',
        className
      )}
      title="You are offline. Showing cached data."
    >
      <WifiOff className="h-3 w-3" />
      <span>Offline</span>
    </div>
  )
}
