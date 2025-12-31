/**
 * React Query hooks for host data
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { getDatabase } from '@/lib/database'
import type { Host, HostSummary } from '@/types/database'

const db = getDatabase()

// =============================================================================
// Query Keys
// =============================================================================

export const hostKeys = {
  all: ['hosts'] as const,
  lists: () => [...hostKeys.all, 'list'] as const,
  list: (limit?: number) => [...hostKeys.lists(), { limit }] as const,
  summaries: () => [...hostKeys.all, 'summaries'] as const,
  summaryList: (scansId?: number) => [...hostKeys.summaries(), scansId] as const,
  details: () => [...hostKeys.all, 'detail'] as const,
  detail: (id: number) => [...hostKeys.details(), id] as const,
  byIp: (ip: string) => [...hostKeys.all, 'ip', ip] as const,
}

// =============================================================================
// Hooks
// =============================================================================

export function useHosts(
  limit?: number,
  queryOptions?: Omit<UseQueryOptions<Host[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: hostKeys.list(limit),
    queryFn: () => db.getHosts({ limit }),
    ...queryOptions,
  })
}

export function useHost(
  hostId: number,
  queryOptions?: Omit<UseQueryOptions<Host | null, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: hostKeys.detail(hostId),
    queryFn: () => db.getHost(hostId),
    enabled: hostId > 0,
    ...queryOptions,
  })
}

export function useHostByIp(
  ip: string,
  queryOptions?: Omit<UseQueryOptions<Host | null, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: hostKeys.byIp(ip),
    queryFn: () => db.getHostByIp(ip),
    enabled: !!ip,
    ...queryOptions,
  })
}

export function useHostSummaries(
  scansId?: number,
  queryOptions?: Omit<UseQueryOptions<HostSummary[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: hostKeys.summaryList(scansId),
    queryFn: () => db.getHostSummaries(scansId),
    ...queryOptions,
  })
}
