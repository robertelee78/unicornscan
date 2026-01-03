/**
 * Hosts feature exports
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// List page components
export { HostTable } from './HostTable'
export { HostFilterBar } from './HostFilterBar'
export { Pagination } from './Pagination'
export { useHostList } from './hooks'
export { HighlightText, textMatchesSearch } from './HighlightText'

// Detail page components
export { HostDetailHeader } from './HostDetailHeader'
export { PortHistory } from './PortHistory'
export { AssociatedScans } from './AssociatedScans'
export { useHostPortHistory, useAggregatedPortHistory, useHostScans, useHostReports } from './hooks'

// Search index hooks
export { useHostBannerIndex, useHostNotesIndex, useHostPortsIndex } from './hooks'

// Types
export * from './types'

// Search utilities
export {
  detectSearchType,
  parseSearch,
  matchesCIDR,
  matchesIPPrefix,
  matchesMAC,
  matchesBanner,
  matchesText,
  validateRegex,
  isValidPort,
  normalizeMAC,
  formatMAC,
  getSearchTypeDescription,
  getSearchTypeExamples,
} from './search-utils'
