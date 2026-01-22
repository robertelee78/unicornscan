/**
 * GeoIP Section component for Statistics page
 * Comprehensive geographic visualization section
 * Now uses time-range filtering to match Statistics page time selector
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type TimeRange, getTimeRangeLabel } from '@/features/dashboard/types'
import {
  useGeoIPCountryBreakdownForTimeRange,
  useGeoIPMapPointsForTimeRange,
  useGeoIPStatsForTimeRange,
  useGeoIPTypeBreakdownForTimeRange,
  useGeoIPAsnBreakdownForTimeRange,
  useHasGeoIPForTimeRange,
} from '../hooks'
import { GeoIPWorldMap } from './GeoIPWorldMap'
import { CountryDistributionChart } from './CountryDistributionChart'
import { IpTypeChart } from './IpTypeChart'
import { GeoIPCountryTable } from './GeoIPCountryTable'
import { GeoIPAsnTable } from './GeoIPAsnTable'

// =============================================================================
// GeoIP Stats Summary
// =============================================================================

interface GeoIPStatsSummaryProps {
  timeRange: TimeRange
}

function GeoIPStatsSummary({ timeRange }: GeoIPStatsSummaryProps) {
  const { data: stats, isLoading } = useGeoIPStatsForTimeRange(timeRange)

  if (isLoading || !stats) {
    return null
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-4">
          <div className="text-2xl font-bold">{stats.hosts_with_geoip}</div>
          <div className="text-xs text-muted-foreground">Hosts with GeoIP</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="text-2xl font-bold">{stats.country_count}</div>
          <div className="text-xs text-muted-foreground">Countries</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="text-2xl font-bold">{stats.asn_count}</div>
          <div className="text-xs text-muted-foreground">Autonomous Systems</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="text-2xl font-bold">
            {stats.coverage_percentage.toFixed(0)}%
          </div>
          <div className="text-xs text-muted-foreground">GeoIP Coverage</div>
        </CardContent>
      </Card>
    </div>
  )
}

// =============================================================================
// Main GeoIP Section Component
// =============================================================================

interface GeoIPSectionProps {
  timeRange: TimeRange
}

export function GeoIPSection({ timeRange }: GeoIPSectionProps) {
  // Check if time range has GeoIP data (stored or live-lookupable)
  const { data: hasGeoIP, isLoading: hasGeoIPLoading } = useHasGeoIPForTimeRange(timeRange)

  // Fetch data for selected time range
  const { data: countryStats, isLoading: countryLoading } = useGeoIPCountryBreakdownForTimeRange(timeRange)
  const { data: mapPoints, isLoading: mapLoading } = useGeoIPMapPointsForTimeRange(timeRange)
  const typeBreakdown = useGeoIPTypeBreakdownForTimeRange(timeRange)
  const asnBreakdown = useGeoIPAsnBreakdownForTimeRange(timeRange, 15)

  return (
    <div className="space-y-6">
      {/* Header - now shows time range instead of scan selector */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Geographic Intelligence</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                GeoIP analysis of scanned hosts ({getTimeRangeLabel(timeRange)})
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Show loading state */}
      {hasGeoIPLoading && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <div className="animate-spin text-2xl mb-3">⏳</div>
              <p>Loading GeoIP data...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Show "no data" message if no GeoIP data available */}
      {!hasGeoIPLoading && !hasGeoIP && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <div className="text-4xl mb-3">📍</div>
              <p>No GeoIP data available</p>
              <p className="text-sm mt-1">
                No scans with GeoIP data found in the selected time range
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Show GeoIP visualizations if data is available */}
      {!hasGeoIPLoading && hasGeoIP && (
        <>
          {/* Stats Summary */}
          <GeoIPStatsSummary timeRange={timeRange} />

          {/* World Map - Full width */}
          <GeoIPWorldMap
            points={mapPoints}
            isLoading={mapLoading}
            title="Host Locations"
            height={450}
          />

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CountryDistributionChart
              data={countryStats}
              isLoading={countryLoading}
              title="Top Countries by Host Count"
              height={320}
              maxCountries={10}
            />
            <IpTypeChart
              data={typeBreakdown}
              isLoading={false}
              title="IP Type Distribution"
              height={320}
            />
          </div>

          {/* Tables Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GeoIPCountryTable
              data={countryStats}
              isLoading={countryLoading}
              title="Country Breakdown"
              maxRows={15}
            />
            <GeoIPAsnTable
              data={asnBreakdown}
              isLoading={false}
              title="Top Autonomous Systems"
              maxRows={15}
            />
          </div>

          {/* Info panel */}
          <Card className="bg-surface">
            <CardContent className="py-4">
              <h3 className="font-medium mb-2 text-sm">About GeoIP Data</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Geographic Location</span>
                  <p className="mt-1">
                    IP addresses are mapped to geographic locations using GeoIP databases.
                    Accuracy varies: country-level is typically 99%+, city-level around 80%.
                  </p>
                </div>
                <div>
                  <span className="font-medium text-foreground">IP Type Classification</span>
                  <p className="mt-1">
                    When available, IPs are classified as residential, datacenter, VPN, proxy,
                    Tor, or mobile. This requires extended GeoIP database features.
                  </p>
                </div>
                <div>
                  <span className="font-medium text-foreground">ASN Information</span>
                  <p className="mt-1">
                    Autonomous System Numbers (ASNs) identify network operators.
                    Useful for identifying hosting providers, ISPs, and CDNs.
                  </p>
                </div>
                <div>
                  <span className="font-medium text-foreground">Time Range Aggregation</span>
                  <p className="mt-1">
                    Data is aggregated from all scans within the selected time range.
                    IPs are deduplicated across scans for accurate unique counts.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

export default GeoIPSection
