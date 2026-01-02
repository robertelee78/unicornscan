/**
 * GeoIP Section component for Statistics page
 * Comprehensive geographic visualization section
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useRecentScans } from '@/features/dashboard'
import {
  useGeoIPCountryBreakdown,
  useGeoIPMapPoints,
  useGeoIPStats,
  useGeoIPTypeBreakdown,
  useGeoIPAsnBreakdown,
  useHasGeoIP,
} from '../hooks'
import { GeoIPWorldMap } from './GeoIPWorldMap'
import { CountryDistributionChart } from './CountryDistributionChart'
import { IpTypeChart } from './IpTypeChart'
import { GeoIPCountryTable } from './GeoIPCountryTable'
import { GeoIPAsnTable } from './GeoIPAsnTable'

// =============================================================================
// Scan Selector Component
// =============================================================================

interface ScanSelectorProps {
  selectedScanId: number | null
  onSelect: (scanId: number) => void
}

function ScanSelector({ selectedScanId, onSelect }: ScanSelectorProps) {
  const { data: recentScans, isLoading } = useRecentScans('30d', 20)

  if (isLoading) {
    return (
      <div className="h-10 w-48 bg-muted/20 animate-pulse rounded" />
    )
  }

  if (!recentScans || recentScans.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No scans available
      </div>
    )
  }

  return (
    <select
      value={selectedScanId || ''}
      onChange={(e) => onSelect(Number(e.target.value))}
      className="h-10 px-3 py-2 bg-surface border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <option value="">Select a scan...</option>
      {recentScans.map((scan) => (
        <option key={scan.scan_id} value={scan.scan_id}>
          {scan.target_str} - {new Date(scan.s_time * 1000).toLocaleString()}
        </option>
      ))}
    </select>
  )
}

// =============================================================================
// GeoIP Stats Summary
// =============================================================================

interface GeoIPStatsSummaryProps {
  scanId: number
}

function GeoIPStatsSummary({ scanId }: GeoIPStatsSummaryProps) {
  const { data: stats, isLoading } = useGeoIPStats(scanId)

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

export function GeoIPSection() {
  const [selectedScanId, setSelectedScanId] = useState<number | null>(null)

  // Check if selected scan has GeoIP data
  const { hasGeoIP, isLoading: hasGeoIPLoading } = useHasGeoIP(selectedScanId || 0)

  // Fetch data for selected scan
  const { data: countryStats, isLoading: countryLoading } = useGeoIPCountryBreakdown(
    selectedScanId || 0
  )
  const { data: mapPoints, isLoading: mapLoading } = useGeoIPMapPoints(selectedScanId || 0)
  const typeBreakdown = useGeoIPTypeBreakdown(selectedScanId || 0)
  const asnBreakdown = useGeoIPAsnBreakdown(selectedScanId || 0, 15)

  return (
    <div className="space-y-6">
      {/* Header with scan selector */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Geographic Intelligence</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                GeoIP analysis of scanned hosts
              </p>
            </div>
            <ScanSelector
              selectedScanId={selectedScanId}
              onSelect={setSelectedScanId}
            />
          </div>
        </CardHeader>
      </Card>

      {/* Show placeholder if no scan selected */}
      {!selectedScanId && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <div className="text-4xl mb-3">🌍</div>
              <p>Select a scan above to view geographic distribution</p>
              <p className="text-sm mt-1">
                GeoIP data shows the geographic locations of scanned hosts
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Show loading state */}
      {selectedScanId && hasGeoIPLoading && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <div className="animate-spin text-2xl mb-3">⏳</div>
              <p>Loading GeoIP data...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Show "no data" message if scan has no GeoIP */}
      {selectedScanId && !hasGeoIPLoading && !hasGeoIP && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <div className="text-4xl mb-3">📍</div>
              <p>No GeoIP data available for this scan</p>
              <p className="text-sm mt-1">
                GeoIP enrichment may not have been enabled during this scan
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Show GeoIP visualizations if data is available */}
      {selectedScanId && !hasGeoIPLoading && hasGeoIP && (
        <>
          {/* Stats Summary */}
          <GeoIPStatsSummary scanId={selectedScanId} />

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
                  <span className="font-medium text-foreground">Historical Data</span>
                  <p className="mt-1">
                    GeoIP data is captured at scan time for historical accuracy.
                    IP-to-location mappings can change over time.
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
