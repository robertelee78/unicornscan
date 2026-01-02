/**
 * Hosts feature types
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

export interface HostFilters {
  search: string
  hasOpenPorts: boolean | null
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
export interface PortHistoryEntry {
  scan_id: number
  scan_time: number
  port: number
  protocol: string
  ttl: number
  flags: number
}

// Associated scan for a host
export interface HostScanEntry {
  scan_id: number
  scan_time: number
  profile: string
  target_str: string | null
  ports_found: number
}
