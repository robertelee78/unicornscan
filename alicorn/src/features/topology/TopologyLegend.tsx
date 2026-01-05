/**
 * Topology visualization legend
 * Dynamically populated from database OS family counts
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { cn } from '@/lib/utils'
import { useOsFamilyCounts, getOsFamilyDisplayColor } from './hooks'
import type { NodeType } from './types'

// =============================================================================
// Legend Data
// =============================================================================

const NODE_TYPES: { type: NodeType; label: string; color: string }[] = [
  { type: 'scanner', label: 'Scanner', color: 'var(--color-topo-scanner)' },
  { type: 'host', label: 'Host', color: 'var(--color-topo-host)' },
  { type: 'router', label: 'Router/Hop', color: 'var(--color-topo-router)' },
]

// =============================================================================
// Component
// =============================================================================

interface TopologyLegendProps {
  className?: string
  compact?: boolean
}

export function TopologyLegend({ className, compact = false }: TopologyLegendProps) {
  // Fetch top 5 OS families from database
  const { data: osFamilyCounts, isLoading } = useOsFamilyCounts(5)

  if (compact) {
    return <CompactLegend className={className} osFamilies={osFamilyCounts || []} />
  }

  return (
    <div className={cn('bg-card border rounded-lg p-4 text-sm', className)}>
      <h3 className="font-medium mb-3">Legend</h3>

      {/* Node Types */}
      <div className="mb-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
          Node Types
        </div>
        <div className="space-y-1.5">
          {NODE_TYPES.map(({ type, label, color }) => (
            <div key={type} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* OS Colors - Dynamic from database */}
      <div className="mb-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
          OS Detection (Host Color)
        </div>
        <div className="space-y-1.5">
          {isLoading ? (
            <div className="text-muted-foreground text-xs">Loading...</div>
          ) : osFamilyCounts && osFamilyCounts.length > 0 ? (
            osFamilyCounts.map(({ os_family, count }) => (
              <div key={os_family} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getOsFamilyDisplayColor(os_family) }}
                />
                <span>{os_family}</span>
                <span className="text-muted-foreground text-xs">({count})</span>
              </div>
            ))
          ) : (
            <div className="text-muted-foreground text-xs">No OS data</div>
          )}
        </div>
      </div>

      {/* Size Legend */}
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
          Node Size
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-muted-foreground" />
            <span className="text-xs">Few ports</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded-full bg-muted-foreground" />
            <span className="text-xs">Many ports</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Compact Legend
// =============================================================================

interface CompactLegendProps {
  className?: string
  osFamilies: Array<{ os_family: string; count: number }>
}

function CompactLegend({ className, osFamilies }: CompactLegendProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-4 text-xs', className)}>
      {/* Quick node type reference */}
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
        <span className="text-muted-foreground">Scanner</span>
      </div>

      {/* OS colors - dynamic from database */}
      {osFamilies.map(({ os_family }) => (
        <div key={os_family} className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: getOsFamilyDisplayColor(os_family) }}
          />
          <span className="text-muted-foreground">{os_family}</span>
        </div>
      ))}

      {/* Size indicator */}
      <div className="flex items-center gap-1 text-muted-foreground">
        <span>Size =</span>
        <span>port count</span>
      </div>
    </div>
  )
}

export default TopologyLegend
