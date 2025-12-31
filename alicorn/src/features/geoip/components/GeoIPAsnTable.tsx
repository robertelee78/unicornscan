/**
 * GeoIP ASN Table component
 * Sortable table showing Autonomous System statistics
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { GeoIPAsnStats } from '../types'

// =============================================================================
// Types
// =============================================================================

type SortField = 'asn' | 'as_org' | 'host_count' | 'countries'
type SortDirection = 'asc' | 'desc'

// =============================================================================
// Props
// =============================================================================

interface GeoIPAsnTableProps {
  data: GeoIPAsnStats[] | undefined
  isLoading: boolean
  title?: string
  maxRows?: number
  className?: string
  onAsnClick?: (asn: number) => void
}

// =============================================================================
// Component
// =============================================================================

export function GeoIPAsnTable({
  data,
  isLoading,
  title = 'Top Autonomous Systems',
  maxRows = 15,
  className,
  onAsnClick,
}: GeoIPAsnTableProps) {
  const [sortField, setSortField] = useState<SortField>('host_count')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const sortedData = useMemo(() => {
    if (!data) return []

    return [...data].sort((a, b) => {
      let aVal: number | string = 0
      let bVal: number | string = 0

      switch (sortField) {
        case 'asn':
          aVal = a.asn
          bVal = b.asn
          break
        case 'as_org':
          aVal = a.as_org || ''
          bVal = b.as_org || ''
          break
        case 'host_count':
          aVal = a.host_count
          bVal = b.host_count
          break
        case 'countries':
          aVal = a.countries.length
          bVal = b.countries.length
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
            No ASN data available
          </div>
        </CardContent>
      </Card>
    )
  }

  const totalHosts = data.reduce((sum, a) => sum + a.host_count, 0)

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {data.length} ASNs
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
                  onClick={() => handleSort('asn')}
                >
                  ASN{getSortIndicator('asn')}
                </th>
                <th
                  className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                  onClick={() => handleSort('as_org')}
                >
                  Organization{getSortIndicator('as_org')}
                </th>
                <th
                  className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                  onClick={() => handleSort('host_count')}
                >
                  Hosts{getSortIndicator('host_count')}
                </th>
                <th
                  className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                  onClick={() => handleSort('countries')}
                >
                  Countries{getSortIndicator('countries')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedData.map((asn) => {
                const percentage = ((asn.host_count / totalHosts) * 100).toFixed(1)

                return (
                  <tr
                    key={asn.asn}
                    className={`hover:bg-muted/20 ${onAsnClick ? 'cursor-pointer' : ''}`}
                    onClick={() => onAsnClick?.(asn.asn)}
                  >
                    <td className="px-3 py-2">
                      <span className="font-mono text-sm text-primary">AS{asn.asn}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-sm truncate max-w-[200px]">
                        {asn.as_org || 'Unknown'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="font-medium text-sm">{asn.host_count}</div>
                      <div className="text-xs text-muted-foreground">{percentage}%</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-sm">{asn.countries.length}</span>
                        {asn.countries.length > 0 && asn.countries.length <= 3 && (
                          <span className="text-xs text-muted-foreground">
                            ({asn.countries.join(', ')})
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {data.length > maxRows && (
          <div className="px-3 py-2 text-center text-xs text-muted-foreground border-t border-border">
            Showing top {maxRows} of {data.length} ASNs
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default GeoIPAsnTable
