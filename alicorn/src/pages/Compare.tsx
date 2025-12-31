/**
 * Compare scans page
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function Compare() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Compare Scans</h1>
        <p className="text-muted mt-1">Compare results between two scans</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Scan Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted text-sm">
            Select two scans to compare and see differences in discovered hosts and ports.
          </p>
          <p className="text-muted text-sm mt-4">
            This feature will be implemented in Phase 4.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
