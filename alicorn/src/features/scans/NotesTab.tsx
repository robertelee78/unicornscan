/**
 * Notes tab - view and add notes for a scan with auto-save and undo/redo
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Plus, MessageSquare, Trash2, Loader2, Undo2, Redo2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatTimestamp } from '@/lib/utils'
import { useCreateNote, useUpdateNote, useDeleteNote } from './detail-hooks'
import type { Note, NoteEntityType } from '@/types/database'

// =============================================================================
// Types
// =============================================================================

interface NotesTabProps {
  entityType?: NoteEntityType
  entityId: number
  scanNotes: string | null  // Inline notes from scan record
  notes: Note[]
  isLoading: boolean
}

interface HistoryState {
  past: string[]
  future: string[]
}

// =============================================================================
// Debounce hook
// =============================================================================

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

// =============================================================================
// Auto-save note editor with undo/redo
// =============================================================================

interface NoteEditorProps {
  initialValue: string
  noteId?: number
  entityType: NoteEntityType
  entityId: number
  onSave: (text: string) => Promise<void>
  onCancel?: () => void
  onDelete?: () => void
  isNew?: boolean
  isSaving?: boolean
  isDeleting?: boolean
}

function NoteEditor({
  initialValue,
  onSave,
  onCancel,
  onDelete,
  isNew = false,
  isDeleting = false,
}: NoteEditorProps) {
  const [text, setText] = useState(initialValue)
  const [lastSaved, setLastSaved] = useState(initialValue)
  const [history, setHistory] = useState<HistoryState>({ past: [], future: [] })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Debounce text changes for auto-save (2 seconds)
  const debouncedText = useDebounce(text, 2000)

  // Auto-save when debounced text changes
  useEffect(() => {
    // Skip if text matches last saved value
    if (debouncedText === lastSaved) return
    // Skip if empty and new (don't auto-create empty notes)
    if (isNew && !debouncedText.trim()) return

    const save = async () => {
      setSaveStatus('saving')
      try {
        await onSave(debouncedText)
        setLastSaved(debouncedText)
        setSaveStatus('saved')
        // Reset to idle after showing saved indicator
        setTimeout(() => setSaveStatus('idle'), 1500)
      } catch {
        setSaveStatus('idle')
      }
    }

    save()
  }, [debouncedText, isNew, onSave, lastSaved])

  // Track changes for undo/redo
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value
    setHistory((prev) => ({
      past: [...prev.past, text].slice(-50), // Keep last 50 states
      future: [], // Clear redo stack on new change
    }))
    setText(newText)
  }, [text])

  // Undo
  const handleUndo = useCallback(() => {
    if (history.past.length === 0) return
    const previous = history.past[history.past.length - 1]
    const newPast = history.past.slice(0, -1)
    setHistory({
      past: newPast,
      future: [text, ...history.future],
    })
    setText(previous)
  }, [history, text])

  // Redo
  const handleRedo = useCallback(() => {
    if (history.future.length === 0) return
    const next = history.future[0]
    const newFuture = history.future.slice(1)
    setHistory({
      past: [...history.past, text],
      future: newFuture,
    })
    setText(next)
  }, [history, text])

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault()
      if (e.shiftKey) {
        handleRedo()
      } else {
        handleUndo()
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault()
      handleRedo()
    }
    // Escape to cancel (only for new notes)
    if (e.key === 'Escape' && isNew && onCancel) {
      e.preventDefault()
      onCancel()
    }
  }, [handleUndo, handleRedo, isNew, onCancel])

  // Focus textarea on mount for new notes
  useEffect(() => {
    if (isNew && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isNew])

  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0
  const hasChanges = text !== lastSaved

  return (
    <div className="space-y-2">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="w-full h-24 px-3 py-2 text-sm bg-background border border-border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring font-mono"
        placeholder="Enter your note..."
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {/* Undo/Redo buttons */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="h-7 w-7 p-0"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            className="h-7 w-7 p-0"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>

          {/* Save status indicator */}
          <span className="ml-2 text-xs text-muted-foreground flex items-center gap-1">
            {saveStatus === 'saving' && (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <Check className="h-3 w-3 text-success" />
                Saved
              </>
            )}
            {saveStatus === 'idle' && hasChanges && (
              <span className="text-muted">Unsaved changes</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Delete button (for existing notes) */}
          {!isNew && onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={isDeleting}
              className="text-destructive hover:text-destructive"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* Cancel button (for new notes) */}
          {isNew && onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function NotesTab({
  entityType = 'scan',
  entityId,
  scanNotes,
  notes,
  isLoading,
}: NotesTabProps) {
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null)

  const createNoteMutation = useCreateNote()
  const updateNoteMutation = useUpdateNote()
  const deleteNoteMutation = useDeleteNote()

  // Create new note
  const handleCreateNote = useCallback(async (text: string) => {
    if (!text.trim()) return
    await createNoteMutation.mutateAsync({
      entity_type: entityType,
      entity_id: entityId,
      note_text: text,
    })
    setIsAddingNote(false)
  }, [createNoteMutation, entityType, entityId])

  // Update existing note
  const handleUpdateNote = useCallback(async (noteId: number, text: string) => {
    await updateNoteMutation.mutateAsync({
      noteId,
      updates: { note_text: text },
    })
  }, [updateNoteMutation])

  // Delete note
  const handleDeleteNote = useCallback(async (noteId: number) => {
    await deleteNoteMutation.mutateAsync(noteId)
    setEditingNoteId(null)
  }, [deleteNoteMutation])

  if (isLoading) {
    return (
      <div className="text-muted py-8 text-center flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading notes...
      </div>
    )
  }

  const hasNotes = scanNotes || notes.length > 0

  return (
    <div className="space-y-4">
      {/* Add note button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAddingNote(true)}
          disabled={isAddingNote}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Note
        </Button>
      </div>

      {/* New note form */}
      {isAddingNote && (
        <Card>
          <CardContent className="pt-4">
            <NoteEditor
              initialValue=""
              entityType={entityType}
              entityId={entityId}
              onSave={handleCreateNote}
              onCancel={() => setIsAddingNote(false)}
              isNew
              isSaving={createNoteMutation.isPending}
            />
          </CardContent>
        </Card>
      )}

      {/* Scan notes (from scan record - read only) */}
      {scanNotes && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <MessageSquare className="h-4 w-4 text-muted mt-1 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted mb-1">Scan Notes (from scan record)</p>
                <p className="text-sm whitespace-pre-wrap">{scanNotes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes list */}
      {notes.length > 0 && (
        <div className="space-y-3">
          {notes.map((note) => (
            <Card key={note.note_id}>
              <CardContent className="pt-4">
                {editingNoteId === note.note_id ? (
                  <NoteEditor
                    initialValue={note.note_text}
                    noteId={note.note_id}
                    entityType={entityType}
                    entityId={entityId}
                    onSave={(text) => handleUpdateNote(note.note_id, text)}
                    onDelete={() => handleDeleteNote(note.note_id)}
                    isDeleting={deleteNoteMutation.isPending}
                  />
                ) : (
                  <div
                    className="flex items-start gap-3 cursor-pointer group"
                    onClick={() => setEditingNoteId(note.note_id)}
                  >
                    <MessageSquare className="h-4 w-4 text-muted mt-1 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs text-muted">
                          {formatTimestamp(
                            typeof note.created_at === 'string'
                              ? Math.floor(new Date(note.created_at).getTime() / 1000)
                              : parseInt(note.created_at)
                          )}
                        </p>
                        {note.updated_at !== note.created_at && (
                          <p className="text-xs text-muted">(edited)</p>
                        )}
                        <span className="text-xs text-muted opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                          Click to edit
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{note.note_text}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!hasNotes && !isAddingNote && (
        <div className="text-center py-12 text-muted">
          <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p>No notes yet</p>
          <p className="text-sm mt-1">Add a note to document your findings</p>
        </div>
      )}
    </div>
  )
}
