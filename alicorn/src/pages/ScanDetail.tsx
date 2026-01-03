/**
 * Scan detail page - thin wrapper over scans feature module
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useScan, useIpReports, useBanners } from '@/hooks'
import {
  ScanDetailHeader,
  Tabs,
  ResultsTab,
  HostsTab,
  ArpResults,
  RawDataTab,
  NotesTab,
  useArpReports,
  useScanNotes,
  type Tab,
} from '@/features/scans'
import {
  ExportDialog,
  useScanExport,
  useExportDialog,
  quickExportScan,
  type ExportFormat,
} from '@/features/export'
import {
  DeleteConfirmDialog,
  useScanDeletion,
  recordDeletion,
} from '@/features/deletion'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorFallback } from '@/components/error'
import { useToast } from '@/features/toast'

type TabId = 'results' | 'hosts' | 'raw' | 'notes'

export function ScanDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const scan_id = parseInt(id || '0', 10)
  const [activeTab, setActiveTab] = useState<TabId>('results')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const { success: toastSuccess, error: toastError } = useToast()

  // Fetch scan data
  const { data: scan, isLoading: scanLoading, error: scanError } = useScan(scan_id)
  const { data: reports = [], isLoading: reportsLoading } = useIpReports(scan_id)
  const { data: banners } = useBanners(scan_id)
  const { data: arpReports = [], isLoading: arpLoading } = useArpReports(scan_id)
  const { data: notes = [], isLoading: notesLoading } = useScanNotes(scan_id)

  // Export functionality
  const exportDialog = useExportDialog()
  const { exportScan, isExporting } = useScanExport(scan ?? null, reports)

  // Delete functionality
  const { mutate: deleteScan, isPending: isDeleting } = useScanDeletion({
    onSuccess: (result) => {
      if (scan) {
        recordDeletion(result, scan.target_str ?? '')
      }
      toastSuccess(
        'Scan deleted',
        `Scan #${scan_id} and all associated data have been removed.`
      )
      setDeleteDialogOpen(false)
      navigate('/scans')
    },
    onError: (error) => {
      toastError('Failed to delete scan', error.message)
    },
  })

  // Quick export handler
  const handleQuickExport = useCallback((format: ExportFormat) => {
    if (scan) {
      quickExportScan(scan, reports, format)
    }
  }, [scan, reports])

  // Delete handler
  const handleDelete = useCallback(() => {
    setDeleteDialogOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    deleteScan(scan_id)
  }, [deleteScan, scan_id])

  // Calculate host count
  const hostCount = useMemo(() => {
    return new Set(reports.map((r) => r.host_addr)).size
  }, [reports])

  // Build tabs with counts
  const tabs: Tab[] = useMemo(() => [
    { id: 'results', label: 'Results', count: reports.length },
    { id: 'hosts', label: 'Hosts', count: hostCount },
    { id: 'raw', label: 'Raw Data' },
    { id: 'notes', label: 'Notes', count: notes.length || undefined },
  ], [reports.length, hostCount, notes.length])

  // Loading state
  if (scanLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded-lg" />
      </div>
    )
  }

  // Error state
  if (scanError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Scan Details</h1>
          <p className="text-muted mt-1">Scan #{scan_id}</p>
        </div>
        <ErrorFallback
          error={scanError}
          resetError={() => window.location.reload()}
          showHomeButton
        />
      </div>
    )
  }

  // Not found
  if (!scan) {
    return (
      <div className="text-muted p-4 text-center">
        <h2 className="text-lg font-medium">Scan Not Found</h2>
        <p className="mt-1">The requested scan could not be found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with metadata */}
      <ScanDetailHeader
        scan={scan}
        reportCount={reports.length}
        hostCount={hostCount}
        onQuickExport={handleQuickExport}
        onAdvancedExport={exportDialog.openDialog}
        onDelete={handleDelete}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        scan_id={scan_id}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />

      {/* Export Dialog */}
      <ExportDialog
        open={exportDialog.isOpen}
        onOpenChange={(open) => !open && exportDialog.closeDialog()}
        context="scan-detail"
        onExport={(options) => {
          exportScan(options)
          exportDialog.closeDialog()
        }}
        isExporting={isExporting}
      />

      {/* ARP results (shown above tabs if present) */}
      {arpReports.length > 0 && (
        <ArpResults arpReports={arpReports} isLoading={arpLoading} />
      )}

      {/* Tabbed content */}
      <Card>
        <CardContent className="pt-4">
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as TabId)}
          />

          <div className="pt-4">
            {activeTab === 'results' && (
              <ResultsTab reports={reports} banners={banners} isLoading={reportsLoading} />
            )}

            {activeTab === 'hosts' && (
              <HostsTab reports={reports} isLoading={reportsLoading} />
            )}

            {activeTab === 'raw' && (
              <RawDataTab scan={scan} reports={reports} />
            )}

            {activeTab === 'notes' && (
              <NotesTab
                entityType="scan"
                entityId={scan_id}
                scanNotes={scan.scan_notes}
                notes={notes}
                isLoading={notesLoading}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
