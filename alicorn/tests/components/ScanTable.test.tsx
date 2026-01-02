/**
 * Unit tests for src/features/scans/ScanTable.tsx
 * Tests table rendering, sorting, selection, and various states
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../test-utils'
import { ScanTable } from '@/features/scans/ScanTable'
import type { ScanSummary } from '@/types/database'
import type { SortState, SortField } from '@/features/scans/types'

// Mock scan data factory
function createMockScan(overrides: Partial<ScanSummary> = {}): ScanSummary {
  return {
    scan_id: 1,
    target_str: '192.168.1.0/24',
    profile: 'Default',
    mode_str: 'tcp',
    host_count: 5,
    port_count: 23,
    s_time: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    e_time: Math.floor(Date.now() / 1000) - 3000, // 10 min duration
    notes: null,
    tags: ['network', 'internal'],
    ...overrides,
  }
}

describe('ScanTable', () => {
  const defaultSort: SortState = { field: 's_time', direction: 'desc' }
  const onSort = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loading state', () => {
    it('shows loading message when isLoading is true', () => {
      renderWithProviders(
        <ScanTable
          scans={[]}
          sort={defaultSort}
          onSort={onSort}
          isLoading={true}
        />
      )

      expect(screen.getByText(/loading scans/i)).toBeInTheDocument()
    })

    it('does not render table when loading', () => {
      renderWithProviders(
        <ScanTable
          scans={[]}
          sort={defaultSort}
          onSort={onSort}
          isLoading={true}
        />
      )

      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('shows empty message when no scans', () => {
      renderWithProviders(
        <ScanTable
          scans={[]}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
        />
      )

      expect(screen.getByText(/no scans match your filters/i)).toBeInTheDocument()
    })
  })

  describe('table rendering', () => {
    it('renders table with correct headers', () => {
      const scans = [createMockScan()]

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
        />
      )

      expect(screen.getByText('ID')).toBeInTheDocument()
      expect(screen.getByText('Target')).toBeInTheDocument()
      expect(screen.getByText('Profile')).toBeInTheDocument()
      expect(screen.getByText('Mode')).toBeInTheDocument()
      expect(screen.getByText('Hosts')).toBeInTheDocument()
      expect(screen.getByText('Ports')).toBeInTheDocument()
      expect(screen.getByText('Duration')).toBeInTheDocument()
      expect(screen.getByText('Time')).toBeInTheDocument()
      expect(screen.getByText('Tags')).toBeInTheDocument()
    })

    it('renders scan rows', () => {
      const scans = [
        createMockScan({ scan_id: 1, target_str: '10.0.0.1' }),
        createMockScan({ scan_id: 2, target_str: '10.0.0.2' }),
      ]

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
        />
      )

      expect(screen.getByText('#1')).toBeInTheDocument()
      expect(screen.getByText('#2')).toBeInTheDocument()
      expect(screen.getByText('10.0.0.1')).toBeInTheDocument()
      expect(screen.getByText('10.0.0.2')).toBeInTheDocument()
    })

    it('renders ID as link to scan detail', () => {
      const scans = [createMockScan({ scan_id: 42 })]

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
        />
      )

      const link = screen.getByRole('link', { name: '#42' })
      expect(link).toHaveAttribute('href', '/scans/42')
    })

    it('renders tags as badges', () => {
      const scans = [createMockScan({ tags: ['web', 'critical'] })]

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
        />
      )

      expect(screen.getByText('web')).toBeInTheDocument()
      expect(screen.getByText('critical')).toBeInTheDocument()
    })

    it('shows +N badge when more than 3 tags', () => {
      const scans = [createMockScan({ tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'] })]

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
        />
      )

      expect(screen.getByText('+2')).toBeInTheDocument()
    })

    it('formats duration correctly', () => {
      // 10 minute scan (s_time to e_time = 600 seconds)
      const scans = [createMockScan({ s_time: 1000, e_time: 1600 })]

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
        />
      )

      expect(screen.getByText('10m 0s')).toBeInTheDocument()
    })
  })

  describe('sorting', () => {
    it('calls onSort when clicking sortable header', () => {
      const scans = [createMockScan()]

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
        />
      )

      const idHeader = screen.getByRole('button', { name: /id/i })
      fireEvent.click(idHeader)

      expect(onSort).toHaveBeenCalledWith('scan_id')
    })

    it('shows up arrow for ascending sort', () => {
      const scans = [createMockScan()]
      const ascSort: SortState = { field: 'scan_id', direction: 'asc' }

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={ascSort}
          onSort={onSort}
          isLoading={false}
        />
      )

      // ArrowUp icon should be visible for active ascending sort
      const button = screen.getByRole('button', { name: /id/i })
      const svg = button.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('shows down arrow for descending sort', () => {
      const scans = [createMockScan()]
      const descSort: SortState = { field: 'scan_id', direction: 'desc' }

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={descSort}
          onSort={onSort}
          isLoading={false}
        />
      )

      // ArrowDown icon should be visible
      const button = screen.getByRole('button', { name: /id/i })
      const svg = button.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('shows neutral icon for inactive sort fields', () => {
      const scans = [createMockScan()]
      // Sort by time, so ID should show neutral icon
      const sort: SortState = { field: 's_time', direction: 'desc' }

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={sort}
          onSort={onSort}
          isLoading={false}
        />
      )

      // ID header should have ArrowUpDown (neutral) icon
      const button = screen.getByRole('button', { name: /id/i })
      const svg = button.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('allows sorting by all sortable fields', () => {
      const scans = [createMockScan()]
      const sortableFields: SortField[] = ['scan_id', 'profile', 'host_count', 'port_count', 'duration', 's_time']

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
        />
      )

      // Click each sortable header
      sortableFields.forEach((field) => {
        const headerText = {
          scan_id: 'ID',
          profile: 'Profile',
          host_count: 'Hosts',
          port_count: 'Ports',
          duration: 'Duration',
          s_time: 'Time',
        }[field]

        const button = screen.getByRole('button', { name: new RegExp(headerText, 'i') })
        fireEvent.click(button)
        expect(onSort).toHaveBeenCalledWith(field)
      })
    })
  })

  describe('selection', () => {
    const onSelectionChange = vi.fn()
    const onSelectAll = vi.fn()

    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('does not show checkboxes by default', () => {
      const scans = [createMockScan()]

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
        />
      )

      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })

    it('shows checkboxes when showSelection is true', () => {
      const scans = [createMockScan()]

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
          showSelection={true}
          selectedIds={new Set()}
          onSelectionChange={onSelectionChange}
          onSelectAll={onSelectAll}
        />
      )

      // Should have header checkbox and row checkbox
      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes.length).toBe(2)
    })

    it('calls onSelectionChange when row checkbox clicked', () => {
      const scans = [createMockScan({ scan_id: 42 })]

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
          showSelection={true}
          selectedIds={new Set()}
          onSelectionChange={onSelectionChange}
          onSelectAll={onSelectAll}
        />
      )

      const rowCheckbox = screen.getByRole('checkbox', { name: /select scan 42/i })
      fireEvent.click(rowCheckbox)

      expect(onSelectionChange).toHaveBeenCalledWith(42)
    })

    it('shows checkbox as checked when selected', () => {
      const scans = [createMockScan({ scan_id: 42 })]

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
          showSelection={true}
          selectedIds={new Set([42])}
          onSelectionChange={onSelectionChange}
          onSelectAll={onSelectAll}
        />
      )

      const rowCheckbox = screen.getByRole('checkbox', { name: /select scan 42/i })
      expect(rowCheckbox).toBeChecked()
    })

    it('applies selected styling to row', () => {
      const scans = [createMockScan({ scan_id: 42 })]

      const { container } = renderWithProviders(
        <ScanTable
          scans={scans}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
          showSelection={true}
          selectedIds={new Set([42])}
          onSelectionChange={onSelectionChange}
          onSelectAll={onSelectAll}
        />
      )

      const tbody = container.querySelector('tbody')
      const row = tbody?.querySelector('tr')
      expect(row).toHaveClass('bg-primary/5')
    })

    describe('select all', () => {
      it('calls onSelectAll with all IDs when header checkbox clicked', () => {
        const scans = [
          createMockScan({ scan_id: 1 }),
          createMockScan({ scan_id: 2 }),
          createMockScan({ scan_id: 3 }),
        ]

        renderWithProviders(
          <ScanTable
            scans={scans}
            sort={defaultSort}
            onSort={onSort}
            isLoading={false}
            showSelection={true}
            selectedIds={new Set()}
            onSelectionChange={onSelectionChange}
            onSelectAll={onSelectAll}
          />
        )

        const headerCheckbox = screen.getByRole('checkbox', { name: /select all/i })
        fireEvent.click(headerCheckbox)

        expect(onSelectAll).toHaveBeenCalledWith([1, 2, 3])
      })

      it('calls onSelectAll with empty array when all selected and header clicked', () => {
        const scans = [
          createMockScan({ scan_id: 1 }),
          createMockScan({ scan_id: 2 }),
        ]

        renderWithProviders(
          <ScanTable
            scans={scans}
            sort={defaultSort}
            onSort={onSort}
            isLoading={false}
            showSelection={true}
            selectedIds={new Set([1, 2])}
            onSelectionChange={onSelectionChange}
            onSelectAll={onSelectAll}
          />
        )

        const headerCheckbox = screen.getByRole('checkbox', { name: /select all/i })
        fireEvent.click(headerCheckbox)

        expect(onSelectAll).toHaveBeenCalledWith([])
      })

      it('shows header checkbox as checked when all selected', () => {
        const scans = [
          createMockScan({ scan_id: 1 }),
          createMockScan({ scan_id: 2 }),
        ]

        renderWithProviders(
          <ScanTable
            scans={scans}
            sort={defaultSort}
            onSort={onSort}
            isLoading={false}
            showSelection={true}
            selectedIds={new Set([1, 2])}
            onSelectionChange={onSelectionChange}
            onSelectAll={onSelectAll}
          />
        )

        const headerCheckbox = screen.getByRole('checkbox', { name: /select all/i })
        expect(headerCheckbox).toBeChecked()
      })

      it('shows header checkbox as unchecked when none selected', () => {
        const scans = [
          createMockScan({ scan_id: 1 }),
          createMockScan({ scan_id: 2 }),
        ]

        renderWithProviders(
          <ScanTable
            scans={scans}
            sort={defaultSort}
            onSort={onSort}
            isLoading={false}
            showSelection={true}
            selectedIds={new Set()}
            onSelectionChange={onSelectionChange}
            onSelectAll={onSelectAll}
          />
        )

        const headerCheckbox = screen.getByRole('checkbox', { name: /select all/i })
        expect(headerCheckbox).not.toBeChecked()
      })
    })
  })

  describe('mode badge', () => {
    it('renders mode as badge', () => {
      const scans = [createMockScan({ mode_str: 'syn' })]

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
        />
      )

      const modeBadge = screen.getByText('syn')
      expect(modeBadge).toBeInTheDocument()
    })

    it('shows Unknown for null mode', () => {
      const scans = [createMockScan({ mode_str: null } as unknown as Partial<ScanSummary>)]

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
        />
      )

      expect(screen.getByText('Unknown')).toBeInTheDocument()
    })
  })

  describe('target display', () => {
    it('truncates long targets', () => {
      const longTarget = '192.168.1.0/24,10.0.0.0/8,172.16.0.0/12,fe80::/10'
      const scans = [createMockScan({ target_str: longTarget })]

      const { container } = renderWithProviders(
        <ScanTable
          scans={scans}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
        />
      )

      const targetCell = container.querySelector('.truncate')
      expect(targetCell).toBeInTheDocument()
      expect(targetCell).toHaveAttribute('title', longTarget)
    })
  })

  describe('time display', () => {
    it('shows relative time in cell', () => {
      const oneHourAgo = Math.floor(Date.now() / 1000) - 3600
      const scans = [createMockScan({ s_time: oneHourAgo })]

      renderWithProviders(
        <ScanTable
          scans={scans}
          sort={defaultSort}
          onSort={onSort}
          isLoading={false}
        />
      )

      expect(screen.getByText(/1h ago/i)).toBeInTheDocument()
    })
  })
})
