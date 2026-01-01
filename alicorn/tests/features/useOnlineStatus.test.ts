/**
 * Unit tests for src/features/connection/useOnlineStatus.ts
 * Tests browser online/offline status hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnlineStatus } from '@/features/connection/useOnlineStatus'

describe('useOnlineStatus', () => {
  let originalNavigator: typeof navigator
  let mockNavigatorOnLine: boolean
  const listeners: Record<string, EventListener[]> = {
    online: [],
    offline: [],
  }

  beforeEach(() => {
    // Reset listeners
    listeners.online = []
    listeners.offline = []

    // Mock navigator.onLine
    mockNavigatorOnLine = true
    originalNavigator = window.navigator

    Object.defineProperty(window, 'navigator', {
      value: {
        ...originalNavigator,
        get onLine() {
          return mockNavigatorOnLine
        },
      },
      writable: true,
      configurable: true,
    })

    // Mock addEventListener and removeEventListener
    vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'online' || event === 'offline') {
        listeners[event].push(handler as EventListener)
      }
    })

    vi.spyOn(window, 'removeEventListener').mockImplementation((event, handler) => {
      if (event === 'online' || event === 'offline') {
        const index = listeners[event].indexOf(handler as EventListener)
        if (index > -1) {
          listeners[event].splice(index, 1)
        }
      }
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    })
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('returns online when navigator.onLine is true', () => {
      mockNavigatorOnLine = true
      const { result } = renderHook(() => useOnlineStatus())

      expect(result.current.isOnline).toBe(true)
      expect(result.current.wasOffline).toBe(false)
      expect(result.current.lastOfflineAt).toBeNull()
    })

    it('returns offline when navigator.onLine is false', () => {
      mockNavigatorOnLine = false
      const { result } = renderHook(() => useOnlineStatus())

      expect(result.current.isOnline).toBe(false)
    })
  })

  describe('event listeners', () => {
    it('adds online and offline event listeners on mount', () => {
      renderHook(() => useOnlineStatus())

      expect(window.addEventListener).toHaveBeenCalledWith('online', expect.any(Function))
      expect(window.addEventListener).toHaveBeenCalledWith('offline', expect.any(Function))
    })

    it('removes event listeners on unmount', () => {
      const { unmount } = renderHook(() => useOnlineStatus())

      unmount()

      expect(window.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function))
      expect(window.removeEventListener).toHaveBeenCalledWith('offline', expect.any(Function))
    })
  })

  describe('online event', () => {
    it('sets isOnline to true when online event fires', () => {
      mockNavigatorOnLine = false
      const { result } = renderHook(() => useOnlineStatus())

      expect(result.current.isOnline).toBe(false)

      // Simulate going online
      act(() => {
        listeners.online.forEach((handler) => handler(new Event('online')))
      })

      expect(result.current.isOnline).toBe(true)
    })
  })

  describe('offline event', () => {
    it('sets isOnline to false when offline event fires', () => {
      mockNavigatorOnLine = true
      const { result } = renderHook(() => useOnlineStatus())

      expect(result.current.isOnline).toBe(true)

      // Simulate going offline
      act(() => {
        listeners.offline.forEach((handler) => handler(new Event('offline')))
      })

      expect(result.current.isOnline).toBe(false)
    })

    it('sets wasOffline to true when going offline', () => {
      const { result } = renderHook(() => useOnlineStatus())

      expect(result.current.wasOffline).toBe(false)

      // Simulate going offline
      act(() => {
        listeners.offline.forEach((handler) => handler(new Event('offline')))
      })

      expect(result.current.wasOffline).toBe(true)
    })

    it('sets lastOfflineAt when going offline', () => {
      const { result } = renderHook(() => useOnlineStatus())

      expect(result.current.lastOfflineAt).toBeNull()

      const beforeOffline = Date.now()

      // Simulate going offline
      act(() => {
        listeners.offline.forEach((handler) => handler(new Event('offline')))
      })

      const afterOffline = Date.now()

      expect(result.current.lastOfflineAt).toBeInstanceOf(Date)
      expect(result.current.lastOfflineAt!.getTime()).toBeGreaterThanOrEqual(beforeOffline)
      expect(result.current.lastOfflineAt!.getTime()).toBeLessThanOrEqual(afterOffline)
    })
  })

  describe('wasOffline persistence', () => {
    it('wasOffline remains true after coming back online', () => {
      const { result } = renderHook(() => useOnlineStatus())

      // Go offline
      act(() => {
        listeners.offline.forEach((handler) => handler(new Event('offline')))
      })

      expect(result.current.wasOffline).toBe(true)

      // Go back online
      act(() => {
        listeners.online.forEach((handler) => handler(new Event('online')))
      })

      // wasOffline should still be true
      expect(result.current.isOnline).toBe(true)
      expect(result.current.wasOffline).toBe(true)
    })
  })

  describe('lastOfflineAt persistence', () => {
    it('lastOfflineAt persists after coming back online', () => {
      const { result } = renderHook(() => useOnlineStatus())

      // Go offline
      act(() => {
        listeners.offline.forEach((handler) => handler(new Event('offline')))
      })

      const offlineTime = result.current.lastOfflineAt

      // Go back online
      act(() => {
        listeners.online.forEach((handler) => handler(new Event('online')))
      })

      // lastOfflineAt should be preserved
      expect(result.current.lastOfflineAt).toEqual(offlineTime)
    })

    it('lastOfflineAt updates when going offline again', async () => {
      const { result } = renderHook(() => useOnlineStatus())

      // First offline
      act(() => {
        listeners.offline.forEach((handler) => handler(new Event('offline')))
      })

      const firstOfflineTime = result.current.lastOfflineAt?.getTime()

      // Back online
      act(() => {
        listeners.online.forEach((handler) => handler(new Event('online')))
      })

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Second offline
      act(() => {
        listeners.offline.forEach((handler) => handler(new Event('offline')))
      })

      expect(result.current.lastOfflineAt!.getTime()).toBeGreaterThan(firstOfflineTime!)
    })
  })

  describe('multiple renders', () => {
    it('returns consistent values across re-renders', () => {
      const { result, rerender } = renderHook(() => useOnlineStatus())

      const initialValue = result.current

      rerender()

      expect(result.current.isOnline).toBe(initialValue.isOnline)
      expect(result.current.wasOffline).toBe(initialValue.wasOffline)
    })
  })
})
