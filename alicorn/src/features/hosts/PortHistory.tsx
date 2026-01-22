/**
 * Port history timeline for a host
 * Shows aggregated view: one row per port with latest data, expandable history
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, Fragment, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, ChevronDown, ChevronRight, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatPort, formatTimestamp, formatRelativeTime } from '@/lib/utils'
import { ensureOuiLoaded, getVendorSync } from '@/lib/oui'
import { decodeTcpFlags } from '@/types/database'
import { TcpFlagsDisplay, truncateBanner, bannerNeedsExpansion } from '@/features/ports'
import type { AggregatedPortEntry, PortHistoryEntry } from './types'

interface PortHistoryProps {
  entries: AggregatedPortEntry[]
  isLoading: boolean
}

export function PortHistory({ entries, isLoading }: PortHistoryProps) {
  // Load OUI data for vendor lookup
  useEffect(() => {
    ensureOuiLoaded()
  }, [])

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

  const toggleBannerExpanded = (ipreportId: number) => {
    setExpandedBanners((prev) => {
      const next = new Set(prev)
      if (next.has(ipreportId)) {
        next.delete(ipreportId)
      } else {
        next.add(ipreportId)
      }
      return next
    })
  }

  // Count total unique banners across all ports
  const bannerCount = entries.filter(e => e.latestBanner).length

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Port History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-8 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Port History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted text-sm">No port observations recorded for this host.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Port History</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {entries.length} port{entries.length !== 1 ? 's' : ''}
            </Badge>
            {bannerCount > 0 && (
              <Badge variant="outline" className="text-green-400 border-green-400/50">
                {bannerCount} banner{bannerCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="pb-2 pr-2 font-medium w-6"></th>
                <th className="pb-2 pr-4 font-medium">Port</th>
                <th className="pb-2 pr-4 font-medium">Proto</th>
                <th className="pb-2 pr-4 font-medium">TTL</th>
                <th className="pb-2 pr-4 font-medium">Flags</th>
                <th className="pb-2 pr-4 font-medium">Window</th>
                <th className="pb-2 pr-4 font-medium">Banner</th>
                <th className="pb-2 pr-4 font-medium">Last Seen</th>
                <th className="pb-2 font-medium">Observations</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {entries.map((entry) => {
                const portKey = `${entry.port}-${entry.protocol}`
                const isExpanded = expandedPorts.has(portKey)
                // Show expand if multiple observations OR any expandable banner
                const canExpand = entry.history.length > 1 || !!entry.latestBanner

                return (
                  <Fragment key={portKey}>
                    {/* Main port row */}
                    <AggregatedPortRow
                      entry={entry}
                      isExpanded={isExpanded}
                      canExpand={canExpand}
                      onToggleExpand={() => togglePortExpanded(portKey)}
                    />
                    {/* Expanded history/banner rows */}
                    {isExpanded && canExpand && (
                      <tr className="bg-muted/10">
                        <td colSpan={9} className="p-0">
                          <PortHistoryTable
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
      </CardContent>
    </Card>
  )
}

// Main row showing aggregated port data
interface AggregatedPortRowProps {
  entry: AggregatedPortEntry
  isExpanded: boolean
  canExpand: boolean
  onToggleExpand: () => void
}

function AggregatedPortRow({ entry, isExpanded, canExpand, onToggleExpand }: AggregatedPortRowProps) {
  const { latest, latestBanner, bannerFromOlderScan, latestBannerScanId, latestBannerTimestamp } = entry

  return (
    <tr className="border-b border-border/50 hover:bg-muted/30">
      {/* Expand toggle for history/banner */}
      <td className="py-2 pr-2 w-6">
        {canExpand ? (
          <button
            onClick={onToggleExpand}
            className="text-muted hover:text-foreground transition-colors"
            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </td>
      <td className="py-2 pr-4">
        <Badge variant="open">{formatPort(entry.port)}</Badge>
      </td>
      <td className="py-2 pr-4 uppercase">{entry.protocol}</td>
      <td className="py-2 pr-4">{latest.ttl}</td>
      <td className="py-2 pr-4">
        <TcpFlagsDisplay flags={decodeTcpFlags(latest.flags)} />
      </td>
      <td className="py-2 pr-4">{latest.window_size}</td>
      {/* Banner with optional "from older scan" indicator */}
      <td className="py-2 pr-4 text-xs max-w-[200px]">
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
      <td className="py-2 pr-4 text-muted text-xs">
        {formatRelativeTime(latest.tstamp)}
      </td>
      <td className="py-2 text-muted text-xs">
        {entry.history.length}
      </td>
    </tr>
  )
}

// Table showing historical observations for a port
interface PortHistoryTableProps {
  history: PortHistoryEntry[]
  expandedBanners: Set<number>
  onToggleBanner: (id: number) => void
}

function PortHistoryTable({ history, expandedBanners, onToggleBanner }: PortHistoryTableProps) {
  return (
    <div className="pl-8 pr-4 py-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/30 text-left text-muted">
            <th className="pb-1 pr-2 w-4"></th>
            <th className="pb-1 pr-3">Scan</th>
            <th className="pb-1 pr-3">MAC</th>
            <th className="pb-1 pr-3">Vendor</th>
            <th className="pb-1 pr-3">TTL</th>
            <th className="pb-1 pr-3">Flags</th>
            <th className="pb-1 pr-3">Window</th>
            <th className="pb-1 pr-3">Banner</th>
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
                <tr className="border-b border-border/20 hover:bg-muted/20">
                  {/* Banner expand toggle */}
                  <td className="py-1 pr-2 w-4">
                    {entry.banner && needsExpansion ? (
                      <button
                        onClick={() => onToggleBanner(entry.ipreport_id)}
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
                  <td className="py-1 pr-3">
                    <Link
                      to={`/scans/${entry.scan_id}`}
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      #{entry.scan_id}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </Link>
                  </td>
                  <td className="py-1 pr-3 text-muted">
                    {entry.eth_hwaddr || '—'}
                  </td>
                  <td className="py-1 pr-3 max-w-[100px]">
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
                  <td className="py-1 pr-3">{entry.ttl}</td>
                  <td className="py-1 pr-3">
                    <TcpFlagsDisplay flags={decodeTcpFlags(entry.flags)} />
                  </td>
                  <td className="py-1 pr-3">{entry.window_size}</td>
                  <td className="py-1 pr-3 max-w-[150px]">
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
  )
}
