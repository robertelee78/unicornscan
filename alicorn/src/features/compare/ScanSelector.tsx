/**
 * Scan selector for comparison
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo } from 'react'
import { ArrowRightLeft, X, GitCompare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatTimestamp } from '@/lib/utils'
import type { ScanOption } from './types'

interface ScanSelectorProps {
  scanOptions: ScanOption[]
  isLoading: boolean
  selectedA?: number
  selectedB?: number
  onSelectA: (id: number | undefined) => void
  onSelectB: (id: number | undefined) => void
  onSwap: () => void
  onClear: () => void
}

export function ScanSelector({
  scanOptions,
  isLoading,
  selectedA,
  selectedB,
  onSelectA,
  onSelectB,
  onSwap,
  onClear,
}: ScanSelectorProps) {
  // Group scans by date for easier selection
  const groupedScans = useMemo(() => {
    const groups = new Map<string, ScanOption[]>()
    for (const scan of scanOptions) {
      const date = new Date(scan.time * 1000).toLocaleDateString()
      if (!groups.has(date)) {
        groups.set(date, [])
      }
      groups.get(date)!.push(scan)
    }
    return groups
  }, [scanOptions])

  const scanA = scanOptions.find((s) => s.scan_id === selectedA)
  const scanB = scanOptions.find((s) => s.scan_id === selectedB)

  const canCompare = selectedA && selectedB && selectedA !== selectedB

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            Select Scans to Compare
          </CardTitle>
          {(selectedA || selectedB) && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-start">
          {/* Scan A Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Base Scan (A)
            </label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={selectedA ?? ''}
              onChange={(e) => onSelectA(e.target.value ? parseInt(e.target.value, 10) : undefined)}
              disabled={isLoading}
            >
              <option value="">Select a scan...</option>
              {[...groupedScans.entries()].map(([date, scans]) => (
                <optgroup key={date} label={date}>
                  {scans.map((scan) => (
                    <option
                      key={scan.scan_id}
                      value={scan.scan_id}
                      disabled={scan.scan_id === selectedB}
                    >
                      #{scan.scan_id} - {scan.target_str}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {scanA && (
              <div className="text-xs text-muted p-2 bg-muted/30 rounded">
                <p><span className="font-medium">Target:</span> {scanA.target_str}</p>
                <p><span className="font-medium">Time:</span> {formatTimestamp(scanA.time)}</p>
              </div>
            )}
          </div>

          {/* Swap button */}
          <div className="flex items-center justify-center lg:pt-8">
            <Button
              variant="outline"
              size="icon"
              onClick={onSwap}
              disabled={!selectedA || !selectedB}
              title="Swap scans"
            >
              <ArrowRightLeft className="h-4 w-4" />
            </Button>
          </div>

          {/* Scan B Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Compare To (B)
            </label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={selectedB ?? ''}
              onChange={(e) => onSelectB(e.target.value ? parseInt(e.target.value, 10) : undefined)}
              disabled={isLoading}
            >
              <option value="">Select a scan...</option>
              {[...groupedScans.entries()].map(([date, scans]) => (
                <optgroup key={date} label={date}>
                  {scans.map((scan) => (
                    <option
                      key={scan.scan_id}
                      value={scan.scan_id}
                      disabled={scan.scan_id === selectedA}
                    >
                      #{scan.scan_id} - {scan.target_str}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {scanB && (
              <div className="text-xs text-muted p-2 bg-muted/30 rounded">
                <p><span className="font-medium">Target:</span> {scanB.target_str}</p>
                <p><span className="font-medium">Time:</span> {formatTimestamp(scanB.time)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Comparison status */}
        {canCompare && (
          <div className="mt-4 text-sm text-center text-muted">
            Comparing Scan #{selectedA} → Scan #{selectedB}
          </div>
        )}
        {selectedA && selectedB && selectedA === selectedB && (
          <div className="mt-4 text-sm text-center text-warning">
            Please select two different scans to compare
          </div>
        )}
      </CardContent>
    </Card>
  )
}
