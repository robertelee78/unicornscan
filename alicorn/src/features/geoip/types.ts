/**
 * GeoIP feature types matching PostgreSQL schema v6
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

// Re-export core types from database types to avoid duplication
export type {
  IpType,
  GeoIPProvider,
  GeoIPRecord,
  GeoIPCountryStats,
  GeoIPQueryOptions,
} from '@/types/database'

// Import for use in this file
import type { IpType, GeoIPRecord, GeoIPCountryStats, GeoIPQueryOptions } from '@/types/database'

// =============================================================================
// Aggregate/Statistics Types (feature-specific extensions)
// =============================================================================

/**
 * IP type distribution for a scan
 */
export interface GeoIPTypeDistribution {
  ip_type: IpType
  count: number
  percentage: number
}

/**
 * ASN statistics
 */
export interface GeoIPAsnStats {
  asn: number
  as_org: string | null
  host_count: number
  countries: string[]
}

/**
 * Geographic region summary
 */
export interface GeoIPRegionSummary {
  country_code: string
  country_name: string
  regions: {
    region_code: string | null
    region_name: string | null
    city_count: number
    host_count: number
  }[]
  total_hosts: number
}

/**
 * Aggregate GeoIP statistics for a scan
 */
export interface GeoIPScanStats {
  scan_id: number
  total_hosts: number
  hosts_with_geoip: number
  coverage_percentage: number

  // Country breakdown
  country_count: number
  countries: GeoIPCountryStats[]

  // IP type breakdown (if available)
  type_distribution: GeoIPTypeDistribution[] | null

  // ASN breakdown (if available)
  asn_count: number
  top_asns: GeoIPAsnStats[]

  // Geographic bounds (for map visualization)
  bounds: {
    min_lat: number
    max_lat: number
    min_lng: number
    max_lng: number
  } | null
}

// Query options are re-exported from @/types/database above

// =============================================================================
// Host GeoIP View (combines host + geoip data)
// =============================================================================

/**
 * Host with GeoIP data joined (for HostDetail page)
 */
export interface HostWithGeoIP {
  // Host fields
  host_id: number
  ip_addr: string
  hostname: string | null
  os_guess: string | null

  // Most recent GeoIP data (may be from different scans)
  geoip: GeoIPRecord | null

  // Historical GeoIP lookups (shows IP movement over time)
  geoip_history?: GeoIPRecord[]
}

// =============================================================================
// Map Visualization Types
// =============================================================================

/**
 * Point for map visualization
 */
export interface GeoIPMapPoint {
  latitude: number
  longitude: number
  host_ip: string
  country_code: string | null
  city: string | null
  ip_type: IpType | null
  scan_id: number
}

/**
 * Clustered points for dense areas
 */
export interface GeoIPMapCluster {
  latitude: number
  longitude: number
  point_count: number
  country_code: string | null
  hosts: string[]  // IP addresses
}

// =============================================================================
// Export Types
// =============================================================================

export interface GeoIPExportData {
  scan_id: number
  exported_at: string
  total_records: number
  records: GeoIPRecord[]
  stats: GeoIPScanStats
}

// =============================================================================
// Default Values
// =============================================================================

export const DEFAULT_GEOIP_QUERY_OPTIONS: GeoIPQueryOptions = {
  limit: 100,
  offset: 0,
}

// =============================================================================
// IP Type Display Configuration
// =============================================================================

export const IP_TYPE_CONFIG: Record<IpType, { label: string; color: string; description: string }> = {
  residential: {
    label: 'Residential',
    color: 'var(--color-palette-1)',  // Green
    description: 'Home/consumer ISP connection',
  },
  datacenter: {
    label: 'Datacenter',
    color: 'var(--color-palette-2)',  // Blue
    description: 'Cloud provider or hosting facility',
  },
  vpn: {
    label: 'VPN',
    color: 'var(--color-palette-3)',  // Amber
    description: 'Virtual Private Network endpoint',
  },
  proxy: {
    label: 'Proxy',
    color: 'var(--color-palette-4)',  // Red
    description: 'Proxy server or relay',
  },
  tor: {
    label: 'Tor',
    color: 'var(--color-palette-5)',  // Purple
    description: 'Tor exit node',
  },
  mobile: {
    label: 'Mobile',
    color: 'var(--color-palette-6)',  // Cyan
    description: 'Mobile carrier network',
  },
  unknown: {
    label: 'Unknown',
    color: 'var(--color-chart-other)',  // Gray
    description: 'IP type could not be determined',
  },
}

/**
 * Get display configuration for an IP type
 */
export function getIpTypeConfig(ipType: IpType | null | undefined): typeof IP_TYPE_CONFIG['unknown'] {
  if (!ipType || !(ipType in IP_TYPE_CONFIG)) {
    return IP_TYPE_CONFIG.unknown
  }
  return IP_TYPE_CONFIG[ipType]
}
