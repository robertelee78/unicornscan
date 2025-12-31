/**
 * Database client abstraction
 * Supports both Supabase (hosted) and direct PostgreSQL connections
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Scan, IpReport, Host, ScanSummary, HostSummary } from '@/types/database'

// =============================================================================
// Configuration
// =============================================================================

const DB_BACKEND = import.meta.env.VITE_DB_BACKEND || 'supabase'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const DATABASE_URL = import.meta.env.VITE_DATABASE_URL

// =============================================================================
// Supabase Client
// =============================================================================

let supabaseClient: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Supabase URL and Anon Key must be configured in .env')
    }
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return supabaseClient
}

// =============================================================================
// Database Interface
// =============================================================================

export interface DatabaseClient {
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
  recentScans: number // Last 24 hours
}

// =============================================================================
// Supabase Implementation
// =============================================================================

class SupabaseDatabase implements DatabaseClient {
  private client: SupabaseClient

  constructor() {
    this.client = getSupabaseClient()
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
      if (error.code === 'PGRST116') return null // Not found
      throw error
    }
    return data as Scan
  }

  async getScanSummaries(options?: { limit?: number }): Promise<ScanSummary[]> {
    // Use the view if available, otherwise aggregate manually
    const { data, error } = await this.client
      .from('uni_scans')
      .select(`
        scans_id,
        s_time,
        e_time,
        profile,
        target_str,
        mode_str
      `)
      .order('s_time', { ascending: false })
      .limit(options?.limit || 50)

    if (error) throw error

    // Get counts for each scan
    const summaries: ScanSummary[] = await Promise.all(
      (data || []).map(async (scan) => {
        const { count: portCount } = await this.client
          .from('uni_ipreport')
          .select('*', { count: 'exact', head: true })
          .eq('scans_id', scan.scans_id)

        // Count unique hosts
        const { data: hosts } = await this.client
          .from('uni_ipreport')
          .select('host_addr')
          .eq('scans_id', scan.scans_id)

        const uniqueHosts = new Set(hosts?.map(h => h.host_addr) || [])

        // Get tags
        const { data: tags } = await this.client
          .from('uni_scan_tags')
          .select('tag')
          .eq('scans_id', scan.scans_id)

        return {
          scans_id: scan.scans_id,
          s_time: scan.s_time,
          e_time: scan.e_time,
          profile: scan.profile,
          target_str: scan.target_str,
          mode_str: scan.mode_str,
          host_count: uniqueHosts.size,
          port_count: portCount || 0,
          open_count: 0, // TODO: Calculate from response type
          tags: tags?.map(t => t.tag) || [],
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
      open_ports: [], // TODO: Get from joins
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
// Factory
// =============================================================================

let dbClient: DatabaseClient | null = null

export function getDatabase(): DatabaseClient {
  if (!dbClient) {
    if (DB_BACKEND === 'postgres') {
      // For direct PostgreSQL, we'd need a different approach
      // (pg-promise, node-postgres via backend API, etc.)
      // For now, default to Supabase which can connect to any PostgreSQL
      console.warn(`Direct PostgreSQL (${DATABASE_URL}) not yet implemented, using Supabase client`)
    }
    dbClient = new SupabaseDatabase()
  }
  return dbClient
}

// =============================================================================
// React Hook
// =============================================================================

export function useDatabase(): DatabaseClient {
  return getDatabase()
}
