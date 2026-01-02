/**
 * Comparison summary statistics
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Plus, Minus, RefreshCw, Equal, Server, Network } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ScanComparisonResult } from './types'

interface ComparisonSummaryProps {
  result: ScanComparisonResult
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number
  subLabel?: string
  colorClass?: string
}

function StatCard({ icon, label, value, subLabel, colorClass = 'text-foreground' }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
      <div className={`${colorClass} opacity-80`}>{icon}</div>
      <div>
        <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
        <p className="text-xs text-muted">{label}</p>
        {subLabel && <p className="text-xs text-muted opacity-70">{subLabel}</p>}
      </div>
    </div>
  )
}

export function ComparisonSummary({ result }: ComparisonSummaryProps) {
  const { summary, scanA, scanB } = result

  return (
    <div className="space-y-4">
      {/* Host Changes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4" />
            Host Changes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<Plus className="h-5 w-5" />}
              label="New Hosts"
              value={summary.hostsAdded}
              subLabel="In scan B only"
              colorClass="text-success"
            />
            <StatCard
              icon={<Minus className="h-5 w-5" />}
              label="Removed Hosts"
              value={summary.hostsRemoved}
              subLabel="In scan A only"
              colorClass="text-error"
            />
            <StatCard
              icon={<RefreshCw className="h-5 w-5" />}
              label="Changed Hosts"
              value={summary.hostsChanged}
              subLabel="Port differences"
              colorClass="text-warning"
            />
            <StatCard
              icon={<Equal className="h-5 w-5" />}
              label="Unchanged"
              value={summary.hostsUnchanged}
              subLabel="Same in both"
              colorClass="text-muted-foreground"
            />
          </div>
          <div className="mt-3 text-xs text-muted flex justify-between border-t pt-2">
            <span>Scan A: {summary.totalHostsA} hosts</span>
            <span>Scan B: {summary.totalHostsB} hosts</span>
          </div>
        </CardContent>
      </Card>

      {/* Port Changes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Network className="h-4 w-4" />
            Port Changes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              icon={<Plus className="h-5 w-5" />}
              label="Ports Opened"
              value={summary.portsOpened}
              colorClass="text-success"
            />
            <StatCard
              icon={<Minus className="h-5 w-5" />}
              label="Ports Closed"
              value={summary.portsClosed}
              colorClass="text-error"
            />
            <StatCard
              icon={<RefreshCw className="h-5 w-5" />}
              label="Ports Modified"
              value={summary.portsModified}
              subLabel="TTL/flags changed"
              colorClass="text-warning"
            />
          </div>
          <div className="mt-3 text-xs text-muted flex justify-between border-t pt-2">
            <span>Scan A: {summary.totalPortsA} responses</span>
            <span>Scan B: {summary.totalPortsB} responses</span>
          </div>
        </CardContent>
      </Card>

      {/* Scan Details */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="p-3 rounded-lg bg-muted/30">
          <p className="font-medium mb-1">Scan A (Base)</p>
          <p className="text-muted text-xs">#{scanA.scan_id} - {scanA.target_str}</p>
          <p className="text-muted text-xs">{scanA.mode_str || 'Unknown'}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30">
          <p className="font-medium mb-1">Scan B (Compare To)</p>
          <p className="text-muted text-xs">#{scanB.scan_id} - {scanB.target_str}</p>
          <p className="text-muted text-xs">{scanB.mode_str || 'Unknown'}</p>
        </div>
      </div>
    </div>
  )
}
