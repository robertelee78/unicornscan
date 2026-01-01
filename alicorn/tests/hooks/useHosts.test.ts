/**
 * Unit tests for src/hooks/useHosts.ts
 * Tests React Query hooks for host data
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { hostKeys, useHosts, useHost, useHostByIp, useHostSummaries } from '@/hooks/useHosts'
import { createHookWrapper, createTestQueryClient } from '../test-utils'

// Mock the database module
vi.mock('@/lib/database', () => {
  const mockDb = {
    getHosts: vi.fn(),
    getHost: vi.fn(),
    getHostByIp: vi.fn(),
    getHostSummaries: vi.fn(),
  }
  return {
    getDatabase: () => mockDb,
    __mockDb: mockDb,
  }
})

// Import after mocking
import { getDatabase } from '@/lib/database'

const mockDb = getDatabase() as unknown as {
  getHosts: ReturnType<typeof vi.fn>
  getHost: ReturnType<typeof vi.fn>
  getHostByIp: ReturnType<typeof vi.fn>
  getHostSummaries: ReturnType<typeof vi.fn>
}

describe('hostKeys', () => {
  describe('query key factory', () => {
    it('generates base key', () => {
      expect(hostKeys.all).toEqual(['hosts'])
    })

    it('generates lists key', () => {
      expect(hostKeys.lists()).toEqual(['hosts', 'list'])
    })

    it('generates list key with limit', () => {
      expect(hostKeys.list(10)).toEqual(['hosts', 'list', { limit: 10 }])
      expect(hostKeys.list()).toEqual(['hosts', 'list', { limit: undefined }])
    })

    it('generates summaries key', () => {
      expect(hostKeys.summaries()).toEqual(['hosts', 'summaries'])
    })

    it('generates summary list key with scansId', () => {
      expect(hostKeys.summaryList(123)).toEqual(['hosts', 'summaries', 123])
      expect(hostKeys.summaryList()).toEqual(['hosts', 'summaries', undefined])
    })

    it('generates details key', () => {
      expect(hostKeys.details()).toEqual(['hosts', 'detail'])
    })

    it('generates detail key with id', () => {
      expect(hostKeys.detail(456)).toEqual(['hosts', 'detail', 456])
    })

    it('generates byIp key', () => {
      expect(hostKeys.byIp('192.168.1.1')).toEqual(['hosts', 'ip', '192.168.1.1'])
    })
  })

  describe('key hierarchy', () => {
    it('lists key starts with all key', () => {
      expect(hostKeys.lists()[0]).toBe(hostKeys.all[0])
    })

    it('detail key starts with details key', () => {
      expect(hostKeys.detail(1).slice(0, 2)).toEqual(hostKeys.details())
    })
  })
})

describe('useHosts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches hosts list', async () => {
    const mockHosts = [
      { host_id: 1, addr: '192.168.1.1' },
      { host_id: 2, addr: '192.168.1.2' },
    ]
    mockDb.getHosts.mockResolvedValue(mockHosts)

    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useHosts(), {
      wrapper: createHookWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockHosts)
    expect(mockDb.getHosts).toHaveBeenCalledWith({ limit: undefined })
  })

  it('fetches hosts with limit', async () => {
    const mockHosts = [{ host_id: 1, addr: '192.168.1.1' }]
    mockDb.getHosts.mockResolvedValue(mockHosts)

    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useHosts(5), {
      wrapper: createHookWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockDb.getHosts).toHaveBeenCalledWith({ limit: 5 })
  })

  it('handles errors', async () => {
    const error = new Error('Failed to fetch hosts')
    mockDb.getHosts.mockRejectedValue(error)

    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useHosts(), {
      wrapper: createHookWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toEqual(error)
  })
})

describe('useHost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches single host by id', async () => {
    const mockHost = { host_id: 123, addr: '192.168.1.100' }
    mockDb.getHost.mockResolvedValue(mockHost)

    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useHost(123), {
      wrapper: createHookWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockHost)
    expect(mockDb.getHost).toHaveBeenCalledWith(123)
  })

  it('is disabled when hostId is 0', () => {
    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useHost(0), {
      wrapper: createHookWrapper(queryClient),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(mockDb.getHost).not.toHaveBeenCalled()
  })

  it('is disabled when hostId is negative', () => {
    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useHost(-1), {
      wrapper: createHookWrapper(queryClient),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(mockDb.getHost).not.toHaveBeenCalled()
  })

  it('returns null for non-existent host', async () => {
    mockDb.getHost.mockResolvedValue(null)

    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useHost(999), {
      wrapper: createHookWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toBeNull()
  })
})

describe('useHostByIp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches host by IP address', async () => {
    const mockHost = { host_id: 1, addr: '192.168.1.1' }
    mockDb.getHostByIp.mockResolvedValue(mockHost)

    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useHostByIp('192.168.1.1'), {
      wrapper: createHookWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockHost)
    expect(mockDb.getHostByIp).toHaveBeenCalledWith('192.168.1.1')
  })

  it('is disabled when ip is empty', () => {
    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useHostByIp(''), {
      wrapper: createHookWrapper(queryClient),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(mockDb.getHostByIp).not.toHaveBeenCalled()
  })
})

describe('useHostSummaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches host summaries without scansId', async () => {
    const mockSummaries = [
      { host_id: 1, port_count: 10 },
      { host_id: 2, port_count: 5 },
    ]
    mockDb.getHostSummaries.mockResolvedValue(mockSummaries)

    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useHostSummaries(), {
      wrapper: createHookWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockSummaries)
    expect(mockDb.getHostSummaries).toHaveBeenCalledWith(undefined)
  })

  it('fetches host summaries for specific scan', async () => {
    const mockSummaries = [{ host_id: 1, port_count: 10 }]
    mockDb.getHostSummaries.mockResolvedValue(mockSummaries)

    const queryClient = createTestQueryClient()
    const { result } = renderHook(() => useHostSummaries(123), {
      wrapper: createHookWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockDb.getHostSummaries).toHaveBeenCalledWith(123)
  })
})
