/**
 * Timeline feature module
 * Enhanced host tracking timeline with change detection
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// Components
export { HostTimeline } from './HostTimeline'
export { TimelineControls } from './TimelineControls'
export { TimelineRow } from './TimelineRow'
export { TimelineExportDialog } from './TimelineExportDialog'

// Hooks
export {
  useHostTimeline,
  useTimelineFilter,
  useTimelineViewState,
  useTimelineUrlState,
  useFilteredTimeline,
  useTimelineState,
  timelineKeys,
} from './hooks'

// Types
export type {
  PortObservation,
  PortStateChange,
  PortTrack,
  HostTimelineData,
  TimelineScanPoint,
  TimelineSummary,
  TimelineFilter,
  TimelineViewState,
  TimelineUrlState,
  TimelineExportFormat,
  TimelineExportOptions,
  ChangeType,
  ChangeSeverity,
} from './types'

export {
  DEFAULT_FILTER,
  DEFAULT_VIEW_STATE,
  getChangeTypeColor,
  getChangeTypeLabel,
  getChangeTypeIcon,
  getSeverityVariant,
} from './types'

// Utilities
export {
  buildHostTimeline,
  applyFilters,
  parsePortFilter,
  calculateVisibleRange,
  formatTimestamp,
  formatDuration,
  reportToObservation,
  getPortKey,
} from './timeline-utils'

// Export utilities
export {
  exportTimeline,
  exportTimelineToJSON,
  exportChangesToCSV,
  exportTracksToCSV,
  exportTimelineToSVG,
  downloadFile,
} from './export-utils'
