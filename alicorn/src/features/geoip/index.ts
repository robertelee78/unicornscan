/**
 * GeoIP feature exports
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// Types
export type {
  IpType,
  GeoIPProvider,
  GeoIPRecord,
  GeoIPCountryStats,
  GeoIPTypeDistribution,
  GeoIPAsnStats,
  GeoIPRegionSummary,
  GeoIPScanStats,
  GeoIPQueryOptions,
  HostWithGeoIP,
  GeoIPMapPoint,
  GeoIPMapCluster,
  GeoIPExportData,
} from './types'

export {
  DEFAULT_GEOIP_QUERY_OPTIONS,
  IP_TYPE_CONFIG,
  getIpTypeConfig,
} from './types'

// Live GeoIP types and service
export type {
  GeoIPProviderType,
  LiveGeoIPResult,
  GeoIPServiceConfig,
  GeoIPServiceStatus,
  GeoIPDatabaseInfo,
  GeoIPComparisonResult,
} from '@/lib/geoip'

export {
  DEFAULT_GEOIP_CONFIG,
  GEOIP_CONFIG_STORAGE_KEY,
  getGeoIPService,
  initializeGeoIPService,
} from '@/lib/geoip'

// Hooks - Database GeoIP (scan-based)
export {
  geoipKeys,
  useGeoIP,
  useGeoIPHistory,
  useScanGeoIP,
  useGeoIPStats,
  useGeoIPCountryBreakdown,
  useGeoIPTypeBreakdown,
  useGeoIPMapPoints,
  useGeoIPAsnBreakdown,
  useHasGeoIP,
  // Time-range-based hooks for Statistics page
  useHasGeoIPForTimeRange,
  useGeoIPCountryBreakdownForTimeRange,
  useGeoIPMapPointsForTimeRange,
  useGeoIPTypeBreakdownForTimeRange,
  useGeoIPAsnBreakdownForTimeRange,
  useGeoIPStatsForTimeRange,
} from './hooks'

// Hooks - Live GeoIP Lookups
export {
  liveGeoipKeys,
  useGeoIPService,
  useLiveGeoIPLookup,
  useLiveGeoIPBatch,
  useLiveGeoIPMutation,
  useGeoIPComparison,
  useGeoIPStatus,
} from './live-hooks'

// Components
export {
  GeoIPWorldMap,
  CountryDistributionChart,
  IpTypeChart,
  GeoIPCountryTable,
  GeoIPAsnTable,
  GeoIPSection,
} from './components'
