/**
 * Charts feature module
 * Port trend, timeline, and statistics visualizations
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// Types
export * from './types'

// Port category utilities
export {
  PORT_CATEGORIES,
  getPortCategory,
  getCategoryConfig,
  getCategoryIcon,
  getCategoryColor,
  groupPortsByCategory,
  getAllCategories,
  isPortInCategory,
  getPortsForCategory,
} from './portCategories'

// Hooks
export {
  chartKeys,
  useHostPortTrend,
  usePortTimeline,
  useGlobalProtocolDistribution,
  useHostComparison,
  // Statistics page hooks
  useServiceDistribution,
  useTTLDistribution,
  useWindowSizeDistribution,
  usePortActivityHeatmap,
  useScanPerformanceStats,
  useProtocolBreakdown,
} from './hooks'

// Components
export { PortTrendChart } from './PortTrendChart'
export { ProtocolDistribution } from './ProtocolDistribution'
export { PortTimeline } from './PortTimeline'
// Statistics page components
export { ServiceDistributionChart } from './ServiceDistributionChart'
export { PortActivityHeatmap } from './PortActivityHeatmap'
export { ScanPerformanceStatsCards } from './ScanPerformanceStatsCards'
export { ProtocolBreakdownChart } from './ProtocolBreakdownChart'
// OS Fingerprinting charts (available for future use, not currently in Statistics page)
export { TTLHistogram } from './TTLHistogram'
export { WindowSizeChart } from './WindowSizeChart'
