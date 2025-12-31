/**
 * Statistics page - Advanced network scan statistics
 * Service distribution, TTL analysis, window size, port activity heatmaps, and GeoIP
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState } from 'react'
import {
  ServiceDistributionChart,
  TTLHistogram,
  WindowSizeChart,
  PortActivityHeatmap,
  useServiceDistribution,
  useTTLDistribution,
  useWindowSizeDistribution,
  usePortActivityHeatmap,
} from '@/features/charts'
import { TimeRangeSelect, type TimeRange } from '@/features/dashboard'
import { GeoIPSection } from '@/features/geoip'

export function Statistics() {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')

  const { data: serviceData, isLoading: serviceLoading } = useServiceDistribution(timeRange)
  const { data: ttlData, isLoading: ttlLoading } = useTTLDistribution(timeRange)
  const { data: windowData, isLoading: windowLoading } = useWindowSizeDistribution(timeRange)
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

      {/* Service Distribution - Both pie and bar variants */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ServiceDistributionChart
          data={serviceData}
          isLoading={serviceLoading}
          variant="pie"
          title="Service Distribution"
          height={320}
        />
        <ServiceDistributionChart
          data={serviceData}
          isLoading={serviceLoading}
          variant="bar"
          title="Top Services by Count"
          height={320}
        />
      </div>

      {/* Port Activity Heatmap - Full width */}
      <PortActivityHeatmap
        data={heatmapData}
        isLoading={heatmapLoading}
        title="Port Activity Over Time"
        height={450}
      />

      {/* OS Fingerprinting Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TTLHistogram
          data={ttlData}
          isLoading={ttlLoading}
          title="TTL Distribution (OS Fingerprinting)"
          height={320}
        />
        <WindowSizeChart
          data={windowData}
          isLoading={windowLoading}
          title="TCP Window Size Distribution"
          height={320}
        />
      </div>

      {/* Info panel about what these metrics mean */}
      <div className="bg-surface border border-border rounded-lg p-4 text-sm">
        <h3 className="font-medium mb-2">About These Statistics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">Service Distribution</span>
            <p className="mt-1">
              Shows the distribution of services based on port number mappings.
              Note: This is derived from well-known port assignments, not actual
              service detection (which requires banner grabbing).
            </p>
          </div>
          <div>
            <span className="font-medium text-foreground">TTL Analysis</span>
            <p className="mt-1">
              Time-To-Live values can help identify operating systems.
              Common initial TTLs: Linux/Unix (64), Windows (128),
              Network devices (255). Values decrease with each hop.
            </p>
          </div>
          <div>
            <span className="font-medium text-foreground">TCP Window Size</span>
            <p className="mt-1">
              The initial TCP window size varies by OS and can aid fingerprinting.
              Different operating systems use characteristic default values.
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

      {/* GeoIP Section - Scan-specific geographic intelligence */}
      <div className="border-t border-border pt-6">
        <GeoIPSection />
      </div>
    </div>
  )
}
