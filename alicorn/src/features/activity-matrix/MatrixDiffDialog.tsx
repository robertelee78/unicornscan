/**
 * Matrix diff dialog component
 * Shows detailed port comparison between scans for a host
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Link } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { DiffDialogData, PortKey } from './types'
import { parsePortKey } from './types'

// =============================================================================
// Props
// =============================================================================

interface MatrixDiffDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: DiffDialogData | null
  isLoading: boolean
}

// =============================================================================
// Component
// =============================================================================

export function MatrixDiffDialog({
  open,
  onOpenChange,
  data,
  isLoading,
}: MatrixDiffDialogProps) {
  if (!data && !isLoading) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-muted-foreground">Loading...</span>
          </div>
        ) : data ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono">{data.hostIp}</span>
                <StatusBadge status={data.status} />
              </DialogTitle>
              <DialogDescription>
                Port comparison between scans
              </DialogDescription>
            </DialogHeader>

            {/* Scan Info Cards */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Current Scan */}
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm font-medium">Current Scan</CardTitle>
                </CardHeader>
                <CardContent className="py-2 px-3 text-sm">
                  <div className="space-y-1">
                    <div>
                      <span className="text-muted-foreground">ID: </span>
                      <Link
                        to={`/scans/${data.currentScan.scans_id}`}
                        className="text-blue-500 hover:underline font-mono"
                      >
                        {data.currentScan.scans_id}
                      </Link>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Time: </span>
                      <span>{new Date(data.currentScan.s_time * 1000).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Target: </span>
                      <span className="font-mono text-xs">{data.currentScan.target_str}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Ports: </span>
                      <Badge variant="secondary">{data.currentPorts.length}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Baseline Scan */}
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm font-medium">Baseline Scan</CardTitle>
                </CardHeader>
                <CardContent className="py-2 px-3 text-sm">
                  {data.baselineScan ? (
                    <div className="space-y-1">
                      <div>
                        <span className="text-muted-foreground">ID: </span>
                        <Link
                          to={`/scans/${data.baselineScan.scans_id}`}
                          className="text-blue-500 hover:underline font-mono"
                        >
                          {data.baselineScan.scans_id}
                        </Link>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Time: </span>
                        <span>{new Date(data.baselineScan.s_time * 1000).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Target: </span>
                        <span className="font-mono text-xs">{data.baselineScan.target_str}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Ports: </span>
                        <Badge variant="secondary">{data.baselinePorts.length}</Badge>
                      </div>
                    </div>
                  ) : (
                    <div className="text-muted-foreground italic">
                      First observation (no baseline)
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Port Comparison Tabs */}
            <Tabs defaultValue="side-by-side" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="side-by-side">Side by Side</TabsTrigger>
                <TabsTrigger value="diff-only">Changes Only</TabsTrigger>
                <TabsTrigger value="composite">All Ports</TabsTrigger>
              </TabsList>

              {/* Side by Side View */}
              <TabsContent value="side-by-side" className="mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <PortList
                    title="Baseline Ports"
                    ports={data.baselinePorts}
                    highlightRemoved={data.removedPorts}
                    emptyMessage="No baseline ports"
                  />
                  <PortList
                    title="Current Ports"
                    ports={data.currentPorts}
                    highlightNew={data.newPorts}
                    emptyMessage="No current ports"
                  />
                </div>
              </TabsContent>

              {/* Changes Only View */}
              <TabsContent value="diff-only" className="mt-4">
                <div className="space-y-4">
                  {data.newPorts.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-green-500 mb-2 flex items-center gap-2">
                        <span>New Ports</span>
                        <Badge variant="secondary" className="bg-green-500/20 text-green-500">
                          +{data.newPorts.length}
                        </Badge>
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {data.newPorts.map((port) => (
                          <PortBadge key={port} port={port} variant="new" />
                        ))}
                      </div>
                    </div>
                  )}

                  {data.removedPorts.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-red-500 mb-2 flex items-center gap-2">
                        <span>Removed Ports</span>
                        <Badge variant="secondary" className="bg-red-500/20 text-red-500">
                          -{data.removedPorts.length}
                        </Badge>
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {data.removedPorts.map((port) => (
                          <PortBadge key={port} port={port} variant="removed" />
                        ))}
                      </div>
                    </div>
                  )}

                  {data.newPorts.length === 0 && data.removedPorts.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                      No port changes detected
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Composite View */}
              <TabsContent value="composite" className="mt-4">
                <CompositePortView data={data} />
              </TabsContent>
            </Tabs>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button asChild>
                <Link to={`/scans/${data.currentScan.scans_id}`}>
                  View Scan Details
                </Link>
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Helper Components
// =============================================================================

