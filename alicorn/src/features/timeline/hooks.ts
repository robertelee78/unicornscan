/**
 * Host timeline hooks
 * Data fetching and state management for timeline feature
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getDatabase } from '@/lib/database'
import type {
  HostTimelineData,
  TimelineFilter,
  TimelineViewState,
  TimelineUrlState,
} from './types'
import { DEFAULT_FILTER, DEFAULT_VIEW_STATE } from './types'
import { buildHostTimeline, applyFilters, calculateVisibleRange } from './timeline-utils'

const db = getDatabase()

// =============================================================================
// Query Keys
// =============================================================================

export const timelineKeys = {
  all: ['timeline'] as const,
  host: (hostIp: string) => [...timelineKeys.all, 'host', hostIp] as const,
}

// =============================================================================
// Data Fetching Hook
// =============================================================================

/**
 * Fetch and compute complete timeline data for a host
 */
export function useHostTimeline(hostIp: string) {
  return useQuery({
    queryKey: timelineKeys.host(hostIp),
    queryFn: async (): Promise<HostTimelineData> => {
      // Get all scans
      const scans = await db.getScans({ limit: 500 })

      // Get reports for each scan that includes this host
      const reportsByScansId = new Map<number, Awaited<ReturnType<typeof db.getIpReportsByHost>>>()

      for (const scan of scans) {
        const reports = await db.getIpReportsByHost(scan.scan_id, hostIp)
        if (reports.length > 0) {
          reportsByScansId.set(scan.scan_id, reports)
        }
      }

      // Filter scans to only those with data for this host
      const relevantScans = scans.filter(s => reportsByScansId.has(s.scan_id))

      // Build the timeline
      return buildHostTimeline(hostIp, relevantScans, reportsByScansId)
    },
    enabled: !!hostIp,
    staleTime: 60000, // 1 minute
  })
}

// =============================================================================
// Filter State Hook
// =============================================================================

/**
 * Manage filter state for timeline
 */
export function useTimelineFilter(initialFilter: Partial<TimelineFilter> = {}) {
  const [filter, setFilter] = useState<TimelineFilter>({
    ...DEFAULT_FILTER,
    ...initialFilter,
  })

  const updateFilter = useCallback((updates: Partial<TimelineFilter>) => {
    setFilter(prev => ({ ...prev, ...updates }))
  }, [])

  const resetFilter = useCallback(() => {
    setFilter(DEFAULT_FILTER)
  }, [])

  const toggleProtocol = useCallback((protocol: 'tcp' | 'udp' | 'other') => {
    setFilter(prev => {
      const protocols = prev.protocols.includes(protocol)
        ? prev.protocols.filter(p => p !== protocol)
        : [...prev.protocols, protocol]
      return { ...prev, protocols }
    })
  }, [])

  const toggleChangeType = useCallback((type: TimelineFilter['changeTypes'][number]) => {
    setFilter(prev => {
      const changeTypes = prev.changeTypes.includes(type)
        ? prev.changeTypes.filter(t => t !== type)
        : [...prev.changeTypes, type]
      return { ...prev, changeTypes }
    })
  }, [])

  return {
    filter,
    updateFilter,
    resetFilter,
    toggleProtocol,
    toggleChangeType,
    setPortFilter: useCallback((portFilter: string) => updateFilter({ portFilter }), [updateFilter]),
    setChangesOnly: useCallback((changesOnly: boolean) => updateFilter({ changesOnly }), [updateFilter]),
    setActiveOnly: useCallback((activeOnly: boolean) => updateFilter({ activeOnly }), [updateFilter]),
  }
}

// =============================================================================
// View State Hook
// =============================================================================

/**
 * Manage view/zoom state for timeline
 */
