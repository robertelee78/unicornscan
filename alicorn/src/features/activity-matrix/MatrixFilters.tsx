/**
 * Matrix filter controls component
 * Provides UI for filtering the activity matrix
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { TIME_RANGE_OPTIONS } from '@/features/dashboard/types'
import type { MatrixFilters, BaselineMode, ViewMode } from './types'
import { VIEW_MODE_OPTIONS } from './types'
import { useBaselineScanOptions } from './hooks'

// =============================================================================
// Props
// =============================================================================

interface MatrixFiltersProps {
  filters: MatrixFilters
  onFilterChange: <K extends keyof MatrixFilters>(key: K, value: MatrixFilters[K]) => void
  onReset: () => void
  scanCount?: number
  hostCount?: number
}

// =============================================================================
// Component
// =============================================================================

export function MatrixFiltersPanel({
  filters,
  onFilterChange,
  onReset,
  scanCount = 0,
  hostCount = 0,
}: MatrixFiltersProps) {
  const [portRangeMin, setPortRangeMin] = useState(
    filters.portRange?.min?.toString() ?? ''
  )
  const [portRangeMax, setPortRangeMax] = useState(
    filters.portRange?.max?.toString() ?? ''
  )

  const { options: baselineOptions, isLoading: isLoadingBaselines } = useBaselineScanOptions(
    filters.timeRange
  )

  const handlePortRangeApply = () => {
    const min = parseInt(portRangeMin, 10)
    const max = parseInt(portRangeMax, 10)

    if (!isNaN(min) && !isNaN(max) && min >= 0 && max <= 65535 && min <= max) {
      onFilterChange('portRange', { min, max })
    } else if (portRangeMin === '' && portRangeMax === '') {
      onFilterChange('portRange', null)
    }
  }

  const handleProtocolToggle = (protocol: 'tcp' | 'udp') => {
    const current = filters.protocols
    if (current.includes(protocol)) {
      // Don't allow removing last protocol
      if (current.length > 1) {
        onFilterChange('protocols', current.filter((p) => p !== protocol))
      }
    } else {
      onFilterChange('protocols', [...current, protocol])
    }
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Time Range */}
          <div className="space-y-2">
            <Label htmlFor="timeRange" className="text-xs font-medium">
              Time Range
            </Label>
            <Select
              value={filters.timeRange}
              onValueChange={(value) => onFilterChange('timeRange', value as MatrixFilters['timeRange'])}
            >
              <SelectTrigger id="timeRange" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* View Mode */}
          <div className="space-y-2">
            <Label htmlFor="viewMode" className="text-xs font-medium">
              View Mode
            </Label>
            <Select
              value={filters.viewMode}
              onValueChange={(value) => onFilterChange('viewMode', value as ViewMode)}
            >
              <SelectTrigger id="viewMode" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIEW_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col">
                      <span>{option.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Baseline Mode */}
          <div className="space-y-2">
            <Label htmlFor="baselineMode" className="text-xs font-medium">
              Baseline Selection
            </Label>
            <Select
              value={filters.baselineMode}
              onValueChange={(value) => onFilterChange('baselineMode', value as BaselineMode)}
            >
              <SelectTrigger id="baselineMode" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="first">First Scan in Range</SelectItem>
                <SelectItem value="previous">Previous Scan (Rolling)</SelectItem>
                <SelectItem value="specific">Select Specific Scan</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Specific Baseline Selector */}
          {filters.baselineMode === 'specific' && (
            <div className="space-y-2">
              <Label htmlFor="baselineScan" className="text-xs font-medium">
                Baseline Scan
              </Label>
              <Select
                value={filters.baselineScansId?.toString() ?? ''}
                onValueChange={(value) =>
                  onFilterChange('baselineScansId', value ? parseInt(value, 10) : null)
                }
                disabled={isLoadingBaselines}
              >
                <SelectTrigger id="baselineScan" className="h-9">
                  <SelectValue placeholder="Select baseline..." />
                </SelectTrigger>
                <SelectContent>
                  {baselineOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      <span className="text-xs">{option.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Subnet Filter */}
          <div className="space-y-2">
            <Label htmlFor="subnet" className="text-xs font-medium">
              Subnet Filter
            </Label>
            <Input
              id="subnet"
              placeholder="e.g., 192.168.1.0/24"
              className="h-9"
              value={filters.subnet ?? ''}
              onChange={(e) =>
                onFilterChange('subnet', e.target.value || null)
              }
            />
          </div>

          {/* Port Range */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Port Range</Label>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="Min"
                className="h-9 w-20"
                type="number"
                min={0}
                max={65535}
                value={portRangeMin}
                onChange={(e) => setPortRangeMin(e.target.value)}
                onBlur={handlePortRangeApply}
              />
              <span className="text-muted-foreground">-</span>
              <Input
                placeholder="Max"
                className="h-9 w-20"
                type="number"
                min={0}
                max={65535}
                value={portRangeMax}
                onChange={(e) => setPortRangeMax(e.target.value)}
                onBlur={handlePortRangeApply}
              />
            </div>
          </div>

          {/* Protocol Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Protocols</Label>
            <div className="flex gap-2">
              <Button
                variant={filters.protocols.includes('tcp') ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleProtocolToggle('tcp')}
                className="h-9"
              >
                TCP
              </Button>
              <Button
                variant={filters.protocols.includes('udp') ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleProtocolToggle('udp')}
                className="h-9"
              >
                UDP
              </Button>
            </div>
          </div>

          {/* Reset & Summary */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Actions</Label>
            <div className="flex gap-2 items-center">
              <Button variant="outline" size="sm" onClick={onReset} className="h-9">
                Reset Filters
              </Button>
            </div>
          </div>
        </div>

        {/* Summary Badges */}
        <div className="flex gap-2 mt-4 pt-3 border-t border-border">
          <Badge variant="secondary">
            {scanCount} scan{scanCount !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="secondary">
            {hostCount} host{hostCount !== 1 ? 's' : ''}
          </Badge>
          {filters.subnet && (
            <Badge variant="outline">
              Subnet: {filters.subnet}
            </Badge>
          )}
          {filters.portRange && (
            <Badge variant="outline">
              Ports: {filters.portRange.min}-{filters.portRange.max}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
