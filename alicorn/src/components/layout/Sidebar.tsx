/**
 * Sidebar navigation component
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Scan, Server, Network, GitCompare, BarChart3, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/scans', icon: Scan, label: 'Scans' },
  { to: '/hosts', icon: Server, label: 'Hosts' },
  { to: '/topology', icon: Network, label: 'Topology' },
  { to: '/compare', icon: GitCompare, label: 'Compare' },
  { to: '/statistics', icon: BarChart3, label: 'Statistics' },
]

export function Sidebar() {
  return (
    <aside className="w-64 bg-surface border-r border-border flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-border">
        <Scan className="h-7 w-7 text-primary mr-3" />
        <span className="text-xl font-bold font-mono">
          <span className="text-primary">Ali</span>
          <span className="text-foreground">corn</span>
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted hover:bg-surface-light hover:text-foreground'
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-border">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/20 text-primary'
                : 'text-muted hover:bg-surface-light hover:text-foreground'
            )
          }
        >
          <Settings className="h-5 w-5" />
          Settings
        </NavLink>
      </div>
    </aside>
  )
}
