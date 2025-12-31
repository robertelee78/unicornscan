/**
 * Charts feature module
 * Port trend, timeline, and statistics visualizations
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// Types
export * from './types'

// Hooks
export {
  chartKeys,
  useHostPortTrend,
  usePortTimeline,
  useGlobalProtocolDistribution,
  useHostComparison,
  // Phase 3.3 hooks
  useServiceDistribution,
  useTTLDistribution,
  useWindowSizeDistribution,
  usePortActivityHeatmap,
} from './hooks'

// Components
export { PortTrendChart } from './PortTrendChart'
export { ProtocolDistribution } from './ProtocolDistribution'
export { PortTimeline } from './PortTimeline'
// Phase 3.3 components
export { ServiceDistributionChart } from './ServiceDistributionChart'
export { TTLHistogram } from './TTLHistogram'
export { WindowSizeChart } from './WindowSizeChart'
export { PortActivityHeatmap } from './PortActivityHeatmap'
