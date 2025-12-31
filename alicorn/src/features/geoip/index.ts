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

// Hooks
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
} from './hooks'
