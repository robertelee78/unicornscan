/**
 * Hosts feature types
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

export interface HostFilters {
  search: string
  hasOpenPorts: boolean | null
  vendorFilter: string
}

export type SortField = 'host_addr' | 'hostname' | 'port_count' | 'scan_count' | 'last_seen' | 'first_seen'
export type SortDirection = 'asc' | 'desc'

export interface SortState {
  field: SortField
  direction: SortDirection
}

export interface PaginationState {
  page: number
  pageSize: number
}

export const DEFAULT_FILTERS: HostFilters = {
  search: '',
  hasOpenPorts: null,
  vendorFilter: '',
}

export const DEFAULT_SORT: SortState = {
  field: 'last_seen',
  direction: 'desc',
}

export const DEFAULT_PAGINATION: PaginationState = {
  page: 1,
  pageSize: 25,
}

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

// Port history entry for timeline display
// Matches IpReport fields so Hosts view has same data as Scans view
export interface PortHistoryEntry {
  scan_id: number
  scan_time: number
  port: number
  protocol: string
  ttl: number
  flags: number
  window_size: number
  eth_hwaddr: string | null
  tstamp: number
  ipreport_id: number
  banner?: string
}

// Aggregated port entry: shows latest observation with latest banner
// Groups by port+protocol, limits history to 10 entries
export interface AggregatedPortEntry {
  // Key fields
  port: number
  protocol: string

  // Latest observation data
  latest: PortHistoryEntry

  // Latest non-null banner (may be from older scan)
  latestBanner?: string
  latestBannerScanId?: number
  latestBannerTimestamp?: number

  // Whether banner is from a different (older) scan than latest observation
  bannerFromOlderScan: boolean

  // Historical entries (max 10, sorted by timestamp desc)
  history: PortHistoryEntry[]
}

// Associated scan for a host
export interface HostScanEntry {
  scan_id: number
  scan_time: number
  profile: string
  target_str: string | null
  ports_found: number
}
