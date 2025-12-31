/**
 * Header component with breadcrumbs and actions
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useLocation, Link } from 'react-router-dom'
import { Moon, Sun, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { config } from '@/lib/database'
import { Badge } from '@/components/ui/badge'

export function Header() {
  const location = useLocation()
  const breadcrumbs = getBreadcrumbs(location.pathname)

  return (
    <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm">
        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.path} className="flex items-center gap-2">
            {index > 0 && <span className="text-muted">/</span>}
            {index === breadcrumbs.length - 1 ? (
              <span className="text-foreground font-medium">{crumb.label}</span>
            ) : (
              <Link to={crumb.path} className="text-muted hover:text-foreground transition-colors">
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Backend indicator */}
        <Badge variant="outline" className="font-mono text-xs">
          {config.backend}
        </Badge>

        {/* Notifications (placeholder) */}
        <Button variant="ghost" size="icon" className="text-muted">
          <Bell className="h-5 w-5" />
        </Button>

        {/* Theme toggle (stub - will be implemented in Phase 5.1) */}
        <Button variant="ghost" size="icon" className="text-muted" title="Toggle theme (coming soon)">
          <Sun className="h-5 w-5 hidden dark:block" />
          <Moon className="h-5 w-5 block dark:hidden" />
        </Button>
      </div>
    </header>
  )
}

interface Breadcrumb {
  label: string
  path: string
}

function getBreadcrumbs(pathname: string): Breadcrumb[] {
  const paths = pathname.split('/').filter(Boolean)
  const breadcrumbs: Breadcrumb[] = [{ label: 'Dashboard', path: '/' }]

  if (paths.length === 0) return breadcrumbs

  let currentPath = ''
  for (const segment of paths) {
    currentPath += `/${segment}`

    // Format the label
    let label = segment.charAt(0).toUpperCase() + segment.slice(1)

    // Handle numeric IDs
    if (/^\d+$/.test(segment)) {
      label = `#${segment}`
    }

    breadcrumbs.push({ label, path: currentPath })
  }

  return breadcrumbs
}
