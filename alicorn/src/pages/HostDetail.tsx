/**
 * Single host detail page
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useParams } from 'react-router-dom'
import { useHost } from '@/hooks'
import { formatTimestamp } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function HostDetail() {
  const { id } = useParams<{ id: string }>()
  const hostId = parseInt(id || '0', 10)

  const { data: host, isLoading, error } = useHost(hostId)

  if (isLoading) {
    return <div className="text-muted">Loading host...</div>
  }

  if (error) {
    return <div className="text-error">Error loading host: {error.message}</div>
  }

  if (!host) {
    return <div className="text-muted">Host not found</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-mono">{host.ip_addr}</h1>
        <p className="text-muted mt-1">{host.hostname || 'No hostname'}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Host Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-muted">IP Address</dt>
              <dd className="font-mono mt-1">{host.ip_addr}</dd>
            </div>
            <div>
              <dt className="text-muted">MAC Address</dt>
              <dd className="font-mono mt-1">{host.mac_addr || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">Hostname</dt>
              <dd className="font-mono mt-1">{host.hostname || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">OS Guess</dt>
              <dd className="mt-1">
                {host.os_guess ? (
                  <Badge variant="outline">{host.os_guess}</Badge>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted">First Seen</dt>
              <dd className="font-mono mt-1">{formatTimestamp(host.first_seen)}</dd>
            </div>
            <div>
              <dt className="text-muted">Last Seen</dt>
              <dd className="font-mono mt-1">{formatTimestamp(host.last_seen)}</dd>
            </div>
            <div>
              <dt className="text-muted">Open Ports</dt>
              <dd className="font-mono mt-1">{host.open_port_count}</dd>
            </div>
            <div>
              <dt className="text-muted">Scan Count</dt>
              <dd className="font-mono mt-1">{host.scan_count}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Port History - placeholder for future implementation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Port History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted text-sm">
            Port history across scans will be displayed here in a future update.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
