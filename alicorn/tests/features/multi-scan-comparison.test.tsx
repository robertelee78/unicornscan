/**
 * Unit tests for multi-scan comparison logic
 *
 * Tests useMultiScanComparison hook and useSavedComparisons hook.
 * Tests cover: 2-scan comparison, N-scan comparison, presence tracking,
 * first/last seen, TTL changes, banner changes, and localStorage CRUD.
 *
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Scan, IpReport } from '@/types/database'

// =============================================================================
// Mock Database Module
// =============================================================================

// Use vi.hoisted to ensure mocks are available before vi.mock runs
const { mockGetScan, mockGetIpReports, mockGetBannersForScan } = vi.hoisted(() => ({
  mockGetScan: vi.fn(),
  mockGetIpReports: vi.fn(),
  mockGetBannersForScan: vi.fn(),
}))

vi.mock('@/lib/database', () => ({
  getDatabase: () => ({
    getScan: mockGetScan,
    getIpReports: mockGetIpReports,
    getBannersForScan: mockGetBannersForScan,
  }),
}))

// Import after mocking
import { useMultiScanComparison } from '@/features/compare/hooks/useMultiScanComparison'
import {
  useSavedComparisons,
  useSavedComparisonByScanIds,
} from '@/features/compare/hooks/useSavedComparisons'

// =============================================================================
// Test Data Factories
// =============================================================================

function createScan(overrides: Partial<Scan> = {}): Scan {
  return {
    scan_id: 1,
    s_time: 1704067200, // 2024-01-01 00:00:00
    e_time: 1704067800, // 10 minutes later
    est_e_time: 1704067800,
    senders: 1,
    listeners: 1,
    scan_iter: 1,
    profile: 'default',
    options: 0,
    payload_group: 0,
    dronestr: '',
    covertness: 0,
    modules: '',
    user: 'test',
    pcap_dumpfile: null,
    pcap_readfile: null,
    tickrate: 1000,
    num_hosts: 10,
    num_packets: 1000,
    port_str: '1-1000',
    interface: 'eth0',
    tcpflags: 2, // SYN
    send_opts: 0,
    recv_opts: 0,
    pps: 1000,
    recv_timeout: 5000,
    repeats: 1,
    mode_str: 'TCP SYN',
    mode_flags: 0,
    num_phases: 1,
    scan_metadata: null,
    scan_notes: null,
    target_str: '192.168.1.0/24',
    src_addr: null,
    ...overrides,
  }
}

function createIpReport(overrides: Partial<IpReport> = {}): IpReport {
  return {
    ipreport_id: 1,
    scan_id: 1,
    magic: 0,
    sport: 80,
    dport: 12345,
    proto: 6, // TCP
    type: 0,
    subtype: 0x12, // SYN/ACK
    send_addr: '192.168.1.1',
    host_addr: '192.168.1.100',
    trace_addr: '192.168.1.100',
    ttl: 64,
    tstamp: 1704067200,
    utstamp: 0,
    flags: 0x12,
    mseq: 0,
    tseq: 0,
    window_size: 65535,
    t_tstamp: 0,
    m_tstamp: 0,
    eth_hwaddr: null,
    extra_data: null,
    ...overrides,
  }
}

// =============================================================================
// Test Wrapper
// =============================================================================

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  })

  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

// =============================================================================
// useMultiScanComparison Tests
// =============================================================================

describe('useMultiScanComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('2-scan comparison', () => {
    it('returns null when less than 2 scan IDs provided', async () => {
      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useMultiScanComparison([1]), { wrapper })

      // Query should be disabled, data should be undefined
      expect(result.current.isLoading).toBe(false)
      expect(result.current.data).toBeUndefined()
    })

    it('compares two scans and identifies added host', async () => {
      const scan1 = createScan({ scan_id: 1, s_time: 1000 })
      const scan2 = createScan({ scan_id: 2, s_time: 2000 })

      // Scan 1: Only host A
      const reports1 = [
        createIpReport({ ipreport_id: 1, scan_id: 1, host_addr: '192.168.1.100', sport: 80 }),
      ]
      // Scan 2: Host A + new Host B
      const reports2 = [
        createIpReport({ ipreport_id: 2, scan_id: 2, host_addr: '192.168.1.100', sport: 80 }),
        createIpReport({ ipreport_id: 3, scan_id: 2, host_addr: '192.168.1.101', sport: 22 }),
      ]

      mockGetScan.mockImplementation((id) => {
        if (id === 1) return Promise.resolve(scan1)
        if (id === 2) return Promise.resolve(scan2)
        return Promise.resolve(null)
      })
      mockGetIpReports.mockImplementation((scanId) => {
        if (scanId === 1) return Promise.resolve(reports1)
        if (scanId === 2) return Promise.resolve(reports2)
        return Promise.resolve([])
      })
      mockGetBannersForScan.mockResolvedValue(new Map())

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useMultiScanComparison([1, 2]), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.data).not.toBeNull()
      const data = result.current.data!

      // 2 scans
      expect(data.scans.length).toBe(2)
      // Chronological order
      expect(data.scans[0].scan_id).toBe(1)
      expect(data.scans[1].scan_id).toBe(2)

      // 2 unique hosts
      expect(data.hostDiffs.length).toBe(2)

      // Host A: present in both
      const hostA = data.hostDiffs.find((h) => h.ipAddr === '192.168.1.100')!
      expect(hostA.presentCount).toBe(2)
      expect(hostA.firstSeenScanId).toBe(1)
      expect(hostA.lastSeenScanId).toBe(2)
      expect(hostA.hasChanges).toBe(false)

      // Host B: only in scan 2 (added)
      const hostB = data.hostDiffs.find((h) => h.ipAddr === '192.168.1.101')!
      expect(hostB.presentCount).toBe(1)
      expect(hostB.firstSeenScanId).toBe(2)
      expect(hostB.lastSeenScanId).toBe(2)
      expect(hostB.hasChanges).toBe(true) // absent -> present
    })

    it('compares two scans and identifies removed host', async () => {
      const scan1 = createScan({ scan_id: 1, s_time: 1000 })
      const scan2 = createScan({ scan_id: 2, s_time: 2000 })

      // Scan 1: Host A + Host B
      const reports1 = [
        createIpReport({ ipreport_id: 1, scan_id: 1, host_addr: '192.168.1.100', sport: 80 }),
        createIpReport({ ipreport_id: 2, scan_id: 1, host_addr: '192.168.1.101', sport: 22 }),
      ]
      // Scan 2: Only Host A (Host B removed)
      const reports2 = [
        createIpReport({ ipreport_id: 3, scan_id: 2, host_addr: '192.168.1.100', sport: 80 }),
      ]

      mockGetScan.mockImplementation((id) =>
        Promise.resolve(id === 1 ? scan1 : id === 2 ? scan2 : null)
      )
      mockGetIpReports.mockImplementation((scanId) =>
        Promise.resolve(scanId === 1 ? reports1 : scanId === 2 ? reports2 : [])
      )
      mockGetBannersForScan.mockResolvedValue(new Map())

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useMultiScanComparison([1, 2]), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const data = result.current.data!

      // Host B: only in scan 1 (removed in scan 2)
      const hostB = data.hostDiffs.find((h) => h.ipAddr === '192.168.1.101')!
      expect(hostB.presentCount).toBe(1)
      expect(hostB.firstSeenScanId).toBe(1)
      expect(hostB.lastSeenScanId).toBe(1)
      expect(hostB.hasChanges).toBe(true) // present -> absent
      expect(hostB.presence[0].status).toBe('present')
      expect(hostB.presence[1].status).toBe('absent')
    })

    it('identifies added and removed ports on same host', async () => {
      const scan1 = createScan({ scan_id: 1, s_time: 1000 })
      const scan2 = createScan({ scan_id: 2, s_time: 2000 })

      // Scan 1: Host A with ports 80, 443
      const reports1 = [
        createIpReport({ ipreport_id: 1, scan_id: 1, host_addr: '192.168.1.100', sport: 80 }),
        createIpReport({ ipreport_id: 2, scan_id: 1, host_addr: '192.168.1.100', sport: 443 }),
      ]
      // Scan 2: Host A with ports 80, 22 (443 removed, 22 added)
      const reports2 = [
        createIpReport({ ipreport_id: 3, scan_id: 2, host_addr: '192.168.1.100', sport: 80 }),
        createIpReport({ ipreport_id: 4, scan_id: 2, host_addr: '192.168.1.100', sport: 22 }),
      ]

      mockGetScan.mockImplementation((id) =>
        Promise.resolve(id === 1 ? scan1 : id === 2 ? scan2 : null)
      )
      mockGetIpReports.mockImplementation((scanId) =>
        Promise.resolve(scanId === 1 ? reports1 : scanId === 2 ? reports2 : [])
      )
      mockGetBannersForScan.mockResolvedValue(new Map())

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useMultiScanComparison([1, 2]), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const data = result.current.data!
      const hostA = data.hostDiffs.find((h) => h.ipAddr === '192.168.1.100')!

      expect(hostA.portDiffs.length).toBe(3) // 22, 80, 443

      // Port 80: unchanged (present in both)
      const port80 = hostA.portDiffs.find((p) => p.port === 80)!
      expect(port80.presentCount).toBe(2)
      expect(port80.hasChanges).toBe(false)

      // Port 443: removed (only in scan 1)
      const port443 = hostA.portDiffs.find((p) => p.port === 443)!
      expect(port443.presentCount).toBe(1)
      expect(port443.hasChanges).toBe(true)
      expect(port443.firstSeenScanId).toBe(1)
      expect(port443.lastSeenScanId).toBe(1)

      // Port 22: added (only in scan 2)
      const port22 = hostA.portDiffs.find((p) => p.port === 22)!
      expect(port22.presentCount).toBe(1)
      expect(port22.hasChanges).toBe(true)
      expect(port22.firstSeenScanId).toBe(2)
      expect(port22.lastSeenScanId).toBe(2)
    })
  })

  describe('N-scan comparison (5 scans)', () => {
    it('tracks presence across 5 scans with intermittent availability', async () => {
      const scans = [
        createScan({ scan_id: 1, s_time: 1000 }),
        createScan({ scan_id: 2, s_time: 2000 }),
        createScan({ scan_id: 3, s_time: 3000 }),
        createScan({ scan_id: 4, s_time: 4000 }),
        createScan({ scan_id: 5, s_time: 5000 }),
      ]

      // Host appears: scan 1, 2, 4 (not in 3, 5) - intermittent
      const reportMap: Record<number, IpReport[]> = {
        1: [createIpReport({ ipreport_id: 1, scan_id: 1, host_addr: '192.168.1.100', sport: 80 })],
        2: [createIpReport({ ipreport_id: 2, scan_id: 2, host_addr: '192.168.1.100', sport: 80 })],
        3: [], // Host absent
        4: [createIpReport({ ipreport_id: 3, scan_id: 4, host_addr: '192.168.1.100', sport: 80 })],
        5: [], // Host absent again
      }

      mockGetScan.mockImplementation((id) => Promise.resolve(scans.find((s) => s.scan_id === id) || null))
      mockGetIpReports.mockImplementation((scanId) => Promise.resolve(reportMap[scanId] || []))
      mockGetBannersForScan.mockResolvedValue(new Map())

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useMultiScanComparison([1, 2, 3, 4, 5]), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const data = result.current.data!

      expect(data.scans.length).toBe(5)
      expect(data.hostDiffs.length).toBe(1)

      const host = data.hostDiffs[0]
      expect(host.presentCount).toBe(3) // Present in 3 of 5 scans
      expect(host.firstSeenScanId).toBe(1)
      expect(host.lastSeenScanId).toBe(4)
      expect(host.hasChanges).toBe(true) // Status changed between scans

      // Verify presence array
      expect(host.presence).toHaveLength(5)
      expect(host.presence[0].status).toBe('present') // scan 1
      expect(host.presence[1].status).toBe('present') // scan 2
      expect(host.presence[2].status).toBe('absent') // scan 3
      expect(host.presence[3].status).toBe('present') // scan 4
      expect(host.presence[4].status).toBe('absent') // scan 5

      // Summary should reflect this
      expect(data.summary.scanCount).toBe(5)
      expect(data.summary.totalHosts).toBe(1)
      expect(data.summary.hostsInAllScans).toBe(0) // Not in all scans
      expect(data.summary.hostsInSomeScans).toBe(1) // In some scans
    })

    it('correctly counts hosts in all scans, some scans, and one scan', async () => {
      const scans = [
        createScan({ scan_id: 1, s_time: 1000 }),
        createScan({ scan_id: 2, s_time: 2000 }),
        createScan({ scan_id: 3, s_time: 3000 }),
      ]

      // Host A: in all 3 scans
      // Host B: in 2 scans (1, 2)
      // Host C: in only 1 scan (3)
      const reportMap: Record<number, IpReport[]> = {
        1: [
          createIpReport({ ipreport_id: 1, scan_id: 1, host_addr: '192.168.1.100', sport: 80 }),
          createIpReport({ ipreport_id: 2, scan_id: 1, host_addr: '192.168.1.101', sport: 22 }),
        ],
        2: [
          createIpReport({ ipreport_id: 3, scan_id: 2, host_addr: '192.168.1.100', sport: 80 }),
          createIpReport({ ipreport_id: 4, scan_id: 2, host_addr: '192.168.1.101', sport: 22 }),
        ],
        3: [
          createIpReport({ ipreport_id: 5, scan_id: 3, host_addr: '192.168.1.100', sport: 80 }),
          createIpReport({ ipreport_id: 6, scan_id: 3, host_addr: '192.168.1.102', sport: 443 }),
        ],
      }

      mockGetScan.mockImplementation((id) => Promise.resolve(scans.find((s) => s.scan_id === id) || null))
      mockGetIpReports.mockImplementation((scanId) => Promise.resolve(reportMap[scanId] || []))
      mockGetBannersForScan.mockResolvedValue(new Map())

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useMultiScanComparison([1, 2, 3]), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const data = result.current.data!

      expect(data.summary.totalHosts).toBe(3)
      expect(data.summary.hostsInAllScans).toBe(1) // Host A
      expect(data.summary.hostsInSomeScans).toBe(1) // Host B (in 2 of 3)
      expect(data.summary.hostsInOneScan).toBe(1) // Host C
    })
  })

  describe('TTL change detection', () => {
    it('detects TTL changes for the same port across scans', async () => {
      const scan1 = createScan({ scan_id: 1, s_time: 1000 })
      const scan2 = createScan({ scan_id: 2, s_time: 2000 })
      const scan3 = createScan({ scan_id: 3, s_time: 3000 })

      // Same host/port but TTL changes: 64 -> 128 -> 64
      const reportMap: Record<number, IpReport[]> = {
        1: [createIpReport({ ipreport_id: 1, scan_id: 1, host_addr: '192.168.1.100', sport: 80, ttl: 64 })],
        2: [createIpReport({ ipreport_id: 2, scan_id: 2, host_addr: '192.168.1.100', sport: 80, ttl: 128 })],
        3: [createIpReport({ ipreport_id: 3, scan_id: 3, host_addr: '192.168.1.100', sport: 80, ttl: 64 })],
      }

      mockGetScan.mockImplementation((id) =>
        Promise.resolve(id === 1 ? scan1 : id === 2 ? scan2 : id === 3 ? scan3 : null)
      )
      mockGetIpReports.mockImplementation((scanId) => Promise.resolve(reportMap[scanId] || []))
      mockGetBannersForScan.mockResolvedValue(new Map())

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useMultiScanComparison([1, 2, 3]), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const data = result.current.data!
      const host = data.hostDiffs[0]
      const port80 = host.portDiffs.find((p) => p.port === 80)!

      expect(port80.hasTtlChanges).toBe(true)
      expect(port80.ttlValues).toEqual([64, 128, 64])
      expect(data.summary.portsWithTtlChanges).toBe(1)
    })

    it('no TTL change when TTL is consistent', async () => {
      const scan1 = createScan({ scan_id: 1, s_time: 1000 })
      const scan2 = createScan({ scan_id: 2, s_time: 2000 })

      // Same TTL in both scans
      const reportMap: Record<number, IpReport[]> = {
        1: [createIpReport({ ipreport_id: 1, scan_id: 1, host_addr: '192.168.1.100', sport: 80, ttl: 64 })],
        2: [createIpReport({ ipreport_id: 2, scan_id: 2, host_addr: '192.168.1.100', sport: 80, ttl: 64 })],
      }

      mockGetScan.mockImplementation((id) => Promise.resolve(id === 1 ? scan1 : id === 2 ? scan2 : null))
      mockGetIpReports.mockImplementation((scanId) => Promise.resolve(reportMap[scanId] || []))
      mockGetBannersForScan.mockResolvedValue(new Map())

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useMultiScanComparison([1, 2]), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const data = result.current.data!
      const host = data.hostDiffs[0]
      const port80 = host.portDiffs.find((p) => p.port === 80)!

      expect(port80.hasTtlChanges).toBe(false)
      expect(port80.ttlValues).toEqual([64, 64])
      expect(data.summary.portsWithTtlChanges).toBe(0)
    })
  })

  describe('banner change detection', () => {
    it('detects banner changes across scans', async () => {
      const scan1 = createScan({ scan_id: 1, s_time: 1000 })
      const scan2 = createScan({ scan_id: 2, s_time: 2000 })

      const reportMap: Record<number, IpReport[]> = {
        1: [createIpReport({ ipreport_id: 1, scan_id: 1, host_addr: '192.168.1.100', sport: 80 })],
        2: [createIpReport({ ipreport_id: 2, scan_id: 2, host_addr: '192.168.1.100', sport: 80 })],
      }

      // Banner changes from Apache 2.4.41 to Apache 2.4.51
      const bannerMap1 = new Map([[1, 'Apache/2.4.41 (Ubuntu)']])
      const bannerMap2 = new Map([[2, 'Apache/2.4.51 (Ubuntu)']])

      mockGetScan.mockImplementation((id) => Promise.resolve(id === 1 ? scan1 : id === 2 ? scan2 : null))
      mockGetIpReports.mockImplementation((scanId) => Promise.resolve(reportMap[scanId] || []))
      mockGetBannersForScan.mockImplementation((scanId) => {
        if (scanId === 1) return Promise.resolve(bannerMap1)
        if (scanId === 2) return Promise.resolve(bannerMap2)
        return Promise.resolve(new Map())
      })

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useMultiScanComparison([1, 2]), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const data = result.current.data!
      const host = data.hostDiffs[0]
      const port80 = host.portDiffs.find((p) => p.port === 80)!

      expect(port80.hasBanner).toBe(true)
      expect(port80.hasBannerChanges).toBe(true)
      expect(port80.presence[0].info?.banner).toBe('Apache/2.4.41 (Ubuntu)')
      expect(port80.presence[1].info?.banner).toBe('Apache/2.4.51 (Ubuntu)')
      expect(data.summary.portsWithBannerChanges).toBe(1)
      expect(data.summary.portsWithBanners).toBe(1)
    })

    it('detects banner appearing in later scan', async () => {
      const scan1 = createScan({ scan_id: 1, s_time: 1000 })
      const scan2 = createScan({ scan_id: 2, s_time: 2000 })

      const reportMap: Record<number, IpReport[]> = {
        1: [createIpReport({ ipreport_id: 1, scan_id: 1, host_addr: '192.168.1.100', sport: 80 })],
        2: [createIpReport({ ipreport_id: 2, scan_id: 2, host_addr: '192.168.1.100', sport: 80 })],
      }

      // No banner in scan 1, banner appears in scan 2
      const bannerMap1 = new Map<number, string>()
      const bannerMap2 = new Map([[2, 'nginx/1.18.0']])

      mockGetScan.mockImplementation((id) => Promise.resolve(id === 1 ? scan1 : id === 2 ? scan2 : null))
      mockGetIpReports.mockImplementation((scanId) => Promise.resolve(reportMap[scanId] || []))
      mockGetBannersForScan.mockImplementation((scanId) => {
        if (scanId === 1) return Promise.resolve(bannerMap1)
        if (scanId === 2) return Promise.resolve(bannerMap2)
        return Promise.resolve(new Map())
      })

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useMultiScanComparison([1, 2]), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const data = result.current.data!
      const host = data.hostDiffs[0]
      const port80 = host.portDiffs.find((p) => p.port === 80)!

      expect(port80.hasBanner).toBe(true)
      expect(port80.presence[0].info?.banner).toBeUndefined()
      expect(port80.presence[1].info?.banner).toBe('nginx/1.18.0')
    })

    it('detects banner disappearing in later scan', async () => {
      const scan1 = createScan({ scan_id: 1, s_time: 1000 })
      const scan2 = createScan({ scan_id: 2, s_time: 2000 })

      const reportMap: Record<number, IpReport[]> = {
        1: [createIpReport({ ipreport_id: 1, scan_id: 1, host_addr: '192.168.1.100', sport: 80 })],
        2: [createIpReport({ ipreport_id: 2, scan_id: 2, host_addr: '192.168.1.100', sport: 80 })],
      }

      // Banner in scan 1, no banner in scan 2
      const bannerMap1 = new Map([[1, 'Apache/2.4.41']])
      const bannerMap2 = new Map<number, string>()

      mockGetScan.mockImplementation((id) => Promise.resolve(id === 1 ? scan1 : id === 2 ? scan2 : null))
      mockGetIpReports.mockImplementation((scanId) => Promise.resolve(reportMap[scanId] || []))
      mockGetBannersForScan.mockImplementation((scanId) => {
        if (scanId === 1) return Promise.resolve(bannerMap1)
        if (scanId === 2) return Promise.resolve(bannerMap2)
        return Promise.resolve(new Map())
      })

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useMultiScanComparison([1, 2]), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const data = result.current.data!
      const host = data.hostDiffs[0]
      const port80 = host.portDiffs.find((p) => p.port === 80)!

      expect(port80.hasBanner).toBe(true)
      expect(port80.hasBannerChanges).toBe(true) // Banner disappeared
      expect(port80.presence[0].info?.banner).toBe('Apache/2.4.41')
      expect(port80.presence[1].info?.banner).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('handles invalid scan IDs gracefully', async () => {
      mockGetScan.mockResolvedValue(null) // All scan IDs invalid

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useMultiScanComparison([999, 1000]), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      // Returns null when < 2 valid scans
      expect(result.current.data).toBeNull()
    })

    it('handles empty scan (no reports)', async () => {
      const scan1 = createScan({ scan_id: 1, s_time: 1000 })
      const scan2 = createScan({ scan_id: 2, s_time: 2000 })

      // Both scans exist but have no IP reports
      mockGetScan.mockImplementation((id) =>
        Promise.resolve(id === 1 ? scan1 : id === 2 ? scan2 : null)
      )
      mockGetIpReports.mockResolvedValue([])
      mockGetBannersForScan.mockResolvedValue(new Map())

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useMultiScanComparison([1, 2]), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const data = result.current.data!
      expect(data.hostDiffs).toEqual([])
      expect(data.summary.totalHosts).toBe(0)
      expect(data.summary.totalPorts).toBe(0)
    })

    it('handles single host with no changes', async () => {
      const scan1 = createScan({ scan_id: 1, s_time: 1000 })
      const scan2 = createScan({ scan_id: 2, s_time: 2000 })

      // Identical data in both scans
      const report1 = createIpReport({ ipreport_id: 1, scan_id: 1, host_addr: '192.168.1.100', sport: 80, ttl: 64 })
      const report2 = createIpReport({ ipreport_id: 2, scan_id: 2, host_addr: '192.168.1.100', sport: 80, ttl: 64 })

      mockGetScan.mockImplementation((id) => Promise.resolve(id === 1 ? scan1 : id === 2 ? scan2 : null))
      mockGetIpReports.mockImplementation((scanId) =>
        Promise.resolve(scanId === 1 ? [report1] : scanId === 2 ? [report2] : [])
      )
      mockGetBannersForScan.mockResolvedValue(new Map())

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useMultiScanComparison([1, 2]), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const data = result.current.data!
      const host = data.hostDiffs[0]

      expect(host.hasChanges).toBe(false) // Host unchanged
      expect(host.portDiffs[0].hasChanges).toBe(false) // Port unchanged
      expect(data.summary.portsWithChanges).toBe(0)
    })

    it('sorts scans chronologically regardless of input order', async () => {
      // Provide scan IDs out of chronological order
      const scan1 = createScan({ scan_id: 1, s_time: 3000 }) // Latest
      const scan2 = createScan({ scan_id: 2, s_time: 1000 }) // Earliest
      const scan3 = createScan({ scan_id: 3, s_time: 2000 }) // Middle

      mockGetScan.mockImplementation((id) =>
        Promise.resolve(id === 1 ? scan1 : id === 2 ? scan2 : id === 3 ? scan3 : null)
      )
      mockGetIpReports.mockResolvedValue([])
      mockGetBannersForScan.mockResolvedValue(new Map())

      const wrapper = createTestWrapper()
      // Input order: 1, 2, 3 (not chronological)
      const { result } = renderHook(() => useMultiScanComparison([1, 2, 3]), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const data = result.current.data!
      // Should be sorted by s_time: 2 (1000), 3 (2000), 1 (3000)
      expect(data.scans[0].scan_id).toBe(2)
      expect(data.scans[1].scan_id).toBe(3)
      expect(data.scans[2].scan_id).toBe(1)
    })

    it('sorts hosts by IP address numerically', async () => {
      const scan1 = createScan({ scan_id: 1, s_time: 1000 })

      // IPs that would sort incorrectly as strings
      const reports = [
        createIpReport({ ipreport_id: 1, scan_id: 1, host_addr: '192.168.1.100', sport: 80 }),
        createIpReport({ ipreport_id: 2, scan_id: 1, host_addr: '192.168.1.2', sport: 80 }),
        createIpReport({ ipreport_id: 3, scan_id: 1, host_addr: '192.168.1.20', sport: 80 }),
      ]

      mockGetScan.mockResolvedValue(scan1)
      mockGetIpReports.mockResolvedValue(reports)
      mockGetBannersForScan.mockResolvedValue(new Map())

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useMultiScanComparison([1, 1]), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const data = result.current.data!
      const ips = data.hostDiffs.map((h) => h.ipAddr)
      // Numeric sort: 2, 20, 100
      expect(ips).toEqual(['192.168.1.2', '192.168.1.20', '192.168.1.100'])
    })

    it('distinguishes TCP and UDP ports with same number', async () => {
      const scan1 = createScan({ scan_id: 1, s_time: 1000 })
      const scan2 = createScan({ scan_id: 2, s_time: 2000 })

      // Port 53 TCP in scan 1, Port 53 UDP in scan 2
      const reports1 = [createIpReport({ ipreport_id: 1, scan_id: 1, host_addr: '192.168.1.100', sport: 53, proto: 6 })] // TCP
      const reports2 = [createIpReport({ ipreport_id: 2, scan_id: 2, host_addr: '192.168.1.100', sport: 53, proto: 17 })] // UDP

      mockGetScan.mockImplementation((id) => Promise.resolve(id === 1 ? scan1 : id === 2 ? scan2 : null))
      mockGetIpReports.mockImplementation((scanId) =>
        Promise.resolve(scanId === 1 ? reports1 : scanId === 2 ? reports2 : [])
      )
      mockGetBannersForScan.mockResolvedValue(new Map())

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useMultiScanComparison([1, 2]), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const data = result.current.data!
      const host = data.hostDiffs[0]

      // Should have 2 distinct port entries (53/tcp and 53/udp)
      expect(host.portDiffs.length).toBe(2)

      const tcpPort = host.portDiffs.find((p) => p.protocol === 'tcp')!
      const udpPort = host.portDiffs.find((p) => p.protocol === 'udp')!

      expect(tcpPort.port).toBe(53)
      expect(tcpPort.presence[0].status).toBe('present')
      expect(tcpPort.presence[1].status).toBe('absent')

      expect(udpPort.port).toBe(53)
      expect(udpPort.presence[0].status).toBe('absent')
      expect(udpPort.presence[1].status).toBe('present')
    })
  })
})

// =============================================================================
// useSavedComparisons Tests
// =============================================================================

describe('useSavedComparisons', () => {
  const STORAGE_KEY = 'alicorn_saved_comparisons'

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    // Mock crypto.randomUUID
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-uuid-123')
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('list operations', () => {
    it('returns empty array when no saved comparisons', async () => {
      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useSavedComparisons(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.data).toEqual([])
    })

    it('returns saved comparisons from localStorage', async () => {
      const saved = [
        {
          id: 'abc-123',
          scanIds: [1, 2, 3],
          note: 'Test comparison',
          targetStr: '192.168.1.0/24',
          modeStr: 'TCP SYN',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useSavedComparisons(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.data).toEqual(saved)
    })
  })

  describe('save operations', () => {
    it('saves a new comparison to localStorage', async () => {
      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useSavedComparisons(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const saved = await result.current.save({
        scanIds: [1, 2, 3],
        note: 'New comparison',
        targetStr: '10.0.0.0/8',
        modeStr: 'UDP',
      })

      expect(saved.id).toBe('test-uuid-123')
      expect(saved.scanIds).toEqual([1, 2, 3])
      expect(saved.note).toBe('New comparison')
      expect(saved.targetStr).toBe('10.0.0.0/8')
      expect(saved.modeStr).toBe('UDP')
      expect(saved.createdAt).toBeDefined()

      // Verify in localStorage
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(stored).toHaveLength(1)
      expect(stored[0].id).toBe('test-uuid-123')
    })

    it('updates existing comparison when same scanIds provided', async () => {
      const existingId = 'existing-123'
      const existing = [
        {
          id: existingId,
          scanIds: [1, 2, 3],
          note: 'Original note',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useSavedComparisons(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      // Save with same scanIds but different note
      const updated = await result.current.save({
        scanIds: [1, 2, 3], // Same IDs
        note: 'Updated note',
      })

      // Should update existing, not create new
      expect(updated.id).toBe(existingId)
      expect(updated.note).toBe('Updated note')

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(stored).toHaveLength(1) // Still only 1 comparison
      expect(stored[0].note).toBe('Updated note')
    })

    it('matches scanIds regardless of order', async () => {
      const existing = [
        {
          id: 'existing-123',
          scanIds: [3, 1, 2], // Different order
          note: 'Original',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useSavedComparisons(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      // Save with same IDs but different order
      const updated = await result.current.save({
        scanIds: [1, 2, 3],
        note: 'Updated',
      })

      // Should find and update existing
      expect(updated.id).toBe('existing-123')

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(stored).toHaveLength(1)
    })
  })

  describe('update operations', () => {
    it('updates a comparison note by id', async () => {
      const existing = [
        {
          id: 'update-me',
          scanIds: [1, 2],
          note: 'Original note',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useSavedComparisons(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const updated = await result.current.update({
        id: 'update-me',
        note: 'New note content',
      })

      expect(updated.note).toBe('New note content')
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(existing[0].updatedAt).getTime()
      )
    })

    it('throws error when updating non-existent comparison', async () => {
      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useSavedComparisons(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      await expect(
        result.current.update({ id: 'non-existent', note: 'test' })
      ).rejects.toThrow('not found')
    })
  })

  describe('delete operations', () => {
    it('deletes a comparison by id', async () => {
      const existing = [
        { id: 'keep-me', scanIds: [1, 2], note: 'Keep', createdAt: '', updatedAt: '' },
        { id: 'delete-me', scanIds: [3, 4], note: 'Delete', createdAt: '', updatedAt: '' },
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useSavedComparisons(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      await result.current.remove('delete-me')

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(stored).toHaveLength(1)
      expect(stored[0].id).toBe('keep-me')
    })

    it('throws error when deleting non-existent comparison', async () => {
      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useSavedComparisons(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      await expect(result.current.remove('non-existent')).rejects.toThrow('not found')
    })
  })

  describe('error handling', () => {
    it('handles corrupted localStorage gracefully', async () => {
      localStorage.setItem(STORAGE_KEY, 'not valid json{{{')

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useSavedComparisons(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      // Should return empty array, not throw
      expect(result.current.data).toEqual([])
    })

    it('handles non-array localStorage value', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'an array' }))

      const wrapper = createTestWrapper()
      const { result } = renderHook(() => useSavedComparisons(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.data).toEqual([])
    })
  })
})

// =============================================================================
// useSavedComparisonByScanIds Tests
// =============================================================================

describe('useSavedComparisonByScanIds', () => {
  const STORAGE_KEY = 'alicorn_saved_comparisons'

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('finds saved comparison by scan IDs', async () => {
    const saved = [
      {
        id: 'found-123',
        scanIds: [1, 2, 3],
        note: 'Found me',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))

    const wrapper = createTestWrapper()
    const { result } = renderHook(() => useSavedComparisonByScanIds([1, 2, 3]), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.data).not.toBeNull()
    expect(result.current.data?.id).toBe('found-123')
  })

  it('returns null when no matching comparison', async () => {
    const saved = [
      {
        id: 'other',
        scanIds: [4, 5, 6],
        note: 'Other comparison',
        createdAt: '',
        updatedAt: '',
      },
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))

    const wrapper = createTestWrapper()
    const { result } = renderHook(() => useSavedComparisonByScanIds([1, 2, 3]), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.data).toBeNull()
  })

  it('matches regardless of scan ID order', async () => {
    const saved = [
      {
        id: 'ordered',
        scanIds: [3, 1, 2], // Different order
        note: 'Test',
        createdAt: '',
        updatedAt: '',
      },
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))

    const wrapper = createTestWrapper()
    const { result } = renderHook(() => useSavedComparisonByScanIds([1, 2, 3]), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.data).not.toBeNull()
    expect(result.current.data?.id).toBe('ordered')
  })

  it('is disabled with less than 2 scan IDs', async () => {
    const wrapper = createTestWrapper()
    const { result } = renderHook(() => useSavedComparisonByScanIds([1]), { wrapper })

    // Query should not run
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeUndefined()
  })
})
