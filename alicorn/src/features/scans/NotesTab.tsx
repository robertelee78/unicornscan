/**
 * Notes tab - view and add notes for a scan
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState } from 'react'
import { Plus, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatTimestamp } from '@/lib/utils'
import type { Note } from '@/types/database'

interface NotesTabProps {
  scanId: number  // Used for future note saving functionality
  scanNotes: string | null
  notes: Note[]
  isLoading: boolean
}

export function NotesTab({ scanId: _scanId, scanNotes, notes, isLoading }: NotesTabProps) {
  const [isAddingNote, setIsAddingNote] = useState(false)

  if (isLoading) {
    return <div className="text-muted py-8 text-center">Loading notes...</div>
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

      {/* New note form - placeholder for Phase 4 implementation */}
      {isAddingNote && (
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-4">
              <textarea
                className="w-full h-24 px-3 py-2 text-sm bg-background border border-border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Enter your note..."
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddingNote(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    // TODO: Implement note saving in Phase 4
                    setIsAddingNote(false)
                  }}
                >
                  Save Note
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scan notes (from scan record) */}
      {scanNotes && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <MessageSquare className="h-4 w-4 text-muted mt-1" />
              <div className="flex-1">
                <p className="text-xs text-muted mb-1">Scan Notes</p>
                <p className="text-sm">{scanNotes}</p>
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
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-4 w-4 text-muted mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs text-muted">
                        {formatTimestamp(parseInt(note.created_at))}
                      </p>
                      {note.updated_at !== note.created_at && (
                        <p className="text-xs text-muted">(edited)</p>
                      )}
                    </div>
                    <p className="text-sm">{note.content}</p>
                  </div>
                </div>
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
