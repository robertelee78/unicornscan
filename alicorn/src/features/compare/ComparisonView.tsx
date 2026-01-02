/**
 * Main comparison view component
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useCallback } from 'react'
import { Download, Share2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScanSelector } from './ScanSelector'
import { ComparisonSummary } from './ComparisonSummary'
import { HostDiffTable } from './HostDiffTable'
import {
  useScanOptions,
  useScanComparison,
  useCompareUrlState,
} from './hooks'
import { buildCompareUrl } from './compare-utils'
import {
  exportComparisonToCSV,
  exportComparisonToJSON,
} from './export-utils'

interface ComparisonViewProps {
  onViewMatrix: () => void
}

export function ComparisonView({ onViewMatrix }: ComparisonViewProps) {
  const { scanA, scanB, setScanA, setScanB, setScans, clearScans } = useCompareUrlState()
  const { data: scanOptions = [], isLoading: optionsLoading } = useScanOptions()
  const { data: comparison, isLoading: comparisonLoading, error } = useScanComparison(scanA, scanB)

  const handleSwap = useCallback(() => {
    if (scanA && scanB) {
      setScans(scanB, scanA)
    }
  }, [scanA, scanB, setScans])

  const handleShare = useCallback(() => {
    if (scanA && scanB) {
      const url = `${window.location.origin}${buildCompareUrl(scanA, scanB)}`
      navigator.clipboard.writeText(url)
      // Could show a toast notification here
    }
  }, [scanA, scanB])

  const handleExportCSV = useCallback(() => {
    if (comparison) {
      const csv = exportComparisonToCSV(comparison)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `comparison-${comparison.scanA.scan_id}-vs-${comparison.scanB.scan_id}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [comparison])

  const handleExportJSON = useCallback(() => {
    if (comparison) {
      const json = exportComparisonToJSON(comparison)
      const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `comparison-${comparison.scanA.scan_id}-vs-${comparison.scanB.scan_id}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [comparison])

  return (
    <div className="space-y-6">
      {/* Back to matrix */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onViewMatrix} className="h-8 px-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Activity Matrix
        </Button>

        {comparison && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-1" />
              Share
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-1" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportJSON}>
              <Download className="h-4 w-4 mr-1" />
              JSON
            </Button>
          </div>
        )}
      </div>

      {/* Scan selector */}
      <ScanSelector
        scanOptions={scanOptions}
        isLoading={optionsLoading}
        selectedA={scanA}
        selectedB={scanB}
        onSelectA={setScanA}
        onSelectB={setScanB}
        onSwap={handleSwap}
        onClear={clearScans}
      />

      {/* Loading state */}
      {comparisonLoading && scanA && scanB && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-3 text-muted">Comparing scans...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="text-error p-4 bg-error/10 rounded-lg">
          Error loading comparison: {error.message}
        </div>
      )}

      {/* Comparison results */}
      {comparison && (
        <>
          <ComparisonSummary result={comparison} />
          <HostDiffTable hostDiffs={comparison.hostDiffs} />
        </>
      )}

      {/* No selection state */}
      {!scanA && !scanB && !comparisonLoading && (
        <div className="text-center py-12 text-muted">
          <p>Select two scans above to compare their results</p>
          <p className="text-sm mt-1">Or use the Activity Matrix for multi-scan visualization</p>
        </div>
      )}
    </div>
  )
}
