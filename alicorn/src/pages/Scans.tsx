/**
 * Scans list page
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Link } from 'react-router-dom'
import { useScanSummaries } from '@/hooks'
import { formatTimestamp, formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function Scans() {
  const { data: scans, isLoading, error } = useScanSummaries(50)

  if (error) {
    return (
      <div className="text-error">
        Error loading scans: {error.message}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Scans</h1>
          <p className="text-muted mt-1">Browse scan history</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Scan History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-muted">Loading scans...</div>
          ) : scans?.length === 0 ? (
            <div className="text-muted">No scans found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-muted">
                    <th className="pb-3 font-medium">ID</th>
                    <th className="pb-3 font-medium">Target</th>
                    <th className="pb-3 font-medium">Mode</th>
                    <th className="pb-3 font-medium">Hosts</th>
                    <th className="pb-3 font-medium">Ports</th>
                    <th className="pb-3 font-medium">Time</th>
                    <th className="pb-3 font-medium">Tags</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-sm">
                  {scans?.map((scan) => (
                    <tr key={scan.scans_id} className="border-b border-border/50 hover:bg-surface-light/50">
                      <td className="py-3">
                        <Link to={`/scans/${scan.scans_id}`} className="text-primary hover:underline">
                          #{scan.scans_id}
                        </Link>
                      </td>
                      <td className="py-3">{scan.target_str}</td>
                      <td className="py-3">
                        <Badge variant="outline">{scan.mode_str || 'Unknown'}</Badge>
                      </td>
                      <td className="py-3">{scan.host_count}</td>
                      <td className="py-3">{scan.port_count}</td>
                      <td className="py-3" title={formatTimestamp(scan.s_time)}>
                        {formatRelativeTime(scan.s_time)}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-1">
                          {scan.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
