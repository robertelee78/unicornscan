/**
 * GeoIP Country Table component
 * Sortable table showing country-level statistics
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { GeoIPCountryStats } from '@/types/database'

// =============================================================================
// Types
// =============================================================================

type SortField = 'country' | 'host_count' | 'datacenter' | 'residential' | 'vpn' | 'asns'
type SortDirection = 'asc' | 'desc'

// =============================================================================
// Props
// =============================================================================

interface GeoIPCountryTableProps {
  data: GeoIPCountryStats[] | undefined
  isLoading: boolean
  title?: string
  maxRows?: number
  className?: string
  onCountryClick?: (countryCode: string) => void
}

// =============================================================================
// Helper: Convert country code to emoji flag
// =============================================================================

function countryCodeToFlag(countryCode: string | null): string {
  if (!countryCode || countryCode.length !== 2) return '🌍'

  // Regional indicator symbols: A=127462, B=127463, etc.
  const offset = 127397
  const chars = countryCode
    .toUpperCase()
    .split('')
    .map((char) => String.fromCodePoint(char.charCodeAt(0) + offset))

  return chars.join('')
}

// =============================================================================
// Component
// =============================================================================

export function GeoIPCountryTable({
  data,
  isLoading,
  title = 'Country Breakdown',
  maxRows = 20,
  className,
  onCountryClick,
}: GeoIPCountryTableProps) {
  const [sortField, setSortField] = useState<SortField>('host_count')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const sortedData = useMemo(() => {
    if (!data) return []

    return [...data].sort((a, b) => {
      let aVal: number | string = 0
      let bVal: number | string = 0

      switch (sortField) {
        case 'country':
          aVal = a.country_name || a.country_code || ''
          bVal = b.country_name || b.country_code || ''
          break
        case 'host_count':
          aVal = a.host_count
          bVal = b.host_count
          break
        case 'datacenter':
          aVal = a.datacenter_count
          bVal = b.datacenter_count
          break
        case 'residential':
          aVal = a.residential_count
          bVal = b.residential_count
          break
        case 'vpn':
          aVal = a.vpn_count
          bVal = b.vpn_count
          break
        case 'asns':
          aVal = a.unique_asns
          bVal = b.unique_asns
          break
      }

      if (typeof aVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal)
      }

      return sortDirection === 'asc' ? aVal - (bVal as number) : (bVal as number) - aVal
    }).slice(0, maxRows)
  }, [data, sortField, sortDirection, maxRows])

  const handleSort = useCallback((field: SortField) => {
    setSortField((currentField) => {
      if (currentField === field) {
        setSortDirection((dir) => (dir === 'asc' ? 'desc' : 'asc'))
        return currentField
      }
      setSortDirection('desc')
      return field
    })
  }, [])

  const getSortIndicator = (field: SortField) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center bg-muted/20 animate-pulse rounded">
            <span className="text-muted-foreground text-sm">Loading...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            No country data available
          </div>
        </CardContent>
      </Card>
    )
  }

  const totalHosts = data.reduce((sum, c) => sum + c.host_count, 0)
  const hasIpTypeData = data.some((c) =>
    c.datacenter_count > 0 || c.residential_count > 0 || c.vpn_count > 0
  )

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {data.length} countries
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30 border-y border-border">
              <tr>
                <th
                  className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                  onClick={() => handleSort('country')}
                >
                  Country{getSortIndicator('country')}
                </th>
                <th
                  className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                  onClick={() => handleSort('host_count')}
                >
                  Hosts{getSortIndicator('host_count')}
                </th>
                <th
                  className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                  onClick={() => handleSort('asns')}
                >
                  ASNs{getSortIndicator('asns')}
                </th>
                {hasIpTypeData && (
                  <>
                    <th
                      className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                      onClick={() => handleSort('datacenter')}
                    >
                      DC{getSortIndicator('datacenter')}
                    </th>
                    <th
                      className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                      onClick={() => handleSort('residential')}
                    >
                      Res{getSortIndicator('residential')}
                    </th>
                    <th
                      className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                      onClick={() => handleSort('vpn')}
                    >
                      VPN{getSortIndicator('vpn')}
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedData.map((country) => {
                const percentage = ((country.host_count / totalHosts) * 100).toFixed(1)

                return (
                  <tr
                    key={country.country_code || 'unknown'}
                    className={`hover:bg-muted/20 ${onCountryClick ? 'cursor-pointer' : ''}`}
                    onClick={() => onCountryClick?.(country.country_code || '')}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg leading-none">
                          {countryCodeToFlag(country.country_code)}
                        </span>
                        <div>
                          <div className="font-medium text-sm">
                            {country.country_name || 'Unknown'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {country.country_code || '??'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="font-medium text-sm">{country.host_count}</div>
                      <div className="text-xs text-muted-foreground">{percentage}%</div>
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-muted-foreground">
                      {country.unique_asns}
                    </td>
                    {hasIpTypeData && (
                      <>
                        <td className="px-3 py-2 text-right text-sm">
                          {country.datacenter_count > 0 ? (
                            <span className="text-blue-500">{country.datacenter_count}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-sm">
                          {country.residential_count > 0 ? (
                            <span className="text-green-500">{country.residential_count}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-sm">
                          {country.vpn_count > 0 ? (
                            <span className="text-amber-500">{country.vpn_count}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {data.length > maxRows && (
          <div className="px-3 py-2 text-center text-xs text-muted-foreground border-t border-border">
            Showing top {maxRows} of {data.length} countries
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default GeoIPCountryTable
