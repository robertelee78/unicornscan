/**
 * Dashboard feature hooks with time-range filtering
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useQuery } from '@tanstack/react-query'
import { getDatabase } from '@/lib/database'
import type { TimeRange, DashboardStats, PortCount, ScanTimelinePoint } from './types'
import { getTimeRangeSeconds } from './types'

const db = getDatabase()

// =============================================================================
// Query Keys
// =============================================================================

export const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: (timeRange: TimeRange) => [...dashboardKeys.all, 'stats', timeRange] as const,
  topPorts: (timeRange: TimeRange, limit: number) =>
    [...dashboardKeys.all, 'topPorts', timeRange, limit] as const,
  timeline: (timeRange: TimeRange) => [...dashboardKeys.all, 'timeline', timeRange] as const,
  recentScans: (timeRange: TimeRange, limit: number) =>
    [...dashboardKeys.all, 'recentScans', timeRange, limit] as const,
}

// =============================================================================
// Hooks
// =============================================================================

export function useDashboardStats(timeRange: TimeRange) {
  const sinceTimestamp = getSinceTimestamp(timeRange)

  return useQuery({
    queryKey: dashboardKeys.stats(timeRange),
    queryFn: () => db.getDashboardStats({ since: sinceTimestamp }),
    staleTime: 30000,
  })
}

export function useTopPorts(timeRange: TimeRange, limit: number = 10) {
  const sinceTimestamp = getSinceTimestamp(timeRange)

  return useQuery({
    queryKey: dashboardKeys.topPorts(timeRange, limit),
    queryFn: () => db.getTopPorts({ limit, since: sinceTimestamp }),
    staleTime: 30000,
  })
}

export function useScanTimeline(timeRange: TimeRange) {
  const sinceTimestamp = getSinceTimestamp(timeRange)

  return useQuery({
    queryKey: dashboardKeys.timeline(timeRange),
    queryFn: () => db.getScanTimeline({ since: sinceTimestamp }),
    staleTime: 30000,
  })
}

export function useRecentScans(timeRange: TimeRange, limit: number = 10) {
  const sinceTimestamp = getSinceTimestamp(timeRange)

  return useQuery({
    queryKey: dashboardKeys.recentScans(timeRange, limit),
    queryFn: () => db.getRecentScans({ limit, since: sinceTimestamp }),
    staleTime: 30000,
  })
}

// =============================================================================
// Helpers
// =============================================================================

function getSinceTimestamp(timeRange: TimeRange): number | null {
  const seconds = getTimeRangeSeconds(timeRange)
  if (seconds === null) return null
  return Math.floor(Date.now() / 1000) - seconds
}

// =============================================================================
// Type Extensions for Database
// =============================================================================

// Extend DatabaseClient interface (declaration merging)
declare module '@/lib/database' {
  interface DatabaseClient {
    getDashboardStats(options: { since: number | null }): Promise<DashboardStats>
    getTopPorts(options: { limit: number; since: number | null }): Promise<PortCount[]>
    getScanTimeline(options: { since: number | null }): Promise<ScanTimelinePoint[]>
    getRecentScans(options: { limit: number; since: number | null }): Promise<import('@/types/database').ScanSummary[]>
  }
}
