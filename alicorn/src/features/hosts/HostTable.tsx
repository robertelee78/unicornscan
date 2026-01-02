/**
 * Host list table with sortable columns and expandable port details
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useEffect, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatRelativeTime, formatMac, formatPort, formatTimestamp } from '@/lib/utils'
import { ensureOuiLoaded, getVendorSync } from '@/lib/oui'
import { decodeTcpFlags } from '@/types/database'
import { TcpFlagsDisplay, truncateBanner, bannerNeedsExpansion } from '@/features/ports'
import { useHostPortHistory } from './hooks'
import type { Host } from '@/types/database'
import type { SortState, SortField } from './types'

interface HostTableProps {
  hosts: Host[]
  sort: SortState
  onSort: (field: SortField) => void
  isLoading: boolean
}

export function HostTable({ hosts, sort, onSort, isLoading }: HostTableProps) {
  // Load OUI data for vendor lookup
  useEffect(() => {
    ensureOuiLoaded()
  }, [])

  // Track which host rows are expanded to show port details
  const [expandedHosts, setExpandedHosts] = useState<Set<string>>(new Set())

  const toggleHostExpanded = (hostIp: string) => {
    setExpandedHosts((prev) => {
      const next = new Set(prev)
      if (next.has(hostIp)) {
        next.delete(hostIp)
      } else {
        next.add(hostIp)
      }
      return next
    })
  }

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
            <th className="pb-3 pr-2 font-medium text-muted w-6"></th>
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
            <th className="pb-3 pr-4 font-medium text-muted">Vendor</th>
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
          {hosts.map((host) => {
            const hostIp = host.host_addr ?? host.ip_addr
            const isExpanded = expandedHosts.has(hostIp)
            return (
              <HostRow
                key={host.host_id}
                host={host}
                isExpanded={isExpanded}
                onToggleExpand={() => toggleHostExpanded(hostIp)}
              />
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
  isExpanded: boolean
  onToggleExpand: () => void
}

function HostRow({ host, isExpanded, onToggleExpand }: HostRowProps) {
  // port_count is the canonical field (responding ports)
  const portCount = host.port_count ?? 0
  const ipAddr = host.host_addr ?? host.ip_addr
  const macAddr = host.current_mac || host.mac_addr
  const vendor = getVendorSync(macAddr)

  return (
    <Fragment>
      <tr className="border-b border-border/50 hover:bg-muted/30">
        {/* Expand toggle */}
        <td className="py-3 pr-2 w-6">
          {portCount > 0 ? (
            <button
              onClick={onToggleExpand}
              className="text-muted hover:text-foreground transition-colors"
              aria-label={isExpanded ? 'Collapse ports' : 'Expand ports'}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : null}
        </td>
        <td className="py-3 pr-4">
          <Link
            to={`/hosts/${encodeURIComponent(ipAddr)}`}
            className="text-primary hover:underline"
          >
            {ipAddr}
          </Link>
        </td>
        <td className="py-3 pr-4 text-muted">
          {host.hostname || '—'}
        </td>
        <td className="py-3 pr-4 text-xs">
          {macAddr ? (
            <span className="uppercase">{formatMac(macAddr)}</span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="py-3 pr-4 text-xs max-w-[200px]">
          {vendor ? (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="truncate block cursor-default">{vendor}</span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{vendor}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="py-3 pr-4">
          {(host.os_name || host.os_family || host.os_guess) ? (
            <Badge variant="outline" className="text-xs">
              {host.os_name || host.os_family || host.os_guess}
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
      {/* Expanded port details */}
      {isExpanded && (
        <tr className="bg-muted/20">
          <td colSpan={10} className="p-0">
            <ExpandedHostPorts hostIp={ipAddr} />
          </td>
        </tr>
      )}
    </Fragment>
  )
}

// Expanded port details component - lazy loads port data
interface ExpandedHostPortsProps {
  hostIp: string
}

function ExpandedHostPorts({ hostIp }: ExpandedHostPortsProps) {
  const { data: entries = [], isLoading } = useHostPortHistory(hostIp)
  const [expandedBanners, setExpandedBanners] = useState<Set<number>>(new Set())

  const toggleBanner = (id: number) => {
    setExpandedBanners((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="h-8 bg-muted/50 animate-pulse rounded" />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="p-4 text-muted text-sm">
        No port data available for this host.
      </div>
    )
  }

  const bannerCount = entries.filter(e => e.banner).length

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-2 text-xs text-muted">
        <span>{entries.length} port observation{entries.length !== 1 ? 's' : ''}</span>
        {bannerCount > 0 && (
          <Badge variant="outline" className="text-green-400 border-green-400/50 text-xs">
            {bannerCount} banner{bannerCount !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="pb-2 pr-2 w-6"></th>
              <th className="pb-2 pr-3">Scan</th>
              <th className="pb-2 pr-3">MAC</th>
              <th className="pb-2 pr-3">Vendor</th>
              <th className="pb-2 pr-3">Port</th>
              <th className="pb-2 pr-3">Proto</th>
              <th className="pb-2 pr-3">TTL</th>
              <th className="pb-2 pr-3">Flags</th>
              <th className="pb-2 pr-3">Window</th>
              <th className="pb-2 pr-3">Banner</th>
              <th className="pb-2">Timestamp</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {entries.map((entry, idx) => {
              const needsExpansion = entry.banner ? bannerNeedsExpansion(entry.banner) : false
              const isBannerExpanded = expandedBanners.has(entry.ipreport_id)
              const entryVendor = getVendorSync(entry.eth_hwaddr)

              return (
                <Fragment key={`${entry.scan_id}-${entry.port}-${idx}`}>
                  <tr className="border-b border-border/30 hover:bg-muted/20">
                    <td className="py-1.5 pr-2 w-6">
                      {entry.banner && needsExpansion ? (
                        <button
                          onClick={() => toggleBanner(entry.ipreport_id)}
                          className="text-muted hover:text-foreground transition-colors"
                          aria-label={isBannerExpanded ? 'Collapse banner' : 'Expand banner'}
                        >
                          {isBannerExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                        </button>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3">
                      <Link
                        to={`/scans/${entry.scan_id}`}
                        className="text-primary hover:underline"
                      >
                        #{entry.scan_id}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 text-muted">
                      {entry.eth_hwaddr || '—'}
                    </td>
                    <td className="py-1.5 pr-3 max-w-[100px]">
                      {entryVendor ? (
                        <span className="truncate block">{entryVendor}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3">
                      <Badge variant="open" className="text-xs">{formatPort(entry.port)}</Badge>
                    </td>
                    <td className="py-1.5 pr-3 uppercase">{entry.protocol}</td>
                    <td className="py-1.5 pr-3">{entry.ttl}</td>
                    <td className="py-1.5 pr-3">
                      <TcpFlagsDisplay flags={decodeTcpFlags(entry.flags)} />
                    </td>
                    <td className="py-1.5 pr-3">{entry.window_size}</td>
                    <td className="py-1.5 pr-3 max-w-[150px]">
                      {entry.banner ? (
                        <span className="text-green-400 truncate block">
                          {truncateBanner(entry.banner)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-1.5 text-muted">
                      {formatTimestamp(entry.tstamp)}
                    </td>
                  </tr>
                  {/* Expanded banner */}
                  {entry.banner && isBannerExpanded && (
                    <tr className="bg-background/50">
                      <td colSpan={11} className="px-4 py-2">
                        <pre className="text-green-400 whitespace-pre-wrap break-all font-mono text-xs bg-muted/30 p-2 rounded border border-border/50 max-h-[200px] overflow-y-auto">
                          {entry.banner}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

