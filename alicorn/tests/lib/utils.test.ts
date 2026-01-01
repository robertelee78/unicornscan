/**
 * Unit tests for src/lib/utils.ts
 * Tests pure utility functions for formatting and display
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cn,
  formatTimestamp,
  formatRelativeTime,
  formatBytes,
  formatIP,
  getPortName,
  formatPort,
} from '@/lib/utils'

describe('cn (class name merger)', () => {
  it('merges simple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    const isActive = true
    const isInactive = false
    expect(cn('base', isActive && 'active', isInactive && 'inactive')).toBe('base active')
  })

  it('handles arrays of classes', () => {
    expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz')
  })

  it('handles objects with boolean values', () => {
    expect(cn({ active: true, disabled: false })).toBe('active')
  })

  it('resolves Tailwind conflicts - last wins', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500')
    expect(cn('text-sm', 'text-lg')).toBe('text-lg')
  })

  it('handles undefined and null', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })

  it('handles empty inputs', () => {
    expect(cn()).toBe('')
    expect(cn('')).toBe('')
  })
})

describe('formatTimestamp', () => {
  it('converts Unix timestamp to locale string', () => {
    // Use a fixed timestamp: 2025-01-15 12:00:00 UTC
    const timestamp = 1736942400
    const result = formatTimestamp(timestamp)
    // Result should contain date parts (format varies by locale)
    expect(result).toMatch(/\d/)
  })

  it('handles zero timestamp (Unix epoch)', () => {
    const result = formatTimestamp(0)
    // Unix epoch Jan 1, 1970 UTC - may show as 12/31/1969 in western timezones
    expect(result).toMatch(/1969|1970/)
  })

  it('handles current timestamps', () => {
    const now = Math.floor(Date.now() / 1000)
    const result = formatTimestamp(now)
    expect(result).toMatch(/\d/)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('formatRelativeTime', () => {
  let realDateNow: () => number

  beforeEach(() => {
    realDateNow = Date.now
  })

  afterEach(() => {
    Date.now = realDateNow
  })

  it('returns "just now" for timestamps within 60 seconds', () => {
    const now = 1700000000000 // Fixed timestamp in ms
    Date.now = vi.fn(() => now)

    expect(formatRelativeTime(1700000000 - 30)).toBe('just now')
    expect(formatRelativeTime(1700000000 - 59)).toBe('just now')
  })

  it('returns minutes for timestamps within an hour', () => {
    const now = 1700000000000
    Date.now = vi.fn(() => now)

    expect(formatRelativeTime(1700000000 - 60)).toBe('1m ago')
    expect(formatRelativeTime(1700000000 - 120)).toBe('2m ago')
    expect(formatRelativeTime(1700000000 - 3599)).toBe('59m ago')
  })

  it('returns hours for timestamps within a day', () => {
    const now = 1700000000000
    Date.now = vi.fn(() => now)

    expect(formatRelativeTime(1700000000 - 3600)).toBe('1h ago')
    expect(formatRelativeTime(1700000000 - 7200)).toBe('2h ago')
    expect(formatRelativeTime(1700000000 - 86399)).toBe('23h ago')
  })

  it('returns days for timestamps within a week', () => {
    const now = 1700000000000
    Date.now = vi.fn(() => now)

    expect(formatRelativeTime(1700000000 - 86400)).toBe('1d ago')
    expect(formatRelativeTime(1700000000 - 172800)).toBe('2d ago')
    expect(formatRelativeTime(1700000000 - 604799)).toBe('6d ago')
  })

  it('returns formatted date for timestamps older than a week', () => {
    const now = 1700000000000
    Date.now = vi.fn(() => now)

    const oldTimestamp = 1700000000 - 604800 // Exactly 7 days
    const result = formatRelativeTime(oldTimestamp)
    // Should fall back to formatTimestamp, which includes digits
    expect(result).toMatch(/\d/)
  })
})

describe('formatBytes', () => {
  it('returns "0 B" for zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('formats bytes correctly', () => {
    expect(formatBytes(100)).toBe('100 B')
    expect(formatBytes(999)).toBe('999 B')
  })

  it('formats kilobytes correctly', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(10240)).toBe('10 KB')
  })

  it('formats megabytes correctly', () => {
    expect(formatBytes(1048576)).toBe('1 MB')
    expect(formatBytes(1572864)).toBe('1.5 MB')
    expect(formatBytes(10485760)).toBe('10 MB')
  })

  it('formats gigabytes correctly', () => {
    expect(formatBytes(1073741824)).toBe('1 GB')
    expect(formatBytes(1610612736)).toBe('1.5 GB')
  })

  it('formats terabytes correctly', () => {
    expect(formatBytes(1099511627776)).toBe('1 TB')
  })

  it('rounds to 2 decimal places', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1126)).toBe('1.1 KB')
    expect(formatBytes(1229)).toBe('1.2 KB')
  })
})

describe('formatIP', () => {
  it('returns the IP as-is', () => {
    expect(formatIP('192.168.1.1')).toBe('192.168.1.1')
    expect(formatIP('10.0.0.1')).toBe('10.0.0.1')
    expect(formatIP('::1')).toBe('::1')
    expect(formatIP('2001:db8::1')).toBe('2001:db8::1')
  })

  it('handles empty string', () => {
    expect(formatIP('')).toBe('')
  })
})

describe('getPortName', () => {
  it('returns service name for well-known ports', () => {
    expect(getPortName(22)).toBe('ssh')
    expect(getPortName(80)).toBe('http')
    expect(getPortName(443)).toBe('https')
    expect(getPortName(21)).toBe('ftp')
    expect(getPortName(25)).toBe('smtp')
  })

  it('returns undefined for unknown ports', () => {
    expect(getPortName(12345)).toBeUndefined()
    expect(getPortName(54321)).toBeUndefined()
    expect(getPortName(99999)).toBeUndefined()
  })

  it('handles edge cases', () => {
    expect(getPortName(0)).toBeUndefined()
    expect(getPortName(-1)).toBeUndefined()
  })
})

describe('formatPort', () => {
  it('formats well-known ports with service name', () => {
    expect(formatPort(22)).toBe('22/ssh')
    expect(formatPort(80)).toBe('80/http')
    expect(formatPort(443)).toBe('443/https')
  })

  it('formats unknown ports without service name', () => {
    expect(formatPort(12345)).toBe('12345')
    expect(formatPort(54321)).toBe('54321')
  })

  it('handles common service ports', () => {
    expect(formatPort(3306)).toBe('3306/mysql')
    expect(formatPort(5432)).toBe('5432/postgresql')
    expect(formatPort(6379)).toBe('6379/redis')
    expect(formatPort(27017)).toBe('27017/mongodb')
  })
})
