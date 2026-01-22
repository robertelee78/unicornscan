/**
 * Smart search utility tests
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { describe, it, expect } from 'vitest'
import {
  detectSearchType,
  parseSearch,
  matchesCIDR,
  matchesIPPrefix,
  matchesMAC,
  matchesBanner,
  matchesText,
  validateRegex,
  isValidPort,
  normalizeMAC,
  ipToInt,
  intToIp,
  parseCIDR,
  getSearchTypeDescription,
  getSearchTypeExamples,
} from '../../src/features/hosts/search-utils'

// =============================================================================
// detectSearchType Tests
// =============================================================================

describe('detectSearchType', () => {
  describe('Port Detection', () => {
    it('should detect valid port numbers', () => {
      expect(detectSearchType('22')).toBe('port')
      expect(detectSearchType('80')).toBe('port')
      expect(detectSearchType('443')).toBe('port')
      expect(detectSearchType('8080')).toBe('port')
      expect(detectSearchType('65535')).toBe('port')
      expect(detectSearchType('1')).toBe('port')
    })

    it('should not detect invalid port numbers', () => {
      expect(detectSearchType('0')).not.toBe('port')
      expect(detectSearchType('65536')).not.toBe('port')
      expect(detectSearchType('99999')).not.toBe('port')
      expect(detectSearchType('-22')).not.toBe('port')
      expect(detectSearchType('22.5')).not.toBe('port')
    })
  })

  describe('CIDR Detection', () => {
    it('should detect valid CIDR notation', () => {
      expect(detectSearchType('192.168.1.0/24')).toBe('cidr')
      expect(detectSearchType('10.0.0.0/8')).toBe('cidr')
      expect(detectSearchType('172.16.0.0/12')).toBe('cidr')
      expect(detectSearchType('0.0.0.0/0')).toBe('cidr')
      expect(detectSearchType('255.255.255.255/32')).toBe('cidr')
    })

    it('should not detect invalid CIDR', () => {
      expect(detectSearchType('192.168.1.0/33')).not.toBe('cidr')
      expect(detectSearchType('192.168.1.256/24')).not.toBe('cidr')
      expect(detectSearchType('192.168.1/24')).not.toBe('cidr')
      expect(detectSearchType('192.168.1.0/-1')).not.toBe('cidr')
    })
  })

  describe('IP Prefix Detection', () => {
    it('should detect IP prefixes (partial IPs ending with dot)', () => {
      expect(detectSearchType('192.168.')).toBe('ip-prefix')
      expect(detectSearchType('10.')).toBe('ip-prefix')
      expect(detectSearchType('172.16.0.')).toBe('ip-prefix')
      expect(detectSearchType('192.168.1.')).toBe('ip-prefix')
    })

    it('should not detect invalid IP prefixes', () => {
      expect(detectSearchType('192.168')).not.toBe('ip-prefix')
      expect(detectSearchType('192.168.1.1')).not.toBe('ip-prefix') // Full IP, not prefix
      expect(detectSearchType('256.')).not.toBe('ip-prefix')
    })
  })

  describe('MAC Address Detection', () => {
    it('should detect full MAC addresses (colon format)', () => {
      expect(detectSearchType('00:11:22:33:44:55')).toBe('mac')
      expect(detectSearchType('AA:BB:CC:DD:EE:FF')).toBe('mac')
    })

    it('should detect full MAC addresses (dash format)', () => {
      expect(detectSearchType('00-11-22-33-44-55')).toBe('mac')
      expect(detectSearchType('AA-BB-CC-DD-EE-FF')).toBe('mac')
    })

    it('should detect full MAC addresses (raw hex)', () => {
      expect(detectSearchType('001122334455')).toBe('mac')
      expect(detectSearchType('AABBCCDDEEFF')).toBe('mac')
    })

    it('should detect partial MAC addresses (OUI prefix)', () => {
      expect(detectSearchType('00:11:22')).toBe('mac')
      // Note: '001122' is 6 pure digits = valid port (1122), so port detection takes priority
      expect(detectSearchType('001122')).toBe('port')
      expect(detectSearchType('00:11:22:')).toBe('mac')
      // Partial with separators is clearly MAC
      expect(detectSearchType('00-11-22')).toBe('mac')
      expect(detectSearchType('AA:BB:CC')).toBe('mac')
    })
  })

  describe('Regex Detection', () => {
    it('should detect regex patterns with slash', () => {
      expect(detectSearchType('/Apache/')).toBe('regex')
      expect(detectSearchType('/nginx/i')).toBe('regex')
      expect(detectSearchType('/SSH-2\\.0/')).toBe('regex')
    })

    it('should detect regex patterns with tilde', () => {
      expect(detectSearchType('~apache')).toBe('regex')
      expect(detectSearchType('~nginx')).toBe('regex')
    })
  })

  describe('Text Detection', () => {
    it('should default to text for other patterns', () => {
      expect(detectSearchType('apache')).toBe('text')
      expect(detectSearchType('webserver')).toBe('text')
      expect(detectSearchType('linux')).toBe('text')
      expect(detectSearchType('192.168.1.1')).toBe('text') // Full IP is text search
    })

    it('should handle empty and whitespace input', () => {
      expect(detectSearchType('')).toBe('text')
      expect(detectSearchType('   ')).toBe('text')
    })
  })
})

// =============================================================================
// parseSearch Tests
// =============================================================================

describe('parseSearch', () => {
  it('should parse port searches', () => {
    const result = parseSearch('443')
    expect(result.type).toBe('port')
    expect(result.port).toBe(443)
    expect(result.original).toBe('443')
  })

  it('should parse CIDR searches', () => {
    const result = parseSearch('192.168.1.0/24')
    expect(result.type).toBe('cidr')
    expect(result.cidr).toBeDefined()
    expect(result.cidr?.prefix).toBe(24)
    expect(result.cidr?.networkAddr).toBe('192.168.1.0')
  })

  it('should parse MAC address searches', () => {
    const result = parseSearch('00:11:22:33:44:55')
    expect(result.type).toBe('mac')
    // Value is normalized to raw hex uppercase for consistent matching
    expect(result.value).toBe('001122334455')
  })

  it('should parse regex searches', () => {
    const result = parseSearch('/Apache/i')
    expect(result.type).toBe('regex')
    expect(result.regex).not.toBeNull()
    expect(result.regex?.flags).toContain('i')
  })

  it('should parse tilde regex searches', () => {
    const result = parseSearch('~nginx')
    expect(result.type).toBe('regex')
    expect(result.regex).not.toBeNull()
    expect(result.regex?.flags).toContain('i')
  })

  it('should parse text searches with regex for matching', () => {
    const result = parseSearch('webserver')
    expect(result.type).toBe('text')
    expect(result.regex).not.toBeNull()
    expect(result.value).toBe('webserver')
  })

  it('should handle invalid regex gracefully', () => {
    const result = parseSearch('/[invalid/')
    expect(result.type).toBe('regex')
    expect(result.regex).toBeNull()
  })
})

// =============================================================================
// matchesCIDR Tests
// =============================================================================

describe('matchesCIDR', () => {
  it('should match IPs within CIDR range', () => {
    const cidr = parseCIDR('192.168.1.0/24')!
    expect(matchesCIDR('192.168.1.0', cidr)).toBe(true)
    expect(matchesCIDR('192.168.1.1', cidr)).toBe(true)
    expect(matchesCIDR('192.168.1.255', cidr)).toBe(true)
  })

  it('should not match IPs outside CIDR range', () => {
    const cidr = parseCIDR('192.168.1.0/24')!
    expect(matchesCIDR('192.168.2.0', cidr)).toBe(false)
    expect(matchesCIDR('192.168.0.255', cidr)).toBe(false)
    expect(matchesCIDR('10.0.0.1', cidr)).toBe(false)
  })

  it('should handle /32 (single host)', () => {
    const cidr = parseCIDR('192.168.1.100/32')!
    expect(matchesCIDR('192.168.1.100', cidr)).toBe(true)
    expect(matchesCIDR('192.168.1.101', cidr)).toBe(false)
  })

  it('should handle /0 (all IPs)', () => {
    const cidr = parseCIDR('0.0.0.0/0')!
    expect(matchesCIDR('192.168.1.1', cidr)).toBe(true)
    expect(matchesCIDR('10.0.0.1', cidr)).toBe(true)
    expect(matchesCIDR('8.8.8.8', cidr)).toBe(true)
  })

  it('should handle /8 (class A)', () => {
    const cidr = parseCIDR('10.0.0.0/8')!
    expect(matchesCIDR('10.0.0.1', cidr)).toBe(true)
    expect(matchesCIDR('10.255.255.255', cidr)).toBe(true)
    expect(matchesCIDR('11.0.0.1', cidr)).toBe(false)
  })

  it('should return false for invalid IP', () => {
    const cidr = parseCIDR('192.168.1.0/24')!
    expect(matchesCIDR('invalid', cidr)).toBe(false)
    expect(matchesCIDR('256.0.0.1', cidr)).toBe(false)
  })
})

// =============================================================================
// matchesIPPrefix Tests
// =============================================================================

describe('matchesIPPrefix', () => {
  it('should match IPs starting with prefix', () => {
    expect(matchesIPPrefix('192.168.1.1', '192.168.')).toBe(true)
    expect(matchesIPPrefix('192.168.100.200', '192.168.')).toBe(true)
    expect(matchesIPPrefix('10.0.0.1', '10.')).toBe(true)
  })

  it('should not match IPs not starting with prefix', () => {
    expect(matchesIPPrefix('192.169.1.1', '192.168.')).toBe(false)
    expect(matchesIPPrefix('10.0.0.1', '192.')).toBe(false)
  })

  it('should be case insensitive', () => {
    expect(matchesIPPrefix('192.168.1.1', '192.168.')).toBe(true)
  })
})

// =============================================================================
// matchesMAC Tests
// =============================================================================

describe('matchesMAC', () => {
  it('should match exact MAC addresses', () => {
    expect(matchesMAC('00:11:22:33:44:55', '00:11:22:33:44:55')).toBe(true)
  })

  it('should match MAC addresses case-insensitively', () => {
    expect(matchesMAC('aa:bb:cc:dd:ee:ff', 'AA:BB:CC:DD:EE:FF')).toBe(true)
  })

  it('should match partial MAC addresses (OUI prefix)', () => {
    expect(matchesMAC('00:11:22:33:44:55', '00:11:22')).toBe(true)
    expect(matchesMAC('00:11:22:33:44:55', '001122')).toBe(true)
  })

  it('should not match different MAC addresses', () => {
    expect(matchesMAC('00:11:22:33:44:55', 'AA:BB:CC')).toBe(false)
  })

  it('should handle null/undefined MAC', () => {
    expect(matchesMAC(null, '00:11:22')).toBe(false)
    expect(matchesMAC(undefined, '00:11:22')).toBe(false)
  })
})

// =============================================================================
// normalizeMAC Tests
// =============================================================================

describe('normalizeMAC', () => {
  // normalizeMAC returns raw hex uppercase for consistent matching
  // Use formatMAC for display formatting with colons

  it('should normalize colon-separated MAC to raw hex', () => {
    expect(normalizeMAC('00:11:22:33:44:55')).toBe('001122334455')
  })

  it('should normalize dash-separated MAC to raw hex', () => {
    expect(normalizeMAC('00-11-22-33-44-55')).toBe('001122334455')
  })

  it('should keep raw hex MAC as-is', () => {
    expect(normalizeMAC('001122334455')).toBe('001122334455')
  })

  it('should uppercase MAC addresses', () => {
    expect(normalizeMAC('aa:bb:cc:dd:ee:ff')).toBe('AABBCCDDEEFF')
  })

  it('should handle partial MAC addresses consistently', () => {
    expect(normalizeMAC('00:11:22')).toBe('001122')
    expect(normalizeMAC('aabb')).toBe('AABB')
  })
})

// =============================================================================
// matchesBanner / matchesText Tests
// =============================================================================

describe('matchesBanner', () => {
  it('should match text patterns in banners', () => {
    const search = parseSearch('Apache')
    expect(matchesBanner('Apache/2.4.41 (Ubuntu)', search)).toBe(true)
  })

  it('should match regex patterns in banners', () => {
    const search = parseSearch('/Apache\\/2\\.[0-9]+/')
    expect(matchesBanner('Apache/2.4.41 (Ubuntu)', search)).toBe(true)
  })

  it('should return false for null banner', () => {
    const search = parseSearch('Apache')
    expect(matchesBanner(null, search)).toBe(false)
  })
})

describe('matchesText', () => {
  it('should match case-insensitively', () => {
    const search = parseSearch('APACHE')
    expect(matchesText('Apache Server', search)).toBe(true)
  })

  it('should match substrings', () => {
    const search = parseSearch('server')
    expect(matchesText('Web Server 1.0', search)).toBe(true)
  })

  it('should return false for null text', () => {
    const search = parseSearch('test')
    expect(matchesText(null, search)).toBe(false)
  })
})

// =============================================================================
// validateRegex Tests
// =============================================================================

describe('validateRegex', () => {
  it('should return null for valid regex', () => {
    expect(validateRegex('/Apache/')).toBeNull()
    expect(validateRegex('/nginx/i')).toBeNull()
    expect(validateRegex('~test')).toBeNull()
  })

  it('should return error message for invalid regex', () => {
    expect(validateRegex('/[invalid/')).toBe('Invalid regular expression')
    expect(validateRegex('/(((')).toBe('Invalid regular expression')
  })

  it('should return null for non-regex patterns', () => {
    expect(validateRegex('plain text')).toBeNull()
    expect(validateRegex('192.168.1.1')).toBeNull()
  })
})

// =============================================================================
// isValidPort Tests
// =============================================================================

describe('isValidPort', () => {
  it('should return true for valid ports', () => {
    expect(isValidPort('1')).toBe(true)
    expect(isValidPort('22')).toBe(true)
    expect(isValidPort('443')).toBe(true)
    expect(isValidPort('65535')).toBe(true)
  })

  it('should return false for invalid ports', () => {
    expect(isValidPort('0')).toBe(false)
    expect(isValidPort('65536')).toBe(false)
    expect(isValidPort('-1')).toBe(false)
    expect(isValidPort('abc')).toBe(false)
    expect(isValidPort('22.5')).toBe(false)
  })
})

// =============================================================================
// IP Conversion Tests
// =============================================================================

describe('ipToInt / intToIp', () => {
  it('should convert IP to integer correctly', () => {
    expect(ipToInt('0.0.0.0')).toBe(0)
    expect(ipToInt('0.0.0.1')).toBe(1)
    expect(ipToInt('0.0.1.0')).toBe(256)
    expect(ipToInt('192.168.1.1')).toBe(3232235777)
  })

  it('should convert integer back to IP correctly', () => {
    expect(intToIp(0)).toBe('0.0.0.0')
    expect(intToIp(1)).toBe('0.0.0.1')
    expect(intToIp(256)).toBe('0.0.1.0')
    expect(intToIp(3232235777)).toBe('192.168.1.1')
  })

  it('should round-trip correctly', () => {
    const ips = ['192.168.1.1', '10.0.0.1', '255.255.255.255', '0.0.0.0']
    ips.forEach(ip => {
      expect(intToIp(ipToInt(ip))).toBe(ip)
    })
  })
})

// =============================================================================
// parseCIDR Tests
// =============================================================================

describe('parseCIDR', () => {
  it('should parse valid CIDR notation', () => {
    const result = parseCIDR('192.168.1.0/24')
    expect(result).toBeDefined()
    expect(result?.prefix).toBe(24)
    expect(result?.networkAddr).toBe('192.168.1.0')
  })

  it('should return undefined for invalid CIDR', () => {
    expect(parseCIDR('invalid')).toBeUndefined()
    expect(parseCIDR('192.168.1.0')).toBeUndefined()
    expect(parseCIDR('192.168.1.0/33')).toBeUndefined()
  })

  it('should calculate correct network mask', () => {
    const result24 = parseCIDR('192.168.1.0/24')
    expect(result24?.maskInt).toBe(0xFFFFFF00)

    const result16 = parseCIDR('172.16.0.0/16')
    expect(result16?.maskInt).toBe(0xFFFF0000)

    const result8 = parseCIDR('10.0.0.0/8')
    expect(result8?.maskInt).toBe(0xFF000000)
  })
})

// =============================================================================
// Helper Function Tests
// =============================================================================

describe('getSearchTypeDescription', () => {
  it('should return descriptions for all types', () => {
    expect(getSearchTypeDescription('port')).toContain('Port')
    expect(getSearchTypeDescription('cidr')).toContain('CIDR')
    expect(getSearchTypeDescription('ip-prefix')).toContain('IP')
    expect(getSearchTypeDescription('mac')).toContain('MAC')
    expect(getSearchTypeDescription('regex')).toContain('Regex')
    expect(getSearchTypeDescription('text')).toContain('Text')
  })
})

describe('getSearchTypeExamples', () => {
  it('should return examples for all types', () => {
    expect(getSearchTypeExamples('port').length).toBeGreaterThan(0)
    expect(getSearchTypeExamples('cidr').length).toBeGreaterThan(0)
    expect(getSearchTypeExamples('ip-prefix').length).toBeGreaterThan(0)
    expect(getSearchTypeExamples('mac').length).toBeGreaterThan(0)
    expect(getSearchTypeExamples('regex').length).toBeGreaterThan(0)
    expect(getSearchTypeExamples('text').length).toBeGreaterThan(0)
  })
})

// =============================================================================
// Edge Case Tests
// =============================================================================

describe('Edge Cases', () => {
  it('should handle empty input gracefully', () => {
    const result = parseSearch('')
    expect(result.type).toBe('text')
    expect(result.value).toBe('')
  })

  it('should handle whitespace-only input', () => {
    const result = parseSearch('   ')
    expect(result.type).toBe('text')
    expect(result.value).toBe('')
  })

  it('should handle very long input', () => {
    const longInput = 'a'.repeat(1000)
    const result = parseSearch(longInput)
    expect(result.type).toBe('text')
  })

  it('should detect IPv4 address as text search (not CIDR)', () => {
    const result = parseSearch('192.168.1.1')
    expect(result.type).toBe('text')
  })

  it('should handle regex with special characters', () => {
    const result = parseSearch('/\\d+\\.\\d+\\.\\d+\\.\\d+/')
    expect(result.type).toBe('regex')
    expect(result.regex).not.toBeNull()
  })

  it('should reject potentially dangerous regex patterns', () => {
    // Nested quantifiers that could cause ReDoS
    const result = parseSearch('/(a+)+$/')
    expect(result.regex).toBeNull()
  })
})

// =============================================================================
// Real-World Scenario Tests
// =============================================================================

describe('Real-World Scenarios', () => {
  it('should find hosts by SSH port', () => {
    const search = parseSearch('22')
    expect(search.type).toBe('port')
    expect(search.port).toBe(22)
  })

  it('should find hosts in private network range', () => {
    const search = parseSearch('10.0.0.0/8')
    expect(search.type).toBe('cidr')
    expect(matchesCIDR('10.255.255.255', search.cidr!)).toBe(true)
    expect(matchesCIDR('11.0.0.1', search.cidr!)).toBe(false)
  })

  it('should find hosts by vendor OUI', () => {
    const search = parseSearch('00:50:56')
    expect(search.type).toBe('mac')
    expect(matchesMAC('00:50:56:12:34:56', search.value)).toBe(true)
  })

  it('should find hosts by banner regex', () => {
    const search = parseSearch('/OpenSSH_[0-9]+/')
    expect(search.type).toBe('regex')
    expect(matchesBanner('SSH-2.0-OpenSSH_8.9p1', search)).toBe(true)
    expect(matchesBanner('SSH-2.0-Dropbear', search)).toBe(false)
  })

  it('should find hosts by partial IP', () => {
    const search = parseSearch('192.168.1.')
    expect(search.type).toBe('ip-prefix')
    expect(matchesIPPrefix('192.168.1.100', search.value)).toBe(true)
    expect(matchesIPPrefix('192.168.2.1', search.value)).toBe(false)
  })
})