function StatusBadge({ status }: { status: DiffDialogData['status'] }) {
  const config = {
    new: { bg: 'bg-green-500', label: 'New Ports' },
    removed: { bg: 'bg-red-500', label: 'Removed Ports' },
    mixed: { bg: 'bg-amber-500', label: 'Mixed Changes' },
    unchanged: { bg: 'bg-gray-400', label: 'No Changes' },
    first: { bg: 'bg-blue-500', label: 'First Scan' },
    empty: { bg: 'bg-muted', label: 'No Ports' },
  }

  const { bg, label } = config[status]

  return (
    <Badge className={`${bg} text-white`}>
      {label}
    </Badge>
  )
}

interface PortListProps {
  title: string
  ports: PortKey[]
  highlightNew?: PortKey[]
  highlightRemoved?: PortKey[]
  emptyMessage: string
}

function PortList({ title, ports, highlightNew = [], highlightRemoved = [], emptyMessage }: PortListProps) {
  const newSet = new Set(highlightNew)
  const removedSet = new Set(highlightRemoved)

  return (
    <div className="rounded-lg border border-border p-3">
      <h4 className="text-sm font-medium mb-2">{title}</h4>
      {ports.length > 0 ? (
        <div className="flex flex-wrap gap-1 max-h-48 overflow-y-auto">
          {ports.map((port) => (
            <PortBadge
              key={port}
              port={port}
              variant={
                newSet.has(port)
                  ? 'new'
                  : removedSet.has(port)
                    ? 'removed'
                    : 'default'
              }
            />
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground text-sm italic">{emptyMessage}</div>
      )}
    </div>
  )
}

interface PortBadgeProps {
  port: PortKey
  variant: 'new' | 'removed' | 'default' | 'unchanged'
}

function PortBadge({ port, variant }: PortBadgeProps) {
  const { port: portNum, protocol } = parsePortKey(port)

  const className = {
    new: 'bg-green-500/20 text-green-500 border-green-500/50',
    removed: 'bg-red-500/20 text-red-500 border-red-500/50 line-through',
    default: 'bg-muted text-foreground border-border',
    unchanged: 'bg-gray-500/20 text-gray-500 border-gray-500/50',
  }[variant]

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-mono ${className}`}
    >
      {portNum}/{protocol}
    </span>
  )
}

function CompositePortView({ data }: { data: DiffDialogData }) {
  // Create superset of all ports
  const allPorts = new Set([...data.currentPorts, ...data.baselinePorts])
  const sortedPorts = [...allPorts].sort((a, b) => {
    const [portA] = a.split('/')
    const [portB] = b.split('/')
    return parseInt(portA, 10) - parseInt(portB, 10)
  })

  const currentSet = new Set(data.currentPorts)
  const baselineSet = new Set(data.baselinePorts)
  const newSet = new Set(data.newPorts)
  const removedSet = new Set(data.removedPorts)

  return (
    <div className="space-y-2">
      <div className="flex gap-4 text-xs text-muted-foreground mb-2">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-green-500 rounded" /> New
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-red-500 rounded" /> Removed
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-gray-400 rounded" /> Unchanged
        </span>
      </div>

      <div className="rounded-lg border border-border p-3 max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1 px-2">Port</th>
              <th className="text-center py-1 px-2">Baseline</th>
              <th className="text-center py-1 px-2">Current</th>
              <th className="text-left py-1 px-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedPorts.map((port) => {
              const inBaseline = baselineSet.has(port)
              const inCurrent = currentSet.has(port)
              const isNew = newSet.has(port)
              const isRemoved = removedSet.has(port)

              return (
                <tr key={port} className="border-b border-border/50 last:border-0">
                  <td className="py-1 px-2 font-mono">{port}</td>
                  <td className="text-center py-1 px-2">
                    {inBaseline ? (
                      <span className={isRemoved ? 'text-red-500' : 'text-green-500'}>✓</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="text-center py-1 px-2">
                    {inCurrent ? (
                      <span className={isNew ? 'text-green-500' : 'text-green-500'}>✓</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-1 px-2">
                    {isNew && (
                      <Badge className="bg-green-500/20 text-green-500 text-xs">New</Badge>
                    )}
                    {isRemoved && (
                      <Badge className="bg-red-500/20 text-red-500 text-xs">Removed</Badge>
                    )}
                    {!isNew && !isRemoved && inCurrent && inBaseline && (
                      <Badge className="bg-gray-500/20 text-gray-500 text-xs">Unchanged</Badge>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
