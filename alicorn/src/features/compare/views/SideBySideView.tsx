/**
 * SideBySideView - Column-based scan comparison visualization
 *
 * Layout:
 * - Each selected scan is a column (sorted chronologically)
 * - Each host IP is a row
 * - Cells show responding ports with color coding
 *
 * Color coding:
 * - Green: New response (port appeared in this scan)
 * - Red: Lost response (port was in previous scan but not this one)
 * - Yellow: TTL or banner changed
 * - Gray: Unchanged
 *
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo } from 'react'
import { Plus, Minus, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Scan } from '@/types/database'
import type {
  MultiScanComparisonResult,
  MultiScanHostDiff,
} from '../types'

// =============================================================================
// Types
// =============================================================================

interface SideBySideViewProps {
  /** Comparison data from useMultiScanComparison */
  data: MultiScanComparisonResult
  /** Optional CSS class */
  className?: string
}

type PortChangeStatus = 'new' | 'lost' | 'changed' | 'unchanged'

interface PortCellData {
  port: number
  protocol: string
  status: PortChangeStatus
  ttl?: number
  prevTtl?: number
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format scan timestamp for column header
 */
function formatScanTime(scan: Scan): string {
  const date = new Date(scan.s_time * 1000)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Get ports for a host in a specific scan, with change status relative to previous scan
 */
function getPortsForCell(
  host: MultiScanHostDiff,
  scanIndex: number,
  scans: Scan[]
): PortCellData[] {
  const scanId = scans[scanIndex].scan_id
  const prevScanId = scanIndex > 0 ? scans[scanIndex - 1].scan_id : null

  const ports: PortCellData[] = []

  for (const portDiff of host.portDiffs) {
    const currentPresence = portDiff.presence.find((p) => p.scanId === scanId)
    const prevPresence = prevScanId
      ? portDiff.presence.find((p) => p.scanId === prevScanId)
      : null

    // Only include ports that are present in this scan
    if (currentPresence?.status === 'present') {
      let status: PortChangeStatus = 'unchanged'

      if (!prevPresence || prevPresence.status === 'absent') {
        // Port is new (wasn't in previous scan)
        status = 'new'
      } else if (
        prevPresence.info &&
        currentPresence.info &&
        prevPresence.info.ttl !== currentPresence.info.ttl
      ) {
        // TTL changed
        status = 'changed'
      }

      ports.push({
        port: portDiff.port,
        protocol: portDiff.protocol,
        status,
        ttl: currentPresence.info?.ttl,
        prevTtl: prevPresence?.info?.ttl,
      })
    } else if (prevPresence?.status === 'present') {
      // Port was lost (was in previous scan but not this one)
      ports.push({
        port: portDiff.port,
        protocol: portDiff.protocol,
        status: 'lost',
        prevTtl: prevPresence.info?.ttl,
      })
    }
  }

  // Sort by port number
  return ports.sort((a, b) => a.port - b.port)
}

/**
 * Get CSS class for port status
 */
function getPortStatusClass(status: PortChangeStatus): string {
  switch (status) {
    case 'new':
      return 'bg-success/20 text-success border-success/30'
    case 'lost':
      return 'bg-destructive/20 text-destructive border-destructive/30 line-through'
    case 'changed':
      return 'bg-warning/20 text-warning border-warning/30'
    case 'unchanged':
    default:
      return 'bg-muted/50 text-muted-foreground border-muted'
  }
}

// =============================================================================
// Sub-Components
// =============================================================================

interface PortBadgeProps {
  data: PortCellData
}

function PortBadge({ data }: PortBadgeProps) {
  const tooltipContent = useMemo(() => {
    const lines = [`${data.port}/${data.protocol}`]
    if (data.status === 'new') {
      lines.push('New in this scan')
    } else if (data.status === 'lost') {
      lines.push('Lost (was in previous scan)')
    } else if (data.status === 'changed') {
      lines.push(`TTL changed: ${data.prevTtl} → ${data.ttl}`)
    }
    if (data.ttl !== undefined && data.status !== 'lost') {
      lines.push(`TTL: ${data.ttl}`)
    }
    return lines.join('\n')
  }, [data])

  // Get status label for screen readers
  const statusLabel = useMemo(() => {
    switch (data.status) {
      case 'new': return 'new port'
      case 'lost': return 'removed port'
      case 'changed': return 'modified port'
      default: return 'port'
    }
  }, [data.status])

  // Get icon for non-color accessibility
  const StatusIcon = useMemo(() => {
    switch (data.status) {
      case 'new': return Plus
      case 'lost': return Minus
      case 'changed': return RefreshCw
      default: return null
    }
  }, [data.status])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            'text-xs font-mono cursor-default inline-flex items-center gap-0.5',
            getPortStatusClass(data.status)
          )}
          aria-label={`${statusLabel} ${data.port}/${data.protocol}`}
        >
          {StatusIcon && <StatusIcon className="h-2.5 w-2.5" aria-hidden="true" />}
          {data.port}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="whitespace-pre-line">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  )
}

