/**
 * ARP results display for local network scans
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatTimestamp, formatMac } from '@/lib/utils'
import { ensureOuiLoaded, getVendorSync } from '@/lib/oui'
import type { ArpReport } from '@/types/database'

interface ArpResultsProps {
  arpReports: ArpReport[]
  isLoading: boolean
}

export function ArpResults({ arpReports, isLoading }: ArpResultsProps) {
  // Load OUI data for vendor lookup
  useEffect(() => {
    ensureOuiLoaded()
  }, [])

  if (isLoading) {
    return <div className="text-muted py-4 text-center">Loading ARP results...</div>
  }

  if (arpReports.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">ARP Discoveries</CardTitle>
          <Badge variant="secondary">{arpReports.length} host{arpReports.length !== 1 ? 's' : ''}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="pb-2 pr-4 font-medium">IP Address</th>
                <th className="pb-2 pr-4 font-medium">MAC Address</th>
                <th className="pb-2 pr-4 font-medium">Vendor</th>
                <th className="pb-2 font-medium">Discovered</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {arpReports.map((arp) => {
                const vendor = getVendorSync(arp.hwaddr)
                return (
                  <tr key={arp.arpreport_id} className="border-b border-border/50">
                    <td className="py-2 pr-4 text-primary">{arp.host_addr}</td>
                    <td className="py-2 pr-4">{formatMac(arp.hwaddr)}</td>
                    <td className="py-2 pr-4 text-xs max-w-[180px]">
                      {vendor ? (
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate block cursor-default">{vendor}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{vendor}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2 text-muted text-xs">
                      {formatTimestamp(arp.tstamp)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

