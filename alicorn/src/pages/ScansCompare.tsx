/**
 * Scan Comparison page - hosts the comparison dashboard
 * Parses ?ids=1,2,3 query parameter to get selected scan IDs
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, GitCompare, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Parse and validate scan IDs from URL query parameter
 * Returns array of valid numeric IDs, or empty array if invalid
 */
function parseIdsParam(idsParam: string | null): number[] {
  if (!idsParam) return []

  const ids = idsParam
    .split(',')
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !isNaN(id) && id > 0)

  // Return unique IDs only
  return [...new Set(ids)]
}

/**
 * Scan Comparison page component
 *
 * URL format: /scans/compare?ids=1,2,3
 *
 * Validates that:
 * - At least 2 scan IDs are provided
 * - All IDs are valid positive integers
 *
 * Will host the ComparisonDashboard component (Task 12)
 */
export function ScansCompare() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // Parse scan IDs from URL
  const scanIds = useMemo(() => {
    return parseIdsParam(searchParams.get('ids'))
  }, [searchParams])

  // Validate we have enough scans to compare
  const hasEnoughScans = scanIds.length >= 2

  // Handle invalid state - not enough scans
  if (!hasEnoughScans) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/scans')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Scans
          </Button>
        </div>

        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center gap-4">
              <div className="rounded-full bg-warning/10 p-4">
                <AlertTriangle className="h-8 w-8 text-warning" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Not Enough Scans Selected</h2>
                <p className="text-muted-foreground max-w-md">
                  You need to select at least 2 scans to compare.
                  Go to the{' '}
                  <Link to="/scans" className="text-primary hover:underline">
                    Scans page
                  </Link>
                  {' '}and select the scans you want to compare using the checkboxes.
                </p>
              </div>
              <Button onClick={() => navigate('/scans')} className="mt-4">
                Go to Scans
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/scans')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Scans
          </Button>
          <div className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Compare Scans</h1>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          Comparing {scanIds.length} scan{scanIds.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Placeholder for ComparisonDashboard component (Task 12) */}
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center text-center gap-4">
            <div className="rounded-full bg-primary/10 p-4">
              <GitCompare className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Comparison Dashboard</h2>
              <p className="text-muted-foreground max-w-md">
                Comparing scans: {scanIds.join(', ')}
              </p>
              <p className="text-sm text-muted-foreground">
                ComparisonDashboard component will be implemented in Task 12
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
