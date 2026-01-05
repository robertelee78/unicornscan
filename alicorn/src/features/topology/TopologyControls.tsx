/**
 * Topology visualization controls
 * Filter and interaction controls for network graph
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useOsFamilyCounts } from './hooks'
import type { TopologyFilters, TopologyConfig } from './types'

// =============================================================================
// Props
// =============================================================================

interface TopologyControlsProps {
  filters: TopologyFilters
  onFiltersChange: (filters: TopologyFilters) => void
  config: Partial<TopologyConfig>
  onConfigChange: (config: Partial<TopologyConfig>) => void
  nodeCount: number
  edgeCount: number
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function TopologyControls({
  filters,
  onFiltersChange,
  config,
  onConfigChange,
  nodeCount,
  edgeCount,
  className,
}: TopologyControlsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Local state for text inputs to prevent focus loss on every keystroke
  const [subnetInput, setSubnetInput] = useState(filters.subnet ?? '')
  const [minPortsInput, setMinPortsInput] = useState(filters.minPorts?.toString() ?? '')

  // Fetch OS families from database for dropdown
  const { data: osFamilyCounts } = useOsFamilyCounts(10)

  // Sync local state when external filters change
  useEffect(() => {
    setSubnetInput(filters.subnet ?? '')
  }, [filters.subnet])

  useEffect(() => {
    setMinPortsInput(filters.minPorts?.toString() ?? '')
  }, [filters.minPorts])

  const updateFilter = useCallback(<K extends keyof TopologyFilters>(
    key: K,
    value: TopologyFilters[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value })
  }, [filters, onFiltersChange])

  const updateConfig = useCallback(<K extends keyof TopologyConfig>(
    key: K,
    value: TopologyConfig[K]
  ) => {
    onConfigChange({ ...config, [key]: value })
  }, [config, onConfigChange])

  // Apply subnet filter on blur or Enter
  const applySubnetFilter = useCallback(() => {
    const value = subnetInput.trim()
    updateFilter('subnet', value || undefined)
  }, [subnetInput, updateFilter])

  // Apply min ports filter on blur or Enter
  const applyMinPortsFilter = useCallback(() => {
    const value = minPortsInput.trim()
    updateFilter('minPorts', value ? parseInt(value) : undefined)
  }, [minPortsInput, updateFilter])

  const handleSubnetKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      applySubnetFilter()
    }
  }, [applySubnetFilter])

  const handleMinPortsKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      applyMinPortsFilter()
    }
  }, [applyMinPortsFilter])

  return (
    <div className={cn('flex flex-col gap-4 p-4 bg-card border rounded-lg', className)}>
      {/* Stats Row */}
      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          <span className="font-medium text-foreground">{nodeCount}</span> nodes,{' '}
          <span className="font-medium text-foreground">{edgeCount}</span> edges
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced
        </Button>
      </div>

      {/* Primary Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Min Ports Filter */}
        <div className="space-y-1.5">
          <label htmlFor="minPorts" className="text-xs text-muted-foreground">
            Min Responses
          </label>
          <Input
            id="minPorts"
            type="number"
            min={0}
            placeholder="0"
            value={minPortsInput}
            onChange={e => setMinPortsInput(e.target.value)}
            onBlur={applyMinPortsFilter}
            onKeyDown={handleMinPortsKeyDown}
            className="h-8"
          />
        </div>

        {/* Subnet Filter */}
        <div className="space-y-1.5">
          <label htmlFor="subnet" className="text-xs text-muted-foreground">
            Subnet Filter
          </label>
          <Input
            id="subnet"
            placeholder="e.g., 192.168 or 10.0.0.0/8"
            value={subnetInput}
            onChange={e => setSubnetInput(e.target.value)}
            onBlur={applySubnetFilter}
            onKeyDown={handleSubnetKeyDown}
            className="h-8"
          />
        </div>

        {/* OS Family Filter - Dynamic from database */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">OS Family</label>
          <Select
            value={filters.osFamily?.[0] ?? 'all'}
            onValueChange={(v: string) => updateFilter('osFamily', v === 'all' ? undefined : [v])}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="All OS" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All OS</SelectItem>
              {osFamilyCounts?.map(({ os_family, count }) => (
                <SelectItem key={os_family} value={os_family}>
                  {os_family} ({count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Time Filter */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Time Range</label>
          <TimeRangeSelect
            value={filters.since}
            onChange={(v: number | undefined) => updateFilter('since', v)}
          />
        </div>
      </div>

      {/* Advanced Controls */}
      {showAdvanced && (
        <div className="pt-4 border-t space-y-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Visualization Settings
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Show Labels Toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="showLabels"
                checked={config.showLabels ?? true}
                onChange={e => updateConfig('showLabels', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="showLabels" className="text-xs">
                Show Labels
              </label>
            </div>

            {/* Show Edges Toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="showEdges"
                checked={config.showEdges ?? true}
                onChange={e => updateConfig('showEdges', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="showEdges" className="text-xs">
                Show Edges
              </label>
            </div>

            {/* Charge Strength */}
            <div className="space-y-1.5">
              <label htmlFor="chargeStrength" className="text-xs text-muted-foreground">
                Repulsion ({config.chargeStrength ?? -100})
              </label>
              <Input
                id="chargeStrength"
                type="number"
                min={-500}
                max={0}
                step={10}
                value={config.chargeStrength ?? -100}
                onChange={e => updateConfig('chargeStrength', parseInt(e.target.value) || -100)}
                className="h-8"
              />
            </div>

            {/* Link Distance */}
            <div className="space-y-1.5">
              <label htmlFor="linkDistance" className="text-xs text-muted-foreground">
                Link Distance ({config.linkDistance ?? 80}px)
              </label>
              <Input
                id="linkDistance"
                type="number"
                min={20}
                max={200}
                step={10}
                value={config.linkDistance ?? 80}
                onChange={e => updateConfig('linkDistance', parseInt(e.target.value) || 80)}
                className="h-8"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Time Range Select
// =============================================================================

interface TimeRangeSelectProps {
  value: number | undefined
  onChange: (value: number | undefined) => void
}

function TimeRangeSelect({ value, onChange }: TimeRangeSelectProps) {
  // Capture initial timestamp - useState initializer runs only once on mount
  const [mountTime] = useState(() => Math.floor(Date.now() / 1000))

  const getTimestamp = useCallback((opt: string): number | undefined => {
    // Use fresh timestamp when user selects an option
    const currentTime = Math.floor(Date.now() / 1000)
    switch (opt) {
      case '1h': return currentTime - 3600
      case '24h': return currentTime - 86400
      case '7d': return currentTime - 604800
      case '30d': return currentTime - 2592000
      default: return undefined
    }
  }, [])

  const getCurrentValue = useMemo((): string => {
    if (!value) return 'all'
    const diff = mountTime - value
    if (diff <= 3600) return '1h'
    if (diff <= 86400) return '24h'
    if (diff <= 604800) return '7d'
    if (diff <= 2592000) return '30d'
    return 'all'
  }, [value, mountTime])

  return (
    <Select value={getCurrentValue} onValueChange={(v: string) => onChange(getTimestamp(v))}>
      <SelectTrigger className="h-8">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Time</SelectItem>
        <SelectItem value="1h">Last Hour</SelectItem>
        <SelectItem value="24h">Last 24 Hours</SelectItem>
        <SelectItem value="7d">Last 7 Days</SelectItem>
        <SelectItem value="30d">Last 30 Days</SelectItem>
      </SelectContent>
    </Select>
  )
}

export default TopologyControls
