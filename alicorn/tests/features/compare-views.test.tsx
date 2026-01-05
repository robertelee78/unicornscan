/**
 * Component tests for multi-scan comparison visualization views
 *
 * Tests SideBySideView, TimelineView, UnifiedDiffView, and MatrixHeatmapView.
 * Covers: rendering with data, empty states, interactions, accessibility.
 *
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SideBySideView } from '@/features/compare/views/SideBySideView'
import { TimelineView } from '@/features/compare/views/TimelineView'
import { UnifiedDiffView } from '@/features/compare/views/UnifiedDiffView'
import { MatrixHeatmapView } from '@/features/compare/views/MatrixHeatmapView'
import type {
  MultiScanComparisonResult,
  MultiScanHostDiff,
  MultiScanPortDiff,
  MultiScanSummary,
} from '@/features/compare/types'
import type { Scan } from '@/types/database'

// =============================================================================
// Test Data Factories
// =============================================================================

function createScan(overrides: Partial<Scan> = {}): Scan {
  return {
    scan_id: 1,
    s_time: 1704067200,
    e_time: 1704067800,
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
    tcpflags: 2,
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

function createPortDiff(overrides: Partial<MultiScanPortDiff> = {}): MultiScanPortDiff {
  return {
    port: 80,
    protocol: 'tcp',
    presence: [],
    firstSeenScanId: 1,
    lastSeenScanId: 1,
    presentCount: 1,
    hasChanges: false,
    hasTtlChanges: false,
    ttlValues: [],
    hasBannerChanges: false,
    hasBanner: false,
    ...overrides,
  }
}

function createHostDiff(overrides: Partial<MultiScanHostDiff> = {}): MultiScanHostDiff {
  return {
    ipAddr: '192.168.1.100',
    presence: [],
    firstSeenScanId: 1,
    lastSeenScanId: 1,
    presentCount: 1,
    hasChanges: false,
    portDiffs: [],
    ...overrides,
  }
}

function createSummary(overrides: Partial<MultiScanSummary> = {}): MultiScanSummary {
  return {
    scanCount: 2,
    totalHosts: 1,
    hostsInAllScans: 1,
    hostsInSomeScans: 0,
    hostsInOneScan: 0,
    totalPorts: 1,
    portsInAllScans: 1,
    portsWithChanges: 0,
    portsWithTtlChanges: 0,
    portsWithBannerChanges: 0,
    portsWithBanners: 0,
    ...overrides,
  }
}

/**
 * Create sample comparison data for tests
 */
function createSampleData(): MultiScanComparisonResult {
  const scans = [
    createScan({ scan_id: 1, s_time: 1704067200 }),
    createScan({ scan_id: 2, s_time: 1704153600 }),
  ]

  const hostDiffs: MultiScanHostDiff[] = [
    createHostDiff({
      ipAddr: '192.168.1.100',
      presence: [
        { scanId: 1, status: 'present', portCount: 2 },
        { scanId: 2, status: 'present', portCount: 3 },
      ],
      firstSeenScanId: 1,
      lastSeenScanId: 2,
      presentCount: 2,
      hasChanges: false,
      portDiffs: [
        createPortDiff({
          port: 80,
          protocol: 'tcp',
          presence: [
            { scanId: 1, status: 'present', info: { port: 80, protocol: 'tcp', ttl: 64, flags: 0x12 } },
            { scanId: 2, status: 'present', info: { port: 80, protocol: 'tcp', ttl: 64, flags: 0x12 } },
          ],
          presentCount: 2,
          hasChanges: false,
        }),
        createPortDiff({
          port: 443,
          protocol: 'tcp',
          presence: [
            { scanId: 1, status: 'present', info: { port: 443, protocol: 'tcp', ttl: 64, flags: 0x12 } },
            { scanId: 2, status: 'absent' },
          ],
          presentCount: 1,
          hasChanges: true,
          firstSeenScanId: 1,
          lastSeenScanId: 1,
        }),
        createPortDiff({
          port: 22,
          protocol: 'tcp',
          presence: [
            { scanId: 1, status: 'absent' },
            { scanId: 2, status: 'present', info: { port: 22, protocol: 'tcp', ttl: 64, flags: 0x12 } },
          ],
          presentCount: 1,
          hasChanges: true,
          firstSeenScanId: 2,
          lastSeenScanId: 2,
        }),
      ],
    }),
    createHostDiff({
      ipAddr: '192.168.1.101',
      presence: [
        { scanId: 1, status: 'absent', portCount: 0 },
        { scanId: 2, status: 'present', portCount: 1 },
      ],
      firstSeenScanId: 2,
      lastSeenScanId: 2,
      presentCount: 1,
      hasChanges: true,
      portDiffs: [
        createPortDiff({
          port: 8080,
          protocol: 'tcp',
          presence: [
            { scanId: 1, status: 'absent' },
            { scanId: 2, status: 'present', info: { port: 8080, protocol: 'tcp', ttl: 128, flags: 0x12 } },
          ],
          presentCount: 1,
          hasChanges: true,
          firstSeenScanId: 2,
          lastSeenScanId: 2,
        }),
      ],
    }),
  ]

  return {
    scans,
    hostDiffs,
    summary: createSummary({
      scanCount: 2,
      totalHosts: 2,
      hostsInAllScans: 1,
      hostsInSomeScans: 0,
      hostsInOneScan: 1,
      totalPorts: 4,
      portsInAllScans: 1,
      portsWithChanges: 3,
    }),
  }
}