export function useTimelineViewState(
  timeRange: { start: number; end: number } | null,
  initialState: Partial<TimelineViewState> = {}
) {
  const [viewState, setViewState] = useState<TimelineViewState>({
    ...DEFAULT_VIEW_STATE,
    ...initialState,
  })

  // Calculate visible range based on zoom level
  const visibleRange = useMemo(() => {
    if (!timeRange) return null
    if (viewState.viewStart !== null && viewState.viewEnd !== null) {
      return { start: viewState.viewStart, end: viewState.viewEnd }
    }
    return calculateVisibleRange(timeRange, viewState.zoomLevel)
  }, [timeRange, viewState.zoomLevel, viewState.viewStart, viewState.viewEnd])

  const zoomIn = useCallback(() => {
    setViewState(prev => ({
      ...prev,
      zoomLevel: Math.min(prev.zoomLevel * 2, 32), // Max 32x zoom
      viewStart: null,
      viewEnd: null,
    }))
  }, [])

  const zoomOut = useCallback(() => {
    setViewState(prev => ({
      ...prev,
      zoomLevel: Math.max(prev.zoomLevel / 2, 1), // Min 1x (full range)
      viewStart: null,
      viewEnd: null,
    }))
  }, [])

  const resetZoom = useCallback(() => {
    setViewState(prev => ({
      ...prev,
      zoomLevel: 1,
      viewStart: null,
      viewEnd: null,
    }))
  }, [])

  const setViewRange = useCallback((start: number, end: number) => {
    setViewState(prev => ({
      ...prev,
      viewStart: start,
      viewEnd: end,
    }))
  }, [])

  const selectPort = useCallback((portKey: string | null) => {
    setViewState(prev => ({
      ...prev,
      selectedPort: portKey,
      selectedEvent: null,
    }))
  }, [])

  const selectEvent = useCallback((eventIndex: number | null) => {
    setViewState(prev => ({
      ...prev,
      selectedEvent: eventIndex,
    }))
  }, [])

  const panLeft = useCallback(() => {
    if (!timeRange || !visibleRange) return
    const duration = visibleRange.end - visibleRange.start
    const panAmount = duration * 0.25
    const newStart = Math.max(timeRange.start, visibleRange.start - panAmount)
    const newEnd = newStart + duration
    setViewState(prev => ({
      ...prev,
      viewStart: newStart,
      viewEnd: Math.min(timeRange.end, newEnd),
    }))
  }, [timeRange, visibleRange])

  const panRight = useCallback(() => {
    if (!timeRange || !visibleRange) return
    const duration = visibleRange.end - visibleRange.start
    const panAmount = duration * 0.25
    const newEnd = Math.min(timeRange.end, visibleRange.end + panAmount)
    const newStart = newEnd - duration
    setViewState(prev => ({
      ...prev,
      viewStart: Math.max(timeRange.start, newStart),
      viewEnd: newEnd,
    }))
  }, [timeRange, visibleRange])

  return {
    viewState,
    visibleRange,
    zoomIn,
    zoomOut,
    resetZoom,
    setViewRange,
    selectPort,
    selectEvent,
    panLeft,
    panRight,
    canZoomIn: viewState.zoomLevel < 32,
    canZoomOut: viewState.zoomLevel > 1,
    canPanLeft: visibleRange && timeRange && visibleRange.start > timeRange.start,
    canPanRight: visibleRange && timeRange && visibleRange.end < timeRange.end,
  }
}

// =============================================================================
// URL State Hook
// =============================================================================

/**
 * Sync timeline state with URL parameters for bookmarking
 */
