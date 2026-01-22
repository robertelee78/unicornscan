/**
 * Theme provider with system preference detection and persistence
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react'

// =============================================================================
// Types
// =============================================================================

export type Theme = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'alicorn-theme'
const DEFAULT_THEME: Theme = 'system'

// =============================================================================
// Context
// =============================================================================

const ThemeContext = createContext<ThemeContextValue | null>(null)

// =============================================================================
// Provider
// =============================================================================

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME,
  storageKey = STORAGE_KEY,
}: ThemeProviderProps) {
  // Get initial theme from localStorage or default
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return defaultTheme

    try {
      const stored = localStorage.getItem(storageKey)
      if (stored && ['dark', 'light', 'system'].includes(stored)) {
        return stored as Theme
      }
    } catch {
      // localStorage not available
    }

    return defaultTheme
  })

  // Track system preference
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => {
    if (typeof window === 'undefined') return 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  // Resolved theme (what's actually applied)
  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement

    // Add transition class for smooth theme switch
    root.classList.add('theme-transition')

    // Remove old theme classes
    root.classList.remove('light', 'dark')
    root.removeAttribute('data-theme')

    // Apply new theme
    if (resolvedTheme === 'light') {
      root.classList.add('light')
      root.setAttribute('data-theme', 'light')
    } else {
      root.classList.add('dark')
      root.setAttribute('data-theme', 'dark')
    }

    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]')
    if (metaThemeColor) {
      metaThemeColor.setAttribute(
        'content',
        resolvedTheme === 'light' ? '#fafafa' : '#0a0a0f'
      )
    }

    // Remove transition class after animation completes
    const timeout = setTimeout(() => {
      root.classList.remove('theme-transition')
    }, 300)

    return () => clearTimeout(timeout)
  }, [resolvedTheme])

  // Set theme and persist
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)

    try {
      localStorage.setItem(storageKey, newTheme)
    } catch {
      // localStorage not available
    }
  }, [storageKey])

  // Toggle between dark and light (skips system)
  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }, [resolvedTheme, setTheme])

  // Memoize context value
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
    }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  )

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

// =============================================================================
// Hook
// =============================================================================

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  return context
}

// =============================================================================
// SSR-safe script for preventing flash
// =============================================================================

/**
 * This script should be injected into the <head> before any content loads
 * to prevent the flash of unstyled content (FOUC) on page load.
 *
 * Usage in index.html:
 * <script>
 *   (function() {
 *     try {
 *       var theme = localStorage.getItem('alicorn-theme');
 *       var resolved = theme;
 *       if (!theme || theme === 'system') {
 *         resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
 *       }
 *       if (resolved === 'light') {
 *         document.documentElement.classList.add('light');
 *         document.documentElement.setAttribute('data-theme', 'light');
 *       }
 *     } catch (e) {}
 *   })();
 * </script>
 */
export const THEME_SCRIPT = `
(function() {
  try {
    var theme = localStorage.getItem('alicorn-theme');
    var resolved = theme;
    if (!theme || theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (resolved === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {}
})();
`.trim()
