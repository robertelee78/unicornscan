/**
 * Associated scans for a host
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatTimestamp, formatRelativeTime } from '@/lib/utils'
import type { HostScanEntry } from './types'

interface AssociatedScansProps {
  scans: HostScanEntry[]
  isLoading: boolean
}

export function AssociatedScans({ scans, isLoading }: AssociatedScansProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Associated Scans</CardTitle>
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

  if (scans.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Associated Scans</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted text-sm">No scans found for this host.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Associated Scans</CardTitle>
          <Badge variant="secondary">
            {scans.length} scan{scans.length !== 1 ? 's' : ''}
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
                <th className="pb-2 pr-4 font-medium">Target</th>
                <th className="pb-2 pr-4 font-medium">Profile</th>
                <th className="pb-2 font-medium">Ports Found</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {scans.map((scan) => (
                <tr key={scan.scansId} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 pr-4">
                    <Link
                      to={`/scans/${scan.scansId}`}
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      #{scan.scansId}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    <span className="text-xs text-muted" title={formatTimestamp(scan.scanTime)}>
                      {formatRelativeTime(scan.scanTime)}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{scan.targetStr}</td>
                  <td className="py-2 pr-4">
                    <Badge variant="outline">{scan.profile}</Badge>
                  </td>
                  <td className="py-2">
                    <Badge variant="open">{scan.portsFound}</Badge>
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
