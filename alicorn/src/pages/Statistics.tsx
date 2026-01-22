/**
 * Statistics page - Advanced network scan statistics
 * Scan performance, protocol breakdown, service distribution, port activity heatmaps, and GeoIP
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useState } from 'react'
import {
  ServiceDistributionChart,
  PortActivityHeatmap,
  useServiceDistribution,
  usePortActivityHeatmap,
  useScanPerformanceStats,
  useProtocolBreakdown,
} from '@/features/charts'
import { ScanPerformanceStatsCards } from '@/features/charts/ScanPerformanceStatsCards'
import { ProtocolBreakdownChart } from '@/features/charts/ProtocolBreakdownChart'
import { TimeRangeSelect, type TimeRange } from '@/features/dashboard'
import { GeoIPSection } from '@/features/geoip'

export function Statistics() {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')

  const { data: perfStats, isLoading: perfLoading } = useScanPerformanceStats(timeRange)
  const { data: protocolData, isLoading: protocolLoading } = useProtocolBreakdown(timeRange)
  const { data: serviceData, isLoading: serviceLoading } = useServiceDistribution(timeRange)
  const { data: heatmapData, isLoading: heatmapLoading } = usePortActivityHeatmap(timeRange)

  return (
    <div className="space-y-6">
      {/* Header with time range selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Statistics</h1>
          <p className="text-muted mt-1">Advanced network scan analytics and OS fingerprinting</p>
        </div>
        <TimeRangeSelect value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Scan Performance Stats Cards */}
      <ScanPerformanceStatsCards
        data={perfStats}
        isLoading={perfLoading}
      />

      {/* Protocol Breakdown and Service Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProtocolBreakdownChart
          data={protocolData}
          isLoading={protocolLoading}
          title="Protocol Breakdown"
          height={280}
        />
        <ServiceDistributionChart
          data={serviceData}
          isLoading={serviceLoading}
          variant="bar"
          title="Top Services by Count"
          height={280}
        />
      </div>

      {/* Port Activity Heatmap - Full width */}
      <PortActivityHeatmap
        data={heatmapData}
        isLoading={heatmapLoading}
        title="Port Activity Over Time"
        height={450}
      />

      {/* Info panel about what these metrics mean */}
      <div className="bg-surface border border-border rounded-lg p-4 text-sm">
        <h3 className="font-medium mb-2">About These Statistics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">Response & Host Rates</span>
            <p className="mt-1">
              Response Rate shows what percentage of probe packets received a response.
              Host Hit Rate indicates how many targeted hosts responded to at least one probe.
              Higher rates suggest more responsive targets or less packet loss.
            </p>
          </div>
          <div>
            <span className="font-medium text-foreground">Protocol Breakdown</span>
            <p className="mt-1">
              Breakdown of responses by protocol type. TCP SYN+ACK indicates open ports.
              "With Banner" shows services that sent application data after connection.
              UDP responses indicate active UDP services.
            </p>
          </div>
          <div>
            <span className="font-medium text-foreground">Service Distribution</span>
            <p className="mt-1">
              Shows the distribution of services based on port number mappings.
              This is derived from well-known port assignments, not actual
              service detection (which requires banner grabbing).
            </p>
          </div>
          <div>
            <span className="font-medium text-foreground">Port Activity Heatmap</span>
            <p className="mt-1">
              Visualizes when specific ports were observed across scans.
              Darker colors indicate more observations. Useful for tracking
              service availability patterns over time.
            </p>
          </div>
        </div>
      </div>

      {/* GeoIP Section - Geographic intelligence for selected time range */}
      <div className="border-t border-border pt-6">
        <GeoIPSection timeRange={timeRange} />
      </div>
    </div>
  )
}
