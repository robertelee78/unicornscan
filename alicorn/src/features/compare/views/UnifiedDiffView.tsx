/**
 * UnifiedDiffView - Git-style unified diff visualization for multi-scan comparison
 *
 * Layout:
 * - Git-style diff format showing changes
 * - Host headers: === 192.168.1.10 ===
 * - Added: + 443/tcp [NEW]
 * - Removed: - 22/tcp [REMOVED]
 * - Modified: ~ 80/tcp TTL: 64→58
 * - Monospace font with syntax highlighting
 * - Optional context lines for unchanged neighbors
 *
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff, Copy, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Scan } from '@/types/database'
import type {
  MultiScanComparisonResult,
  MultiScanHostDiff,
} from '../types'

// =============================================================================
// Types
// =============================================================================

interface UnifiedDiffViewProps {
  /** Comparison data from useMultiScanComparison */
  data: MultiScanComparisonResult
  /** Optional CSS class */
  className?: string
}

type DiffLineType = 'header' | 'added' | 'removed' | 'modified' | 'context' | 'info'

interface DiffLine {
  type: DiffLineType
  content: string
  scanIndex?: number
  port?: number
  protocol?: string
  ttl?: number
  prevTtl?: number
}

interface HostDiffBlock {
  hostAddr: string
  lines: DiffLine[]
  addedCount: number
  removedCount: number
  modifiedCount: number
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format scan range for diff header
 */
function formatScanRange(scans: Scan[]): string {
  if (scans.length < 2) return ''
  const first = scans[0]
  const last = scans[scans.length - 1]
  return `Comparing ${scans.length} scans: #${first.scan_id} → #${last.scan_id}`
}

/**
 * Generate unified diff lines for a single host
 */
function generateHostDiff(
  host: MultiScanHostDiff,
  _scans: Scan[],
  showContext: boolean
): HostDiffBlock {
  const lines: DiffLine[] = []
  let addedCount = 0
  let removedCount = 0
  let modifiedCount = 0

  // Sort ports by port number
  const sortedPorts = [...host.portDiffs].sort((a, b) => a.port - b.port)

  for (const portDiff of sortedPorts) {
    // Check for changes between consecutive scans
    for (let i = 1; i < portDiff.presence.length; i++) {
      const prev = portDiff.presence[i - 1]
      const curr = portDiff.presence[i]

      // Port appeared
      if (prev.status === 'absent' && curr.status === 'present') {
        lines.push({
          type: 'added',
          content: `+ ${portDiff.port}/${portDiff.protocol}`,
          scanIndex: i,
          port: portDiff.port,
          protocol: portDiff.protocol,
          ttl: curr.info?.ttl,
        })
        addedCount++
      }
      // Port removed
      else if (prev.status === 'present' && curr.status === 'absent') {
        lines.push({
          type: 'removed',
          content: `- ${portDiff.port}/${portDiff.protocol}`,
          scanIndex: i,
          port: portDiff.port,
          protocol: portDiff.protocol,
          prevTtl: prev.info?.ttl,
        })
        removedCount++
      }
      // Port modified (TTL changed)
      else if (
        prev.status === 'present' &&
        curr.status === 'present' &&
        prev.info &&
        curr.info &&
        prev.info.ttl !== curr.info.ttl
      ) {
        lines.push({
          type: 'modified',
          content: `~ ${portDiff.port}/${portDiff.protocol} TTL: ${prev.info.ttl}→${curr.info.ttl}`,
          scanIndex: i,
          port: portDiff.port,
          protocol: portDiff.protocol,
          ttl: curr.info.ttl,
          prevTtl: prev.info.ttl,
        })
        modifiedCount++
      }
      // Show context if enabled and port is unchanged but present
      else if (showContext && prev.status === 'present' && curr.status === 'present') {
        // Only show context once per port (at the end)
        if (i === portDiff.presence.length - 1) {
          lines.push({
            type: 'context',
            content: `  ${portDiff.port}/${portDiff.protocol}`,
            port: portDiff.port,
            protocol: portDiff.protocol,
            ttl: curr.info?.ttl,
          })
        }
      }
    }
  }

  // Sort lines by port number for consistent ordering
  lines.sort((a, b) => (a.port || 0) - (b.port || 0))

  return {
    hostAddr: host.ipAddr,
    lines,
    addedCount,
    removedCount,
    modifiedCount,
  }
}

/**
 * Generate all diff blocks for comparison
 */
function generateDiffBlocks(
  data: MultiScanComparisonResult,
  showContext: boolean
): HostDiffBlock[] {
  const { scans, hostDiffs } = data

  const blocks: HostDiffBlock[] = []

  for (const host of hostDiffs) {
    const block = generateHostDiff(host, scans, showContext)
    // Only include hosts with changes (or context if shown)
    if (block.lines.length > 0) {
      blocks.push(block)
    }
  }

  // Sort by IP address
  return blocks.sort((a, b) => {
    const aNum = a.hostAddr.split('.').reduce((acc, oct) => acc * 256 + parseInt(oct), 0)
    const bNum = b.hostAddr.split('.').reduce((acc, oct) => acc * 256 + parseInt(oct), 0)
    return aNum - bNum
  })
}

/**
 * Get CSS classes for diff line type
 */
function getDiffLineClasses(type: DiffLineType): string {
  switch (type) {
    case 'header':
      return 'bg-muted/50 text-foreground font-semibold border-y border-border'
    case 'added':
      return 'bg-success/10 text-success'
    case 'removed':
      return 'bg-destructive/10 text-destructive'
    case 'modified':
      return 'bg-warning/10 text-warning'
    case 'context':
      return 'text-muted-foreground'
    case 'info':
      return 'text-muted-foreground italic'
    default:
      return ''
  }
}

// =============================================================================
// Sub-Components
// =============================================================================

interface DiffLineRendererProps {
  line: DiffLine
  scans: Scan[]
}

function DiffLineRenderer({ line, scans }: DiffLineRendererProps) {
  const scanLabel = line.scanIndex !== undefined
    ? ` (scan #${scans[line.scanIndex].scan_id})`
    : ''

  return (
    <div
      className={cn(
        'px-4 py-0.5 font-mono text-sm',
        getDiffLineClasses(line.type)
      )}
    >
      <span>{line.content}</span>
      {line.type === 'added' && line.ttl !== undefined && (
        <span className="text-muted-foreground ml-2">[NEW TTL:{line.ttl}]</span>
      )}
      {line.type === 'removed' && line.prevTtl !== undefined && (
        <span className="text-muted-foreground ml-2">[REMOVED]</span>
      )}
      {line.type === 'modified' && (
        <span className="text-muted-foreground ml-2">[MODIFIED]</span>
      )}
      {line.scanIndex !== undefined && (
        <span className="text-muted-foreground/60 ml-2 text-xs">{scanLabel}</span>
      )}
    </div>
  )
}

interface HostBlockProps {
  block: HostDiffBlock
  scans: Scan[]
  defaultExpanded: boolean
}

function HostBlock({ block, scans, defaultExpanded }: HostBlockProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Host header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2',
          'bg-muted/30 hover:bg-muted/50 transition-colors',
          'font-mono text-sm text-left'
        )}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
        <span className="font-semibold text-primary">=== {block.hostAddr} ===</span>
        <div className="flex gap-1.5 ml-auto">
          {block.addedCount > 0 && (
            <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30 font-mono">
              +{block.addedCount}
            </Badge>
          )}
          {block.removedCount > 0 && (
            <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30 font-mono">
              -{block.removedCount}
            </Badge>
          )}
          {block.modifiedCount > 0 && (
            <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30 font-mono">
              ~{block.modifiedCount}
            </Badge>
          )}
        </div>
      </button>

      {/* Diff lines */}
      {isExpanded && (
        <div className="border-l-2 border-muted ml-3">
          {block.lines.map((line, i) => (
            <DiffLineRenderer key={i} line={line} scans={scans} />
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * UnifiedDiffView - Git-style unified diff visualization
 *
 * Shows changes in a familiar diff format with + for additions,
 * - for removals, and ~ for modifications. Hosts are shown as
 * collapsible sections.
 *
 * @example
 * ```tsx
 * const { data } = useMultiScanComparison([1, 2, 3])
 * return <UnifiedDiffView data={data} />
 * ```
 */
export function UnifiedDiffView({ data, className }: UnifiedDiffViewProps) {
  const { scans } = data
  const [showContext, setShowContext] = useState(false)
  const [copied, setCopied] = useState(false)

  // Generate diff blocks
  const diffBlocks = useMemo(() => {
    return generateDiffBlocks(data, showContext)
  }, [data, showContext])

  // Calculate totals
  const totals = useMemo(() => {
    return diffBlocks.reduce(
      (acc, block) => ({
        added: acc.added + block.addedCount,
        removed: acc.removed + block.removedCount,
        modified: acc.modified + block.modifiedCount,
      }),
      { added: 0, removed: 0, modified: 0 }
    )
  }, [diffBlocks])

  // Generate plain text diff for copying
  const generatePlainTextDiff = (): string => {
    const lines: string[] = []
    lines.push(formatScanRange(scans))
    lines.push('')

    for (const block of diffBlocks) {
      lines.push(`=== ${block.hostAddr} ===`)
      for (const line of block.lines) {
        let text = line.content
        if (line.type === 'added' && line.ttl !== undefined) {
          text += ` [NEW TTL:${line.ttl}]`
        } else if (line.type === 'removed') {
          text += ' [REMOVED]'
        } else if (line.type === 'modified') {
          text += ' [MODIFIED]'
        }
        lines.push(text)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  // Copy diff to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatePlainTextDiff())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      console.error('Failed to copy to clipboard')
    }
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 bg-muted/20 border-b border-border">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">{formatScanRange(scans)}</span>
          <div className="flex gap-2">
            <Badge variant="outline" className="font-mono text-xs bg-success/10 text-success border-success/30">
              +{totals.added}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs bg-destructive/10 text-destructive border-destructive/30">
              -{totals.removed}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs bg-warning/10 text-warning border-warning/30">
              ~{totals.modified}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Context toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="show-context"
              checked={showContext}
              onCheckedChange={setShowContext}
            />
            <Label htmlFor="show-context" className="text-xs text-muted-foreground cursor-pointer">
              {showContext ? <Eye className="h-3.5 w-3.5 inline mr-1" /> : <EyeOff className="h-3.5 w-3.5 inline mr-1" />}
              Context
            </Label>
          </div>

          {/* Copy button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-7 text-xs"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 mr-1" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto bg-surface">
        {diffBlocks.length > 0 ? (
          <div>
            {diffBlocks.map((block) => (
              <HostBlock
                key={block.hostAddr}
                block={block}
                scans={scans}
                defaultExpanded={diffBlocks.length <= 10}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
            <div className="font-mono text-lg mb-2">No changes detected</div>
            <p className="text-sm">All hosts and ports remained the same across scans</p>
          </div>
        )}
      </div>
    </div>
  )
}
