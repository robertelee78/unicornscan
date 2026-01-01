/**
 * Timeline control bar
 * Zoom, pan, filter, and export controls
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useCallback, useState } from 'react'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Download,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import type {
  TimelineFilter,
  TimelineSummary,
  ChangeType,
  ChangeSeverity,
} from './types'
import {
  DEFAULT_FILTER,
  getChangeTypeLabel,
  getChangeTypeColor,
} from './types'
import { formatTimestamp } from './timeline-utils'

// =============================================================================
// Props
// =============================================================================

interface TimelineControlsProps {
  // Summary data
  summary: TimelineSummary | null

  // Zoom controls
  zoomLevel: number
  canZoomIn: boolean
  canZoomOut: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void

  // Pan controls
  canPanLeft: boolean
  canPanRight: boolean
  onPanLeft: () => void
  onPanRight: () => void

  // View range
  visibleRange: { start: number; end: number } | null
  fullRange: { start: number; end: number } | null

  // Filter state
  filter: TimelineFilter
  onFilterChange: (updates: Partial<TimelineFilter>) => void
  onResetFilter: () => void

  // Export
  onExport: () => void
}

// =============================================================================
// Component
// =============================================================================

export function TimelineControls({
  summary,
  zoomLevel,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  canPanLeft,
  canPanRight,
  onPanLeft,
  onPanRight,
  visibleRange,
  fullRange,
  filter,
  onFilterChange,
  onResetFilter,
  onExport,
}: TimelineControlsProps) {
  const [filterOpen, setFilterOpen] = useState(false)

  // Count active filters
  const activeFilterCount = countActiveFilters(filter)

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {/* Summary badges */}
      {summary && (
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="secondary">
            {summary.totalPorts} ports
          </Badge>
          <Badge variant="outline">
            {summary.totalChanges} changes
          </Badge>
          {summary.portsWithSignificantChanges > 0 && (
            <Badge variant="destructive">
              {summary.portsWithSignificantChanges} significant
            </Badge>
          )}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* View range indicator */}
      {visibleRange && fullRange && zoomLevel > 1 && (
        <div className="text-xs text-muted-foreground">
          {formatTimestamp(visibleRange.start)} - {formatTimestamp(visibleRange.end)}
        </div>
      )}

      {/* Pan controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onPanLeft}
          disabled={!canPanLeft}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onPanRight}
          disabled={!canPanRight}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-1 border-l pl-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onZoomOut}
          disabled={!canZoomOut}
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground w-10 text-center">
          {zoomLevel}x
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onZoomIn}
          disabled={!canZoomIn}
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onResetZoom}
          disabled={zoomLevel === 1}
          title="Reset zoom"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Filter popover */}
      <Popover open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="relative"
          >
            <Filter className="h-4 w-4 mr-1" />
            Filter
            {activeFilterCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs flex items-center justify-center"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <FilterPanel
            filter={filter}
            onChange={onFilterChange}
            onReset={onResetFilter}
            onClose={() => setFilterOpen(false)}
          />
        </PopoverContent>
      </Popover>

      {/* Export button */}
      <Button variant="outline" size="sm" onClick={onExport}>
        <Download className="h-4 w-4 mr-1" />
        Export
      </Button>
    </div>
  )
}

// =============================================================================
// Filter Panel
// =============================================================================

interface FilterPanelProps {
  filter: TimelineFilter
  onChange: (updates: Partial<TimelineFilter>) => void
  onReset: () => void
  onClose: () => void
}

function FilterPanel({ filter, onChange, onReset, onClose }: FilterPanelProps) {
  const handlePortFilterChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ portFilter: e.target.value })
  }, [onChange])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">Filter Timeline</h4>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Port filter */}
      <div className="space-y-2">
        <Label className="text-xs">Port Filter</Label>
        <Input
          placeholder="e.g., 80, 443, 1-1024"
          value={filter.portFilter}
          onChange={handlePortFilterChange}
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Comma-separated ports or ranges
        </p>
      </div>

      {/* Protocol checkboxes */}
      <div className="space-y-2">
        <Label className="text-xs">Protocols</Label>
        <div className="flex gap-4">
          {(['tcp', 'udp', 'other'] as const).map(protocol => (
            <label key={protocol} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={filter.protocols.includes(protocol)}
                onCheckedChange={() => {
                  const protocols = filter.protocols.includes(protocol)
                    ? filter.protocols.filter(p => p !== protocol)
                    : [...filter.protocols, protocol]
                  onChange({ protocols })
                }}
              />
              {protocol.toUpperCase()}
            </label>
          ))}
        </div>
      </div>

      {/* Change type checkboxes */}
      <div className="space-y-2">
        <Label className="text-xs">Change Types</Label>
        <div className="grid grid-cols-2 gap-2">
          {(['appeared', 'disappeared', 'reappeared', 'ttl_changed', 'flags_changed', 'window_changed'] as ChangeType[]).map(type => (
            <label key={type} className="flex items-center gap-1.5 text-xs">
              <Checkbox
                checked={filter.changeTypes.includes(type)}
                onCheckedChange={() => {
                  const changeTypes = filter.changeTypes.includes(type)
                    ? filter.changeTypes.filter(t => t !== type)
                    : [...filter.changeTypes, type]
                  onChange({ changeTypes })
                }}
              />
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: getChangeTypeColor(type) }}
              />
              {getChangeTypeLabel(type)}
            </label>
          ))}
        </div>
      </div>

      {/* Severity checkboxes */}
      <div className="space-y-2">
        <Label className="text-xs">Severity Levels</Label>
        <div className="flex gap-3">
          {(['info', 'minor', 'notable', 'significant'] as ChangeSeverity[]).map(severity => (
            <label key={severity} className="flex items-center gap-1.5 text-xs">
              <Checkbox
                checked={filter.severities.includes(severity)}
                onCheckedChange={() => {
                  const severities = filter.severities.includes(severity)
                    ? filter.severities.filter(s => s !== severity)
                    : [...filter.severities, severity]
                  onChange({ severities })
                }}
              />
              {severity}
            </label>
          ))}
        </div>
      </div>

      {/* Quick toggles */}
      <div className="space-y-2 pt-2 border-t">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={filter.changesOnly}
            onCheckedChange={(checked) => onChange({ changesOnly: !!checked })}
          />
          Show only ports with changes
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={filter.activeOnly}
            onCheckedChange={(checked) => onChange({ activeOnly: !!checked })}
          />
          Show only active ports
        </label>
      </div>

      {/* Reset button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={onReset}
      >
        Reset Filters
      </Button>
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================

function countActiveFilters(filter: TimelineFilter): number {
  let count = 0

  // Port filter
  if (filter.portFilter) count++

  // Protocols (count if not all selected)
  if (filter.protocols.length !== DEFAULT_FILTER.protocols.length) count++

  // Change types (count if not all selected)
  if (filter.changeTypes.length !== DEFAULT_FILTER.changeTypes.length) count++

  // Severities (count if not all selected)
  if (filter.severities.length !== DEFAULT_FILTER.severities.length) count++

  // Toggles
  if (filter.changesOnly) count++
  if (filter.activeOnly) count++

  return count
}
