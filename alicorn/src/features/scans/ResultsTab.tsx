/**
 * Results tab - table of IP reports with TCP flags
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Badge } from '@/components/ui/badge'
import { formatPort, formatTimestamp } from '@/lib/utils'
import { decodeTcpFlags, getProtocolName } from '@/types/database'
import { TcpFlagsDisplay } from './TcpFlagBadge'
import type { IpReport } from '@/types/database'

interface ResultsTabProps {
  reports: IpReport[]
  isLoading: boolean
}

export function ResultsTab({ reports, isLoading }: ResultsTabProps) {
  if (isLoading) {
    return <div className="text-muted py-8 text-center">Loading results...</div>
  }

  if (reports.length === 0) {
    return <div className="text-muted py-8 text-center">No responses recorded</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th className="pb-2 pr-4 font-medium">Host</th>
            <th className="pb-2 pr-4 font-medium">Port</th>
            <th className="pb-2 pr-4 font-medium">Protocol</th>
            <th className="pb-2 pr-4 font-medium">TTL</th>
            <th className="pb-2 pr-4 font-medium">Flags</th>
            <th className="pb-2 pr-4 font-medium">Window</th>
            <th className="pb-2 font-medium">Timestamp</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {reports.map((report) => (
            <ResultRow key={report.ipreport_id} report={report} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface ResultRowProps {
  report: IpReport
}

function ResultRow({ report }: ResultRowProps) {
  const flags = decodeTcpFlags(report.subtype)
  const protocol = getProtocolName(report.proto)

  return (
    <tr className="border-b border-border/50 hover:bg-muted/30">
      <td className="py-2 pr-4 text-primary">{report.host_addr}</td>
      <td className="py-2 pr-4">
        <Badge variant="open">{formatPort(report.dport)}</Badge>
      </td>
      <td className="py-2 pr-4 uppercase">{protocol}</td>
      <td className="py-2 pr-4">{report.ttl}</td>
      <td className="py-2 pr-4">
        <TcpFlagsDisplay flags={flags} />
      </td>
      <td className="py-2 pr-4">{report.window_size}</td>
      <td className="py-2 text-muted text-xs">
        {formatTimestamp(report.tstamp)}
      </td>
    </tr>
  )
}
