/**
 * Dashboard feature types
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

export type TimeRange = '1h' | '24h' | '7d' | '30d' | '90d' | 'all'

export interface TimeRangeOption {
  value: TimeRange
  label: string
  seconds: number | null  // null = all time
}

export const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { value: '1h', label: 'Last hour', seconds: 3600 },
  { value: '24h', label: 'Last 24 hours', seconds: 86400 },
  { value: '7d', label: 'Last 7 days', seconds: 604800 },
  { value: '30d', label: 'Last 30 days', seconds: 2592000 },
  { value: '90d', label: 'Last 90 days', seconds: 7776000 },
  { value: 'all', label: 'All time', seconds: null },
]

export function getTimeRangeSeconds(range: TimeRange): number | null {
  const option = TIME_RANGE_OPTIONS.find((o) => o.value === range)
  return option?.seconds ?? null
}

export function getTimeRangeLabel(range: TimeRange): string {
  const option = TIME_RANGE_OPTIONS.find((o) => o.value === range)
  return option?.label ?? 'All time'
}

export interface PortCount {
  port: number
  count: number
  protocol: 'tcp' | 'udp'
}

export interface DashboardStats {
  totalScans: number
  totalHosts: number
  totalResponses: number
  uniquePorts: number
}

export interface ScanTimelinePoint {
  date: string      // ISO date string (YYYY-MM-DD)
  timestamp: number // Unix timestamp of day start
  scans: number
  responses: number
}
