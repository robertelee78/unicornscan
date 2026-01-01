/**
 * Unit tests for src/features/ports/well-known-ports.ts
 * Tests port to service name mappings
 */

import { describe, it, expect } from 'vitest'
import {
  WELL_KNOWN_PORTS,
  getServiceName,
  getPortInfo,
  getCategoryColor,
  isDangerousPort,
  type PortEntry,
} from '@/features/ports/well-known-ports'

describe('WELL_KNOWN_PORTS', () => {
  it('contains common system ports', () => {
    expect(WELL_KNOWN_PORTS[22]).toBeDefined()
    expect(WELL_KNOWN_PORTS[22].name).toBe('ssh')

    expect(WELL_KNOWN_PORTS[80]).toBeDefined()
    expect(WELL_KNOWN_PORTS[80].name).toBe('http')

    expect(WELL_KNOWN_PORTS[443]).toBeDefined()
    expect(WELL_KNOWN_PORTS[443].name).toBe('https')
  })

  it('contains database ports', () => {
    expect(WELL_KNOWN_PORTS[3306]).toBeDefined()
    expect(WELL_KNOWN_PORTS[3306].name).toBe('mysql')

    expect(WELL_KNOWN_PORTS[5432]).toBeDefined()
    expect(WELL_KNOWN_PORTS[5432].name).toBe('postgresql')

    expect(WELL_KNOWN_PORTS[27017]).toBeDefined()
    expect(WELL_KNOWN_PORTS[27017].name).toBe('mongodb')
  })

  it('contains mail ports', () => {
    expect(WELL_KNOWN_PORTS[25]).toBeDefined()
    expect(WELL_KNOWN_PORTS[25].name).toBe('smtp')

    expect(WELL_KNOWN_PORTS[143]).toBeDefined()
    expect(WELL_KNOWN_PORTS[143].name).toBe('imap')

    expect(WELL_KNOWN_PORTS[110]).toBeDefined()
    expect(WELL_KNOWN_PORTS[110].name).toBe('pop3')
  })

  it('contains file transfer ports', () => {
    expect(WELL_KNOWN_PORTS[21]).toBeDefined()
    expect(WELL_KNOWN_PORTS[21].name).toBe('ftp')
  })

  it('has complete PortEntry structure', () => {
    const entry = WELL_KNOWN_PORTS[80]
    expect(entry).toHaveProperty('name')
    expect(entry).toHaveProperty('description')
    expect(entry).toHaveProperty('category')
    expect(typeof entry.name).toBe('string')
    expect(typeof entry.description).toBe('string')
  })

  it('uses valid categories', () => {
    const validCategories: PortEntry['category'][] = [
      'system',
      'database',
      'web',
      'mail',
      'file',
      'remote',
      'security',
      'network',
      'messaging',
      'other',
    ]

    Object.values(WELL_KNOWN_PORTS).forEach((entry) => {
      expect(validCategories).toContain(entry.category)
    })
  })
})

describe('getServiceName', () => {
  it('returns service name for known ports', () => {
    expect(getServiceName(22)).toBe('ssh')
    expect(getServiceName(80)).toBe('http')
    expect(getServiceName(443)).toBe('https')
    expect(getServiceName(3306)).toBe('mysql')
  })

  it('returns port-N format for unknown ports', () => {
    expect(getServiceName(12345)).toBe('port-12345')
    expect(getServiceName(54321)).toBe('port-54321')
    expect(getServiceName(99999)).toBe('port-99999')
  })

  it('handles edge cases', () => {
    expect(getServiceName(0)).toBe('port-0')
    expect(getServiceName(-1)).toBe('port--1')
    expect(getServiceName(65535)).toBe('port-65535')
  })
})

describe('getPortInfo', () => {
  it('returns port info for known ports', () => {
    const sshInfo = getPortInfo(22)
    expect(sshInfo).toBeDefined()
    expect(sshInfo?.name).toBe('ssh')
    expect(sshInfo?.description).toBe('Secure Shell')
    expect(sshInfo?.category).toBe('remote')

    const httpInfo = getPortInfo(80)
    expect(httpInfo).toBeDefined()
    expect(httpInfo?.name).toBe('http')
    expect(httpInfo?.description).toBe('Hypertext Transfer Protocol')
    expect(httpInfo?.category).toBe('web')
  })

  it('returns undefined for unknown ports', () => {
    expect(getPortInfo(12345)).toBeUndefined()
    expect(getPortInfo(99999)).toBeUndefined()
  })

  it('returns complete PortEntry object', () => {
    const info = getPortInfo(443)
    expect(info).toEqual({
      name: 'https',
      description: 'HTTP Secure',
      category: 'web',
    })
  })
})

