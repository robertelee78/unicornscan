/**
 * GeoIP service exports
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// Types
export type {
  GeoIPProviderType,
  LiveGeoIPResult,
  GeoIPServiceConfig,
  GeoIPServiceStatus,
  GeoIPDatabaseInfo,
  GeoIPComparisonResult,
} from './types'

export { DEFAULT_GEOIP_CONFIG, GEOIP_CONFIG_STORAGE_KEY } from './types'

// Service
export { getGeoIPService, initializeGeoIPService } from './service'

// Cache
export { GeoIPCache } from './cache'
