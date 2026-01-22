/**
 * Scan performance statistics cards component
 * Displays Response Rate, Host Hit Rate, and Total Packets
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { Card, CardContent } from '@/components/ui/card'
import { Activity, Target, Send } from 'lucide-react'
import type { ScanPerformanceStats } from './types'

// =============================================================================
// Props
// =============================================================================

interface ScanPerformanceStatsCardsProps {
  data: ScanPerformanceStats | undefined
  isLoading: boolean
  className?: string
}

// =============================================================================
// Stat Card Component
// =============================================================================

interface StatCardProps {
  title: string
  value: string
  subtitle: string
  icon: React.ReactNode
  colorClass: string
  isLoading?: boolean
}

function StatCard({ title, value, subtitle, icon, colorClass, isLoading }: StatCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {isLoading ? (
              <div className="h-8 w-24 bg-muted/20 animate-pulse rounded mt-1" />
            ) : (
              <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
            )}
            {isLoading ? (
              <div className="h-4 w-32 bg-muted/20 animate-pulse rounded mt-1" />
            ) : (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className={`p-3 rounded-full bg-muted/50`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function ScanPerformanceStatsCards({
  data,
  isLoading,
  className,
}: ScanPerformanceStatsCardsProps) {
  // Format percentage with 1 decimal
  const formatPercent = (value: number): string => {
    if (value === 0) return '0%'
    if (value < 0.1) return '<0.1%'
    if (value > 100) return '>100%'
    return `${value.toFixed(1)}%`
  }

  // Format large numbers with commas
  const formatNumber = (value: number): string => {
    return value.toLocaleString()
  }

  // Calculate color class based on percentage thresholds
  const getRateColorClass = (rate: number): string => {
    if (rate >= 50) return 'text-emerald-600'
    if (rate >= 20) return 'text-amber-600'
    return 'text-red-600'
  }

  const responseRate = data?.responseRate ?? 0
  const hostHitRate = data?.hostHitRate ?? 0
  const totalPackets = data?.totalPacketsSent ?? 0

  return (
    <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${className ?? ''}`}>
      <StatCard
        title="Response Rate"
        value={formatPercent(responseRate)}
        subtitle={`${formatNumber(data?.totalResponses ?? 0)} responses received`}
        icon={<Activity className="h-5 w-5 text-muted-foreground" />}
        colorClass={getRateColorClass(responseRate)}
        isLoading={isLoading}
      />
      <StatCard
        title="Host Hit Rate"
        value={formatPercent(hostHitRate)}
        subtitle={`${formatNumber(data?.totalHostsResponded ?? 0)} of ${formatNumber(data?.totalHostsTargeted ?? 0)} hosts responded`}
        icon={<Target className="h-5 w-5 text-muted-foreground" />}
        colorClass={getRateColorClass(hostHitRate)}
        isLoading={isLoading}
      />
      <StatCard
        title="Total Packets"
        value={formatNumber(totalPackets)}
        subtitle={`Across ${formatNumber(data?.scanCount ?? 0)} scans`}
        icon={<Send className="h-5 w-5 text-muted-foreground" />}
        colorClass="text-foreground"
        isLoading={isLoading}
      />
    </div>
  )
}

export default ScanPerformanceStatsCards