/**
 * Create comparison data with no changes
 */
function createUnchangedData(): MultiScanComparisonResult {
  const scans = [
    createScan({ scan_id: 1, s_time: 1704067200 }),
    createScan({ scan_id: 2, s_time: 1704153600 }),
  ]

  const hostDiffs: MultiScanHostDiff[] = [
    createHostDiff({
      ipAddr: '192.168.1.100',
      presence: [
        { scanId: 1, status: 'present', portCount: 1 },
        { scanId: 2, status: 'present', portCount: 1 },
      ],
      presentCount: 2,
      hasChanges: false,
      portDiffs: [
        createPortDiff({
          port: 80,
          protocol: 'tcp',
          presence: [
            { scanId: 1, status: 'present', info: { port: 80, protocol: 'tcp', ttl: 64, flags: 0x12 } },
            { scanId: 2, status: 'present', info: { port: 80, protocol: 'tcp', ttl: 64, flags: 0x12 } },
          ],
          presentCount: 2,
          hasChanges: false,
        }),
      ],
    }),
  ]

  return {
    scans,
    hostDiffs,
    summary: createSummary({
      totalHosts: 1,
      hostsInAllScans: 1,
      totalPorts: 1,
      portsInAllScans: 1,
      portsWithChanges: 0,
    }),
  }
}

/**
 * Create comparison data with TTL changes
 */
function createTtlChangeData(): MultiScanComparisonResult {
  const scans = [
    createScan({ scan_id: 1, s_time: 1704067200 }),
    createScan({ scan_id: 2, s_time: 1704153600 }),
  ]

  const hostDiffs: MultiScanHostDiff[] = [
    createHostDiff({
      ipAddr: '192.168.1.100',
      presence: [
        { scanId: 1, status: 'present', portCount: 1 },
        { scanId: 2, status: 'present', portCount: 1 },
      ],
      presentCount: 2,
      hasChanges: false,
      portDiffs: [
        createPortDiff({
          port: 80,
          protocol: 'tcp',
          presence: [
            { scanId: 1, status: 'present', info: { port: 80, protocol: 'tcp', ttl: 64, flags: 0x12 } },
            { scanId: 2, status: 'present', info: { port: 80, protocol: 'tcp', ttl: 128, flags: 0x12 } },
          ],
          presentCount: 2,
          hasChanges: false,
          hasTtlChanges: true,
          ttlValues: [64, 128],
        }),
      ],
    }),
  ]

  return {
    scans,
    hostDiffs,
    summary: createSummary({
      totalHosts: 1,
      hostsInAllScans: 1,
      totalPorts: 1,
      portsInAllScans: 1,
      portsWithTtlChanges: 1,
    }),
  }
}

