/**
 * MatrixHeatmapView - Grid-based presence visualization for multi-scan comparison
 *
 * Layout:
 * - Y-axis: Host IPs (sorted numerically)
 * - X-axis: Scan IDs/timestamps
 * - Cell colors indicate response status and changes
 * - Click cell for port details
 *
 * Color coding:
 * - Blue: Host responded in this scan
 * - Gray: No response in this scan
 * - Green border: New responses vs previous scan
 * - Red border: Lost responses vs previous scan
 *
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { Scan } from '@/types/database'
import type {
  MultiScanComparisonResult,
  MultiScanHostDiff,
  MultiScanHostPresence,
} from '../types'

// =============================================================================
// Types
// =============================================================================

interface MatrixHeatmapViewProps {
  /** Comparison data from useMultiScanComparison */
  data: MultiScanComparisonResult
  /** Optional CSS class */
  className?: string
}

type CellStatus = 'present' | 'absent' | 'new' | 'lost'

interface CellData {
  hostAddr: string
  scan: Scan
  scanIndex: number
  status: CellStatus
  portCount: number
  ports: { port: number; protocol: string; ttl?: number }[]
}

interface SelectedCell {
  hostAddr: string
  scan: Scan
  ports: { port: number; protocol: string; ttl?: number }[]
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
  })
}

/**
 * Format scan time for tooltip
 */