interface HostRowProps {
  host: MultiScanHostDiff
  scans: Scan[]
}

function HostRow({ host, scans }: HostRowProps) {
  // Check if host has any responses
  const hasAnyResponse = host.presence.some((p) => p.status === 'present')
  if (!hasAnyResponse) return null

  return (
    <tr className="border-b border-border hover:bg-muted/30 transition-colors">
      {/* Host IP column (sticky) */}
      <th
        scope="row"
        className="sticky left-0 z-10 bg-surface px-3 py-2 font-mono text-sm font-normal text-left border-r border-border"
      >
        {host.ipAddr}
      </th>

      {/* Scan columns */}
      {scans.map((scan, scanIndex) => {
        const ports = getPortsForCell(host, scanIndex, scans)
        const presence = host.presence.find((p) => p.scanId === scan.scan_id)
        const isPresent = presence?.status === 'present'

        return (
          <td
            key={scan.scan_id}
            className={cn(
              'px-2 py-2 min-w-[120px] border-r border-border last:border-r-0',
              !isPresent && 'bg-muted/10'
            )}
          >
            {ports.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {ports.map((port) => (
                  <PortBadge key={`${port.port}-${port.protocol}`} data={port} />
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground italic">
                {isPresent ? 'No ports' : '—'}
              </span>
            )}
          </td>
        )
      })}
    </tr>
  )
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * SideBySideView - Column-based visualization for comparing multiple scans
 *
 * Displays each scan as a column, each host as a row, with ports color-coded
 * to show changes between consecutive scans.
 *
 * @example
 * ```tsx
 * const { data } = useMultiScanComparison([1, 2, 3])
 * return <SideBySideView data={data} />
 * ```
 */
export function SideBySideView({ data, className }: SideBySideViewProps) {
  const { scans, hostDiffs } = data

  // Filter to only hosts with at least one response
  const activeHosts = useMemo(() => {
    return hostDiffs.filter((h) => h.presence.some((p) => p.status === 'present'))
  }, [hostDiffs])

  return (
    <TooltipProvider>
      <div className={cn('overflow-auto rounded-lg border border-border', className)}>
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20 bg-surface-light">
            <tr>
              {/* Host column header */}
              <th
                scope="col"
                className="sticky left-0 z-30 bg-surface-light px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-r border-border"
              >
                Host
              </th>

              {/* Scan column headers */}
              {scans.map((scan) => (
                <th
                  key={scan.scan_id}
                  scope="col"
                  className="px-2 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-r border-border last:border-r-0 min-w-[120px]"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-foreground">
                      #{scan.scan_id}
                    </span>
                    <span className="text-[10px] font-normal normal-case">
                      {formatScanTime(scan)}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeHosts.map((host) => (
              <HostRow key={host.ipAddr} host={host} scans={scans} />
            ))}
          </tbody>
        </table>

        {activeHosts.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No hosts with responses found across selected scans.
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
