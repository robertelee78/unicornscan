/**
 * Scan detail specific hooks
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDatabase } from '@/lib/database'
import type { NoteEntityType, NoteCreate, NoteUpdate } from '@/types/database'

const db = getDatabase()

// =============================================================================
// Query Keys
// =============================================================================

export const scanDetailKeys = {
  all: ['scanDetail'] as const,
  arp: (scan_id: number) => [...scanDetailKeys.all, 'arp', scan_id] as const,
  notes: (entityType: string, entityId: number) =>
    [...scanDetailKeys.all, 'notes', entityType, entityId] as const,
}

export const notesKeys = {
  all: ['notes'] as const,
  list: (options?: { search?: string }) => [...notesKeys.all, 'list', options] as const,
  entity: (entityType: string, entityId: number) =>
    [...notesKeys.all, 'entity', entityType, entityId] as const,
}

// =============================================================================
// Query Hooks
// =============================================================================

export function useArpReports(scan_id: number) {
  return useQuery({
    queryKey: scanDetailKeys.arp(scan_id),
    queryFn: () => db.getArpReports(scan_id),
    enabled: scan_id > 0,
    staleTime: 30000,
  })
}

export function useScanNotes(scan_id: number) {
  return useQuery({
    queryKey: notesKeys.entity('scan', scan_id),
    queryFn: () => db.getNotes('scan', scan_id),
    enabled: scan_id > 0,
    staleTime: 30000,
  })
}

export function useEntityNotes(entityType: NoteEntityType, entityId: number) {
  return useQuery({
    queryKey: notesKeys.entity(entityType, entityId),
    queryFn: () => db.getNotes(entityType, entityId),
    enabled: entityId > 0,
    staleTime: 30000,
  })
}

export function useAllNotes(options?: { limit?: number; offset?: number; search?: string }) {
  return useQuery({
    queryKey: notesKeys.list(options),
    queryFn: () => db.getAllNotes(options),
    staleTime: 30000,
  })
}

// =============================================================================
// Mutation Hooks
// =============================================================================

export function useCreateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (note: NoteCreate) => db.createNote(note),
    onSuccess: (newNote) => {
      // Invalidate the specific entity's notes
      queryClient.invalidateQueries({
        queryKey: notesKeys.entity(newNote.entity_type, newNote.entity_id),
      })
      // Invalidate the all notes list
      queryClient.invalidateQueries({ queryKey: notesKeys.all })
    },
  })
}

export function useUpdateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ noteId, updates }: { noteId: number; updates: NoteUpdate }) =>
      db.updateNote(noteId, updates),
    onSuccess: () => {
      // Invalidate all notes queries since we don't know which entity was affected
      queryClient.invalidateQueries({ queryKey: notesKeys.all })
    },
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (noteId: number) => db.deleteNote(noteId),
    onSuccess: () => {
      // Invalidate all notes queries
      queryClient.invalidateQueries({ queryKey: notesKeys.all })
    },
  })
}
