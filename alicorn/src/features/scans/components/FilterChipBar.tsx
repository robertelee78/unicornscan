/**
 * Active filter chips bar - shows current filter state with remove buttons
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ScanFilters } from '../types'
import { DEFAULT_FILTERS } from '../types'
import { formatTimestamp } from '@/lib/utils'

interface FilterChipBarProps {
  filters: ScanFilters
  onChange: (filters: ScanFilters) => void
}

interface FilterChip {
  key: string
  label: string
  onRemove: () => void
}

export function FilterChipBar({ filters, onChange }: FilterChipBarProps) {
  const chips: FilterChip[] = []

  // Search chip
  if (filters.search) {
    chips.push({
      key: 'search',
      label: `Search: ${filters.search}`,
      onRemove: () => onChange({ ...filters, search: '' }),
    })
  }

  // Notes search chip
  if (filters.notesSearch) {
    chips.push({
      key: 'notesSearch',
      label: `Notes: ${filters.notesSearch}`,
      onRemove: () => onChange({ ...filters, notesSearch: '' }),
    })
  }

  // Date range chips
  if (filters.dateFrom) {
    chips.push({
      key: 'dateFrom',
      label: `From: ${formatTimestamp(filters.dateFrom)}`,
      onRemove: () => onChange({ ...filters, dateFrom: null }),
    })
  }

  if (filters.dateTo) {
    chips.push({
      key: 'dateTo',
      label: `To: ${formatTimestamp(filters.dateTo)}`,
      onRemove: () => onChange({ ...filters, dateTo: null }),
    })
  }

  // Profile chips
  filters.profiles.forEach((profile) => {
    chips.push({
      key: `profile-${profile}`,
      label: `Profile: ${profile}`,
      onRemove: () =>
        onChange({
          ...filters,
          profiles: filters.profiles.filter((p) => p !== profile),
        }),
    })
  })

  // Mode chips
  filters.modes.forEach((mode) => {
    chips.push({
      key: `mode-${mode}`,
      label: `Mode: ${mode}`,
      onRemove: () =>
        onChange({
          ...filters,
          modes: filters.modes.filter((m) => m !== mode),
        }),
    })
  })

  // Host count chips
  if (filters.minHosts !== null) {
    chips.push({
      key: 'minHosts',
      label: `Min hosts: ${filters.minHosts}`,
      onRemove: () => onChange({ ...filters, minHosts: null }),
    })
  }

  if (filters.maxHosts !== null) {
    chips.push({
      key: 'maxHosts',
      label: `Max hosts: ${filters.maxHosts}`,
      onRemove: () => onChange({ ...filters, maxHosts: null }),
    })
  }

  if (chips.length === 0) {
    return null
  }

  const handleClearAll = () => {
    onChange(DEFAULT_FILTERS)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Badge
          key={chip.key}
          variant="secondary"
          className="gap-1 pr-1 text-xs"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label={`Remove ${chip.label} filter`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {chips.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearAll}
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Clear all
        </Button>
      )}
    </div>
  )
}
