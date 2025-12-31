/**
 * Settings page
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { config } from '@/lib/database'

export function Settings() {
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
