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

/**
 * Get well-known port name
 */
const WELL_KNOWN_PORTS: Record<number, string> = {
  20: 'ftp-data',
  21: 'ftp',
  22: 'ssh',
  23: 'telnet',
  25: 'smtp',
  53: 'dns',
  67: 'dhcp',
  68: 'dhcp',
  69: 'tftp',
  80: 'http',
  110: 'pop3',
  111: 'rpc',
  119: 'nntp',
  123: 'ntp',
  135: 'msrpc',
  137: 'netbios-ns',
  138: 'netbios-dgm',
  139: 'netbios-ssn',
  143: 'imap',
  161: 'snmp',
  162: 'snmptrap',
  389: 'ldap',
  443: 'https',
  445: 'smb',
  465: 'smtps',
  514: 'syslog',
  515: 'printer',
  587: 'submission',
  631: 'ipp',
  636: 'ldaps',
  993: 'imaps',
  995: 'pop3s',
  1433: 'mssql',
  1521: 'oracle',
  3306: 'mysql',
  3389: 'rdp',
  5432: 'postgresql',
  5900: 'vnc',
  6379: 'redis',
  8080: 'http-alt',
  8443: 'https-alt',
  27017: 'mongodb',
}

export function getPortName(port: number): string | undefined {
  return WELL_KNOWN_PORTS[port]
}

/**
 * Format port with optional service name
 */
export function formatPort(port: number): string {
  const name = getPortName(port)
  return name ? `${port}/${name}` : `${port}`
}
