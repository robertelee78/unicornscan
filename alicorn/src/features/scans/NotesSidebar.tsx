/**
 * Notes sidebar - view all notes across scans and hosts
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, MessageSquare, Search, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatTimestamp } from '@/lib/utils'
import { useAllNotes, useDeleteNote } from './detail-hooks'
import type { Note } from '@/types/database'

// =============================================================================
// Types
// =============================================================================

interface NotesSidebarProps {
  isOpen: boolean
  onClose: () => void
}

// =============================================================================
// Note Item Component
// =============================================================================

interface NoteItemProps {
  note: Note
  onNavigate: (note: Note) => void
  onDelete: (noteId: number) => void
  isDeleting: boolean
}

function NoteItem({ note, onNavigate, onDelete, isDeleting }: NoteItemProps) {
  const entityLabel = getEntityLabel(note.entity_type)

  return (
    <div
      className="p-3 border-b border-border hover:bg-surface-light cursor-pointer group transition-colors"
      onClick={() => onNavigate(note)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-primary">{entityLabel}</span>
            <span className="text-xs text-muted">#{note.entity_id}</span>
          </div>
          <p className="text-sm line-clamp-2 whitespace-pre-wrap">
            {note.note_text}
          </p>
          <p className="text-xs text-muted mt-1">
            {formatTimestamp(
              typeof note.created_at === 'string'
                ? Math.floor(new Date(note.created_at).getTime() / 1000)
                : parseInt(note.created_at)
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(note.note_id)
          }}
          disabled={isDeleting}
          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-destructive"
        >
          {isDeleting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
        </Button>
      </div>
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================

function getEntityLabel(entityType: string): string {
  switch (entityType) {
    case 'scan':
      return 'Scan'
    case 'host':
      return 'Host'
    case 'ipreport':
      return 'IP Report'
    case 'arpreport':
      return 'ARP Report'
    case 'service':
      return 'Service'
    case 'network':
      return 'Network'
    default:
      return entityType
  }
}

function getEntityPath(entityType: string, entityId: number): string {
  switch (entityType) {
    case 'scan':
      return `/scans/${entityId}`
    case 'host':
      return `/hosts/${entityId}`
    case 'ipreport':
      return `/scans/${entityId}` // IP reports are under scans
    case 'arpreport':
      return `/scans/${entityId}` // ARP reports are under scans
    default:
      return '/'
  }
}

// =============================================================================
// Main Component
// =============================================================================

export function NotesSidebar({ isOpen, onClose }: NotesSidebarProps) {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const { data: notesData, isLoading } = useAllNotes({
    limit: 100,
    search: searchQuery || undefined,
  })

  const deleteNoteMutation = useDeleteNote()

  const handleNavigate = useCallback((note: Note) => {
    const path = getEntityPath(note.entity_type, note.entity_id)
    navigate(path)
    onClose()
  }, [navigate, onClose])

  const handleDelete = useCallback(async (noteId: number) => {
    setDeletingId(noteId)
    try {
      await deleteNoteMutation.mutateAsync(noteId)
    } finally {
      setDeletingId(null)
    }
  }, [deleteNoteMutation])

  const notes = notesData?.data ?? []

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`fixed top-0 right-0 h-full w-80 bg-surface border-l border-border z-50 transform transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <span className="font-semibold">All Notes</span>
            {notes.length > 0 && (
              <span className="text-xs text-muted">({notes.length})</span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes..."
              className="w-full h-9 pl-9 pr-3 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto" style={{ height: 'calc(100vh - 8.5rem)' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading notes...
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted">
              <MessageSquare className="h-8 w-8 mb-3 opacity-50" />
              <p className="text-sm">
                {searchQuery ? 'No matching notes' : 'No notes yet'}
              </p>
              {!searchQuery && (
                <p className="text-xs mt-1">Notes added to scans will appear here</p>
              )}
            </div>
          ) : (
            notes.map((note) => (
              <NoteItem
                key={note.note_id}
                note={note}
                onNavigate={handleNavigate}
                onDelete={handleDelete}
                isDeleting={deletingId === note.note_id}
              />
            ))
          )}
        </div>
      </aside>
    </>
  )
}
