/**
 * Scan detail specific hooks
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useQuery } from '@tanstack/react-query'
import { getDatabase } from '@/lib/database'
// Types used by query functions

const db = getDatabase()

// =============================================================================
// Query Keys
// =============================================================================

export const scanDetailKeys = {
  all: ['scanDetail'] as const,
  arp: (scansId: number) => [...scanDetailKeys.all, 'arp', scansId] as const,
  notes: (entityType: string, entityId: number) =>
    [...scanDetailKeys.all, 'notes', entityType, entityId] as const,
}

// =============================================================================
// Hooks
// =============================================================================

export function useArpReports(scansId: number) {
  return useQuery({
    queryKey: scanDetailKeys.arp(scansId),
    queryFn: () => db.getArpReports(scansId),
    enabled: scansId > 0,
    staleTime: 30000,
  })
}

export function useScanNotes(scansId: number) {
  return useQuery({
    queryKey: scanDetailKeys.notes('scan', scansId),
    queryFn: () => db.getNotes('scan', scansId),
    enabled: scansId > 0,
    staleTime: 30000,
  })
}
