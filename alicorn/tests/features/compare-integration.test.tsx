/**
 * Integration tests for scan comparison workflow
 *
 * Tests the full user journey through comparison features:
 * - Dashboard rendering and view switching
 * - Header interactions (notes, bookmarks, export)
 * - Export functionality
 *
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { ComparisonDashboard } from '@/features/compare/ComparisonDashboard'
import { ComparisonHeader, type ExportFormat } from '@/features/compare/ComparisonHeader'
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
    scanCount: 3,
    totalHosts: 2,
    hostsInAllScans: 1,
    hostsInSomeScans: 1,
    hostsInOneScan: 0,
    totalPorts: 4,
    portsInAllScans: 2,
    portsWithChanges: 2,
    portsWithTtlChanges: 1,
    portsWithBannerChanges: 0,
    portsWithBanners: 0,
    ...overrides,
  }
}

/**
 * Create comprehensive sample data for integration tests
 */
function createIntegrationTestData(): MultiScanComparisonResult {
  const scans = [
    createScan({ scan_id: 1, s_time: 1704067200 }),
    createScan({ scan_id: 2, s_time: 1704153600 }),
    createScan({ scan_id: 3, s_time: 1704240000 }),
  ]

  const hostDiffs: MultiScanHostDiff[] = [
    createHostDiff({
      ipAddr: '192.168.1.100',
      presence: [
        { scanId: 1, status: 'present', portCount: 2 },
        { scanId: 2, status: 'present', portCount: 3 },
        { scanId: 3, status: 'present', portCount: 2 },
      ],
      firstSeenScanId: 1,
      lastSeenScanId: 3,
      presentCount: 3,
      hasChanges: true,
      portDiffs: [
        createPortDiff({
          port: 80,
          protocol: 'tcp',
          presence: [
            { scanId: 1, status: 'present', info: { port: 80, protocol: 'tcp', ttl: 64, flags: 0x12 } },
            { scanId: 2, status: 'present', info: { port: 80, protocol: 'tcp', ttl: 64, flags: 0x12 } },
            { scanId: 3, status: 'present', info: { port: 80, protocol: 'tcp', ttl: 64, flags: 0x12 } },
          ],
          presentCount: 3,
          hasChanges: false,
        }),
        createPortDiff({
          port: 443,
          protocol: 'tcp',
          presence: [
            { scanId: 1, status: 'present', info: { port: 443, protocol: 'tcp', ttl: 64, flags: 0x12 } },
            { scanId: 2, status: 'present', info: { port: 443, protocol: 'tcp', ttl: 64, flags: 0x12 } },
            { scanId: 3, status: 'present', info: { port: 443, protocol: 'tcp', ttl: 64, flags: 0x12 } },
          ],
          presentCount: 3,
          hasChanges: false,
        }),
        createPortDiff({
          port: 22,
          protocol: 'tcp',
          presence: [
            { scanId: 1, status: 'absent' },
            { scanId: 2, status: 'present', info: { port: 22, protocol: 'tcp', ttl: 64, flags: 0x12 } },
            { scanId: 3, status: 'absent' },
          ],
          firstSeenScanId: 2,
          lastSeenScanId: 2,
          presentCount: 1,
          hasChanges: true,
        }),
      ],
    }),
    createHostDiff({
      ipAddr: '192.168.1.101',
      presence: [
        { scanId: 1, status: 'absent' },
        { scanId: 2, status: 'present', portCount: 1 },
        { scanId: 3, status: 'present', portCount: 1 },
      ],
      firstSeenScanId: 2,
      lastSeenScanId: 3,
      presentCount: 2,
      hasChanges: true,
      portDiffs: [
        createPortDiff({
          port: 8080,
          protocol: 'tcp',
          presence: [
            { scanId: 1, status: 'absent' },
            { scanId: 2, status: 'present', info: { port: 8080, protocol: 'tcp', ttl: 128, flags: 0x12 } },
            { scanId: 3, status: 'present', info: { port: 8080, protocol: 'tcp', ttl: 128, flags: 0x12 } },
          ],
          firstSeenScanId: 2,
          lastSeenScanId: 3,
          presentCount: 2,
          hasChanges: true,
        }),
      ],
    }),
  ]

  return {
    scans,
    hostDiffs,
    summary: createSummary(),
  }
}