describe('getCategoryColor', () => {
  it('returns correct color for web category', () => {
    expect(getCategoryColor('web')).toBe('text-blue-500')
  })

  it('returns correct color for database category', () => {
    expect(getCategoryColor('database')).toBe('text-purple-500')
  })

  it('returns correct color for mail category', () => {
    expect(getCategoryColor('mail')).toBe('text-amber-500')
  })

  it('returns correct color for file category', () => {
    expect(getCategoryColor('file')).toBe('text-green-500')
  })

  it('returns correct color for remote category', () => {
    expect(getCategoryColor('remote')).toBe('text-red-500')
  })

  it('returns correct color for security category', () => {
    expect(getCategoryColor('security')).toBe('text-cyan-500')
  })

  it('returns correct color for network category', () => {
    expect(getCategoryColor('network')).toBe('text-slate-500')
  })

  it('returns correct color for messaging category', () => {
    expect(getCategoryColor('messaging')).toBe('text-pink-500')
  })

  it('returns correct color for system category', () => {
    expect(getCategoryColor('system')).toBe('text-gray-500')
  })

  it('returns muted color for other/default category', () => {
    expect(getCategoryColor('other')).toBe('text-muted')
  })
})

describe('isDangerousPort', () => {
  it('identifies common dangerous ports', () => {
    expect(isDangerousPort(21)).toBe(true)  // FTP
    expect(isDangerousPort(22)).toBe(true)  // SSH
    expect(isDangerousPort(23)).toBe(true)  // Telnet
    expect(isDangerousPort(25)).toBe(true)  // SMTP
    expect(isDangerousPort(3389)).toBe(true)  // RDP
    expect(isDangerousPort(5900)).toBe(true)  // VNC
  })

  it('identifies Windows networking ports as dangerous', () => {
    expect(isDangerousPort(135)).toBe(true)
    expect(isDangerousPort(137)).toBe(true)
    expect(isDangerousPort(138)).toBe(true)
    expect(isDangerousPort(139)).toBe(true)
    expect(isDangerousPort(445)).toBe(true)
  })

  it('identifies BSD r-services as dangerous', () => {
    expect(isDangerousPort(512)).toBe(true)
    expect(isDangerousPort(513)).toBe(true)
    expect(isDangerousPort(514)).toBe(true)
  })

  it('identifies database ports as dangerous', () => {
    expect(isDangerousPort(1433)).toBe(true)  // MSSQL
    expect(isDangerousPort(1521)).toBe(true)  // Oracle
  })

  it('returns false for safe ports', () => {
    expect(isDangerousPort(80)).toBe(false)   // HTTP
    expect(isDangerousPort(443)).toBe(false)  // HTTPS
    expect(isDangerousPort(8080)).toBe(false) // HTTP alt
    expect(isDangerousPort(3306)).toBe(false) // MySQL (not in list)
    expect(isDangerousPort(5432)).toBe(false) // PostgreSQL (not in list)
  })

  it('returns false for unknown ports', () => {
    expect(isDangerousPort(12345)).toBe(false)
    expect(isDangerousPort(65535)).toBe(false)
  })
})

describe('port categories by type', () => {
  it('web ports are categorized as web', () => {
    expect(getPortInfo(80)?.category).toBe('web')
    expect(getPortInfo(443)?.category).toBe('web')
    expect(getPortInfo(8080)?.category).toBe('web')
  })

  it('database ports are categorized as database', () => {
    expect(getPortInfo(3306)?.category).toBe('database')
    expect(getPortInfo(5432)?.category).toBe('database')
    expect(getPortInfo(6379)?.category).toBe('database')
  })

  it('remote access ports are categorized as remote', () => {
    expect(getPortInfo(22)?.category).toBe('remote')
    expect(getPortInfo(23)?.category).toBe('remote')
    expect(getPortInfo(3389)?.category).toBe('remote')
  })

  it('mail ports are categorized as mail', () => {
    expect(getPortInfo(25)?.category).toBe('mail')
    expect(getPortInfo(110)?.category).toBe('mail')
    expect(getPortInfo(143)?.category).toBe('mail')
  })
})
