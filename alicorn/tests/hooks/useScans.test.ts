/**
 * Unit tests for src/hooks/useScans.ts
 * Tests React Query hooks for scan data
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { scanKeys, useScans, useScan, useIpReports, useScanSummaries } from '@/hooks/useScans'
import { createHookWrapper, createTestQueryClient } from '../test-utils'

// Mock the database module
vi.mock('@/lib/database', () => {
  const mockDb = {
    getScans: vi.fn(),
    getScan: vi.fn(),
    getIpReports: vi.fn(),
    getScanSummaries: vi.fn(),
    getIpReportsByHost: vi.fn(),
  }
  return {
    getDatabase: () => mockDb,
    __mockDb: mockDb,
  }
})

// Import after mocking
import { getDatabase } from '@/lib/database'

const mockDb = getDatabase() as unknown as {
  getScans: ReturnType<typeof vi.fn>
  getScan: ReturnType<typeof vi.fn>
  getIpReports: ReturnType<typeof vi.fn>
  getScanSummaries: ReturnType<typeof vi.fn>
  getIpReportsByHost: ReturnType<typeof vi.fn>
}

describe('scanKeys', () => {
  describe('query key factory', () => {
    it('generates base key', () => {
      expect(scanKeys.all).toEqual(['scans'])
    })

    it('generates lists key', () => {
      expect(scanKeys.lists()).toEqual(['scans', 'list'])
    })

    it('generates list key with options', () => {
      expect(scanKeys.list({ limit: 10 })).toEqual(['scans', 'list', { limit: 10 }])
      expect(scanKeys.list({ limit: 10, offset: 20 })).toEqual([
        'scans',
        'list',
        { limit: 10, offset: 20 },
      ])
      expect(scanKeys.list()).toEqual(['scans', 'list', undefined])
    })

    it('generates summaries key', () => {
      expect(scanKeys.summaries()).toEqual(['scans', 'summaries'])
    })

    it('generates summary list key', () => {
      expect(scanKeys.summaryList(10)).toEqual(['scans', 'summaries', { limit: 10 }])
      expect(scanKeys.summaryList()).toEqual(['scans', 'summaries', { limit: undefined }])
    })

    it('generates details key', () => {
      expect(scanKeys.details()).toEqual(['scans', 'detail'])
    })

    it('generates detail key with id', () => {
      expect(scanKeys.detail(123)).toEqual(['scans', 'detail', 123])
    })

    it('generates reports key', () => {
      expect(scanKeys.reports(123)).toEqual(['scans', 'reports', 123])
    })

    it('generates reports by host key', () => {
      expect(scanKeys.reportsByHost(123, '192.168.1.1')).toEqual([
        'scans',
        'reports',
        123,
        '192.168.1.1',
      ])
    })
  })

  describe('key uniqueness', () => {
    it('different parameters produce different keys', () => {
      const key1 = JSON.stringify(scanKeys.list({ limit: 10 }))
      const key2 = JSON.stringify(scanKeys.list({ limit: 20 }))
      expect(key1).not.toEqual(key2)
    })

    it('same parameters produce same keys', () => {
      const key1 = JSON.stringify(scanKeys.detail(123))
      const key2 = JSON.stringify(scanKeys.detail(123))
      expect(key1).toEqual(key2)
    })
  })
})

describe('useScans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('fetches scans with default options', async () => {
    const mockScans = [
      { scans_id: 1, target_str: '192.168.1.0/24' },
      { scans_id: 2, target_str: '10.0.0.0/24' },
    ]
    mockDb.getScans.mockResolvedValue(mockScans)

    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useScans(), {
      wrapper: createHookWrapper(queryClient),
    })

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    // Wait for data
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockScans)
    expect(mockDb.getScans).toHaveBeenCalledWith(undefined)
  })

  it('fetches scans with limit and offset', async () => {
    const mockScans = [{ scans_id: 1 }]
    mockDb.getScans.mockResolvedValue(mockScans)

    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useScans({ limit: 10, offset: 5 }), {
      wrapper: createHookWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockDb.getScans).toHaveBeenCalledWith({ limit: 10, offset: 5 })
  })

  it('handles fetch errors', async () => {
    const error = new Error('Database error')
    mockDb.getScans.mockRejectedValue(error)

    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useScans(), {
      wrapper: createHookWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toEqual(error)
  })
})

describe('useScan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches single scan by id', async () => {
    const mockScan = { scans_id: 123, target_str: '192.168.1.0/24' }
    mockDb.getScan.mockResolvedValue(mockScan)

    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useScan(123), {
      wrapper: createHookWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockScan)
    expect(mockDb.getScan).toHaveBeenCalledWith(123)
  })

  it('is disabled when scansId is 0', async () => {
    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useScan(0), {
      wrapper: createHookWrapper(queryClient),
    })

    // Should not fetch when disabled
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockDb.getScan).not.toHaveBeenCalled()
  })

  it('is disabled when scansId is negative', async () => {
    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useScan(-1), {
      wrapper: createHookWrapper(queryClient),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(mockDb.getScan).not.toHaveBeenCalled()
  })

  it('handles null response for non-existent scan', async () => {
    mockDb.getScan.mockResolvedValue(null)

    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useScan(999), {
      wrapper: createHookWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toBeNull()
  })
})

describe('useScanSummaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches scan summaries', async () => {
    const mockSummaries = [
      { scans_id: 1, host_count: 10, port_count: 50 },
      { scans_id: 2, host_count: 5, port_count: 25 },
    ]
    mockDb.getScanSummaries.mockResolvedValue(mockSummaries)

    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useScanSummaries(10), {
      wrapper: createHookWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockSummaries)
    expect(mockDb.getScanSummaries).toHaveBeenCalledWith({ limit: 10 })
  })
})

describe('useIpReports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches IP reports for a scan', async () => {
    const mockReports = [
      { host_addr: '192.168.1.1', port_count: 3 },
      { host_addr: '192.168.1.2', port_count: 5 },
    ]
    mockDb.getIpReports.mockResolvedValue(mockReports)

    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useIpReports(123), {
      wrapper: createHookWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockReports)
    expect(mockDb.getIpReports).toHaveBeenCalledWith(123)
  })

  it('is disabled when scansId is 0', () => {
    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useIpReports(0), {
      wrapper: createHookWrapper(queryClient),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(mockDb.getIpReports).not.toHaveBeenCalled()
  })
})
