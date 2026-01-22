/**
 * GeoIP World Map component
 * Leaflet-based map showing geographic distribution of scanned hosts
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useMemo, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression, Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getIpTypeConfig } from '../types'
import type { GeoIPMapPoint } from '../types'

// =============================================================================
// Map Bounds Component
// =============================================================================

interface MapBoundsProps {
  points: GeoIPMapPoint[]
}

function MapBounds({ points }: MapBoundsProps) {
  const map = useMap()

  useEffect(() => {
    if (points.length === 0) return

    const bounds: LatLngBoundsExpression = points.map((p) => [p.latitude, p.longitude] as [number, number])

    if (points.length === 1) {
      // Single point - center on it with reasonable zoom
      map.setView([points[0].latitude, points[0].longitude], 6)
    } else {
      // Multiple points - fit bounds
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 })
    }
  }, [map, points])

  return null
}

// =============================================================================
// Props
// =============================================================================

interface GeoIPWorldMapProps {
  points: GeoIPMapPoint[] | undefined
  isLoading: boolean
  title?: string
  height?: number
  className?: string
  onPointClick?: (point: GeoIPMapPoint) => void
}

// =============================================================================
// Component
// =============================================================================

export function GeoIPWorldMap({
  points,
  isLoading,
  title = 'Geographic Distribution',
  height = 400,
  className,
  onPointClick,
}: GeoIPWorldMapProps) {
  const mapRef = useRef<LeafletMap | null>(null)

  // Cluster nearby points to avoid overlapping markers
  const clusteredPoints = useMemo(() => {
    if (!points || points.length === 0) return []

    // Simple clustering: group by rounded coordinates
    const clusters = new Map<string, { lat: number; lng: number; points: GeoIPMapPoint[] }>()

    points.forEach((point) => {
      // Round to 1 decimal place for clustering (~11km at equator)
      const key = `${Math.round(point.latitude * 10) / 10},${Math.round(point.longitude * 10) / 10}`
      const existing = clusters.get(key)

      if (existing) {
        existing.points.push(point)
        // Update center to average
        existing.lat = (existing.lat + point.latitude) / 2
        existing.lng = (existing.lng + point.longitude) / 2
      } else {
        clusters.set(key, {
          lat: point.latitude,
          lng: point.longitude,
          points: [point],
        })
      }
    })

    return Array.from(clusters.values())
  }, [points])

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex items-center justify-center bg-muted/20 animate-pulse rounded"
            style={{ height }}
          >
            <span className="text-muted-foreground text-sm">Loading map...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!points || points.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex items-center justify-center text-muted-foreground text-sm border border-dashed border-border rounded"
            style={{ height }}
          >
            No geographic data available
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {points.length} hosts
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div style={{ height }} className="rounded-b-lg overflow-hidden">
          <MapContainer
            ref={mapRef}
            center={[20, 0]}
            zoom={2}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={true}
            className="z-0"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapBounds points={points} />

            {clusteredPoints.map((cluster, idx) => {
              const count = cluster.points.length
              const radius = Math.min(Math.max(6, Math.sqrt(count) * 4), 25)

              // Use first point's IP type for color, or default
              const primaryType = cluster.points[0].ip_type
              const config = getIpTypeConfig(primaryType)

              return (
                <CircleMarker
                  key={idx}
                  center={[cluster.lat, cluster.lng]}
                  radius={radius}
                  pathOptions={{
                    color: config.color,
                    fillColor: config.color,
                    fillOpacity: 0.7,
                    weight: 2,
                  }}
                  eventHandlers={{
                    click: () => {
                      if (onPointClick && cluster.points.length === 1) {
                        onPointClick(cluster.points[0])
                      }
                    },
                  }}
                >
                  <Popup>
                    <div className="text-sm min-w-[200px]">
                      {cluster.points.length === 1 ? (
                        // Single host popup
                        <>
                          <div className="font-semibold mb-1">{cluster.points[0].host_ip}</div>
                          {cluster.points[0].city && (
                            <div className="text-gray-600">
                              {cluster.points[0].city}
                              {cluster.points[0].country_code && `, ${cluster.points[0].country_code}`}
                            </div>
                          )}
                          {cluster.points[0].ip_type && (
                            <div className="mt-1">
                              <span
                                className="inline-block px-1.5 py-0.5 rounded text-xs text-white"
                                style={{ backgroundColor: config.color }}
                              >
                                {config.label}
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        // Cluster popup
                        <>
                          <div className="font-semibold mb-1">{count} hosts</div>
                          <div className="text-gray-600 text-xs max-h-32 overflow-y-auto">
                            {cluster.points.slice(0, 10).map((p, i) => (
                              <div key={i}>{p.host_ip}</div>
                            ))}
                            {cluster.points.length > 10 && (
                              <div className="text-gray-500">...and {cluster.points.length - 10} more</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })}
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export default GeoIPWorldMap
