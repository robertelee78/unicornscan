/**
 * Topology feature exports
 * Network graph visualization for unicornscan
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// Components
export { NetworkGraph } from './NetworkGraph'
export { TopologyLegend } from './TopologyLegend'
export { TopologyControls } from './TopologyControls'

// Hooks
export {
  useTopologyForScan,
  useGlobalTopology,
  topologyKeys,
  aggregateBySubnet,
} from './hooks'

// Types
export type {
  NodeType,
  TopologyNode,
  TopologyEdge,
  TopologyData,
  TopologyConfig,
  TopologyFilters,
  RenderMode,
} from './types'

export { DEFAULT_TOPOLOGY_CONFIG, selectRenderMode } from './types'