// =============================================================================
// Mocks
// =============================================================================

// Mock the useMultiScanComparison hook
const mockComparisonData = createIntegrationTestData()

vi.mock('@/features/compare/hooks', () => ({
  useMultiScanComparison: vi.fn(() => ({
    data: mockComparisonData,
    isLoading: false,
    error: null,
  })),
  useSavedComparisons: vi.fn(() => ({
    comparisons: [],
    saveComparison: vi.fn(),
    deleteComparison: vi.fn(),
    updateComparison: vi.fn(),
  })),
}))

// Mock clipboard API
const clipboardMock = {
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue(''),
}

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: clipboardMock,
    writable: true,
    configurable: true,
  })
  vi.clearAllMocks()
})

// =============================================================================
// Test Utilities
// =============================================================================

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// =============================================================================
// ComparisonDashboard Integration Tests
// =============================================================================

describe('ComparisonDashboard Integration', () => {
  const testScanIds = [1, 2, 3]

  it('renders all four view options', async () => {
    renderWithProviders(<ComparisonDashboard scanIds={testScanIds} />)

    // Check primary view header
    expect(screen.getByText('Side by Side')).toBeInTheDocument()
    expect(screen.getByText('Columns for each scan, rows for hosts')).toBeInTheDocument()

    // Check thumbnail cards (may have multiple elements due to placeholders)
    const timelineElements = screen.getAllByText('Timeline')
    expect(timelineElements.length).toBeGreaterThan(0)

    const diffElements = screen.getAllByText('Unified Diff')
    expect(diffElements.length).toBeGreaterThan(0)

    const matrixElements = screen.getAllByText('Matrix Heatmap')
    expect(matrixElements.length).toBeGreaterThan(0)
  })

  it('shows summary statistics from comparison data', async () => {
    renderWithProviders(<ComparisonDashboard scanIds={testScanIds} />)

    // Check summary in header
    expect(screen.getByText(/2 hosts, 4 ports/)).toBeInTheDocument()
  })

  it('switches primary view when thumbnail is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ComparisonDashboard scanIds={testScanIds} />)

    // Initial state: Side by Side is primary (with full description)
    expect(screen.getByText('Columns for each scan, rows for hosts')).toBeInTheDocument()

    // Find and click a Timeline element in a thumbnail card
    const timelineElements = screen.getAllByText('Timeline')
    // Get one that's in a clickable card (thumbnails have cursor-pointer parent)
    const timelineInThumbnail = timelineElements.find(el =>
      el.closest('[class*="cursor-pointer"]')
    )

    if (timelineInThumbnail) {
      const clickableCard = timelineInThumbnail.closest('[class*="cursor-pointer"]')
      if (clickableCard) {
        await user.click(clickableCard)
      }
    }

    // After click, Timeline should be primary with its full description visible
    await waitFor(() => {
      expect(screen.getByText('Chronological view of changes')).toBeInTheDocument()
    })
  })

  it('renders host data in side-by-side view', async () => {
    renderWithProviders(<ComparisonDashboard scanIds={testScanIds} />)

    // Check for host IP addresses in table
    expect(screen.getByText('192.168.1.100')).toBeInTheDocument()
    expect(screen.getByText('192.168.1.101')).toBeInTheDocument()
  })

  it('renders scan column headers', async () => {
    renderWithProviders(<ComparisonDashboard scanIds={testScanIds} />)

    // Check for scan IDs in headers
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
    expect(screen.getByText('#3')).toBeInTheDocument()
  })

  it('shows port badges in data cells', async () => {
    renderWithProviders(<ComparisonDashboard scanIds={testScanIds} />)

    // Check for port numbers in badges
    const port80Elements = screen.getAllByText('80')
    expect(port80Elements.length).toBeGreaterThan(0)

    const port443Elements = screen.getAllByText('443')
    expect(port443Elements.length).toBeGreaterThan(0)
  })
})

