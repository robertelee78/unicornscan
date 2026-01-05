/**
 * Integration tests for PortActivityHeatmap component
 * Tests loading, empty, sparse (bar), and dense (grid) modes
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PortActivityHeatmap } from '@/features/charts/PortActivityHeatmap'
import type { AdaptiveHeatmapData } from '@/features/charts/types'

// Add pointer capture mock for Radix UI components
beforeEach(() => {
  // Mock pointer capture methods for Radix UI
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
})

// =============================================================================
// Mock Child Components
// =============================================================================

// Mock PortActivityBar to simplify testing
vi.mock('@/features/charts/PortActivityBar', () => ({
  PortActivityBar: vi.fn(({ port, count }) => (
    <div data-testid={`port-bar-${port}`} data-count={count}>
      Port {port}: {count}
    </div>
  )),
}))

// Mock CategoryHeader to simplify testing
vi.mock('@/features/charts/CategoryHeader', () => ({
  CategoryHeader: vi.fn(({ config, portCount, totalActivity, isExpanded }) => (
    <button
      data-testid={`category-header-${config.id}`}
      data-port-count={portCount}
      data-total-activity={totalActivity}
      data-expanded={isExpanded}
    >
      {config.name} ({portCount} ports)
    </button>
  )),
}))

// Mock Recharts components that might be used by sparklines
vi.mock('recharts', () => ({
  AreaChart: vi.fn(({ children }) => <div data-testid="area-chart">{children}</div>),
  Area: vi.fn(() => <div data-testid="area" />),
  ResponsiveContainer: vi.fn(({ children }) => <div>{children}</div>),
  Tooltip: vi.fn(() => null),
}))

// =============================================================================
// Test Data Factories
// =============================================================================

/**
 * Create sparse data (≤3 time keys → triggers bar mode)
 */
function createSparseData(): AdaptiveHeatmapData {
  return {
    cells: [
      { port: 80, date: '2025-01-01', timestamp: 1735689600, count: 5, intensity: 0.5, timeKey: '2025-01-01', hour: undefined },
      { port: 443, date: '2025-01-01', timestamp: 1735689600, count: 10, intensity: 1, timeKey: '2025-01-01', hour: undefined },
      { port: 22, date: '2025-01-01', timestamp: 1735689600, count: 3, intensity: 0.3, timeKey: '2025-01-01', hour: undefined },
      { port: 80, date: '2025-01-02', timestamp: 1735776000, count: 7, intensity: 0.7, timeKey: '2025-01-02', hour: undefined },
      { port: 443, date: '2025-01-02', timestamp: 1735776000, count: 8, intensity: 0.8, timeKey: '2025-01-02', hour: undefined },
    ],
    ports: [22, 80, 443],
    timeKeys: ['2025-01-01', '2025-01-02'], // 2 keys → sparse/bar mode
    timeLabels: ['Jan 1', 'Jan 2'],
    maxCount: 10,
    granularity: 'daily',
    dateRange: {
      start: '2025-01-01',
      end: '2025-01-02',
      daySpan: 2,
    },
  }
}

/**
 * Create dense data (>3 time keys → triggers grid mode)
 */
function createDenseData(): AdaptiveHeatmapData {
  const timeKeys = ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04', '2025-01-05']
  const timeLabels = ['Jan 1', 'Jan 2', 'Jan 3', 'Jan 4', 'Jan 5']

  const cells = []
  for (const port of [22, 80, 443, 3306]) {
    for (let i = 0; i < timeKeys.length; i++) {
      const count = Math.floor(Math.random() * 10) + 1
      cells.push({
        port,
        date: timeKeys[i],
        timestamp: 1735689600 + i * 86400,
        count,
        intensity: count / 10,
        timeKey: timeKeys[i],
        hour: undefined,
      })
    }
  }

  return {
    cells,
    ports: [22, 80, 443, 3306],
    timeKeys, // 5 keys → dense/grid mode
    timeLabels,
    maxCount: 10,
    granularity: 'daily',
    dateRange: {
      start: '2025-01-01',
      end: '2025-01-05',
      daySpan: 5,
    },
  }
}

