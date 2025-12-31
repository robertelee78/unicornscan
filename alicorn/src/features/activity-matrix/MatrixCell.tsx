/**
 * Matrix cell component
 * Renders a single cell in the activity matrix grid
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { memo } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { MatrixCell, CellStatus } from './types'
import { getCellStatusLabel } from './types'

// =============================================================================
// Props
// =============================================================================

interface MatrixCellProps {
  cell: MatrixCell
  size: number
  onClick?: (cell: MatrixCell) => void
}

// =============================================================================
// Helper Functions
// =============================================================================

function getCellClasses(status: CellStatus, isBaseline: boolean): string {
  const base = 'rounded-sm cursor-pointer transition-all hover:scale-110 hover:z-10 relative'

  let colorClass: string
  switch (status) {
    case 'new':
      colorClass = 'bg-green-500 hover:bg-green-400'
      break
    case 'removed':
      colorClass = 'bg-red-500 hover:bg-red-400'
      break
    case 'mixed':
      colorClass = 'bg-amber-500 hover:bg-amber-400'
      break
    case 'unchanged':
      colorClass = 'bg-gray-400 hover:bg-gray-300'
      break
    case 'first':
      colorClass = 'bg-blue-500 hover:bg-blue-400'
      break
    case 'empty':
      colorClass = 'bg-muted opacity-30 hover:opacity-50'
      break
    default:
      colorClass = 'bg-muted'
  }

  // Add baseline indicator ring
  if (isBaseline) {
    return `${base} ${colorClass} ring-2 ring-blue-600 ring-offset-1 ring-offset-background`
  }

  return `${base} ${colorClass}`
}

function getCellOpacity(status: CellStatus): number {
  switch (status) {
    case 'empty':
      return 0.3
    case 'unchanged':
      return 0.6
    default:
      return 1
  }
}

// =============================================================================
// Component
// =============================================================================

function MatrixCellComponent({ cell, size, onClick }: MatrixCellProps) {
  const portCount = cell.currentPorts.size
  const newCount = cell.newPorts.length
  const removedCount = cell.removedPorts.length

  const handleClick = () => {
    onClick?.(cell)
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={getCellClasses(cell.status, cell.isBaseline)}
          style={{
            width: size,
            height: size,
            opacity: getCellOpacity(cell.status),
          }}
          onClick={handleClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              handleClick()
            }
          }}
          aria-label={`${cell.hostIp} - ${getCellStatusLabel(cell.status)}`}
        >
          {/* Show count badge for cells with changes */}
          {(newCount > 0 || removedCount > 0) && size >= 20 && (
            <span
              className="absolute inset-0 flex items-center justify-center text-white font-bold"
              style={{ fontSize: Math.max(8, size * 0.4) }}
            >
              {newCount > 0 && removedCount > 0
                ? '±'
                : newCount > 0
                  ? `+${newCount}`
                  : `-${removedCount}`}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        <div className="space-y-1">
          <div className="font-medium">{cell.hostIp}</div>
          <div className="text-xs text-muted-foreground">
            {new Date(cell.timestamp * 1000).toLocaleString()}
          </div>

          <div className="pt-1 border-t border-border mt-1">
            <div className="text-xs">
              <StatusBadge status={cell.status} />
            </div>
          </div>

          <div className="text-xs space-y-0.5 pt-1">
            <div>
              <span className="text-muted-foreground">Current ports: </span>
              <span className="font-medium">{portCount}</span>
            </div>
            {newCount > 0 && (
              <div className="text-green-500">
                +{newCount} new port{newCount !== 1 ? 's' : ''}
              </div>
            )}
            {removedCount > 0 && (
              <div className="text-red-500">
                -{removedCount} removed port{removedCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          <div className="text-[10px] text-muted-foreground pt-1 border-t border-border">
            Click for details
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

// =============================================================================
// Status Badge
// =============================================================================

function StatusBadge({ status }: { status: CellStatus }) {
  const config = {
    new: { bg: 'bg-green-500/20', text: 'text-green-500', label: 'New Ports' },
    removed: { bg: 'bg-red-500/20', text: 'text-red-500', label: 'Removed Ports' },
    mixed: { bg: 'bg-amber-500/20', text: 'text-amber-500', label: 'Mixed Changes' },
    unchanged: { bg: 'bg-gray-400/20', text: 'text-gray-400', label: 'Unchanged' },
    first: { bg: 'bg-blue-500/20', text: 'text-blue-500', label: 'Baseline' },
    empty: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'No Ports' },
  }

  const { bg, text, label } = config[status]

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded ${bg} ${text}`}>
      {label}
    </span>
  )
}

// Memoize for performance with large matrices
export const MatrixCellDisplay = memo(MatrixCellComponent)
