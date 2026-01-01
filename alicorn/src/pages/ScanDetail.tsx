/**
 * Scan detail page - thin wrapper over scans feature module
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useScan, useIpReports } from '@/hooks'
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

type TabId = 'results' | 'hosts' | 'raw' | 'notes'

export function ScanDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const scansId = parseInt(id || '0', 10)
  const [activeTab, setActiveTab] = useState<TabId>('results')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Fetch scan data
  const { data: scan, isLoading: scanLoading, error: scanError } = useScan(scansId)
  const { data: reports = [], isLoading: reportsLoading } = useIpReports(scansId)
  const { data: arpReports = [], isLoading: arpLoading } = useArpReports(scansId)
  const { data: notes = [], isLoading: notesLoading } = useScanNotes(scansId)

  // Export functionality
  const exportDialog = useExportDialog()
  const { exportScan, isExporting } = useScanExport(scan ?? null, reports)

  // Delete functionality
  const { mutate: deleteScan, isPending: isDeleting } = useScanDeletion({
    onSuccess: (result) => {
      if (scan) {
        recordDeletion(result, scan.target_str)
      }
      setDeleteDialogOpen(false)
      navigate('/scans')
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
    deleteScan(scansId)
  }, [deleteScan, scansId])

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
      <div className="text-error p-4">
        Error loading scan: {scanError.message}
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
        scansId={scansId}
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
              <ResultsTab reports={reports} isLoading={reportsLoading} />
            )}

            {activeTab === 'hosts' && (
              <HostsTab reports={reports} isLoading={reportsLoading} />
            )}

            {activeTab === 'raw' && (
              <RawDataTab scan={scan} reports={reports} />
            )}

            {activeTab === 'notes' && (
              <NotesTab
                scanId={scansId}
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
