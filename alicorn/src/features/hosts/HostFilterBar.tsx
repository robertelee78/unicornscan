/**
 * Host filter controls with smart search
 * Auto-detects search type: port, CIDR, IP prefix, MAC, regex, or text
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo, useState, useEffect } from 'react'
import { Search, X, Building2, HelpCircle, AlertCircle, MessageSquareText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { HostFilters, ParsedSearch } from './types'
import { DEFAULT_FILTERS } from './types'
import {
  parseSearch,
  validateRegex,
  getSearchTypeDescription,
  type SearchType,
} from './search-utils'
import { useDebounce } from '@/hooks'

// =============================================================================
// Constants
// =============================================================================

const DEBOUNCE_DELAY = 300 // ms

/**
 * Badge variant for each search type
 */
const SEARCH_TYPE_VARIANTS: Record<SearchType, 'secondary' | 'info' | 'outline'> = {
  port: 'info',
  cidr: 'info',
  'ip-prefix': 'info',
  mac: 'info',
  regex: 'secondary',
  text: 'outline',
}

/**
 * Short label for each search type
 */
const SEARCH_TYPE_LABELS: Record<SearchType, string> = {
  port: 'Port',
  cidr: 'CIDR',
  'ip-prefix': 'IP Prefix',
  mac: 'MAC',
  regex: 'Regex',
  text: 'Text',
}

// =============================================================================
// Component
// =============================================================================

interface HostFilterBarProps {
  filters: HostFilters
  onChange: (filters: HostFilters) => void
  /** Optional: parsed search from hook for consistency display */
  parsedSearch?: ParsedSearch | null
}

export function HostFilterBar({ filters, onChange, parsedSearch: hookParsedSearch }: HostFilterBarProps) {
  // Local input state for immediate feedback
  const [localSearch, setLocalSearch] = useState(filters.search)

  // Debounced search value for actual filtering
  const debouncedSearch = useDebounce(localSearch, DEBOUNCE_DELAY)

  // Sync debounced value to parent
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onChange({ ...filters, search: debouncedSearch })
    }
  }, [debouncedSearch, filters, onChange])

  // Sync external changes back to local state (e.g., clear filters)
  useEffect(() => {
    if (filters.search !== localSearch && filters.search === '') {
      setLocalSearch('')
    }
    // Only sync when filters.search is cleared externally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search])

  // Parse search locally for immediate type detection feedback
  const localParsedSearch = useMemo(() => {
    if (!localSearch.trim()) return null
    return parseSearch(localSearch)
  }, [localSearch])

  // Use hook's parsed search if available, otherwise use local
  const displayParsedSearch = hookParsedSearch ?? localParsedSearch

  // Validate regex patterns
  const regexError = useMemo(() => {
    if (!localSearch.trim()) return null
    return validateRegex(localSearch)
  }, [localSearch])

  const hasFilters = localSearch || filters.hasOpenPorts !== null || filters.hasBanner !== null || filters.vendorFilter

  const handleSearchChange = (value: string) => {
    setLocalSearch(value)
  }

  const handleVendorFilterChange = (value: string) => {
    onChange({ ...filters, vendorFilter: value })
  }

  const handlePortsFilterChange = (value: string) => {
    const hasOpenPorts = value === 'all' ? null : value === 'open'
    onChange({ ...filters, hasOpenPorts })
  }

  const handleBannerFilterChange = (value: string) => {
    const hasBanner = value === 'all' ? null : value === 'with'
    onChange({ ...filters, hasBanner })
  }

  const handleClear = () => {
    setLocalSearch('')
    onChange(DEFAULT_FILTERS)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Smart Search input */}
      <div className="relative flex-1 min-w-[280px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <Input
          placeholder="Search: IP, port, CIDR, MAC, banner... (e.g., 443, /Apache/)"
          value={localSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          className={`pl-9 pr-24 h-9 ${regexError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
          aria-invalid={!!regexError}
          aria-describedby={regexError ? 'search-error' : undefined}
        />
        {/* Search type badge */}
        {displayParsedSearch && localSearch.trim() && (
          <div className="absolute right-10 top-1/2 -translate-y-1/2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant={SEARCH_TYPE_VARIANTS[displayParsedSearch.type]}
                    className="text-[10px] px-1.5 py-0 cursor-help"
                  >
                    {SEARCH_TYPE_LABELS[displayParsedSearch.type]}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p>{getSearchTypeDescription(displayParsedSearch.type)}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
        {/* Help icon with search tips */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                aria-label="Search help"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="max-w-xs p-3">
              <div className="space-y-2 text-xs">
                <p className="font-semibold text-foreground">Smart Search</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li><span className="text-foreground font-medium">22</span> - Port number</li>
                  <li><span className="text-foreground font-medium">192.168.1.0/24</span> - CIDR range</li>
                  <li><span className="text-foreground font-medium">10.0.1.</span> - IP prefix</li>
                  <li><span className="text-foreground font-medium">00:11:22</span> - MAC address</li>
                  <li><span className="text-foreground font-medium">/Apache/i</span> - Regex pattern</li>
                  <li><span className="text-foreground font-medium">webserver</span> - Text search</li>
                </ul>
                <p className="text-muted-foreground pt-1">
                  Text search matches IP, hostname, MAC, banners, notes, and OS.
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Regex error indicator */}
      {regexError && (
        <div
          id="search-error"
          className="flex items-center gap-1 text-xs text-destructive"
          role="alert"
        >
          <AlertCircle className="h-3.5 w-3.5" />
          <span>{regexError}</span>
        </div>
      )}

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
        <SelectTrigger className="w-[150px] h-9">
          <SelectValue placeholder="Port status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All hosts</SelectItem>
          <SelectItem value="open">Has responses</SelectItem>
          <SelectItem value="none">No responses</SelectItem>
        </SelectContent>
      </Select>

      {/* Banner filter */}
      <Select
        value={filters.hasBanner === null ? 'all' : filters.hasBanner ? 'with' : 'without'}
        onValueChange={handleBannerFilterChange}
      >
        <SelectTrigger className="w-[150px] h-9">
          <MessageSquareText className="h-4 w-4 mr-2 text-muted" />
          <SelectValue placeholder="Banners" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All hosts</SelectItem>
          <SelectItem value="with">Has banners</SelectItem>
          <SelectItem value="without">No banners</SelectItem>
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