function formatScanTimeFull(scan: Scan): string {
  const date = new Date(scan.s_time * 1000)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Get cell status considering changes from previous scan
 */
function getCellStatus(
  presence: MultiScanHostPresence,
  prevPresence: MultiScanHostPresence | undefined
): CellStatus {
  if (presence.status === 'present') {
    if (!prevPresence || prevPresence.status === 'absent') {
      return 'new'
    }
    return 'present'
  } else {
    if (prevPresence && prevPresence.status === 'present') {
      return 'lost'
    }
    return 'absent'
  }
}

/**
 * Get ports for a host in a specific scan
 */
function getPortsForHost(
  host: MultiScanHostDiff,
  scanId: number
): { port: number; protocol: string; ttl?: number }[] {
  const ports: { port: number; protocol: string; ttl?: number }[] = []

  for (const portDiff of host.portDiffs) {
    const presence = portDiff.presence.find((p) => p.scanId === scanId)
    if (presence?.status === 'present') {
      ports.push({
        port: portDiff.port,
        protocol: portDiff.protocol,
        ttl: presence.info?.ttl,
      })
    }
  }

  return ports.sort((a, b) => a.port - b.port)
}

/**
 * Get CSS classes for cell based on status
 */
function getCellClasses(status: CellStatus): string {
  switch (status) {
    case 'present':
      return 'bg-primary/60 hover:bg-primary/80'
    case 'new':
      return 'bg-primary/60 hover:bg-primary/80 ring-2 ring-success ring-inset'
    case 'lost':
      return 'bg-muted/30 hover:bg-muted/50 ring-2 ring-destructive ring-inset'
    case 'absent':
    default:
      return 'bg-muted/20 hover:bg-muted/30'
  }
}

/**
 * Get cell title for screen readers
 */
function getCellTitle(status: CellStatus, portCount: number): string {
  switch (status) {
    case 'present':
      return `${portCount} port${portCount !== 1 ? 's' : ''} responding`
    case 'new':
      return `New response: ${portCount} port${portCount !== 1 ? 's' : ''}`
    case 'lost':
      return 'Host no longer responding'
    case 'absent':
    default:
      return 'No response'
  }
}

// =============================================================================
// Sub-Components
// =============================================================================

interface MatrixCellProps {
  cell: CellData
  onClick: () => void
}

function MatrixCell({ cell, onClick }: MatrixCellProps) {
  const title = getCellTitle(cell.status, cell.portCount)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            'w-full h-8 rounded-sm transition-all cursor-pointer',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            getCellClasses(cell.status)
          )}
          aria-label={`${cell.hostAddr} scan #${cell.scan.scan_id}: ${title}`}
        >
          {cell.status === 'present' || cell.status === 'new' ? (
            <span className="text-[10px] font-mono text-primary-foreground">
              {cell.portCount}
            </span>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          <div className="font-semibold">{cell.hostAddr}</div>
          <div className="text-muted-foreground">Scan #{cell.scan.scan_id}</div>
          <div className="mt-1">{title}</div>
          {cell.ports.length > 0 && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              Click for details
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

interface PortDetailsDialogProps {
  cell: SelectedCell | null
  onClose: () => void
}

function PortDetailsDialog({ cell, onClose }: PortDetailsDialogProps) {
  if (!cell) return null

  return (
    <Dialog open={!!cell} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">{cell.hostAddr}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Scan #{cell.scan.scan_id} • {formatScanTimeFull(cell.scan)}
          </div>
          {cell.ports.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">
                {cell.ports.length} responding port{cell.ports.length !== 1 ? 's' : ''}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {cell.ports.map((p) => (
                  <Badge
                    key={`${p.port}-${p.protocol}`}
                    variant="outline"
                    className="font-mono text-xs justify-center"
                  >
                    {p.port}/{p.protocol}
                    {p.ttl !== undefined && (
                      <span className="ml-1 text-muted-foreground">
                        ({p.ttl})
                      </span>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No ports responding in this scan
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * MatrixHeatmapView - Grid-based presence heatmap
 *
 * Shows host presence across scans as a grid where:
 * - Rows are hosts (sorted by IP)
 * - Columns are scans (sorted chronologically)
 * - Cell color indicates presence/absence and changes
 *
 * @example
 * ```tsx
 * const { data } = useMultiScanComparison([1, 2, 3])
 * return <MatrixHeatmapView data={data} />
 * ```
 */
export function MatrixHeatmapView({ data, className }: MatrixHeatmapViewProps) {
  const { scans, hostDiffs } = data
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)

  // Filter to only hosts with at least one response
  const activeHosts = useMemo(() => {
    return hostDiffs.filter((h) => h.presence.some((p) => p.status === 'present'))
  }, [hostDiffs])

  // Build cell data matrix
  const cellMatrix = useMemo(() => {
    const matrix: CellData[][] = []

    for (const host of activeHosts) {
      const row: CellData[] = []
      for (let i = 0; i < scans.length; i++) {
        const scan = scans[i]
        const presence = host.presence.find((p) => p.scanId === scan.scan_id)
        const prevPresence = i > 0
          ? host.presence.find((p) => p.scanId === scans[i - 1].scan_id)
          : undefined

        if (presence) {
          const status = getCellStatus(presence, prevPresence)
          const ports = getPortsForHost(host, scan.scan_id)

          row.push({
            hostAddr: host.ipAddr,
            scan,
            scanIndex: i,
            status,
            portCount: ports.length,
            ports,
          })
        }
      }
      matrix.push(row)
    }

    return matrix
  }, [activeHosts, scans])

  // Handle cell click
  const handleCellClick = (cell: CellData) => {
    if (cell.status === 'present' || cell.status === 'new') {
      setSelectedCell({
        hostAddr: cell.hostAddr,
        scan: cell.scan,
        ports: cell.ports,
      })
    }
  }

  return (
    <TooltipProvider>
      <div className={cn('p-4', className)}>
        {/* Legend */}
        <div className="flex items-center gap-6 mb-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-primary/60" />
            <span>Responding</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-primary/60 ring-2 ring-success ring-inset" />
            <span>New response</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-muted/30 ring-2 ring-destructive ring-inset" />
            <span>Lost response</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-muted/20" />
            <span>No response</span>
          </div>
        </div>

        {/* Matrix grid */}
        <div className="overflow-auto rounded-lg border border-border">
          <div
            className="grid gap-px bg-border"
            style={{
              gridTemplateColumns: `minmax(120px, auto) repeat(${scans.length}, minmax(50px, 1fr))`,
            }}
          >
            {/* Header row */}
            <div className="bg-surface-light sticky left-0 z-10 px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Host
            </div>
            {scans.map((scan) => (
              <div
                key={scan.scan_id}
                className="bg-surface-light px-1 py-1.5 text-center"
              >
                <div className="text-xs font-medium">#{scan.scan_id}</div>
                <div className="text-[10px] text-muted-foreground">
                  {formatScanTime(scan)}
                </div>
              </div>
            ))}

            {/* Data rows */}
            {cellMatrix.map((row, rowIndex) => (
              <>
                {/* Host IP */}
                <div
                  key={`host-${rowIndex}`}
                  className="bg-surface sticky left-0 z-10 px-2 py-1 font-mono text-xs flex items-center"
                >
                  {row[0]?.hostAddr || activeHosts[rowIndex]?.ipAddr}
                </div>

                {/* Cells */}
                {row.map((cell, colIndex) => (
                  <div key={`cell-${rowIndex}-${colIndex}`} className="bg-surface p-0.5">
                    <MatrixCell
                      cell={cell}
                      onClick={() => handleCellClick(cell)}
                    />
                  </div>
                ))}
              </>
            ))}
          </div>
        </div>

        {/* Empty state */}
        {activeHosts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">No hosts with responses found</p>
          </div>
        )}

        {/* Port details dialog */}
        <PortDetailsDialog
          cell={selectedCell}
          onClose={() => setSelectedCell(null)}
        />
      </div>
    </TooltipProvider>
  )
}
