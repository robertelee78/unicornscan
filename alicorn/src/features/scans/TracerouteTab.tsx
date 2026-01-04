/**
 * Traceroute tab - displays hop chain data for TCPtrace scans
 * Shows vertical traceroute paths grouped by target
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Hop } from '@/types/database'

interface TracerouteTabProps {
  hops: Hop[]
  isLoading: boolean
}

/**
 * Group hops by target address and sort by hop number
 */
function groupHopsByTarget(hops: Hop[]): Map<string, Hop[]> {
  const grouped = new Map<string, Hop[]>()

  for (const hop of hops) {
    const existing = grouped.get(hop.target_addr)
    if (existing) {
      existing.push(hop)
    } else {
      grouped.set(hop.target_addr, [hop])
    }
  }

  // Sort each group by hop_number
  for (const [, targetHops] of grouped) {
    targetHops.sort((a, b) => (a.hop_number ?? 0) - (b.hop_number ?? 0))
  }

  return grouped
}

export function TracerouteTab({ hops, isLoading }: TracerouteTabProps) {
  // Group hops by target address
  const hopsByTarget = useMemo(() => groupHopsByTarget(hops), [hops])
  const targetCount = hopsByTarget.size

  if (isLoading) {
    return <div className="text-muted py-8 text-center">Loading traceroute data...</div>
  }

  if (hops.length === 0) {
    return (
      <div className="text-muted py-8 text-center">
        No traceroute hop data recorded for this scan
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="text-sm text-muted">
        {hops.length} hop{hops.length !== 1 ? 's' : ''} across{' '}
        {targetCount} target{targetCount !== 1 ? 's' : ''}
      </div>

      {/* Traceroute paths grouped by target */}
      {Array.from(hopsByTarget.entries()).map(([targetAddr, targetHops]) => (
        <TraceroutePath
          key={targetAddr}
          targetAddr={targetAddr}
          hops={targetHops}
        />
      ))}
    </div>
  )
}

interface TraceroutePathProps {
  targetAddr: string
  hops: Hop[]
}

function TraceroutePath({ targetAddr, hops }: TraceroutePathProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="text-muted font-normal">Trace to</span>
          <span className="font-mono text-primary">{targetAddr}</span>
          <Badge variant="secondary" className="ml-2">
            {hops.length} hop{hops.length !== 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="pb-2 pr-6 font-medium w-16">Hop</th>
                <th className="pb-2 pr-6 font-medium">Router IP</th>
                <th className="pb-2 pr-6 font-medium w-20">TTL</th>
                <th className="pb-2 font-medium w-24">RTT</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {hops.map((hop) => (
                <HopRow key={hop.hop_id} hop={hop} />
              ))}
              {/* Final destination row */}
              <tr className="border-t border-border bg-muted/20">
                <td className="py-2 pr-6 text-muted">
                  {(hops[hops.length - 1]?.hop_number ?? hops.length) + 1}
                </td>
                <td className="py-2 pr-6 text-green-400 font-semibold">
                  {targetAddr}
                  <span className="text-muted font-normal ml-2">[destination]</span>
                </td>
                <td className="py-2 pr-6 text-muted">—</td>
                <td className="py-2 text-muted">—</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Visual path representation */}
        <div className="mt-4 pt-4 border-t border-border/50">
          <div className="text-xs text-muted mb-2">Path visualization:</div>
          <div className="flex flex-wrap items-center gap-1 text-xs font-mono">
            <span className="text-blue-400">[scanner]</span>
            {hops.map((hop) => (
              <span key={hop.hop_id} className="flex items-center">
                <span className="text-muted mx-1">→</span>
                <span className="text-yellow-400">{hop.hop_addr}</span>
              </span>
            ))}
            <span className="text-muted mx-1">→</span>
            <span className="text-green-400">{targetAddr}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface HopRowProps {
  hop: Hop
}

function HopRow({ hop }: HopRowProps) {
  // Format RTT from microseconds to milliseconds
  const rttMs = hop.rtt_us != null ? (hop.rtt_us / 1000).toFixed(2) : null

  return (
    <tr className="border-b border-border/50 hover:bg-muted/30">
      <td className="py-2 pr-6 text-muted">
        {hop.hop_number ?? '?'}
      </td>
      <td className="py-2 pr-6 text-yellow-400">
        {hop.hop_addr}
      </td>
      <td className="py-2 pr-6">
        {hop.ttl_observed}
      </td>
      <td className="py-2">
        {rttMs != null ? (
          <span>{rttMs} ms</span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
    </tr>
  )
}