/**
 * Create hourly granularity data
 */
function createHourlyData(): AdaptiveHeatmapData {
  const timeKeys = [
    '2025-01-01T00', '2025-01-01T01', '2025-01-01T02', '2025-01-01T03',
    '2025-01-01T04', '2025-01-01T05',
  ]
  const timeLabels = ['12AM', '1AM', '2AM', '3AM', '4AM', '5AM']

  return {
    cells: [
      { port: 80, date: '2025-01-01', timestamp: 1735689600, count: 5, intensity: 0.5, timeKey: timeKeys[0], hour: 0 },
      { port: 80, date: '2025-01-01', timestamp: 1735693200, count: 8, intensity: 0.8, timeKey: timeKeys[1], hour: 1 },
      { port: 80, date: '2025-01-01', timestamp: 1735696800, count: 3, intensity: 0.3, timeKey: timeKeys[2], hour: 2 },
      { port: 80, date: '2025-01-01', timestamp: 1735700400, count: 10, intensity: 1, timeKey: timeKeys[3], hour: 3 },
      { port: 80, date: '2025-01-01', timestamp: 1735704000, count: 2, intensity: 0.2, timeKey: timeKeys[4], hour: 4 },
      { port: 80, date: '2025-01-01', timestamp: 1735707600, count: 6, intensity: 0.6, timeKey: timeKeys[5], hour: 5 },
    ],
    ports: [80],
    timeKeys,
    timeLabels,
    maxCount: 10,
    granularity: 'hourly',
    dateRange: {
      start: '2025-01-01',
      end: '2025-01-01',
      daySpan: 1,
    },
  }
}

/**
 * Create empty data
 */
