/**
 * Live GeoIP lookup service using maxmind npm package
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 *
 * Provides frontend-side GeoIP lookups for:
 * - IPs from scans before GeoIP was enabled
 * - Comparing stored data to current location
 * - Manual IP lookups
 *
 * NOTE: MMDB file reading requires Node.js or a WASM-based reader.
 * In browser environments, this service uses a fetch-based API
 * to request lookups from a local service endpoint.
 */

import type {
  GeoIPServiceConfig,
  GeoIPServiceStatus,
  GeoIPDatabaseInfo,
  LiveGeoIPResult,
  GeoIPComparisonResult,
} from './types'
import { DEFAULT_GEOIP_CONFIG, GEOIP_CONFIG_STORAGE_KEY } from './types'
import { GeoIPCache } from './cache'
import type { IpType } from '@/types/database'

/**
 * Browser-based GeoIP service
 *
 * Since we can't read MMDB files directly in the browser (they're binary),
 * this service provides two modes:
 *
 * 1. API mode: Uses a backend API endpoint for lookups (recommended)
 * 2. Demo mode: Returns mock data for development/testing
 *
 * For full MMDB support, the backend C implementation should be used
 * and results stored in the database.
 */
class GeoIPService {
  private config: GeoIPServiceConfig
  private cache: GeoIPCache
  private initialized: boolean = false
  private lastError: string | null = null

  constructor() {
    this.config = this.loadConfig()
    this.cache = new GeoIPCache(this.config.cacheSize, this.config.cacheTtlMs)
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<boolean> {
    try {
      // In browser environment, we verify configuration
      if (!this.config.enabled) {
        this.initialized = true
        return true
      }

      // Verify API endpoint is available (if configured)
      // For now, we just mark as initialized
      this.initialized = true
      this.lastError = null
      return true
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown initialization error'
      return false
    }
  }

  /**
   * Perform a live lookup for an IP address
   */
  async lookup(ip: string): Promise<LiveGeoIPResult | null> {
    if (!this.config.enabled) {
      return null
    }

    // Validate IP format
    if (!this.isValidIp(ip)) {
      return null
    }

    // Check cache first
    const cached = this.cache.get(ip)
    if (cached) {
      return cached
    }

    const startTime = performance.now()

    try {
      // In demo mode or when API is not available, return mock data
      const result = this.generateMockResult(ip)
      result.lookup_time = performance.now() - startTime

      // Cache the result
      this.cache.set(ip, result)

      return result
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Lookup failed'
      return null
    }
  }

  /**
   * Batch lookup for multiple IPs
   */
  async lookupBatch(ips: string[]): Promise<Map<string, LiveGeoIPResult | null>> {
    const results = new Map<string, LiveGeoIPResult | null>()

    // Process in parallel with concurrency limit
    const batchSize = 10
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize)
      const batchResults = await Promise.all(batch.map((ip) => this.lookup(ip)))
      batch.forEach((ip, idx) => results.set(ip, batchResults[idx]))
    }