export function useTimelineUrlState() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Parse URL params into state
  const urlState = useMemo((): TimelineUrlState => {
    return {
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      zoom: searchParams.get('zoom') ? parseInt(searchParams.get('zoom')!, 10) : undefined,
      port: searchParams.get('port') || undefined,
      protocols: searchParams.get('protocols') || undefined,
      changes: (searchParams.get('changes') as '1' | '0') || undefined,
    }
  }, [searchParams])

  // Convert URL state to filter/view state
  const initialFilter = useMemo((): Partial<TimelineFilter> => {
    const filter: Partial<TimelineFilter> = {}

    if (urlState.protocols) {
      const protocols = urlState.protocols.split(',').filter(p =>
        ['tcp', 'udp', 'other'].includes(p)
      ) as ('tcp' | 'udp' | 'other')[]
      if (protocols.length > 0) {
        filter.protocols = protocols
      }
    }

    if (urlState.changes === '1') {
      filter.changesOnly = true
    }

    if (urlState.port) {
      filter.portFilter = urlState.port
    }

    return filter
  }, [urlState])

  const initialViewState = useMemo((): Partial<TimelineViewState> => {
    const state: Partial<TimelineViewState> = {}

    if (urlState.zoom && !isNaN(urlState.zoom)) {
      state.zoomLevel = Math.max(1, Math.min(32, urlState.zoom))
    }

    if (urlState.from) {
      const ts = parseTimestamp(urlState.from)
      if (ts !== null) {
        state.viewStart = ts
      }
    }

    if (urlState.to) {
      const ts = parseTimestamp(urlState.to)
      if (ts !== null) {
        state.viewEnd = ts
      }
    }

    return state
  }, [urlState])

  // Update URL when state changes
  const updateUrl = useCallback((
    filter: TimelineFilter,
    viewState: TimelineViewState
  ) => {
    const params = new URLSearchParams()

    // Only add non-default values
    if (viewState.viewStart !== null) {
      params.set('from', new Date(viewState.viewStart * 1000).toISOString().split('T')[0])
    }
    if (viewState.viewEnd !== null) {
      params.set('to', new Date(viewState.viewEnd * 1000).toISOString().split('T')[0])
    }
    if (viewState.zoomLevel !== 1) {
      params.set('zoom', viewState.zoomLevel.toString())
    }
    if (filter.portFilter) {
      params.set('port', filter.portFilter)
    }
    if (filter.protocols.length !== 3) { // Not all protocols
      params.set('protocols', filter.protocols.join(','))
    }
    if (filter.changesOnly) {
      params.set('changes', '1')
    }

    setSearchParams(params, { replace: true })
  }, [setSearchParams])

  return {
    urlState,
    initialFilter,
    initialViewState,
    updateUrl,
  }
}

/**
 * Parse timestamp from URL param (supports ISO date or unix timestamp)
 */
function parseTimestamp(value: string): number | null {
  // Try as ISO date first
  const isoDate = Date.parse(value)
  if (!isNaN(isoDate)) {
    return Math.floor(isoDate / 1000)
  }

  // Try as unix timestamp
  const ts = parseInt(value, 10)
  if (!isNaN(ts)) {
    return ts
  }

  return null
}

// =============================================================================
// Filtered Data Hook
// =============================================================================

/**
 * Combined hook that fetches data and applies filters
 */
export function useFilteredTimeline(
  hostIp: string,
  filter: TimelineFilter
) {
  const { data: rawData, isLoading, error } = useHostTimeline(hostIp)

  const filteredData = useMemo(() => {
    if (!rawData) return null
    return applyFilters(rawData, filter)
  }, [rawData, filter])

  return {
    data: filteredData,
    rawData,
    isLoading,
    error,
  }
}

// =============================================================================
// Complete Timeline State Hook
// =============================================================================

/**
 * All-in-one hook for timeline component
 * Combines data fetching, filtering, view state, and URL sync
 */
export function useTimelineState(hostIp: string) {
  // URL state
  const { initialFilter, initialViewState, updateUrl } = useTimelineUrlState()

  // Filter state
  const filterState = useTimelineFilter(initialFilter)

  // Fetch and filter data
  const { data, rawData, isLoading, error } = useFilteredTimeline(hostIp, filterState.filter)

  // View state (needs time range from data)
  const timeRange = rawData?.timeRange ?? null
  const viewStateResult = useTimelineViewState(timeRange, initialViewState)

  // Sync to URL on changes
  useEffect(() => {
    if (rawData) {
      updateUrl(filterState.filter, viewStateResult.viewState)
    }
  }, [filterState.filter, viewStateResult.viewState, rawData, updateUrl])

  return {
    // Data
    data,
    rawData,
    isLoading,
    error,

    // Filter (spread state but filter is explicit above already)
    ...filterState,

    // View
    ...viewStateResult,
  }
}
