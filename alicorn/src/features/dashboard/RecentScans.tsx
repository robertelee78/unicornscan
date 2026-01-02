/**
 * Recent scans list component
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatRelativeTime } from '@/lib/utils'
import type { ScanSummary } from '@/types/database'

interface RecentScansProps {
  scans: ScanSummary[] | undefined
  isLoading: boolean
}

export function RecentScans({ scans, isLoading }: RecentScansProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Scans</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-muted text-sm">Loading...</div>
        ) : scans?.length === 0 ? (
          <div className="text-muted text-sm">No scans in selected time range</div>
        ) : (
          <div className="space-y-2">
            {scans?.map((scan) => (
              <Link
                key={scan.scan_id}
                to={`/scans/${scan.scan_id}`}
                className="flex items-center justify-between p-3 rounded-md bg-surface-light/50 hover:bg-surface-light transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="min-w-0">
                    <p className="font-mono text-sm truncate">{scan.target_str || `Scan #${scan.scan_id}`}</p>
                    <p className="text-xs text-muted">{formatRelativeTime(scan.s_time)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <Badge variant="outline">{scan.mode_str || 'Unknown'}</Badge>
                  <div className="text-right text-sm">
                    <p className="font-mono">{scan.host_count} hosts</p>
                    <p className="text-muted text-xs">{scan.port_count} ports</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
