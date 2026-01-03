/**
 * Raw data tab - JSON view of scan and report data
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Scan, IpReport } from '@/types/database'

interface RawDataTabProps {
  scan: Scan
  reports: IpReport[]
}

export function RawDataTab({ scan, reports }: RawDataTabProps) {
  const [copied, setCopied] = useState(false)

  const rawData = {
    scan: {
      scan_id: scan.scan_id,
      s_time: scan.s_time,
      e_time: scan.e_time,
      profile: scan.profile,
      target_str: scan.target_str,
      port_str: scan.port_str,
      mode_str: scan.mode_str,
      pps: scan.pps,
      user: scan.user,
      modules: scan.modules,
      covertness: scan.covertness,
      scan_notes: scan.scan_notes,
      scan_metadata: scan.scan_metadata,
    },
    reports: reports.map((r) => ({
      ipreport_id: r.ipreport_id,
      host_addr: r.host_addr,
      dport: r.sport,
      proto: r.proto,
      ttl: r.ttl,
      flags: r.flags,
      subtype: r.subtype,
      window_size: r.window_size,
      tstamp: r.tstamp,
    })),
    summary: {
      total_reports: reports.length,
      unique_hosts: [...new Set(reports.map((r) => r.host_addr))].length,
      unique_ports: [...new Set(reports.map((r) => r.sport))].length,
    },
  }

  const jsonString = JSON.stringify(rawData, null, 2)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Raw scan data in JSON format
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-8"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-1" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-1" />
              Copy JSON
            </>
          )}
        </Button>
      </div>
      <pre className="bg-muted/50 border border-border rounded-lg p-4 overflow-auto max-h-[600px] text-xs font-mono">
        {jsonString}
      </pre>
    </div>
  )
}
