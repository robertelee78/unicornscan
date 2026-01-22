/**
 * Associated scans for a host
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { Link } from 'react-router-dom'
import { ExternalLink, AlertCircle, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatTimestamp, formatRelativeTime } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { HostScanEntry } from './types'

interface AssociatedScansProps {
  scans: HostScanEntry[]
  isLoading: boolean
  error?: Error | null
  hostIp?: string
}

export function AssociatedScans({ scans, isLoading, error, hostIp }: AssociatedScansProps) {
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

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Associated Scans</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">Failed to load scans: {error.message}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // No host IP provided - query couldn't run
  if (!hostIp) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Associated Scans</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted">
            <Info className="h-4 w-4" />
            <p className="text-sm">Host IP address not available.</p>
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
          <p className="text-muted text-sm">
            No scans found for this host ({hostIp}).
          </p>
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
                <tr key={scan.scan_id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 pr-4">
                    <Link
                      to={`/scans/${scan.scan_id}`}
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      #{scan.scan_id}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted cursor-help">
                            {formatRelativeTime(scan.scan_time)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <span>{formatTimestamp(scan.scan_time)}</span>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </td>
                  <td className="py-2 pr-4">{scan.target_str}</td>
                  <td className="py-2 pr-4">
                    <Badge variant="outline">{scan.profile}</Badge>
                  </td>
                  <td className="py-2">
                    <Badge variant="open">{scan.ports_found}</Badge>
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
