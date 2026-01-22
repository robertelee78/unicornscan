/**
 * Export dialog component
 * Full-featured export dialog with format, content, and metadata options
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback } from 'react'
import { FileText, Table, Braces, Download, Settings2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import type {
  ExportFormat,
  MetadataDepth,
  FileOutputMode,
  ExportOptions,
  ExportContext,
} from './types'
import {
  EXPORT_FORMATS,
  METADATA_DEPTHS,
  FILE_OUTPUT_OPTIONS,
  DEFAULT_EXPORT_OPTIONS,
} from './types'

// =============================================================================
// Props
// =============================================================================

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  context: ExportContext
  onExport: (options: ExportOptions) => void
  isExporting?: boolean
  selectedCount?: number
  filteredCount?: number
  totalCount?: number
}

// =============================================================================
// Component
// =============================================================================

export function ExportDialog({
  open,
  onOpenChange,
  context,
  onExport,
  isExporting = false,
  selectedCount = 0,
  filteredCount,
  totalCount,
}: ExportDialogProps) {
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS)

  // Determine what content options are available based on context
  const isScanContext = context === 'scan-detail' || context === 'scan-list'
  const isBulkContext = context === 'scan-list' || context === 'host-list'
  const showFileOutputOption = isBulkContext && selectedCount > 1

  // Handle option changes
  const updateOption = useCallback(<K extends keyof ExportOptions>(
    key: K,
    value: ExportOptions[K]
  ) => {
    setOptions((prev) => ({ ...prev, [key]: value }))
  }, [])

  // Handle export
  const handleExport = useCallback(() => {
    onExport(options)
  }, [options, onExport])

  // Get title based on context
  const getTitle = () => {
    switch (context) {
      case 'scan-detail': return 'Export Scan'
      case 'scan-list': return 'Export Scans'
      case 'host-detail': return 'Export Host'
      case 'host-list': return 'Export Hosts'
      case 'compare': return 'Export Comparison'
      default: return 'Export'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {getTitle()}
          </DialogTitle>
          <DialogDescription>
            Choose format, content, and metadata depth for your export
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Export Format Selection */}
          <FormatSection
            selected={options.format}
            onSelect={(format) => updateOption('format', format)}
          />

          {/* File Output Mode (for bulk exports) */}
          {showFileOutputOption && (
            <FileOutputSection
              selected={options.fileOutput}
              onSelect={(mode) => updateOption('fileOutput', mode)}
              selectedCount={selectedCount}
            />
          )}

          {/* Metadata Depth */}
          <MetadataSection
            selected={options.metadataDepth}
            onSelect={(depth) => updateOption('metadataDepth', depth)}
          />

          {/* Content Options */}
          <ContentSection
            options={options}
            onToggle={(key) => updateOption(key, !options[key])}
            isScanContext={isScanContext}
          />

          {/* PDF-specific Options */}
          {options.format === 'pdf' && (
            <PDFOptionsSection
              options={options}
              onToggle={(key) => updateOption(key, !options[key])}
              onOrientationChange={(orientation) => updateOption('pageOrientation', orientation)}
            />
          )}

          {/* Export Summary */}
          <ExportSummary
            options={options}
            selectedCount={selectedCount}
            filteredCount={filteredCount}
            totalCount={totalCount}
            isBulkContext={isBulkContext}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Section Components
// =============================================================================

interface FormatSectionProps {
  selected: ExportFormat
  onSelect: (format: ExportFormat) => void
}

