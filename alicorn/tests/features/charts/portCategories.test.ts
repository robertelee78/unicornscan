/**
 * Unit tests for port category utilities
 * Tests semantic grouping of ports by service category
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { describe, it, expect } from 'vitest'
import {
  PORT_CATEGORIES,
  getPortCategory,
  getCategoryConfig,
  getCategoryIcon,
  getCategoryColor,
  groupPortsByCategory,
  getAllCategories,
  isPortInCategory,
  getPortsForCategory,
} from '@/features/charts/portCategories'
import type { PortCategory, PortCategoryConfig } from '@/features/charts/types'

// =============================================================================
// PORT_CATEGORIES Constant Tests
// =============================================================================

describe('PORT_CATEGORIES constant', () => {
  it('should be an array of category configurations', () => {
    expect(PORT_CATEGORIES).toBeInstanceOf(Array)
    expect(PORT_CATEGORIES.length).toBeGreaterThan(0)
  })

  it('should contain required categories', () => {
    const categoryIds = PORT_CATEGORIES.map(c => c.id)

    expect(categoryIds).toContain('web')
    expect(categoryIds).toContain('database')
    expect(categoryIds).toContain('remote-access')
    expect(categoryIds).toContain('email')
    expect(categoryIds).toContain('file-transfer')
    expect(categoryIds).toContain('directory')
    expect(categoryIds).toContain('messaging')
    expect(categoryIds).toContain('monitoring')
    expect(categoryIds).toContain('other')
  })

  it('should have valid structure for each category', () => {
    for (const category of PORT_CATEGORIES) {
      expect(category.id).toBeDefined()
      expect(typeof category.id).toBe('string')
      expect(category.name).toBeDefined()
      expect(typeof category.name).toBe('string')
      expect(category.description).toBeDefined()
      expect(typeof category.description).toBe('string')
      expect(category.ports).toBeInstanceOf(Array)
      expect(category.icon).toBeDefined()
      expect(typeof category.icon).toBe('string')
      expect(category.color).toBeDefined()
      expect(typeof category.color).toBe('string')
      expect(typeof category.sortOrder).toBe('number')
    }
  })

  it('should have "other" category with empty ports array', () => {
    const otherCategory = PORT_CATEGORIES.find(c => c.id === 'other')
    expect(otherCategory).toBeDefined()
    expect(otherCategory!.ports).toEqual([])
    expect(otherCategory!.sortOrder).toBe(99)
  })

  it('should have unique sort orders for non-other categories', () => {
    const nonOtherCategories = PORT_CATEGORIES.filter(c => c.id !== 'other')
    const sortOrders = nonOtherCategories.map(c => c.sortOrder)
    const uniqueSortOrders = new Set(sortOrders)
    expect(uniqueSortOrders.size).toBe(sortOrders.length)
  })
})

// =============================================================================
// getPortCategory Tests
// =============================================================================

describe('getPortCategory', () => {
  describe('web services', () => {
    it('should return "web" for HTTP port 80', () => {
      expect(getPortCategory(80)).toBe('web')
    })

    it('should return "web" for HTTPS port 443', () => {
      expect(getPortCategory(443)).toBe('web')
    })

    it('should return "web" for common web ports', () => {
      const webPorts = [8080, 8443, 8000, 8888, 3000, 5000, 9000]
      for (const port of webPorts) {
        expect(getPortCategory(port)).toBe('web')
      }
    })
  })

  describe('database services', () => {
    it('should return "database" for MySQL port 3306', () => {
      expect(getPortCategory(3306)).toBe('database')
    })

    it('should return "database" for PostgreSQL port 5432', () => {
      expect(getPortCategory(5432)).toBe('database')
    })

    it('should return "database" for common database ports', () => {
      const dbPorts = [1433, 1521, 27017, 6379, 9200]
      for (const port of dbPorts) {
        expect(getPortCategory(port)).toBe('database')
      }
    })
  })

  describe('remote access services', () => {
    it('should return "remote-access" for SSH port 22', () => {
      expect(getPortCategory(22)).toBe('remote-access')
    })

    it('should return "remote-access" for RDP port 3389', () => {
      expect(getPortCategory(3389)).toBe('remote-access')
    })

    it('should return "remote-access" for Telnet port 23', () => {
      expect(getPortCategory(23)).toBe('remote-access')
    })

    it('should return "remote-access" for VNC ports', () => {
      expect(getPortCategory(5900)).toBe('remote-access')
      expect(getPortCategory(5901)).toBe('remote-access')
    })
  })

  describe('email services', () => {
    it('should return "email" for SMTP port 25', () => {
      expect(getPortCategory(25)).toBe('email')
    })

    it('should return "email" for common email ports', () => {
      const emailPorts = [110, 143, 465, 587, 993, 995]
      for (const port of emailPorts) {
        expect(getPortCategory(port)).toBe('email')
      }
    })
  })

  describe('file transfer services', () => {
    it('should return "file-transfer" for FTP port 21', () => {
      expect(getPortCategory(21)).toBe('file-transfer')
    })

    it('should return "file-transfer" for SMB port 445', () => {
      expect(getPortCategory(445)).toBe('file-transfer')
    })

    it('should return "file-transfer" for NFS port 2049', () => {
      expect(getPortCategory(2049)).toBe('file-transfer')
    })
  })

  describe('directory services', () => {
    it('should return "directory" for DNS port 53', () => {
      expect(getPortCategory(53)).toBe('directory')
    })

    it('should return "directory" for LDAP port 389', () => {
      expect(getPortCategory(389)).toBe('directory')
    })

    it('should return "directory" for Kerberos port 88', () => {
      expect(getPortCategory(88)).toBe('directory')
    })
  })

  describe('messaging services', () => {
    it('should return "messaging" for RabbitMQ port 5672', () => {
      expect(getPortCategory(5672)).toBe('messaging')
    })

    it('should return "messaging" for Kafka port 9092', () => {
      expect(getPortCategory(9092)).toBe('messaging')
    })

    it('should return "messaging" for MQTT port 1883', () => {
      expect(getPortCategory(1883)).toBe('messaging')
    })
  })

  describe('monitoring services', () => {
    it('should return "monitoring" for SNMP port 161', () => {
      expect(getPortCategory(161)).toBe('monitoring')
    })

    it('should return "monitoring" for Syslog port 514', () => {
      expect(getPortCategory(514)).toBe('monitoring')
    })
  })

  describe('uncategorized ports', () => {
    it('should return "other" for unknown ports', () => {
      expect(getPortCategory(12345)).toBe('other')
      expect(getPortCategory(54321)).toBe('other')
      expect(getPortCategory(1)).toBe('other')
      expect(getPortCategory(65535)).toBe('other')
    })

    it('should return "other" for port 0', () => {
      expect(getPortCategory(0)).toBe('other')
    })

    it('should return "other" for arbitrary high ports', () => {
      expect(getPortCategory(49152)).toBe('other')
      expect(getPortCategory(55555)).toBe('other')
    })
  })
})

// =============================================================================
// getCategoryConfig Tests
// =============================================================================

describe('getCategoryConfig', () => {
  it('should return correct config for "web" category', () => {
    const config = getCategoryConfig('web')

    expect(config.id).toBe('web')
    expect(config.name).toBe('Web Services')
    expect(config.ports).toContain(80)
    expect(config.ports).toContain(443)
    expect(config.icon).toBe('Globe')
    expect(config.sortOrder).toBe(1)
  })

  it('should return correct config for "database" category', () => {
    const config = getCategoryConfig('database')

    expect(config.id).toBe('database')
    expect(config.name).toBe('Databases')
    expect(config.ports).toContain(3306)
    expect(config.ports).toContain(5432)
    expect(config.icon).toBe('Database')
  })

  it('should return correct config for "other" category', () => {
    const config = getCategoryConfig('other')

    expect(config.id).toBe('other')
    expect(config.name).toBe('Other')
    expect(config.ports).toEqual([])
    expect(config.sortOrder).toBe(99)
  })

  it('should return "other" config for invalid category ID', () => {
    // TypeScript won't allow this normally, but test runtime behavior
    const config = getCategoryConfig('invalid-category' as PortCategory)

    expect(config.id).toBe('other')
  })

  it('should return all required properties', () => {
    const categories: PortCategory[] = [
      'web', 'database', 'remote-access', 'email',
      'file-transfer', 'directory', 'messaging', 'monitoring', 'other'
    ]

    for (const categoryId of categories) {
      const config = getCategoryConfig(categoryId)

      expect(config).toHaveProperty('id')
      expect(config).toHaveProperty('name')
      expect(config).toHaveProperty('description')
      expect(config).toHaveProperty('ports')
      expect(config).toHaveProperty('icon')
      expect(config).toHaveProperty('color')
      expect(config).toHaveProperty('sortOrder')
    }
  })
})

// =============================================================================
// getCategoryIcon Tests
// =============================================================================

describe('getCategoryIcon', () => {
  it('should return "Globe" for web category', () => {
    expect(getCategoryIcon('web')).toBe('Globe')
  })

  it('should return "Database" for database category', () => {
    expect(getCategoryIcon('database')).toBe('Database')
  })

  it('should return "Terminal" for remote-access category', () => {
    expect(getCategoryIcon('remote-access')).toBe('Terminal')
  })

  it('should return "Mail" for email category', () => {
    expect(getCategoryIcon('email')).toBe('Mail')
  })

  it('should return "FolderOpen" for file-transfer category', () => {
    expect(getCategoryIcon('file-transfer')).toBe('FolderOpen')
  })

  it('should return "Users" for directory category', () => {
    expect(getCategoryIcon('directory')).toBe('Users')
  })

  it('should return "MessageSquare" for messaging category', () => {
    expect(getCategoryIcon('messaging')).toBe('MessageSquare')
  })

  it('should return "Activity" for monitoring category', () => {
    expect(getCategoryIcon('monitoring')).toBe('Activity')
  })

  it('should return "CircleDot" for other category', () => {
    expect(getCategoryIcon('other')).toBe('CircleDot')
  })

  it('should return non-empty string for all categories', () => {
    const categories: PortCategory[] = [
      'web', 'database', 'remote-access', 'email',
      'file-transfer', 'directory', 'messaging', 'monitoring', 'other'
    ]

    for (const categoryId of categories) {
      const icon = getCategoryIcon(categoryId)
      expect(typeof icon).toBe('string')
      expect(icon.length).toBeGreaterThan(0)
    }
  })
})

// =============================================================================
// getCategoryColor Tests
// =============================================================================

describe('getCategoryColor', () => {
  it('should return CSS variable for web category', () => {
    const color = getCategoryColor('web')
    expect(color).toMatch(/^var\(--/)
  })

  it('should return CSS variable for all categories', () => {
    const categories: PortCategory[] = [
      'web', 'database', 'remote-access', 'email',
      'file-transfer', 'directory', 'messaging', 'monitoring', 'other'
    ]

    for (const categoryId of categories) {
      const color = getCategoryColor(categoryId)
      expect(color).toMatch(/^var\(--/)
    }
  })

  it('should return muted-foreground for other category', () => {
    const color = getCategoryColor('other')
    expect(color).toBe('var(--color-muted-foreground)')
  })
})

// =============================================================================
// groupPortsByCategory Tests
// =============================================================================

describe('groupPortsByCategory', () => {
  it('should handle empty array', () => {
    const result = groupPortsByCategory([])
    expect(result).toEqual([])
  })

  it('should group single port correctly', () => {
    const result = groupPortsByCategory([80])

    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('web')
    expect(result[0].ports).toEqual([80])
    expect(result[0].totalActivity).toBe(0)
  })

  it('should group multiple ports of same category', () => {
    const result = groupPortsByCategory([80, 443, 8080])

    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('web')
    expect(result[0].ports).toEqual([80, 443, 8080]) // Should be sorted
  })

  it('should group ports into multiple categories', () => {
    const result = groupPortsByCategory([80, 22, 3306])

    expect(result).toHaveLength(3)

    const categories = result.map(g => g.category)
    expect(categories).toContain('web')
    expect(categories).toContain('remote-access')
    expect(categories).toContain('database')
  })

  it('should sort groups by category sortOrder', () => {
    // Ports from different categories with known sort orders
    // web=1, database=2, remote-access=3
    const result = groupPortsByCategory([3306, 80, 22])

    expect(result[0].category).toBe('web')      // sortOrder: 1
    expect(result[1].category).toBe('database') // sortOrder: 2
    expect(result[2].category).toBe('remote-access') // sortOrder: 3
  })

  it('should sort ports within each group numerically', () => {
    const result = groupPortsByCategory([8080, 80, 443, 3000])

    expect(result[0].ports).toEqual([80, 443, 3000, 8080])
  })

  it('should put unknown ports in "other" category', () => {
    const result = groupPortsByCategory([12345, 54321])

    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('other')
    expect(result[0].ports).toEqual([12345, 54321])
  })

  it('should handle mixed known and unknown ports', () => {
    const result = groupPortsByCategory([80, 12345, 22])

    expect(result).toHaveLength(3)

    const webGroup = result.find(g => g.category === 'web')
    const remoteGroup = result.find(g => g.category === 'remote-access')
    const otherGroup = result.find(g => g.category === 'other')

    expect(webGroup?.ports).toEqual([80])
    expect(remoteGroup?.ports).toEqual([22])
    expect(otherGroup?.ports).toEqual([12345])
  })

  it('should calculate totalActivity when activityMap provided', () => {
    const activityMap = new Map<number, number>([
      [80, 100],
      [443, 50],
      [8080, 25]
    ])

    const result = groupPortsByCategory([80, 443, 8080], activityMap)

    expect(result).toHaveLength(1)
    expect(result[0].totalActivity).toBe(175) // 100 + 50 + 25
  })

  it('should handle missing ports in activityMap', () => {
    const activityMap = new Map<number, number>([
      [80, 100]
    ])

    const result = groupPortsByCategory([80, 443], activityMap)

    expect(result[0].totalActivity).toBe(100) // Only port 80 has activity
  })

  it('should include config in each group', () => {
    const result = groupPortsByCategory([80, 22])

    for (const group of result) {
      expect(group.config).toBeDefined()
      expect(group.config.id).toBe(group.category)
      expect(group.config.name).toBeDefined()
      expect(group.config.icon).toBeDefined()
    }
  })

  it('should sort by activity when sortOrder is equal', () => {
    // This tests the secondary sort - if two groups had same sortOrder,
    // they would be sorted by total activity descending.
    // Since categories have unique sortOrders, this is edge case testing.
    const activityMap = new Map<number, number>([
      [80, 500],
      [22, 100]
    ])

    const result = groupPortsByCategory([80, 22], activityMap)

    // Primary sort by sortOrder, so web (1) comes before remote-access (3)
    expect(result[0].category).toBe('web')
    expect(result[0].totalActivity).toBe(500)
  })

  it('should handle duplicate ports', () => {
    const result = groupPortsByCategory([80, 80, 80])

    expect(result).toHaveLength(1)
    expect(result[0].ports).toEqual([80, 80, 80]) // Preserves duplicates
  })

  it('should handle large port arrays', () => {
    const ports = Array.from({ length: 100 }, (_, i) => i + 1)
    const result = groupPortsByCategory(ports)

    // Should complete without error
    expect(result.length).toBeGreaterThan(0)

    // All ports should be accounted for
    const totalPorts = result.reduce((sum, g) => sum + g.ports.length, 0)
    expect(totalPorts).toBe(100)
  })
})

// =============================================================================
// getAllCategories Tests
// =============================================================================

describe('getAllCategories', () => {
  it('should return all categories', () => {
    const categories = getAllCategories()

    expect(categories.length).toBe(PORT_CATEGORIES.length)
  })

  it('should return categories sorted by sortOrder', () => {
    const categories = getAllCategories()

    for (let i = 1; i < categories.length; i++) {
      expect(categories[i].sortOrder).toBeGreaterThanOrEqual(
        categories[i - 1].sortOrder
      )
    }
  })

  it('should have "other" category last', () => {
    const categories = getAllCategories()
    const lastCategory = categories[categories.length - 1]

    expect(lastCategory.id).toBe('other')
  })

  it('should return new array (not mutate original)', () => {
    const categories1 = getAllCategories()
    const categories2 = getAllCategories()

    expect(categories1).not.toBe(categories2)
    expect(categories1).not.toBe(PORT_CATEGORIES)
  })

  it('should have web category first', () => {
    const categories = getAllCategories()

    expect(categories[0].id).toBe('web')
    expect(categories[0].sortOrder).toBe(1)
  })
})

// =============================================================================
// isPortInCategory Tests
// =============================================================================

describe('isPortInCategory', () => {
  it('should return true for port in correct category', () => {
    expect(isPortInCategory(80, 'web')).toBe(true)
    expect(isPortInCategory(22, 'remote-access')).toBe(true)
    expect(isPortInCategory(3306, 'database')).toBe(true)
    expect(isPortInCategory(25, 'email')).toBe(true)
  })

  it('should return false for port in wrong category', () => {
    expect(isPortInCategory(80, 'database')).toBe(false)
    expect(isPortInCategory(22, 'web')).toBe(false)
    expect(isPortInCategory(3306, 'email')).toBe(false)
  })

  it('should return true for unknown port in "other" category', () => {
    expect(isPortInCategory(12345, 'other')).toBe(true)
    expect(isPortInCategory(54321, 'other')).toBe(true)
  })

  it('should return false for unknown port in specific category', () => {
    expect(isPortInCategory(12345, 'web')).toBe(false)
    expect(isPortInCategory(12345, 'database')).toBe(false)
  })

  it('should return false for known port in "other" category', () => {
    expect(isPortInCategory(80, 'other')).toBe(false)
    expect(isPortInCategory(22, 'other')).toBe(false)
  })
})

// =============================================================================
// getPortsForCategory Tests
// =============================================================================

describe('getPortsForCategory', () => {
  it('should return ports for web category', () => {
    const ports = getPortsForCategory('web')

    expect(ports).toContain(80)
    expect(ports).toContain(443)
    expect(ports.length).toBeGreaterThan(0)
  })

  it('should return ports for database category', () => {
    const ports = getPortsForCategory('database')

    expect(ports).toContain(3306)
    expect(ports).toContain(5432)
    expect(ports).toContain(27017)
  })

  it('should return empty array for "other" category', () => {
    const ports = getPortsForCategory('other')

    expect(ports).toEqual([])
  })

  it('should return new array (not mutate original)', () => {
    const ports1 = getPortsForCategory('web')
    const ports2 = getPortsForCategory('web')

    expect(ports1).not.toBe(ports2)

    // Mutating returned array should not affect subsequent calls
    ports1.push(99999)
    const ports3 = getPortsForCategory('web')
    expect(ports3).not.toContain(99999)
  })

  it('should return all category ports', () => {
    const categories: PortCategory[] = [
      'web', 'database', 'remote-access', 'email',
      'file-transfer', 'directory', 'messaging', 'monitoring'
    ]

    for (const categoryId of categories) {
      const ports = getPortsForCategory(categoryId)
      const config = getCategoryConfig(categoryId)

      expect(ports.length).toBe(config.ports.length)
      expect(ports.sort()).toEqual([...config.ports].sort())
    }
  })
})

// =============================================================================
// Edge Cases and Integration Tests
// =============================================================================

describe('edge cases', () => {
  it('should handle port 0', () => {
    expect(getPortCategory(0)).toBe('other')
    expect(isPortInCategory(0, 'other')).toBe(true)
  })

  it('should handle maximum port number', () => {
    expect(getPortCategory(65535)).toBe('other')
  })

  it('should handle negative port numbers gracefully', () => {
    // Negative ports are invalid but shouldn't crash
    expect(getPortCategory(-1)).toBe('other')
    expect(getPortCategory(-100)).toBe('other')
  })

  it('should be consistent between getPortCategory and isPortInCategory', () => {
    const testPorts = [0, 21, 22, 80, 443, 3306, 12345, 65535]

    for (const port of testPorts) {
      const category = getPortCategory(port)
      expect(isPortInCategory(port, category)).toBe(true)
    }
  })

  it('should have no port in multiple categories', () => {
    // Build a map of port to categories
    const portCategories = new Map<number, string[]>()

    for (const config of PORT_CATEGORIES) {
      for (const port of config.ports) {
        const categories = portCategories.get(port) || []
        categories.push(config.id)
        portCategories.set(port, categories)
      }
    }

    // Verify each port is in at most one category
    for (const [port, categories] of portCategories) {
      expect(categories.length).toBe(1)
      if (categories.length > 1) {
        throw new Error(`Port ${port} is in multiple categories: ${categories.join(', ')}`)
      }
    }
  })
})
