/**
 * Scans feature types
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

export type SortField = 'scans_id' | 's_time' | 'profile' | 'host_count' | 'port_count' | 'duration'
export type SortDirection = 'asc' | 'desc'

export interface SortState {
  field: SortField
  direction: SortDirection
}

export interface ScanFilters {
  search: string           // Search by IP or port
  dateFrom: number | null  // Unix timestamp
  dateTo: number | null    // Unix timestamp
  profiles: string[]       // Filter by profile names
  minHosts: number | null
  maxHosts: number | null
  modes: string[]          // Filter by scan modes (TCP SYN, UDP, etc.)
}

export interface PaginationState {
  page: number
  pageSize: number
}

export const DEFAULT_FILTERS: ScanFilters = {
  search: '',
  dateFrom: null,
  dateTo: null,
  profiles: [],
  minHosts: null,
  maxHosts: null,
  modes: [],
}

export const DEFAULT_SORT: SortState = {
  field: 's_time',
  direction: 'desc',
}

export const DEFAULT_PAGINATION: PaginationState = {
  page: 1,
  pageSize: 25,
}

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
