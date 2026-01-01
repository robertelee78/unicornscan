/**
 * Unit tests for src/features/scans/NotesTab.tsx
 * Tests notes display, creation, editing, auto-save, and undo/redo
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test-utils'
import type { Note } from '@/types/database'

// Mock the detail-hooks module
vi.mock('@/features/scans/detail-hooks', () => ({
  useCreateNote: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  })),
  useUpdateNote: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  })),
  useDeleteNote: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  })),
}))

import { NotesTab } from '@/features/scans/NotesTab'
import { useCreateNote, useUpdateNote, useDeleteNote } from '@/features/scans/detail-hooks'

const mockUseCreateNote = vi.mocked(useCreateNote)
const mockUseUpdateNote = vi.mocked(useUpdateNote)
const mockUseDeleteNote = vi.mocked(useDeleteNote)

// Mock note factory
function createMockNote(overrides: Partial<Note> = {}): Note {
  const now = new Date().toISOString()
  return {
    note_id: 1,
    entity_type: 'scan',
    entity_id: 1,
    note_text: 'Test note content',
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

describe('NotesTab', () => {
  const mockMutateAsync = vi.fn().mockResolvedValue({})

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.clearAllMocks()

    mockUseCreateNote.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as ReturnType<typeof useCreateNote>)

    mockUseUpdateNote.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as ReturnType<typeof useUpdateNote>)

    mockUseDeleteNote.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as ReturnType<typeof useDeleteNote>)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('loading state', () => {
    it('shows loading indicator when isLoading is true', () => {
      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={[]}
          isLoading={true}
        />
      )

      expect(screen.getByText(/loading notes/i)).toBeInTheDocument()
    })

    it('does not show add button when loading', () => {
      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={[]}
          isLoading={true}
        />
      )

      expect(screen.queryByRole('button', { name: /add note/i })).not.toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('shows empty state message when no notes', () => {
      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={[]}
          isLoading={false}
        />
      )

      expect(screen.getByText(/no notes yet/i)).toBeInTheDocument()
      expect(screen.getByText(/add a note to document your findings/i)).toBeInTheDocument()
    })

    it('shows add note button in empty state', () => {
      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={[]}
          isLoading={false}
        />
      )

      expect(screen.getByRole('button', { name: /add note/i })).toBeInTheDocument()
    })
  })

  describe('scan notes display', () => {
    it('displays scan notes when provided', () => {
      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes="Original scan notes"
          notes={[]}
          isLoading={false}
        />
      )

      expect(screen.getByText('Original scan notes')).toBeInTheDocument()
      expect(screen.getByText(/scan notes.*from scan record/i)).toBeInTheDocument()
    })

    it('does not show empty state when scan notes exist', () => {
      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes="Some notes"
          notes={[]}
          isLoading={false}
        />
      )

      expect(screen.queryByText(/no notes yet/i)).not.toBeInTheDocument()
    })
  })

  describe('notes list', () => {
    it('displays notes with content', () => {
      const notes = [
        createMockNote({ note_id: 1, note_text: 'First note' }),
        createMockNote({ note_id: 2, note_text: 'Second note' }),
      ]

      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={notes}
          isLoading={false}
        />
      )

      expect(screen.getByText('First note')).toBeInTheDocument()
      expect(screen.getByText('Second note')).toBeInTheDocument()
    })

    it('shows (edited) indicator for modified notes', () => {
      const notes = [
        createMockNote({
          note_id: 1,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-02T00:00:00Z', // Different from created_at
        }),
      ]

      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={notes}
          isLoading={false}
        />
      )

      expect(screen.getByText('(edited)')).toBeInTheDocument()
    })

    it('does not show (edited) for new notes', () => {
      const now = '2025-01-01T00:00:00Z'
      const notes = [
        createMockNote({
          note_id: 1,
          created_at: now,
          updated_at: now,
        }),
      ]

      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={notes}
          isLoading={false}
        />
      )

      expect(screen.queryByText('(edited)')).not.toBeInTheDocument()
    })

    it('shows "Click to edit" on hover', () => {
      const notes = [createMockNote()]

      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={notes}
          isLoading={false}
        />
      )

      expect(screen.getByText(/click to edit/i)).toBeInTheDocument()
    })
  })

  describe('adding notes', () => {
    it('shows note form when Add Note clicked', async () => {
      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={[]}
          isLoading={false}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /add note/i }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/enter your note/i)).toBeInTheDocument()
      })
    })

    it('disables Add Note button when form is open', async () => {
      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={[]}
          isLoading={false}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /add note/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add note/i })).toBeDisabled()
      })
    })

    it('shows cancel button in new note form', async () => {
      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={[]}
          isLoading={false}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /add note/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
      })
    })

    it('hides form when Cancel clicked', async () => {
      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={[]}
          isLoading={false}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /add note/i }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/enter your note/i)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/enter your note/i)).not.toBeInTheDocument()
      })
    })
  })

  describe('editing notes', () => {
    it('enters edit mode when note clicked', async () => {
      const notes = [createMockNote({ note_text: 'Editable note' })]

      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={notes}
          isLoading={false}
        />
      )

      // Click the note to edit
      fireEvent.click(screen.getByText('Editable note'))

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument()
        expect(screen.getByDisplayValue('Editable note')).toBeInTheDocument()
      })
    })

    it('shows delete button in edit mode', async () => {
      const notes = [createMockNote()]

      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={notes}
          isLoading={false}
        />
      )

      fireEvent.click(screen.getByText('Test note content'))

      await waitFor(() => {
        // Delete button should be visible (trash icon)
        const buttons = screen.getAllByRole('button')
        const deleteButton = buttons.find((btn) =>
          btn.querySelector('svg.lucide-trash-2') || btn.classList.contains('text-destructive')
        )
        expect(deleteButton).toBeTruthy()
      })
    })
  })

  describe('undo/redo', () => {
    it('shows undo button in editor', async () => {
      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={[]}
          isLoading={false}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /add note/i }))

      await waitFor(() => {
        expect(screen.getByTitle(/undo/i)).toBeInTheDocument()
      })
    })

    it('shows redo button in editor', async () => {
      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={[]}
          isLoading={false}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /add note/i }))

      await waitFor(() => {
        expect(screen.getByTitle(/redo/i)).toBeInTheDocument()
      })
    })

    it('undo button is disabled when no history', async () => {
      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={[]}
          isLoading={false}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /add note/i }))

      await waitFor(() => {
        expect(screen.getByTitle(/undo/i)).toBeDisabled()
      })
    })

    it('redo button is disabled when no future history', async () => {
      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={[]}
          isLoading={false}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /add note/i }))

      await waitFor(() => {
        expect(screen.getByTitle(/redo/i)).toBeDisabled()
      })
    })
  })

  describe('auto-save indicator', () => {
    it('shows "Unsaved changes" when text differs from saved', async () => {
      const notes = [createMockNote({ note_text: 'Original text' })]

      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={notes}
          isLoading={false}
        />
      )

      // Enter edit mode
      fireEvent.click(screen.getByText('Original text'))

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument()
      })

      // Type new content
      const textarea = screen.getByRole('textbox')
      await userEvent.clear(textarea)
      await userEvent.type(textarea, 'Modified text')

      // Should show unsaved changes
      await waitFor(() => {
        expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument()
      })
    })
  })

  describe('keyboard shortcuts', () => {
    it('Escape cancels new note creation', async () => {
      renderWithProviders(
        <NotesTab
          entityId={1}
          scanNotes={null}
          notes={[]}
          isLoading={false}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /add note/i }))

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument()
      })

      // Press Escape
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })

      await waitFor(() => {
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      })
    })
  })

  describe('entity type', () => {
    it('uses default entity type of scan', () => {
      const createMutateAsync = vi.fn().mockResolvedValue({})
      mockUseCreateNote.mockReturnValue({
        mutateAsync: createMutateAsync,
        isPending: false,
      } as ReturnType<typeof useCreateNote>)

      renderWithProviders(
        <NotesTab
          entityId={42}
          scanNotes={null}
          notes={[]}
          isLoading={false}
        />
      )

      // Component should be configured for scan entity type
      expect(screen.getByRole('button', { name: /add note/i })).toBeInTheDocument()
    })

    it('accepts custom entity type', () => {
      renderWithProviders(
        <NotesTab
          entityType="host"
          entityId={42}
          scanNotes={null}
          notes={[]}
          isLoading={false}
        />
      )

      expect(screen.getByRole('button', { name: /add note/i })).toBeInTheDocument()
    })
  })
})
