/**
 * Dashboard page - thin wrapper over dashboard feature module
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useState } from 'react'
import {
  DashboardStats,
  RecentScans,
  TopPorts,
  ScanTimeline,
  TimeRangeSelect,
  useDashboardStats,
  useTopPorts,
  useScanTimeline,
  useRecentScans,
  type TimeRange,
} from '@/features/dashboard'
import {
  ProtocolDistribution,
  useGlobalProtocolDistribution,
} from '@/features/charts'

export function Dashboard() {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')

  const { data: stats, isLoading: statsLoading } = useDashboardStats(timeRange)
  const { data: topPorts, isLoading: portsLoading } = useTopPorts(timeRange, 10)
  const { data: timeline, isLoading: timelineLoading } = useScanTimeline(timeRange)
  const { data: recentScans, isLoading: scansLoading } = useRecentScans(timeRange, 10)
  const { data: protocolData, isLoading: protocolLoading } = useGlobalProtocolDistribution(timeRange)

  return (
    <div className="space-y-6">
      {/* Header with time range selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted mt-1">Overview of your scan data</p>
        </div>
        <TimeRangeSelect value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Stats Grid */}
      <DashboardStats stats={stats} isLoading={statsLoading} />

      {/* Timeline Chart */}
      <ScanTimeline data={timeline} isLoading={timelineLoading} />

      {/* Protocol Distribution - Bar and Pie views */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProtocolDistribution
          data={protocolData}
          isLoading={protocolLoading}
          variant="bar"
          title="Protocol Distribution Over Time"
          height={280}
        />
        <ProtocolDistribution
          data={protocolData}
          isLoading={protocolLoading}
          variant="pie"
          title="Protocol Breakdown"
          height={280}
        />
      </div>

      {/* Two-column layout for Recent Scans and Top Ports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentScans scans={recentScans} isLoading={scansLoading} />
        <TopPorts ports={topPorts} isLoading={portsLoading} />
      </div>
    </div>
  )
}
