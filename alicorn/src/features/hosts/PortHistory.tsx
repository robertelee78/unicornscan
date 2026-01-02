/**
 * Port history timeline for a host
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, Fragment, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatPort, formatTimestamp } from '@/lib/utils'
import { ensureOuiLoaded, getVendorSync } from '@/lib/oui'
import { decodeTcpFlags } from '@/types/database'
import { TcpFlagsDisplay, truncateBanner, bannerNeedsExpansion } from '@/features/ports'
import type { PortHistoryEntry } from './types'

interface PortHistoryProps {
  entries: PortHistoryEntry[]
  isLoading: boolean
}

export function PortHistory({ entries, isLoading }: PortHistoryProps) {
  // Load OUI data for vendor lookup
  useEffect(() => {
    ensureOuiLoaded()
  }, [])

  // Track which rows are expanded to show full banner
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const toggleExpanded = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Count entries with banners
  const bannerCount = entries.filter(e => e.banner).length

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

  // Group by scan
  const scanGroups = new Map<number, { scan_time: number; ports: PortHistoryEntry[] }>()
  for (const entry of entries) {
    const existing = scanGroups.get(entry.scan_id)
    if (existing) {
      existing.ports.push(entry)
    } else {
      scanGroups.set(entry.scan_id, { scan_time: entry.scan_time, ports: [entry] })
    }
  }

  // Get unique ports across all scans for timeline
  const allPorts = [...new Set(entries.map((e) => e.port))].sort((a, b) => a - b)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Port History</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {allPorts.length} unique port{allPorts.length !== 1 ? 's' : ''}
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
                <th className="pb-2 pr-4 font-medium">Scan</th>
                <th className="pb-2 pr-4 font-medium">MAC</th>
                <th className="pb-2 pr-4 font-medium">Vendor</th>
                <th className="pb-2 pr-4 font-medium">Port</th>
                <th className="pb-2 pr-4 font-medium">Protocol</th>
                <th className="pb-2 pr-4 font-medium">TTL</th>
                <th className="pb-2 pr-4 font-medium">Flags</th>
                <th className="pb-2 pr-4 font-medium">Window</th>
                <th className="pb-2 pr-4 font-medium">Banner</th>
                <th className="pb-2 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {entries.map((entry, idx) => {
                const needsExpansion = entry.banner ? bannerNeedsExpansion(entry.banner) : false
                const isExpanded = expandedRows.has(entry.ipreport_id)
                const vendor = getVendorSync(entry.eth_hwaddr)

                return (
                  <Fragment key={`${entry.scan_id}-${entry.port}-${idx}`}>
                    <tr className="border-b border-border/50 hover:bg-muted/30">
                      {/* Expand toggle */}
                      <td className="py-2 pr-2 w-6">
                        {entry.banner && needsExpansion ? (
                          <button
                            onClick={() => toggleExpanded(entry.ipreport_id)}
                            className="text-muted hover:text-foreground transition-colors"
                            aria-label={isExpanded ? 'Collapse banner' : 'Expand banner'}
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
                        <Link
                          to={`/scans/${entry.scan_id}`}
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          #{entry.scan_id}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-muted text-xs">
                        {entry.eth_hwaddr || '—'}
                      </td>
                      <td className="py-2 pr-4 text-xs max-w-[150px]">
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
                      <td className="py-2 pr-4">
                        <Badge variant="open">{formatPort(entry.port)}</Badge>
                      </td>
                      <td className="py-2 pr-4 uppercase">{entry.protocol}</td>
                      <td className="py-2 pr-4">{entry.ttl}</td>
                      <td className="py-2 pr-4">
                        <TcpFlagsDisplay flags={decodeTcpFlags(entry.flags)} />
                      </td>
                      <td className="py-2 pr-4">{entry.window_size}</td>
                      {/* Banner preview column */}
                      <td className="py-2 pr-4 text-xs max-w-[200px]">
                        {entry.banner ? (
                          <span className="text-green-400 truncate block">
                            {truncateBanner(entry.banner)}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="py-2 text-muted text-xs">
                        {formatTimestamp(entry.tstamp)}
                      </td>
                    </tr>
                    {/* Expanded banner row */}
                    {entry.banner && isExpanded && (
                      <tr className="bg-muted/20">
                        <td colSpan={11} className="px-4 py-3">
                          <div className="text-xs">
                            <div className="text-muted mb-1 font-sans">Banner Data:</div>
                            <pre className="text-green-400 whitespace-pre-wrap break-all font-mono text-xs bg-background/50 p-2 rounded border border-border/50 max-h-[300px] overflow-y-auto">
                              {entry.banner}
                            </pre>
                          </div>
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
