/**
 * Database client abstraction for Alicorn
 *
 * PostgREST client for PostgreSQL access.
 *
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { PostgrestClient } from '@supabase/postgrest-js'
import type { Scan, IpReport, ArpReport, Host, Hop, ScanSummary, HostSummary, Note, NoteEntityType, NoteCreate, NoteUpdate, GeoIPRecord, GeoIPCountryStats, GeoIPQueryOptions } from '@/types/database'
import type { ScanDeleteStats, DeleteScanResult } from '@/features/deletion/types'
import type {
  DashboardStats,
  PortCount,
  ScanTimelinePoint,
} from '@/features/dashboard/types'
import type { SavedFilter, SavedFilterCreate, SavedFilterUpdate, SavedFilterType } from '@/features/scans/types'

// =============================================================================
// Configuration
// =============================================================================

export interface DatabaseConfig {
  postgrestUrl: string
  isConfigured: boolean
}

function getConfig(): DatabaseConfig {
  const postgrestUrl = import.meta.env.VITE_POSTGREST_URL || 'http://localhost:3000'

  return {
    postgrestUrl,
    isConfigured: !!postgrestUrl,
  }
}

export const config = getConfig()

// =============================================================================
// Filtered Scans Types
// =============================================================================

export interface FilteredScansOptions {
  search?: string
  notesSearch?: string
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
  getNotes(entityType: NoteEntityType, entityId: number): Promise<Note[]>
  getAllNotes(options?: { limit?: number; offset?: number; search?: string }): Promise<{ data: Note[]; total: number }>
  createNote(note: NoteCreate): Promise<Note>
  updateNote(noteId: number, updates: NoteUpdate): Promise<Note | null>
  deleteNote(noteId: number): Promise<boolean>

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

  // Deletion
  getScanDeleteStats(scansId: number): Promise<ScanDeleteStats | null>
  deleteScan(scansId: number): Promise<DeleteScanResult>

  // Saved Filters
  getSavedFilters(filterType?: SavedFilterType): Promise<SavedFilter[]>
  getSavedFilter(filterId: number): Promise<SavedFilter | null>
  createSavedFilter(filter: SavedFilterCreate): Promise<SavedFilter>
  updateSavedFilter(filterId: number, updates: SavedFilterUpdate): Promise<SavedFilter | null>
  deleteSavedFilter(filterId: number): Promise<boolean>
}

// =============================================================================
// PostgREST Implementation
// =============================================================================

let postgrestClient: PostgrestClient | null = null

function getPostgrestClient(): PostgrestClient {
  if (!postgrestClient) {
    if (!config.postgrestUrl) {
      throw new Error('PostgREST URL must be configured in .env')
    }
    postgrestClient = new PostgrestClient(config.postgrestUrl)
  }
  return postgrestClient
}

class RestDatabase implements DatabaseClient {
  private client: PostgrestClient

  constructor() {
    this.client = getPostgrestClient()
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
            .select('tag_name')
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
          tags: tagsResult.data?.map((t) => t.tag_name) || [],
        }
      })
    )

    return summaries
  }

  async getFilteredScans(options: FilteredScansOptions): Promise<FilteredScansResult> {
    const {
      search,
      notesSearch,
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
      .select('scans_id, s_time, e_time, profile, target_str, mode_str, scan_notes')

    // Build count query with same filters
    let countQuery = this.client
      .from('uni_scans')
      .select('*', { count: 'exact', head: true })

    // Apply filters to both queries
    if (search) {
      query = query.ilike('target_str', `%${search}%`)
      countQuery = countQuery.ilike('target_str', `%${search}%`)
    }

    // Notes search - search the scan_notes column
    if (notesSearch) {
      query = query.ilike('scan_notes', `%${notesSearch}%`)
      countQuery = countQuery.ilike('scan_notes', `%${notesSearch}%`)
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
            .select('tag_name')
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
          tags: tagsResult.data?.map((t) => t.tag_name) || [],
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

  async getNotes(entityType: NoteEntityType, entityId: number): Promise<Note[]> {
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

  async getAllNotes(options?: { limit?: number; offset?: number; search?: string }): Promise<{ data: Note[]; total: number }> {
    const { limit = 50, offset = 0, search } = options || {}

    let query = this.client
      .from('uni_notes')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (search) {
      query = query.ilike('note_text', `%${search}%`)
    }

    const { data, count, error } = await query

    if (error) {
      if (error.code === 'PGRST116' || error.code === '42P01') {
        return { data: [], total: 0 }
      }
      throw error
    }

    return {
      data: data as Note[],
      total: count || 0,
    }
  }

  async createNote(note: NoteCreate): Promise<Note> {
    const { data, error } = await this.client
      .from('uni_notes')
      .insert({
        entity_type: note.entity_type,
        entity_id: note.entity_id,
        note_text: note.note_text,
        created_by: note.created_by || null,
      })
      .select()
      .single()

    if (error) throw error
    return data as Note
  }

  async updateNote(noteId: number, updates: NoteUpdate): Promise<Note | null> {
    const { data, error } = await this.client
      .from('uni_notes')
      .update({
        note_text: updates.note_text,
        updated_at: new Date().toISOString(),
      })
      .eq('note_id', noteId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data as Note
  }

  async deleteNote(noteId: number): Promise<boolean> {
    const { error } = await this.client
      .from('uni_notes')
      .delete()
      .eq('note_id', noteId)

    if (error) {
      if (error.code === 'PGRST116') return false
      throw error
    }
    return true
  }

  async getHosts(options?: { limit?: number }): Promise<Host[]> {
    // Use v_hosts view which calculates port_count from uni_ipreport
    const { data, error } = await this.client
      .from('v_hosts')
      .select('*')
      .order('last_seen', { ascending: false })
      .limit(options?.limit || 100)

    if (error) throw error
    return data as Host[]
  }

  async getHost(hostId: number): Promise<Host | null> {
    // Use v_hosts view which calculates port_count from uni_ipreport
    const { data, error } = await this.client
      .from('v_hosts')
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
    // Use v_hosts view which calculates port_count from uni_ipreport
    const { data, error } = await this.client
      .from('v_hosts')
      .select('*')
      .eq('host_addr', ip)
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
      ip_addr: host.host_addr,
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
            .select('tag_name')
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
          tags: tagsResult.data?.map((t) => t.tag_name) || [],
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

  async getScanDeleteStats(scansId: number): Promise<ScanDeleteStats | null> {
    // Get scan info
    const scan = await this.getScan(scansId)
    if (!scan) return null

    // Get counts for all related tables
    const [reportsResult, arpResult, hopsResult, notesResult, tagsResult] = await Promise.all([
      this.client.from('uni_ipreport').select('*', { count: 'exact', head: true }).eq('scans_id', scansId),
      this.client.from('uni_arpreport').select('*', { count: 'exact', head: true }).eq('scans_id', scansId),
      this.client.from('uni_hops').select('*', { count: 'exact', head: true }).eq('scans_id', scansId),
      this.client.from('uni_notes').select('*', { count: 'exact', head: true }).eq('entity_type', 'scan').eq('entity_id', scansId),
      this.client.from('uni_scan_tags').select('*', { count: 'exact', head: true }).eq('scans_id', scansId),
    ])

    // Count unique hosts
    const hostsResult = await this.client.from('uni_ipreport').select('host_addr').eq('scans_id', scansId)
    const uniqueHosts = new Set(hostsResult.data?.map((r) => r.host_addr) || [])

    return {
      scansId,
      target: scan.target_str ?? '',
      scanTime: scan.s_time,
      portCount: reportsResult.count || 0,
      hostCount: uniqueHosts.size,
      arpCount: arpResult.count || 0,
      hopCount: hopsResult.count || 0,
      noteCount: notesResult.count || 0,
      tagCount: tagsResult.count || 0,
    }
  }

  async deleteScan(scansId: number): Promise<DeleteScanResult> {
    const result: DeleteScanResult = {
      success: false,
      scansId,
      deleted: {
        reports: 0,
        arp: 0,
        hops: 0,
        notes: 0,
        tags: 0,
      },
    }

    try {
      // Delete in order to avoid foreign key violations
      // 1. Delete IP reports
      const reportsDelete = await this.client.from('uni_ipreport').delete().eq('scans_id', scansId)
      if (reportsDelete.error && reportsDelete.error.code !== 'PGRST116') {
        throw reportsDelete.error
      }
      result.deleted.reports = reportsDelete.count || 0

      // 2. Delete ARP reports
      const arpDelete = await this.client.from('uni_arpreport').delete().eq('scans_id', scansId)
      if (arpDelete.error && arpDelete.error.code !== 'PGRST116') {
        throw arpDelete.error
      }
      result.deleted.arp = arpDelete.count || 0

      // 3. Delete hops/traceroute data
      const hopsDelete = await this.client.from('uni_hops').delete().eq('scans_id', scansId)
      if (hopsDelete.error && hopsDelete.error.code !== 'PGRST116') {
        // Table might not exist
        if (hopsDelete.error.code !== '42P01') throw hopsDelete.error
      }
      result.deleted.hops = hopsDelete.count || 0

      // 4. Delete notes
      const notesDelete = await this.client.from('uni_notes').delete().eq('entity_type', 'scan').eq('entity_id', scansId)
      if (notesDelete.error && notesDelete.error.code !== 'PGRST116' && notesDelete.error.code !== '42P01') {
        throw notesDelete.error
      }
      result.deleted.notes = notesDelete.count || 0

      // 5. Delete tags
      const tagsDelete = await this.client.from('uni_scan_tags').delete().eq('scans_id', scansId)
      if (tagsDelete.error && tagsDelete.error.code !== 'PGRST116' && tagsDelete.error.code !== '42P01') {
        throw tagsDelete.error
      }
      result.deleted.tags = tagsDelete.count || 0

      // 6. Delete GeoIP records
      const geoDelete = await this.client.from('uni_geoip').delete().eq('scans_id', scansId)
      if (geoDelete.error && geoDelete.error.code !== 'PGRST116' && geoDelete.error.code !== '42P01') {
        // Ignore if table doesn't exist
      }

      // 7. Finally, delete the scan record
      const scanDelete = await this.client.from('uni_scans').delete().eq('scans_id', scansId)
      if (scanDelete.error) {
        throw scanDelete.error
      }

      result.success = true
    } catch (err) {
      result.error = err instanceof Error ? err.message : 'Unknown error during deletion'
    }

    return result
  }

  // ===========================================================================
  // Saved Filters Methods
  // ===========================================================================

  async getSavedFilters(filterType?: SavedFilterType): Promise<SavedFilter[]> {
    let query = this.client
      .from('uni_saved_filters')
      .select('*')
      .order('is_default', { ascending: false })
      .order('filter_name', { ascending: true })

    if (filterType) {
      query = query.eq('filter_type', filterType)
    }

    const { data, error } = await query

    if (error) {
      // Table might not exist
      if (error.code === 'PGRST116' || error.code === '42P01') return []
      throw error
    }
    return data as SavedFilter[]
  }

  async getSavedFilter(filterId: number): Promise<SavedFilter | null> {
    const { data, error } = await this.client
      .from('uni_saved_filters')
      .select('*')
      .eq('filter_id', filterId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data as SavedFilter
  }

  async createSavedFilter(filter: SavedFilterCreate): Promise<SavedFilter> {
    const { data, error } = await this.client
      .from('uni_saved_filters')
      .insert({
        filter_name: filter.filter_name,
        filter_type: filter.filter_type,
        filter_config: filter.filter_config,
        is_default: filter.is_default ?? false,
        created_by: filter.created_by ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    return data as SavedFilter
  }

  async updateSavedFilter(filterId: number, updates: SavedFilterUpdate): Promise<SavedFilter | null> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (updates.filter_name !== undefined) {
      updateData.filter_name = updates.filter_name
    }
    if (updates.filter_config !== undefined) {
      updateData.filter_config = updates.filter_config
    }
    if (updates.is_default !== undefined) {
      updateData.is_default = updates.is_default
    }

    const { data, error } = await this.client
      .from('uni_saved_filters')
      .update(updateData)
      .eq('filter_id', filterId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data as SavedFilter
  }

  async deleteSavedFilter(filterId: number): Promise<boolean> {
    const { error } = await this.client
      .from('uni_saved_filters')
      .delete()
      .eq('filter_id', filterId)

    if (error) {
      if (error.code === 'PGRST116') return false
      throw error
    }
    return true
  }
}

// =============================================================================
// Factory
// =============================================================================

let dbClient: DatabaseClient | null = null

export function getDatabase(): DatabaseClient {
  if (!dbClient) {
    dbClient = new RestDatabase()
  }
  return dbClient
}

export function resetDatabase(): void {
  dbClient = null
  postgrestClient = null
}

// =============================================================================
// React Hook
// =============================================================================

export function useDatabase(): DatabaseClient {
  return getDatabase()
}
