/**
 * Scan list filter controls - now uses collapsible checkbox-based FilterPanel
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { FilterPanel } from './components'
import type { ScanFilters } from './types'

interface ScanFiltersProps {
  filters: ScanFilters
  onChange: (filters: ScanFilters) => void
}

export function ScanFilterBar({ filters, onChange }: ScanFiltersProps) {
  return <FilterPanel filters={filters} onChange={onChange} />
}
