/**
 * Ports feature exports
 * Reusable components for displaying port, protocol, and response data
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// Port display components
export { PortBadge, PortNumber } from './PortBadge'
export { ProtocolBadge, ProtocolText } from './ProtocolBadge'

// TCP flag display (components only)
export { TcpFlagBadge, TcpFlagsDisplay, TcpFlagsCompact } from './TcpFlagBadge'

// Response display (components only)
export { ResponseBadge, ResponseDisplay } from './ResponseDisplay'

// Response utilities (from separate utils file for Fast Refresh compatibility)
export {
  classifyResponse,
  getIcmpDescription,
  ICMP_TYPES,
} from './response-utils'
export type { ResponseCategory, ResponseClassification, IcmpTypeInfo } from './response-utils'

// Service and payload display
export { ServiceInfo, ServiceBadge } from './ServiceInfo'
export { PayloadPreview, BannerLine } from './PayloadPreview'

// Well-known ports database
export {
  WELL_KNOWN_PORTS,
  getPortInfo,
  getServiceName,
  getCategoryColor,
  isDangerousPort,
} from './well-known-ports'
export type { PortEntry } from './well-known-ports'

// Port table (component only)
export { PortTable } from './PortTable'

// Port table utilities (from separate utils file for Fast Refresh compatibility)
export {
  DETAILED_COLUMNS,
  DEFAULT_COLUMNS,
  COLUMN_CONFIG,
  ipReportToPortTableRow,
  ipReportsToPortTableRows,
  getTtlColorClass,
  // Banner utilities
  BANNER_PREVIEW_LENGTH,
  truncateBanner,
  bannerNeedsExpansion,
} from './port-utils'
export type {
  PortTableColumn,
  PortTableSort,
  PortTableRow,
  SortDirection,
  ColumnConfig,
} from './port-utils'

// Types
export * from './types'
