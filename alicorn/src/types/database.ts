/**
 * TypeScript types matching unicornscan PostgreSQL schema v9
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
  tickrate: number
  num_hosts: number
  num_packets: number
  port_str: string | null
  interface: string | null
  tcpflags: number | null
  send_opts: number | null
  recv_opts: number | null
  pps: number | null
  recv_timeout: number | null
  repeats: number | null
  mode_str: string | null
  mode_flags: number | null
  num_phases: number | null
  scan_metadata: Record<string, unknown> | null
  scan_notes: string | null
  target_str: string | null  // Original command line target specification (v7)
  src_addr: string | null    // Source address / phantom IP (-s option) (v7)
}

export interface IpReport {
  ipreport_id: number
  scans_id: number
  magic: number
  sport: number
  dport: number
  proto: number  // 6=TCP, 17=UDP, 1=ICMP
  type: number
  subtype: number
  send_addr: string
  host_addr: string
  trace_addr: string
  ttl: number
  tstamp: number
  utstamp: number
  flags: number
  mseq: number
  tseq: number
  window_size: number
  t_tstamp: number
  m_tstamp: number
  eth_hwaddr: string | null  // v9: Ethernet source MAC for local network responses
  extra_data: Record<string, unknown> | null
  // Alias for convenience (maps to proto field)
  protocol?: number
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

export interface ArpReport {
  arpreport_id: number
  scans_id: number
  magic: number
  host_addr: string
  hwaddr: string  // MAC address
  tstamp: number
  utstamp: number
  extra_data: Record<string, unknown> | null
}

export interface ArpPacket {
  arpreport_id: number
  packet: Uint8Array
}

// =============================================================================
// Workunit Types (internal scanner state)
// =============================================================================

export interface SendWorkunit {
  magic: number
  scans_id: number
  repeats: number
  send_opts: number
  pps: number
  delay_type: number
  myaddr: string
  mymask: string
  macaddr: string
  mtu: number
  target: string
  targetmask: string
  tos: number
  minttl: number
  maxttl: number
  fingerprint: number
  src_port: number
  ip_off: number
  ipoptions: Uint8Array | null
  tcpflags: number
  tcpoptions: Uint8Array | null
  window_size: number
  syn_key: number
  port_str: string | null
  wid: number
  status: number
}

export interface ListenWorkunit {
  magic: number
  scans_id: number
  recv_timeout: number
  ret_layers: number
  recv_opts: number
  window_size: number
  syn_key: number
  pcap_str: string | null
  wid: number
  status: number
}

export interface ScanPhase {
  scans_id: number
  phase_idx: number
  mode: number
  mode_char: string
  tcphdrflgs: number
  send_opts: number
  recv_opts: number
  pps: number
  repeats: number
  recv_timeout: number
}

export interface WorkunitStats {
  wid: number
  scans_id: number
  msg: string
}

export interface OutputEntry {
  scans_id: number
  msg: string
}

// =============================================================================
// Frontend Support Types (v5 schema)
// =============================================================================

export interface Host {
  host_id: number
  host_addr: string        // IP address (database column name)
  ip_addr?: string         // Alias for compatibility
  mac_addr: string | null
  current_mac?: string | null  // v8: Most recent MAC from history (or mac_addr if set)
  hostname: string | null
  os_guess?: string | null // From OS fingerprinting (optional, deprecated - use os_name)
  os_family?: string | null    // v10: OS family (e.g., "Linux", "Windows", "BSD")
  os_name?: string | null      // v10: OS name (e.g., "Linux", "Windows 10")
  os_version?: string | null   // v10: OS version (e.g., "2.6", "10.0")
  device_type?: string | null  // v10: Device type (e.g., "general purpose", "router")
  first_seen: string | number  // ISO 8601 string from timestamptz, or Unix timestamp
  last_seen: string | number   // ISO 8601 string from timestamptz, or Unix timestamp
  scan_count: number       // Number of unique scans this host appeared in
  port_count: number       // Number of distinct responding ports
  mac_count?: number       // v8: Number of unique MACs associated with this IP
  open_port_count?: number // Alias for port_count (deprecated)
  extra_data: Record<string, unknown> | null
}

export interface HostScan {
  host_id: number
  scans_id: number
  ports_found: number
  first_seen_in_scan: number
  last_seen_in_scan: number
}

// =============================================================================
// MAC<->IP History Types (v8 schema)
// =============================================================================

/**
 * Historical MAC<->IP association record
 * Tracks every unique MAC<->IP pairing across scans
 */
export interface MacIpHistory {
  history_id: number
  host_addr: string
  mac_addr: string
  first_seen: string | number   // ISO 8601 or Unix timestamp
  last_seen: string | number    // ISO 8601 or Unix timestamp
  first_scans_id: number
  last_scans_id: number | null
  observation_count: number     // How many times we've seen this pairing
  age_seconds?: number          // Computed: seconds since last_seen
  first_scan_profile?: string   // Profile of first scan
  last_scan_profile?: string    // Profile of most recent scan
  extra_data: Record<string, unknown> | null
}

