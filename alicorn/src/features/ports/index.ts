/**
 * Ports feature exports
 * Reusable components for displaying port, protocol, and response data
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// Port display components
export { PortBadge, PortNumber } from './PortBadge'
export { ProtocolBadge, ProtocolText } from './ProtocolBadge'

// TCP flag display
export { TcpFlagBadge, TcpFlagsDisplay, TcpFlagsCompact } from './TcpFlagBadge'
export { TCP_FLAGS, decodeTcpFlags } from './TcpFlagBadge'

// Response classification and display
export { ResponseBadge, ResponseDisplay } from './ResponseDisplay'
export { classifyResponse, getIcmpDescription, ICMP_TYPES } from './ResponseDisplay'
export type { ResponseCategory } from './ResponseDisplay'

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

// Port table
export { PortTable, DETAILED_COLUMNS } from './PortTable'
export { ipReportToPortTableRow, ipReportsToPortTableRows } from './PortTable'
export type { PortTableColumn, PortTableSort, PortTableRow } from './PortTable'

// Types
export * from './types'