function createEmptyData(): AdaptiveHeatmapData {
  return {
    cells: [],
    ports: [],
    timeKeys: [],
    timeLabels: [],
    maxCount: 0,
    granularity: 'daily',
    dateRange: {
      start: '2025-01-01',
      end: '2025-01-01',
      daySpan: 1,
    },
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('PortActivityHeatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ===========================================================================
  // Loading State
  // ===========================================================================

  describe('loading state', () => {
    it('should render loading indicator when isLoading is true', () => {
      render(<PortActivityHeatmap data={undefined} isLoading={true} />)

      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('should show default title in loading state', () => {
      render(<PortActivityHeatmap data={undefined} isLoading={true} />)

      expect(screen.getByText('Port Activity Heatmap')).toBeInTheDocument()
    })

    it('should show custom title in loading state', () => {
      render(<PortActivityHeatmap data={undefined} isLoading={true} title="Custom Title" />)

      expect(screen.getByText('Custom Title')).toBeInTheDocument()
    })

    it('should apply loading animation class', () => {
      render(<PortActivityHeatmap data={undefined} isLoading={true} />)

      const loadingContainer = screen.getByText('Loading...').parentElement
      expect(loadingContainer).toHaveClass('animate-pulse')
    })
  })

  // ===========================================================================
  // Empty State
  // ===========================================================================

  describe('empty state', () => {
    it('should render empty state when data is undefined', () => {
      render(<PortActivityHeatmap data={undefined} isLoading={false} />)

      expect(screen.getByText('No Port Activity Data')).toBeInTheDocument()
    })

    it('should render empty state when ports array is empty', () => {
      render(<PortActivityHeatmap data={createEmptyData()} isLoading={false} />)

      expect(screen.getByText('No Port Activity Data')).toBeInTheDocument()
    })

    it('should render empty state when timeKeys array is empty', () => {
      const dataWithNoPorts = {
        ...createSparseData(),
        timeKeys: [],
        timeLabels: [],
      }
      render(<PortActivityHeatmap data={dataWithNoPorts} isLoading={false} />)

      expect(screen.getByText('No Port Activity Data')).toBeInTheDocument()
    })

    it('should show explanation text in empty state', () => {
      render(<PortActivityHeatmap data={undefined} isLoading={false} />)

      expect(screen.getByText(/No port activity was recorded/)).toBeInTheDocument()
    })

    it('should list possible reasons in empty state', () => {
      render(<PortActivityHeatmap data={undefined} isLoading={false} />)

      expect(screen.getByText('No scans were run during this period')).toBeInTheDocument()
      expect(screen.getByText('Scans did not discover any open ports')).toBeInTheDocument()
      expect(screen.getByText('The time filter is too narrow')).toBeInTheDocument()
    })

    it('should show suggestion to expand time range', () => {
      render(<PortActivityHeatmap data={undefined} isLoading={false} />)

      expect(screen.getByText(/Try expanding the time range/)).toBeInTheDocument()
    })

    it('should show layout grid icon in empty state', () => {
      render(<PortActivityHeatmap data={undefined} isLoading={false} />)

      // Check for the icon container
      const iconContainer = screen.getByRole('heading', { name: 'No Port Activity Data' })
        .closest('div')
        ?.querySelector('.rounded-full')
      expect(iconContainer).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // Bar Mode (Sparse Data)
  // ===========================================================================

  describe('bar mode (sparse data)', () => {
    it('should render bars mode badge when data has ≤3 time keys', () => {
      render(<PortActivityHeatmap data={createSparseData()} isLoading={false} />)

      expect(screen.getByText('bars')).toBeInTheDocument()
    })

    it('should render port bars for each port', () => {
      render(<PortActivityHeatmap data={createSparseData()} isLoading={false} />)

      expect(screen.getByTestId('port-bar-22')).toBeInTheDocument()
      expect(screen.getByTestId('port-bar-80')).toBeInTheDocument()
      expect(screen.getByTestId('port-bar-443')).toBeInTheDocument()
    })

    it('should render category headers in category sort mode', () => {
      render(<PortActivityHeatmap data={createSparseData()} isLoading={false} />)

      // Default sort is 'category'
      expect(screen.getByTestId('category-header-web')).toBeInTheDocument()
      expect(screen.getByTestId('category-header-remote-access')).toBeInTheDocument()
    })

    it('should show port count in header', () => {
      render(<PortActivityHeatmap data={createSparseData()} isLoading={false} />)

      expect(screen.getByText('3 ports')).toBeInTheDocument()
    })

    it('should show time range in header', () => {
      render(<PortActivityHeatmap data={createSparseData()} isLoading={false} />)

      expect(screen.getByText('2 days')).toBeInTheDocument()
    })

    it('should have aria-label on port list', () => {
      render(<PortActivityHeatmap data={createSparseData()} isLoading={false} />)

      expect(screen.getByRole('list', { name: 'Port activity by category' })).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // Grid Mode (Dense Data)
  // ===========================================================================

  describe('grid mode (dense data)', () => {
    it('should render grid mode badge when data has >3 time keys', () => {
      render(<PortActivityHeatmap data={createDenseData()} isLoading={false} />)

      expect(screen.getByText('grid')).toBeInTheDocument()
    })

    it('should not render port bars in grid mode', () => {
      render(<PortActivityHeatmap data={createDenseData()} isLoading={false} />)

      expect(screen.queryByTestId('port-bar-22')).not.toBeInTheDocument()
    })

    it('should show port count in header for grid mode', () => {
      render(<PortActivityHeatmap data={createDenseData()} isLoading={false} />)

      expect(screen.getByText('4 ports')).toBeInTheDocument()
    })

    it('should show days count in header for grid mode', () => {
      render(<PortActivityHeatmap data={createDenseData()} isLoading={false} />)

      expect(screen.getByText('5 days')).toBeInTheDocument()
    })

    it('should render color legend in grid mode', () => {
      render(<PortActivityHeatmap data={createDenseData()} isLoading={false} />)

      expect(screen.getByText('Less')).toBeInTheDocument()
      expect(screen.getByText('More')).toBeInTheDocument()
    })

    it('should display port numbers in grid', () => {
      render(<PortActivityHeatmap data={createDenseData()} isLoading={false} />)

      expect(screen.getByText('22')).toBeInTheDocument()
      expect(screen.getByText('80')).toBeInTheDocument()
      expect(screen.getByText('443')).toBeInTheDocument()
      expect(screen.getByText('3306')).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // Sort Controls
  // ===========================================================================

  describe('sort controls', () => {
    it('should render sort select control', () => {
      render(<PortActivityHeatmap data={createSparseData()} isLoading={false} />)

      // The select trigger should show the default value
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('should default to category sort', () => {
      render(<PortActivityHeatmap data={createSparseData()} isLoading={false} />)

      expect(screen.getByRole('combobox')).toHaveTextContent('By Category')
    })

    // Note: Select dropdown interaction tests are skipped due to Radix UI
    // limitations in jsdom (pointer capture APIs). These would be tested
    // in E2E tests with a real browser environment.
    it('should have accessible select trigger', () => {
      render(<PortActivityHeatmap data={createSparseData()} isLoading={false} />)

      // Verify combobox role is present (accessible name association
      // is limited in jsdom with mocked Radix components)
      const combobox = screen.getByRole('combobox')
      expect(combobox).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // Category Expand/Collapse
  // ===========================================================================

  describe('category expand/collapse', () => {
    it('should render categories expanded by default', () => {
      render(<PortActivityHeatmap data={createSparseData()} isLoading={false} />)

      const webHeader = screen.getByTestId('category-header-web')
      expect(webHeader).toHaveAttribute('data-expanded', 'true')
    })

    // Note: Toggle interaction test is simplified because the mocked CategoryHeader
    // doesn't forward the click event to the Collapsible's onOpenChange handler.
    // Full interaction testing would require unmocked components or E2E tests.
    it('should render multiple category headers that are all initially expanded', () => {
      render(<PortActivityHeatmap data={createSparseData()} isLoading={false} />)

      const webHeader = screen.getByTestId('category-header-web')
      const remoteHeader = screen.getByTestId('category-header-remote-access')

      expect(webHeader).toHaveAttribute('data-expanded', 'true')
      expect(remoteHeader).toHaveAttribute('data-expanded', 'true')
    })

    it('should show port count in category header', () => {
      render(<PortActivityHeatmap data={createSparseData()} isLoading={false} />)

      const webHeader = screen.getByTestId('category-header-web')
      expect(webHeader).toHaveAttribute('data-port-count', '2') // ports 80, 443
    })

    it('should show total activity in category header', () => {
      render(<PortActivityHeatmap data={createSparseData()} isLoading={false} />)

      const webHeader = screen.getByTestId('category-header-web')
      // 80: 5+7=12, 443: 10+8=18, total=30
      expect(webHeader).toHaveAttribute('data-total-activity', '30')
    })
  })

  // ===========================================================================
  // Date Range Display
  // ===========================================================================

  describe('date range display', () => {
    it('should show date range text for multi-day data', () => {
      render(<PortActivityHeatmap data={createDenseData()} isLoading={false} />)

      // The date range is displayed as text in the header
      // Matches any month abbreviation (Jan, Dec, etc.) as timezone can affect rendering
      const header = screen.getByText('Port Activity Heatmap').closest('div')
      expect(header?.textContent).toMatch(/(Jan|Dec|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov)/)
    })

    it('should show date for single day data', () => {
      render(<PortActivityHeatmap data={createHourlyData()} isLoading={false} />)

      // The date is displayed for single-day data
      // Matches any month abbreviation as timezone can affect rendering
      const header = screen.getByText('Port Activity Heatmap').closest('div')
      expect(header?.textContent).toMatch(/(Jan|Dec|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov)/)
    })
  })

  // ===========================================================================
  // Granularity Display
  // ===========================================================================

  describe('granularity display', () => {
    it('should show "days" for daily granularity', () => {
      render(<PortActivityHeatmap data={createDenseData()} isLoading={false} />)

      expect(screen.getByText('5 days')).toBeInTheDocument()
    })

    it('should show "hours" for hourly granularity', () => {
      render(<PortActivityHeatmap data={createHourlyData()} isLoading={false} />)

      expect(screen.getByText('6 hours')).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // Props
  // ===========================================================================

  describe('props', () => {
    it('should apply custom title', () => {
      render(<PortActivityHeatmap data={createSparseData()} isLoading={false} title="Custom Heatmap" />)

      expect(screen.getByText('Custom Heatmap')).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      const { container } = render(
        <PortActivityHeatmap data={createSparseData()} isLoading={false} className="custom-class" />
      )

      expect(container.firstChild).toHaveClass('custom-class')
    })

    it('should use default title when not provided', () => {
      render(<PortActivityHeatmap data={createSparseData()} isLoading={false} />)

      expect(screen.getByText('Port Activity Heatmap')).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // Threshold Boundary Tests
  // ===========================================================================

  describe('render mode threshold', () => {
    it('should render bars with exactly 3 time keys', () => {
      const dataWith3Keys = {
        ...createSparseData(),
        timeKeys: ['2025-01-01', '2025-01-02', '2025-01-03'],
        timeLabels: ['Jan 1', 'Jan 2', 'Jan 3'],
      }
      render(<PortActivityHeatmap data={dataWith3Keys} isLoading={false} />)

      expect(screen.getByText('bars')).toBeInTheDocument()
    })

    it('should render grid with exactly 4 time keys', () => {
      const dataWith4Keys = {
        ...createSparseData(),
        timeKeys: ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04'],
        timeLabels: ['Jan 1', 'Jan 2', 'Jan 3', 'Jan 4'],
      }
      render(<PortActivityHeatmap data={dataWith4Keys} isLoading={false} />)

      expect(screen.getByText('grid')).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // Large Dataset Tests
  // ===========================================================================

  describe('large datasets', () => {
    it('should handle many ports', () => {
      const manyPorts = Array.from({ length: 50 }, (_, i) => i + 1)
      const data: AdaptiveHeatmapData = {
        cells: manyPorts.map(port => ({
          port,
          date: '2025-01-01',
          timestamp: 1735689600,
          count: 1,
          intensity: 0.1,
          timeKey: '2025-01-01',
        })),
        ports: manyPorts,
        timeKeys: ['2025-01-01'],
        timeLabels: ['Jan 1'],
        maxCount: 1,
        granularity: 'daily',
        dateRange: { start: '2025-01-01', end: '2025-01-01', daySpan: 1 },
      }

      render(<PortActivityHeatmap data={data} isLoading={false} />)

      expect(screen.getByText('50 ports')).toBeInTheDocument()
    })

    it('should handle many time keys', () => {
      const timeKeys = Array.from({ length: 30 }, (_, i) => `2025-01-${String(i + 1).padStart(2, '0')}`)
      const timeLabels = timeKeys.map((_, i) => `Jan ${i + 1}`)

      const data: AdaptiveHeatmapData = {
        cells: [{ port: 80, date: timeKeys[0], timestamp: 1735689600, count: 1, intensity: 0.1, timeKey: timeKeys[0] }],
        ports: [80],
        timeKeys,
        timeLabels,
        maxCount: 1,
        granularity: 'daily',
        dateRange: { start: timeKeys[0], end: timeKeys[29], daySpan: 30 },
      }

      render(<PortActivityHeatmap data={data} isLoading={false} />)

      expect(screen.getByText('30 days')).toBeInTheDocument()
      expect(screen.getByText('grid')).toBeInTheDocument()
    })
  })
})
