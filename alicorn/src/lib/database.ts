/**
 * Database client abstraction for Alicorn
 *
 * Supports multiple backends:
 * - Supabase (hosted or self-hosted)
 * - PostgREST (standalone, pointed at PostgreSQL)
 * - Demo mode (mock data for development)
 *
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Scan, IpReport, Host, ScanSummary, HostSummary } from '@/types/database'

// =============================================================================
// Configuration
// =============================================================================

export type DatabaseBackend = 'supabase' | 'postgrest' | 'demo'

export interface DatabaseConfig {
  backend: DatabaseBackend
  supabaseUrl?: string
  supabaseAnonKey?: string
  postgrestUrl?: string
  isConfigured: boolean
}

function getConfig(): DatabaseConfig {
  const backend = (import.meta.env.VITE_DB_BACKEND || 'demo') as DatabaseBackend
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const postgrestUrl = import.meta.env.VITE_POSTGREST_URL

  const isConfigured =
    backend === 'demo' ||
    (backend === 'supabase' && !!supabaseUrl && !!supabaseAnonKey) ||
    (backend === 'postgrest' && !!postgrestUrl)

  return {
    backend,
    supabaseUrl,
    supabaseAnonKey,
    postgrestUrl,
    isConfigured,
  }
}

export const config = getConfig()

// =============================================================================
// Database Interface
// =============================================================================

export interface DatabaseClient {
  readonly backend: DatabaseBackend

  // Health
  checkConnection(): Promise<boolean>

  // Scans
  getScans(options?: { limit?: number; offset?: number }): Promise<Scan[]>
  getScan(scansId: number): Promise<Scan | null>
  getScanSummaries(options?: { limit?: number }): Promise<ScanSummary[]>

  // IP Reports (ports/responses)
  getIpReports(scansId: number): Promise<IpReport[]>
  getIpReportsByHost(scansId: number, hostAddr: string): Promise<IpReport[]>

  // Hosts
  getHosts(options?: { limit?: number }): Promise<Host[]>
  getHost(hostId: number): Promise<Host | null>
  getHostByIp(ip: string): Promise<Host | null>
  getHostSummaries(scansId?: number): Promise<HostSummary[]>

  // Stats
  getStats(): Promise<DatabaseStats>
}

export interface DatabaseStats {
  totalScans: number
  totalHosts: number
  totalPorts: number
  recentScans: number
}

// =============================================================================
// Supabase/PostgREST Implementation
// =============================================================================

let supabaseClient: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    let url: string
    let key: string

    if (config.backend === 'postgrest') {
      if (!config.postgrestUrl) {
        throw new Error('PostgREST URL must be configured in .env')
      }
      url = config.postgrestUrl
      key = 'anon' // PostgREST doesn't need a real key for public tables
    } else {
      if (!config.supabaseUrl || !config.supabaseAnonKey) {
        throw new Error('Supabase URL and Anon Key must be configured in .env')
      }
      url = config.supabaseUrl
      key = config.supabaseAnonKey
    }

    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }
  return supabaseClient
}

class RestDatabase implements DatabaseClient {
  private client: SupabaseClient
  readonly backend: DatabaseBackend

  constructor(backend: 'supabase' | 'postgrest') {
    this.backend = backend
    this.client = getSupabaseClient()
  }

  async checkConnection(): Promise<boolean> {
    try {
      const { error } = await this.client.from('uni_scans').select('scans_id', { head: true })
      return !error
    } catch {
      return false
    }
  }

  async getScans(options?: { limit?: number; offset?: number }): Promise<Scan[]> {
    const query = this.client
      .from('uni_scans')
      .select('*')
      .order('s_time', { ascending: false })

    if (options?.limit) query.limit(options.limit)
    if (options?.offset) query.range(options.offset, options.offset + (options.limit || 50) - 1)

    const { data, error } = await query
    if (error) throw error
    return data as Scan[]
  }

  async getScan(scansId: number): Promise<Scan | null> {
    const { data, error } = await this.client
      .from('uni_scans')
      .select('*')
      .eq('scans_id', scansId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data as Scan
  }

  async getScanSummaries(options?: { limit?: number }): Promise<ScanSummary[]> {
    const { data, error } = await this.client
      .from('uni_scans')
      .select('scans_id, s_time, e_time, profile, target_str, mode_str')
      .order('s_time', { ascending: false })
      .limit(options?.limit || 50)

    if (error) throw error

    const summaries: ScanSummary[] = await Promise.all(
      (data || []).map(async (scan) => {
        const [portResult, hostsResult, tagsResult] = await Promise.all([
          this.client
            .from('uni_ipreport')
            .select('*', { count: 'exact', head: true })
            .eq('scans_id', scan.scans_id),
          this.client
            .from('uni_ipreport')
            .select('host_addr')
            .eq('scans_id', scan.scans_id),
          this.client
            .from('uni_scan_tags')
            .select('tag')
            .eq('scans_id', scan.scans_id),
        ])

        const uniqueHosts = new Set(hostsResult.data?.map((h) => h.host_addr) || [])

        return {
          scans_id: scan.scans_id,
          s_time: scan.s_time,
          e_time: scan.e_time,
          profile: scan.profile,
          target_str: scan.target_str,
          mode_str: scan.mode_str,
          host_count: uniqueHosts.size,
          port_count: portResult.count || 0,
          open_count: 0,
          tags: tagsResult.data?.map((t) => t.tag) || [],
        }
      })
    )

    return summaries
  }

  async getIpReports(scansId: number): Promise<IpReport[]> {
    const { data, error } = await this.client
      .from('uni_ipreport')
      .select('*')
      .eq('scans_id', scansId)
      .order('host_addr', { ascending: true })
      .order('dport', { ascending: true })

    if (error) throw error
    return data as IpReport[]
  }

  async getIpReportsByHost(scansId: number, hostAddr: string): Promise<IpReport[]> {
    const { data, error } = await this.client
      .from('uni_ipreport')
      .select('*')
      .eq('scans_id', scansId)
      .eq('host_addr', hostAddr)
      .order('dport', { ascending: true })

    if (error) throw error
    return data as IpReport[]
  }

  async getHosts(options?: { limit?: number }): Promise<Host[]> {
    const { data, error } = await this.client
      .from('uni_hosts')
      .select('*')
      .order('last_seen', { ascending: false })
      .limit(options?.limit || 100)

    if (error) throw error
    return data as Host[]
  }

  async getHost(hostId: number): Promise<Host | null> {
    const { data, error } = await this.client
      .from('uni_hosts')
      .select('*')
      .eq('host_id', hostId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data as Host
  }

  async getHostByIp(ip: string): Promise<Host | null> {
    const { data, error } = await this.client
      .from('uni_hosts')
      .select('*')
      .eq('ip_addr', ip)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data as Host
  }

  async getHostSummaries(_scansId?: number): Promise<HostSummary[]> {
    const { data, error } = await this.client
      .from('uni_hosts')
      .select('*')
      .order('last_seen', { ascending: false })
      .limit(100)

    if (error) throw error

    return (data || []).map((host) => ({
      host_id: host.host_id,
      ip_addr: host.ip_addr,
      hostname: host.hostname,
      os_guess: host.os_guess,
      open_ports: [],
      last_seen: host.last_seen,
      scan_count: host.scan_count,
    }))
  }

  async getStats(): Promise<DatabaseStats> {
    const now = Math.floor(Date.now() / 1000)
    const yesterday = now - 86400

    const [scansResult, hostsResult, portsResult, recentResult] = await Promise.all([
      this.client.from('uni_scans').select('*', { count: 'exact', head: true }),
      this.client.from('uni_hosts').select('*', { count: 'exact', head: true }),
      this.client.from('uni_ipreport').select('*', { count: 'exact', head: true }),
      this.client.from('uni_scans').select('*', { count: 'exact', head: true }).gte('s_time', yesterday),
    ])

    return {
      totalScans: scansResult.count || 0,
      totalHosts: hostsResult.count || 0,
      totalPorts: portsResult.count || 0,
      recentScans: recentResult.count || 0,
    }
  }
}

// =============================================================================
// Demo/Mock Implementation
// =============================================================================

class DemoDatabase implements DatabaseClient {
  readonly backend: DatabaseBackend = 'demo'

  private mockScans: Scan[] = [
    {
      scans_id: 1,
      s_time: Math.floor(Date.now() / 1000) - 3600,
      e_time: Math.floor(Date.now() / 1000) - 3500,
      est_e_time: 0,
      senders: 1,
      listeners: 1,
      scan_iter: 1,
      profile: 'default',
      options: 0,
      payload_group: 0,
      dronestr: 'local',
      covertness: 0,
      modules: '',
      user: 'demo',
      pcap_dumpfile: null,
      pcap_readfile: null,
      target_str: '192.168.1.0/24',
      port_str: '1-1024',
      pps: 1000,
      src_port: 0,
      mode: 'T',
      mode_str: 'TCP SYN',
      mode_flags: null,
      num_phases: 1,
      scan_metadata: null,
      scan_notes: 'Demo scan for development',
    },
    {
      scans_id: 2,
      s_time: Math.floor(Date.now() / 1000) - 86400,
      e_time: Math.floor(Date.now() / 1000) - 86300,
      est_e_time: 0,
      senders: 1,
      listeners: 1,
      scan_iter: 1,
      profile: 'default',
      options: 0,
      payload_group: 0,
      dronestr: 'local',
      covertness: 0,
      modules: '',
      user: 'demo',
      pcap_dumpfile: null,
      pcap_readfile: null,
      target_str: '10.0.0.0/24',
      port_str: 'quick',
      pps: 500,
      src_port: 0,
      mode: 'U',
      mode_str: 'UDP',
      mode_flags: null,
      num_phases: 1,
      scan_metadata: null,
      scan_notes: null,
    },
  ]

  private mockReports: IpReport[] = [
    {
      ipreport_id: 1,
      scans_id: 1,
      magic: 0x12345678,
      sport: 54321,
      dport: 22,
      proto: 6,  // TCP
      type: 1,
      subtype: 18,  // SYN+ACK
      send_addr: '192.168.1.100',
      host_addr: '192.168.1.1',
      trace_addr: '192.168.1.1',
      ttl: 64,
      tstamp: Math.floor(Date.now() / 1000) - 3550,
      utstamp: 0,
      flags: 0,
      mseq: 67890,
      tseq: 12345,
      window_size: 65535,
      t_tstamp: Math.floor(Date.now() / 1000) - 3550,
      m_tstamp: 0,
      extra_data: null,
    },
    {
      ipreport_id: 2,
      scans_id: 1,
      magic: 0x12345678,
      sport: 54322,
      dport: 80,
      proto: 6,  // TCP
      type: 1,
      subtype: 18,  // SYN+ACK
      send_addr: '192.168.1.100',
      host_addr: '192.168.1.1',
      trace_addr: '192.168.1.1',
      ttl: 64,
      tstamp: Math.floor(Date.now() / 1000) - 3549,
      utstamp: 0,
      flags: 0,
      mseq: 67891,
      tseq: 12346,
      window_size: 65535,
      t_tstamp: Math.floor(Date.now() / 1000) - 3549,
      m_tstamp: 0,
      extra_data: null,
    },
    {
      ipreport_id: 3,
      scans_id: 1,
      magic: 0x12345678,
      sport: 54323,
      dport: 443,
      proto: 6,  // TCP
      type: 1,
      subtype: 18,  // SYN+ACK
      send_addr: '192.168.1.100',
      host_addr: '192.168.1.1',
      trace_addr: '192.168.1.1',
      ttl: 64,
      tstamp: Math.floor(Date.now() / 1000) - 3548,
      utstamp: 0,
      flags: 0,
      mseq: 67892,
      tseq: 12347,
      window_size: 65535,
      t_tstamp: Math.floor(Date.now() / 1000) - 3548,
      m_tstamp: 0,
      extra_data: null,
    },
  ]

  async checkConnection(): Promise<boolean> {
    return true
  }

  async getScans(options?: { limit?: number; offset?: number }): Promise<Scan[]> {
    await this.simulateDelay()
    const start = options?.offset || 0
    const end = start + (options?.limit || 50)
    return this.mockScans.slice(start, end)
  }

  async getScan(scansId: number): Promise<Scan | null> {
    await this.simulateDelay()
    return this.mockScans.find((s) => s.scans_id === scansId) || null
  }

  async getScanSummaries(options?: { limit?: number }): Promise<ScanSummary[]> {
    await this.simulateDelay()
    return this.mockScans.slice(0, options?.limit || 50).map((scan) => ({
      scans_id: scan.scans_id,
      s_time: scan.s_time,
      e_time: scan.e_time,
      profile: scan.profile,
      target_str: scan.target_str,
      mode_str: scan.mode_str,
      host_count: scan.scans_id === 1 ? 1 : 0,
      port_count: scan.scans_id === 1 ? 3 : 0,
      open_count: scan.scans_id === 1 ? 3 : 0,
      tags: scan.scans_id === 1 ? ['demo', 'local'] : [],
    }))
  }

  async getIpReports(scansId: number): Promise<IpReport[]> {
    await this.simulateDelay()
    return this.mockReports.filter((r) => r.scans_id === scansId)
  }

  async getIpReportsByHost(scansId: number, hostAddr: string): Promise<IpReport[]> {
    await this.simulateDelay()
    return this.mockReports.filter((r) => r.scans_id === scansId && r.host_addr === hostAddr)
  }

  async getHosts(_options?: { limit?: number }): Promise<Host[]> {
    await this.simulateDelay()
    return [
      {
        host_id: 1,
        ip_addr: '192.168.1.1',
        mac_addr: '00:11:22:33:44:55',
        hostname: 'router.local',
        os_guess: 'Linux 5.x',
        first_seen: Math.floor(Date.now() / 1000) - 86400,
        last_seen: Math.floor(Date.now() / 1000) - 3550,
        scan_count: 2,
        open_port_count: 3,
        metadata: null,
      },
    ]
  }

  async getHost(hostId: number): Promise<Host | null> {
    await this.simulateDelay()
    if (hostId === 1) {
      return {
        host_id: 1,
        ip_addr: '192.168.1.1',
        mac_addr: '00:11:22:33:44:55',
        hostname: 'router.local',
        os_guess: 'Linux 5.x',
        first_seen: Math.floor(Date.now() / 1000) - 86400,
        last_seen: Math.floor(Date.now() / 1000) - 3550,
        scan_count: 2,
        open_port_count: 3,
        metadata: null,
      }
    }
    return null
  }

  async getHostByIp(ip: string): Promise<Host | null> {
    await this.simulateDelay()
    if (ip === '192.168.1.1') {
      return this.getHost(1)
    }
    return null
  }

  async getHostSummaries(_scansId?: number): Promise<HostSummary[]> {
    await this.simulateDelay()
    return [
      {
        host_id: 1,
        ip_addr: '192.168.1.1',
        hostname: 'router.local',
        os_guess: 'Linux 5.x',
        open_ports: [22, 80, 443],
        last_seen: Math.floor(Date.now() / 1000) - 3550,
        scan_count: 2,
      },
    ]
  }

  async getStats(): Promise<DatabaseStats> {
    await this.simulateDelay()
    return {
      totalScans: 2,
      totalHosts: 1,
      totalPorts: 3,
      recentScans: 1,
    }
  }

  private simulateDelay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200))
  }
}

// =============================================================================
// Factory
// =============================================================================

let dbClient: DatabaseClient | null = null

export function getDatabase(): DatabaseClient {
  if (!dbClient) {
    switch (config.backend) {
      case 'supabase':
        dbClient = new RestDatabase('supabase')
        break
      case 'postgrest':
        dbClient = new RestDatabase('postgrest')
        break
      case 'demo':
      default:
        dbClient = new DemoDatabase()
        break
    }
  }
  return dbClient
}

export function resetDatabase(): void {
  dbClient = null
  supabaseClient = null
}

// =============================================================================
// React Hook
// =============================================================================

export function useDatabase(): DatabaseClient {
  return getDatabase()
}
