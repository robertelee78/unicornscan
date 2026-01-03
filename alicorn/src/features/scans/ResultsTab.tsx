/**
 * Results tab - table of IP reports with TCP flags and banners
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useEffect, useState, Fragment } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatPort, formatTimestamp } from '@/lib/utils'
import { ensureOuiLoaded, getVendorSync } from '@/lib/oui'
import { decodeTcpFlags, getProtocolName } from '@/types/database'
import { TcpFlagsDisplay, truncateBanner, bannerNeedsExpansion } from '@/features/ports'
import type { IpReport } from '@/types/database'

interface ResultsTabProps {
  reports: IpReport[]
  banners?: Map<number, string>
  isLoading: boolean
}

export function ResultsTab({ reports, banners, isLoading }: ResultsTabProps) {
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

  // Count how many reports have banners
  const bannerCount = banners?.size ?? 0

  if (isLoading) {
    return <div className="text-muted py-8 text-center">Loading results...</div>
  }

  if (reports.length === 0) {
    return <div className="text-muted py-8 text-center">No responses recorded</div>
  }

  return (
    <div className="overflow-x-auto">
      {bannerCount > 0 && (
        <div className="text-xs text-muted mb-2">
          {bannerCount} response{bannerCount !== 1 ? 's' : ''} with banner data
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th className="pb-2 pr-4 font-medium w-6"></th>
            <th className="pb-2 pr-4 font-medium">Host</th>
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
          {reports.map((report) => (
            <ResultRow
              key={report.ipreport_id}
              report={report}
              banner={banners?.get(report.ipreport_id)}
              isExpanded={expandedRows.has(report.ipreport_id)}
              onToggleExpand={() => toggleExpanded(report.ipreport_id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface ResultRowProps {
  report: IpReport
  banner?: string
  isExpanded: boolean
  onToggleExpand: () => void
}

function ResultRow({ report, banner, isExpanded, onToggleExpand }: ResultRowProps) {
  // For TCP (proto=6): type contains TCP header flags (SYN, ACK, etc.)
  // For ICMP: type is ICMP type code, subtype is ICMP code
  // flags field is for CRC/checksum errors, not TCP flags
  const flags = decodeTcpFlags(report.type)
  const protocol = getProtocolName(report.proto)
  const vendor = getVendorSync(report.eth_hwaddr)
  const needsExpansion = banner ? bannerNeedsExpansion(banner) : false

  return (
    <Fragment>
      <tr className="border-b border-border/50 hover:bg-muted/30">
        {/* Expand toggle */}
        <td className="py-2 pr-2 w-6">
          {banner && needsExpansion ? (
            <button
              onClick={onToggleExpand}
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
        <td className="py-2 pr-4 text-primary">{report.host_addr}</td>
        <td className="py-2 pr-4 text-muted text-xs">
          {report.eth_hwaddr || '—'}
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
          <Badge variant="open">{formatPort(report.sport)}</Badge>
        </td>
        <td className="py-2 pr-4 uppercase">{protocol}</td>
        <td className="py-2 pr-4">{report.ttl}</td>
        <td className="py-2 pr-4">
          <TcpFlagsDisplay flags={flags} />
        </td>
        <td className="py-2 pr-4">{report.window_size}</td>
        {/* Banner preview column */}
        <td className="py-2 pr-4 text-xs max-w-[200px]">
          {banner ? (
            <span className="text-green-400 truncate block">
              {truncateBanner(banner)}
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="py-2 text-muted text-xs">
          {formatTimestamp(report.tstamp)}
        </td>
      </tr>
      {/* Expanded banner row */}
      {banner && isExpanded && (
        <tr className="bg-muted/20">
          <td colSpan={11} className="px-4 py-3">
            <div className="text-xs">
              <div className="text-muted mb-1 font-sans">Banner Data:</div>
              <pre className="text-green-400 whitespace-pre-wrap break-all font-mono text-xs bg-background/50 p-2 rounded border border-border/50 max-h-[300px] overflow-y-auto">
                {banner}
              </pre>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}
