/**
 * Unit tests for src/features/connection/ConnectionBanner.tsx
 * Tests online/offline states, reconnection messages, and dismissal
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

// We need to mock the useOnlineStatus hook before importing the component
vi.mock('@/features/connection/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(),
}))

import { ConnectionBanner, ConnectionIndicator } from '@/features/connection/ConnectionBanner'
import { useOnlineStatus } from '@/features/connection/useOnlineStatus'

const mockUseOnlineStatus = vi.mocked(useOnlineStatus)

describe('ConnectionBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Default: online
    mockUseOnlineStatus.mockReturnValue({
      isOnline: true,
      wasOffline: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('when online and never was offline', () => {
    it('renders nothing', () => {
      const { container } = render(<ConnectionBanner />)

      expect(container.firstChild).toBeNull()
    })
  })

  describe('when offline', () => {
    beforeEach(() => {
      mockUseOnlineStatus.mockReturnValue({
        isOnline: false,
        wasOffline: false,
      })
    })

    it('shows offline banner', () => {
      render(<ConnectionBanner />)

      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(screen.getByText(/you're offline/i)).toBeInTheDocument()
    })

    it('shows cached data message', () => {
      render(<ConnectionBanner />)

      expect(screen.getByText(/showing cached data/i)).toBeInTheDocument()
    })

    it('shows WifiOff icon', () => {
      render(<ConnectionBanner />)

      // Should have SVG icon
      const status = screen.getByRole('status')
      const svg = status.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('does not show dismiss button when offline', () => {
      render(<ConnectionBanner />)

      expect(screen.queryByLabelText('Dismiss')).not.toBeInTheDocument()
    })

    it('applies warning styling', () => {
      render(<ConnectionBanner />)

      const banner = screen.getByRole('status')
      expect(banner).toHaveClass('bg-warning/10')
    })
  })

  describe('when reconnecting', () => {
    beforeEach(() => {
      mockUseOnlineStatus.mockReturnValue({
        isOnline: true,
        wasOffline: true,
      })
    })

    it('shows back online message', () => {
      render(<ConnectionBanner />)

      expect(screen.getByText(/back online/i)).toBeInTheDocument()
    })

    it('shows refresh message', () => {
      render(<ConnectionBanner />)

      expect(screen.getByText(/cached data is now being refreshed/i)).toBeInTheDocument()
    })

    it('shows dismiss button', () => {
      render(<ConnectionBanner />)

      expect(screen.getByLabelText('Dismiss')).toBeInTheDocument()
    })

    it('applies success styling', () => {
      render(<ConnectionBanner />)

      const banner = screen.getByRole('status')
      expect(banner).toHaveClass('bg-green-500/10')
    })

    it('dismisses when dismiss button clicked', () => {
      render(<ConnectionBanner />)

      const dismissButton = screen.getByLabelText('Dismiss')
      fireEvent.click(dismissButton)

      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('auto-hides after 5 seconds', async () => {
      render(<ConnectionBanner />)

      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(screen.getByText(/back online/i)).toBeInTheDocument()

      // Advance timers by 5 seconds
      await act(async () => {
        vi.advanceTimersByTime(5000)
      })

      // The reconnected message should be hidden
      expect(screen.queryByText(/back online/i)).not.toBeInTheDocument()
    })
  })

  describe('transition from offline to online', () => {
    it('shows reconnection message when transitioning', () => {
      // Start offline
      mockUseOnlineStatus.mockReturnValue({
        isOnline: false,
        wasOffline: false,
      })

      const { rerender } = render(<ConnectionBanner />)
      expect(screen.getByText(/you're offline/i)).toBeInTheDocument()

      // Go online after being offline
      mockUseOnlineStatus.mockReturnValue({
        isOnline: true,
        wasOffline: true,
      })

      rerender(<ConnectionBanner />)
      expect(screen.getByText(/back online/i)).toBeInTheDocument()
    })

    it('resets dismissed state when going offline again', () => {
      // Start online after being offline
      mockUseOnlineStatus.mockReturnValue({
        isOnline: true,
        wasOffline: true,
      })

      const { rerender } = render(<ConnectionBanner />)

      // Dismiss the banner
      fireEvent.click(screen.getByLabelText('Dismiss'))
      expect(screen.queryByRole('status')).not.toBeInTheDocument()

      // Go offline
      mockUseOnlineStatus.mockReturnValue({
        isOnline: false,
        wasOffline: true,
      })

      rerender(<ConnectionBanner />)
      // Should show offline message again
      expect(screen.getByText(/you're offline/i)).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has role="status" for screen readers', () => {
      mockUseOnlineStatus.mockReturnValue({
        isOnline: false,
        wasOffline: false,
      })

      render(<ConnectionBanner />)

      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('has aria-live="polite" for announcements', () => {
      mockUseOnlineStatus.mockReturnValue({
        isOnline: false,
        wasOffline: false,
      })

      render(<ConnectionBanner />)

      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    })

    it('dismiss button has aria-label', () => {
      mockUseOnlineStatus.mockReturnValue({
        isOnline: true,
        wasOffline: true,
      })

      render(<ConnectionBanner />)

      expect(screen.getByLabelText('Dismiss')).toBeInTheDocument()
    })
  })

  describe('className prop', () => {
    it('applies custom className', () => {
      mockUseOnlineStatus.mockReturnValue({
        isOnline: false,
        wasOffline: false,
      })

      render(<ConnectionBanner className="custom-class" />)

      expect(screen.getByRole('status')).toHaveClass('custom-class')
    })
  })
})

describe('ConnectionIndicator', () => {
  beforeEach(() => {
    mockUseOnlineStatus.mockReturnValue({
      isOnline: true,
      wasOffline: false,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('when online', () => {
    it('renders nothing', () => {
      const { container } = render(<ConnectionIndicator />)

      expect(container.firstChild).toBeNull()
    })
  })

  describe('when offline', () => {
    beforeEach(() => {
      mockUseOnlineStatus.mockReturnValue({
        isOnline: false,
        wasOffline: false,
      })
    })

    it('shows offline indicator', () => {
      render(<ConnectionIndicator />)

      expect(screen.getByText('Offline')).toBeInTheDocument()
    })

    it('has title for tooltip', () => {
      render(<ConnectionIndicator />)

      expect(screen.getByTitle(/you are offline/i)).toBeInTheDocument()
    })

    it('shows WifiOff icon', () => {
      render(<ConnectionIndicator />)

      const container = screen.getByTitle(/you are offline/i)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('applies compact styling', () => {
      render(<ConnectionIndicator />)

      const indicator = screen.getByTitle(/you are offline/i)
      expect(indicator).toHaveClass('text-xs')
    })
  })

  describe('className prop', () => {
    it('applies custom className', () => {
      mockUseOnlineStatus.mockReturnValue({
        isOnline: false,
        wasOffline: false,
      })

      render(<ConnectionIndicator className="custom-indicator" />)

      expect(screen.getByTitle(/you are offline/i)).toHaveClass('custom-indicator')
    })
  })
})
