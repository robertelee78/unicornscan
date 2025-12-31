/**
 * Host detail page - thin wrapper over hosts feature module
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useParams } from 'react-router-dom'
import { useHost } from '@/hooks'
import {
  HostDetailHeader,
  PortHistory,
  AssociatedScans,
  useHostPortHistory,
  useHostScans,
} from '@/features/hosts'

export function HostDetail() {
  const { id } = useParams<{ id: string }>()
  const hostId = parseInt(id || '0', 10)

  // Fetch host data
  const { data: host, isLoading: hostLoading, error: hostError } = useHost(hostId)

  // Fetch port history and associated scans using the host's IP
  const { data: portHistory = [], isLoading: portHistoryLoading } = useHostPortHistory(
    host?.ip_addr || ''
  )
  const { data: hostScans = [], isLoading: scansLoading } = useHostScans(
    host?.ip_addr || ''
  )

  // Loading state
  if (hostLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded-lg" />
      </div>
    )
  }

  // Error state
  if (hostError) {
    return (
      <div className="text-error p-4">
        Error loading host: {hostError.message}
      </div>
    )
  }

  // Not found
  if (!host) {
    return (
      <div className="text-muted p-4 text-center">
        <h2 className="text-lg font-medium">Host Not Found</h2>
        <p className="mt-1">The requested host could not be found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with metadata */}
      <HostDetailHeader
        host={host}
        portHistoryCount={portHistory.length}
        scanCount={hostScans.length}
      />

      {/* Port History */}
      <PortHistory
        entries={portHistory}
        isLoading={portHistoryLoading}
      />

      {/* Associated Scans */}
      <AssociatedScans
        scans={hostScans}
        isLoading={scansLoading}
      />
    </div>
  )
}
