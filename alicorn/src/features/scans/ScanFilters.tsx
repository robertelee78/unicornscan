/**
 * Scan list filter controls
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Search, X, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ScanFilters } from './types'
import { DEFAULT_FILTERS } from './types'
import { useAvailableProfiles, useAvailableModes } from './hooks'

interface ScanFiltersProps {
  filters: ScanFilters
  onChange: (filters: ScanFilters) => void
}

export function ScanFilterBar({ filters, onChange }: ScanFiltersProps) {
  const profiles = useAvailableProfiles()
  const modes = useAvailableModes()

  const hasFilters =
    filters.search !== '' ||
    filters.profiles.length > 0 ||
    filters.modes.length > 0 ||
    filters.dateFrom !== null ||
    filters.dateTo !== null

  const handleClearFilters = () => {
    onChange(DEFAULT_FILTERS)
  }

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-[300px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <Input
          placeholder="Search by target IP or port..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="pl-9"
        />
      </div>

      {/* Profile Filter */}
      <Select
        value={filters.profiles[0] || 'all'}
        onValueChange={(value) =>
          onChange({
            ...filters,
            profiles: value === 'all' ? [] : [value],
          })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Profile" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Profiles</SelectItem>
          {profiles.map((profile) => (
            <SelectItem key={profile} value={profile}>
              {profile}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Mode Filter */}
      <Select
        value={filters.modes[0] || 'all'}
        onValueChange={(value) =>
          onChange({
            ...filters,
            modes: value === 'all' ? [] : [value],
          })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Mode" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Modes</SelectItem>
          {modes.map((mode) => (
            <SelectItem key={mode} value={mode}>
              {mode}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear Filters */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearFilters}
          className="text-muted hover:text-foreground"
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}

      {/* Filter indicator */}
      {hasFilters && (
        <div className="flex items-center gap-1 text-sm text-muted">
          <Filter className="h-3 w-3" />
          <span>Filtered</span>
        </div>
      )}
    </div>
  )
}
