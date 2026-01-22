/**
 * Online status hook - detects browser online/offline state
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useEffect, useCallback } from 'react'

interface OnlineStatusResult {
  isOnline: boolean
  wasOffline: boolean
  lastOfflineAt: Date | null
}

/**
 * Hook to track browser online/offline status
 * Uses navigator.onLine + event listeners (event-driven, no polling)
 */
export function useOnlineStatus(): OnlineStatusResult {
  const [isOnline, setIsOnline] = useState(() => {
    // Start with true in SSR or if navigator is unavailable
    if (typeof navigator === 'undefined') return true
    return navigator.onLine
  })
  const [wasOffline, setWasOffline] = useState(false)
  const [lastOfflineAt, setLastOfflineAt] = useState<Date | null>(null)

  const handleOnline = useCallback(() => {
    setIsOnline(true)
  }, [])

  const handleOffline = useCallback(() => {
    setIsOnline(false)
    setWasOffline(true)
    setLastOfflineAt(new Date())
  }, [])

  useEffect(() => {
    // Add event listeners
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [handleOnline, handleOffline])

  return { isOnline, wasOffline, lastOfflineAt }
}

/**
 * Hook to clear the "was offline" indicator
 */
export function useAcknowledgeOnline() {
  // This would be used to clear the "back online" banner after user acknowledges
  // For now, the banner auto-hides when they interact with the app
}
