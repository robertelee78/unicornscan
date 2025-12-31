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
import type { Scan, IpReport, ArpReport, Host, Hop, ScanSummary, HostSummary, Note, GeoIPRecord, GeoIPCountryStats, GeoIPQueryOptions } from '@/types/database'
import type {
  DashboardStats,
  PortCount,
  ScanTimelinePoint,
} from '@/features/dashboard/types'

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
// Filtered Scans Types
// =============================================================================

export interface FilteredScansOptions {
  search?: string
  dateFrom?: number | null
  dateTo?: number | null
  profiles?: string[]
  modes?: string[]
  sortField?: 'scans_id' | 's_time' | 'profile' | 'target_str'
  sortDirection?: 'asc' | 'desc'
  offset?: number
  limit?: number
}

export interface FilteredScansResult {
  data: ScanSummary[]
  total: number
}

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
  getFilteredScans(options: FilteredScansOptions): Promise<FilteredScansResult>

  // IP Reports (ports/responses)
  getIpReports(scansId: number): Promise<IpReport[]>
  getIpReportsByHost(scansId: number, hostAddr: string): Promise<IpReport[]>

  // ARP Reports
  getArpReports(scansId: number): Promise<ArpReport[]>

  // Notes
  getNotes(entityType: 'scan' | 'host' | 'port' | 'service', entityId: number): Promise<Note[]>

  // Hosts
  getHosts(options?: { limit?: number }): Promise<Host[]>
  getHost(hostId: number): Promise<Host | null>
  getHostByIp(ip: string): Promise<Host | null>
  getHostSummaries(scansId?: number): Promise<HostSummary[]>

  // Dashboard (time-filtered)
  getDashboardStats(options: { since: number | null }): Promise<DashboardStats>
  getTopPorts(options: { limit: number; since: number | null }): Promise<PortCount[]>
  getScanTimeline(options: { since: number | null }): Promise<ScanTimelinePoint[]>
  getRecentScans(options: { limit: number; since: number | null }): Promise<ScanSummary[]>

  // Topology (network graph)
  getHops(scansId: number): Promise<Hop[]>
  getHopsForHosts(hostAddrs: string[]): Promise<Hop[]>

  // GeoIP (v6 schema)
  getGeoIPByHost(hostIp: string, scansId?: number): Promise<GeoIPRecord | null>
  getGeoIPHistory(hostIp: string): Promise<GeoIPRecord[]>
  getGeoIPByScan(scansId: number, options?: GeoIPQueryOptions): Promise<GeoIPRecord[]>
  getGeoIPCountryStats(scansId: number): Promise<GeoIPCountryStats[]>
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

  async getFilteredScans(options: FilteredScansOptions): Promise<FilteredScansResult> {
    const {
      search,
      dateFrom,
      dateTo,
      profiles,
      modes,
      sortField = 's_time',
      sortDirection = 'desc',
      offset = 0,
      limit = 25,
    } = options

    // Build the base query for data
    let query = this.client
      .from('uni_scans')
      .select('scans_id, s_time, e_time, profile, target_str, mode_str')

    // Build count query with same filters
    let countQuery = this.client
      .from('uni_scans')
      .select('*', { count: 'exact', head: true })

    // Apply filters to both queries
    if (search) {
      query = query.ilike('target_str', `%${search}%`)
      countQuery = countQuery.ilike('target_str', `%${search}%`)
    }

    if (dateFrom !== null && dateFrom !== undefined) {
      query = query.gte('s_time', dateFrom)
      countQuery = countQuery.gte('s_time', dateFrom)
    }

    if (dateTo !== null && dateTo !== undefined) {
      query = query.lte('s_time', dateTo)
      countQuery = countQuery.lte('s_time', dateTo)
    }

    if (profiles && profiles.length > 0) {
      query = query.in('profile', profiles)
      countQuery = countQuery.in('profile', profiles)
    }

    if (modes && modes.length > 0) {
      query = query.in('mode_str', modes)
      countQuery = countQuery.in('mode_str', modes)
    }

    // Apply sorting
    query = query.order(sortField, { ascending: sortDirection === 'asc' })

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    // Execute both queries
    const [dataResult, countResult] = await Promise.all([query, countQuery])

    if (dataResult.error) throw dataResult.error
    if (countResult.error) throw countResult.error

    // Fetch additional data for each scan (host_count, port_count, tags)
    const summaries: ScanSummary[] = await Promise.all(
      (dataResult.data || []).map(async (scan) => {
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

    return {
      data: summaries,
      total: countResult.count || 0,
    }
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

  async getArpReports(scansId: number): Promise<ArpReport[]> {
    const { data, error } = await this.client
      .from('uni_arpreport')
      .select('*')
      .eq('scans_id', scansId)
      .order('host_addr', { ascending: true })

    if (error) throw error
    return data as ArpReport[]
  }

  async getNotes(entityType: 'scan' | 'host' | 'port' | 'service', entityId: number): Promise<Note[]> {
    const { data, error } = await this.client
      .from('uni_notes')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })

    if (error) {
      // Table might not exist yet - return empty array
      if (error.code === 'PGRST116' || error.code === '42P01') return []
      throw error
    }
    return data as Note[]
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

  async getDashboardStats(options: { since: number | null }): Promise<DashboardStats> {
    const { since } = options

    // Build queries with optional time filter
    const scansQuery = this.client.from('uni_scans').select('*', { count: 'exact', head: true })
    const hostsQuery = this.client.from('uni_hosts').select('*', { count: 'exact', head: true })
    const responsesQuery = this.client.from('uni_ipreport').select('*', { count: 'exact', head: true })
    const portsQuery = this.client.from('uni_ipreport').select('dport')

    if (since !== null) {
      scansQuery.gte('s_time', since)
      hostsQuery.gte('last_seen', since)
      responsesQuery.gte('tstamp', since)
      portsQuery.gte('tstamp', since)
    }

    const [scansResult, hostsResult, responsesResult, portsResult] = await Promise.all([
      scansQuery,
      hostsQuery,
      responsesQuery,
      portsQuery,
    ])

    // Count unique ports
    const uniquePorts = new Set(portsResult.data?.map((r) => r.dport) || [])

    return {
      totalScans: scansResult.count || 0,
      totalHosts: hostsResult.count || 0,
      totalResponses: responsesResult.count || 0,
      uniquePorts: uniquePorts.size,
    }
  }

  async getTopPorts(options: { limit: number; since: number | null }): Promise<PortCount[]> {
    const { limit, since } = options

    // Get all port reports, then aggregate in JS (PostgREST doesn't support GROUP BY)
    const query = this.client.from('uni_ipreport').select('dport, proto')

    if (since !== null) {
      query.gte('tstamp', since)
    }

    const { data, error } = await query
    if (error) throw error

    // Aggregate counts by port and protocol
    const portCounts = new Map<string, { port: number; protocol: 'tcp' | 'udp'; count: number }>()
    for (const row of data || []) {
      const proto = row.proto === 6 ? 'tcp' : row.proto === 17 ? 'udp' : 'tcp'
      const key = `${proto}-${row.dport}`
      const existing = portCounts.get(key)
      if (existing) {
        existing.count++
      } else {
        portCounts.set(key, { port: row.dport, protocol: proto, count: 1 })
      }
    }

    // Sort by count descending and take top N
    return Array.from(portCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  }

  async getScanTimeline(options: { since: number | null }): Promise<ScanTimelinePoint[]> {
    const { since } = options

    // Get scans within time range
    const scansQuery = this.client.from('uni_scans').select('scans_id, s_time')
    const reportsQuery = this.client.from('uni_ipreport').select('scans_id, tstamp')

    if (since !== null) {
      scansQuery.gte('s_time', since)
      reportsQuery.gte('tstamp', since)
    }

    const [scansResult, reportsResult] = await Promise.all([scansQuery, reportsQuery])

    if (scansResult.error) throw scansResult.error
    if (reportsResult.error) throw reportsResult.error

    // Aggregate by day
    const dayMap = new Map<string, { scans: number; responses: number; timestamp: number }>()

    for (const scan of scansResult.data || []) {
      const date = new Date(scan.s_time * 1000)
      const dateStr = date.toISOString().split('T')[0]
      const dayStart = new Date(dateStr).getTime() / 1000
      const existing = dayMap.get(dateStr)
      if (existing) {
        existing.scans++
      } else {
        dayMap.set(dateStr, { scans: 1, responses: 0, timestamp: dayStart })
      }
    }

    for (const report of reportsResult.data || []) {
      const date = new Date(report.tstamp * 1000)
      const dateStr = date.toISOString().split('T')[0]
      const dayStart = new Date(dateStr).getTime() / 1000
      const existing = dayMap.get(dateStr)
      if (existing) {
        existing.responses++
      } else {
        dayMap.set(dateStr, { scans: 0, responses: 1, timestamp: dayStart })
      }
    }

    // Convert to array and sort by date
    return Array.from(dayMap.entries())
      .map(([date, data]) => ({
        date,
        timestamp: data.timestamp,
        scans: data.scans,
        responses: data.responses,
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  async getRecentScans(options: { limit: number; since: number | null }): Promise<ScanSummary[]> {
    const { limit, since } = options

    const query = this.client
      .from('uni_scans')
      .select('scans_id, s_time, e_time, profile, target_str, mode_str')
      .order('s_time', { ascending: false })
      .limit(limit)

    if (since !== null) {
      query.gte('s_time', since)
    }

    const { data, error } = await query
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

  async getHops(scansId: number): Promise<Hop[]> {
    const { data, error } = await this.client
      .from('uni_hops')
      .select('*')
      .eq('scans_id', scansId)
      .order('target_addr', { ascending: true })

    if (error) {
      // Table might not exist yet - return empty array
      if (error.code === 'PGRST116' || error.code === '42P01') return []
      throw error
    }
    return data as Hop[]
  }

  async getHopsForHosts(hostAddrs: string[]): Promise<Hop[]> {
    if (hostAddrs.length === 0) return []

    const { data, error } = await this.client
      .from('uni_hops')
      .select('*')
      .in('target_addr', hostAddrs)
      .order('target_addr', { ascending: true })

    if (error) {
      if (error.code === 'PGRST116' || error.code === '42P01') return []
      throw error
    }
    return data as Hop[]
  }

  // ===========================================================================
  // GeoIP Methods (v6 schema)
  // ===========================================================================

  async getGeoIPByHost(hostIp: string, scansId?: number): Promise<GeoIPRecord | null> {
    let query = this.client
      .from('uni_geoip')
      .select('*')
      .eq('host_ip', hostIp)
      .order('lookup_time', { ascending: false })
      .limit(1)

    if (scansId !== undefined) {
      query = query.eq('scans_id', scansId)
    }

    const { data, error } = await query

    if (error) {
      // Table might not exist yet (v5 database)
      if (error.code === 'PGRST116' || error.code === '42P01') return null
      throw error
    }
    return data && data.length > 0 ? (data[0] as GeoIPRecord) : null
  }

  async getGeoIPHistory(hostIp: string): Promise<GeoIPRecord[]> {
    const { data, error } = await this.client
      .from('uni_geoip')
      .select('*')
      .eq('host_ip', hostIp)
      .order('lookup_time', { ascending: false })

    if (error) {
      if (error.code === 'PGRST116' || error.code === '42P01') return []
      throw error
    }
    return data as GeoIPRecord[]
  }

  async getGeoIPByScan(scansId: number, options?: GeoIPQueryOptions): Promise<GeoIPRecord[]> {
    let query = this.client
      .from('uni_geoip')
      .select('*')
      .eq('scans_id', scansId)

    // Apply filters
    if (options?.countryCode) {
      query = query.eq('country_code', options.countryCode)
    }
    if (options?.ipType) {
      query = query.eq('ip_type', options.ipType)
    }
    if (options?.asn) {
      query = query.eq('asn', options.asn)
    }
    if (options?.hasCoordinates) {
      query = query.not('latitude', 'is', null).not('longitude', 'is', null)
    }

    // Apply pagination
    if (options?.limit) {
      query = query.limit(options.limit)
    }
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 100) - 1)
    }

    query = query.order('host_ip', { ascending: true })

    const { data, error } = await query

    if (error) {
      if (error.code === 'PGRST116' || error.code === '42P01') return []
      throw error
    }
    return data as GeoIPRecord[]
  }

  async getGeoIPCountryStats(scansId: number): Promise<GeoIPCountryStats[]> {
    // Use the v_geoip_stats view if available, otherwise aggregate manually
    const { data, error } = await this.client
      .from('v_geoip_stats')
      .select('*')
      .eq('scans_id', scansId)
      .order('host_count', { ascending: false })

    if (error) {
      // View might not exist - fall back to manual aggregation
      if (error.code === 'PGRST116' || error.code === '42P01') {
        // Get raw GeoIP records and aggregate in JS
        const records = await this.getGeoIPByScan(scansId)
        return this.aggregateCountryStats(scansId, records)
      }
      throw error
    }
    return data as GeoIPCountryStats[]
  }

  private aggregateCountryStats(scansId: number, records: GeoIPRecord[]): GeoIPCountryStats[] {
    const countryMap = new Map<string, GeoIPCountryStats>()

    for (const r of records) {
      const key = r.country_code || 'XX'  // XX for unknown
      const existing = countryMap.get(key)

      if (existing) {
        existing.host_count++
        if (r.asn) existing.unique_asns++  // Simplified - doesn't track unique
        if (r.ip_type === 'datacenter') existing.datacenter_count++
        if (r.ip_type === 'residential') existing.residential_count++
        if (r.ip_type === 'vpn') existing.vpn_count++
        if (r.ip_type === 'proxy') existing.proxy_count++
        if (r.ip_type === 'tor') existing.tor_count++
        if (r.ip_type === 'mobile') existing.mobile_count++
      } else {
        countryMap.set(key, {
          scans_id: scansId,
          country_code: r.country_code,
          country_name: r.country_name,
          host_count: 1,
          unique_asns: r.asn ? 1 : 0,
          datacenter_count: r.ip_type === 'datacenter' ? 1 : 0,
          residential_count: r.ip_type === 'residential' ? 1 : 0,
          vpn_count: r.ip_type === 'vpn' ? 1 : 0,
          proxy_count: r.ip_type === 'proxy' ? 1 : 0,
          tor_count: r.ip_type === 'tor' ? 1 : 0,
          mobile_count: r.ip_type === 'mobile' ? 1 : 0,
        })
      }
    }

    return Array.from(countryMap.values())
      .sort((a, b) => b.host_count - a.host_count)
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

  async getFilteredScans(options: FilteredScansOptions): Promise<FilteredScansResult> {
    await this.simulateDelay()

    const {
      search,
      dateFrom,
      dateTo,
      profiles,
      modes,
      sortField = 's_time',
      sortDirection = 'desc',
      offset = 0,
      limit = 25,
    } = options

    let filtered = [...this.mockScans]

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter((s) => s.target_str.toLowerCase().includes(searchLower))
    }

    // Apply date filters
    if (dateFrom !== null && dateFrom !== undefined) {
      filtered = filtered.filter((s) => s.s_time >= dateFrom)
    }
    if (dateTo !== null && dateTo !== undefined) {
      filtered = filtered.filter((s) => s.s_time <= dateTo)
    }

    // Apply profile filter
    if (profiles && profiles.length > 0) {
      filtered = filtered.filter((s) => profiles.includes(s.profile))
    }

    // Apply mode filter
    if (modes && modes.length > 0) {
      filtered = filtered.filter((s) => modes.includes(s.mode_str || ''))
    }

    const total = filtered.length

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: string | number
      let bVal: string | number

      switch (sortField) {
        case 'scans_id':
          aVal = a.scans_id
          bVal = b.scans_id
          break
        case 'profile':
          aVal = a.profile
          bVal = b.profile
          break
        case 'target_str':
          aVal = a.target_str
          bVal = b.target_str
          break
        case 's_time':
        default:
          aVal = a.s_time
          bVal = b.s_time
      }

      if (typeof aVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal)
      }
      return sortDirection === 'asc' ? aVal - (bVal as number) : (bVal as number) - aVal
    })

    // Apply pagination
    const paged = filtered.slice(offset, offset + limit)

    // Convert to summaries
    const data: ScanSummary[] = paged.map((scan) => {
      const scanReports = this.mockReports.filter((r) => r.scans_id === scan.scans_id)
      const uniqueHosts = new Set(scanReports.map((r) => r.host_addr))
      return {
        scans_id: scan.scans_id,
        s_time: scan.s_time,
        e_time: scan.e_time,
        profile: scan.profile,
        target_str: scan.target_str,
        mode_str: scan.mode_str,
        host_count: uniqueHosts.size,
        port_count: scanReports.length,
        open_count: scanReports.length,
        tags: scan.scans_id === 1 ? ['demo', 'local'] : [],
      }
    })

    return { data, total }
  }

  async getIpReports(scansId: number): Promise<IpReport[]> {
    await this.simulateDelay()
    return this.mockReports.filter((r) => r.scans_id === scansId)
  }

  async getIpReportsByHost(scansId: number, hostAddr: string): Promise<IpReport[]> {
    await this.simulateDelay()
    return this.mockReports.filter((r) => r.scans_id === scansId && r.host_addr === hostAddr)
  }

  async getArpReports(scansId: number): Promise<ArpReport[]> {
    await this.simulateDelay()
    // Demo ARP reports for local network scan demo
    if (scansId === 1) {
      return [
        {
          arpreport_id: 1,
          scans_id: 1,
          magic: 0x12345678,
          host_addr: '192.168.1.1',
          hwaddr: '00:11:22:33:44:55',
          tstamp: Math.floor(Date.now() / 1000) - 3550,
          utstamp: 0,
          extra_data: null,
        },
        {
          arpreport_id: 2,
          scans_id: 1,
          magic: 0x12345678,
          host_addr: '192.168.1.100',
          hwaddr: 'AA:BB:CC:DD:EE:FF',
          tstamp: Math.floor(Date.now() / 1000) - 3545,
          utstamp: 0,
          extra_data: null,
        },
      ]
    }
    return []
  }

  async getNotes(_entityType: 'scan' | 'host' | 'port' | 'service', _entityId: number): Promise<Note[]> {
    await this.simulateDelay()
    // Demo notes - empty for now
    return []
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

  async getDashboardStats(options: { since: number | null }): Promise<DashboardStats> {
    await this.simulateDelay()
    const { since } = options

    // Filter scans by time if specified
    const filteredScans = since
      ? this.mockScans.filter((s) => s.s_time >= since)
      : this.mockScans

    const filteredReports = since
      ? this.mockReports.filter((r) => r.tstamp >= since)
      : this.mockReports

    const uniquePorts = new Set(filteredReports.map((r) => r.dport))
    const uniqueHosts = new Set(filteredReports.map((r) => r.host_addr))

    return {
      totalScans: filteredScans.length,
      totalHosts: uniqueHosts.size,
      totalResponses: filteredReports.length,
      uniquePorts: uniquePorts.size,
    }
  }

  async getTopPorts(options: { limit: number; since: number | null }): Promise<PortCount[]> {
    await this.simulateDelay()
    const { limit, since } = options

    const filteredReports = since
      ? this.mockReports.filter((r) => r.tstamp >= since)
      : this.mockReports

    // Count ports
    const portCounts = new Map<string, PortCount>()
    for (const report of filteredReports) {
      const proto = report.proto === 6 ? 'tcp' : report.proto === 17 ? 'udp' : 'tcp'
      const key = `${proto}-${report.dport}`
      const existing = portCounts.get(key)
      if (existing) {
        existing.count++
      } else {
        portCounts.set(key, { port: report.dport, protocol: proto, count: 1 })
      }
    }

    return Array.from(portCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  }

  async getScanTimeline(options: { since: number | null }): Promise<ScanTimelinePoint[]> {
    await this.simulateDelay()
    const { since } = options

    const filteredScans = since
      ? this.mockScans.filter((s) => s.s_time >= since)
      : this.mockScans

    const filteredReports = since
      ? this.mockReports.filter((r) => r.tstamp >= since)
      : this.mockReports

    // Aggregate by day
    const dayMap = new Map<string, { scans: number; responses: number; timestamp: number }>()

    for (const scan of filteredScans) {
      const date = new Date(scan.s_time * 1000)
      const dateStr = date.toISOString().split('T')[0]
      const dayStart = new Date(dateStr).getTime() / 1000
      const existing = dayMap.get(dateStr)
      if (existing) {
        existing.scans++
      } else {
        dayMap.set(dateStr, { scans: 1, responses: 0, timestamp: dayStart })
      }
    }

    for (const report of filteredReports) {
      const date = new Date(report.tstamp * 1000)
      const dateStr = date.toISOString().split('T')[0]
      const dayStart = new Date(dateStr).getTime() / 1000
      const existing = dayMap.get(dateStr)
      if (existing) {
        existing.responses++
      } else {
        dayMap.set(dateStr, { scans: 0, responses: 1, timestamp: dayStart })
      }
    }

    return Array.from(dayMap.entries())
      .map(([date, data]) => ({
        date,
        timestamp: data.timestamp,
        scans: data.scans,
        responses: data.responses,
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  async getRecentScans(options: { limit: number; since: number | null }): Promise<ScanSummary[]> {
    await this.simulateDelay()
    const { limit, since } = options

    const filteredScans = since
      ? this.mockScans.filter((s) => s.s_time >= since)
      : this.mockScans

    return filteredScans
      .slice(0, limit)
      .map((scan) => {
        const scanReports = this.mockReports.filter((r) => r.scans_id === scan.scans_id)
        const uniqueHosts = new Set(scanReports.map((r) => r.host_addr))
        return {
          scans_id: scan.scans_id,
          s_time: scan.s_time,
          e_time: scan.e_time,
          profile: scan.profile,
          target_str: scan.target_str,
          mode_str: scan.mode_str,
          host_count: uniqueHosts.size,
          port_count: scanReports.length,
          open_count: scanReports.length,
          tags: scan.scans_id === 1 ? ['demo', 'local'] : [],
        }
      })
  }

  async getHops(_scansId: number): Promise<Hop[]> {
    await this.simulateDelay()
    // Demo hop data - simulating an intermediate router discovery
    // In real scans, this happens when trace_addr != host_addr
    return [
      {
        hop_id: 1,
        ipreport_id: 1,
        scans_id: 1,
        target_addr: '192.168.1.1',
        hop_addr: '10.0.0.1',  // Gateway router responded
        hop_number: 1,
        ttl_observed: 63,
        rtt_us: 1500,
        extra_data: null,
      },
    ]
  }

  async getHopsForHosts(_hostAddrs: string[]): Promise<Hop[]> {
    await this.simulateDelay()
    return []
  }

  // ===========================================================================
  // GeoIP Methods (v6 schema) - Demo data
  // ===========================================================================

  private mockGeoIP: GeoIPRecord[] = [
    {
      geoip_id: 1,
      host_ip: '192.168.1.1',
      scans_id: 1,
      country_code: 'US',
      country_name: 'United States',
      region_code: 'CA',
      region_name: 'California',
      city: 'San Francisco',
      postal_code: '94102',
      latitude: 37.7749,
      longitude: -122.4194,
      timezone: 'America/Los_Angeles',
      ip_type: 'datacenter',
      isp: 'Demo ISP',
      organization: 'Demo Datacenter',
      asn: 13335,
      as_org: 'Cloudflare Inc',
      provider: 'maxmind',
      database_version: 'GeoLite2-City-Demo',
      lookup_time: new Date().toISOString(),
      confidence: 85,
      extra_data: null,
    },
    {
      geoip_id: 2,
      host_ip: '8.8.8.8',
      scans_id: 1,
      country_code: 'US',
      country_name: 'United States',
      region_code: 'CA',
      region_name: 'California',
      city: 'Mountain View',
      postal_code: '94043',
      latitude: 37.4056,
      longitude: -122.0775,
      timezone: 'America/Los_Angeles',
      ip_type: 'datacenter',
      isp: 'Google LLC',
      organization: 'Google LLC',
      asn: 15169,
      as_org: 'Google LLC',
      provider: 'maxmind',
      database_version: 'GeoLite2-City-Demo',
      lookup_time: new Date().toISOString(),
      confidence: 95,
      extra_data: null,
    },
    {
      geoip_id: 3,
      host_ip: '1.1.1.1',
      scans_id: 1,
      country_code: 'AU',
      country_name: 'Australia',
      region_code: 'NSW',
      region_name: 'New South Wales',
      city: 'Sydney',
      postal_code: '2000',
      latitude: -33.8688,
      longitude: 151.2093,
      timezone: 'Australia/Sydney',
      ip_type: 'datacenter',
      isp: 'Cloudflare',
      organization: 'APNIC Research',
      asn: 13335,
      as_org: 'Cloudflare Inc',
      provider: 'maxmind',
      database_version: 'GeoLite2-City-Demo',
      lookup_time: new Date().toISOString(),
      confidence: 90,
      extra_data: null,
    },
  ]

  async getGeoIPByHost(hostIp: string, scansId?: number): Promise<GeoIPRecord | null> {
    await this.simulateDelay()
    let records = this.mockGeoIP.filter((r) => r.host_ip === hostIp)
    if (scansId !== undefined) {
      records = records.filter((r) => r.scans_id === scansId)
    }
    return records.length > 0 ? records[0] : null
  }

  async getGeoIPHistory(hostIp: string): Promise<GeoIPRecord[]> {
    await this.simulateDelay()
    return this.mockGeoIP.filter((r) => r.host_ip === hostIp)
  }

  async getGeoIPByScan(scansId: number, options?: GeoIPQueryOptions): Promise<GeoIPRecord[]> {
    await this.simulateDelay()
    let records = this.mockGeoIP.filter((r) => r.scans_id === scansId)

    if (options?.countryCode) {
      records = records.filter((r) => r.country_code === options.countryCode)
    }
    if (options?.ipType) {
      records = records.filter((r) => r.ip_type === options.ipType)
    }
    if (options?.asn) {
      records = records.filter((r) => r.asn === options.asn)
    }
    if (options?.hasCoordinates) {
      records = records.filter((r) => r.latitude !== null && r.longitude !== null)
    }

    const offset = options?.offset || 0
    const limit = options?.limit || 100
    return records.slice(offset, offset + limit)
  }

  async getGeoIPCountryStats(scansId: number): Promise<GeoIPCountryStats[]> {
    await this.simulateDelay()
    const records = this.mockGeoIP.filter((r) => r.scans_id === scansId)

    // Aggregate by country
    const countryMap = new Map<string, GeoIPCountryStats>()
    for (const r of records) {
      const key = r.country_code || 'XX'
      const existing = countryMap.get(key)

      if (existing) {
        existing.host_count++
      } else {
        countryMap.set(key, {
          scans_id: scansId,
          country_code: r.country_code,
          country_name: r.country_name,
          host_count: 1,
          unique_asns: 1,
          datacenter_count: r.ip_type === 'datacenter' ? 1 : 0,
          residential_count: r.ip_type === 'residential' ? 1 : 0,
          vpn_count: r.ip_type === 'vpn' ? 1 : 0,
          proxy_count: r.ip_type === 'proxy' ? 1 : 0,
          tor_count: r.ip_type === 'tor' ? 1 : 0,
          mobile_count: r.ip_type === 'mobile' ? 1 : 0,
        })
      }
    }

    return Array.from(countryMap.values())
      .sort((a, b) => b.host_count - a.host_count)
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
