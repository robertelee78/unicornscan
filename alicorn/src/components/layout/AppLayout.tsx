/**
 * Main application layout with sidebar and header
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { NotesSidebar, useAllNotes } from '@/features/scans'
import { ConnectionBanner } from '@/features/connection'

export function AppLayout() {
  const [notesSidebarOpen, setNotesSidebarOpen] = useState(false)
  const { data: notesData } = useAllNotes({ limit: 100 })
  const notesCount = notesData?.total ?? 0

  const handleNotesClick = useCallback(() => {
    setNotesSidebarOpen((prev) => !prev)
  }, [])

  const handleNotesSidebarClose = useCallback(() => {
    setNotesSidebarOpen(false)
  }, [])

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <ConnectionBanner />
        <Header notesCount={notesCount} onNotesClick={handleNotesClick} />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
      <NotesSidebar isOpen={notesSidebarOpen} onClose={handleNotesSidebarClose} />
    </div>
  )
}
