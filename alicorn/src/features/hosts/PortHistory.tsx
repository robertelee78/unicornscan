/**
 * Port history timeline for a host
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatPort, formatTimestamp } from '@/lib/utils'
import { decodeTcpFlags } from '@/types/database'
import { TcpFlagsDisplay } from '@/features/scans'
import type { PortHistoryEntry } from './types'

interface PortHistoryProps {
  entries: PortHistoryEntry[]
  isLoading: boolean
}

export function PortHistory({ entries, isLoading }: PortHistoryProps) {
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
  const scanGroups = new Map<number, { scanTime: number; ports: PortHistoryEntry[] }>()
  for (const entry of entries) {
    const existing = scanGroups.get(entry.scansId)
    if (existing) {
      existing.ports.push(entry)
    } else {
      scanGroups.set(entry.scansId, { scanTime: entry.scanTime, ports: [entry] })
    }
  }

  // Get unique ports across all scans for timeline
  const allPorts = [...new Set(entries.map((e) => e.port))].sort((a, b) => a - b)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Port History</CardTitle>
          <Badge variant="secondary">
            {allPorts.length} unique port{allPorts.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="pb-2 pr-4 font-medium">Scan</th>
                <th className="pb-2 pr-4 font-medium">Date</th>
                <th className="pb-2 pr-4 font-medium">Port</th>
                <th className="pb-2 pr-4 font-medium">Protocol</th>
                <th className="pb-2 pr-4 font-medium">TTL</th>
                <th className="pb-2 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {entries.map((entry, idx) => (
                <tr key={`${entry.scansId}-${entry.port}-${idx}`} className="border-b border-border/50">
                  <td className="py-2 pr-4">
                    <Link
                      to={`/scans/${entry.scansId}`}
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      #{entry.scansId}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-muted text-xs">
                    {formatTimestamp(entry.scanTime)}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge variant="open">{formatPort(entry.port)}</Badge>
                  </td>
                  <td className="py-2 pr-4 uppercase">{entry.protocol}</td>
                  <td className="py-2 pr-4">{entry.ttl}</td>
                  <td className="py-2">
                    <TcpFlagsDisplay flags={decodeTcpFlags(entry.flags)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
