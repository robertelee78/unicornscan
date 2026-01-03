/**
 * Text highlighting component for search results
 * Highlights matching portions of text based on parsed search
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo } from 'react'
import type { ParsedSearch } from './types'

interface HighlightTextProps {
  text: string | null | undefined
  search: ParsedSearch | null
  className?: string
}

/**
 * Component that highlights matching portions of text based on a parsed search.
 * For regex/text searches, highlights the matched substring.
 * For other search types (port, CIDR, MAC), the text is shown as-is.
 */
export function HighlightText({ text, search, className = '' }: HighlightTextProps) {
  const parts = useMemo(() => {
    if (!text || !search) {
      return null
    }

    // Only highlight for text and regex search types
    if (search.type !== 'text' && search.type !== 'regex') {
      return null
    }

    if (!search.regex) {
      // Fallback: simple case-insensitive substring match
      const lowerText = text.toLowerCase()
      const lowerValue = search.value.toLowerCase()
      const index = lowerText.indexOf(lowerValue)

      if (index === -1) {
        return null
      }

      return {
        before: text.slice(0, index),
        match: text.slice(index, index + search.value.length),
        after: text.slice(index + search.value.length),
      }
    }

    // Use regex to find match
    const match = text.match(search.regex)
    if (!match || match.index === undefined) {
      return null
    }

    return {
      before: text.slice(0, match.index),
      match: match[0],
      after: text.slice(match.index + match[0].length),
    }
  }, [text, search])

  if (!text) {
    return <span className={`text-muted ${className}`}>—</span>
  }

  if (!parts) {
    return <span className={className}>{text}</span>
  }

  return (
    <span className={className}>
      {parts.before}
      <mark className="bg-yellow-500/30 text-inherit rounded px-0.5">
        {parts.match}
      </mark>
      {parts.after}
    </span>
  )
}

/**
 * Check if text matches a parsed search (for showing match indicators)
 */
export function textMatchesSearch(
  text: string | null | undefined,
  search: ParsedSearch | null
): boolean {
  if (!text || !search) return false

  if (search.type === 'text' || search.type === 'regex') {
    if (search.regex) {
      return search.regex.test(text)
    }
    return text.toLowerCase().includes(search.value.toLowerCase())
  }

  return false
}

/**
 * Get which field(s) matched for a host based on search type.
 * Used for showing "matched field" indicators.
 */
export type MatchedField = 'ip' | 'hostname' | 'mac' | 'os' | 'banner' | 'notes' | 'port' | 'cidr'

export function getMatchedFields(
  searchType: ParsedSearch['type'],
  matchInfo?: {
    ip?: boolean
    hostname?: boolean
    mac?: boolean
    os?: boolean
    banner?: boolean
    notes?: boolean
    port?: boolean
  }
): MatchedField[] {
  const fields: MatchedField[] = []

  switch (searchType) {
    case 'port':
      fields.push('port')
      break
    case 'cidr':
    case 'ip-prefix':
      fields.push('cidr')
      break
    case 'mac':
      fields.push('mac')
      break
    case 'text':
    case 'regex':
      // For text/regex, check which fields actually matched
      if (matchInfo?.ip) fields.push('ip')
      if (matchInfo?.hostname) fields.push('hostname')
      if (matchInfo?.mac) fields.push('mac')
      if (matchInfo?.os) fields.push('os')
      if (matchInfo?.banner) fields.push('banner')
      if (matchInfo?.notes) fields.push('notes')
      break
  }

  return fields
}

/**
 * Match indicator badge labels
 */
export const MATCHED_FIELD_LABELS: Record<MatchedField, string> = {
  ip: 'IP',
  hostname: 'Host',
  mac: 'MAC',
  os: 'OS',
  banner: 'Banner',
  notes: 'Notes',
  port: 'Port',
  cidr: 'Range',
}
