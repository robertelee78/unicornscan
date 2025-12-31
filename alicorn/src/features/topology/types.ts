/**
 * Network topology visualization types
 * OPTE/Kaminsky inspired graph data structures
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import type { OsFamily } from '@/types/database'

// =============================================================================
// Graph Node Types
// =============================================================================

export type NodeType = 'scanner' | 'host' | 'router' | 'unknown'

export interface TopologyNode {
  id: string           // IP address as unique identifier
  type: NodeType

  // Display properties
  label: string        // Usually IP, or hostname if known
  osFamily: OsFamily
  osGuess?: string     // Full OS guess string if available

  // Metrics for sizing/coloring
  portCount: number
  connectionCount: number  // How many edges connect to this node

  // TTL-based distance estimation
  observedTtl?: number
  estimatedHops: number

  // Timestamps
  firstSeen?: number
  lastSeen?: number

  // For D3 force simulation
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null  // Fixed x position (for pinned nodes)
  fy?: number | null  // Fixed y position
}

// =============================================================================
// Graph Edge Types
// =============================================================================

export interface TopologyEdge {
  id: string
  source: string | TopologyNode  // D3 will replace string with node reference
  target: string | TopologyNode

  // Edge metadata
  hopNumber?: number
  rttUs?: number      // Round-trip time in microseconds

  // For visualization
  strength?: number   // Edge strength for force simulation
}

// =============================================================================
// Complete Graph Data
// =============================================================================

export interface TopologyData {
  nodes: TopologyNode[]
  edges: TopologyEdge[]

  // Metadata
  scannerAddr?: string   // The scanner's IP (center node)
  scansId?: number
  nodeCount: number
  edgeCount: number

  // Scale indicators
  needsAggregation: boolean  // True if too many nodes for standard rendering
}

// =============================================================================
// Visualization Configuration
// =============================================================================

export interface TopologyConfig {
  // Layout
  width: number
  height: number

  // Force simulation parameters
  chargeStrength: number       // Negative = repulsion between nodes
  linkDistance: number         // Target distance for edges
  centerStrength: number       // Pull toward center

  // Visual settings
  minNodeRadius: number
  maxNodeRadius: number
  showLabels: boolean
  showEdges: boolean

  // Performance
  maxNodesForLabels: number    // Hide labels above this count
  useCanvas: boolean           // Canvas vs SVG rendering
}

export const DEFAULT_TOPOLOGY_CONFIG: TopologyConfig = {
  width: 800,
  height: 600,
  chargeStrength: -100,
  linkDistance: 80,
  centerStrength: 0.05,
  minNodeRadius: 4,
  maxNodeRadius: 20,
  showLabels: true,
  showEdges: true,
  maxNodesForLabels: 100,
  useCanvas: false,
}

// =============================================================================
// Filter State
// =============================================================================

export interface TopologyFilters {
  scansId?: number
  since?: number        // Unix timestamp
  minPorts?: number     // Only show hosts with >= N ports
  osFamily?: OsFamily[] // Filter by OS family
  subnet?: string       // Filter by subnet (e.g., "192.168.1.0/24")
}

// =============================================================================
// Render Mode
// =============================================================================

export type RenderMode = 'svg' | 'canvas' | 'webgl'

export function selectRenderMode(nodeCount: number): RenderMode {
  if (nodeCount < 500) return 'svg'
  if (nodeCount < 10000) return 'canvas'
  return 'webgl'
}
