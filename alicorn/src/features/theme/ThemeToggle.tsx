/**
 * Theme toggle button with animation
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Moon, Sun, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme, type Theme } from './ThemeProvider'

// =============================================================================
// Simple toggle button (dark/light only)
// =============================================================================

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={className}
      title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-transform duration-200 light:rotate-90 light:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-transform duration-200 light:rotate-0 light:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}

// =============================================================================
// Dropdown with system option
// =============================================================================

export function ThemeDropdown({ className }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme()

  const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          title="Select theme"
        >
          {resolvedTheme === 'dark' ? (
            <Moon className="h-5 w-5" />
          ) : (
            <Sun className="h-5 w-5" />
          )}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {themes.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className={theme === value ? 'bg-surface-light' : ''}
          >
            <Icon className="mr-2 h-4 w-4" />
            <span>{label}</span>
            {theme === value && (
              <span className="ml-auto text-xs text-muted">Active</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// =============================================================================
// Animated icon toggle (for Header)
// =============================================================================

export function ThemeToggleAnimated({ className }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={`${className} relative overflow-hidden`}
      title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <div className="relative h-5 w-5">
        {/* Sun icon - visible in dark mode */}
        <Sun
          className={`absolute inset-0 h-5 w-5 transition-all duration-300 ${
            resolvedTheme === 'dark'
              ? 'rotate-0 scale-100 opacity-100'
              : 'rotate-90 scale-0 opacity-0'
          }`}
        />
        {/* Moon icon - visible in light mode */}
        <Moon
          className={`absolute inset-0 h-5 w-5 transition-all duration-300 ${
            resolvedTheme === 'light'
              ? 'rotate-0 scale-100 opacity-100'
              : '-rotate-90 scale-0 opacity-0'
          }`}
        />
      </div>
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
