/**
 * Single scan detail page
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useParams } from 'react-router-dom'
import { useScan, useIpReports } from '@/hooks'
import { formatTimestamp, formatPort } from '@/lib/utils'
import { decodeTcpFlags, getProtocolName } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function ScanDetail() {
  const { id } = useParams<{ id: string }>()
  const scansId = parseInt(id || '0', 10)

  const { data: scan, isLoading: scanLoading, error: scanError } = useScan(scansId)
  const { data: reports, isLoading: reportsLoading } = useIpReports(scansId)

  if (scanLoading) {
    return <div className="text-muted">Loading scan...</div>
  }

  if (scanError) {
    return <div className="text-error">Error loading scan: {scanError.message}</div>
  }

  if (!scan) {
    return <div className="text-muted">Scan not found</div>
  }

  // Group reports by host
  const hostGroups = reports?.reduce(
    (acc, report) => {
      if (!acc[report.host_addr]) {
        acc[report.host_addr] = []
      }
      acc[report.host_addr].push(report)
      return acc
    },
    {} as Record<string, typeof reports>
  )

  return (
    <div className="space-y-6">
      {/* Scan Info */}
      <div>
        <h1 className="text-2xl font-bold">Scan #{scan.scans_id}</h1>
        <p className="text-muted mt-1">{scan.target_str}</p>
      </div>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Scan Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-muted">Mode</dt>
              <dd className="font-mono mt-1">{scan.mode_str || scan.mode}</dd>
            </div>
            <div>
              <dt className="text-muted">Started</dt>
              <dd className="font-mono mt-1">{formatTimestamp(scan.s_time)}</dd>
            </div>
            <div>
              <dt className="text-muted">Ended</dt>
              <dd className="font-mono mt-1">{formatTimestamp(scan.e_time)}</dd>
            </div>
            <div>
              <dt className="text-muted">PPS</dt>
              <dd className="font-mono mt-1">{scan.pps}</dd>
            </div>
            <div>
              <dt className="text-muted">Ports</dt>
              <dd className="font-mono mt-1">{scan.port_str}</dd>
            </div>
            <div>
              <dt className="text-muted">Profile</dt>
              <dd className="font-mono mt-1">{scan.profile}</dd>
            </div>
            <div>
              <dt className="text-muted">User</dt>
              <dd className="font-mono mt-1">{scan.user}</dd>
            </div>
            <div>
              <dt className="text-muted">Responses</dt>
              <dd className="font-mono mt-1">{reports?.length || 0}</dd>
            </div>
          </dl>
          {scan.scan_notes && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted mb-1">Notes</p>
              <p className="text-sm">{scan.scan_notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results by Host */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Results</CardTitle>
        </CardHeader>
        <CardContent>
          {reportsLoading ? (
            <div className="text-muted">Loading results...</div>
          ) : !reports || reports.length === 0 ? (
            <div className="text-muted">No responses recorded</div>
          ) : (
            <div className="space-y-6">
              {Object.entries(hostGroups || {}).map(([host, hostReports]) => (
                <div key={host}>
                  <h3 className="font-mono text-primary mb-2">{host}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted">
                          <th className="pb-2 font-medium">Port</th>
                          <th className="pb-2 font-medium">Protocol</th>
                          <th className="pb-2 font-medium">TTL</th>
                          <th className="pb-2 font-medium">Flags</th>
                          <th className="pb-2 font-medium">Window</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {hostReports?.map((report) => (
                          <tr key={report.ipreport_id} className="border-b border-border/50">
                            <td className="py-2">
                              <Badge variant="open">{formatPort(report.dport)}</Badge>
                            </td>
                            <td className="py-2">{getProtocolName(report.proto)}</td>
                            <td className="py-2">{report.ttl}</td>
                            <td className="py-2">
                              {decodeTcpFlags(report.subtype).join(' ')}
                            </td>
                            <td className="py-2">{report.window_size}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
