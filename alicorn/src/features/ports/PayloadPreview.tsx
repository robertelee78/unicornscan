/**
 * Payload preview component for -msf and -mU scan results
 * Shows banner/payload data received from service fingerprinting or UDP responses
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface PayloadPreviewProps {
  /** Raw payload bytes */
  data?: Uint8Array | null
  /** Decoded banner/text (if already parsed) */
  banner?: string | null
  /** Maximum bytes to show in collapsed view */
  previewBytes?: number
  /** Whether to show hex dump */
  showHex?: boolean
  /** Compact mode */
  compact?: boolean
  className?: string
}

/**
 * Convert bytes to printable ASCII, replacing non-printable with dots
 */
function bytesToAscii(data: Uint8Array, maxLen?: number): string {
  const len = maxLen ? Math.min(data.length, maxLen) : data.length
  let result = ''
  for (let i = 0; i < len; i++) {
    const byte = data[i]
    // Printable ASCII range: 32-126
    if (byte >= 32 && byte <= 126) {
      result += String.fromCharCode(byte)
    } else if (byte === 10) {
      result += '\n'
    } else if (byte === 13) {
      result += '' // Skip CR
    } else if (byte === 9) {
      result += '\t'
    } else {
      result += '.'
    }
  }
  return result
}

/**
 * Convert bytes to hex dump format
 */
function bytesToHexDump(data: Uint8Array, bytesPerLine: number = 16): string {
  const lines: string[] = []

  for (let offset = 0; offset < data.length; offset += bytesPerLine) {
    const chunk = data.slice(offset, offset + bytesPerLine)

    // Offset
    const offsetStr = offset.toString(16).padStart(8, '0')

    // Hex bytes
    const hexParts: string[] = []
    for (let i = 0; i < bytesPerLine; i++) {
      if (i < chunk.length) {
        hexParts.push(chunk[i].toString(16).padStart(2, '0'))
      } else {
        hexParts.push('  ')
      }
    }
    const hexStr = hexParts.join(' ')

    // ASCII representation
    const asciiStr = bytesToAscii(chunk)

    lines.push(`${offsetStr}  ${hexStr}  |${asciiStr}|`)
  }

  return lines.join('\n')
}

/**
 * Detect if payload looks like text (high ratio of printable chars)
 */
function looksLikeText(data: Uint8Array): boolean {
  if (data.length === 0) return false

  let printable = 0
  for (let i = 0; i < Math.min(data.length, 256); i++) {
    const byte = data[i]
    if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
      printable++
    }
  }

  return printable / Math.min(data.length, 256) > 0.8
}

/**
 * Display payload/banner data from service fingerprinting or UDP responses
 */
export function PayloadPreview({
  data,
  banner,
  previewBytes = 256,
  showHex = false,
  compact = false,
  className,
}: PayloadPreviewProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  // If we have a banner string, show that
  if (banner) {
    return (
      <div className={cn('space-y-1', className)}>
        {!compact && (
          <div className="text-xs text-muted-foreground font-medium">Banner</div>
        )}
        <pre className={cn(
          'font-mono text-xs bg-muted/50 p-2 rounded overflow-x-auto whitespace-pre-wrap',
          compact && 'p-1.5'
        )}>
          {banner}
        </pre>
      </div>
    )
  }

  // If no raw data, show placeholder
  if (!data || data.length === 0) {
    if (compact) return null
    return <span className="text-muted text-xs">No payload data</span>
  }

  const isText = looksLikeText(data)
  const truncated = data.length > previewBytes && !expanded
  const displayData = truncated ? data.slice(0, previewBytes) : data

  const handleCopy = async () => {
    const text = isText && !showHex
      ? bytesToAscii(data)
      : bytesToHexDump(data)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn('space-y-1', className)}>
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between text-xs">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span className="font-medium">
              Payload ({data.length} bytes)
            </span>
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3 w-3 text-success" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        </div>
      )}

      {/* Payload content */}
      <pre className={cn(
        'font-mono text-xs bg-muted/50 rounded overflow-x-auto',
        compact ? 'p-1.5 max-h-20' : 'p-2 max-h-64',
        'overflow-y-auto'
      )}>
        {showHex || !isText
          ? bytesToHexDump(displayData)
          : bytesToAscii(displayData)
        }
        {truncated && (
          <span className="text-muted-foreground">
            {'\n'}... ({data.length - previewBytes} more bytes)
          </span>
        )}
      </pre>
    </div>
  )
}

interface BannerLineProps {
  banner?: string | null
  maxLength?: number
  className?: string
}

/**
 * Single-line banner preview for table cells
 */
export function BannerLine({ banner, maxLength = 50, className }: BannerLineProps) {
  if (!banner) {
    return <span className="text-muted">—</span>
  }

  // Clean up banner for single-line display
  const cleaned = banner
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const truncated = cleaned.length > maxLength
  const display = truncated ? cleaned.slice(0, maxLength) + '…' : cleaned

  return (
    <span
      className={cn('font-mono text-xs', className)}
      title={banner}
    >
      {display}
    </span>
  )
}