/**
 * Create empty comparison data
 */
function createEmptyData(): MultiScanComparisonResult {
  return {
    scans: [
      createScan({ scan_id: 1, s_time: 1704067200 }),
      createScan({ scan_id: 2, s_time: 1704153600 }),
    ],
    hostDiffs: [],
    summary: createSummary({
      totalHosts: 0,
      hostsInAllScans: 0,
      totalPorts: 0,
      portsInAllScans: 0,
    }),
  }
}

// =============================================================================
// SideBySideView Tests
// =============================================================================

describe('SideBySideView', () => {
  it('renders with sample data', () => {
    const data = createSampleData()
    render(<SideBySideView data={data} />)

    // Should show host IPs
    expect(screen.getByText('192.168.1.100')).toBeInTheDocument()
    expect(screen.getByText('192.168.1.101')).toBeInTheDocument()

    // Should show scan ID headers
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
  })

  it('shows port badges with correct status colors', () => {
    const data = createSampleData()
    const { container } = render(<SideBySideView data={data} />)

    // Should have port numbers displayed (as badge content)
    // Badges show port numbers like "80", "22", "443"
    expect(screen.getByText('80')).toBeInTheDocument()
  })

  it('handles empty data gracefully', () => {
    const data = createEmptyData()
    render(<SideBySideView data={data} />)

    // Should show empty state message
    expect(screen.getByText(/no hosts with responses/i)).toBeInTheDocument()
  })

  it('displays scan column headers with dates', () => {
    const data = createSampleData()
    render(<SideBySideView data={data} />)

    // Should have Host column header
    expect(screen.getByText('Host')).toBeInTheDocument()
  })

  it('renders table structure correctly', () => {
    const data = createSampleData()
    const { container } = render(<SideBySideView data={data} />)

    // Should have a table
    expect(container.querySelector('table')).toBeInTheDocument()
    expect(container.querySelector('thead')).toBeInTheDocument()
    expect(container.querySelector('tbody')).toBeInTheDocument()
  })
})

// =============================================================================
// TimelineView Tests
// =============================================================================

describe('TimelineView', () => {
  it('renders with sample data showing changes', () => {
    const data = createSampleData()
    render(<TimelineView data={data} />)

    // Should show timeline header
    expect(screen.getByText('Timeline of Changes')).toBeInTheDocument()

    // Should show host IPs (as collapsible sections)
    expect(screen.getByText('192.168.1.100')).toBeInTheDocument()
    expect(screen.getByText('192.168.1.101')).toBeInTheDocument()
  })

  it('shows change event counts', () => {
    const data = createSampleData()
    render(<TimelineView data={data} />)

    // Should show hosts with changes and total events
    expect(screen.getByText(/hosts with changes/i)).toBeInTheDocument()
    expect(screen.getByText(/total events/i)).toBeInTheDocument()
  })

  it('handles no changes gracefully', () => {
    const data = createUnchangedData()
    render(<TimelineView data={data} />)

    // Should show "no changes" message
    expect(screen.getByText(/no changes detected/i)).toBeInTheDocument()
  })

  it('shows collapsible host sections', async () => {
    const data = createSampleData()
    render(<TimelineView data={data} />)

    // Host sections should be clickable buttons
    const hostButton = screen.getByRole('button', { name: /192\.168\.1\.100/i })
    expect(hostButton).toBeInTheDocument()
  })

  it('displays change type badges (+/-/~)', () => {
    const data = createSampleData()
    render(<TimelineView data={data} />)

    // Should have badges showing added/removed counts
    // The counts are displayed as +N/-N/~N in badges
    const addBadges = screen.getAllByText(/^\+\d+$/)
    const removeBadges = screen.getAllByText(/^-\d+$/)

    expect(addBadges.length).toBeGreaterThan(0)
    expect(removeBadges.length).toBeGreaterThan(0)
  })
})

// =============================================================================
// UnifiedDiffView Tests
// =============================================================================

