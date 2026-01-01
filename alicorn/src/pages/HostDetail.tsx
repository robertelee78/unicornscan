/**
 * Host detail page - thin wrapper over hosts feature module
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useHost } from '@/hooks'
import {
  HostDetailHeader,
  PortHistory,
  AssociatedScans,
  useHostPortHistory,
  useHostScans,
  useHostReports,
} from '@/features/hosts'
import { NotesTab, useEntityNotes } from '@/features/scans'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  PortTrendChart,
  PortTimeline,
  useHostPortTrend,
  usePortTimeline,
} from '@/features/charts'
import { HostTimeline } from '@/features/timeline'
import {
  ExportDialog,
  useHostExport,
  useExportDialog,
  quickExportHost,
  type ExportFormat,
} from '@/features/export'
import { ErrorFallback } from '@/components/error'
import type { TimeRange } from '@/features/dashboard/types'

export function HostDetail() {
  const { id } = useParams<{ id: string }>()
  const hostId = parseInt(id || '0', 10)
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [notesExpanded, setNotesExpanded] = useState(false)

  // Fetch host data
  const { data: host, isLoading: hostLoading, error: hostError } = useHost(hostId)

  // Fetch port history and associated scans using the host's IP
  const { data: portHistory = [], isLoading: portHistoryLoading } = useHostPortHistory(
    host?.ip_addr || ''
  )
  const { data: hostScans = [], isLoading: scansLoading } = useHostScans(
    host?.ip_addr || ''
  )

  // Fetch reports for export
  const { data: hostReports = [] } = useHostReports(host?.ip_addr || '')

  // Fetch notes for the host
  const { data: notes = [], isLoading: notesLoading } = useEntityNotes('host', hostId)

  // Fetch chart data
  const { data: portTrend, isLoading: trendLoading } = useHostPortTrend(
    host?.ip_addr || '',
    timeRange
  )
  const { data: portTimeline, isLoading: timelineLoading } = usePortTimeline(
    host?.ip_addr || ''
  )

  // Export functionality
  const exportDialog = useExportDialog()
  const scanHistory = useMemo(() =>
    hostScans.map((s) => ({
      scansId: s.scansId,
      scanTime: s.scanTime,
      portsFound: s.portsFound,
    })),
    [hostScans]
  )
  const { exportHost, isExporting } = useHostExport(host ?? null, hostReports, scanHistory)

  // Quick export handler
  const handleQuickExport = useCallback((format: ExportFormat) => {
    if (host) {
      quickExportHost(host, hostReports, format)
    }
  }, [host, hostReports])

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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Host Details</h1>
          <p className="text-muted mt-1">Host #{hostId}</p>
        </div>
        <ErrorFallback
          error={hostError}
          resetError={() => window.location.reload()}
          showHomeButton
        />
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
        onQuickExport={handleQuickExport}
        onAdvancedExport={exportDialog.openDialog}
      />

      {/* Export Dialog */}
      <ExportDialog
        open={exportDialog.isOpen}
        onOpenChange={(open) => !open && exportDialog.closeDialog()}
        context="host-detail"
        onExport={(options) => {
          exportHost(options)
          exportDialog.closeDialog()
        }}
        isExporting={isExporting}
      />

      {/* Time Range Selector for Charts */}
      <div className="flex items-center gap-4">
        <label htmlFor="timeRange" className="text-sm text-muted-foreground">
          Chart Time Range:
        </label>
        <select
          id="timeRange"
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as TimeRange)}
          className="h-8 rounded border border-input bg-background px-3 text-sm"
        >
          <option value="all">All Time</option>
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </select>
      </div>

      {/* Port Trend Chart */}
      <PortTrendChart
        data={portTrend}
        isLoading={trendLoading}
        title={`Port Trend for ${host.hostname || host.ip_addr}`}
        config={{
          showTotal: true,
          showTcp: true,
          showUdp: true,
          chartType: 'area',
        }}
      />

      {/* Port Timeline (simple lifespan view) */}
      <PortTimeline
        data={portTimeline}
        isLoading={timelineLoading}
        title="Port Observation Timeline"
        maxPorts={25}
      />

      {/* Enhanced Host Timeline (with change detection, zoom, filtering, export) */}
      <HostTimeline
        hostIp={host.ip_addr ?? host.host_addr}
        title="Port Activity Timeline (Enhanced)"
        maxPorts={30}
        height={500}
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

      {/* Notes Section */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Notes
              {notes.length > 0 && (
                <span className="text-xs text-muted font-normal">
                  ({notes.length})
                </span>
              )}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setNotesExpanded(!notesExpanded)}
              className="h-8 px-2"
            >
              {notesExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        {notesExpanded && (
          <CardContent>
            <NotesTab
              entityType="host"
              entityId={hostId}
              scanNotes={null}
              notes={notes}
              isLoading={notesLoading}
            />
          </CardContent>
        )}
      </Card>
    </div>
  )
}
