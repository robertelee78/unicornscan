/**
 * Category header component for enhanced port activity heatmap
 * Collapsible header showing category name, icon, port count, and activity
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { ChevronDown } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { PortCategoryConfig } from './types'

// =============================================================================
// Icon Mapping
// =============================================================================

/** Props accepted by Lucide icon components */
interface IconProps {
  className?: string
  style?: React.CSSProperties
  size?: number | string
}

/**
 * Get Lucide icon component by name
 * Falls back to CircleDot if icon not found
 */
function getIconComponent(iconName: string): React.ComponentType<IconProps> {
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<IconProps>>
  return icons[iconName] ?? icons.CircleDot
}

// =============================================================================
// Props
// =============================================================================

export interface CategoryHeaderProps {
  /** Category configuration with name, icon, color */
  config: PortCategoryConfig
  /** Number of ports in this category */
  portCount: number
  /** Total activity (sum of observations) for this category */
  totalActivity: number
  /** Whether the category is expanded */
  isExpanded: boolean
  /** Additional CSS classes */
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function CategoryHeader({
  config,
  portCount,
  totalActivity,
  isExpanded,
  className,
}: CategoryHeaderProps) {
  const IconComponent = getIconComponent(config.icon)

  return (
    <CollapsibleTrigger
      className={cn(
        'flex w-full items-center justify-between py-2 px-3 rounded-md',
        'hover:bg-muted/50 transition-colors',
        'text-sm font-medium',
        className
      )}
    >
      <div className="flex items-center gap-2">
        {/* Category icon */}
        <div
          className="flex items-center justify-center w-6 h-6 rounded"
          style={{ backgroundColor: `color-mix(in srgb, ${config.color} 20%, transparent)` }}
        >
          <IconComponent
            className="w-4 h-4"
            style={{ color: config.color }}
          />
        </div>

        {/* Category name */}
        <span className="font-medium">{config.name}</span>

        {/* Port count badge */}
        <Badge variant="secondary" className="text-xs px-1.5 py-0">
          {portCount} {portCount === 1 ? 'port' : 'ports'}
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        {/* Activity indicator */}
        {totalActivity > 0 && (
          <span className="text-xs text-muted-foreground">
            {totalActivity.toLocaleString()} obs
          </span>
        )}

        {/* Expand/collapse chevron */}
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-180'
          )}
        />
      </div>
    </CollapsibleTrigger>
  )
}

export default CategoryHeader
