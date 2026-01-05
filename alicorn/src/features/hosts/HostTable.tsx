/**
 * Host list table with sortable columns, expandable port details, and search highlighting
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useEffect, Fragment, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, ChevronRight, Clock } from 'lucide-react'
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
import { useAggregatedPortHistory } from './hooks'
import { useLiveGeoIP } from './useLiveGeoIP'
import { HighlightText, textMatchesSearch, getMatchedFields, MATCHED_FIELD_LABELS } from './HighlightText'
import type { Host } from '@/types/database'
import type { SortState, SortField, AggregatedPortEntry, PortHistoryEntry, ParsedSearch } from './types'

interface HostTableProps {
  hosts: Host[]
  sort: SortState
  onSort: (field: SortField) => void
  isLoading: boolean
  /** Parsed search for highlighting matches */
  parsedSearch?: ParsedSearch | null
}

export function HostTable({ hosts, sort, onSort, isLoading, parsedSearch }: HostTableProps) {
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
            <th className="pb-3 pr-4 font-medium text-muted">Location</th>
            <th className="pb-3 pr-4 font-medium text-muted">ASN</th>
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
                parsedSearch={parsedSearch}
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
  parsedSearch?: ParsedSearch | null
}

function HostRow({ host, isExpanded, onToggleExpand, parsedSearch }: HostRowProps) {
  // port_count is the canonical field (responding ports)
  const portCount = host.port_count ?? 0
  const ipAddr = host.host_addr ?? host.ip_addr
  const macAddr = host.current_mac || host.mac_addr
  // v11: Get all MACs observed for this IP
  const allMacs = host.mac_addrs?.filter(Boolean) || (macAddr ? [macAddr] : [])
  const hasMultipleMacs = allMacs.length > 1
  const vendor = getVendorSync(macAddr)

  // Check if host has stored GeoIP data
  const hasStoredGeoIP = !!(host.city || host.region_name || host.country_code || host.asn)

  // Fetch live GeoIP data if not stored in database
  const { data: liveGeoIP, isLoading: geoIPLoading } = useLiveGeoIP(ipAddr, hasStoredGeoIP)

  // Use stored data if available, otherwise use live lookup
  const geoCity = host.city || liveGeoIP?.city || null
  const geoRegion = host.region_name || liveGeoIP?.region_name || null
  const geoCountryCode = host.country_code || liveGeoIP?.country_code || null
  const geoCountryName = host.country_name || liveGeoIP?.country_name || null
  const geoAsn = host.asn || liveGeoIP?.asn || null
  const geoAsOrg = host.as_org || liveGeoIP?.as_org || null
  const isLiveGeoIP = !hasStoredGeoIP && liveGeoIP !== null

  // Calculate which fields match for text/regex searches
  const matchInfo = useMemo(() => {
    if (!parsedSearch || (parsedSearch.type !== 'text' && parsedSearch.type !== 'regex')) {
      return undefined
    }
    return {
      ip: textMatchesSearch(ipAddr, parsedSearch),
      hostname: textMatchesSearch(host.hostname, parsedSearch),
      mac: textMatchesSearch(macAddr, parsedSearch),
      os: textMatchesSearch(host.os_name || host.os_family || host.os_guess, parsedSearch),
      // Note: banner/notes matching requires loaded indices, shown as matched if host is in results
    }
  }, [parsedSearch, ipAddr, host.hostname, macAddr, host.os_name, host.os_family, host.os_guess])

  // Get matched fields for indicator
  const matchedFields = useMemo(() => {
    if (!parsedSearch) return []
    return getMatchedFields(parsedSearch.type, matchInfo)
  }, [parsedSearch, matchInfo])

  return (
    <Fragment>
      <tr className="border-b border-border/50 hover:bg-muted/30">
        {/* Expand toggle with match indicator */}
        <td className="py-3 pr-2 w-6">
          <div className="flex items-center gap-1">
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
            {/* Match indicator for search */}
            {matchedFields.length > 0 && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 flex-shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs">
                      Matched: {matchedFields.map(f => MATCHED_FIELD_LABELS[f]).join(', ')}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </td>
        <td className="py-3 pr-4">
          <Link
            to={`/hosts/${encodeURIComponent(ipAddr)}`}
            className="text-primary hover:underline"
          >
            <HighlightText text={ipAddr} search={parsedSearch ?? null} />
          </Link>
        </td>
        <td className="py-3 pr-4 text-muted">
          <HighlightText text={host.hostname} search={parsedSearch ?? null} />
        </td>
        <td className="py-3 pr-4 text-xs">
          {macAddr ? (
            hasMultipleMacs ? (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="uppercase cursor-default inline-flex items-center gap-1">
                      {formatMac(macAddr)}
                      <span className="text-yellow-500 text-[10px]">+{allMacs.length - 1}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-yellow-400 mb-1">{allMacs.length} MAC addresses observed:</p>
                    <ul className="space-y-0.5">
                      {allMacs.map((mac, idx) => (
                        <li key={mac} className="uppercase font-mono text-xs">
                          {formatMac(mac)}
                          {idx === 0 && <span className="text-muted ml-1">(most recent)</span>}
                        </li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span className="uppercase">{formatMac(macAddr)}</span>
            )
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
              <HighlightText
                text={host.os_name || host.os_family || host.os_guess}
                search={parsedSearch ?? null}
              />
            </Badge>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        {/* Location: City, Region, Country */}
        <td className="py-3 pr-4 text-xs max-w-[180px]">
          {geoIPLoading ? (
            <span className="text-muted animate-pulse">...</span>
          ) : (geoCity || geoRegion || geoCountryCode) ? (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={`cursor-default truncate block ${isLiveGeoIP ? 'text-cyan-400' : ''}`}>
                    {[geoCity, geoRegion, geoCountryCode].filter(Boolean).join(', ')}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="space-y-0.5">
                    {geoCity && <p><span className="text-muted">City:</span> {geoCity}</p>}
                    {geoRegion && <p><span className="text-muted">Region:</span> {geoRegion}</p>}
                    {geoCountryName && <p><span className="text-muted">Country:</span> {geoCountryName}</p>}
                    {isLiveGeoIP && <p className="text-cyan-400 text-xs mt-1">Live lookup (not stored)</p>}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        {/* ASN / Network info */}
        <td className="py-3 pr-4 text-xs max-w-[150px]">
          {geoIPLoading ? (
            <span className="text-muted animate-pulse">...</span>
          ) : geoAsn ? (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={`https://bgp.he.net/AS${geoAsn}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`truncate block hover:underline ${isLiveGeoIP ? 'text-cyan-400' : 'text-primary'}`}
                  >
                    AS{geoAsn}
                  </a>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="space-y-0.5">
                    <p><span className="text-muted">ASN:</span> {geoAsn}</p>
                    {geoAsOrg && <p><span className="text-muted">Org:</span> {geoAsOrg}</p>}
                    <p className="text-muted text-xs">Click to view on bgp.he.net</p>
                    {isLiveGeoIP && <p className="text-cyan-400 text-xs mt-1">Live lookup (not stored)</p>}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
          <td colSpan={12} className="p-0">
            <ExpandedHostPorts hostIp={ipAddr} />
          </td>
        </tr>
      )}
    </Fragment>
  )
}

// Expanded port details component - lazy loads aggregated port data
interface ExpandedHostPortsProps {
  hostIp: string
}

function ExpandedHostPorts({ hostIp }: ExpandedHostPortsProps) {
  const { data: entries = [], isLoading } = useAggregatedPortHistory(hostIp)
  // Track which ports are expanded to show history
  const [expandedPorts, setExpandedPorts] = useState<Set<string>>(new Set())
  // Track which history rows are expanded to show full banner
  const [expandedBanners, setExpandedBanners] = useState<Set<number>>(new Set())

  const togglePortExpanded = (portKey: string) => {
    setExpandedPorts((prev) => {
      const next = new Set(prev)
      if (next.has(portKey)) {
        next.delete(portKey)
      } else {
        next.add(portKey)
      }
      return next
    })
  }

  const toggleBannerExpanded = (id: number) => {
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

  const bannerCount = entries.filter(e => e.latestBanner).length

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-2 text-xs text-muted">
        <span>{entries.length} port{entries.length !== 1 ? 's' : ''}</span>
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
              <th className="pb-2 pr-3">Port</th>
              <th className="pb-2 pr-3">Proto</th>
              <th className="pb-2 pr-3">TTL</th>
              <th className="pb-2 pr-3">Flags</th>
              <th className="pb-2 pr-3">Window</th>
              <th className="pb-2 pr-3">Banner</th>
              <th className="pb-2 pr-3">Last Seen</th>
              <th className="pb-2">History</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {entries.map((entry) => {
              const portKey = `${entry.port}-${entry.protocol}`
              const isPortExpanded = expandedPorts.has(portKey)
              // Show expand if multiple observations OR any expandable banner
              const canExpand = entry.history.length > 1 || !!entry.latestBanner

              return (
                <Fragment key={portKey}>
                  {/* Main aggregated port row */}
                  <AggregatedPortRow
                    entry={entry}
                    isExpanded={isPortExpanded}
                    canExpand={canExpand}
                    onToggleExpand={() => togglePortExpanded(portKey)}
                  />
                  {/* Expanded history/banner rows */}
                  {isPortExpanded && canExpand && (
                    <tr className="bg-muted/10">
                      <td colSpan={9} className="p-0">
                        <PortHistorySubTable
                          history={entry.history}
                          expandedBanners={expandedBanners}
                          onToggleBanner={toggleBannerExpanded}
                        />
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

// Aggregated port row for expanded host view
interface AggregatedPortRowProps {
  entry: AggregatedPortEntry
  isExpanded: boolean
  canExpand: boolean
  onToggleExpand: () => void
}

function AggregatedPortRow({ entry, isExpanded, canExpand, onToggleExpand }: AggregatedPortRowProps) {
  const { latest, latestBanner, bannerFromOlderScan, latestBannerScanId, latestBannerTimestamp } = entry

  return (
    <tr className="border-b border-border/30 hover:bg-muted/20">
      {/* Expand toggle for history/banner */}
      <td className="py-1.5 pr-2 w-6">
        {canExpand ? (
          <button
            onClick={onToggleExpand}
            className="text-muted hover:text-foreground transition-colors"
            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : null}
      </td>
      <td className="py-1.5 pr-3">
        <Badge variant="open" className="text-xs">{formatPort(entry.port)}</Badge>
      </td>
      <td className="py-1.5 pr-3 uppercase">{entry.protocol}</td>
      <td className="py-1.5 pr-3">{latest.ttl}</td>
      <td className="py-1.5 pr-3">
        <TcpFlagsDisplay flags={decodeTcpFlags(latest.flags)} />
      </td>
      <td className="py-1.5 pr-3">{latest.window_size}</td>
      {/* Banner with optional "from older scan" indicator */}
      <td className="py-1.5 pr-3 max-w-[150px]">
        {latestBanner ? (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-green-400 truncate block cursor-default inline-flex items-center gap-1">
                  {truncateBanner(latestBanner)}
                  {bannerFromOlderScan && (
                    <Clock className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {bannerFromOlderScan && latestBannerTimestamp ? (
                  <p className="text-yellow-400">
                    Banner from scan #{latestBannerScanId}, {formatRelativeTime(latestBannerTimestamp)}
                  </p>
                ) : (
                  <p>{truncateBanner(latestBanner, 100)}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="py-1.5 pr-3 text-muted">
        {formatRelativeTime(latest.tstamp)}
      </td>
      <td className="py-1.5 text-muted">
        {entry.history.length}
      </td>
    </tr>
  )
}

// History sub-table for expanded port row
interface PortHistorySubTableProps {
  history: PortHistoryEntry[]
  expandedBanners: Set<number>
  onToggleBanner: (id: number) => void
}

function PortHistorySubTable({ history, expandedBanners, onToggleBanner }: PortHistorySubTableProps) {
  return (
    <div className="pl-8 pr-4 py-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/20 text-left text-muted">
            <th className="pb-1 pr-2 w-4"></th>
            <th className="pb-1 pr-2">Scan</th>
            <th className="pb-1 pr-2">MAC</th>
            <th className="pb-1 pr-2">Vendor</th>
            <th className="pb-1 pr-2">TTL</th>
            <th className="pb-1 pr-2">Flags</th>
            <th className="pb-1 pr-2">Window</th>
            <th className="pb-1 pr-2">Banner</th>
            <th className="pb-1">Timestamp</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {history.map((entry, idx) => {
            const needsExpansion = entry.banner ? bannerNeedsExpansion(entry.banner) : false
            const isBannerExpanded = expandedBanners.has(entry.ipreport_id)
            const vendor = getVendorSync(entry.eth_hwaddr)

            return (
              <Fragment key={`${entry.scan_id}-${entry.port}-${idx}`}>
                <tr className="border-b border-border/10 hover:bg-muted/10">
                  {/* Banner expand toggle */}
                  <td className="py-1 pr-2 w-4">
                    {entry.banner && needsExpansion ? (
                      <button
                        onClick={() => onToggleBanner(entry.ipreport_id)}
                        className="text-muted hover:text-foreground transition-colors"
                        aria-label={isBannerExpanded ? 'Collapse banner' : 'Expand banner'}
                      >
                        {isBannerExpanded ? (
                          <ChevronDown className="h-2.5 w-2.5" />
                        ) : (
                          <ChevronRight className="h-2.5 w-2.5" />
                        )}
                      </button>
                    ) : null}
                  </td>
                  <td className="py-1 pr-2">
                    <Link
                      to={`/scans/${entry.scan_id}`}
                      className="text-primary hover:underline"
                    >
                      #{entry.scan_id}
                    </Link>
                  </td>
                  <td className="py-1 pr-2 text-muted">
                    {entry.eth_hwaddr || '—'}
                  </td>
                  <td className="py-1 pr-2 max-w-[80px]">
                    {vendor ? (
                      <span className="truncate block">{vendor}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="py-1 pr-2">{entry.ttl}</td>
                  <td className="py-1 pr-2">
                    <TcpFlagsDisplay flags={decodeTcpFlags(entry.flags)} />
                  </td>
                  <td className="py-1 pr-2">{entry.window_size}</td>
                  <td className="py-1 pr-2 max-w-[120px]">
                    {entry.banner ? (
                      <span className="text-green-400 truncate block">
                        {truncateBanner(entry.banner)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="py-1 text-muted">
                    {formatTimestamp(entry.tstamp)}
                  </td>
                </tr>
                {/* Expanded banner */}
                {entry.banner && isBannerExpanded && (
                  <tr className="bg-background/50">
                    <td colSpan={9} className="px-4 py-2">
                      <pre className="text-green-400 whitespace-pre-wrap break-all font-mono text-xs bg-muted/30 p-2 rounded border border-border/50 max-h-[150px] overflow-y-auto">
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
  )
}