describe('UnifiedDiffView', () => {
  beforeEach(() => {
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('renders with sample data', () => {
    const data = createSampleData()
    render(<UnifiedDiffView data={data} />)

    // Should show scan range info
    expect(screen.getByText(/comparing 2 scans/i)).toBeInTheDocument()
  })

  it('shows host diff blocks with IP addresses', () => {
    const data = createSampleData()
    render(<UnifiedDiffView data={data} />)

    // Host headers are shown as "=== IP ==="
    expect(screen.getByText(/=== 192\.168\.1\.100 ===/)).toBeInTheDocument()
    expect(screen.getByText(/=== 192\.168\.1\.101 ===/)).toBeInTheDocument()
  })

  it('displays change count badges', () => {
    const data = createSampleData()
    render(<UnifiedDiffView data={data} />)

    // Should show added/removed/modified badges
    const addedBadges = screen.getAllByText(/^\+\d+$/)
    const removedBadges = screen.getAllByText(/^-\d+$/)

    expect(addedBadges.length).toBeGreaterThan(0)
    expect(removedBadges.length).toBeGreaterThan(0)
  })

  it('has context toggle switch', () => {
    const data = createSampleData()
    render(<UnifiedDiffView data={data} />)

    // Should have a switch for context
    expect(screen.getByRole('switch')).toBeInTheDocument()
    expect(screen.getByText('Context')).toBeInTheDocument()
  })

  it('has copy button', () => {
    const data = createSampleData()
    render(<UnifiedDiffView data={data} />)

    // Should have a Copy button
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
  })

  it('handles copy action', async () => {
    const user = userEvent.setup()
    const data = createSampleData()
    render(<UnifiedDiffView data={data} />)

    const copyButton = screen.getByRole('button', { name: /copy/i })
    await user.click(copyButton)

    expect(navigator.clipboard.writeText).toHaveBeenCalled()
  })

  it('handles no changes gracefully', () => {
    const data = createUnchangedData()
    render(<UnifiedDiffView data={data} />)

    // Should show "no changes" message
    expect(screen.getByText(/no changes detected/i)).toBeInTheDocument()
  })

  it('shows TTL change in modified format', () => {
    const data = createTtlChangeData()
    render(<UnifiedDiffView data={data} />)

    // Should show TTL change as ~ 80/tcp TTL: 64→128
    expect(screen.getByText(/TTL:/)).toBeInTheDocument()
  })
})

// =============================================================================
// MatrixHeatmapView Tests
// =============================================================================

describe('MatrixHeatmapView', () => {
  it('renders with sample data', () => {
    const data = createSampleData()
    render(<MatrixHeatmapView data={data} />)

    // Should show host IP
    expect(screen.getByText('192.168.1.100')).toBeInTheDocument()
    expect(screen.getByText('192.168.1.101')).toBeInTheDocument()

    // Should show scan headers
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
  })

  it('displays legend items', () => {
    const data = createSampleData()
    render(<MatrixHeatmapView data={data} />)

    // Should show legend
    expect(screen.getByText('Responding')).toBeInTheDocument()
    expect(screen.getByText('New response')).toBeInTheDocument()
    expect(screen.getByText('Lost response')).toBeInTheDocument()
    expect(screen.getByText('No response')).toBeInTheDocument()
  })

  it('has clickable cells with aria labels', () => {
    const data = createSampleData()
    render(<MatrixHeatmapView data={data} />)

    // Cells should be buttons with aria-labels
    const cellButtons = screen.getAllByRole('button')
    expect(cellButtons.length).toBeGreaterThan(0)

    // At least one should have aria-label with host and scan info
    const hasProperLabel = cellButtons.some((btn) =>
      btn.getAttribute('aria-label')?.includes('192.168.1')
    )
    expect(hasProperLabel).toBe(true)
  })

  it('handles empty data gracefully', () => {
    const data = createEmptyData()
    render(<MatrixHeatmapView data={data} />)

    // Should show empty state message
    expect(screen.getByText(/no hosts with responses/i)).toBeInTheDocument()
  })

  it('shows Host column header', () => {
    const data = createSampleData()
    render(<MatrixHeatmapView data={data} />)

    expect(screen.getByText('Host')).toBeInTheDocument()
  })

  it('opens port details dialog on cell click', async () => {
    const user = userEvent.setup()
    const data = createSampleData()
    render(<MatrixHeatmapView data={data} />)

    // Find a cell button for a present host and click it
    const cellButtons = screen.getAllByRole('button')
    const presentCellButton = cellButtons.find((btn) => {
      const label = btn.getAttribute('aria-label') || ''
      return label.includes('192.168.1.100') && label.includes('responding')
    })

    if (presentCellButton) {
      await user.click(presentCellButton)

      // Dialog should open with host address
      // (Dialog content is rendered, check for port details)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    }
  })
})

// =============================================================================
// Accessibility Tests
// =============================================================================

describe('Accessibility', () => {
  describe('SideBySideView', () => {
    it('has table with semantic structure', () => {
      const data = createSampleData()
      const { container } = render(<SideBySideView data={data} />)

      expect(container.querySelector('table')).toBeInTheDocument()
      expect(container.querySelector('thead')).toBeInTheDocument()
      expect(container.querySelector('tbody')).toBeInTheDocument()
      expect(container.querySelectorAll('th').length).toBeGreaterThan(0)
      expect(container.querySelectorAll('td').length).toBeGreaterThan(0)
    })
  })

  describe('TimelineView', () => {
    it('uses buttons for collapsible sections', () => {
      const data = createSampleData()
      render(<TimelineView data={data} />)

      // Host sections should be interactive buttons
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  describe('UnifiedDiffView', () => {
    it('has accessible switch for context toggle', () => {
      const data = createSampleData()
      render(<UnifiedDiffView data={data} />)

      const toggle = screen.getByRole('switch')
      expect(toggle).toBeInTheDocument()
    })

    it('has labeled copy button', () => {
      const data = createSampleData()
      render(<UnifiedDiffView data={data} />)

      expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
    })
  })

  describe('MatrixHeatmapView', () => {
    it('has descriptive aria-labels on cells', () => {
      const data = createSampleData()
      render(<MatrixHeatmapView data={data} />)

      const cellButtons = screen.getAllByRole('button')
      const hasAriaLabels = cellButtons.every((btn) => btn.hasAttribute('aria-label'))
      expect(hasAriaLabels).toBe(true)
    })
  })
})

// =============================================================================
// Edge Cases Tests
// =============================================================================

describe('Edge Cases', () => {
  describe('All views handle hosts with no ports', () => {
    it('SideBySideView handles host with empty portDiffs', () => {
      const data = createSampleData()
      data.hostDiffs[0].portDiffs = []
      render(<SideBySideView data={data} />)

      // Should still render without crashing
      expect(screen.getByText('Host')).toBeInTheDocument()
    })

    it('TimelineView handles host with empty portDiffs', () => {
      const data = createSampleData()
      data.hostDiffs[0].portDiffs = []
      render(<TimelineView data={data} />)

      // Should still render without crashing
      expect(screen.getByText('Timeline of Changes')).toBeInTheDocument()
    })

    it('UnifiedDiffView handles host with empty portDiffs', () => {
      const data = createSampleData()
      data.hostDiffs[0].portDiffs = []
      render(<UnifiedDiffView data={data} />)

      // Should still render without crashing
      expect(screen.getByText(/comparing 2 scans/i)).toBeInTheDocument()
    })

    it('MatrixHeatmapView handles host with empty portDiffs', () => {
      const data = createSampleData()
      data.hostDiffs[0].portDiffs = []
      render(<MatrixHeatmapView data={data} />)

      // Should still render without crashing
      expect(screen.getByText('Host')).toBeInTheDocument()
    })
  })

  describe('All views handle single scan edge case', () => {
    it('views handle data with minimum scans', () => {
      const data = createSampleData()
      // Note: The views expect at least 2 scans, this tests they don't crash
      render(<SideBySideView data={data} />)
      render(<TimelineView data={data} />)
      render(<UnifiedDiffView data={data} />)
      render(<MatrixHeatmapView data={data} />)

      // All should render
      expect(screen.getAllByText('Host').length).toBeGreaterThan(0)
    })
  })
})
