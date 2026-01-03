/**
 * OUI lookup module tests
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { describe, it, expect, beforeAll } from 'vitest'
import {
  ensureOuiLoaded,
  isOuiLoaded,
  getVendorFromMac,
  getVendorSync,
  searchVendors,
  getOuisForVendor,
  macMatchesOuis,
  getOuiCount,
  formatOui,
  getAllVendors,
} from '@/lib/oui'

describe('OUI Lookup Module', () => {
  // Ensure OUI data is loaded before tests
  beforeAll(async () => {
    await ensureOuiLoaded()
  })

  // ==========================================================================
  // Loading State
  // ==========================================================================

  describe('Loading State', () => {
    it('isOuiLoaded returns true after ensureOuiLoaded', async () => {
      await ensureOuiLoaded()
      expect(isOuiLoaded()).toBe(true)
    })

    it('getOuiCount returns positive number when loaded', () => {
      expect(getOuiCount()).toBeGreaterThan(30000)
    })

    it('ensureOuiLoaded is idempotent', async () => {
      const result1 = await ensureOuiLoaded()
      const result2 = await ensureOuiLoaded()
      expect(result1).toBe(true)
      expect(result2).toBe(true)
    })
  })

  // ==========================================================================
  // getVendorFromMac / getVendorSync
  // ==========================================================================

  describe('getVendorFromMac', () => {
    describe('MAC format handling', () => {
      it('handles colon-separated format', () => {
        // Cisco OUI
        const vendor = getVendorFromMac('00:00:0C:12:34:56')
        expect(vendor).toContain('CISCO')
      })

      it('handles dash-separated format', () => {
        const vendor = getVendorFromMac('00-00-0C-12-34-56')
        expect(vendor).toContain('CISCO')
      })

      it('handles raw hex format (no separators)', () => {
        const vendor = getVendorFromMac('00000C123456')
        expect(vendor).toContain('CISCO')
      })

      it('handles lowercase hex', () => {
        const vendor = getVendorFromMac('00:00:0c:12:34:56')
        expect(vendor).toContain('CISCO')
      })

      it('handles mixed case hex', () => {
        const vendor = getVendorFromMac('00:00:0C:Ab:Cd:Ef')
        expect(vendor).toContain('CISCO')
      })

      it('handles short MAC (only OUI portion)', () => {
        const vendor = getVendorFromMac('00:00:0C')
        expect(vendor).toContain('CISCO')
      })
    })

    describe('known OUI lookups', () => {
      it('returns correct vendor for Cisco OUI', () => {
        const vendor = getVendorFromMac('00:00:0C:12:34:56')
        expect(vendor).toContain('CISCO')
      })

      it('returns correct vendor for Xerox OUI (000000)', () => {
        const vendor = getVendorFromMac('00:00:00:12:34:56')
        expect(vendor).toContain('XEROX')
      })

      it('returns correct vendor for IBM OUI', () => {
        // 00:04:AC is IBM
        const vendor = getVendorFromMac('00:04:AC:00:00:00')
        expect(vendor).toContain('IBM')
      })
    })

    describe('unknown OUI handling', () => {
      it('returns null for non-existent OUI', () => {
        // FF:FF:FF is unlikely to be assigned
        const vendor = getVendorFromMac('FF:FF:FF:12:34:56')
        expect(vendor).toBeNull()
      })
    })

    describe('invalid input handling', () => {
      it('returns null for null input', () => {
        expect(getVendorFromMac(null)).toBeNull()
      })

      it('returns null for undefined input', () => {
        expect(getVendorFromMac(undefined)).toBeNull()
      })

      it('returns null for empty string', () => {
        expect(getVendorFromMac('')).toBeNull()
      })

      it('returns null for too short MAC', () => {
        expect(getVendorFromMac('00:00')).toBeNull()
      })

      it('returns null for invalid hex characters', () => {
        expect(getVendorFromMac('GG:HH:II:JJ:KK:LL')).toBeNull()
      })

      it('returns null for MAC with spaces only', () => {
        expect(getVendorFromMac('   ')).toBeNull()
      })
    })

    describe('getVendorSync alias', () => {
      it('getVendorSync works same as getVendorFromMac', () => {
        const mac = '00:00:0C:12:34:56'
        expect(getVendorSync(mac)).toBe(getVendorFromMac(mac))
      })
    })
  })

  // ==========================================================================
  // searchVendors
  // ==========================================================================

  describe('searchVendors', () => {
    describe('partial matching', () => {
      it('returns results for partial vendor name', () => {
        const results = searchVendors('cisco')
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].vendor).toContain('CISCO')
      })

      it('returns multiple OUIs for large vendors', () => {
        const results = searchVendors('cisco', 1000)
        // Cisco has many OUIs
        expect(results.length).toBeGreaterThan(100)
      })
    })

    describe('case insensitivity', () => {
      it('matches lowercase query', () => {
        const results = searchVendors('apple')
        expect(results.length).toBeGreaterThan(0)
      })

      it('matches uppercase query', () => {
        const results = searchVendors('APPLE')
        expect(results.length).toBeGreaterThan(0)
      })

      it('matches mixed case query', () => {
        const results = searchVendors('ApPlE')
        expect(results.length).toBeGreaterThan(0)
      })
    })

    describe('result format', () => {
      it('returns objects with oui and vendor properties', () => {
        const results = searchVendors('cisco', 1)
        expect(results[0]).toHaveProperty('oui')
        expect(results[0]).toHaveProperty('vendor')
        expect(typeof results[0].oui).toBe('string')
        expect(typeof results[0].vendor).toBe('string')
      })

      it('OUI is 6 uppercase hex characters', () => {
        const results = searchVendors('cisco', 10)
        for (const result of results) {
          expect(result.oui).toMatch(/^[0-9A-F]{6}$/)
        }
      })
    })

    describe('limit handling', () => {
      it('respects limit parameter', () => {
        const results = searchVendors('cisco', 5)
        expect(results.length).toBeLessThanOrEqual(5)
      })

      it('default limit is 100', () => {
        // Search for a common term that has many matches
        const results = searchVendors('inc')
        expect(results.length).toBeLessThanOrEqual(100)
      })
    })

    describe('no match handling', () => {
      it('returns empty array for non-matching query', () => {
        const results = searchVendors('xyznonexistentvendor123')
        expect(results).toEqual([])
      })

      it('returns empty array for empty query', () => {
        const results = searchVendors('')
        expect(results).toEqual([])
      })

      it('returns empty array for whitespace query', () => {
        const results = searchVendors('   ')
        expect(results).toEqual([])
      })
    })
  })

  // ==========================================================================
  // getOuisForVendor
  // ==========================================================================

  describe('getOuisForVendor', () => {
    it('returns OUIs for exact vendor match', () => {
      // Get a vendor name from search results to test with
      const searchResults = searchVendors('cisco', 1)
      if (searchResults.length > 0) {
        const vendorName = searchResults[0].vendor
        const ouis = getOuisForVendor(vendorName)
        expect(ouis.length).toBeGreaterThan(0)
        expect(ouis).toContain(searchResults[0].oui)
      }
    })

    it('returns empty array for non-existent vendor', () => {
      const ouis = getOuisForVendor('NonExistentVendorName12345')
      expect(ouis).toEqual([])
    })

    it('is case insensitive', () => {
      const searchResults = searchVendors('xerox', 1)
      if (searchResults.length > 0) {
        const upper = getOuisForVendor(searchResults[0].vendor.toUpperCase())
        const lower = getOuisForVendor(searchResults[0].vendor.toLowerCase())
        expect(upper).toEqual(lower)
      }
    })

    it('returns empty array for empty input', () => {
      expect(getOuisForVendor('')).toEqual([])
    })
  })

  // ==========================================================================
  // macMatchesOuis
  // ==========================================================================

  describe('macMatchesOuis', () => {
    it('returns true when MAC matches one of the OUI prefixes', () => {
      const ciscoResults = searchVendors('cisco', 5)
      const ciscoOuis = ciscoResults.map((r) => r.oui)

      // Create a MAC from the first Cisco OUI
      if (ciscoOuis.length > 0) {
        const mac = ciscoOuis[0].substring(0, 2) + ':' +
                    ciscoOuis[0].substring(2, 4) + ':' +
                    ciscoOuis[0].substring(4, 6) + ':AA:BB:CC'
        expect(macMatchesOuis(mac, ciscoOuis)).toBe(true)
      }
    })

    it('returns false when MAC does not match any OUI prefix', () => {
      // Use some Cisco OUIs
      const ciscoResults = searchVendors('cisco', 5)
      const ciscoOuis = ciscoResults.map((r) => r.oui)

      // FF:FF:FF is unlikely to be a Cisco OUI
      expect(macMatchesOuis('FF:FF:FF:00:00:00', ciscoOuis)).toBe(false)
    })

    it('returns false for null MAC', () => {
      expect(macMatchesOuis(null, ['00000C'])).toBe(false)
    })

    it('returns false for undefined MAC', () => {
      expect(macMatchesOuis(undefined, ['00000C'])).toBe(false)
    })

    it('returns false for empty OUI array', () => {
      expect(macMatchesOuis('00:00:0C:12:34:56', [])).toBe(false)
    })

    it('handles various MAC formats', () => {
      const ouis = ['00000C']
      expect(macMatchesOuis('00:00:0C:12:34:56', ouis)).toBe(true)
      expect(macMatchesOuis('00-00-0C-12-34-56', ouis)).toBe(true)
      expect(macMatchesOuis('00000C123456', ouis)).toBe(true)
    })
  })

  // ==========================================================================
  // formatOui
  // ==========================================================================

  describe('formatOui', () => {
    it('formats 6-char OUI with colons', () => {
      expect(formatOui('00000C')).toBe('00:00:0C')
    })

    it('returns input unchanged if not 6 chars', () => {
      expect(formatOui('ABC')).toBe('ABC')
      expect(formatOui('ABCDEFGH')).toBe('ABCDEFGH')
    })

    it('handles empty string', () => {
      expect(formatOui('')).toBe('')
    })
  })

  // ==========================================================================
  // getAllVendors
  // ==========================================================================

  describe('getAllVendors', () => {
    it('returns array of vendor names', () => {
      const vendors = getAllVendors(10)
      expect(vendors.length).toBeGreaterThan(0)
      expect(vendors.length).toBeLessThanOrEqual(10)
      vendors.forEach((v) => expect(typeof v).toBe('string'))
    })

    it('respects limit parameter', () => {
      const vendors5 = getAllVendors(5)
      const vendors10 = getAllVendors(10)
      expect(vendors5.length).toBeLessThanOrEqual(5)
      expect(vendors10.length).toBeLessThanOrEqual(10)
    })
  })
})
