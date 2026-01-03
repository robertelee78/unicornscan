/**
 * Top ports chart component
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { PortCount } from './types'

// Common port names for display
const PORT_NAMES: Record<number, string> = {
  21: 'FTP',
  22: 'SSH',
  23: 'Telnet',
  25: 'SMTP',
  53: 'DNS',
  80: 'HTTP',
  110: 'POP3',
  111: 'RPC',
  135: 'MSRPC',
  139: 'NetBIOS',
  143: 'IMAP',
  443: 'HTTPS',
  445: 'SMB',
  993: 'IMAPS',
  995: 'POP3S',
  1433: 'MSSQL',
  1521: 'Oracle',
  3306: 'MySQL',
  3389: 'RDP',
  5432: 'PostgreSQL',
  5900: 'VNC',
  6379: 'Redis',
  8080: 'HTTP-Alt',
  8443: 'HTTPS-Alt',
  27017: 'MongoDB',
}

interface TopPortsProps {
  ports: PortCount[] | undefined
  isLoading: boolean
}

export function TopPorts({ ports, isLoading }: TopPortsProps) {
  const maxCount = ports?.[0]?.count || 1

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Top Ports</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-muted text-sm">Loading...</div>
        ) : !ports || ports.length === 0 ? (
          <div className="text-muted text-sm">No port data in selected time range</div>
        ) : (
          <div className="space-y-3">
            {ports.map((port) => (
              <div key={`${port.protocol}-${port.port}`} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{port.port}</span>
                    <span className="text-muted">
                      {PORT_NAMES[port.port] || port.protocol.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {port.protocol}
                    </Badge>
                    <span className="font-mono text-muted">{port.count}</span>
                  </div>
                </div>
                <div className="h-2 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(port.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
