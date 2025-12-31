/**
 * Compare scans page - Host Activity Matrix
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { HostActivityMatrix } from '@/features/activity-matrix'

export function Compare() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Compare Scans</h1>
        <p className="text-muted mt-1">
          Analyze host port changes across multiple scans
        </p>
      </div>

      <HostActivityMatrix />
    </div>
  )
}