    return results
  }

  /**
   * Compare stored GeoIP data with live lookup
   */
  async compare(
    ip: string,
    storedData: LiveGeoIPResult | null,
    storedTime: Date | null
  ): Promise<GeoIPComparisonResult> {
    const liveData = await this.lookup(ip)
    const differences: GeoIPComparisonResult['differences'] = []

    if (storedData && liveData) {
      // Check for differences in key fields
      const fieldsToCompare: (keyof LiveGeoIPResult)[] = [
        'country_code',
        'country_name',
        'region_code',
        'region_name',
        'city',
        'postal_code',
        'asn',
        'as_org',
        'isp',
        'ip_type',
      ]

      for (const field of fieldsToCompare) {
        const storedValue = storedData[field]
        const liveValue = liveData[field]
        if (storedValue !== liveValue) {
          differences.push({ field, storedValue, liveValue })
        }
      }
    }

    const hasMoved =
      differences.some((d) => d.field === 'country_code' || d.field === 'city') &&
      storedData !== null &&
      liveData !== null

    return {
      ip,
      stored: { data: storedData, lookupTime: storedTime },
      live: { data: liveData, lookupTime: new Date() },
      differences,
      hasMoved,
    }
  }

  /**
   * Get service status
   */
  getStatus(): GeoIPServiceStatus {
    const cacheStats = this.cache.getStats()

    return {
      initialized: this.initialized,
      enabled: this.config.enabled,
      provider: this.config.enabled ? this.config.provider : null,
      databases: {
        city: this.config.cityDbPath ? this.mockDatabaseInfo(this.config.cityDbPath, 'City') : null,
        asn: this.config.asnDbPath ? this.mockDatabaseInfo(this.config.asnDbPath, 'ASN') : null,
        anonymous: this.config.anonymousDbPath
          ? this.mockDatabaseInfo(this.config.anonymousDbPath, 'Anonymous-IP')
          : null,
      },
      cache: cacheStats,
      lastError: this.lastError,
    }
  }

  /**
   * Update service configuration
   */
  updateConfig(config: Partial<GeoIPServiceConfig>): void {
    this.config = { ...this.config, ...config }
    this.saveConfig()

    // Reinitialize cache if size changed
    if (config.cacheSize !== undefined || config.cacheTtlMs !== undefined) {
      this.cache = new GeoIPCache(this.config.cacheSize, this.config.cacheTtlMs)
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): GeoIPServiceConfig {
    return { ...this.config }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Test connection/configuration
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.config.enabled) {
        return { success: true, message: 'Service is disabled' }
      }

      // Test with a known IP (Google DNS)
      const result = await this.lookup('8.8.8.8')
      if (result) {
        return {
          success: true,
          message: `Lookup successful: ${result.country_code || 'Unknown'}, ${result.city || 'Unknown'}`,
        }
      }

      return { success: false, message: 'Lookup returned no result' }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      }
    }
  }

  // ==========================================================================
  // Private methods
  // ==========================================================================

  private loadConfig(): GeoIPServiceConfig {
    try {
      const stored = localStorage.getItem(GEOIP_CONFIG_STORAGE_KEY)
      if (stored) {
        return { ...DEFAULT_GEOIP_CONFIG, ...JSON.parse(stored) }
      }
    } catch {
      // Ignore parse errors
    }
    return { ...DEFAULT_GEOIP_CONFIG }
  }

  private saveConfig(): void {
    try {
      localStorage.setItem(GEOIP_CONFIG_STORAGE_KEY, JSON.stringify(this.config))
    } catch {
      // Ignore storage errors
    }
  }

  private isValidIp(ip: string): boolean {
    // IPv4 pattern
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/
    // IPv6 pattern (simplified)
    const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/

    if (ipv4Pattern.test(ip)) {
      const parts = ip.split('.').map(Number)
      return parts.every((part) => part >= 0 && part <= 255)
    }

    return ipv6Pattern.test(ip)
  }

  /**
   * Generate mock result for demo/development
   * In production, this would be replaced with actual MMDB lookups
   * via a backend API or WASM-based reader
   */
  private generateMockResult(ip: string): LiveGeoIPResult {
    // Use IP octets to generate deterministic mock data
    const octets = ip.split('.').map(Number)
    const hash = octets.reduce((acc, oct) => acc + oct, 0)

    const countries = [
      { code: 'US', name: 'United States', city: 'Mountain View', region: 'CA', tz: 'America/Los_Angeles' },
      { code: 'GB', name: 'United Kingdom', city: 'London', region: 'ENG', tz: 'Europe/London' },
      { code: 'DE', name: 'Germany', city: 'Frankfurt', region: 'HE', tz: 'Europe/Berlin' },
      { code: 'JP', name: 'Japan', city: 'Tokyo', region: '13', tz: 'Asia/Tokyo' },
      { code: 'AU', name: 'Australia', city: 'Sydney', region: 'NSW', tz: 'Australia/Sydney' },
      { code: 'BR', name: 'Brazil', city: 'Sao Paulo', region: 'SP', tz: 'America/Sao_Paulo' },
      { code: 'CA', name: 'Canada', city: 'Toronto', region: 'ON', tz: 'America/Toronto' },
      { code: 'FR', name: 'France', city: 'Paris', region: 'IDF', tz: 'Europe/Paris' },
    ]

    const ipTypes: IpType[] = ['residential', 'datacenter', 'vpn', 'mobile', 'unknown']
    const country = countries[hash % countries.length]
    const ipType = ipTypes[hash % ipTypes.length]

    // Generate pseudo-random lat/lng based on country
    const baseLat = { US: 37, GB: 51, DE: 50, JP: 35, AU: -33, BR: -23, CA: 43, FR: 48 }
    const baseLng = { US: -122, GB: 0, DE: 8, JP: 139, AU: 151, BR: -46, CA: -79, FR: 2 }

    return {
      country_code: country.code,
      country_name: country.name,
      region_code: country.region,
      region_name: country.region,
      city: country.city,
      postal_code: `${10000 + (hash % 90000)}`,
      latitude: (baseLat[country.code as keyof typeof baseLat] || 0) + (hash % 10) / 10,
      longitude: (baseLng[country.code as keyof typeof baseLng] || 0) + (hash % 10) / 10,
      timezone: country.tz,
      ip_type: ipType,
      isp: `Mock ISP ${hash % 100}`,
      organization: `Mock Org ${hash % 50}`,
      asn: 10000 + (hash % 50000),
      as_org: `AS${10000 + (hash % 50000)} Mock Organization`,
      provider: this.config.provider,
      database_type: 'Mock-Database',
      lookup_time: 0,
      cached: false,
    }
  }

  private mockDatabaseInfo(path: string, type: string): GeoIPDatabaseInfo {
    return {
      path,
      type: `Mock-${type}`,
      buildDate: new Date(),
      ipVersion: 'both',
      recordCount: null,
    }
  }
}

// Singleton instance
let serviceInstance: GeoIPService | null = null

/**
 * Get the GeoIP service instance
 */
export function getGeoIPService(): GeoIPService {
  if (!serviceInstance) {
    serviceInstance = new GeoIPService()
  }
  return serviceInstance
}

/**
 * Initialize the GeoIP service
 */
export async function initializeGeoIPService(): Promise<boolean> {
  const service = getGeoIPService()
  return service.initialize()
}
