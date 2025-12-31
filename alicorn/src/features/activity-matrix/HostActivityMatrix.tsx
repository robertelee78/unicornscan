/**
 * Host Activity Matrix component
 * Grid visualization of host port changes across scans
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useActivityMatrix, useCellDiff, useMatrixFilters } from './hooks'
import { MatrixFiltersPanel } from './MatrixFilters'
import { MatrixCellDisplay } from './MatrixCell'
import { MatrixDiffDialog } from './MatrixDiffDialog'
import { exportMatrixToCSV, exportChangesToCSV, exportSummaryToCSV } from './export-utils'
import type { MatrixCell } from './types'
import { getCellStatusColor } from './types'

// =============================================================================
// Constants
// =============================================================================

const CELL_SIZE = 24
const CELL_GAP = 2
const ROW_LABEL_WIDTH = 140
const COL_LABEL_HEIGHT = 60
const VIEWPORT_BUFFER = 5 // Extra rows/cols to render outside viewport

// =============================================================================
// Component
// =============================================================================

export function HostActivityMatrix() {
  // Filter state
  const { filters, updateFilter, resetFilters } = useMatrixFilters()

  // Data fetching
  const { data: matrixData, isLoading, error } = useActivityMatrix(filters)

  // Dialog state
  const [selectedCell, setSelectedCell] = useState<{
    hostIp: string
    scansId: number
    baselineScansId: number | null
  } | null>(null)

  // Fetch diff data when a cell is selected
  const { data: diffData, isLoading: isDiffLoading } = useCellDiff(
    selectedCell?.hostIp ?? null,
    selectedCell?.scansId ?? null,
    selectedCell?.baselineScansId ?? null
  )

  // Virtual scrolling state
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollPosition, setScrollPosition] = useState({ top: 0, left: 0 })
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Track container size
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Track scroll position
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement
    setScrollPosition({
      top: target.scrollTop,
      left: target.scrollLeft,
    })
  }, [])

  // Calculate visible range
  const visibleRange = useMemo(() => {
    if (!matrixData) return { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }

    const cellWithGap = CELL_SIZE + CELL_GAP

    const startRow = Math.max(0, Math.floor(scrollPosition.top / cellWithGap) - VIEWPORT_BUFFER)
    const endRow = Math.min(
      matrixData.hostOrder.length,
      Math.ceil((scrollPosition.top + containerSize.height) / cellWithGap) + VIEWPORT_BUFFER
    )

    const startCol = Math.max(0, Math.floor(scrollPosition.left / cellWithGap) - VIEWPORT_BUFFER)
    const endCol = Math.min(
      matrixData.scanOrder.length,
      Math.ceil((scrollPosition.left + containerSize.width) / cellWithGap) + VIEWPORT_BUFFER
    )

    return { startRow, endRow, startCol, endCol }
  }, [scrollPosition, containerSize, matrixData])

  // Cell click handler
  const handleCellClick = useCallback((cell: MatrixCell) => {
    // Find baseline scan ID
    let baselineScansId: number | null = null

    if (matrixData && !cell.isBaseline) {
      // Find the baseline scan based on filter settings
      const scanIndex = matrixData.scanOrder.indexOf(cell.scansId)
      if (scanIndex > 0) {
        baselineScansId = matrixData.scanOrder[0] // First scan is baseline
      }
    }

    setSelectedCell({
      hostIp: cell.hostIp,
      scansId: cell.scansId,
      baselineScansId,
    })
  }, [matrixData])

  // Export handlers
  const handleExport = useCallback((type: 'full' | 'changes' | 'summary') => {
    if (!matrixData) return

    switch (type) {
      case 'full':
        exportMatrixToCSV(matrixData)
        break
      case 'changes':
        exportChangesToCSV(matrixData)
        break
      case 'summary':
        exportSummaryToCSV(matrixData)
        break
    }
  }, [matrixData])

  // Calculate total grid size
  const gridWidth = matrixData
    ? matrixData.scanOrder.length * (CELL_SIZE + CELL_GAP)
    : 0
  const gridHeight = matrixData
    ? matrixData.hostOrder.length * (CELL_SIZE + CELL_GAP)
    : 0

  return (
    <div className="space-y-4">
      {/* Filters */}
      <MatrixFiltersPanel
        filters={filters}
        onFilterChange={updateFilter}
        onReset={resetFilters}
        scanCount={matrixData?.summary.totalScans ?? 0}
        hostCount={matrixData?.summary.totalHosts ?? 0}
      />

      {/* Matrix Card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg">Host Activity Matrix</CardTitle>
              {matrixData && (
                <div className="flex gap-2">
                  <Badge variant="secondary">
                    {matrixData.summary.hostsWithChanges} changed
                  </Badge>
                  <Badge variant="outline" className="bg-green-500/10 text-green-500">
                    +{matrixData.summary.cellsWithNewPorts} new
                  </Badge>
                  <Badge variant="outline" className="bg-red-500/10 text-red-500">
                    -{matrixData.summary.cellsWithRemovedPorts} removed
                  </Badge>
                </div>
              )}
            </div>

            {/* Export Button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!matrixData}>
                  Export CSV
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('full')}>
                  Full Matrix
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('changes')}>
                  Changes Only
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('summary')}>
                  Summary Statistics
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent>
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center h-64">
              <span className="text-muted-foreground">Loading matrix data...</span>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="flex items-center justify-center h-64 text-destructive">
              Error loading matrix: {error.message}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && matrixData && matrixData.hostOrder.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <p>No hosts found matching filters.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={resetFilters}
              >
                Reset Filters
              </Button>
            </div>
          )}

          {/* Matrix Grid */}
          {!isLoading && matrixData && matrixData.hostOrder.length > 0 && (
            <TooltipProvider>
              <div className="relative">
                {/* Legend */}
                <Legend />

                {/* Matrix Container */}
                <div
                  ref={containerRef}
                  className="overflow-auto border border-border rounded-lg mt-4"
                  style={{ maxHeight: '60vh' }}
                  onScroll={handleScroll}
                >
                  <div
                    className="relative"
                    style={{
                      width: gridWidth + ROW_LABEL_WIDTH,
                      height: gridHeight + COL_LABEL_HEIGHT,
                    }}
                  >
                    {/* Column Headers (Scan dates) */}
                    <div
                      className="sticky top-0 z-20 bg-background"
                      style={{
                        marginLeft: ROW_LABEL_WIDTH,
                        height: COL_LABEL_HEIGHT,
                      }}
                    >
                      <div className="flex" style={{ gap: CELL_GAP }}>
                        {matrixData.scanOrder
                          .slice(visibleRange.startCol, visibleRange.endCol)
                          .map((scansId, idx) => {
                            const column = matrixData.columns.get(scansId)
                            if (!column) return null

                            const actualIdx = visibleRange.startCol + idx
                            const date = new Date(column.scan.s_time * 1000)

                            return (
                              <div
                                key={scansId}
                                className="flex flex-col items-center justify-end text-[10px] text-muted-foreground"
                                style={{
                                  width: CELL_SIZE,
                                  height: COL_LABEL_HEIGHT,
                                  position: 'absolute',
                                  left: actualIdx * (CELL_SIZE + CELL_GAP),
                                }}
                              >
                                <div className="transform -rotate-45 origin-left whitespace-nowrap">
                                  {date.toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </div>
                                {column.isBaseline && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[8px] px-1 py-0 mt-1 bg-blue-500/20 text-blue-500"
                                  >
                                    Base
                                  </Badge>
                                )}
                              </div>
                            )
                          })}
                      </div>
                    </div>

                    {/* Row Labels (Host IPs) + Cells */}
                    <div style={{ marginTop: COL_LABEL_HEIGHT }}>
                      {matrixData.hostOrder
                        .slice(visibleRange.startRow, visibleRange.endRow)
                        .map((hostIp, idx) => {
                          const row = matrixData.rows.get(hostIp)
                          if (!row) return null

                          const actualIdx = visibleRange.startRow + idx

                          return (
                            <div
                              key={hostIp}
                              className="flex items-center"
                              style={{
                                height: CELL_SIZE + CELL_GAP,
                                position: 'absolute',
                                top: actualIdx * (CELL_SIZE + CELL_GAP),
                                left: 0,
                              }}
                            >
                              {/* Row Label */}
                              <div
                                className="sticky left-0 z-10 bg-background text-xs font-mono truncate pr-2 flex-shrink-0"
                                style={{ width: ROW_LABEL_WIDTH }}
                                title={hostIp}
                              >
                                {hostIp}
                              </div>

                              {/* Cells */}
                              <div className="flex" style={{ gap: CELL_GAP }}>
                                {matrixData.scanOrder
                                  .slice(visibleRange.startCol, visibleRange.endCol)
                                  .map((scansId, colIdx) => {
                                    const cell = row.cells.get(scansId)
                                    if (!cell) return null

                                    const actualColIdx = visibleRange.startCol + colIdx

                                    return (
                                      <div
                                        key={scansId}
                                        style={{
                                          position: 'absolute',
                                          left: actualColIdx * (CELL_SIZE + CELL_GAP),
                                        }}
                                      >
                                        <MatrixCellDisplay
                                          cell={cell}
                                          size={CELL_SIZE}
                                          onClick={handleCellClick}
                                        />
                                      </div>
                                    )
                                  })}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                </div>

                {/* Summary Stats */}
                <div className="mt-4 text-xs text-muted-foreground text-center">
                  Showing {matrixData.hostOrder.length} hosts × {matrixData.scanOrder.length} scans
                  {' • '}
                  {matrixData.summary.allUniquePorts.size} unique ports observed
                </div>
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      {/* Diff Dialog */}
      <MatrixDiffDialog
        open={selectedCell !== null}
        onOpenChange={(open) => !open && setSelectedCell(null)}
        data={diffData ?? null}
        isLoading={isDiffLoading}
      />
    </div>
  )
}

// =============================================================================
// Legend Component
// =============================================================================

function Legend() {
  const items: { status: string; color: string; label: string }[] = [
    { status: 'first', color: getCellStatusColor('first'), label: 'Baseline' },
    { status: 'new', color: getCellStatusColor('new'), label: 'New Ports' },
    { status: 'removed', color: getCellStatusColor('removed'), label: 'Removed' },
    { status: 'mixed', color: getCellStatusColor('mixed'), label: 'Mixed' },
    { status: 'unchanged', color: getCellStatusColor('unchanged'), label: 'Unchanged' },
    { status: 'empty', color: getCellStatusColor('empty'), label: 'No Ports' },
  ]

  return (
    <div className="flex flex-wrap items-center gap-4 text-xs">
      {items.map(({ status, color, label }) => (
        <div key={status} className="flex items-center gap-1">
          <div
            className={`w-4 h-4 rounded-sm ${color}`}
            style={{ opacity: status === 'empty' ? 0.3 : status === 'unchanged' ? 0.6 : 1 }}
          />
          <span className="text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  )
}

export default HostActivityMatrix
