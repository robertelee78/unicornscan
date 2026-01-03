/**
 * Host filter controls
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Search, X, Building2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { HostFilters } from './types'
import { DEFAULT_FILTERS } from './types'

interface HostFilterBarProps {
  filters: HostFilters
  onChange: (filters: HostFilters) => void
}

export function HostFilterBar({ filters, onChange }: HostFilterBarProps) {
  const hasFilters = filters.search || filters.hasOpenPorts !== null || filters.vendorFilter

  const handleSearchChange = (value: string) => {
    onChange({ ...filters, search: value })
  }

  const handleVendorFilterChange = (value: string) => {
    onChange({ ...filters, vendorFilter: value })
  }

  const handlePortsFilterChange = (value: string) => {
    const hasOpenPorts = value === 'all' ? null : value === 'open'
    onChange({ ...filters, hasOpenPorts })
  }

  const handleClear = () => {
    onChange(DEFAULT_FILTERS)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search input */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <Input
          placeholder="Search IP, hostname, or MAC..."
          value={filters.search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Vendor filter */}
      <div className="relative min-w-[160px] max-w-[200px]">
        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <Input
          placeholder="Filter by vendor..."
          value={filters.vendorFilter}
          onChange={(e) => handleVendorFilterChange(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Response filter */}
      <Select
        value={filters.hasOpenPorts === null ? 'all' : filters.hasOpenPorts ? 'open' : 'none'}
        onValueChange={handlePortsFilterChange}
      >
        <SelectTrigger className="w-[180px] h-9">
          <SelectValue placeholder="Port status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All hosts</SelectItem>
          <SelectItem value="open">Has responses</SelectItem>
          <SelectItem value="none">No responses</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear filters */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="h-9"
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  )
}
