/**
 * Dashboard page - overview of scan data
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Shield, Activity, Scan, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDatabaseStats, useScanSummaries } from '@/hooks'
import { formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Link } from 'react-router-dom'

export function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useDatabaseStats()
  const { data: recentScans, isLoading: scansLoading } = useScanSummaries(5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted mt-1">Overview of your scan data</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Scans"
          value={statsLoading ? '—' : stats?.totalScans.toString() || '0'}
          icon={<Shield className="h-5 w-5" />}
          color="primary"
        />
        <StatCard
          title="Hosts Discovered"
          value={statsLoading ? '—' : stats?.totalHosts.toString() || '0'}
          icon={<Activity className="h-5 w-5" />}
          color="secondary"
        />
        <StatCard
          title="Ports Found"
          value={statsLoading ? '—' : stats?.totalPorts.toString() || '0'}
          icon={<Scan className="h-5 w-5" />}
          color="accent"
        />
        <StatCard
          title="Recent (24h)"
          value={statsLoading ? '—' : stats?.recentScans.toString() || '0'}
          icon={<Clock className="h-5 w-5" />}
          color="info"
        />
      </div>

      {/* Recent Scans */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Scans</CardTitle>
        </CardHeader>
        <CardContent>
          {scansLoading ? (
            <div className="text-muted text-sm">Loading...</div>
          ) : recentScans?.length === 0 ? (
            <div className="text-muted text-sm">No scans yet</div>
          ) : (
            <div className="space-y-3">
              {recentScans?.map((scan) => (
                <Link
                  key={scan.scans_id}
                  to={`/scans/${scan.scans_id}`}
                  className="flex items-center justify-between p-3 rounded-md bg-surface-light/50 hover:bg-surface-light transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-mono text-sm">{scan.target_str}</p>
                      <p className="text-xs text-muted">{formatRelativeTime(scan.s_time)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
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
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string
  icon: React.ReactNode
  color: 'primary' | 'secondary' | 'accent' | 'info'
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  const colorClasses = {
    primary: 'text-primary',
    secondary: 'text-secondary',
    accent: 'text-accent',
    info: 'text-info',
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">{title}</p>
            <p className="text-3xl font-bold font-mono mt-1">{value}</p>
          </div>
          <div className={colorClasses[color]}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}
