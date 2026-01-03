/**
 * Topology visualization legend
 * Explains node colors, sizes, and other visual encodings
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { cn } from '@/lib/utils'
import { getOsFamilyColor, type OsFamily } from '@/types/database'
import type { NodeType } from './types'

// =============================================================================
// Legend Data
// =============================================================================

const NODE_TYPES: { type: NodeType; label: string; color: string }[] = [
  { type: 'scanner', label: 'Scanner', color: 'var(--color-topo-scanner)' },
  { type: 'host', label: 'Host', color: 'var(--color-topo-host)' },
  { type: 'router', label: 'Router/Hop', color: 'var(--color-topo-router)' },
]

const OS_FAMILIES: { family: OsFamily; label: string }[] = [
  { family: 'linux', label: 'Linux/Unix/macOS' },
  { family: 'windows', label: 'Windows' },
  { family: 'router', label: 'Network Device' },
  { family: 'unknown', label: 'Unknown' },
]

// =============================================================================
// Component
// =============================================================================

interface TopologyLegendProps {
  className?: string
  compact?: boolean
}

export function TopologyLegend({ className, compact = false }: TopologyLegendProps) {
  if (compact) {
    return <CompactLegend className={className} />
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

      {/* OS Colors */}
      <div className="mb-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
          OS Detection (Host Color)
        </div>
        <div className="space-y-1.5">
          {OS_FAMILIES.map(({ family, label }) => (
            <div key={family} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getOsFamilyColor(family) }}
              />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Size Legend */}
      <div className="mb-4">
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

      {/* Edge Legend */}
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
          Connections
        </div>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-gray-500" />
            <span>Direct connection</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-gray-500 border-t-2" />
            <span>Hop (traceroute)</span>
          </div>
        </div>
      </div>

      {/* TTL Info */}
      <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
        <div className="font-medium mb-1">TTL-Based Distance</div>
        <div>OS inference from TTL:</div>
        <ul className="mt-1 space-y-0.5 ml-2">
          <li>≤64: Linux/Unix (starts at 64)</li>
          <li>65-128: Windows (starts at 128)</li>
          <li>129-255: Router/Solaris (starts at 255)</li>
        </ul>
      </div>
    </div>
  )
}

// =============================================================================
// Compact Legend
// =============================================================================

function CompactLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-4 text-xs', className)}>
      {/* Quick node type reference */}
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
        <span className="text-muted-foreground">Scanner</span>
      </div>

      {/* OS colors */}
      <div className="flex items-center gap-2">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: getOsFamilyColor('linux') }}
        />
        <span className="text-muted-foreground">Linux</span>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: getOsFamilyColor('windows') }}
        />
        <span className="text-muted-foreground">Windows</span>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: getOsFamilyColor('router') }}
        />
        <span className="text-muted-foreground">Router</span>
      </div>

      {/* Size indicator */}
      <div className="flex items-center gap-1 text-muted-foreground">
        <span>Size =</span>
        <span>port count</span>
      </div>
    </div>
  )
}

export default TopologyLegend
