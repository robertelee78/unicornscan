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
  scansId: number,
  queryOptions?: Omit<UseQueryOptions<Scan | null, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: scanKeys.detail(scansId),
    queryFn: () => db.getScan(scansId),
    enabled: scansId > 0,
    ...queryOptions,
  })
}

export function useIpReports(
  scansId: number,
  queryOptions?: Omit<UseQueryOptions<IpReport[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: scanKeys.reports(scansId),
    queryFn: () => db.getIpReports(scansId),
    enabled: scansId > 0,
    ...queryOptions,
  })
}

export function useIpReportsByHost(
  scansId: number,
  hostAddr: string,
  queryOptions?: Omit<UseQueryOptions<IpReport[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: scanKeys.reportsByHost(scansId, hostAddr),
    queryFn: () => db.getIpReportsByHost(scansId, hostAddr),
    enabled: scansId > 0 && !!hostAddr,
    ...queryOptions,
  })
}
