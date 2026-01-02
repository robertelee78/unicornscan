/**
 * Scan detail header with metadata
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Link } from 'react-router-dom'
import { ArrowLeft, Clock, User, Gauge, Target, Layers, Trash2, Repeat, Timer, Network } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatTimestamp } from '@/lib/utils'
import { ExportDropdown, type ExportFormat } from '@/features/export'
import type { Scan } from '@/types/database'

interface ScanDetailHeaderProps {
  scan: Scan
  reportCount: number
  hostCount: number
  onQuickExport?: (format: ExportFormat) => void
  onAdvancedExport?: () => void
  onDelete?: () => void
}

function formatDuration(start: number, end: number): string {
  // Handle incomplete scans (e_time = 0 means still running)
  if (end === 0 || end < start) {
    return 'In progress'
  }
  const seconds = end - start
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

export function ScanDetailHeader({
  scan,
  reportCount,
  hostCount,
  onQuickExport,
  onAdvancedExport,
  onDelete,
}: ScanDetailHeaderProps) {
  const duration = formatDuration(scan.s_time, scan.e_time)

  return (
    <div className="space-y-4">
      {/* Back link and title */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="h-8 px-2">
          <Link to="/scans">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Scans
          </Link>
        </Button>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Delete button */}
          {onDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          )}

          {/* Export button */}
          {onQuickExport && (
            <ExportDropdown
              onExport={onQuickExport}
              onOpenDialog={onAdvancedExport}
              showAdvanced={!!onAdvancedExport}
            />
          )}
        </div>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            Scan #{scan.scan_id}
            <Badge variant="outline" className="text-sm font-normal">
              {scan.mode_str || 'Unknown'}
            </Badge>
          </h1>
          {scan.target_str && (
            <p className="text-muted mt-1 font-mono">{scan.target_str}</p>
          )}
        </div>
      </div>

      {/* Metadata cards */}
      <Card>
        <CardContent className="pt-4">
          {/* Primary scan info */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <MetadataItem
              icon={<Clock className="h-4 w-4" />}
              label="Started"
              value={formatTimestamp(scan.s_time)}
            />
            <MetadataItem
              icon={<Clock className="h-4 w-4" />}
              label="Duration"
              value={duration}
            />
            <MetadataItem
              icon={<User className="h-4 w-4" />}
              label="User"
              value={scan.user}
            />
            <MetadataItem
              icon={<Layers className="h-4 w-4" />}
              label="Profile"
              value={scan.profile}
            />
            <MetadataItem
              icon={<Target className="h-4 w-4" />}
              label="Ports"
              value={scan.port_str ?? '—'}
            />
            <MetadataItem
              icon={<Network className="h-4 w-4" />}
              label="Interface"
              value={scan.interface ?? '—'}
            />
          </div>

          {/* Scan options row */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-4 pt-4 border-t border-border">
            <MetadataItem
              icon={<Gauge className="h-4 w-4" />}
              label="PPS"
              value={(scan.pps ?? 0).toLocaleString()}
            />
            <MetadataItem
              icon={<Repeat className="h-4 w-4" />}
              label="Repeats"
              value={(scan.repeats ?? 1).toString()}
            />
            <MetadataItem
              icon={<Timer className="h-4 w-4" />}
              label="Timeout"
              value={`${scan.recv_timeout ?? 0}s`}
            />
            {scan.src_addr && (
              <MetadataItem
                icon={<Network className="h-4 w-4" />}
                label="Source IP"
                value={scan.src_addr}
              />
            )}
            {scan.tcpflags !== null && scan.tcpflags !== undefined && (
              <MetadataItem
                icon={<Target className="h-4 w-4" />}
                label="TCP Flags"
                value={`0x${scan.tcpflags.toString(16).toUpperCase()}`}
              />
            )}
            {scan.num_phases && scan.num_phases > 1 && (
              <MetadataItem
                icon={<Layers className="h-4 w-4" />}
                label="Phases"
                value={scan.num_phases.toString()}
              />
            )}
          </div>

          {/* Stats row */}
          <div className="flex gap-6 mt-4 pt-4 border-t border-border text-sm">
            <div>
              <span className="text-muted">Hosts:</span>{' '}
              <span className="font-mono font-medium">{hostCount}</span>
            </div>
            <div>
              <span className="text-muted">Responses:</span>{' '}
              <span className="font-mono font-medium">{reportCount}</span>
            </div>
            {scan.scan_notes && (
              <div className="flex-1 text-right">
                <span className="text-muted">Note:</span>{' '}
                <span className="text-sm">{scan.scan_notes}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface MetadataItemProps {
  icon: React.ReactNode
  label: string
  value: string
}

function MetadataItem({ icon, label, value }: MetadataItemProps) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-muted mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="font-mono text-sm">{value}</p>
      </div>
    </div>
  )
}
