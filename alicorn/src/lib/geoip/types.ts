/**
 * Live GeoIP service types
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import type { IpType } from '@/types/database'

/**
 * GeoIP provider identifiers matching backend providers
 */
export type GeoIPProviderType = 'maxmind' | 'ipinfo' | 'ip2location'

/**
 * Result from a live GeoIP lookup
 */
export interface LiveGeoIPResult {
  // Geographic data
  country_code: string | null
  country_name: string | null
  region_code: string | null
  region_name: string | null
  city: string | null
  postal_code: string | null
  latitude: number | null
  longitude: number | null
  timezone: string | null

  // Network data (may not be available in free databases)
  ip_type: IpType | null
  isp: string | null
  organization: string | null
  asn: number | null
  as_org: string | null

  // Metadata
  provider: GeoIPProviderType
  database_type: string
  lookup_time: number // milliseconds
  cached: boolean
}

/**
 * GeoIP service configuration
 */
export interface GeoIPServiceConfig {
  // Database paths (relative to application or absolute)
  cityDbPath: string | null
  asnDbPath: string | null
  anonymousDbPath: string | null

  // Provider selection
  provider: GeoIPProviderType

  // Cache settings
  cacheSize: number
  cacheTtlMs: number

  // Feature flags
  enabled: boolean
}

/**
 * Default configuration
 */
export const DEFAULT_GEOIP_CONFIG: GeoIPServiceConfig = {
  cityDbPath: null,
  asnDbPath: null,
  anonymousDbPath: null,
  provider: 'maxmind',
  cacheSize: 1000,
  cacheTtlMs: 60000, // 1 minute
  enabled: true, // Enabled by default when GeoIP API container is available
}

/**
 * Storage key for persisting configuration
 */
export const GEOIP_CONFIG_STORAGE_KEY = 'alicorn:geoip:config'

/**
 * GeoIP database metadata
 */
export interface GeoIPDatabaseInfo {
  path: string
  type: string // e.g., "GeoLite2-City", "GeoIP2-ASN"
  buildDate: Date | null
  ipVersion: 4 | 6 | 'both'
  recordCount: number | null
}

/**
 * Service status
 */
export interface GeoIPServiceStatus {
  initialized: boolean
  enabled: boolean
  provider: GeoIPProviderType | null
  databases: {
    city: GeoIPDatabaseInfo | null
    asn: GeoIPDatabaseInfo | null
    anonymous: GeoIPDatabaseInfo | null
  }
  cache: {
    size: number
    maxSize: number
    hits: number
    misses: number
    hitRate: number
  }
  lastError: string | null
}

/**
 * Comparison result between stored and live lookup
 */
export interface GeoIPComparisonResult {
  ip: string
  stored: {
    data: LiveGeoIPResult | null
    lookupTime: Date | null
  }
  live: {
    data: LiveGeoIPResult | null
    lookupTime: Date
  }
  differences: {
    field: string
    storedValue: unknown
    liveValue: unknown
  }[]
  hasMoved: boolean // true if country or city changed
}