// =============================================================================
// ComparisonHeader Integration Tests
// =============================================================================

describe('ComparisonHeader Integration', () => {
  const defaultProps = {
    scanIds: [1, 2, 3],
    targetStr: '192.168.1.0/24',
    modeStr: 'TCP SYN',
    note: '',
    onNoteChange: vi.fn(),
    isBookmarked: false,
    onBookmarkToggle: vi.fn(),
    onExport: vi.fn(),
    isExporting: false,
    isSaving: false,
  }

  it('displays all scan IDs', () => {
    renderWithProviders(<ComparisonHeader {...defaultProps} />)

    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
    expect(screen.getByText('#3')).toBeInTheDocument()
  })

  it('displays target and mode information', () => {
    renderWithProviders(<ComparisonHeader {...defaultProps} />)

    expect(screen.getByText('192.168.1.0/24')).toBeInTheDocument()
    expect(screen.getByText('TCP SYN')).toBeInTheDocument()
  })

  it('handles note input changes', async () => {
    const user = userEvent.setup()
    const onNoteChange = vi.fn()
    renderWithProviders(
      <ComparisonHeader {...defaultProps} onNoteChange={onNoteChange} />
    )

    const noteInput = screen.getByRole('textbox', { name: /comparison note/i })
    await user.type(noteInput, 'Test note')

    expect(onNoteChange).toHaveBeenCalled()
  })

  it('toggles bookmark state on click', async () => {
    const user = userEvent.setup()
    const onBookmarkToggle = vi.fn()
    renderWithProviders(
      <ComparisonHeader {...defaultProps} onBookmarkToggle={onBookmarkToggle} />
    )

    const bookmarkButton = screen.getByRole('button', { name: /bookmark/i })
    await user.click(bookmarkButton)

    expect(onBookmarkToggle).toHaveBeenCalled()
  })

  it('shows filled bookmark icon when bookmarked', () => {
    renderWithProviders(
      <ComparisonHeader {...defaultProps} isBookmarked={true} />
    )

    const bookmarkButton = screen.getByRole('button', { name: /remove bookmark/i })
    expect(bookmarkButton).toBeInTheDocument()
    expect(bookmarkButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens export dropdown with format options', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ComparisonHeader {...defaultProps} />)

    const exportButton = screen.getByRole('button', { name: /export/i })
    await user.click(exportButton)

    await waitFor(() => {
      expect(screen.getByText('CSV')).toBeInTheDocument()
      expect(screen.getByText('JSON')).toBeInTheDocument()
      expect(screen.getByText('Markdown')).toBeInTheDocument()
    })
  })

  it('calls onExport with correct format when option clicked', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    renderWithProviders(
      <ComparisonHeader {...defaultProps} onExport={onExport} />
    )

    const exportButton = screen.getByRole('button', { name: /export/i })
    await user.click(exportButton)

    await waitFor(() => {
      expect(screen.getByText('CSV')).toBeInTheDocument()
    })

    const csvOption = screen.getByText('CSV')
    await user.click(csvOption)

    expect(onExport).toHaveBeenCalledWith('csv')
  })

  it('shows loading state during export', () => {
    renderWithProviders(
      <ComparisonHeader {...defaultProps} isExporting={true} />
    )

    const exportButton = screen.getByRole('button', { name: /export/i })
    expect(exportButton).toBeDisabled()
  })

  it('shows loading spinner when saving', () => {
    renderWithProviders(
      <ComparisonHeader {...defaultProps} isSaving={true} />
    )

    // The loading spinner should be visible (Loader2 component)
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('navigates back to scans list on back button click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ComparisonHeader {...defaultProps} />)

    const backButton = screen.getByRole('button', { name: /scans/i })
    expect(backButton).toBeInTheDocument()

    // We can't fully test navigation without more router setup,
    // but we verify the button exists and is clickable
    await user.click(backButton)
  })
})

// =============================================================================
// Export Workflow Tests
// =============================================================================

describe('Export Workflow', () => {
  const exportProps = {
    scanIds: [1, 2, 3],
    targetStr: '192.168.1.0/24',
    modeStr: 'TCP SYN',
    note: 'Test comparison',
    onNoteChange: vi.fn(),
    isBookmarked: false,
    onBookmarkToggle: vi.fn(),
    onExport: vi.fn(),
    isExporting: false,
    isSaving: false,
  }

  it('CSV export calls handler with csv format', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    renderWithProviders(
      <ComparisonHeader {...exportProps} onExport={onExport} />
    )

    await user.click(screen.getByRole('button', { name: /export/i }))
    await waitFor(() => expect(screen.getByText('CSV')).toBeInTheDocument())
    await user.click(screen.getByText('CSV'))

    expect(onExport).toHaveBeenCalledWith('csv')
  })

  it('JSON export calls handler with json format', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    renderWithProviders(
      <ComparisonHeader {...exportProps} onExport={onExport} />
    )

    await user.click(screen.getByRole('button', { name: /export/i }))
    await waitFor(() => expect(screen.getByText('JSON')).toBeInTheDocument())
    await user.click(screen.getByText('JSON'))

    expect(onExport).toHaveBeenCalledWith('json')
  })

  it('Markdown export calls handler with markdown format', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    renderWithProviders(
      <ComparisonHeader {...exportProps} onExport={onExport} />
    )

    await user.click(screen.getByRole('button', { name: /export/i }))
    await waitFor(() => expect(screen.getByText('Markdown')).toBeInTheDocument())
    await user.click(screen.getByText('Markdown'))

    expect(onExport).toHaveBeenCalledWith('markdown')
  })

  it('export options show descriptions', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ComparisonHeader {...exportProps} />)

    await user.click(screen.getByRole('button', { name: /export/i }))

    await waitFor(() => {
      expect(screen.getByText('Spreadsheet-compatible format')).toBeInTheDocument()
      expect(screen.getByText('Structured data format')).toBeInTheDocument()
      expect(screen.getByText('Report-ready document')).toBeInTheDocument()
    })
  })
})

