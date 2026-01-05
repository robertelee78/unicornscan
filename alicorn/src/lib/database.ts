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
import type {
  ScanPerformanceStats,
  ProtocolBreakdownData,
} from '@/features/charts/types'
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
// Banner Processing Helper
// =============================================================================

/**
 * Process banner data from PostgREST.
 * PostgREST returns bytea as text (not base64).
 * This function normalizes the text for display.
 */
function processBannerData(data: string): string | null {
  if (!data || typeof data !== 'string') {
    return null
  }

  // PostgREST returns bytea directly as text
  // Just trim and return, the data is already decoded
  const result = data.trim()
  return result || null
}

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
  sortField?: 'scan_id' | 's_time' | 'profile' | 'target_str'
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
  getScan(scan_id: number): Promise<Scan | null>
  getScanSummaries(options?: { limit?: number }): Promise<ScanSummary[]>
  getFilteredScans(options: FilteredScansOptions): Promise<FilteredScansResult>

  // IP Reports (ports/responses)
  getIpReports(scan_id: number): Promise<IpReport[]>
  getIpReportsByHost(scan_id: number, hostAddr: string): Promise<IpReport[]>
  getSampleHostsPerScan(): Promise<Map<number, string>>

  // Banner data (from uni_ipreportdata type=1)
  getBannersForScan(scan_id: number): Promise<Map<number, string>>

  // ARP Reports
  getArpReports(scan_id: number): Promise<ArpReport[]>

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
  getHostSummaries(scan_id?: number): Promise<HostSummary[]>

  // Host-centric queries (optimized - avoids N+1)
  getReportsForHost(hostAddr: string): Promise<IpReport[]>
  getScansForHost(hostAddr: string): Promise<Array<{
    scan_id: number
    scan_time: number
    profile: string
    target_str: string | null
    ports_found: number
  }>>

  // Host search index data (for smart search feature)
  getHostBannerIndex(): Promise<Map<string, string[]>>
  getHostNotesIndex(): Promise<Map<string, string[]>>
  getHostPortsIndex(): Promise<Map<string, number[]>>

  // Dashboard (time-filtered)
  getDashboardStats(options: { since: number | null }): Promise<DashboardStats>
  getTopPorts(options: { limit: number; since: number | null }): Promise<PortCount[]>
  getScanTimeline(options: { since: number | null }): Promise<ScanTimelinePoint[]>
  getRecentScans(options: { limit: number; since: number | null }): Promise<ScanSummary[]>

  // Statistics page (time-filtered)
  getScanPerformanceStats(options: { since: number | null }): Promise<ScanPerformanceStats>
  getProtocolBreakdown(options: { since: number | null }): Promise<ProtocolBreakdownData>

  // Topology (network graph)
  getHops(scan_id: number): Promise<Hop[]>
  getImplicitHopsForScan(scan_id: number): Promise<Hop[]>
  getHopsForHosts(hostAddrs: string[]): Promise<Hop[]>
  getAllHops(): Promise<Hop[]>
  getScannerAddresses(): Promise<string[]>
  getOsFamilyCounts(limit?: number): Promise<Array<{ os_family: string; count: number }>>

  // GeoIP (v6 schema)
  getGeoIPByHost(hostIp: string, scan_id?: number): Promise<GeoIPRecord | null>
  getGeoIPHistory(hostIp: string): Promise<GeoIPRecord[]>
  getGeoIPByScan(scan_id: number, options?: GeoIPQueryOptions): Promise<GeoIPRecord[]>
  getGeoIPCountryStats(scan_id: number): Promise<GeoIPCountryStats[]>

  // Deletion
  getScanDeleteStats(scan_id: number): Promise<ScanDeleteStats | null>
  deleteScan(scan_id: number): Promise<DeleteScanResult>

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
      const { error } = await this.client.from('uni_scan').select('scan_id', { head: true })
      return !error
    } catch {
      return false
    }
  }

  async getScans(options?: { limit?: number; offset?: number }): Promise<Scan[]> {
    const query = this.client
      .from('uni_scan')
      .select('*')
      .order('s_time', { ascending: false })

    if (options?.limit) query.limit(options.limit)
    if (options?.offset) query.range(options.offset, options.offset + (options.limit || 50) - 1)

    const { data, error } = await query
    if (error) throw error
    return data as Scan[]
  }

  async getScan(scan_id: number): Promise<Scan | null> {
    const { data, error } = await this.client
      .from('uni_scan')
      .select('*')
      .eq('scan_id', scan_id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data as Scan
  }

  async getScanSummaries(options?: { limit?: number }): Promise<ScanSummary[]> {
    const { data, error } = await this.client
      .from('uni_scan')
      .select('scan_id, s_time, e_time, profile, target_str, mode_str')
      .order('s_time', { ascending: false })
      .limit(options?.limit || 50)

    if (error) throw error

    const summaries: ScanSummary[] = await Promise.all(
      (data || []).map(async (scan) => {
        const [portResult, hostsResult, tagsResult] = await Promise.all([
          this.client
            .from('uni_ipreport')
            .select('*', { count: 'exact', head: true })
            .eq('scan_id', scan.scan_id),
          this.client
            .from('uni_ipreport')
            .select('host_addr')
            .eq('scan_id', scan.scan_id),
          this.client
            .from('uni_scan_tags')
            .select('tag_name')
            .eq('scan_id', scan.scan_id),
        ])

        const uniqueHosts = new Set(hostsResult.data?.map((h) => h.host_addr) || [])

        return {
          scan_id: scan.scan_id,
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
      .from('uni_scan')
      .select('scan_id, s_time, e_time, profile, target_str, mode_str, scan_notes')

    // Build count query with same filters
    let countQuery = this.client
      .from('uni_scan')
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
            .eq('scan_id', scan.scan_id),
          this.client
            .from('uni_ipreport')
            .select('host_addr')
            .eq('scan_id', scan.scan_id),
          this.client
            .from('uni_scan_tags')
            .select('tag_name')
            .eq('scan_id', scan.scan_id),
        ])

        const uniqueHosts = new Set(hostsResult.data?.map((h) => h.host_addr) || [])

        return {
          scan_id: scan.scan_id,
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

  async getIpReports(scan_id: number): Promise<IpReport[]> {
    const { data, error } = await this.client
      .from('uni_ipreport')
      .select('*')
      .eq('scan_id', scan_id)
      .order('host_addr', { ascending: true })
      .order('dport', { ascending: true })

    if (error) throw error
    return data as IpReport[]
  }

  async getIpReportsByHost(scan_id: number, host_addr: string): Promise<IpReport[]> {
    const { data, error } = await this.client
      .from('uni_ipreport')
      .select('*')
      .eq('scan_id', scan_id)
      .eq('host_addr', host_addr)
      .order('dport', { ascending: true })

    if (error) throw error
    return data as IpReport[]
  }

  /**
   * Get one sample host address per scan.
   * Used for deriving CIDR when scan target is a hostname.
   * Returns Map of scan_id -> sample host_addr
   */
  async getSampleHostsPerScan(): Promise<Map<number, string>> {
    // Get distinct scan_id + host_addr combinations, one per scan
    const { data, error } = await this.client
      .from('uni_ipreport')
      .select('scan_id, host_addr')
      .order('scan_id', { ascending: true })

    if (error) throw error

    const result = new Map<number, string>()
    for (const row of data || []) {
      if (!result.has(row.scan_id)) {
        result.set(row.scan_id, row.host_addr)
      }
    }
    return result
  }

  /**
   * Get banner data for all IP reports in a scan.
   * Returns a Map of ipreport_id -> banner string (decoded from binary).
   * Type=1 in uni_ipreportdata indicates banner/payload data.
   */
  async getBannersForScan(scan_id: number): Promise<Map<number, string>> {
    // First get all ipreport_ids for this scan
    const { data: reports, error: reportsError } = await this.client
      .from('uni_ipreport')
      .select('ipreport_id')
      .eq('scan_id', scan_id)

    if (reportsError) throw reportsError
    if (!reports || reports.length === 0) return new Map()

    const reportIds = reports.map(r => r.ipreport_id)

    // Fetch banner data (type=1) for these report IDs
    const { data: bannerData, error: bannerError } = await this.client
      .from('uni_ipreportdata')
      .select('ipreport_id, data')
      .in('ipreport_id', reportIds)
      .eq('type', 1)

    if (bannerError) {
      // Table might not exist or be empty
      if (bannerError.code === 'PGRST116' || bannerError.code === '42P01') {
        return new Map()
      }
      throw bannerError
    }

    // Convert binary data to strings and build map
    const bannerMap = new Map<number, string>()
    for (const row of bannerData || []) {
      if (row.data) {
        // PostgREST returns bytea as text
        const processed = processBannerData(row.data)
        if (processed) {
          bannerMap.set(row.ipreport_id, processed)
        }
      }
    }

    return bannerMap
  }

  async getArpReports(scan_id: number): Promise<ArpReport[]> {
    const { data, error } = await this.client
      .from('uni_arpreport')
      .select('*')
      .eq('scan_id', scan_id)
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

  async getHostSummaries(_scan_id?: number): Promise<HostSummary[]> {
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

  // ===========================================================================
  // Host-Centric Queries (optimized to avoid N+1 problem)
  // ===========================================================================

  /**
   * Get all IP reports for a specific host across all scans.
   * Single query - O(1) database round trips.
   */
  async getReportsForHost(hostAddr: string): Promise<IpReport[]> {
    const { data, error } = await this.client
      .from('uni_ipreport')
      .select('*')
      .eq('host_addr', hostAddr)
      .order('scan_id', { ascending: false })
      .order('dport', { ascending: true })

    if (error) throw error
    return data as IpReport[]
  }

  /**
   * Get all scans that contain reports for a specific host.
   * Uses 2 queries instead of N+1:
   *   1. Fetch all reports for host (get unique scan_ids)
   *   2. Fetch scan details for those IDs
   */
  async getScansForHost(host_addr: string): Promise<Array<{
    scan_id: number
    scan_time: number
    profile: string
    target_str: string | null
    ports_found: number
  }>> {
    // Query 1: Get all reports for this host (includes scan_id)
    const { data: reports, error: reportsError } = await this.client
      .from('uni_ipreport')
      .select('scan_id')
      .eq('host_addr', host_addr)

    if (reportsError) throw reportsError
    if (!reports || reports.length === 0) return []

    // Aggregate: count ports per scan
    const scan_port_counts = new Map<number, number>()
    for (const r of reports) {
      scan_port_counts.set(r.scan_id, (scan_port_counts.get(r.scan_id) || 0) + 1)
    }

    const unique_scan_ids = Array.from(scan_port_counts.keys())

    // Query 2: Get scan details for those IDs
    const { data: scans, error: scansError } = await this.client
      .from('uni_scan')
      .select('scan_id, s_time, profile, target_str')
      .in('scan_id', unique_scan_ids)
      .order('s_time', { ascending: false })

    if (scansError) throw scansError

    // Combine scan details with port counts
    return (scans || []).map(scan => ({
      scan_id: scan.scan_id,
      scan_time: scan.s_time,
      profile: scan.profile,
      target_str: scan.target_str,
      ports_found: scan_port_counts.get(scan.scan_id) || 0,
    }))
  }

  // ===========================================================================
  // Host Search Index Methods (for smart search feature)
  // ===========================================================================

  /**
   * Get all banners indexed by host address.
   * Aggregates banner data from uni_ipreportdata (type=1) via uni_ipreport.
   * Returns Map<host_addr, banner_strings[]> for efficient searching.
   *
   * This enables banner search across all hosts without N+1 queries.
   */
  async getHostBannerIndex(): Promise<Map<string, string[]>> {
    // Step 1: Get all banner data with their report IDs
    const { data: bannerData, error: bannerError } = await this.client
      .from('uni_ipreportdata')
      .select('ipreport_id, data')
      .eq('type', 1)  // type=1 is banner data

    if (bannerError) {
      // Table might not exist or be empty
      if (bannerError.code === 'PGRST116' || bannerError.code === '42P01') {
        return new Map()
      }
      throw bannerError
    }

    if (!bannerData || bannerData.length === 0) {
      return new Map()
    }

    // Build set of report IDs that have banners
    const reportIds = bannerData.map(r => r.ipreport_id)

    // Step 2: Get host addresses for those reports
    const { data: reportHostData, error: reportError } = await this.client
      .from('uni_ipreport')
      .select('ipreport_id, host_addr')
      .in('ipreport_id', reportIds)

    if (reportError) throw reportError

    // Create lookup: ipreport_id -> host_addr
    const reportToHost = new Map<number, string>()
    for (const r of reportHostData || []) {
      reportToHost.set(r.ipreport_id, r.host_addr)
    }

    // Aggregate banners by host
    const hostBanners = new Map<string, string[]>()
    for (const row of bannerData) {
      if (row.data) {
        const processed = processBannerData(row.data)
        if (processed) {
          const hostAddr = reportToHost.get(row.ipreport_id)
          if (hostAddr) {
            const existing = hostBanners.get(hostAddr)
            if (existing) {
              // Avoid duplicates
              if (!existing.includes(processed)) {
                existing.push(processed)
              }
            } else {
              hostBanners.set(hostAddr, [processed])
            }
          }
        }
      }
    }

    return hostBanners
  }

  /**
   * Get all notes indexed by host address.
   * Aggregates note_text from uni_notes where entity_type='host'.
   * Returns Map<host_addr, note_texts[]> for efficient searching.
   *
   * Note: entity_id for hosts refers to host_id, so we need to join with uni_hosts.
   */
  async getHostNotesIndex(): Promise<Map<string, string[]>> {
    // First get all host notes
    const { data: notes, error: notesError } = await this.client
      .from('uni_notes')
      .select('entity_id, note_text')
      .eq('entity_type', 'host')

    if (notesError) {
      // Table might not exist
      if (notesError.code === 'PGRST116' || notesError.code === '42P01') {
        return new Map()
      }
      throw notesError
    }

    if (!notes || notes.length === 0) {
      return new Map()
    }

    // Get host_id -> host_addr mapping
    const hostIds = [...new Set(notes.map(n => n.entity_id))]
    const { data: hosts, error: hostsError } = await this.client
      .from('uni_hosts')
      .select('host_id, host_addr')
      .in('host_id', hostIds)

    if (hostsError) throw hostsError

    // Create lookup: host_id -> host_addr
    const hostIdToAddr = new Map<number, string>()
    for (const h of hosts || []) {
      hostIdToAddr.set(h.host_id, h.host_addr)
    }

    // Aggregate notes by host address
    const hostNotes = new Map<string, string[]>()
    for (const note of notes) {
      const hostAddr = hostIdToAddr.get(note.entity_id)
      if (hostAddr && note.note_text) {
        const existing = hostNotes.get(hostAddr)
        if (existing) {
          existing.push(note.note_text)
        } else {
          hostNotes.set(hostAddr, [note.note_text])
        }
      }
    }

    return hostNotes
  }

  /**
   * Get all responding ports indexed by host address.
   * Returns Map<host_addr, port_numbers[]> for efficient port search.
   *
   * This enables "find hosts with port 22" type queries.
   */
  async getHostPortsIndex(): Promise<Map<string, number[]>> {
    // Get all unique host_addr + sport combinations
    const { data: reports, error } = await this.client
      .from('uni_ipreport')
      .select('host_addr, sport')

    if (error) throw error

    // Aggregate ports by host
    const hostPorts = new Map<string, Set<number>>()
    for (const r of reports || []) {
      const existing = hostPorts.get(r.host_addr)
      if (existing) {
        existing.add(r.sport)
      } else {
        hostPorts.set(r.host_addr, new Set([r.sport]))
      }
    }

    // Convert Sets to Arrays
    const result = new Map<string, number[]>()
    for (const [host, ports] of hostPorts) {
      result.set(host, Array.from(ports).sort((a, b) => a - b))
    }

    return result
  }

  async getDashboardStats(options: { since: number | null }): Promise<DashboardStats> {
    const { since } = options

    // Build queries with optional time filter
    const scansQuery = this.client.from('uni_scan').select('*', { count: 'exact', head: true })
    const responsesQuery = this.client.from('uni_ipreport').select('*', { count: 'exact', head: true })
    // Get host_addr, sport, and type from responses to count unique hosts and port:protocol pairs
    const detailsQuery = this.client.from('uni_ipreport').select('host_addr, sport, type')

    if (since !== null) {
      scansQuery.gte('s_time', since)
      responsesQuery.gte('tstamp', since)
      detailsQuery.gte('tstamp', since)
    }

    const [scansResult, responsesResult, detailsResult] = await Promise.all([
      scansQuery,
      responsesQuery,
      detailsQuery,
    ])

    // Count unique hosts and port:protocol pairs from the responses in the time window
    const uniqueHosts = new Set(detailsResult.data?.map((r) => r.host_addr) || [])
    // Count unique (port, protocol) pairs - 53/TCP is different from 53/UDP
    const uniquePorts = new Set(detailsResult.data?.map((r) => `${r.sport}:${r.type}`) || [])

    return {
      totalScans: scansResult.count || 0,
      totalHosts: uniqueHosts.size,
      totalResponses: responsesResult.count || 0,
      uniquePorts: uniquePorts.size,
    }
  }

  async getTopPorts(options: { limit: number; since: number | null }): Promise<PortCount[]> {
    const { limit, since } = options

    // Get all port reports, then aggregate in JS (PostgREST doesn't support GROUP BY)
    const query = this.client.from('uni_ipreport').select('sport, proto')

    if (since !== null) {
      query.gte('tstamp', since)
    }

    const { data, error } = await query
    if (error) throw error

    // Aggregate counts by port and protocol
    const portCounts = new Map<string, { port: number; protocol: 'tcp' | 'udp'; count: number }>()
    for (const row of data || []) {
      const proto = row.proto === 6 ? 'tcp' : row.proto === 17 ? 'udp' : 'tcp'
      const key = `${proto}-${row.sport}`
      const existing = portCounts.get(key)
      if (existing) {
        existing.count++
      } else {
        portCounts.set(key, { port: row.sport, protocol: proto, count: 1 })
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
    const scansQuery = this.client.from('uni_scan').select('scan_id, s_time')
    const reportsQuery = this.client.from('uni_ipreport').select('scan_id, tstamp')

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
      .from('uni_scan')
      .select('scan_id, s_time, e_time, profile, target_str, mode_str')
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
            .eq('scan_id', scan.scan_id),
          this.client
            .from('uni_ipreport')
            .select('host_addr')
            .eq('scan_id', scan.scan_id),
          this.client
            .from('uni_scan_tags')
            .select('tag_name')
            .eq('scan_id', scan.scan_id),
        ])

        const uniqueHosts = new Set(hostsResult.data?.map((h) => h.host_addr) || [])

        return {
          scan_id: scan.scan_id,
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

  // ===========================================================================
  // Statistics Page Methods (Phase 3.4)
  // ===========================================================================

  /**
   * Get aggregated scan performance statistics for time range.
   * Used for stat cards on Statistics page:
   * - Response Rate: totalResponses / totalPacketsSent * 100
   * - Host Hit Rate: totalHostsResponded / totalHostsTargeted * 100
   * - Total Packets: totalPacketsSent
   */
  async getScanPerformanceStats(options: { since: number | null }): Promise<ScanPerformanceStats> {
    const { since } = options

    // Query 1: Get scan-level data (packets sent, hosts targeted, scan count)
    const scansQuery = this.client
      .from('uni_scan')
      .select('num_packets, num_hosts')

    // Query 2: Get response-level data (total responses, unique responding hosts)
    const responsesQuery = this.client
      .from('uni_ipreport')
      .select('host_addr')

    if (since !== null) {
      scansQuery.gte('s_time', since)
      responsesQuery.gte('tstamp', since)
    }

    const [scansResult, responsesResult] = await Promise.all([scansQuery, responsesQuery])

    if (scansResult.error) throw scansResult.error
    if (responsesResult.error) throw responsesResult.error

    // Aggregate scan data
    const scans = scansResult.data || []
    let totalPacketsSent = 0
    let totalHostsTargeted = 0
    for (const scan of scans) {
      totalPacketsSent += scan.num_packets || 0
      totalHostsTargeted += scan.num_hosts || 0
    }
    const scanCount = scans.length

    // Aggregate response data
    const responses = responsesResult.data || []
    const totalResponses = responses.length
    const uniqueRespondingHosts = new Set(responses.map(r => r.host_addr))
    const totalHostsResponded = uniqueRespondingHosts.size

    // Calculate percentages (avoid division by zero)
    const responseRate = totalPacketsSent > 0
      ? (totalResponses / totalPacketsSent) * 100
      : 0
    const hostHitRate = totalHostsTargeted > 0
      ? (totalHostsResponded / totalHostsTargeted) * 100
      : 0

    return {
      totalPacketsSent,
      totalResponses,
      totalHostsTargeted,
      totalHostsResponded,
      responseRate,
      hostHitRate,
      scanCount,
    }
  }

  /**
   * Get protocol breakdown for Statistics page.
   * Counts:
   * - tcpTotal: All TCP responses (proto=6)
   * - tcpSynAck: TCP with SYN+ACK flags (type field = 0x12 = 18)
   * - tcpWithBanner: TCP responses that have associated banner data
   * - udpTotal: All UDP responses (proto=17)
   *
   * Note: In uni_ipreport, the 'type' field contains TCP flags, not 'flags'.
   * SYN+ACK = SYN(0x02) | ACK(0x10) = 0x12 = 18 decimal
   */
  async getProtocolBreakdown(options: { since: number | null }): Promise<ProtocolBreakdownData> {
    const { since } = options

    // Query responses with protocol and type (TCP flags)
    const responsesQuery = this.client
      .from('uni_ipreport')
      .select('ipreport_id, proto, type')

    if (since !== null) {
      responsesQuery.gte('tstamp', since)
    }

    const { data: responses, error: responsesError } = await responsesQuery
    if (responsesError) throw responsesError

    // Count protocols and TCP flags
    let tcpTotal = 0
    let tcpSynAck = 0
    let udpTotal = 0
    const tcpReportIds: number[] = []

    const TCP_PROTO = 6
    const UDP_PROTO = 17
    const SYN_ACK_FLAGS = 0x12  // SYN(0x02) | ACK(0x10)

    for (const r of responses || []) {
      if (r.proto === TCP_PROTO) {
        tcpTotal++
        tcpReportIds.push(r.ipreport_id)
        // Check for SYN+ACK in the type field
        // Use bitwise AND to check if both SYN and ACK bits are set
        if ((r.type & SYN_ACK_FLAGS) === SYN_ACK_FLAGS) {
          tcpSynAck++
        }
      } else if (r.proto === UDP_PROTO) {
        udpTotal++
      }
    }

    // Query for TCP responses with banner data
    let tcpWithBanner = 0
    if (tcpReportIds.length > 0) {
      const { data: bannerData, error: bannerError } = await this.client
        .from('uni_ipreportdata')
        .select('ipreport_id')
        .in('ipreport_id', tcpReportIds)
        .eq('type', 1)  // type=1 is banner data

      if (!bannerError && bannerData) {
        // Count unique report IDs with banners
        const reportIdsWithBanners = new Set(bannerData.map(b => b.ipreport_id))
        tcpWithBanner = reportIdsWithBanners.size
      }
    }

    return {
      tcpTotal,
      tcpSynAck,
      tcpWithBanner,
      udpTotal,
    }
  }

  async getHops(scan_id: number): Promise<Hop[]> {
    const { data, error } = await this.client
      .from('uni_hops')
      .select('*')
      .eq('scan_id', scan_id)
      .order('target_addr', { ascending: true })
      .order('hop_number', { ascending: true })

    if (error) {
      // Table might not exist yet - return empty array
      if (error.code === 'PGRST116' || error.code === '42P01') return []
      throw error
    }
    return data as Hop[]
  }

  /**
   * Get implicit hop data from uni_ipreport.trace_addr for a specific scan.
   * When trace_addr != host_addr, the response came from an intermediate router.
   * This provides traceroute path data when uni_hops is empty.
   */
  async getImplicitHopsForScan(scan_id: number): Promise<Hop[]> {
    const { data, error } = await this.client
      .from('uni_ipreport')
      .select('ipreport_id, scan_id, host_addr, trace_addr, ttl')
      .eq('scan_id', scan_id)
      .neq('trace_addr', '0.0.0.0')

    if (error) {
      if (error.code === 'PGRST116' || error.code === '42P01') return []
      throw error
    }

    // Filter to only rows where trace_addr != host_addr (router, not target)
    // and convert to Hop-compatible format
    const hops: Hop[] = []
    for (const row of data || []) {
      if (row.trace_addr && row.host_addr && row.trace_addr !== row.host_addr) {
        hops.push({
          hop_id: row.ipreport_id,
          ipreport_id: row.ipreport_id,
          scan_id: row.scan_id,
          target_addr: row.host_addr,
          hop_addr: row.trace_addr,
          hop_number: null, // Not known from trace_addr alone
          ttl_observed: row.ttl,
          rtt_us: null,
          extra_data: null,
        })
      }
    }

    return hops
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

  /**
   * Get all hops across all scans for global topology view.
   * Returns hops sorted by target_addr then hop_number for chain building.
   */
  async getAllHops(): Promise<Hop[]> {
    const { data, error } = await this.client
      .from('uni_hops')
      .select('*')
      .order('target_addr', { ascending: true })
      .order('hop_number', { ascending: true })

    if (error) {
      // Table might not exist yet (pre-v9 schema) - return empty array
      if (error.code === 'PGRST116' || error.code === '42P01') return []
      throw error
    }
    return data as Hop[]
  }

  /**
   * Get implicit hop data from uni_ipreport.trace_addr.
   * When trace_addr != host_addr, the response came from an intermediate router.
   * This provides traceroute path data even when uni_hops is empty.
   *
   * Returns Hop-compatible records for router nodes and edges.
   */
  async getImplicitHopsFromReports(): Promise<Hop[]> {
    // Query IP reports where trace_addr differs from host_addr (router responded)
    // Exclude 0.0.0.0 which indicates no trace address
    const { data, error } = await this.client
      .from('uni_ipreport')
      .select('ipreport_id, scan_id, host_addr, trace_addr, ttl')
      .neq('trace_addr', '0.0.0.0')

    if (error) {
      if (error.code === 'PGRST116' || error.code === '42P01') return []
      throw error
    }

    // Filter to only rows where trace_addr != host_addr (router, not target)
    // and convert to Hop-compatible format
    const hops: Hop[] = []
    for (const row of data || []) {
      if (row.trace_addr && row.host_addr && row.trace_addr !== row.host_addr) {
        hops.push({
          hop_id: row.ipreport_id, // Use ipreport_id as hop_id
          ipreport_id: row.ipreport_id,
          scan_id: row.scan_id,
          target_addr: row.host_addr, // The target we were probing
          hop_addr: row.trace_addr,   // The router that responded
          hop_number: null,           // Not known from trace_addr alone
          ttl_observed: row.ttl,
          rtt_us: null,
          extra_data: null,
        })
      }
    }

    return hops
  }

  /**
   * Get unique scanner addresses across all scans for global topology view.
   * Returns sorted array of unique send_addr values from IP reports.
   */
  async getScannerAddresses(): Promise<string[]> {
    const { data, error } = await this.client
      .from('uni_ipreport')
      .select('send_addr')

    if (error) {
      if (error.code === 'PGRST116' || error.code === '42P01') return []
      throw error
    }

    // Extract unique addresses using Set
    const unique = new Set<string>()
    for (const row of data || []) {
      if (row.send_addr) unique.add(row.send_addr)
    }
    return Array.from(unique).sort()
  }

  async getOsFamilyCounts(limit: number = 5): Promise<Array<{ os_family: string; count: number }>> {
    // Query v_hosts for OS family distribution
    const { data, error } = await this.client
      .from('v_hosts')
      .select('os_family')
      .not('os_family', 'is', null)

    if (error) {
      if (error.code === 'PGRST116' || error.code === '42P01') return []
      throw error
    }

    // Count occurrences of each OS family
    const counts = new Map<string, number>()
    for (const row of data || []) {
      if (row.os_family) {
        counts.set(row.os_family, (counts.get(row.os_family) || 0) + 1)
      }
    }

    // Sort by count descending and return top N
    return Array.from(counts.entries())
      .map(([os_family, count]) => ({ os_family, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  }

  // ===========================================================================
  // GeoIP Methods (v6 schema)
  // ===========================================================================

  async getGeoIPByHost(host_ip: string, scan_id?: number): Promise<GeoIPRecord | null> {
    let query = this.client
      .from('uni_geoip')
      .select('*')
      .eq('host_ip', host_ip)
      .order('lookup_time', { ascending: false })
      .limit(1)

    if (scan_id !== undefined) {
      query = query.eq('scan_id', scan_id)
    }

    const { data, error } = await query

    if (error) {
      // Table might not exist yet (v5 database)
      if (error.code === 'PGRST116' || error.code === '42P01') return null
      throw error
    }
    return data && data.length > 0 ? (data[0] as GeoIPRecord) : null
  }

  async getGeoIPHistory(host_ip: string): Promise<GeoIPRecord[]> {
    const { data, error } = await this.client
      .from('uni_geoip')
      .select('*')
      .eq('host_ip', host_ip)
      .order('lookup_time', { ascending: false })

    if (error) {
      if (error.code === 'PGRST116' || error.code === '42P01') return []
      throw error
    }
    return data as GeoIPRecord[]
  }

  async getGeoIPByScan(scan_id: number, options?: GeoIPQueryOptions): Promise<GeoIPRecord[]> {
    let query = this.client
      .from('uni_geoip')
      .select('*')
      .eq('scan_id', scan_id)

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

  async getGeoIPCountryStats(scan_id: number): Promise<GeoIPCountryStats[]> {
    // Use the v_geoip_stats view if available, otherwise aggregate manually
    const { data, error } = await this.client
      .from('v_geoip_stats')
      .select('*')
      .eq('scan_id', scan_id)
      .order('host_count', { ascending: false })

    if (error) {
      // View might not exist - fall back to manual aggregation
      if (error.code === 'PGRST116' || error.code === '42P01') {
        // Get raw GeoIP records and aggregate in JS
        const records = await this.getGeoIPByScan(scan_id)
        return this.aggregateCountryStats(scan_id, records)
      }
      throw error
    }
    return data as GeoIPCountryStats[]
  }

  private aggregateCountryStats(scan_id: number, records: GeoIPRecord[]): GeoIPCountryStats[] {
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
          scan_id: scan_id,
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

  async getScanDeleteStats(scan_id: number): Promise<ScanDeleteStats | null> {
    // Get scan info
    const scan = await this.getScan(scan_id)
    if (!scan) return null

    // Get counts for all related tables
    const [reportsResult, arpResult, hopsResult, notesResult, tagsResult] = await Promise.all([
      this.client.from('uni_ipreport').select('*', { count: 'exact', head: true }).eq('scan_id', scan_id),
      this.client.from('uni_arpreport').select('*', { count: 'exact', head: true }).eq('scan_id', scan_id),
      this.client.from('uni_hops').select('*', { count: 'exact', head: true }).eq('scan_id', scan_id),
      this.client.from('uni_notes').select('*', { count: 'exact', head: true }).eq('entity_type', 'scan').eq('entity_id', scan_id),
      this.client.from('uni_scan_tags').select('*', { count: 'exact', head: true }).eq('scan_id', scan_id),
    ])

    // Count unique hosts
    const hostsResult = await this.client.from('uni_ipreport').select('host_addr').eq('scan_id', scan_id)
    const unique_hosts = new Set(hostsResult.data?.map((r) => r.host_addr) || [])

    return {
      scan_id,
      target: scan.target_str ?? '',
      scan_time: scan.s_time,
      port_count: reportsResult.count || 0,
      host_count: unique_hosts.size,
      arp_count: arpResult.count || 0,
      hop_count: hopsResult.count || 0,
      note_count: notesResult.count || 0,
      tag_count: tagsResult.count || 0,
    }
  }

  async deleteScan(scan_id: number): Promise<DeleteScanResult> {
    const result: DeleteScanResult = {
      success: false,
      scan_id,
      deleted: {
        reports: 0,
        arp: 0,
        hops: 0,
        notes: 0,
        tags: 0,
      },
    }

    // Helper to check if error should be ignored (table doesn't exist or no rows)
    const isIgnorableError = (code: string | undefined) =>
      code === 'PGRST116' || code === '42P01'

    try {
      // Delete in order to avoid foreign key violations
      // Must delete child tables before parent tables

      // First, get all ipreport_ids for this scan (needed for child table deletes)
      const { data: ipreports } = await this.client
        .from('uni_ipreport')
        .select('ipreport_id')
        .eq('scan_id', scan_id)
      const ipreportIds = ipreports?.map(r => r.ipreport_id) || []

      // 1a. Delete IP packets (FK to uni_ipreport by ipreport_id, no cascade)
      if (ipreportIds.length > 0) {
        const ippacketsDelete = await this.client
          .from('uni_ippackets')
          .delete()
          .in('ipreport_id', ipreportIds)
        if (ippacketsDelete.error && !isIgnorableError(ippacketsDelete.error.code)) {
          throw ippacketsDelete.error
        }
      }

      // 1b. Delete IP report data (FK to uni_ipreport by ipreport_id, no cascade)
      if (ipreportIds.length > 0) {
        const ipreportdataDelete = await this.client
          .from('uni_ipreportdata')
          .delete()
          .in('ipreport_id', ipreportIds)
        if (ipreportdataDelete.error && !isIgnorableError(ipreportdataDelete.error.code)) {
          throw ipreportdataDelete.error
        }
      }

      // 2. Delete IP reports (FK to uni_scan, no cascade)
      const reportsDelete = await this.client.from('uni_ipreport').delete().eq('scan_id', scan_id)
      if (reportsDelete.error && !isIgnorableError(reportsDelete.error.code)) {
        throw reportsDelete.error
      }
      result.deleted.reports = reportsDelete.count || 0

      // 3a. Get all arpreport_ids for this scan (needed for child table deletes)
      const { data: arpreports } = await this.client
        .from('uni_arpreport')
        .select('arpreport_id')
        .eq('scan_id', scan_id)
      const arpreportIds = arpreports?.map(r => r.arpreport_id) || []

      // 3b. Delete ARP packets (FK to uni_arpreport by arpreport_id, no cascade)
      if (arpreportIds.length > 0) {
        const arppacketsDelete = await this.client
          .from('uni_arppackets')
          .delete()
          .in('arpreport_id', arpreportIds)
        if (arppacketsDelete.error && !isIgnorableError(arppacketsDelete.error.code)) {
          throw arppacketsDelete.error
        }
      }

      // 3c. Delete ARP reports (FK to uni_scan, no cascade)
      const arpDelete = await this.client.from('uni_arpreport').delete().eq('scan_id', scan_id)
      if (arpDelete.error && !isIgnorableError(arpDelete.error.code)) {
        throw arpDelete.error
      }
      result.deleted.arp = arpDelete.count || 0

      // 3. Delete scan phases (FK to uni_scan, no cascade)
      const phasesDelete = await this.client.from('uni_scan_phases').delete().eq('scan_id', scan_id)
      if (phasesDelete.error && !isIgnorableError(phasesDelete.error.code)) {
        throw phasesDelete.error
      }

      // 4. Delete sender workunits (FK to uni_scan, no cascade)
      const sworkunitsDelete = await this.client.from('uni_sworkunits').delete().eq('scan_id', scan_id)
      if (sworkunitsDelete.error && !isIgnorableError(sworkunitsDelete.error.code)) {
        throw sworkunitsDelete.error
      }

      // 5. Delete listener workunits (FK to uni_scan, no cascade)
      const lworkunitsDelete = await this.client.from('uni_lworkunits').delete().eq('scan_id', scan_id)
      if (lworkunitsDelete.error && !isIgnorableError(lworkunitsDelete.error.code)) {
        throw lworkunitsDelete.error
      }

      // 6. Delete workunit stats (FK to uni_scan, no cascade)
      const workunitstatsDelete = await this.client.from('uni_workunitstats').delete().eq('scan_id', scan_id)
      if (workunitstatsDelete.error && !isIgnorableError(workunitstatsDelete.error.code)) {
        throw workunitstatsDelete.error
      }

      // 7. Delete output records (FK to uni_scan, no cascade)
      const outputDelete = await this.client.from('uni_output').delete().eq('scan_id', scan_id)
      if (outputDelete.error && !isIgnorableError(outputDelete.error.code)) {
        throw outputDelete.error
      }

      // 6. Delete hops/traceroute data (has cascade, but delete explicitly for count)
      const hopsDelete = await this.client.from('uni_hops').delete().eq('scan_id', scan_id)
      if (hopsDelete.error && !isIgnorableError(hopsDelete.error.code)) {
        throw hopsDelete.error
      }
      result.deleted.hops = hopsDelete.count || 0

      // 7. Delete services (has cascade, but delete explicitly)
      const servicesDelete = await this.client.from('uni_services').delete().eq('scan_id', scan_id)
      if (servicesDelete.error && !isIgnorableError(servicesDelete.error.code)) {
        throw servicesDelete.error
      }

      // 8. Delete OS fingerprints (has cascade, but delete explicitly)
      const osfpDelete = await this.client.from('uni_os_fingerprints').delete().eq('scan_id', scan_id)
      if (osfpDelete.error && !isIgnorableError(osfpDelete.error.code)) {
        throw osfpDelete.error
      }

      // 9. Delete notes
      const notesDelete = await this.client.from('uni_notes').delete().eq('entity_type', 'scan').eq('entity_id', scan_id)
      if (notesDelete.error && !isIgnorableError(notesDelete.error.code)) {
        throw notesDelete.error
      }
      result.deleted.notes = notesDelete.count || 0

      // 10. Delete tags (has cascade, but delete explicitly for count)
      const tagsDelete = await this.client.from('uni_scan_tags').delete().eq('scan_id', scan_id)
      if (tagsDelete.error && !isIgnorableError(tagsDelete.error.code)) {
        throw tagsDelete.error
      }
      result.deleted.tags = tagsDelete.count || 0

      // 11. Delete GeoIP records (has cascade, but delete explicitly)
      const geoDelete = await this.client.from('uni_geoip').delete().eq('scan_id', scan_id)
      if (geoDelete.error && !isIgnorableError(geoDelete.error.code)) {
        throw geoDelete.error
      }

      // 12. Delete host_scans junction table (has cascade, but delete explicitly)
      const hostScansDelete = await this.client.from('uni_host_scans').delete().eq('scan_id', scan_id)
      if (hostScansDelete.error && !isIgnorableError(hostScansDelete.error.code)) {
        throw hostScansDelete.error
      }

      // 13. Finally, delete the scan record itself
      const scanDelete = await this.client.from('uni_scan').delete().eq('scan_id', scan_id)
      if (scanDelete.error) {
        throw scanDelete.error
      }

      result.success = true
    } catch (err) {
      // PostgREST errors are plain objects with message/code/details, not Error instances
      if (err && typeof err === 'object' && 'message' in err) {
        const pgErr = err as { message: string; code?: string; details?: string; hint?: string }
        result.error = pgErr.message
        if (pgErr.details) result.error += `: ${pgErr.details}`
        if (pgErr.hint) result.error += ` (${pgErr.hint})`
      } else if (err instanceof Error) {
        result.error = err.message
      } else {
        result.error = 'Unknown error during deletion'
      }
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
