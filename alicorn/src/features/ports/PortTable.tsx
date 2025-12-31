/**
 * Feature-rich sortable port table component
 * Response-centric design: shows what was sent and what came back
 * Unicornscan philosophy: raw stimulus/response data, not abstractions
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useMemo, useCallback } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PortBadge } from './PortBadge'
import { ProtocolBadge } from './ProtocolBadge'
import { TcpFlagsDisplay } from './TcpFlagBadge'
import { ResponseBadge } from './ResponseDisplay'
import { BannerLine } from './PayloadPreview'
import { ServiceBadge } from './ServiceInfo'
import { formatTimestamp } from '@/lib/utils'
import type { Service } from '@/types/database'
import { IP_PROTOCOLS } from '@/types/database'
import {
  type PortTableColumn,
  type PortTableSort,
  type PortTableRow,
  COLUMN_CONFIG,
  DEFAULT_COLUMNS,
  getTtlColorClass,
} from './port-utils'

// =============================================================================
// Props
// =============================================================================

interface PortTableProps {
  /** Data rows to display */
  rows: PortTableRow[]
  /** Which columns to show */
  columns?: PortTableColumn[]
  /** Initial sort state */
  defaultSort?: PortTableSort
  /** Loading state */
  isLoading?: boolean
  /** Empty state message */
  emptyMessage?: string
  /** Compact mode (smaller padding) */
  compact?: boolean
  /** Show individual TCP flag badges (vs summary) */
  showDetailedFlags?: boolean
  /** Additional class names */
  className?: string
  /** Click handler for row */
  onRowClick?: (row: PortTableRow) => void
  /** Service lookup map by ipreport_id (optional) */
  services?: Map<number, Service>
}

// =============================================================================
// Component
// =============================================================================