// =============================================================================
// Bookmark Workflow Tests
// =============================================================================

describe('Bookmark Workflow', () => {
  const bookmarkProps = {
    scanIds: [1, 2, 3],
    note: '',
    onNoteChange: vi.fn(),
    isBookmarked: false,
    onBookmarkToggle: vi.fn(),
    onExport: vi.fn(),
  }

  it('shows unbookmarked state by default', () => {
    renderWithProviders(<ComparisonHeader {...bookmarkProps} />)

    const button = screen.getByRole('button', { name: /bookmark comparison/i })
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  it('toggles to bookmarked state', async () => {
    const user = userEvent.setup()
    const onBookmarkToggle = vi.fn()
    const { rerender } = renderWithProviders(
      <ComparisonHeader {...bookmarkProps} onBookmarkToggle={onBookmarkToggle} />
    )

    await user.click(screen.getByRole('button', { name: /bookmark comparison/i }))
    expect(onBookmarkToggle).toHaveBeenCalled()

    // Simulate parent updating the prop
    rerender(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <ComparisonHeader {...bookmarkProps} isBookmarked={true} onBookmarkToggle={onBookmarkToggle} />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const button = screen.getByRole('button', { name: /remove bookmark/i })
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })
})

// =============================================================================
// Note Input Workflow Tests
// =============================================================================

describe('Note Input Workflow', () => {
  const noteProps = {
    scanIds: [1, 2, 3],
    note: '',
    onNoteChange: vi.fn(),
    isBookmarked: false,
    onBookmarkToggle: vi.fn(),
    onExport: vi.fn(),
  }

  it('starts with empty note', () => {
    renderWithProviders(<ComparisonHeader {...noteProps} />)

    const input = screen.getByRole('textbox', { name: /comparison note/i })
    expect(input).toHaveValue('')
  })

  it('updates note value on typing', async () => {
    const user = userEvent.setup()
    const onNoteChange = vi.fn()
    renderWithProviders(
      <ComparisonHeader {...noteProps} onNoteChange={onNoteChange} />
    )

    const input = screen.getByRole('textbox', { name: /comparison note/i })
    await user.type(input, 'My test note')

    // onNoteChange called for each character
    expect(onNoteChange).toHaveBeenCalledTimes(12) // 'My test note' = 12 chars
  })

  it('shows placeholder text', () => {
    renderWithProviders(<ComparisonHeader {...noteProps} />)

    const input = screen.getByPlaceholderText(/add a note/i)
    expect(input).toBeInTheDocument()
  })

  it('preserves note value from props', () => {
    renderWithProviders(
      <ComparisonHeader {...noteProps} note="Existing note" />
    )

    const input = screen.getByRole('textbox', { name: /comparison note/i })
    expect(input).toHaveValue('Existing note')
  })
})

// =============================================================================
// View Switching Integration Tests
// =============================================================================

describe('View Switching Integration', () => {
  const testScanIds = [1, 2, 3]

  it('switches from Side-by-Side to Timeline view', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ComparisonDashboard scanIds={testScanIds} />)

    // Verify Side-by-Side is initially primary
    expect(screen.getByText('Columns for each scan, rows for hosts')).toBeInTheDocument()

    // Click Timeline thumbnail
    const cards = screen.getAllByText('Timeline')
    // Find the one in a thumbnail (smaller card)
    const timelineCards = cards.filter(el =>
      el.closest('[class*="cursor-pointer"]')
    )
    if (timelineCards.length > 0) {
      await user.click(timelineCards[0])
    }

    // Verify Timeline is now primary
    await waitFor(() => {
      expect(screen.getByText('Chronological view of changes')).toBeInTheDocument()
    })
  })

  it('switches to Matrix Heatmap view', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ComparisonDashboard scanIds={testScanIds} />)

    // Click Matrix Heatmap thumbnail
    const cards = screen.getAllByText('Matrix Heatmap')
    const matrixCards = cards.filter(el =>
      el.closest('[class*="cursor-pointer"]')
    )
    if (matrixCards.length > 0) {
      await user.click(matrixCards[0])
    }

    // Verify Matrix Heatmap is now primary
    await waitFor(() => {
      expect(screen.getByText('Grid showing presence across scans')).toBeInTheDocument()
    })
  })

  it('switches to Unified Diff view', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ComparisonDashboard scanIds={testScanIds} />)

    // Click Unified Diff thumbnail
    const cards = screen.getAllByText('Unified Diff')
    const diffCards = cards.filter(el =>
      el.closest('[class*="cursor-pointer"]')
    )
    if (diffCards.length > 0) {
      await user.click(diffCards[0])
    }

    // Verify Unified Diff is now primary
    await waitFor(() => {
      expect(screen.getByText('Merged view with color-coded changes')).toBeInTheDocument()
    })
  })
})

