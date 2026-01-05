/**
 * TimelineView - Chronological change visualization for multi-scan comparison
 *
 * Layout:
 * - Vertical timeline with scan timestamps as markers
 * - Each change event is a card grouped by host
 * - Shows what changed: port appeared/disappeared/modified
 * - Before/after values for modifications
 * - Collapsible host sections
 *
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Circle,
  Plus,
  Minus,
  RefreshCw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { Scan } from '@/types/database'
import type {
  MultiScanComparisonResult,
  MultiScanHostDiff,
} from '../types'

// =============================================================================
// Types
// =============================================================================

interface TimelineViewProps {
  /** Comparison data from useMultiScanComparison */
  data: MultiScanComparisonResult
  /** Optional CSS class */
  className?: string
}

type ChangeType = 'appeared' | 'disappeared' | 'modified'

interface TimelineEvent {
  /** The host this event belongs to */
  hostAddr: string
  /** The scan where this change occurred */
  scan: Scan
  /** Index of the scan (for styling) */
  scanIndex: number
  /** Port number */
  port: number
  /** Protocol */
  protocol: string
  /** Type of change */
  changeType: ChangeType
  /** TTL value after change (for appeared/modified) */
  ttl?: number
  /** Previous TTL value (for modified) */
  prevTtl?: number
}

interface HostTimelineGroup {
  /** Host IP address */
  hostAddr: string
  /** All events for this host */
  events: TimelineEvent[]
  /** Number of appears */
  appearCount: number
  /** Number of disappears */
  disappearCount: number
  /** Number of modifications */
  modifyCount: number
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format scan timestamp for timeline marker
 */
function formatScanTime(scan: Scan): string {
  const date = new Date(scan.s_time * 1000)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Extract timeline events from multi-scan comparison data
 */
function extractTimelineEvents(
  scans: Scan[],
  hostDiffs: MultiScanHostDiff[]
): TimelineEvent[] {
  const events: TimelineEvent[] = []

  for (const host of hostDiffs) {
    for (const portDiff of host.portDiffs) {
      // Check for changes between consecutive scans
      for (let i = 1; i < portDiff.presence.length; i++) {
        const prev = portDiff.presence[i - 1]
        const curr = portDiff.presence[i]
        const scan = scans[i]

        // Port appeared (was absent, now present)
        if (prev.status === 'absent' && curr.status === 'present') {
          events.push({
            hostAddr: host.ipAddr,
            scan,
            scanIndex: i,
            port: portDiff.port,
            protocol: portDiff.protocol,
            changeType: 'appeared',
            ttl: curr.info?.ttl,
          })
        }
        // Port disappeared (was present, now absent)
        else if (prev.status === 'present' && curr.status === 'absent') {
          events.push({
            hostAddr: host.ipAddr,
            scan,
            scanIndex: i,
            port: portDiff.port,
            protocol: portDiff.protocol,
            changeType: 'disappeared',
            prevTtl: prev.info?.ttl,
          })
        }
        // Port modified (TTL changed)
        else if (
          prev.status === 'present' &&
          curr.status === 'present' &&
          prev.info &&
          curr.info &&
          prev.info.ttl !== curr.info.ttl
        ) {
          events.push({
            hostAddr: host.ipAddr,
            scan,
            scanIndex: i,
            port: portDiff.port,
            protocol: portDiff.protocol,
            changeType: 'modified',
            ttl: curr.info.ttl,
            prevTtl: prev.info.ttl,
          })
        }
      }
    }
  }

  // Sort by scan time, then by host
  return events.sort((a, b) => {
    if (a.scan.s_time !== b.scan.s_time) {
      return a.scan.s_time - b.scan.s_time
    }
    return a.hostAddr.localeCompare(b.hostAddr)
  })
}

/**
 * Group timeline events by host
 */
function groupEventsByHost(events: TimelineEvent[]): HostTimelineGroup[] {
  const groups = new Map<string, HostTimelineGroup>()

  for (const event of events) {
    if (!groups.has(event.hostAddr)) {
      groups.set(event.hostAddr, {
        hostAddr: event.hostAddr,
        events: [],
        appearCount: 0,
        disappearCount: 0,
        modifyCount: 0,
      })
    }

    const group = groups.get(event.hostAddr)!
    group.events.push(event)

    switch (event.changeType) {
      case 'appeared':
        group.appearCount++
        break
      case 'disappeared':
        group.disappearCount++
        break
      case 'modified':
        group.modifyCount++
        break
    }
  }

  // Sort groups by IP address (numeric sort)
  return Array.from(groups.values()).sort((a, b) => {
    const aNum = a.hostAddr.split('.').reduce((acc, oct) => acc * 256 + parseInt(oct), 0)
    const bNum = b.hostAddr.split('.').reduce((acc, oct) => acc * 256 + parseInt(oct), 0)
    return aNum - bNum
  })
}

/**
 * Get icon for change type
 */
function getChangeIcon(changeType: ChangeType) {
  switch (changeType) {
    case 'appeared':
      return <Plus className="h-3 w-3" />
    case 'disappeared':
      return <Minus className="h-3 w-3" />
    case 'modified':
      return <RefreshCw className="h-3 w-3" />
  }
}

/**
 * Get CSS classes for change type
 */
function getChangeClasses(changeType: ChangeType): string {
  switch (changeType) {
    case 'appeared':
      return 'bg-success/10 text-success border-success/30'
    case 'disappeared':
      return 'bg-destructive/10 text-destructive border-destructive/30'
    case 'modified':
      return 'bg-warning/10 text-warning border-warning/30'
  }
}

/**
 * Get label for change type
 */
function getChangeLabel(changeType: ChangeType): string {
  switch (changeType) {
    case 'appeared':
      return 'Appeared'
    case 'disappeared':
      return 'Disappeared'
    case 'modified':
      return 'Modified'
  }
}

// =============================================================================
// Sub-Components
// =============================================================================

interface EventCardProps {
  event: TimelineEvent
}

function EventCard({ event }: EventCardProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-1 rounded border text-xs',
        getChangeClasses(event.changeType)
      )}
    >
      {getChangeIcon(event.changeType)}
      <span className="font-mono font-medium">
        {event.port}/{event.protocol}
      </span>
      <span className="text-muted-foreground">
        {getChangeLabel(event.changeType)}
      </span>
      {event.changeType === 'modified' && (
        <span className="text-muted-foreground">
          TTL: {event.prevTtl} → {event.ttl}
        </span>
      )}
      {event.changeType === 'appeared' && event.ttl !== undefined && (
        <span className="text-muted-foreground">TTL: {event.ttl}</span>
      )}
    </div>
  )
}

