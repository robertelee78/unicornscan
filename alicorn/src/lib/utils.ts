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
 * Format a Unix timestamp to a human-readable date string
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

/**
 * Format a Unix timestamp to a relative time string (e.g., "2 hours ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000
  const diff = now - timestamp

  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return formatTimestamp(timestamp)
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
