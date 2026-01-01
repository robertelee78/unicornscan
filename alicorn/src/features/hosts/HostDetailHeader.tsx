/**
 * Host detail header with metadata
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Link } from 'react-router-dom'
import { ArrowLeft, Network, Clock, Server, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatTimestamp, formatRelativeTime } from '@/lib/utils'
import { ExportDropdown, type ExportFormat } from '@/features/export'
import type { Host } from '@/types/database'

interface HostDetailHeaderProps {
  host: Host
  portHistoryCount: number
  scanCount: number
  onQuickExport?: (format: ExportFormat) => void
  onAdvancedExport?: () => void
}

export function HostDetailHeader({
  host,
  portHistoryCount,
  scanCount,
  onQuickExport,
  onAdvancedExport,
}: HostDetailHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Back link and title */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="h-8 px-2">
          <Link to="/hosts">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Hosts
          </Link>
        </Button>

        {/* Export button */}
        {onQuickExport && (
          <ExportDropdown
            onExport={onQuickExport}
            onOpenDialog={onAdvancedExport}
            showAdvanced={!!onAdvancedExport}
          />
        )}
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono flex items-center gap-3">
            {host.ip_addr}
            {host.os_guess && (
              <Badge variant="outline" className="text-sm font-normal">
                {host.os_guess}
              </Badge>
            )}
          </h1>
          {host.hostname && (
            <p className="text-muted mt-1">{host.hostname}</p>
          )}
        </div>
      </div>

      {/* Metadata cards */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <MetadataItem
              icon={<Network className="h-4 w-4" />}
              label="MAC Address"
              value={host.mac_addr ? formatMac(host.mac_addr) : '—'}
            />
            <MetadataItem
              icon={<Server className="h-4 w-4" />}
              label="Open Ports"
              value={host.open_port_count.toString()}
            />
            <MetadataItem
              icon={<Activity className="h-4 w-4" />}
              label="Seen in Scans"
              value={scanCount.toString()}
            />
            <MetadataItem
              icon={<Clock className="h-4 w-4" />}
              label="First Seen"
              value={formatRelativeTime(host.first_seen)}
              title={formatTimestamp(host.first_seen)}
            />
            <MetadataItem
              icon={<Clock className="h-4 w-4" />}
              label="Last Seen"
              value={formatRelativeTime(host.last_seen)}
              title={formatTimestamp(host.last_seen)}
            />
            <MetadataItem
              icon={<Activity className="h-4 w-4" />}
              label="Port Observations"
              value={portHistoryCount.toString()}
            />
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
  title?: string
}

function MetadataItem({ icon, label, value, title }: MetadataItemProps) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-muted mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="font-mono text-sm" title={title}>{value}</p>
      </div>
    </div>
  )
}

function formatMac(mac: string): string {
  if (mac.includes(':')) return mac.toUpperCase()
  if (mac.includes('-')) return mac.replace(/-/g, ':').toUpperCase()
  if (mac.length === 12) {
    return mac.match(/.{2}/g)?.join(':').toUpperCase() || mac
  }
  return mac.toUpperCase()
}
