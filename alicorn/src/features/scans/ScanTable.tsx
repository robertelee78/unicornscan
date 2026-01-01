/**
 * Scan list table with sortable headers and multi-select
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Link } from 'react-router-dom'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { formatTimestamp, formatRelativeTime } from '@/lib/utils'
import type { ScanSummary } from '@/types/database'
import type { SortState, SortField } from './types'

interface ScanTableProps {
  scans: ScanSummary[]
  sort: SortState
  onSort: (field: SortField) => void
  isLoading: boolean
  // Selection props (optional for backward compatibility)
  selectedIds?: Set<number>
  onSelectionChange?: (id: number) => void
  onSelectAll?: (ids: number[]) => void
  showSelection?: boolean
}

export function ScanTable({
  scans,
  sort,
  onSort,
  isLoading,
  selectedIds = new Set(),
  onSelectionChange,
  onSelectAll,
  showSelection = false,
}: ScanTableProps) {
  if (isLoading) {
    return <div className="text-muted py-8 text-center">Loading scans...</div>
  }

  if (scans.length === 0) {
    return <div className="text-muted py-8 text-center">No scans match your filters</div>
  }

  const allSelected = scans.length > 0 && scans.every((s) => selectedIds.has(s.scans_id))
  const someSelected = scans.some((s) => selectedIds.has(s.scans_id))

  const handleSelectAll = () => {
    if (onSelectAll) {
      if (allSelected) {
        onSelectAll([]) // Clear selection
      } else {
        onSelectAll(scans.map((s) => s.scans_id))
      }
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border text-left text-sm text-muted">
            {showSelection && (
              <th className="pb-3 px-2 w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all"
                  className={someSelected && !allSelected ? 'data-[state=checked]:bg-primary/50' : ''}
                />
              </th>
            )}
            <SortableHeader
              field="scans_id"
              label="ID"
              sort={sort}
              onSort={onSort}
            />
            <th className="pb-3 px-2 font-medium">Target</th>
            <SortableHeader
              field="profile"
              label="Profile"
              sort={sort}
              onSort={onSort}
            />
            <th className="pb-3 px-2 font-medium">Mode</th>
            <SortableHeader
              field="host_count"
              label="Hosts"
              sort={sort}
              onSort={onSort}
            />
            <SortableHeader
              field="port_count"
              label="Ports"
              sort={sort}
              onSort={onSort}
            />
            <SortableHeader
              field="duration"
              label="Duration"
              sort={sort}
              onSort={onSort}
            />
            <SortableHeader
              field="s_time"
              label="Time"
              sort={sort}
              onSort={onSort}
            />
            <th className="pb-3 px-2 font-medium">Tags</th>
          </tr>
        </thead>
        <tbody className="font-mono text-sm">
          {scans.map((scan) => {
            const isSelected = selectedIds.has(scan.scans_id)
            return (
              <tr
                key={scan.scans_id}
                className={`border-b border-border/50 hover:bg-surface-light/50 ${isSelected ? 'bg-primary/5' : ''}`}
              >
                {showSelection && (
                  <td className="py-3 px-2">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onSelectionChange?.(scan.scans_id)}
                      aria-label={`Select scan ${scan.scans_id}`}
                    />
                  </td>
                )}
                <td className="py-3 px-2">
                  <Link
                    to={`/scans/${scan.scans_id}`}
                    className="text-primary hover:underline"
                  >
                    #{scan.scans_id}
                  </Link>
                </td>
              <td className="py-3 px-2 max-w-[200px] truncate" title={scan.target_str || undefined}>
                {scan.target_str || <span className="text-muted">—</span>}
              </td>
              <td className="py-3 px-2">{scan.profile}</td>
              <td className="py-3 px-2">
                <Badge variant="outline">{scan.mode_str || 'Unknown'}</Badge>
              </td>
              <td className="py-3 px-2">{scan.host_count}</td>
              <td className="py-3 px-2">{scan.port_count}</td>
              <td className="py-3 px-2">{formatDuration(scan.e_time - scan.s_time)}</td>
              <td className="py-3 px-2" title={formatTimestamp(scan.s_time)}>
                {formatRelativeTime(scan.s_time)}
              </td>
              <td className="py-3 px-2">
                <div className="flex gap-1">
                  {scan.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  {scan.tags.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{scan.tags.length - 3}
                    </Badge>
                  )}
                </div>
              </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

interface SortableHeaderProps {
  field: SortField
  label: string
  sort: SortState
  onSort: (field: SortField) => void
}

function SortableHeader({ field, label, sort, onSort }: SortableHeaderProps) {
  const isActive = sort.field === field

  return (
    <th className="pb-3 px-2 font-medium">
      <button
        onClick={() => onSort(field)}
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        {isActive ? (
          sort.direction === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    </th>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${mins}m`
}
