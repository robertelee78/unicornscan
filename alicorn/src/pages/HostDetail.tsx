/**
 * Host detail page - thin wrapper over hosts feature module
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useHost } from '@/hooks'
import {
  HostDetailHeader,
  PortHistory,
  AssociatedScans,
  useHostPortHistory,
  useHostScans,
} from '@/features/hosts'
import {
  PortTrendChart,
  PortTimeline,
  useHostPortTrend,
  usePortTimeline,
} from '@/features/charts'
import type { TimeRange } from '@/features/dashboard/types'

export function HostDetail() {
  const { id } = useParams<{ id: string }>()
  const hostId = parseInt(id || '0', 10)
  const [timeRange, setTimeRange] = useState<TimeRange>('all')

  // Fetch host data
  const { data: host, isLoading: hostLoading, error: hostError } = useHost(hostId)

  // Fetch port history and associated scans using the host's IP
  const { data: portHistory = [], isLoading: portHistoryLoading } = useHostPortHistory(
    host?.ip_addr || ''
  )
  const { data: hostScans = [], isLoading: scansLoading } = useHostScans(
    host?.ip_addr || ''
  )

  // Fetch chart data
  const { data: portTrend, isLoading: trendLoading } = useHostPortTrend(
    host?.ip_addr || '',
    timeRange
  )
  const { data: portTimeline, isLoading: timelineLoading } = usePortTimeline(
    host?.ip_addr || ''
  )

  // Loading state
  if (hostLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded-lg" />
      </div>
    )
  }

  // Error state
  if (hostError) {
    return (
      <div className="text-error p-4">
        Error loading host: {hostError.message}
      </div>
    )
  }

  // Not found
  if (!host) {
    return (
      <div className="text-muted p-4 text-center">
        <h2 className="text-lg font-medium">Host Not Found</h2>
        <p className="mt-1">The requested host could not be found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with metadata */}
      <HostDetailHeader
        host={host}
        portHistoryCount={portHistory.length}
        scanCount={hostScans.length}
      />

      {/* Time Range Selector for Charts */}
      <div className="flex items-center gap-4">
        <label htmlFor="timeRange" className="text-sm text-muted-foreground">
          Chart Time Range:
        </label>
        <select
          id="timeRange"
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as TimeRange)}
          className="h-8 rounded border border-input bg-background px-3 text-sm"
        >
          <option value="all">All Time</option>
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </select>
      </div>

      {/* Port Trend Chart */}
      <PortTrendChart
        data={portTrend}
        isLoading={trendLoading}
        title={`Port Trend for ${host.hostname || host.ip_addr}`}
        config={{
          showTotal: true,
          showTcp: true,
          showUdp: true,
          chartType: 'area',
        }}
      />

      {/* Port Timeline */}
      <PortTimeline
        data={portTimeline}
        isLoading={timelineLoading}
        title="Port Observation Timeline"
        maxPorts={25}
      />

      {/* Port History */}
      <PortHistory
        entries={portHistory}
        isLoading={portHistoryLoading}
      />

      {/* Associated Scans */}
      <AssociatedScans
        scans={hostScans}
        isLoading={scansLoading}
      />
    </div>
  )
}
