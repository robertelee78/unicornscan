/**
 * Hosts list page
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Link } from 'react-router-dom'
import { useHosts } from '@/hooks'
import { formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function Hosts() {
  const { data: hosts, isLoading, error } = useHosts(100)

  if (error) {
    return (
      <div className="text-error">
        Error loading hosts: {error.message}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hosts</h1>
        <p className="text-muted mt-1">Discovered hosts across all scans</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Host Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-muted">Loading hosts...</div>
          ) : hosts?.length === 0 ? (
            <div className="text-muted">No hosts found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-muted">
                    <th className="pb-3 font-medium">IP Address</th>
                    <th className="pb-3 font-medium">Hostname</th>
                    <th className="pb-3 font-medium">OS</th>
                    <th className="pb-3 font-medium">Open Ports</th>
                    <th className="pb-3 font-medium">Scans</th>
                    <th className="pb-3 font-medium">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-sm">
                  {hosts?.map((host) => (
                    <tr key={host.host_id} className="border-b border-border/50 hover:bg-surface-light/50">
                      <td className="py-3">
                        <Link to={`/hosts/${host.host_id}`} className="text-primary hover:underline">
                          {host.ip_addr}
                        </Link>
                      </td>
                      <td className="py-3 text-muted">{host.hostname || '—'}</td>
                      <td className="py-3">
                        {host.os_guess ? (
                          <Badge variant="outline">{host.os_guess}</Badge>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="py-3">{host.open_port_count}</td>
                      <td className="py-3">{host.scan_count}</td>
                      <td className="py-3">{formatRelativeTime(host.last_seen)}</td>
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
