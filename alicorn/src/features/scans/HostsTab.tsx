/**
 * Hosts tab - results grouped by host address
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatPort } from '@/lib/utils'
import { decodeTcpFlags, getProtocolName } from '@/types/database'
import { TcpFlagsDisplay } from '@/features/ports'
import type { IpReport } from '@/types/database'

interface HostsTabProps {
  reports: IpReport[]
  isLoading: boolean
}

interface HostGroup {
  hostAddr: string
  reports: IpReport[]
}

export function HostsTab({ reports, isLoading }: HostsTabProps) {
  if (isLoading) {
    return <div className="text-muted py-8 text-center">Loading results...</div>
  }

  if (reports.length === 0) {
    return <div className="text-muted py-8 text-center">No hosts found</div>
  }

  // Group reports by host
  const hostGroups: HostGroup[] = []
  const hostMap = new Map<string, IpReport[]>()

  for (const report of reports) {
    const existing = hostMap.get(report.host_addr)
    if (existing) {
      existing.push(report)
    } else {
      hostMap.set(report.host_addr, [report])
    }
  }

  for (const [hostAddr, hostReports] of hostMap) {
    hostGroups.push({ hostAddr, reports: hostReports })
  }

  // Sort by IP address
  hostGroups.sort((a, b) => {
    const partsA = a.hostAddr.split('.').map(Number)
    const partsB = b.hostAddr.split('.').map(Number)
    for (let i = 0; i < 4; i++) {
      if (partsA[i] !== partsB[i]) return partsA[i] - partsB[i]
    }
    return 0
  })

  return (
    <div className="space-y-4">
      {hostGroups.map((group) => (
        <HostCard key={group.hostAddr} group={group} />
      ))}
    </div>
  )
}

interface HostCardProps {
  group: HostGroup
}

function HostCard({ group }: HostCardProps) {
  const { hostAddr, reports } = group

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-mono text-primary">
            {hostAddr}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {reports.length} port{reports.length !== 1 ? 's' : ''}
            </Badge>
            <Link
              to={`/hosts?ip=${encodeURIComponent(hostAddr)}`}
              className="text-muted hover:text-primary transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="pb-2 pr-4 font-medium">Port</th>
                <th className="pb-2 pr-4 font-medium">Protocol</th>
                <th className="pb-2 pr-4 font-medium">TTL</th>
                <th className="pb-2 pr-4 font-medium">Flags</th>
                <th className="pb-2 font-medium">Window</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {reports.map((report) => {
                const flags = decodeTcpFlags(report.type)
                return (
                  <tr key={report.ipreport_id} className="border-b border-border/50">
                    <td className="py-1.5 pr-4">
                      <Badge variant="open">{formatPort(report.dport)}</Badge>
                    </td>
                    <td className="py-1.5 pr-4 uppercase">
                      {getProtocolName(report.proto)}
                    </td>
                    <td className="py-1.5 pr-4">{report.ttl}</td>
                    <td className="py-1.5 pr-4">
                      <TcpFlagsDisplay flags={flags} />
                    </td>
                    <td className="py-1.5">{report.window_size}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
