/**
 * Timeline export dialog
 * Configure and trigger timeline data exports
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type {
  HostTimelineData,
  TimelineExportFormat,
  TimelineExportOptions,
} from './types'
import { exportTimeline } from './export-utils'

// =============================================================================
// Props
// =============================================================================

interface TimelineExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: HostTimelineData
  visibleRange?: { start: number; end: number }
}

// =============================================================================
// Component
// =============================================================================

export function TimelineExportDialog({
  open,
  onOpenChange,
  data,
  visibleRange,
}: TimelineExportDialogProps) {
  const [format, setFormat] = useState<TimelineExportFormat>('json')
  const [visibleOnly, setVisibleOnly] = useState(false)
  const [includeChanges, setIncludeChanges] = useState(true)
  const [includeObservations, setIncludeObservations] = useState(false)
  const [imageWidth, setImageWidth] = useState('1200')

  const handleExport = useCallback(() => {
    const options: TimelineExportOptions = {
      format,
      visibleOnly,
      includeChanges,
      includeObservations,
      imageWidth: parseInt(imageWidth, 10) || 1200,
    }

    exportTimeline(data, options, visibleOnly ? visibleRange : undefined)
    onOpenChange(false)
  }, [data, format, visibleOnly, includeChanges, includeObservations, imageWidth, visibleRange, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Timeline</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Format selection */}
          <div className="space-y-3">
            <Label>Export Format</Label>
            <RadioGroup
              value={format}
              onValueChange={(v: string) => setFormat(v as TimelineExportFormat)}
              className="grid grid-cols-2 gap-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="json" id="json" />
                <Label htmlFor="json" className="cursor-pointer">
                  JSON
                  <span className="block text-xs text-muted-foreground">
                    Structured data export
                  </span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="csv" id="csv" />
                <Label htmlFor="csv" className="cursor-pointer">
                  CSV
                  <span className="block text-xs text-muted-foreground">
                    Spreadsheet compatible
                  </span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="svg" id="svg" />
                <Label htmlFor="svg" className="cursor-pointer">
                  SVG
                  <span className="block text-xs text-muted-foreground">
                    Vector image
                  </span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="png" id="png" />
                <Label htmlFor="png" className="cursor-pointer">
                  PNG
                  <span className="block text-xs text-muted-foreground">
                    Raster image
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Range options */}
          {visibleRange && (
            <div className="flex items-start space-x-2">
              <Checkbox
                id="visible-only"
                checked={visibleOnly}
                onCheckedChange={(checked) => setVisibleOnly(!!checked)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="visible-only" className="cursor-pointer">
                  Export visible range only
                </Label>
                <p className="text-xs text-muted-foreground">
                  Only include data within the current zoom window
                </p>
              </div>
            </div>
          )}

          {/* Data options (for JSON/CSV) */}
          {(format === 'json' || format === 'csv') && (
            <div className="space-y-3">
              <Label>Include Data</Label>
              <div className="space-y-2">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="include-changes"
                    checked={includeChanges}
                    onCheckedChange={(checked) => setIncludeChanges(!!checked)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="include-changes" className="cursor-pointer">
                      Change events
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {data.allChanges.length} events
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="include-observations"
                    checked={includeObservations}
                    onCheckedChange={(checked) => setIncludeObservations(!!checked)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="include-observations" className="cursor-pointer">
                      Raw observations
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      All port observations (larger file)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Image options */}
          {(format === 'svg' || format === 'png') && (
            <div className="space-y-2">
              <Label htmlFor="image-width">Image Width (pixels)</Label>
              <Input
                id="image-width"
                type="number"
                value={imageWidth}
                onChange={(e) => setImageWidth(e.target.value)}
                min={400}
                max={4000}
                step={100}
                className="w-32"
              />
            </div>
          )}

          {/* Summary */}
          <div className="text-xs text-muted-foreground border-t pt-4">
            <p>Exporting timeline for <strong>{data.hostIp}</strong></p>
            <p>{data.tracks.length} ports, {data.allChanges.length} changes</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport}>
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default TimelineExportDialog
