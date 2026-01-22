/**
 * Collapsible filter panel with checkbox-based multi-select filters
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback } from 'react'
import { ChevronDown, Search, StickyNote, Calendar, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { CheckboxFilterGroup } from './CheckboxFilterGroup'
import { FilterChipBar } from './FilterChipBar'
import { SavedFiltersSection } from './SavedFiltersSection'
import type { ScanFilters } from '../types'
import { DEFAULT_FILTERS } from '../types'
import { useAvailableProfiles, useAvailableModes } from '../hooks'

interface FilterPanelProps {
  filters: ScanFilters
  onChange: (filters: ScanFilters) => void
  className?: string
}

export function FilterPanel({ filters, onChange, className }: FilterPanelProps) {
  const [isOpen, setIsOpen] = useState(true)
  const profiles = useAvailableProfiles()
  const modes = useAvailableModes()

  // Check if any filters are active
  const hasActiveFilters =
    filters.search !== '' ||
    filters.notesSearch !== '' ||
    filters.profiles.length > 0 ||
    filters.modes.length > 0 ||
    filters.dateFrom !== null ||
    filters.dateTo !== null ||
    filters.minHosts !== null ||
    filters.maxHosts !== null

  // Count active filters
  const activeFilterCount = [
    filters.search !== '',
    filters.notesSearch !== '',
    filters.profiles.length > 0,
    filters.modes.length > 0,
    filters.dateFrom !== null,
    filters.dateTo !== null,
    filters.minHosts !== null,
    filters.maxHosts !== null,
  ].filter(Boolean).length

  const handleClearAll = useCallback(() => {
    onChange(DEFAULT_FILTERS)
  }, [onChange])

  // Date input handlers
  const handleDateFromChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      if (value) {
        const timestamp = Math.floor(new Date(value).getTime() / 1000)
        onChange({ ...filters, dateFrom: timestamp })
      } else {
        onChange({ ...filters, dateFrom: null })
      }
    },
    [filters, onChange]
  )

  const handleDateToChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      if (value) {
        const timestamp = Math.floor(new Date(value).getTime() / 1000)
        onChange({ ...filters, dateTo: timestamp })
      } else {
        onChange({ ...filters, dateTo: null })
      }
    },
    [filters, onChange]
  )

  // Convert timestamps to date input values
  const dateFromValue = filters.dateFrom
    ? new Date(filters.dateFrom * 1000).toISOString().split('T')[0]
    : ''
  const dateToValue = filters.dateTo
    ? new Date(filters.dateTo * 1000).toISOString().split('T')[0]
    : ''

  return (
    <div className={cn('space-y-3', className)}>
      {/* Filter chip bar - always visible when filters are active */}
      <FilterChipBar filters={filters} onChange={onChange} />

      {/* Collapsible filter panel */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between px-2 hover:bg-accent"
          >
            <span className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform duration-200',
                isOpen ? 'rotate-180' : ''
              )}
            />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-3">
          <div className="space-y-4 rounded-lg border bg-card p-4">
            {/* Search inputs */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Target/Port search */}
              <div className="space-y-1.5">
                <Label htmlFor="search-target" className="text-xs text-muted-foreground">
                  <Search className="inline-block h-3 w-3 mr-1" />
                  Target IP / Port
                </Label>
                <Input
                  id="search-target"
                  placeholder="Search by IP or port..."
                  value={filters.search}
                  onChange={(e) => onChange({ ...filters, search: e.target.value })}
                  className="h-8"
                />
              </div>

              {/* Notes search */}
              <div className="space-y-1.5">
                <Label htmlFor="search-notes" className="text-xs text-muted-foreground">
                  <StickyNote className="inline-block h-3 w-3 mr-1" />
                  Scan Notes
                </Label>
                <Input
                  id="search-notes"
                  placeholder="Search in scan notes..."
                  value={filters.notesSearch}
                  onChange={(e) => onChange({ ...filters, notesSearch: e.target.value })}
                  className="h-8"
                />
              </div>
            </div>

            {/* Date range */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="date-from" className="text-xs text-muted-foreground">
                  <Calendar className="inline-block h-3 w-3 mr-1" />
                  From Date
                </Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFromValue}
                  onChange={handleDateFromChange}
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date-to" className="text-xs text-muted-foreground">
                  <Calendar className="inline-block h-3 w-3 mr-1" />
                  To Date
                </Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateToValue}
                  onChange={handleDateToChange}
                  className="h-8"
                />
              </div>
            </div>

            {/* Checkbox filters */}
            <div className="grid gap-4 sm:grid-cols-2">
              <CheckboxFilterGroup
                label="Profiles"
                options={profiles}
                selected={filters.profiles}
                onChange={(selected) => onChange({ ...filters, profiles: selected })}
                maxHeight="150px"
              />
              <CheckboxFilterGroup
                label="Scan Modes"
                options={modes}
                selected={filters.modes}
                onChange={(selected) => onChange({ ...filters, modes: selected })}
                maxHeight="150px"
              />
            </div>

            {/* Host count filters */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="min-hosts" className="text-xs text-muted-foreground">
                  Min Hosts
                </Label>
                <Input
                  id="min-hosts"
                  type="number"
                  min={0}
                  placeholder="0"
                  value={filters.minHosts ?? ''}
                  onChange={(e) =>
                    onChange({
                      ...filters,
                      minHosts: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max-hosts" className="text-xs text-muted-foreground">
                  Max Hosts
                </Label>
                <Input
                  id="max-hosts"
                  type="number"
                  min={0}
                  placeholder="∞"
                  value={filters.maxHosts ?? ''}
                  onChange={(e) =>
                    onChange({
                      ...filters,
                      maxHosts: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  className="h-8"
                />
              </div>
            </div>

            {/* Saved filters section */}
            <div className="pt-2 border-t">
              <SavedFiltersSection
                currentFilters={filters}
                onApplyFilter={onChange}
                filterType="scan"
              />
            </div>

            {/* Clear all button */}
            {hasActiveFilters && (
              <div className="flex justify-end pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAll}
                  className="text-xs"
                >
                  Clear All Filters
                </Button>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