interface ScanTimelineMarkerProps {
  scan: Scan
  eventCount: number
  isFirst: boolean
}

function ScanTimelineMarker({ scan, eventCount, isFirst }: ScanTimelineMarkerProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      {/* Timeline dot */}
      <div className="relative">
        <Circle className="h-3 w-3 fill-primary text-primary" />
        {!isFirst && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-border" />
        )}
      </div>

      {/* Scan info */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="font-mono text-xs">
          #{scan.scan_id}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {formatScanTime(scan)}
        </span>
        {eventCount > 0 && (
          <Badge variant="secondary" className="text-xs">
            {eventCount} change{eventCount !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>
    </div>
  )
}

interface HostGroupProps {
  group: HostTimelineGroup
  scans: Scan[]
}

function HostGroup({ group, scans }: HostGroupProps) {
  const [isOpen, setIsOpen] = useState(true)

  // Group events by scan
  const eventsByScan = useMemo(() => {
    const map = new Map<number, TimelineEvent[]>()
    for (const scan of scans) {
      map.set(scan.scan_id, [])
    }
    for (const event of group.events) {
      const list = map.get(event.scan.scan_id)
      if (list) {
        list.push(event)
      }
    }
    return map
  }, [group.events, scans])

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 px-2 py-1.5 h-auto font-mono text-sm hover:bg-muted/50"
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-semibold">{group.hostAddr}</span>
          <div className="flex gap-1 ml-auto">
            {group.appearCount > 0 && (
              <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30">
                +{group.appearCount}
              </Badge>
            )}
            {group.disappearCount > 0 && (
              <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">
                -{group.disappearCount}
              </Badge>
            )}
            {group.modifyCount > 0 && (
              <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30">
                ~{group.modifyCount}
              </Badge>
            )}
          </div>
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="pl-6 border-l-2 border-border ml-3 space-y-2 py-2">
          {scans.slice(1).map((scan, i) => {
            const scanEvents = eventsByScan.get(scan.scan_id) || []
            if (scanEvents.length === 0) return null

            return (
              <div key={scan.scan_id} className="space-y-1">
                <ScanTimelineMarker
                  scan={scan}
                  eventCount={scanEvents.length}
                  isFirst={i === 0}
                />
                <div className="pl-6 flex flex-wrap gap-1">
                  {scanEvents.map((event, j) => (
                    <EventCard key={`${event.port}-${event.protocol}-${j}`} event={event} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * TimelineView - Chronological visualization of changes across scans
 *
 * Shows a vertical timeline grouped by host, with each change event
 * displayed as a card showing what changed between consecutive scans.
 *
 * @example
 * ```tsx
 * const { data } = useMultiScanComparison([1, 2, 3])
 * return <TimelineView data={data} />
 * ```
 */
export function TimelineView({ data, className }: TimelineViewProps) {
  const { scans, hostDiffs } = data

  // Extract and group timeline events
  const hostGroups = useMemo(() => {
    const events = extractTimelineEvents(scans, hostDiffs)
    return groupEventsByHost(events)
  }, [scans, hostDiffs])

  // Count total changes
  const totalChanges = useMemo(() => {
    return hostGroups.reduce(
      (sum, g) => sum + g.appearCount + g.disappearCount + g.modifyCount,
      0
    )
  }, [hostGroups])

  return (
    <div className={cn('p-4', className)}>
      {/* Summary header */}
      <div className="flex items-center gap-4 mb-4 pb-3 border-b border-border">
        <h3 className="text-sm font-medium">Timeline of Changes</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{hostGroups.length} hosts with changes</span>
          <span>•</span>
          <span>{totalChanges} total events</span>
        </div>
      </div>

      {/* Timeline content */}
      {hostGroups.length > 0 ? (
        <div className="space-y-1">
          {hostGroups.map((group) => (
            <HostGroup key={group.hostAddr} group={group} scans={scans} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Circle className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">No changes detected between scans</p>
          <p className="text-xs mt-1">All hosts and ports remained the same</p>
        </div>
      )}
    </div>
  )
}
