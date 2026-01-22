/**
 * Integration tests for host search feature
 * Tests the complete search flow including hooks and search utilities
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { describe, it, expect } from 'vitest'
import {
  parseSearch,
  matchesCIDR,
  matchesIPPrefix,
  matchesMAC,
  matchesBanner,
  matchesText,
} from '../../src/features/hosts/search-utils'
import type { Host } from '../../src/types/database'
import type { ParsedSearch } from '../../src/features/hosts/types'

// =============================================================================
// Mock Data
// =============================================================================

const mockHosts: Partial<Host>[] = [
  {
    host_addr: '192.168.1.1',
    ip_addr: '192.168.1.1',
    hostname: 'router.local',
    current_mac: '00:11:22:33:44:55',
    os_name: 'Linux',
    os_family: 'Linux',
    device_type: 'Router',
    port_count: 5,
    scan_count: 10,
    first_seen: '2025-01-01T00:00:00Z',
    last_seen: '2025-01-02T00:00:00Z',
  },
  {
    host_addr: '192.168.1.100',
    ip_addr: '192.168.1.100',
    hostname: 'webserver.local',
    current_mac: 'AA:BB:CC:DD:EE:FF',
    os_name: 'Ubuntu 22.04',
    os_family: 'Linux',
    device_type: 'Server',
    port_count: 3,
    scan_count: 15,
    first_seen: '2025-01-01T00:00:00Z',
    last_seen: '2025-01-02T00:00:00Z',
  },
  {
    host_addr: '10.0.0.1',
    ip_addr: '10.0.0.1',
    hostname: 'gateway.corp',
    current_mac: 'DE:AD:BE:EF:CA:FE',
    os_name: 'Cisco IOS',
    os_family: 'IOS',
    device_type: 'Gateway',
    port_count: 10,
    scan_count: 50,
    first_seen: '2024-12-01T00:00:00Z',
    last_seen: '2025-01-02T00:00:00Z',
  },
  {
    host_addr: '172.16.0.50',
    ip_addr: '172.16.0.50',
    hostname: null,
    current_mac: null,
    os_name: 'Windows Server 2019',
    os_family: 'Windows',
    device_type: 'Server',
    port_count: 8,
    scan_count: 20,
    first_seen: '2025-01-01T00:00:00Z',
    last_seen: '2025-01-02T00:00:00Z',
  },
]

const mockBannerIndex = new Map<string, string[]>([
  ['192.168.1.1', ['SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.1', 'HTTP/1.1 200 OK\nServer: Apache/2.4.52']],
  ['192.168.1.100', ['SSH-2.0-OpenSSH_8.4', 'HTTP/1.1 200 OK\nServer: nginx/1.18.0']],
  ['10.0.0.1', ['SSH-2.0-Cisco-1.25']],
  ['172.16.0.50', ['Microsoft-IIS/10.0', 'SMB/2.0']],
])

const mockNotesIndex = new Map<string, string[]>([
  ['192.168.1.1', ['Main router for office network', 'Firmware updated 2025-01']],
  ['192.168.1.100', ['Production web server', 'Runs Django application']],
  ['10.0.0.1', ['Corporate gateway to WAN']],
  ['172.16.0.50', ['File server for accounting department']],
])

const mockPortsIndex = new Map<string, number[]>([
  ['192.168.1.1', [22, 80, 443, 8080, 8443]],
  ['192.168.1.100', [22, 80, 443]],
  ['10.0.0.1', [22, 23, 80, 161, 443, 8443, 9000, 9001, 9002, 9003]],
  ['172.16.0.50', [80, 135, 139, 443, 445, 3389, 5985, 5986]],
])

// =============================================================================
// Host Matching Helper (mirrors hooks.ts logic)
// =============================================================================

function hostMatchesSearch(
  host: Partial<Host>,
  search: ParsedSearch,
  bannerIndex?: Map<string, string[]>,
  notesIndex?: Map<string, string[]>,
  portsIndex?: Map<string, number[]>
): boolean {
  const hostAddr = (host.ip_addr ?? host.host_addr) as string

  switch (search.type) {
    case 'port': {
      if (!portsIndex || !search.port) return false
      const hostPorts = portsIndex.get(hostAddr)
      return hostPorts ? hostPorts.includes(search.port) : false
    }

    case 'cidr':
      if (!search.cidr) return false
      return matchesCIDR(hostAddr, search.cidr)

    case 'ip-prefix':
      return matchesIPPrefix(hostAddr, search.value)

    case 'mac': {
      const mac = host.current_mac || host.mac_addr
      return matchesMAC(mac, search.value)
    }

    case 'regex': {
      if (!bannerIndex) return false
      const banners = bannerIndex.get(hostAddr) || []
      return banners.some(b => matchesBanner(b, search))
    }

    case 'text':
    default:
      if (matchesText(hostAddr, search)) return true
      if (matchesText(host.hostname, search)) return true
      if (matchesText(host.current_mac || host.mac_addr, search)) return true
      if (matchesText(host.os_name, search)) return true
      if (matchesText(host.os_family, search)) return true
      if (matchesText(host.device_type, search)) return true
      if (bannerIndex) {
        const hostBanners = bannerIndex.get(hostAddr) || []
        if (hostBanners.some(b => matchesBanner(b, search))) return true
      }
      if (notesIndex) {
        const hostNotes = notesIndex.get(hostAddr) || []
        if (hostNotes.some(n => matchesText(n, search))) return true
      }
      return false
  }
}

// =============================================================================
// Integration Tests
// =============================================================================

describe('Host Search Integration', () => {
  describe('Port Search', () => {
    it('should find hosts with specific port', () => {
      const search = parseSearch('22')
      expect(search.type).toBe('port')
      expect(search.port).toBe(22)

      const matches = mockHosts.filter(h =>
        hostMatchesSearch(h, search, undefined, undefined, mockPortsIndex)
      )
      expect(matches).toHaveLength(3) // 192.168.1.1, 192.168.1.100, 10.0.0.1
      expect(matches.map(h => h.host_addr)).toContain('192.168.1.1')
      expect(matches.map(h => h.host_addr)).toContain('192.168.1.100')
      expect(matches.map(h => h.host_addr)).toContain('10.0.0.1')
    })

    it('should find hosts with uncommon port', () => {
      const search = parseSearch('3389')
      const matches = mockHosts.filter(h =>
        hostMatchesSearch(h, search, undefined, undefined, mockPortsIndex)
      )
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('172.16.0.50')
    })

    it('should return empty for non-existent port', () => {
      const search = parseSearch('12345')
      const matches = mockHosts.filter(h =>
        hostMatchesSearch(h, search, undefined, undefined, mockPortsIndex)
      )
      expect(matches).toHaveLength(0)
    })
  })

  describe('CIDR Search', () => {
    it('should find hosts in /24 subnet', () => {
      const search = parseSearch('192.168.1.0/24')
      expect(search.type).toBe('cidr')
      expect(search.cidr).toBeDefined()

      const matches = mockHosts.filter(h => hostMatchesSearch(h, search))
      expect(matches).toHaveLength(2)
      expect(matches.map(h => h.host_addr)).toContain('192.168.1.1')
      expect(matches.map(h => h.host_addr)).toContain('192.168.1.100')
    })

    it('should find hosts in /8 network', () => {
      const search = parseSearch('10.0.0.0/8')
      const matches = mockHosts.filter(h => hostMatchesSearch(h, search))
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('10.0.0.1')
    })

    it('should find hosts in /16 network', () => {
      const search = parseSearch('172.16.0.0/16')
      const matches = mockHosts.filter(h => hostMatchesSearch(h, search))
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('172.16.0.50')
    })

    it('should find single host with /32', () => {
      const search = parseSearch('192.168.1.100/32')
      const matches = mockHosts.filter(h => hostMatchesSearch(h, search))
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('192.168.1.100')
    })

    it('should find all hosts with /0', () => {
      const search = parseSearch('0.0.0.0/0')
      const matches = mockHosts.filter(h => hostMatchesSearch(h, search))
      expect(matches).toHaveLength(4) // All hosts
    })
  })

  describe('IP Prefix Search', () => {
    it('should find hosts starting with prefix', () => {
      const search = parseSearch('192.168.')
      expect(search.type).toBe('ip-prefix')

      const matches = mockHosts.filter(h => hostMatchesSearch(h, search))
      expect(matches).toHaveLength(2)
      expect(matches.map(h => h.host_addr)).toContain('192.168.1.1')
      expect(matches.map(h => h.host_addr)).toContain('192.168.1.100')
    })

    it('should find hosts in more specific prefix', () => {
      const search = parseSearch('192.168.1.')
      const matches = mockHosts.filter(h => hostMatchesSearch(h, search))
      expect(matches).toHaveLength(2)
    })

    it('should find hosts in 10.x network', () => {
      const search = parseSearch('10.')
      const matches = mockHosts.filter(h => hostMatchesSearch(h, search))
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('10.0.0.1')
    })
  })

  describe('MAC Address Search', () => {
    it('should find host by full MAC address', () => {
      const search = parseSearch('00:11:22:33:44:55')
      expect(search.type).toBe('mac')

      const matches = mockHosts.filter(h => hostMatchesSearch(h, search))
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('192.168.1.1')
    })

    it('should find host by MAC with dashes', () => {
      const search = parseSearch('AA-BB-CC-DD-EE-FF')
      const matches = mockHosts.filter(h => hostMatchesSearch(h, search))
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('192.168.1.100')
    })

    it('should find host by partial MAC (OUI prefix)', () => {
      const search = parseSearch('DE:AD:BE')
      const matches = mockHosts.filter(h => hostMatchesSearch(h, search))
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('10.0.0.1')
    })

    it('should be case-insensitive', () => {
      const search = parseSearch('de:ad:be:ef:ca:fe')
      const matches = mockHosts.filter(h => hostMatchesSearch(h, search))
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('10.0.0.1')
    })
  })

  describe('Regex Search (Banners)', () => {
    it('should find hosts with Apache banner', () => {
      const search = parseSearch('/Apache/')
      expect(search.type).toBe('regex')
      expect(search.regex).not.toBeNull()

      const matches = mockHosts.filter(h =>
        hostMatchesSearch(h, search, mockBannerIndex)
      )
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('192.168.1.1')
    })

    it('should find hosts with nginx banner (case insensitive)', () => {
      const search = parseSearch('/nginx/i')
      const matches = mockHosts.filter(h =>
        hostMatchesSearch(h, search, mockBannerIndex)
      )
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('192.168.1.100')
    })

    it('should find hosts with SSH banner using tilde syntax', () => {
      const search = parseSearch('~SSH-2\\.0')
      const matches = mockHosts.filter(h =>
        hostMatchesSearch(h, search, mockBannerIndex)
      )
      expect(matches).toHaveLength(3) // All have SSH except Windows
    })

    it('should find hosts with Cisco banner', () => {
      const search = parseSearch('/Cisco/i')
      const matches = mockHosts.filter(h =>
        hostMatchesSearch(h, search, mockBannerIndex)
      )
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('10.0.0.1')
    })

    it('should find hosts with IIS banner', () => {
      const search = parseSearch('/IIS/')
      const matches = mockHosts.filter(h =>
        hostMatchesSearch(h, search, mockBannerIndex)
      )
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('172.16.0.50')
    })
  })

  describe('Text Search', () => {
    it('should find hosts by hostname', () => {
      const search = parseSearch('webserver')
      expect(search.type).toBe('text')

      const matches = mockHosts.filter(h =>
        hostMatchesSearch(h, search, mockBannerIndex, mockNotesIndex)
      )
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('192.168.1.100')
    })

    it('should find hosts by OS name', () => {
      const search = parseSearch('Ubuntu')
      const matches = mockHosts.filter(h =>
        hostMatchesSearch(h, search, mockBannerIndex, mockNotesIndex)
      )
      // Finds 2: one with Ubuntu OS, one with Ubuntu in SSH banner
      expect(matches).toHaveLength(2)
      expect(matches.map(h => h.host_addr)).toContain('192.168.1.100') // OS: Ubuntu 22.04
      expect(matches.map(h => h.host_addr)).toContain('192.168.1.1')   // Banner: Ubuntu-3ubuntu0.1
    })

    it('should find hosts by device type', () => {
      const search = parseSearch('Router')
      const matches = mockHosts.filter(h =>
        hostMatchesSearch(h, search, mockBannerIndex, mockNotesIndex)
      )
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('192.168.1.1')
    })

    it('should find hosts by banner content', () => {
      const search = parseSearch('OpenSSH')
      const matches = mockHosts.filter(h =>
        hostMatchesSearch(h, search, mockBannerIndex, mockNotesIndex)
      )
      expect(matches).toHaveLength(2) // 192.168.1.1 and 192.168.1.100
    })

    it('should find hosts by notes content', () => {
      const search = parseSearch('Django')
      const matches = mockHosts.filter(h =>
        hostMatchesSearch(h, search, mockBannerIndex, mockNotesIndex)
      )
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('192.168.1.100')
    })

    it('should find hosts by partial IP address', () => {
      const search = parseSearch('168.1.100')
      const matches = mockHosts.filter(h =>
        hostMatchesSearch(h, search, mockBannerIndex, mockNotesIndex)
      )
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('192.168.1.100')
    })

    it('should be case-insensitive', () => {
      const search = parseSearch('CISCO')
      const matches = mockHosts.filter(h =>
        hostMatchesSearch(h, search, mockBannerIndex, mockNotesIndex)
      )
      // Should match the OS name "Cisco IOS"
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('10.0.0.1')
    })

    it('should find hosts by Windows OS', () => {
      const search = parseSearch('Windows')
      const matches = mockHosts.filter(h =>
        hostMatchesSearch(h, search, mockBannerIndex, mockNotesIndex)
      )
      expect(matches).toHaveLength(1)
      expect(matches[0].host_addr).toBe('172.16.0.50')
    })
  })

  describe('Edge Cases', () => {
    it('should handle hosts with null fields', () => {
      const host: Partial<Host> = {
        host_addr: '1.2.3.4',
        ip_addr: '1.2.3.4',
        hostname: null,
        current_mac: null,
        os_name: null,
      }
      const search = parseSearch('test')
      // Should not throw
      expect(() => hostMatchesSearch(host, search)).not.toThrow()
      expect(hostMatchesSearch(host, search)).toBe(false)
    })

    it('should handle empty search gracefully', () => {
      const search = parseSearch('')
      expect(search.type).toBe('text')
      expect(search.value).toBe('')
    })

    it('should handle whitespace-only search', () => {
      const search = parseSearch('   ')
      expect(search.type).toBe('text')
      expect(search.value).toBe('')
    })

    it('should not match without required indexes', () => {
      // Port search without port index
      const portSearch = parseSearch('22')
      expect(hostMatchesSearch(mockHosts[0], portSearch)).toBe(false)

      // Regex search without banner index
      const regexSearch = parseSearch('/Apache/')
      expect(hostMatchesSearch(mockHosts[0], regexSearch)).toBe(false)
    })
  })

  describe('Search Type Detection Priority', () => {
    it('should prioritize port over MAC for 6-digit numbers', () => {
      // 001122 could be MAC OUI prefix but 1122 is valid port
      const search = parseSearch('001122')
      expect(search.type).toBe('port')
      expect(search.port).toBe(1122)
    })

    it('should detect MAC when separators present', () => {
      const search = parseSearch('00:11:22')
      expect(search.type).toBe('mac')
    })

    it('should detect CIDR over text', () => {
      const search = parseSearch('192.168.1.0/24')
      expect(search.type).toBe('cidr')
    })

    it('should detect IP prefix over text', () => {
      const search = parseSearch('192.168.')
      expect(search.type).toBe('ip-prefix')
    })

    it('should detect regex over text', () => {
      const search = parseSearch('/pattern/')
      expect(search.type).toBe('regex')
    })
  })

  describe('Combined Filtering Scenarios', () => {
    it('should find Linux servers in 192.168.x network', () => {
      // First filter by CIDR
      const cidrSearch = parseSearch('192.168.0.0/16')
      const cidrMatches = mockHosts.filter(h => hostMatchesSearch(h, cidrSearch))
      expect(cidrMatches).toHaveLength(2)

      // Then filter by OS (simulating combined filter)
      const linuxHosts = cidrMatches.filter(h =>
        h.os_family?.toLowerCase().includes('linux')
      )
      expect(linuxHosts).toHaveLength(2)
    })

    it('should find hosts with port 443 and nginx', () => {
      // Filter by port
      const portSearch = parseSearch('443')
      const portMatches = mockHosts.filter(h =>
        hostMatchesSearch(h, portSearch, undefined, undefined, mockPortsIndex)
      )
      expect(portMatches).toHaveLength(4)

      // Filter by nginx in banners
      const nginxMatches = portMatches.filter(h => {
        const hostAddr = h.ip_addr ?? h.host_addr
        const banners = mockBannerIndex.get(hostAddr as string) || []
        return banners.some(b => b.toLowerCase().includes('nginx'))
      })
      expect(nginxMatches).toHaveLength(1)
      expect(nginxMatches[0].host_addr).toBe('192.168.1.100')
    })
  })
})

// =============================================================================
// Performance Tests
// =============================================================================

describe('Search Performance', () => {
  // Generate large mock dataset
  const generateLargeDataset = (count: number): Partial<Host>[] => {
    const hosts: Partial<Host>[] = []
    for (let i = 0; i < count; i++) {
      const octets = [
        Math.floor(i / (256 * 256 * 256)) % 256,
        Math.floor(i / (256 * 256)) % 256,
        Math.floor(i / 256) % 256,
        i % 256,
      ]
      hosts.push({
        host_addr: octets.join('.'),
        ip_addr: octets.join('.'),
        hostname: i % 10 === 0 ? `host-${i}.local` : null,
        current_mac: i % 5 === 0 ? `00:11:22:${(i >> 8).toString(16).padStart(2, '0')}:${(i & 0xff).toString(16).padStart(2, '0')}:00` : null,
        os_name: i % 3 === 0 ? 'Linux' : i % 3 === 1 ? 'Windows' : 'macOS',
      })
    }
    return hosts
  }

  it('should handle CIDR filtering on 1000 hosts efficiently', () => {
    const largeDataset = generateLargeDataset(1000)
    const search = parseSearch('0.0.0.0/24')

    const start = performance.now()
    const matches = largeDataset.filter(h => hostMatchesSearch(h, search))
    const elapsed = performance.now() - start

    expect(matches.length).toBe(256) // /24 = 256 IPs
    expect(elapsed).toBeLessThan(100) // Should complete in under 100ms
  })

  it('should handle text search on 1000 hosts efficiently', () => {
    const largeDataset = generateLargeDataset(1000)
    const search = parseSearch('Linux')

    const start = performance.now()
    const matches = largeDataset.filter(h => hostMatchesSearch(h, search))
    const elapsed = performance.now() - start

    expect(matches.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(100)
  })

  it('should handle IP prefix search on 1000 hosts efficiently', () => {
    const largeDataset = generateLargeDataset(1000)
    const search = parseSearch('0.0.')

    const start = performance.now()
    const matches = largeDataset.filter(h => hostMatchesSearch(h, search))
    const elapsed = performance.now() - start

    expect(matches.length).toBe(1000) // All start with 0.0.
    expect(elapsed).toBeLessThan(100)
  })
})
