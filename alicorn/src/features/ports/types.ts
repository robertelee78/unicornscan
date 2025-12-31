/**
 * Port feature types
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

export type Protocol = 'tcp' | 'udp' | 'icmp' | 'other'

export interface PortData {
  port: number
  protocol: Protocol
  state: 'open' | 'closed' | 'filtered'
  serviceName?: string
  serviceVersion?: string
  banner?: string
  ttl?: number
  flags?: number
  hostAddr?: string
  timestamp?: number
}

export type PortSortField = 'port' | 'protocol' | 'state' | 'service' | 'ttl'
export type SortDirection = 'asc' | 'desc'

export interface PortSortState {
  field: PortSortField
  direction: SortDirection
}

export const DEFAULT_PORT_SORT: PortSortState = {
  field: 'port',
  direction: 'asc',
}