function FormatSection({ selected, onSelect }: FormatSectionProps) {
  const getIcon = (format: ExportFormat) => {
    switch (format) {
      case 'csv': return <Table className="h-5 w-5" />
      case 'json': return <Braces className="h-5 w-5" />
      case 'pdf': return <FileText className="h-5 w-5" />
    }
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Export Format</Label>
      <div className="grid grid-cols-3 gap-3">
        {EXPORT_FORMATS.map((format) => (
          <Card
            key={format.id}
            className={`cursor-pointer transition-all hover:border-primary ${
              selected === format.id ? 'border-primary bg-primary/5' : ''
            }`}
            onClick={() => onSelect(format.id)}
          >
            <CardContent className="pt-4 pb-3 px-3">
              <div className="flex items-center gap-2 mb-1">
                {getIcon(format.id)}
                <span className="font-medium">{format.label}</span>
                {selected === format.id && (
                  <Badge variant="secondary" className="ml-auto text-xs">
                    Selected
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{format.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

interface FileOutputSectionProps {
  selected: FileOutputMode
  onSelect: (mode: FileOutputMode) => void
  selectedCount: number
}

function FileOutputSection({ selected, onSelect, selectedCount }: FileOutputSectionProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">
        File Output ({selectedCount} items selected)
      </Label>
      <div className="grid grid-cols-2 gap-3">
        {FILE_OUTPUT_OPTIONS.map((option) => (
          <Card
            key={option.id}
            className={`cursor-pointer transition-all hover:border-primary ${
              selected === option.id ? 'border-primary bg-primary/5' : ''
            }`}
            onClick={() => onSelect(option.id)}
          >
            <CardContent className="pt-3 pb-2 px-3">
              <div className="font-medium text-sm">{option.label}</div>
              <p className="text-xs text-muted-foreground">{option.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

interface MetadataSectionProps {
  selected: MetadataDepth
  onSelect: (depth: MetadataDepth) => void
}

function MetadataSection({ selected, onSelect }: MetadataSectionProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Metadata Depth</Label>
      <div className="grid grid-cols-3 gap-3">
        {METADATA_DEPTHS.map((depth) => (
          <Card
            key={depth.id}
            className={`cursor-pointer transition-all hover:border-primary ${
              selected === depth.id ? 'border-primary bg-primary/5' : ''
            }`}
            onClick={() => onSelect(depth.id)}
          >
            <CardContent className="pt-3 pb-2 px-3">
              <div className="font-medium text-sm">{depth.label}</div>
              <p className="text-xs text-muted-foreground">{depth.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

interface ContentSectionProps {
  options: ExportOptions
  onToggle: (key: keyof ExportOptions) => void
  isScanContext: boolean
}

function ContentSection({ options, onToggle, isScanContext }: ContentSectionProps) {
  const items: Array<{ key: keyof ExportOptions; label: string; description: string }> = [
    { key: 'includeScanMetadata', label: 'Scan Metadata', description: 'Scan configuration and timing info' },
    { key: 'includeReports', label: 'Port Results', description: 'Individual port scan results' },
    { key: 'includeHosts', label: 'Host Summary', description: 'Aggregated host information' },
    { key: 'includeServices', label: 'Services', description: 'Detected service information' },
    { key: 'includeGeoIP', label: 'GeoIP Data', description: 'Geographic location data' },
  ]

  if (isScanContext) {
    items.push({ key: 'includeArp', label: 'ARP Results', description: 'MAC address mappings' })
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Content to Include</Label>
      <div className="grid grid-cols-2 gap-2">
        {items.map(({ key, label, description }) => (
          <label
            key={key}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
              options[key] ? 'border-primary bg-primary/5' : 'border-border'
            }`}
          >
            <input
              type="checkbox"
              checked={options[key] as boolean}
              onChange={() => onToggle(key)}
              className="mt-1"
            />
            <div>
              <div className="font-medium text-sm">{label}</div>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}

interface PDFOptionsSectionProps {
  options: ExportOptions
  onToggle: (key: keyof ExportOptions) => void
  onOrientationChange: (orientation: 'portrait' | 'landscape') => void
}

function PDFOptionsSection({ options, onToggle, onOrientationChange }: PDFOptionsSectionProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium flex items-center gap-2">
        <Settings2 className="h-4 w-4" />
        PDF Options
      </Label>
      <div className="space-y-3">
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={options.includeCharts}
              onChange={() => onToggle('includeCharts')}
            />
            <span className="text-sm">Include Charts</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={options.includeSummaryStats}
              onChange={() => onToggle('includeSummaryStats')}
            />
            <span className="text-sm">Include Summary Statistics</span>
          </label>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm">Page Orientation:</span>
          <div className="flex gap-2">
            <label className={`px-3 py-1 rounded border cursor-pointer text-sm ${
              options.pageOrientation === 'portrait' ? 'border-primary bg-primary/10' : 'border-border'
            }`}>
              <input
                type="radio"
                name="orientation"
                value="portrait"
                checked={options.pageOrientation === 'portrait'}
                onChange={() => onOrientationChange('portrait')}
                className="sr-only"
              />
              Portrait
            </label>
            <label className={`px-3 py-1 rounded border cursor-pointer text-sm ${
              options.pageOrientation === 'landscape' ? 'border-primary bg-primary/10' : 'border-border'
            }`}>
              <input
                type="radio"
                name="orientation"
                value="landscape"
                checked={options.pageOrientation === 'landscape'}
                onChange={() => onOrientationChange('landscape')}
                className="sr-only"
              />
              Landscape
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ExportSummaryProps {
  options: ExportOptions
  selectedCount: number
  filteredCount?: number
  totalCount?: number
  isBulkContext: boolean
}

function ExportSummary({
  options,
  selectedCount,
  filteredCount,
  totalCount,
  isBulkContext,
}: ExportSummaryProps) {
  const enabledContent = [
    options.includeScanMetadata && 'Metadata',
    options.includeReports && 'Ports',
    options.includeHosts && 'Hosts',
    options.includeServices && 'Services',
    options.includeGeoIP && 'GeoIP',
    options.includeArp && 'ARP',
  ].filter(Boolean)

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <h4 className="font-medium text-sm mb-2">Export Summary</h4>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-muted-foreground">Format:</span>{' '}
          <span className="font-medium">{options.format.toUpperCase()}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Depth:</span>{' '}
          <span className="font-medium capitalize">{options.metadataDepth}</span>
        </div>
        {isBulkContext && selectedCount > 0 && (
          <div>
            <span className="text-muted-foreground">Items:</span>{' '}
            <span className="font-medium">{selectedCount} selected</span>
          </div>
        )}
        {isBulkContext && filteredCount !== undefined && selectedCount === 0 && (
          <div>
            <span className="text-muted-foreground">Items:</span>{' '}
            <span className="font-medium">{filteredCount} filtered</span>
            {totalCount && <span className="text-muted-foreground"> of {totalCount}</span>}
          </div>
        )}
        <div className="col-span-2">
          <span className="text-muted-foreground">Content:</span>{' '}
          <span className="font-medium">{enabledContent.join(', ') || 'None'}</span>
        </div>
        {options.format === 'pdf' && (
          <div className="col-span-2">
            <span className="text-muted-foreground">PDF:</span>{' '}
            <span className="font-medium">
              {options.pageOrientation}, {options.includeCharts ? 'with charts' : 'tables only'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default ExportDialog
