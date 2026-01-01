/**
 * Scans feature exports
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// List page components
export { ScanTable } from './ScanTable'
export { ScanFilterBar } from './ScanFilters'
export { Pagination } from './Pagination'
export {
  useScanList,
  useAvailableProfiles,
  useAvailableModes,
  useSavedFilters,
  useSavedFilter,
  useCreateSavedFilter,
  useUpdateSavedFilter,
  useDeleteSavedFilter,
  savedFilterKeys,
} from './hooks'

// Filter components
export {
  CheckboxFilterGroup,
  FilterChipBar,
  FilterPanel,
  SavedFiltersSection,
} from './components'

// Detail page components
export { ScanDetailHeader } from './ScanDetailHeader'
export { Tabs, type Tab } from './Tabs'
export { ResultsTab } from './ResultsTab'
export { HostsTab } from './HostsTab'
export { ArpResults } from './ArpResults'
export { RawDataTab } from './RawDataTab'
export { NotesTab } from './NotesTab'
export { NotesSidebar } from './NotesSidebar'
// Re-export from ports feature for backwards compatibility
export { TcpFlagBadge, TcpFlagsDisplay } from '@/features/ports'
export {
  useArpReports,
  useScanNotes,
  useEntityNotes,
  useAllNotes,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  notesKeys,
} from './detail-hooks'

// Types
export * from './types'
