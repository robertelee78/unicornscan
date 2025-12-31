/**
 * Dashboard statistics cards
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Shield, Server, Network, Radio } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { DashboardStats as Stats } from './types'

interface DashboardStatsProps {
  stats: Stats | undefined
  isLoading: boolean
}

export function DashboardStats({ stats, isLoading }: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Total Scans"
        value={isLoading ? '—' : stats?.totalScans.toString() || '0'}
        icon={<Shield className="h-5 w-5" />}
        color="primary"
      />
      <StatCard
        title="Hosts Discovered"
        value={isLoading ? '—' : stats?.totalHosts.toString() || '0'}
        icon={<Server className="h-5 w-5" />}
        color="secondary"
      />
      <StatCard
        title="Responses"
        value={isLoading ? '—' : stats?.totalResponses.toString() || '0'}
        icon={<Radio className="h-5 w-5" />}
        color="accent"
      />
      <StatCard
        title="Unique Ports"
        value={isLoading ? '—' : stats?.uniquePorts.toString() || '0'}
        icon={<Network className="h-5 w-5" />}
        color="info"
      />
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