/**
 * Current MAC for an IP address (most recent association)
 */
export interface CurrentMacByIp {
  host_addr: string
  mac_addr: string
  first_seen: string | number
  last_seen: string | number
  observation_count: number
  first_scans_id: number
  last_scans_id: number | null
}

/**
 * Current IP for a MAC address (most recent association)
 */
export interface CurrentIpByMac {
  mac_addr: string
  host_addr: string
  first_seen: string | number
  last_seen: string | number
  observation_count: number
  first_scans_id: number
  last_scans_id: number | null
}

/**
 * IP addresses that have had multiple MAC associations
 */
export interface MacIpChange {
  host_addr: string
  mac_count: number
  mac_addresses: string[]       // Array of MACs, most recent first
  first_observed: string | number
  last_observed: string | number
  total_observations: number
}

export interface Hop {
  hop_id: number
  ipreport_id: number
  scans_id: number
  target_addr: string   // The host we were probing
  hop_addr: string      // Intermediate router that responded (trace_addr)
  hop_number: number | null
  ttl_observed: number  // TTL from the response packet
  rtt_us: number | null // Round-trip time in microseconds
  extra_data: Record<string, unknown> | null
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
  tag_name: string
  tag_value: string | null
  created_at: string
}

export type NoteEntityType = 'scan' | 'host' | 'ipreport' | 'arpreport' | 'service' | 'network'

export interface Note {
  note_id: number
  entity_type: NoteEntityType
  entity_id: number
  note_text: string
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface NoteCreate {
  entity_type: NoteEntityType
  entity_id: number
  note_text: string
  created_by?: string
}

export interface NoteUpdate {
  note_text: string
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
// GeoIP Types (v6 schema)
// =============================================================================

/**
 * IP type classification for network intelligence
 */
export type IpType = 'residential' | 'datacenter' | 'vpn' | 'proxy' | 'tor' | 'mobile' | 'unknown'

/**
 * GeoIP provider identifiers
 */
export type GeoIPProvider = 'maxmind' | 'ip2location' | 'ipinfo'

/**
 * GeoIP record matching uni_geoip table (v6 schema)
 * Stores geographic and network metadata at scan time for historical accuracy
 */
export interface GeoIPRecord {
  geoip_id: number
  host_ip: string
  scans_id: number

  // Geographic data
  country_code: string | null
  country_name: string | null
  region_code: string | null
  region_name: string | null
  city: string | null
  postal_code: string | null
  latitude: number | null
  longitude: number | null
  timezone: string | null

  // Network data (optional - requires paid databases)
  ip_type: IpType | null
  isp: string | null
  organization: string | null
  asn: number | null
  as_org: string | null

  // Metadata
  provider: GeoIPProvider
  database_version: string | null
  lookup_time: string  // ISO timestamp
  confidence: number | null  // 0-100
  extra_data: Record<string, unknown> | null
}

/**
 * Country statistics from v_geoip_stats view
 */
export interface GeoIPCountryStats {
  scans_id: number
  country_code: string | null
  country_name: string | null
  host_count: number
  unique_asns: number
  datacenter_count: number
  residential_count: number
  vpn_count: number
  proxy_count: number
  tor_count: number
  mobile_count: number
}

/**
 * Query options for GeoIP lookups
 */
export interface GeoIPQueryOptions {
  countryCode?: string
  ipType?: IpType
  asn?: number
  hasCoordinates?: boolean
  limit?: number
  offset?: number
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
  target_str: string | null  // Original command line target specification
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

// =============================================================================
// TTL Constants for OS Inference
// Common initial TTL values by operating system
// =============================================================================

export const COMMON_STARTING_TTLS = {
  LINUX_UNIX: 64,    // Linux, Unix, macOS, Android
  WINDOWS: 128,      // Windows (all modern versions)
  CISCO_ROUTER: 255, // Cisco IOS, many routers
  SOLARIS: 255,      // Solaris
} as const

export type OsFamily = 'linux' | 'windows' | 'router' | 'unknown'

/**
 * Infer OS family from observed TTL
 * Uses common starting TTL values to guess the original OS
 */
export function inferOsFromTtl(ttl: number): { osFamily: OsFamily; estimatedHops: number } {
  // Find the closest common starting TTL that's >= observed TTL
  if (ttl <= 64) {
    return { osFamily: 'linux', estimatedHops: 64 - ttl }
  }
  if (ttl <= 128) {
    return { osFamily: 'windows', estimatedHops: 128 - ttl }
  }
  if (ttl <= 255) {
    return { osFamily: 'router', estimatedHops: 255 - ttl }
  }
  return { osFamily: 'unknown', estimatedHops: 0 }
}

/**
 * Get color for OS family (for topology visualization)
 */
export function getOsFamilyColor(osFamily: OsFamily): string {
  switch (osFamily) {
    case 'linux': return '#22c55e'    // Green (Tux)
    case 'windows': return '#3b82f6'  // Blue (Windows blue)
    case 'router': return '#f59e0b'   // Amber (network infrastructure)
    case 'unknown': return '#6b7280'  // Gray
  }
}
