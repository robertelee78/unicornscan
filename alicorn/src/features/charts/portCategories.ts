/**
 * Port category utilities for enhanced heatmap visualization
 * Provides semantic grouping of ports by service category
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import type { PortCategory, PortCategoryConfig, GroupedPortData } from './types'

// =============================================================================
// Port Category Definitions
// =============================================================================

/**
 * Complete port category configurations
 * Includes well-known ports for each category with display metadata
 */
export const PORT_CATEGORIES: PortCategoryConfig[] = [
  {
    id: 'web',
    name: 'Web Services',
    description: 'HTTP, HTTPS, and web application servers',
    ports: [80, 443, 8080, 8443, 8000, 8888, 3000, 5000, 9000],
    icon: 'Globe',
    color: 'var(--color-chart-tcp)',
    sortOrder: 1,
  },
  {
    id: 'database',
    name: 'Databases',
    description: 'SQL and NoSQL database servers',
    ports: [3306, 5432, 1433, 1434, 1521, 27017, 27018, 6379, 9200, 5984, 7474, 8529],
    icon: 'Database',
    color: 'var(--color-palette-5)',
    sortOrder: 2,
  },
  {
    id: 'remote-access',
    name: 'Remote Access',
    description: 'SSH, RDP, VNC, and terminal services',
    ports: [22, 23, 3389, 5900, 5901, 5902, 2222],
    icon: 'Terminal',
    color: 'var(--color-success)',
    sortOrder: 3,
  },
  {
    id: 'email',
    name: 'Email',
    description: 'SMTP, POP3, IMAP mail servers',
    ports: [25, 110, 143, 465, 587, 993, 995],
    icon: 'Mail',
    color: 'var(--color-palette-9)',
    sortOrder: 4,
  },
  {
    id: 'file-transfer',
    name: 'File Transfer',
    description: 'FTP, SMB, NFS file sharing',
    ports: [21, 69, 137, 138, 139, 445, 2049, 873],
    icon: 'FolderOpen',
    color: 'var(--color-palette-3)',
    sortOrder: 5,
  },
  {
    id: 'directory',
    name: 'Directory Services',
    description: 'LDAP, Active Directory, DNS',
    ports: [53, 88, 389, 464, 636, 3268, 3269],
    icon: 'Users',
    color: 'var(--color-palette-10)',
    sortOrder: 6,
  },
  {
    id: 'messaging',
    name: 'Messaging & Queues',
    description: 'Message brokers and queue systems',
    ports: [5672, 5671, 9092, 2181, 61616, 1883, 8883],
    icon: 'MessageSquare',
    color: 'var(--color-palette-6)',
    sortOrder: 7,
  },
  {
    id: 'monitoring',
    name: 'Monitoring & Management',
    description: 'SNMP, Syslog, and monitoring tools',
    ports: [161, 162, 514, 111, 135, 6443, 9090, 9100, 8086],
    icon: 'Activity',
    color: 'var(--color-palette-7)',
    sortOrder: 8,
  },
  {
    id: 'other',
    name: 'Other',
    description: 'Uncategorized services',
    ports: [], // Dynamic - ports not in other categories
    icon: 'CircleDot',
    color: 'var(--color-muted-foreground)',
    sortOrder: 99,
  },
]

// =============================================================================
// Port-to-Category Lookup Map (for O(1) lookup)
// =============================================================================

/**
 * Pre-built map for fast port → category lookup
 * Built once at module load time
 */
const portToCategoryMap: Map<number, PortCategory> = new Map()

// Build the lookup map from category definitions
for (const category of PORT_CATEGORIES) {
  for (const port of category.ports) {
    portToCategoryMap.set(port, category.id)
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the category for a specific port
 * Returns 'other' for uncategorized ports
 */
export function getPortCategory(port: number): PortCategory {
  return portToCategoryMap.get(port) ?? 'other'
}

/**
 * Get the full category configuration by ID
 */
export function getCategoryConfig(categoryId: PortCategory): PortCategoryConfig {
  const config = PORT_CATEGORIES.find(c => c.id === categoryId)
  if (!config) {
    // Fallback to 'other' category
    return PORT_CATEGORIES.find(c => c.id === 'other')!
  }
  return config
}

/**
 * Get the Lucide icon name for a category
 */
export function getCategoryIcon(categoryId: PortCategory): string {
  const config = getCategoryConfig(categoryId)
  return config.icon
}

/**
 * Get the display color for a category
 */
export function getCategoryColor(categoryId: PortCategory): string {
  const config = getCategoryConfig(categoryId)
  return config.color
}

/**
 * Group an array of ports by their category
 * Returns grouped data sorted by category sortOrder
 *
 * @param ports - Array of port numbers to group
 * @param activityMap - Optional map of port→count for calculating totalActivity
 * @returns Array of GroupedPortData sorted by category priority
 */
export function groupPortsByCategory(
  ports: number[],
  activityMap?: Map<number, number>
): GroupedPortData[] {
  // Group ports by category
  const groups = new Map<PortCategory, number[]>()

  for (const port of ports) {
    const category = getPortCategory(port)
    const existing = groups.get(category) ?? []
    existing.push(port)
    groups.set(category, existing)
  }

  // Convert to GroupedPortData array
  const result: GroupedPortData[] = []

  for (const [categoryId, categoryPorts] of groups) {
    const config = getCategoryConfig(categoryId)

    // Calculate total activity if activityMap provided
    let totalActivity = 0
    if (activityMap) {
      for (const port of categoryPorts) {
        totalActivity += activityMap.get(port) ?? 0
      }
    }

    result.push({
      category: categoryId,
      config,
      ports: categoryPorts.sort((a, b) => a - b), // Sort ports numerically
      totalActivity,
    })
  }

  // Sort by category sortOrder (then by activity if equal)
  result.sort((a, b) => {
    if (a.config.sortOrder !== b.config.sortOrder) {
      return a.config.sortOrder - b.config.sortOrder
    }
    // If same sortOrder, sort by total activity (descending)
    return b.totalActivity - a.totalActivity
  })

  return result
}

/**
 * Get all category configurations sorted by sortOrder
 * Useful for rendering legends or filter controls
 */
export function getAllCategories(): PortCategoryConfig[] {
  return [...PORT_CATEGORIES].sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Check if a port belongs to a specific category
 */
export function isPortInCategory(port: number, categoryId: PortCategory): boolean {
  return getPortCategory(port) === categoryId
}

/**
 * Get all ports for a specific category
 * For 'other', returns empty array (dynamically determined)
 */
export function getPortsForCategory(categoryId: PortCategory): number[] {
  const config = getCategoryConfig(categoryId)
  return [...config.ports]
}
