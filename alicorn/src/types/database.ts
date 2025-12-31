/**
 * TypeScript types matching unicornscan PostgreSQL schema v5
 * These types map directly to database tables for type-safe queries
 */

// =============================================================================
// Core Scan Types
// =============================================================================

export interface Scan {
  scans_id: number
  s_time: number
  e_time: number
  est_e_time: number
  senders: number
  listeners: number
  scan_iter: number
  profile: string
  options: number
  payload_group: number
  dronestr: string
  covertness: number
  modules: string
  user: string
  pcap_dumpfile: string | null
  pcap_readfile: string | null
  target_str: string
  port_str: string
  pps: number
  src_port: number
  mode: string
  mode_str: string | null
  mode_flags: number | null
  num_phases: number | null
  scan_metadata: Record<string, unknown> | null
  scan_notes: string | null
}

export interface IpReport {
  ipreport_id: number
  scans_id: number
  type: number
  subtype: number
  protocol: number
  ttl: number
  host_addr: string
  trace_addr: string
  dport: number
  sport: number
  tseq: number
  mseq: number
  window_size: number
  t_tstamp: number
  m_tstamp: number
  extra_data: Record<string, unknown> | null
}

export interface IpReportData {
  ipreport_id: number
  type: number
  data: Uint8Array
}

export interface IpPacket {
  ipreport_id: number
  packet: Uint8Array
}

// =============================================================================
// Frontend Support Types (v5 schema)
// =============================================================================

export interface Host {
  host_id: number
  ip_addr: string
  mac_addr: string | null
  hostname: string | null
  os_guess: string | null
  first_seen: number
  last_seen: number
  scan_count: number
  open_port_count: number
  metadata: Record<string, unknown> | null
}

export interface HostScan {
  host_id: number
  scans_id: number
  ports_found: number
  first_seen_in_scan: number
  last_seen_in_scan: number
}

export interface Hop {
  hop_id: number
  ipreport_id: number
  hop_number: number
  hop_addr: string
  rtt_ms: number | null
}

export interface Service {
  service_id: number
  ipreport_id: number
  service_name: string | null
  service_version: string | null
  banner: string | null
  confidence: number
  extra_info: Record<string, unknown> | null
}

export interface OsFingerprint {
  fingerprint_id: number
  ipreport_id: number
  os_name: string
  os_version: string | null
  os_family: string | null
  confidence: number
  fingerprint_data: Record<string, unknown> | null
}

export interface Network {
  network_id: number
  cidr: string
  name: string | null
  description: string | null
  created_at: string
}

export interface ScanTag {
  scans_id: number
  tag: string
  created_at: string
}

export interface Note {
  note_id: number
  entity_type: 'scan' | 'host' | 'port' | 'service'
  entity_id: number
  content: string
  created_at: string
  updated_at: string
}

export interface SavedFilter {
  filter_id: number
  name: string
  description: string | null
  filter_config: FilterConfig
  is_default: boolean
  created_at: string
  updated_at: string
}

// =============================================================================
// Helper/View Types
// =============================================================================

export interface FilterConfig {
  // Port filters
  ports?: number[]
  portRange?: { min: number; max: number }

  // Protocol filters
  protocols?: ('tcp' | 'udp' | 'icmp')[]

  // State filters
  portStates?: ('open' | 'closed' | 'filtered')[]

  // Time filters
  timeRange?: { start: number; end: number }

  // Host filters
  hostPattern?: string
  subnet?: string

  // Other
  hasService?: boolean
  hasBanner?: boolean
}

export interface ScanSummary {
  scans_id: number
  s_time: number
  e_time: number
  profile: string
  target_str: string
  mode_str: string | null
  host_count: number
  port_count: number
  open_count: number
  tags: string[]
}

export interface HostSummary {
  host_id: number
  ip_addr: string
  hostname: string | null
  os_guess: string | null
  open_ports: number[]
  last_seen: number
  scan_count: number
}

export interface PortInfo {
  port: number
  protocol: 'tcp' | 'udp'
  state: 'open' | 'closed' | 'filtered'
  service?: string
  banner?: string
  ttl: number
}

// =============================================================================
// TCP Flag Constants
// =============================================================================

export const TCP_FLAGS = {
  FIN: 0x01,
  SYN: 0x02,
  RST: 0x04,
  PSH: 0x08,
  ACK: 0x10,
  URG: 0x20,
  ECE: 0x40,
  CWR: 0x80,
} as const

export function decodeTcpFlags(flags: number): string[] {
  const result: string[] = []
  if (flags & TCP_FLAGS.SYN) result.push('SYN')
  if (flags & TCP_FLAGS.ACK) result.push('ACK')
  if (flags & TCP_FLAGS.FIN) result.push('FIN')
  if (flags & TCP_FLAGS.RST) result.push('RST')
  if (flags & TCP_FLAGS.PSH) result.push('PSH')
  if (flags & TCP_FLAGS.URG) result.push('URG')
  if (flags & TCP_FLAGS.ECE) result.push('ECE')
  if (flags & TCP_FLAGS.CWR) result.push('CWR')
  return result
}

// =============================================================================
// Protocol Constants
// =============================================================================

export const IP_PROTOCOLS = {
  ICMP: 1,
  TCP: 6,
  UDP: 17,
} as const

export function getProtocolName(protocol: number): string {
  switch (protocol) {
    case IP_PROTOCOLS.ICMP: return 'icmp'
    case IP_PROTOCOLS.TCP: return 'tcp'
    case IP_PROTOCOLS.UDP: return 'udp'
    default: return `proto-${protocol}`
  }
}
