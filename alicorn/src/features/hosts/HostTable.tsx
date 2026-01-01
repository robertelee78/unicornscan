/**
 * Host list table with sortable columns
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Link } from 'react-router-dom'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatRelativeTime } from '@/lib/utils'
import type { Host } from '@/types/database'
import type { SortState, SortField } from './types'

interface HostTableProps {
  hosts: Host[]
  sort: SortState
  onSort: (field: SortField) => void
  isLoading: boolean
}

export function HostTable({ hosts, sort, onSort, isLoading }: HostTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded" />
        ))}
      </div>
    )
  }

  if (hosts.length === 0) {
    return (
      <div className="text-center py-8 text-muted">
        No hosts found matching your criteria
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <SortableHeader
              field="host_addr"
              label="IP Address"
              sort={sort}
              onSort={onSort}
            />
            <SortableHeader
              field="hostname"
              label="Hostname"
              sort={sort}
              onSort={onSort}
            />
            <th className="pb-3 pr-4 font-medium text-muted">MAC Address</th>
            <th className="pb-3 pr-4 font-medium text-muted">OS</th>
            <SortableHeader
              field="port_count"
              label="Responses"
              sort={sort}
              onSort={onSort}
            />
            <SortableHeader
              field="scan_count"
              label="Scans"
              sort={sort}
              onSort={onSort}
            />
            <SortableHeader
              field="first_seen"
              label="First Seen"
              sort={sort}
              onSort={onSort}
            />
            <SortableHeader
              field="last_seen"
              label="Last Seen"
              sort={sort}
              onSort={onSort}
            />
          </tr>
        </thead>
        <tbody className="font-mono">
          {hosts.map((host) => (
            <HostRow key={host.host_id} host={host} />
          ))}
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
    <th className="pb-3 pr-4 font-medium text-muted">
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

interface HostRowProps {
  host: Host
}

function HostRow({ host }: HostRowProps) {
  const portCount = host.port_count ?? host.open_port_count ?? 0
  const ipAddr = host.host_addr ?? host.ip_addr

  return (
    <tr className="border-b border-border/50 hover:bg-muted/30">
      <td className="py-3 pr-4">
        <Link
          to={`/hosts/${host.host_id}`}
          className="text-primary hover:underline"
        >
          {ipAddr}
        </Link>
      </td>
      <td className="py-3 pr-4 text-muted">
        {host.hostname || '—'}
      </td>
      <td className="py-3 pr-4 text-xs">
        {host.mac_addr ? (
          <span className="uppercase">{formatMac(host.mac_addr)}</span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="py-3 pr-4">
        {host.os_guess ? (
          <Badge variant="outline" className="text-xs">
            {host.os_guess}
          </Badge>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="py-3 pr-4">
        {portCount > 0 ? (
          <Badge variant="open">{portCount}</Badge>
        ) : (
          <span className="text-muted">0</span>
        )}
      </td>
      <td className="py-3 pr-4">{host.scan_count}</td>
      <td className="py-3 pr-4 text-xs text-muted">
        {formatRelativeTime(host.first_seen)}
      </td>
      <td className="py-3 text-xs text-muted">
        {formatRelativeTime(host.last_seen)}
      </td>
    </tr>
  )
}

function formatMac(mac: string): string {
  if (mac.includes(':')) return mac
  if (mac.includes('-')) return mac.replace(/-/g, ':')
  if (mac.length === 12) {
    return mac.match(/.{2}/g)?.join(':') || mac
  }
  return mac
}
