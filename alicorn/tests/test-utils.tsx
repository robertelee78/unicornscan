/**
 * Test utilities for React component testing
 * Provides QueryClient wrapper and common test helpers
 */

import { ReactNode, createContext, useContext, useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, RenderOptions } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// =============================================================================
// Theme Context Mock
// =============================================================================

export type Theme = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

interface MockThemeProviderProps {
  children: ReactNode
  theme?: Theme
  resolvedTheme?: ResolvedTheme
  setTheme?: (theme: Theme) => void
  toggleTheme?: () => void
}

/**
 * Mock theme provider for testing
 */
export function MockThemeProvider({
  children,
  theme = 'dark',
  resolvedTheme = 'dark',
  setTheme = () => {},
  toggleTheme = () => {},
}: MockThemeProviderProps) {
  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/**
 * Hook to access mock theme context in tests
 */
export function useMockTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useMockTheme must be used within a MockThemeProvider')
  }
  return context
}

/**
 * Create a fresh QueryClient for testing
 * Configured with no retries and immediate garbage collection
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

interface WrapperProps {
  children: ReactNode
}

interface CreateWrapperOptions {
  queryClient?: QueryClient
  initialRoute?: string
  withTheme?: boolean
  theme?: Theme
  resolvedTheme?: ResolvedTheme
  setTheme?: (theme: Theme) => void
  toggleTheme?: () => void
}

/**
 * Create a wrapper component for testing with providers
 */
export function createWrapper(options: CreateWrapperOptions = {}) {
  const {
    queryClient,
    initialRoute = '/',
    withTheme = false,
    theme = 'dark',
    resolvedTheme = 'dark',
    setTheme = () => {},
    toggleTheme = () => {},
  } = options
  const client = queryClient ?? createTestQueryClient()

  return function Wrapper({ children }: WrapperProps) {
    let content = children

    if (withTheme) {
      content = (
        <MockThemeProvider
          theme={theme}
          resolvedTheme={resolvedTheme}
          setTheme={setTheme}
          toggleTheme={toggleTheme}
        >
          {content}
        </MockThemeProvider>
      )
    }

    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialRoute]}>{content}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient
  initialRoute?: string
  withTheme?: boolean
  theme?: Theme
  resolvedTheme?: ResolvedTheme
  setTheme?: (theme: Theme) => void
  toggleTheme?: () => void
}

/**
 * Custom render function that wraps components with all providers
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options: RenderWithProvidersOptions = {}
) {
  const {
    queryClient,
    initialRoute,
    withTheme,
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
    ...renderOptions
  } = options
  return render(ui, {
    wrapper: createWrapper({
      queryClient,
      initialRoute,
      withTheme,
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
    }),
    ...renderOptions,
  })
}

/**
 * Wrapper for testing hooks that need QueryClient
 */
export function createHookWrapper(queryClient?: QueryClient) {
  const client = queryClient ?? createTestQueryClient()

  return function Wrapper({ children }: WrapperProps) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

// Re-export everything from testing-library
export * from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'
