/**
 * React Query hooks for scan data
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { getDatabase } from '@/lib/database'
import type { Scan, ScanSummary, IpReport } from '@/types/database'

const db = getDatabase()

// =============================================================================
// Query Keys
// =============================================================================

export const scanKeys = {
  all: ['scans'] as const,
  lists: () => [...scanKeys.all, 'list'] as const,
  list: (options?: { limit?: number; offset?: number }) =>
    [...scanKeys.lists(), options] as const,
  summaries: () => [...scanKeys.all, 'summaries'] as const,
  summaryList: (limit?: number) => [...scanKeys.summaries(), { limit }] as const,
  details: () => [...scanKeys.all, 'detail'] as const,
  detail: (id: number) => [...scanKeys.details(), id] as const,
  reports: (id: number) => [...scanKeys.all, 'reports', id] as const,
  reportsByHost: (id: number, host: string) =>
    [...scanKeys.all, 'reports', id, host] as const,
  banners: (id: number) => [...scanKeys.all, 'banners', id] as const,
}

// =============================================================================
// Hooks
// =============================================================================

export function useScans(
  options?: { limit?: number; offset?: number },
  queryOptions?: Omit<UseQueryOptions<Scan[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: scanKeys.list(options),
    queryFn: () => db.getScans(options),
    ...queryOptions,
  })
}

export function useScanSummaries(
  limit?: number,
  queryOptions?: Omit<UseQueryOptions<ScanSummary[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: scanKeys.summaryList(limit),
    queryFn: () => db.getScanSummaries({ limit }),
    ...queryOptions,
  })
}

export function useScan(
  scan_id: number,
  queryOptions?: Omit<UseQueryOptions<Scan | null, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: scanKeys.detail(scan_id),
    queryFn: () => db.getScan(scan_id),
    enabled: scan_id > 0,
    ...queryOptions,
  })
}

export function useIpReports(
  scan_id: number,
  queryOptions?: Omit<UseQueryOptions<IpReport[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: scanKeys.reports(scan_id),
    queryFn: () => db.getIpReports(scan_id),
    enabled: scan_id > 0,
    ...queryOptions,
  })
}

export function useIpReportsByHost(
  scan_id: number,
  hostAddr: string,
  queryOptions?: Omit<UseQueryOptions<IpReport[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: scanKeys.reportsByHost(scan_id, hostAddr),
    queryFn: () => db.getIpReportsByHost(scan_id, hostAddr),
    enabled: scan_id > 0 && !!hostAddr,
    ...queryOptions,
  })
}

/**
 * Fetch banner data for all IP reports in a scan.
 * Returns Map of ipreport_id -> banner string.
 */
export function useBanners(
  scan_id: number,
  queryOptions?: Omit<UseQueryOptions<Map<number, string>, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: scanKeys.banners(scan_id),
    queryFn: () => db.getBannersForScan(scan_id),
    enabled: scan_id > 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes - banners don't change
    ...queryOptions,
  })
}
