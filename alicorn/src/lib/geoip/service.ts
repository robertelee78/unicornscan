/**
 * Live GeoIP lookup service using maxmind npm package
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
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

    // Skip private/RFC1918 addresses - they have no meaningful geolocation
    if (this.isPrivateIp(ip)) {
      return null
    }

    // Check cache first
    const cached = this.cache.get(ip)
    if (cached) {
      return cached
    }

    const startTime = performance.now()

    try {
      // Call the GeoIP API
      const apiUrl = import.meta.env.VITE_GEOIP_URL || 'http://localhost:3001'
      const response = await fetch(`${apiUrl}/lookup/${encodeURIComponent(ip)}`)

      if (!response.ok) {
        // API returned error - return null (no data)
        return null
      }

      const data = await response.json()

      // Map API response to LiveGeoIPResult
      const result: LiveGeoIPResult = {
        country_code: data.country_code || null,
        country_name: data.country_name || null,
        region_code: data.region_code || null,
        region_name: data.region_name || null,
        city: data.city || null,
        postal_code: data.postal_code || null,
        latitude: data.latitude || null,
        longitude: data.longitude || null,
        timezone: data.timezone || null,
        ip_type: data.ip_type || null,
        isp: data.isp || null,
        organization: data.organization || null,
        asn: data.asn || null,
        as_org: data.as_org || null,
        provider: data.provider || 'unknown',
        database_type: data.database_type || 'unknown',
        lookup_time: performance.now() - startTime,
        cached: false,
      }

      // Only cache if we got meaningful data
      if (result.country_code || result.asn) {
        this.cache.set(ip, result)
      }

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
   * Check if IP is a private/RFC1918 address (no meaningful geolocation)
   */
  private isPrivateIp(ip: string): boolean {
    const parts = ip.split('.').map(Number)
    if (parts.length !== 4) return false

    // 10.0.0.0/8
    if (parts[0] === 10) return true

    // 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true

    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true

    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true

    // 169.254.0.0/16 (link-local)
    if (parts[0] === 169 && parts[1] === 254) return true

    return false
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
