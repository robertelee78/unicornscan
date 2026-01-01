/**
 * Host diff table for comparison view
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Plus, Minus, RefreshCw, Equal, Filter } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { HostDiff, PortDiff, DiffStatus, HostFilterType } from './types'

interface HostDiffTableProps {
  hostDiffs: HostDiff[]
}

// =============================================================================
// Status Icons and Colors
// =============================================================================

function StatusIcon({ status }: { status: DiffStatus }) {
  switch (status) {
    case 'added':
      return <Plus className="h-4 w-4 text-success" />
    case 'removed':
      return <Minus className="h-4 w-4 text-error" />
    case 'changed':
      return <RefreshCw className="h-4 w-4 text-warning" />
    case 'unchanged':
      return <Equal className="h-4 w-4 text-muted" />
  }
}

function statusBgClass(status: DiffStatus): string {
  switch (status) {
    case 'added': return 'bg-success/10 border-success/30'
    case 'removed': return 'bg-error/10 border-error/30'
    case 'changed': return 'bg-warning/10 border-warning/30'
    case 'unchanged': return 'bg-muted/10 border-muted/30'
  }
}

function statusLabel(status: DiffStatus): string {
  switch (status) {
    case 'added': return 'New'
    case 'removed': return 'Removed'
    case 'changed': return 'Changed'
    case 'unchanged': return 'Unchanged'
  }
}

// =============================================================================
// Port Diff Row
// =============================================================================

function PortDiffRow({ portDiff }: { portDiff: PortDiff }) {
  const { port, protocol, status, infoA, infoB } = portDiff

  return (
    <tr className={`text-sm ${status === 'unchanged' ? 'opacity-50' : ''}`}>
      <td className="py-1 px-2">
        <StatusIcon status={status} />
      </td>
      <td className="py-1 px-2 font-mono">{port}</td>
      <td className="py-1 px-2 uppercase text-xs">{protocol}</td>
      <td className="py-1 px-2 text-muted">
        {infoA ? (
          <span className="font-mono text-xs">TTL:{infoA.ttl} F:{infoA.flags}</span>
        ) : (
          <span className="text-xs italic">—</span>
        )}
      </td>
      <td className="py-1 px-2 text-muted">
        {infoB ? (
          <span className="font-mono text-xs">TTL:{infoB.ttl} F:{infoB.flags}</span>
        ) : (
          <span className="text-xs italic">—</span>
        )}
      </td>
    </tr>
  )
}

// =============================================================================
// Expandable Host Row
// =============================================================================

function HostDiffRow({ hostDiff }: { hostDiff: HostDiff }) {
  const [expanded, setExpanded] = useState(false)
  const { ipAddr, hostname, status, portsA, portsB, portDiffs } = hostDiff

  // Count changes by type
  const portStats = useMemo(() => {
    const stats = { added: 0, removed: 0, changed: 0, unchanged: 0 }
    for (const pd of portDiffs) {
      stats[pd.status]++
    }
    return stats
  }, [portDiffs])

  const hasChanges = portStats.added > 0 || portStats.removed > 0 || portStats.changed > 0

  return (
    <>
      <tr
        className={`border-b border-border hover:bg-muted/30 cursor-pointer ${statusBgClass(status)}`}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-2 px-3 w-8">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted" />
          )}
        </td>
        <td className="py-2 px-3 w-8">
          <StatusIcon status={status} />
        </td>
        <td className="py-2 px-3 font-mono">
          <Link
            to={`/hosts/${ipAddr}`}
            className="hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {ipAddr}
          </Link>
          {hostname && (
            <span className="text-muted text-sm ml-2">({hostname})</span>
          )}
        </td>
        <td className="py-2 px-3 text-sm text-muted">{statusLabel(status)}</td>
        <td className="py-2 px-3 text-sm font-mono">{portsA.length}</td>
        <td className="py-2 px-3 text-sm font-mono">{portsB.length}</td>
        <td className="py-2 px-3 text-sm">
          {hasChanges ? (
            <span className="flex items-center gap-2 text-xs">
              {portStats.added > 0 && (
                <span className="text-success">+{portStats.added}</span>
              )}
              {portStats.removed > 0 && (
                <span className="text-error">-{portStats.removed}</span>
              )}
              {portStats.changed > 0 && (
                <span className="text-warning">~{portStats.changed}</span>
              )}
            </span>
          ) : (
            <span className="text-muted text-xs">No changes</span>
          )}
        </td>
      </tr>
      {expanded && portDiffs.length > 0 && (
        <tr>
          <td colSpan={7} className="bg-muted/20 p-0">
            <div className="p-3">
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-muted uppercase border-b border-border">
                    <th className="py-1 px-2 text-left w-8">Diff</th>
                    <th className="py-1 px-2 text-left">Port</th>
                    <th className="py-1 px-2 text-left">Proto</th>
                    <th className="py-1 px-2 text-left">Scan A</th>
                    <th className="py-1 px-2 text-left">Scan B</th>
                  </tr>
                </thead>
                <tbody>
                  {portDiffs.map((pd) => (
                    <PortDiffRow key={`${pd.port}-${pd.protocol}`} portDiff={pd} />
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// =============================================================================
// Main Table Component
// =============================================================================

export function HostDiffTable({ hostDiffs }: HostDiffTableProps) {
  const [filter, setFilter] = useState<HostFilterType>('all')

  const filteredDiffs = useMemo(() => {
    if (filter === 'all') return hostDiffs
    return hostDiffs.filter((d) => d.status === filter)
  }, [hostDiffs, filter])

  const filterCounts = useMemo(() => {
    const counts = { all: hostDiffs.length, added: 0, removed: 0, changed: 0, unchanged: 0 }
    for (const d of hostDiffs) {
      counts[d.status]++
    }
    return counts
  }, [hostDiffs])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">Host Differences</CardTitle>
          <div className="flex items-center gap-1 text-sm">
            <Filter className="h-4 w-4 text-muted mr-1" />
            <Button
              variant={filter === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              All ({filterCounts.all})
            </Button>
            <Button
              variant={filter === 'added' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('added')}
              className="text-success"
            >
              New ({filterCounts.added})
            </Button>
            <Button
              variant={filter === 'removed' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('removed')}
              className="text-error"
            >
              Removed ({filterCounts.removed})
            </Button>
            <Button
              variant={filter === 'changed' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('changed')}
              className="text-warning"
            >
              Changed ({filterCounts.changed})
            </Button>
            <Button
              variant={filter === 'unchanged' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('unchanged')}
            >
              Same ({filterCounts.unchanged})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-muted uppercase border-y border-border bg-muted/30">
                <th className="py-2 px-3 text-left w-8"></th>
                <th className="py-2 px-3 text-left w-8">Status</th>
                <th className="py-2 px-3 text-left">Host</th>
                <th className="py-2 px-3 text-left">Change</th>
                <th className="py-2 px-3 text-left">Ports A</th>
                <th className="py-2 px-3 text-left">Ports B</th>
                <th className="py-2 px-3 text-left">Port Changes</th>
              </tr>
            </thead>
            <tbody>
              {filteredDiffs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted">
                    No hosts match the selected filter
                  </td>
                </tr>
              ) : (
                filteredDiffs.map((diff) => (
                  <HostDiffRow key={diff.ipAddr} hostDiff={diff} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
