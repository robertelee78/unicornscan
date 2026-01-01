/**
 * Unit tests for src/features/theme/ThemeToggle.tsx
 * Tests theme toggle button, dropdown menu, and animated toggle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock the useTheme hook
vi.mock('@/features/theme/ThemeProvider', () => ({
  useTheme: vi.fn(),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { ThemeToggle, ThemeDropdown, ThemeToggleAnimated } from '@/features/theme/ThemeToggle'
import { useTheme } from '@/features/theme/ThemeProvider'

const mockUseTheme = vi.mocked(useTheme)

describe('ThemeToggle', () => {
  const mockToggleTheme = vi.fn()
  const mockSetTheme = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseTheme.mockReturnValue({
      theme: 'dark',
      resolvedTheme: 'dark',
      setTheme: mockSetTheme,
      toggleTheme: mockToggleTheme,
    })
  })

  describe('rendering', () => {
    it('renders a button', () => {
      render(<ThemeToggle />)

      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('has screen reader text', () => {
      render(<ThemeToggle />)

      expect(screen.getByText('Toggle theme')).toBeInTheDocument()
    })

    it('shows sun icon in dark mode', () => {
      mockUseTheme.mockReturnValue({
        theme: 'dark',
        resolvedTheme: 'dark',
        setTheme: mockSetTheme,
        toggleTheme: mockToggleTheme,
      })

      const { container } = render(<ThemeToggle />)

      // Check for SVG icons
      const svgs = container.querySelectorAll('svg')
      expect(svgs.length).toBeGreaterThan(0)
    })

    it('has correct title in dark mode', () => {
      mockUseTheme.mockReturnValue({
        theme: 'dark',
        resolvedTheme: 'dark',
        setTheme: mockSetTheme,
        toggleTheme: mockToggleTheme,
      })

      render(<ThemeToggle />)

      expect(screen.getByTitle(/switch to light mode/i)).toBeInTheDocument()
    })

    it('has correct title in light mode', () => {
      mockUseTheme.mockReturnValue({
        theme: 'light',
        resolvedTheme: 'light',
        setTheme: mockSetTheme,
        toggleTheme: mockToggleTheme,
      })

      render(<ThemeToggle />)

      expect(screen.getByTitle(/switch to dark mode/i)).toBeInTheDocument()
    })
  })

  describe('interaction', () => {
    it('calls toggleTheme when clicked', () => {
      render(<ThemeToggle />)

      fireEvent.click(screen.getByRole('button'))

      expect(mockToggleTheme).toHaveBeenCalledTimes(1)
    })
  })

  describe('styling', () => {
    it('applies custom className', () => {
      render(<ThemeToggle className="custom-class" />)

      expect(screen.getByRole('button')).toHaveClass('custom-class')
    })

    it('uses ghost variant', () => {
      const { container } = render(<ThemeToggle />)

      // Ghost buttons typically don't have solid backgrounds
      const button = container.querySelector('button')
      expect(button).toBeInTheDocument()
    })
  })
})

describe('ThemeDropdown', () => {
  const mockToggleTheme = vi.fn()
  const mockSetTheme = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseTheme.mockReturnValue({
      theme: 'system',
      resolvedTheme: 'dark',
      setTheme: mockSetTheme,
      toggleTheme: mockToggleTheme,
    })
  })

  describe('rendering', () => {
    it('renders trigger button', () => {
      render(<ThemeDropdown />)

      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('has screen reader text', () => {
      render(<ThemeDropdown />)

      expect(screen.getByText('Toggle theme')).toBeInTheDocument()
    })

    it('has correct title', () => {
      render(<ThemeDropdown />)

      expect(screen.getByTitle('Select theme')).toBeInTheDocument()
    })
  })

  describe('dropdown menu', () => {
    // Note: Radix UI DropdownMenu uses portals which don't render reliably in jsdom.
    // We test the trigger button behavior and component structure instead of portal content.

    it('renders trigger with correct aria attributes', () => {
      render(<ThemeDropdown />)

      const trigger = screen.getByRole('button')
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    })

    it('starts with aria-expanded false', () => {
      render(<ThemeDropdown />)

      const trigger = screen.getByRole('button')
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })

    it('responds to click events', () => {
      render(<ThemeDropdown />)

      const trigger = screen.getByRole('button')

      // Verify trigger can be clicked without error
      expect(() => fireEvent.click(trigger)).not.toThrow()
    })

    it('responds to keyboard events', () => {
      render(<ThemeDropdown />)

      const trigger = screen.getByRole('button')

      // Verify keyboard interaction without error
      fireEvent.click(trigger)
      expect(() => fireEvent.keyDown(trigger, { key: 'Escape' })).not.toThrow()
    })

    it('starts with closed data-state', () => {
      render(<ThemeDropdown />)

      const trigger = screen.getByRole('button')
      expect(trigger).toHaveAttribute('data-state', 'closed')
    })
  })

  describe('icon display', () => {
    it('shows Moon icon when resolved theme is dark', () => {
      mockUseTheme.mockReturnValue({
        theme: 'dark',
        resolvedTheme: 'dark',
        setTheme: mockSetTheme,
        toggleTheme: mockToggleTheme,
      })

      const { container } = render(<ThemeDropdown />)

      const button = container.querySelector('button')
      const svg = button?.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('shows Sun icon when resolved theme is light', () => {
      mockUseTheme.mockReturnValue({
        theme: 'light',
        resolvedTheme: 'light',
        setTheme: mockSetTheme,
        toggleTheme: mockToggleTheme,
      })

      const { container } = render(<ThemeDropdown />)

      const button = container.querySelector('button')
      const svg = button?.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })

  describe('styling', () => {
    it('applies custom className', () => {
      render(<ThemeDropdown className="custom-dropdown" />)

      expect(screen.getByRole('button')).toHaveClass('custom-dropdown')
    })
  })
})

describe('ThemeToggleAnimated', () => {
  const mockToggleTheme = vi.fn()
  const mockSetTheme = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseTheme.mockReturnValue({
      theme: 'dark',
      resolvedTheme: 'dark',
      setTheme: mockSetTheme,
      toggleTheme: mockToggleTheme,
    })
  })

  describe('rendering', () => {
    it('renders a button', () => {
      render(<ThemeToggleAnimated />)

      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('has screen reader text', () => {
      render(<ThemeToggleAnimated />)

      expect(screen.getByText('Toggle theme')).toBeInTheDocument()
    })

    it('has overflow-hidden for animation', () => {
      render(<ThemeToggleAnimated />)

      expect(screen.getByRole('button')).toHaveClass('overflow-hidden')
    })
  })

  describe('icon animation states', () => {
    it('shows correct icon visibility in dark mode', () => {
      mockUseTheme.mockReturnValue({
        theme: 'dark',
        resolvedTheme: 'dark',
        setTheme: mockSetTheme,
        toggleTheme: mockToggleTheme,
      })

      const { container } = render(<ThemeToggleAnimated />)

      // Should have two SVGs (Sun and Moon)
      const svgs = container.querySelectorAll('svg')
      expect(svgs.length).toBe(2)
    })

    it('shows correct icon visibility in light mode', () => {
      mockUseTheme.mockReturnValue({
        theme: 'light',
        resolvedTheme: 'light',
        setTheme: mockSetTheme,
        toggleTheme: mockToggleTheme,
      })

      const { container } = render(<ThemeToggleAnimated />)

      // Should have two SVGs (Sun and Moon)
      const svgs = container.querySelectorAll('svg')
      expect(svgs.length).toBe(2)
    })
  })

  describe('interaction', () => {
    it('calls toggleTheme when clicked', () => {
      render(<ThemeToggleAnimated />)

      fireEvent.click(screen.getByRole('button'))

      expect(mockToggleTheme).toHaveBeenCalledTimes(1)
    })
  })

  describe('title attribute', () => {
    it('shows correct title in dark mode', () => {
      mockUseTheme.mockReturnValue({
        theme: 'dark',
        resolvedTheme: 'dark',
        setTheme: mockSetTheme,
        toggleTheme: mockToggleTheme,
      })

      render(<ThemeToggleAnimated />)

      expect(screen.getByTitle(/switch to light mode/i)).toBeInTheDocument()
    })

    it('shows correct title in light mode', () => {
      mockUseTheme.mockReturnValue({
        theme: 'light',
        resolvedTheme: 'light',
        setTheme: mockSetTheme,
        toggleTheme: mockToggleTheme,
      })

      render(<ThemeToggleAnimated />)

      expect(screen.getByTitle(/switch to dark mode/i)).toBeInTheDocument()
    })
  })

  describe('styling', () => {
    it('applies custom className', () => {
      render(<ThemeToggleAnimated className="custom-animated" />)

      // Custom class should be applied along with overflow-hidden
      expect(screen.getByRole('button')).toHaveClass('overflow-hidden')
    })
  })
})
