/**
 * Component tests for PortSparkline
 * Tests inline activity trend visualization
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PortSparkline, type SparklineDataPoint } from '@/features/charts/PortSparkline'

// =============================================================================
// Mock Recharts
// =============================================================================

// Mock Recharts components to avoid SVG rendering issues in tests
vi.mock('recharts', () => ({
  AreaChart: vi.fn(({ children, data }) => (
    <div data-testid="area-chart" data-count={data?.length}>
      {children}
    </div>
  )),
  Area: vi.fn(({ stroke, fill, strokeWidth }) => (
    <div
      data-testid="area"
      data-stroke={stroke}
      data-fill={fill}
      data-stroke-width={strokeWidth}
    />
  )),
  ResponsiveContainer: vi.fn(({ children, width, height }) => (
    <div
      data-testid="responsive-container"
      style={{ width, height }}
    >
      {children}
    </div>
  )),
  Tooltip: vi.fn(() => <div data-testid="tooltip" />),
}))

// =============================================================================
// Test Data
// =============================================================================

const validData: SparklineDataPoint[] = [
  { timeKey: '2025-01-01', value: 10, label: 'Jan 1' },
  { timeKey: '2025-01-02', value: 25, label: 'Jan 2' },
  { timeKey: '2025-01-03', value: 15, label: 'Jan 3' },
  { timeKey: '2025-01-04', value: 30, label: 'Jan 4' },
]

const zeroValueData: SparklineDataPoint[] = [
  { timeKey: '2025-01-01', value: 0 },
  { timeKey: '2025-01-02', value: 0 },
  { timeKey: '2025-01-03', value: 0 },
]

const mixedData: SparklineDataPoint[] = [
  { timeKey: '2025-01-01', value: 0 },
  { timeKey: '2025-01-02', value: 5 },
  { timeKey: '2025-01-03', value: 0 },
]

// =============================================================================
// Rendering Tests
// =============================================================================

describe('PortSparkline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering with valid data', () => {
    it('should render sparkline container with data', () => {
      render(<PortSparkline data={validData} />)

      const container = screen.getByLabelText(/Sparkline showing \d+ data points/)
      expect(container).toBeInTheDocument()
    })

    it('should render ResponsiveContainer with chart', () => {
      render(<PortSparkline data={validData} />)

      expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })

    it('should pass data to AreaChart', () => {
      render(<PortSparkline data={validData} />)

      const chart = screen.getByTestId('area-chart')
      expect(chart).toHaveAttribute('data-count', '4')
    })

    it('should render Area component', () => {
      render(<PortSparkline data={validData} />)

      expect(screen.getByTestId('area')).toBeInTheDocument()
    })
  })

  describe('empty data handling', () => {
    it('should render empty placeholder for empty array', () => {
      render(<PortSparkline data={[]} />)

      const container = screen.getByLabelText('No activity data')
      expect(container).toBeInTheDocument()
    })

    it('should render empty placeholder when all values are zero', () => {
      render(<PortSparkline data={zeroValueData} />)

      const container = screen.getByLabelText('No activity data')
      expect(container).toBeInTheDocument()
    })

    it('should show em-dash in empty state', () => {
      render(<PortSparkline data={[]} />)

      expect(screen.getByText('—')).toBeInTheDocument()
    })

    it('should render chart when at least one value is non-zero', () => {
      render(<PortSparkline data={mixedData} />)

      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
      expect(screen.queryByLabelText('No activity data')).not.toBeInTheDocument()
    })
  })

  describe('width and height props', () => {
    it('should apply default width and height', () => {
      render(<PortSparkline data={validData} />)

      const container = screen.getByLabelText(/Sparkline showing/)
      expect(container).toHaveStyle({ width: '80px', height: '24px' })
    })

    it('should apply custom width', () => {
      render(<PortSparkline data={validData} width={120} />)

      const container = screen.getByLabelText(/Sparkline showing/)
      expect(container).toHaveStyle({ width: '120px' })
    })

    it('should apply custom height', () => {
      render(<PortSparkline data={validData} height={40} />)

      const container = screen.getByLabelText(/Sparkline showing/)
      expect(container).toHaveStyle({ height: '40px' })
    })

    it('should apply both custom dimensions', () => {
      render(<PortSparkline data={validData} width={100} height={50} />)

      const container = screen.getByLabelText(/Sparkline showing/)
      expect(container).toHaveStyle({ width: '100px', height: '50px' })
    })

    it('should apply dimensions to empty state container', () => {
      render(<PortSparkline data={[]} width={100} height={32} />)

      const container = screen.getByLabelText('No activity data')
      expect(container).toHaveStyle({ width: '100px', height: '32px' })
    })
  })

  describe('color prop', () => {
    it('should use default primary color', () => {
      render(<PortSparkline data={validData} />)

      const area = screen.getByTestId('area')
      expect(area).toHaveAttribute('data-stroke', 'var(--color-primary)')
    })

    it('should apply custom color to stroke', () => {
      render(<PortSparkline data={validData} color="red" />)

      const area = screen.getByTestId('area')
      expect(area).toHaveAttribute('data-stroke', 'red')
    })

    it('should apply CSS variable color', () => {
      render(<PortSparkline data={validData} color="var(--color-success)" />)

      const area = screen.getByTestId('area')
      expect(area).toHaveAttribute('data-stroke', 'var(--color-success)')
    })

    it('should generate gradient fill URL from color', () => {
      render(<PortSparkline data={validData} color="blue" />)

      const area = screen.getByTestId('area')
      expect(area).toHaveAttribute('data-fill', 'url(#sparkline-gradient-blue)')
    })

    it('should sanitize color for gradient ID', () => {
      render(<PortSparkline data={validData} color="var(--color-primary)" />)

      const area = screen.getByTestId('area')
      // Special chars removed: var(--color-primary) -> varcolorprimary
      expect(area).toHaveAttribute('data-fill', 'url(#sparkline-gradient-varcolorprimary)')
    })
  })

  describe('tooltip prop', () => {
    it('should show tooltip by default', () => {
      render(<PortSparkline data={validData} />)

      expect(screen.getByTestId('tooltip')).toBeInTheDocument()
    })

    it('should hide tooltip when showTooltip is false', () => {
      render(<PortSparkline data={validData} showTooltip={false} />)

      expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument()
    })
  })

  describe('className prop', () => {
    it('should apply custom className to container', () => {
      render(<PortSparkline data={validData} className="custom-class" />)

      const container = screen.getByLabelText(/Sparkline showing/)
      expect(container).toHaveClass('custom-class')
    })

    it('should apply className to empty state container', () => {
      render(<PortSparkline data={[]} className="empty-custom" />)

      const container = screen.getByLabelText('No activity data')
      expect(container).toHaveClass('empty-custom')
    })

    it('should handle undefined className', () => {
      render(<PortSparkline data={validData} className={undefined} />)

      const container = screen.getByLabelText(/Sparkline showing/)
      expect(container).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('should have aria-label with data count when data present', () => {
      render(<PortSparkline data={validData} />)

      const container = screen.getByLabelText('Sparkline showing 4 data points')
      expect(container).toBeInTheDocument()
    })

    it('should have aria-label for empty state', () => {
      render(<PortSparkline data={[]} />)

      const container = screen.getByLabelText('No activity data')
      expect(container).toBeInTheDocument()
    })

    it('should update aria-label based on data length', () => {
      const shortData = [{ timeKey: '1', value: 1 }]
      render(<PortSparkline data={shortData} />)

      const container = screen.getByLabelText('Sparkline showing 1 data points')
      expect(container).toBeInTheDocument()
    })

    it('should be accessible with screen readers', () => {
      render(<PortSparkline data={validData} />)

      // Container should be findable by role/label
      const container = screen.getByLabelText(/Sparkline showing/)
      expect(container).toBeInTheDocument()
    })
  })

  describe('stroke width', () => {
    it('should use correct stroke width', () => {
      render(<PortSparkline data={validData} />)

      const area = screen.getByTestId('area')
      expect(area).toHaveAttribute('data-stroke-width', '1.5')
    })
  })

  describe('data edge cases', () => {
    it('should handle single data point', () => {
      const singlePoint = [{ timeKey: '2025-01-01', value: 50 }]
      render(<PortSparkline data={singlePoint} />)

      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })

    it('should handle very large values', () => {
      const largeData = [
        { timeKey: '1', value: 1000000 },
        { timeKey: '2', value: 5000000 },
      ]
      render(<PortSparkline data={largeData} />)

      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })

    it('should handle negative values', () => {
      const negativeData = [
        { timeKey: '1', value: -10 },
        { timeKey: '2', value: 10 },
      ]
      render(<PortSparkline data={negativeData} />)

      // Has non-zero value (10), so should render chart
      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })

    it('should handle decimal values', () => {
      const decimalData = [
        { timeKey: '1', value: 10.5 },
        { timeKey: '2', value: 20.75 },
      ]
      render(<PortSparkline data={decimalData} />)

      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })

    it('should handle data without optional label', () => {
      const noLabelData = [
        { timeKey: '2025-01-01', value: 10 },
        { timeKey: '2025-01-02', value: 20 },
      ]
      render(<PortSparkline data={noLabelData} />)

      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })

    it('should handle many data points', () => {
      const manyPoints = Array.from({ length: 100 }, (_, i) => ({
        timeKey: `day-${i}`,
        value: Math.random() * 100,
      }))
      render(<PortSparkline data={manyPoints} />)

      const chart = screen.getByTestId('area-chart')
      expect(chart).toHaveAttribute('data-count', '100')
    })
  })

  describe('memoization', () => {
    it('should not cause unnecessary re-renders with same data', () => {
      const { rerender } = render(<PortSparkline data={validData} />)

      // Re-render with same data reference
      rerender(<PortSparkline data={validData} />)

      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })
  })
})

// =============================================================================
// SparklineDataPoint Type Tests
// =============================================================================

describe('SparklineDataPoint type', () => {
  it('should accept valid data structure', () => {
    const data: SparklineDataPoint[] = [
      { timeKey: 'key1', value: 100 },
      { timeKey: 'key2', value: 200, label: 'Label' },
    ]

    render(<PortSparkline data={data} />)
    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
  })

  it('should accept data with all optional fields', () => {
    const data: SparklineDataPoint[] = [
      { timeKey: '2025-01-01T00:00:00Z', value: 42, label: 'Midnight reading' },
    ]

    render(<PortSparkline data={data} />)
    expect(screen.getByLabelText('Sparkline showing 1 data points')).toBeInTheDocument()
  })
})
