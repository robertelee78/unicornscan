import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind classes with clsx
 * Handles conflicts properly (e.g., "p-2 p-4" becomes "p-4")
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse a timestamp value that may be either:
 * - Unix timestamp in seconds (number)
 * - ISO 8601 string from PostgreSQL timestamptz
 * Returns Unix timestamp in seconds
 */
export function parseTimestamp(timestamp: number | string): number {
  if (typeof timestamp === 'string') {
    // ISO 8601 string from PostgreSQL timestamptz
    const date = new Date(timestamp)
    return Math.floor(date.getTime() / 1000)
  }
  // Already a Unix timestamp in seconds
  return timestamp
}

/**
 * Format a timestamp to a human-readable date string
 * Accepts Unix timestamp (seconds) or ISO 8601 string
 */
export function formatTimestamp(timestamp: number | string): string {
  const unixSeconds = parseTimestamp(timestamp)
  return new Date(unixSeconds * 1000).toLocaleString()
}

/**
 * Format a timestamp to a relative time string (e.g., "2 hours ago")
 * Accepts Unix timestamp (seconds) or ISO 8601 string
 */
export function formatRelativeTime(timestamp: number | string): string {
  const unixSeconds = parseTimestamp(timestamp)
  const now = Date.now() / 1000
  const diff = now - unixSeconds

  if (diff < 0) return 'just now' // Future timestamp edge case
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return formatTimestamp(unixSeconds)
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Format IP address for display
 */
export function formatIP(ip: string): string {
  return ip
}

// =============================================================================
// Port Utilities
// Re-export from ports feature for backward compatibility
// =============================================================================

// Import from the comprehensive ports database
import { getServiceName as _getServiceName } from '@/features/ports/well-known-ports'

/**
 * Get well-known port name (hint only - actual service may differ)
 */
export function getPortName(port: number): string | undefined {
  const name = _getServiceName(port)
  // Return undefined if it's just "port-N" (unknown)
  return name.startsWith('port-') ? undefined : name
}

/**
 * Format port with optional service name hint
 */
export function formatPort(port: number): string {
  const name = getPortName(port)
  return name ? `${port}/${name}` : `${port}`
}