export function PortTable({
  rows,
  columns = DEFAULT_COLUMNS,
  defaultSort = { column: 'port', direction: 'asc' },
  isLoading = false,
  emptyMessage = 'No responses recorded',
  compact = false,
  showDetailedFlags = false,
  className,
  onRowClick,
  services,
}: PortTableProps) {
  const [sort, setSort] = useState<PortTableSort>(defaultSort)

  // Handle column header click
  const handleSort = useCallback((column: PortTableColumn) => {
    const config = COLUMN_CONFIG[column]
    if (!config.sortable) return

    setSort((prev) => {
      if (prev.column !== column) {
        return { column, direction: 'asc' }
      }
      if (prev.direction === 'asc') {
        return { column, direction: 'desc' }
      }
      if (prev.direction === 'desc') {
        return { column: null, direction: null }
      }
      return { column, direction: 'asc' }
    })
  }, [])

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sort.column || !sort.direction) return rows

    return [...rows].sort((a, b) => {
      let aVal: string | number | undefined
      let bVal: string | number | undefined

      switch (sort.column) {
        case 'host':
          // Sort IP addresses numerically
          aVal = a.hostAddr?.split('.').reduce((acc, oct) => acc * 256 + parseInt(oct), 0) ?? 0
          bVal = b.hostAddr?.split('.').reduce((acc, oct) => acc * 256 + parseInt(oct), 0) ?? 0
          break
        case 'port':
          aVal = a.port
          bVal = b.port
          break
        case 'protocol':
          aVal = a.protocol
          bVal = b.protocol
          break
        case 'response':
        case 'flags':
          aVal = a.responseFlags
          bVal = b.responseFlags
          break
        case 'ttl':
          aVal = a.ttl ?? 0
          bVal = b.ttl ?? 0
          break
        case 'window':
          aVal = a.windowSize ?? 0
          bVal = b.windowSize ?? 0
          break
        case 'service':
          aVal = a.serviceName?.toLowerCase() ?? ''
          bVal = b.serviceName?.toLowerCase() ?? ''
          break
        case 'timestamp':
          aVal = a.timestamp ?? 0
          bVal = b.timestamp ?? 0
          break
        default:
          return 0
      }

      if (typeof aVal === 'string') {
        const cmp = aVal.localeCompare(bVal as string)
        return sort.direction === 'asc' ? cmp : -cmp
      }

      return sort.direction === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number)
    })
  }, [rows, sort])

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('space-y-2', className)}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-muted animate-pulse rounded" />
        ))}
      </div>
    )
  }

  // Empty state
  if (rows.length === 0) {
    return (
      <div className={cn('text-muted py-8 text-center', className)}>
        {emptyMessage}
      </div>
    )
  }

  const cellPadding = compact ? 'py-1.5 pr-3' : 'py-2 pr-4'
  const headerPadding = compact ? 'pb-1.5 pr-3' : 'pb-2 pr-4'

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            {columns.map((col) => {
              const config = COLUMN_CONFIG[col]
              const isSorted = sort.column === col
              const SortIcon = isSorted
                ? sort.direction === 'asc'
                  ? ChevronUp
                  : ChevronDown
                : ChevronsUpDown

              return (
                <th
                  key={col}
                  className={cn(
                    headerPadding,
                    'font-medium',
                    config.align === 'right' && 'text-right',
                    config.align === 'center' && 'text-center',
                    config.sortable && 'cursor-pointer hover:text-foreground select-none'
                  )}
                  style={{ width: config.width }}
                  onClick={() => handleSort(col)}
                >
                  <span className="inline-flex items-center gap-1">
                    {config.label}
                    {config.sortable && (
                      <SortIcon className={cn(
                        'h-3 w-3',
                        isSorted ? 'opacity-100' : 'opacity-40'
                      )} />
                    )}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="font-mono">
          {sortedRows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                'border-b border-border/50 hover:bg-muted/30',
                onRowClick && 'cursor-pointer'
              )}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td
                  key={col}
                  className={cn(
                    cellPadding,
                    col === 'timestamp' && 'text-muted text-xs',
                    COLUMN_CONFIG[col].align === 'right' && 'text-right',
                    COLUMN_CONFIG[col].align === 'center' && 'text-center'
                  )}
                >
                  <PortTableCell
                    row={row}
                    column={col}
                    service={services?.get(row.id as number)}
                    compact={compact}
                    showDetailedFlags={showDetailedFlags}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// =============================================================================
// Cell Renderer
// =============================================================================

interface PortTableCellProps {
  row: PortTableRow
  column: PortTableColumn
  service?: Service
  compact?: boolean
  showDetailedFlags?: boolean
}

function PortTableCell({ row, column, service, compact, showDetailedFlags }: PortTableCellProps) {
  switch (column) {
    case 'host':
      return <span className="text-primary">{row.hostAddr ?? '—'}</span>

    case 'port':
      return <PortBadge port={row.port} showService={false} size={compact ? 'sm' : 'md'} />

    case 'protocol':
      return <ProtocolBadge protocol={row.protocol} size={compact ? 'sm' : 'md'} />

    case 'response':
      return (
        <ResponseBadge
          protocol={row.protocol}
          flags={row.responseFlags}
          icmpType={row.protocol === IP_PROTOCOLS.ICMP ? row.responseFlags : undefined}
          icmpCode={row.icmpCode}
          size={compact ? 'sm' : 'md'}
        />
      )

    case 'flags':
      // Show individual TCP flags (for detailed analysis)
      if (row.protocol === IP_PROTOCOLS.TCP) {
        return showDetailedFlags ? (
          <TcpFlagsDisplay flags={row.responseFlags} size={compact ? 'sm' : 'md'} />
        ) : (
          <span className="font-mono">{row.responseFlags.toString(16).padStart(2, '0')}</span>
        )
      }
      return <span className="text-muted">—</span>

    case 'ttl':
      return row.ttl !== undefined ? (
        <span className={getTtlColorClass(row.ttl)}>{row.ttl}</span>
      ) : (
        <span className="text-muted">—</span>
      )

    case 'window':
      return row.windowSize !== undefined ? (
        <span>{row.windowSize}</span>
      ) : (
        <span className="text-muted">—</span>
      )

    case 'service':
      // Use database service if available, otherwise well-known port hint
      return (
        <ServiceBadge
          serviceName={service?.service_name ?? row.serviceName}
          port={row.port}
        />
      )

    case 'banner':
      return (
        <BannerLine
          banner={service?.banner ?? row.banner}
          maxLength={compact ? 30 : 50}
        />
      )

    case 'timestamp':
      return row.timestamp !== undefined ? (
        <span>{formatTimestamp(row.timestamp)}</span>
      ) : (
        <span className="text-muted">—</span>
      )

    default:
      return <span className="text-muted">—</span>
  }
}

export default PortTable
