/**
 * Unit tests for src/components/error/ErrorFallback.tsx
 * Tests error display, retry button, compact mode, and error code display
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorFallback, ErrorPage } from '@/components/error/ErrorFallback'

describe('ErrorFallback', () => {
  describe('basic rendering', () => {
    it('displays error title and message', () => {
      render(<ErrorFallback error={new Error('Something went wrong')} />)

      // Should parse error and show title
      expect(screen.getByRole('heading')).toBeInTheDocument()
      // Message should be displayed
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    })

    it('renders as a Card by default', () => {
      const { container } = render(<ErrorFallback error={new Error('Test')} />)

      // Should have card-like structure (Card uses border class)
      expect(container.querySelector('[class*="border-destructive"]')).toBeInTheDocument()
    })

    it('displays error icon', () => {
      render(<ErrorFallback error={new Error('Test')} />)

      // AlertTriangle icon should be present (check for SVG)
      const svg = document.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })

  describe('error parsing', () => {
    it('handles network errors', () => {
      render(<ErrorFallback error={new Error('Failed to fetch')} />)

      expect(screen.getByText('Connection Error')).toBeInTheDocument()
    })

    it('handles timeout errors', () => {
      render(<ErrorFallback error={new Error('Request timeout')} />)

      expect(screen.getByText('Request Timeout')).toBeInTheDocument()
    })

    it('handles database errors', () => {
      render(<ErrorFallback error={new Error('relation "scans" does not exist')} />)

      expect(screen.getByText('Database Schema Error')).toBeInTheDocument()
    })

    it('handles null/undefined errors', () => {
      render(<ErrorFallback error={null} />)

      expect(screen.getByText('Unknown Error')).toBeInTheDocument()
    })

    it('handles error objects with code property', () => {
      const error = new Error('Something failed') as Error & { code: string }
      error.code = 'ERR_CUSTOM_001'
      render(<ErrorFallback error={error} />)

      expect(screen.getByText(/ERR_CUSTOM_001/)).toBeInTheDocument()
    })
  })

  describe('retry button', () => {
    it('shows retry button for retryable errors when resetError provided', () => {
      const resetError = vi.fn()
      render(<ErrorFallback error={new Error('Network error')} resetError={resetError} />)

      const retryButton = screen.getByRole('button', { name: /try again/i })
      expect(retryButton).toBeInTheDocument()
    })

    it('calls resetError when retry button clicked', () => {
      const resetError = vi.fn()
      render(<ErrorFallback error={new Error('Network error')} resetError={resetError} />)

      const retryButton = screen.getByRole('button', { name: /try again/i })
      fireEvent.click(retryButton)

      expect(resetError).toHaveBeenCalledTimes(1)
    })

    it('does not show retry button when resetError not provided', () => {
      render(<ErrorFallback error={new Error('Network error')} />)

      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
    })

    it('does not show retry button for non-retryable errors', () => {
      const resetError = vi.fn()
      render(
        <ErrorFallback
          error={new Error('404 Not Found')}
          resetError={resetError}
        />
      )

      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
    })
  })

  describe('home button', () => {
    it('shows home button when showHomeButton is true', () => {
      render(<ErrorFallback error={new Error('Test')} showHomeButton />)

      const homeLink = screen.getByRole('link', { name: /dashboard/i })
      expect(homeLink).toBeInTheDocument()
      expect(homeLink).toHaveAttribute('href', '/')
    })

    it('does not show home button by default', () => {
      render(<ErrorFallback error={new Error('Test')} />)

      expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument()
    })
  })

  describe('compact mode', () => {
    it('renders compact layout when compact is true', () => {
      const { container } = render(
        <ErrorFallback error={new Error('Test error')} compact />
      )

      // Compact mode should not have card wrapper
      expect(container.querySelector('[class*="card"]')).not.toBeInTheDocument()
      // Should have flex layout
      expect(container.firstChild).toHaveClass('flex')
    })

    it('shows error message in compact mode', () => {
      render(<ErrorFallback error={new Error('Compact test')} compact />)

      expect(screen.getByText(/compact test/i)).toBeInTheDocument()
    })

    it('shows retry button in compact mode for retryable errors', () => {
      const resetError = vi.fn()
      render(
        <ErrorFallback
          error={new Error('Network error')}
          resetError={resetError}
          compact
        />
      )

      const retryButton = screen.getByRole('button', { name: /retry/i })
      expect(retryButton).toBeInTheDocument()
    })

    it('truncates long messages in compact mode', () => {
      const { container } = render(
        <ErrorFallback error={new Error('Very long error message')} compact />
      )

      // Check for truncate class
      const messageElement = container.querySelector('.truncate')
      expect(messageElement).toBeInTheDocument()
    })
  })

  describe('error code display', () => {
    it('displays error code when present', () => {
      const error = { message: 'Test', code: 'ERR_123' }
      render(<ErrorFallback error={error} />)

      expect(screen.getByText(/error code.*ERR_123/i)).toBeInTheDocument()
    })

    it('does not display error code section when no code', () => {
      render(<ErrorFallback error={new Error('No code error')} />)

      expect(screen.queryByText(/error code/i)).not.toBeInTheDocument()
    })
  })
})

describe('ErrorPage', () => {
  it('renders full-page error layout', () => {
    const { container } = render(<ErrorPage error={new Error('Test')} />)

    // Should have centered layout
    expect(container.querySelector('.min-h-\\[60vh\\]')).toBeInTheDocument()
    expect(container.querySelector('.text-center')).toBeInTheDocument()
  })

  it('displays large error icon', () => {
    render(<ErrorPage error={new Error('Test')} />)

    // Should have large icon (h-16)
    const svg = document.querySelector('svg.h-16')
    expect(svg).toBeInTheDocument()
  })

  it('displays error title as h1', () => {
    render(<ErrorPage error={new Error('Network error')} />)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Connection Error')
  })

  it('shows retry button for retryable errors', () => {
    const resetError = vi.fn()
    render(<ErrorPage error={new Error('Network error')} resetError={resetError} />)

    const retryButton = screen.getByRole('button', { name: /try again/i })
    expect(retryButton).toBeInTheDocument()

    fireEvent.click(retryButton)
    expect(resetError).toHaveBeenCalledTimes(1)
  })

  it('always shows dashboard link', () => {
    render(<ErrorPage error={new Error('Test')} />)

    const dashboardLink = screen.getByRole('link', { name: /return to dashboard/i })
    expect(dashboardLink).toBeInTheDocument()
    expect(dashboardLink).toHaveAttribute('href', '/')
  })

  it('shows error code when present', () => {
    const error = { message: 'Test', code: 'PGRST001' }
    render(<ErrorPage error={error} />)

    expect(screen.getByText(/error code.*PGRST001/i)).toBeInTheDocument()
  })
})
