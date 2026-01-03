/**
 * Hosts feature types
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// Re-export search types from search-utils for convenience
export type { SearchType, ParsedSearch, CIDRInfo } from './search-utils'

// =============================================================================
// Filter Types
// =============================================================================

/**
 * Host filtering options for the hosts list
 */
export interface HostFilters {
  /** Raw search string from user input */
  search: string
  /** Filter by whether host has responding ports */
  hasOpenPorts: boolean | null
  /** Filter by whether host has captured banners */
  hasBanner: boolean | null
  /** Filter by OUI vendor name */
  vendorFilter: string
}

/**
 * Extended host data for search matching
 * Used when search requires additional data beyond basic host fields
 */
export interface HostSearchData {
  /** All banners collected for this host (aggregated from all scans) */
  banners: string[]
  /** All notes attached to this host */
  notes: string[]
  /** All responding ports (aggregated from all scans) */
  ports: number[]
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
  hasBanner: null,
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
