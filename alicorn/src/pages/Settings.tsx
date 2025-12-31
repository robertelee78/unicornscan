/**
 * Settings page
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { config } from '@/lib/database'
import { useGeoIPService, type GeoIPProviderType } from '@/features/geoip'

export function Settings() {
  const {
    isReady,
    status,
    updateConfig,
    clearCache,
    testConnection,
    getConfig,
  } = useGeoIPService()

  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  const geoipConfig = getConfig()

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const result = await testConnection()
      setTestResult(result)
    } catch {
      setTestResult({ success: false, message: 'Test failed' })
    }
    setIsTesting(false)
  }

  const handleToggleEnabled = () => {
    updateConfig({ enabled: !geoipConfig.enabled })
  }

  const handleProviderChange = (provider: GeoIPProviderType) => {
    updateConfig({ provider })
  }

  const handleCacheSizeChange = (value: string) => {
    const size = parseInt(value, 10)
    if (!isNaN(size) && size > 0) {
      updateConfig({ cacheSize: size })
    }
  }

  const handleCacheTtlChange = (value: string) => {
    const ttl = parseInt(value, 10)
    if (!isNaN(ttl) && ttl > 0) {
      updateConfig({ cacheTtlMs: ttl * 1000 }) // Convert seconds to ms
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted mt-1">Configure Alicorn</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Database Connection</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted">Backend</dt>
              <dd>
                <Badge variant="default">{config.backend}</Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Status</dt>
              <dd>
                <Badge variant={config.isConfigured ? 'success' : 'warning'}>
                  {config.isConfigured ? 'Configured' : 'Not Configured'}
                </Badge>
              </dd>
            </div>
            {config.backend === 'supabase' && config.supabaseUrl && (
              <div className="flex items-center justify-between">
                <dt className="text-muted">Supabase URL</dt>
                <dd className="font-mono text-xs">{config.supabaseUrl}</dd>
              </div>
            )}
            {config.backend === 'postgrest' && config.postgrestUrl && (
              <div className="flex items-center justify-between">
                <dt className="text-muted">PostgREST URL</dt>
                <dd className="font-mono text-xs">{config.postgrestUrl}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            GeoIP Service
            {!isReady && (
              <Badge variant="warning">Initializing...</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Enable Live Lookups</p>
              <p className="text-sm text-muted">
                Enable live GeoIP lookups for IPs without stored data
              </p>
            </div>
            <Button
              variant={geoipConfig.enabled ? 'default' : 'outline'}
              size="sm"
              onClick={handleToggleEnabled}
            >
              {geoipConfig.enabled ? 'Enabled' : 'Disabled'}
            </Button>
          </div>

          {/* Provider Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Provider</label>
            <Select
              value={geoipConfig.provider}
              onValueChange={handleProviderChange}
              disabled={!geoipConfig.enabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="maxmind">MaxMind GeoIP2/GeoLite2</SelectItem>
                <SelectItem value="ipinfo">IPinfo (MMDB format)</SelectItem>
                <SelectItem value="ip2location">IP2Location</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted">
              Provider determines database format and field mapping
            </p>
          </div>

          {/* Cache Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Cache Size</label>
              <Input
                type="number"
                defaultValue={geoipConfig.cacheSize}
                onBlur={(e) => handleCacheSizeChange(e.target.value)}
                disabled={!geoipConfig.enabled}
                min={100}
                max={10000}
              />
              <p className="text-xs text-muted">Max cached lookups</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cache TTL (seconds)</label>
              <Input
                type="number"
                defaultValue={Math.floor(geoipConfig.cacheTtlMs / 1000)}
                onBlur={(e) => handleCacheTtlChange(e.target.value)}
                disabled={!geoipConfig.enabled}
                min={10}
                max={3600}
              />
              <p className="text-xs text-muted">Time entries remain cached</p>
            </div>
          </div>

          {/* Cache Statistics */}
          {status && status.cache && (
            <div className="rounded-md border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Cache Statistics</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearCache}
                  disabled={!geoipConfig.enabled}
                >
                  Clear Cache
                </Button>
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted">Entries</dt>
                  <dd className="font-mono">
                    {status.cache.size} / {status.cache.maxSize}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Hit Rate</dt>
                  <dd className="font-mono">
                    {(status.cache.hitRate * 100).toFixed(1)}%
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Hits</dt>
                  <dd className="font-mono">{status.cache.hits}</dd>
                </div>
                <div>
                  <dt className="text-muted">Misses</dt>
                  <dd className="font-mono">{status.cache.misses}</dd>
                </div>
              </dl>
            </div>
          )}

          {/* Database Info */}
          {status && status.databases && geoipConfig.enabled && (
            <div className="space-y-2">
              <span className="text-sm font-medium">Database Status</span>
              <div className="grid gap-2">
                {status.databases.city && (
                  <div className="flex items-center justify-between text-sm border-b border-border pb-2">
                    <span className="text-muted">City Database</span>
                    <Badge variant="success">{status.databases.city.type}</Badge>
                  </div>
                )}
                {status.databases.asn && (
                  <div className="flex items-center justify-between text-sm border-b border-border pb-2">
                    <span className="text-muted">ASN Database</span>
                    <Badge variant="success">{status.databases.asn.type}</Badge>
                  </div>
                )}
                {status.databases.anonymous && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Anonymous IP Database</span>
                    <Badge variant="success">{status.databases.anonymous.type}</Badge>
                  </div>
                )}
                {!status.databases.city && !status.databases.asn && !status.databases.anonymous && (
                  <p className="text-sm text-muted">
                    No databases configured. Using demo mode.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Test Connection */}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={!geoipConfig.enabled || isTesting}
            >
              {isTesting ? 'Testing...' : 'Test Connection'}
            </Button>
            {testResult && (
              <Badge variant={testResult.success ? 'success' : 'destructive'}>
                {testResult.message}
              </Badge>
            )}
          </div>

          {/* Error Display */}
          {status?.lastError && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{status.lastError}</p>
            </div>
          )}

          {/* Note about backend */}
          <p className="text-xs text-muted border-t border-border pt-4">
            Note: Live GeoIP lookups in the browser use demo data. For production,
            configure the backend C scanner with MMDB databases and data will be
            stored during scans.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Theme</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted text-sm">
            Theme switching will be implemented in Phase 5.1.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
