/**
 * Unit tests for src/features/scans/components/FilterPanel.tsx
 * Tests filter inputs, collapsible behavior, checkbox groups, and clear all
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test-utils'
import type { ScanFilters } from '@/features/scans/types'
import { DEFAULT_FILTERS } from '@/features/scans/types'

// Mock the hooks
vi.mock('@/features/scans/hooks', () => ({
  useAvailableProfiles: vi.fn(() => ['Default', 'Quick', 'Full']),
  useAvailableModes: vi.fn(() => ['tcp', 'syn', 'udp']),
}))

// Mock sub-components that have complex behavior
vi.mock('@/features/scans/components/FilterChipBar', () => ({
  FilterChipBar: () => <div data-testid="filter-chip-bar" />,
}))

vi.mock('@/features/scans/components/SavedFiltersSection', () => ({
  SavedFiltersSection: () => <div data-testid="saved-filters-section" />,
}))

import { FilterPanel } from '@/features/scans/components/FilterPanel'

describe('FilterPanel', () => {
  const defaultFilters: ScanFilters = { ...DEFAULT_FILTERS }
  const onChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('basic rendering', () => {
    it('renders filter panel with trigger button', () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument()
    })

    it('starts expanded by default', () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      // Filter inputs should be visible
      expect(screen.getByLabelText(/target ip \/ port/i)).toBeInTheDocument()
    })

    it('renders FilterChipBar', () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      expect(screen.getByTestId('filter-chip-bar')).toBeInTheDocument()
    })

    it('renders SavedFiltersSection', () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      expect(screen.getByTestId('saved-filters-section')).toBeInTheDocument()
    })
  })

  describe('collapsible behavior', () => {
    it('collapses when trigger button clicked', async () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      const trigger = screen.getByRole('button', { name: /filters/i })
      fireEvent.click(trigger)

      await waitFor(() => {
        // Trigger should have aria-expanded=false when collapsed
        expect(trigger).toHaveAttribute('aria-expanded', 'false')
      })
    })

    it('expands when collapsed and trigger clicked', async () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      const trigger = screen.getByRole('button', { name: /filters/i })

      // Collapse
      fireEvent.click(trigger)

      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'false')
      })

      // Expand
      fireEvent.click(trigger)

      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'true')
      })
    })

    it('shows chevron icon that rotates', () => {
      const { container } = renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      // Check for chevron icon
      const chevron = container.querySelector('.lucide-chevron-down')
      expect(chevron).toBeInTheDocument()
    })
  })

  describe('active filter badge', () => {
    it('does not show badge when no filters active', () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      // No badge should be present
      const trigger = screen.getByRole('button', { name: /filters/i })
      expect(trigger.querySelector('.rounded-full')).not.toBeInTheDocument()
    })

    it('shows badge with count when filters are active', () => {
      const activeFilters: ScanFilters = {
        ...defaultFilters,
        search: 'test',
        profiles: ['Default'],
      }

      renderWithProviders(
        <FilterPanel filters={activeFilters} onChange={onChange} />
      )

      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })

  describe('search inputs', () => {
    it('renders target/port search input', () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      expect(screen.getByPlaceholderText(/search by ip or port/i)).toBeInTheDocument()
    })

    it('renders notes search input', () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      expect(screen.getByPlaceholderText(/search in scan notes/i)).toBeInTheDocument()
    })

    it('calls onChange when target search changes', async () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      const searchInput = screen.getByPlaceholderText(/search by ip or port/i)
      fireEvent.change(searchInput, { target: { value: '192.168' } })

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ search: '192.168' })
      )
    })

    it('calls onChange when notes search changes', async () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      const notesInput = screen.getByPlaceholderText(/search in scan notes/i)
      fireEvent.change(notesInput, { target: { value: 'critical' } })

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ notesSearch: 'critical' })
      )
    })

    it('displays current filter values', () => {
      const filtersWithSearch: ScanFilters = {
        ...defaultFilters,
        search: 'existing-search',
        notesSearch: 'existing-notes',
      }

      renderWithProviders(
        <FilterPanel filters={filtersWithSearch} onChange={onChange} />
      )

      expect(screen.getByDisplayValue('existing-search')).toBeInTheDocument()
      expect(screen.getByDisplayValue('existing-notes')).toBeInTheDocument()
    })
  })

  describe('date inputs', () => {
    it('renders from date input', () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      expect(screen.getByLabelText(/from date/i)).toBeInTheDocument()
    })

    it('renders to date input', () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      expect(screen.getByLabelText(/to date/i)).toBeInTheDocument()
    })

    it('calls onChange when from date changes', async () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      const fromDateInput = screen.getByLabelText(/from date/i)
      fireEvent.change(fromDateInput, { target: { value: '2025-01-01' } })

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(
          expect.objectContaining({ dateFrom: expect.any(Number) })
        )
      })
    })

    it('calls onChange when to date changes', async () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      const toDateInput = screen.getByLabelText(/to date/i)
      fireEvent.change(toDateInput, { target: { value: '2025-12-31' } })

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(
          expect.objectContaining({ dateTo: expect.any(Number) })
        )
      })
    })

    it('clears date filter when input cleared', async () => {
      const filtersWithDate: ScanFilters = {
        ...defaultFilters,
        dateFrom: 1704067200, // 2024-01-01
      }

      renderWithProviders(
        <FilterPanel filters={filtersWithDate} onChange={onChange} />
      )

      const fromDateInput = screen.getByLabelText(/from date/i)
      fireEvent.change(fromDateInput, { target: { value: '' } })

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(
          expect.objectContaining({ dateFrom: null })
        )
      })
    })
  })

  describe('host count inputs', () => {
    it('renders min hosts input', () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      expect(screen.getByLabelText(/min hosts/i)).toBeInTheDocument()
    })

    it('renders max hosts input', () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      expect(screen.getByLabelText(/max hosts/i)).toBeInTheDocument()
    })

    it('calls onChange when min hosts changes', async () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      const minHostsInput = screen.getByLabelText(/min hosts/i)
      await userEvent.type(minHostsInput, '5')

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(
          expect.objectContaining({ minHosts: 5 })
        )
      })
    })

    it('calls onChange when max hosts changes', async () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      const maxHostsInput = screen.getByLabelText(/max hosts/i)
      fireEvent.change(maxHostsInput, { target: { value: '100' } })

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ maxHosts: 100 })
      )
    })

    it('clears host count filter when input cleared', async () => {
      const filtersWithHosts: ScanFilters = {
        ...defaultFilters,
        minHosts: 10,
      }

      renderWithProviders(
        <FilterPanel filters={filtersWithHosts} onChange={onChange} />
      )

      const minHostsInput = screen.getByLabelText(/min hosts/i)
      await userEvent.clear(minHostsInput)

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(
          expect.objectContaining({ minHosts: null })
        )
      })
    })
  })

  describe('checkbox filter groups', () => {
    it('renders profiles checkbox group', () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      expect(screen.getByText('Profiles')).toBeInTheDocument()
    })

    it('renders scan modes checkbox group', () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      expect(screen.getByText('Scan Modes')).toBeInTheDocument()
    })
  })

  describe('clear all button', () => {
    it('does not show Clear All when no filters active', () => {
      renderWithProviders(
        <FilterPanel filters={defaultFilters} onChange={onChange} />
      )

      expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument()
    })

    it('shows Clear All button when filters are active', () => {
      const activeFilters: ScanFilters = {
        ...defaultFilters,
        search: 'test',
      }

      renderWithProviders(
        <FilterPanel filters={activeFilters} onChange={onChange} />
      )

      expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument()
    })

    it('calls onChange with default filters when Clear All clicked', async () => {
      const activeFilters: ScanFilters = {
        ...defaultFilters,
        search: 'test',
        profiles: ['Default'],
        modes: ['tcp'],
        minHosts: 5,
      }

      renderWithProviders(
        <FilterPanel filters={activeFilters} onChange={onChange} />
      )

      fireEvent.click(screen.getByRole('button', { name: /clear all/i }))

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(DEFAULT_FILTERS)
      })
    })
  })

  describe('className prop', () => {
    it('applies custom className', () => {
      const { container } = renderWithProviders(
        <FilterPanel
          filters={defaultFilters}
          onChange={onChange}
          className="custom-filter-class"
        />
      )

      expect(container.firstChild).toHaveClass('custom-filter-class')
    })
  })

  describe('filter detection', () => {
    it('detects active search filter', () => {
      const filters: ScanFilters = { ...defaultFilters, search: 'test' }

      renderWithProviders(
        <FilterPanel filters={filters} onChange={onChange} />
      )

      expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument()
    })

    it('detects active notes filter', () => {
      const filters: ScanFilters = { ...defaultFilters, notesSearch: 'important' }

      renderWithProviders(
        <FilterPanel filters={filters} onChange={onChange} />
      )

      expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument()
    })

    it('detects active profiles filter', () => {
      const filters: ScanFilters = { ...defaultFilters, profiles: ['Default'] }

      renderWithProviders(
        <FilterPanel filters={filters} onChange={onChange} />
      )

      expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument()
    })

    it('detects active modes filter', () => {
      const filters: ScanFilters = { ...defaultFilters, modes: ['tcp'] }

      renderWithProviders(
        <FilterPanel filters={filters} onChange={onChange} />
      )

      expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument()
    })

    it('detects active date filters', () => {
      const filters: ScanFilters = { ...defaultFilters, dateFrom: 1704067200 }

      renderWithProviders(
        <FilterPanel filters={filters} onChange={onChange} />
      )

      expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument()
    })

    it('detects active host count filters', () => {
      const filters: ScanFilters = { ...defaultFilters, maxHosts: 50 }

      renderWithProviders(
        <FilterPanel filters={filters} onChange={onChange} />
      )

      expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument()
    })
  })
})