// =============================================================================
// Accessibility Tests
// =============================================================================

describe('Accessibility', () => {
  const testScanIds = [1, 2, 3]

  it('ComparisonHeader has accessible bookmark button', () => {
    renderWithProviders(
      <ComparisonHeader
        scanIds={testScanIds}
        note=""
        onNoteChange={vi.fn()}
        onBookmarkToggle={vi.fn()}
        onExport={vi.fn()}
      />
    )

    const button = screen.getByRole('button', { name: /bookmark/i })
    expect(button).toHaveAttribute('aria-pressed')
  })

  it('ComparisonHeader has accessible note input', () => {
    renderWithProviders(
      <ComparisonHeader
        scanIds={testScanIds}
        note=""
        onNoteChange={vi.fn()}
        onBookmarkToggle={vi.fn()}
        onExport={vi.fn()}
      />
    )

    const input = screen.getByRole('textbox', { name: /comparison note/i })
    expect(input).toBeInTheDocument()
  })

  it('Dashboard thumbnail cards are keyboard accessible', () => {
    renderWithProviders(<ComparisonDashboard scanIds={testScanIds} />)

    // Thumbnail cards should have expand buttons
    const expandButtons = screen.getAllByTitle('Expand to primary view')
    expect(expandButtons.length).toBe(3) // 3 thumbnails
  })
})
