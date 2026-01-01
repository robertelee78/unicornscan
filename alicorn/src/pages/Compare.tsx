/**
 * Compare scans page - Host Activity Matrix and Scan Comparison
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { GitCompare, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HostActivityMatrix } from '@/features/activity-matrix'
import { ComparisonView, useCompareUrlState } from '@/features/compare'

export function Compare() {
  const navigate = useNavigate()
  const { viewMode, clearScans } = useCompareUrlState()

  const handleViewMatrix = useCallback(() => {
    clearScans()
  }, [clearScans])

  const handleViewComparison = useCallback(() => {
    // Navigate to comparison mode (will show selector)
    navigate('/compare?a=&b=')
  }, [navigate])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Compare Scans</h1>
          <p className="text-muted mt-1">
            {viewMode === 'comparison'
              ? 'Side-by-side comparison of two scans'
              : 'Analyze host port changes across multiple scans'
            }
          </p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'matrix' ? 'default' : 'outline'}
            size="sm"
            onClick={handleViewMatrix}
          >
            <LayoutGrid className="h-4 w-4 mr-1" />
            Activity Matrix
          </Button>
          <Button
            variant={viewMode === 'comparison' ? 'default' : 'outline'}
            size="sm"
            onClick={handleViewComparison}
          >
            <GitCompare className="h-4 w-4 mr-1" />
            Compare Two
          </Button>
        </div>
      </div>

      {viewMode === 'comparison' ? (
        <ComparisonView onViewMatrix={handleViewMatrix} />
      ) : (
        <HostActivityMatrix />
      )}
    </div>
  )
}
