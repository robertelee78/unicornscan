/**
 * Network topology graph visualization
 * D3.js force-directed layout inspired by OPTE project aesthetic
 * Dan Kaminsky philosophy: make complex security data understandable
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useEffect, useRef, useState, useMemo } from 'react'
import * as d3 from 'd3'
import { cn } from '@/lib/utils'
import { getOsFamilyColor } from '@/types/database'
import {
  DEFAULT_TOPOLOGY_CONFIG,
  type TopologyData,
  type TopologyNode,
  type TopologyEdge,
  type TopologyConfig,
} from './types'

// =============================================================================
// D3 Type Extensions
// =============================================================================

type SimulationNode = TopologyNode & d3.SimulationNodeDatum
type SimulationLink = TopologyEdge & d3.SimulationLinkDatum<SimulationNode>

// =============================================================================
// Props
// =============================================================================

interface NetworkGraphProps {
  data: TopologyData
  config?: Partial<TopologyConfig>
  onNodeClick?: (node: TopologyNode) => void
  onNodeHover?: (node: TopologyNode | null) => void
  className?: string
}

// =============================================================================
// Node Sizing
// =============================================================================

/**
 * Calculate node radius based on port count and config
 * OPTE-style: more ports = larger node
 */
function getNodeRadius(
  node: TopologyNode,
  minRadius: number,
  maxRadius: number,
  maxPorts: number
): number {
  if (node.type === 'scanner') return maxRadius * 1.2 // Scanner is prominent
  if (maxPorts === 0) return minRadius

  const ratio = Math.min(node.portCount / maxPorts, 1)
  return minRadius + ratio * (maxRadius - minRadius)
}

/**
 * Get node color based on type and OS family
 * OPTE-style: categorical coloring by characteristic
 */
function getNodeColor(node: TopologyNode): string {
  if (node.type === 'scanner') return '#ef4444' // Red - scanner is the origin
  if (node.type === 'router') return '#f59e0b'  // Amber - network infrastructure
  return getOsFamilyColor(node.osFamily)
}

/**
 * Get node stroke (border) based on connection activity
 * Incandescence effect: more connections = brighter glow
 */
function getNodeStroke(node: TopologyNode, maxConnections: number): string {
  if (maxConnections === 0) return 'transparent'
  const intensity = Math.min(node.connectionCount / maxConnections, 1)
  const alpha = 0.3 + intensity * 0.7
  return `rgba(255, 255, 255, ${alpha})`
}

// =============================================================================
// Component
// =============================================================================

export function NetworkGraph({
  data,
  config: configOverrides,
  onNodeClick,
  onNodeHover,
  className,
}: NetworkGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const simulationRef = useRef<d3.Simulation<SimulationNode, SimulationLink> | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [hoveredNode, setHoveredNode] = useState<TopologyNode | null>(null)

  // Merge config with defaults (memoized to avoid unnecessary effect reruns)
  const config: TopologyConfig = useMemo(() => ({
    ...DEFAULT_TOPOLOGY_CONFIG,
    ...configOverrides,
    width: dimensions.width,
    height: dimensions.height,
  }), [configOverrides, dimensions.width, dimensions.height])

  // Calculate scale factors for visualization
  const maxPorts = Math.max(...data.nodes.map(n => n.portCount), 1)
  const maxConnections = Math.max(...data.nodes.map(n => n.connectionCount), 1)

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })

    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  // Build and run D3 simulation
  useEffect(() => {
    if (!svgRef.current || data.nodes.length === 0) return

    const svg = d3.select(svgRef.current)

    // Clear previous render
    svg.selectAll('*').remove()

    // Create container groups for layering
    const container = svg.append('g').attr('class', 'topology-container')
    const edgeGroup = container.append('g').attr('class', 'edges')
    const nodeGroup = container.append('g').attr('class', 'nodes')
    const labelGroup = container.append('g').attr('class', 'labels')

    // Prepare simulation data (D3 mutates nodes for position)
    const nodes: SimulationNode[] = data.nodes.map(n => ({ ...n }))
    const edges: SimulationLink[] = data.edges.map(e => ({
      ...e,
      source: e.source as string,
      target: e.target as string,
    }))

    // Create force simulation
    // OPTE philosophy: let the data find its natural structure
    const simulation = d3.forceSimulation<SimulationNode>(nodes)
      .force('link', d3.forceLink<SimulationNode, SimulationLink>(edges)
        .id(d => d.id)
        .distance(config.linkDistance)
        .strength(0.5))
      .force('charge', d3.forceManyBody()
        .strength(config.chargeStrength)
        .distanceMax(300))
      .force('center', d3.forceCenter(config.width / 2, config.height / 2)
        .strength(config.centerStrength))
      .force('collision', d3.forceCollide<SimulationNode>()
        .radius(d => getNodeRadius(d, config.minNodeRadius, config.maxNodeRadius, maxPorts) + 2))

    simulationRef.current = simulation

    // Pin scanner node to center if present
    const scannerNode = nodes.find(n => n.type === 'scanner')
    if (scannerNode) {
      scannerNode.fx = config.width / 2
      scannerNode.fy = config.height / 2
    }

    // Draw edges
    const edgeElements = edgeGroup
      .selectAll<SVGLineElement, SimulationLink>('line')
      .data(edges)
      .join('line')
      .attr('class', 'edge')
      .attr('stroke', '#4b5563')
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', d => d.hopNumber ? 2 : 1)

    // Draw nodes
    const nodeElements = nodeGroup
      .selectAll<SVGCircleElement, SimulationNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('class', 'node')
      .attr('r', d => getNodeRadius(d, config.minNodeRadius, config.maxNodeRadius, maxPorts))
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', d => getNodeStroke(d, maxConnections))
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(drag(simulation))

    // Node interactions
    nodeElements
      .on('mouseenter', function(_event, d) {
        d3.select(this)
          .transition()
          .duration(150)
          .attr('r', getNodeRadius(d, config.minNodeRadius, config.maxNodeRadius, maxPorts) * 1.3)
          .attr('stroke-width', 3)

        setHoveredNode(d)
        onNodeHover?.(d)
      })
      .on('mouseleave', function(_event, d) {
        d3.select(this)
          .transition()
          .duration(150)
          .attr('r', getNodeRadius(d, config.minNodeRadius, config.maxNodeRadius, maxPorts))
          .attr('stroke-width', 2)

        setHoveredNode(null)
        onNodeHover?.(null)
      })
      .on('click', (event, d) => {
        event.stopPropagation()
        onNodeClick?.(d)
      })

    // Draw labels (only if not too many nodes)
    const showLabels = config.showLabels && nodes.length <= config.maxNodesForLabels
    if (showLabels) {
      labelGroup
        .selectAll<SVGTextElement, SimulationNode>('text')
        .data(nodes)
        .join('text')
        .attr('class', 'label')
        .attr('text-anchor', 'middle')
        .attr('dy', d => getNodeRadius(d, config.minNodeRadius, config.maxNodeRadius, maxPorts) + 12)
        .attr('font-size', '10px')
        .attr('fill', '#9ca3af')
        .attr('pointer-events', 'none')
        .text(d => d.label)
    }

    // Update positions on tick
    simulation.on('tick', () => {
      edgeElements
        .attr('x1', d => (d.source as SimulationNode).x ?? 0)
        .attr('y1', d => (d.source as SimulationNode).y ?? 0)
        .attr('x2', d => (d.target as SimulationNode).x ?? 0)
        .attr('y2', d => (d.target as SimulationNode).y ?? 0)

      nodeElements
        .attr('cx', d => d.x ?? 0)
        .attr('cy', d => d.y ?? 0)

      if (showLabels) {
        labelGroup.selectAll<SVGTextElement, SimulationNode>('text')
          .attr('x', d => d.x ?? 0)
          .attr('y', d => d.y ?? 0)
      }
    })

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        container.attr('transform', event.transform)
      })

    svg.call(zoom)

    // Center initial view
    svg.call(zoom.transform, d3.zoomIdentity)

    // Cleanup
    return () => {
      simulation.stop()
    }
  }, [data, config, maxPorts, maxConnections, onNodeClick, onNodeHover])

  // Drag behavior for nodes
  function drag(simulation: d3.Simulation<SimulationNode, SimulationLink>) {
    function dragStarted(event: d3.D3DragEvent<SVGCircleElement, SimulationNode, SimulationNode>) {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      event.subject.fx = event.subject.x
      event.subject.fy = event.subject.y
    }

    function dragged(event: d3.D3DragEvent<SVGCircleElement, SimulationNode, SimulationNode>) {
      event.subject.fx = event.x
      event.subject.fy = event.y
    }

    function dragEnded(event: d3.D3DragEvent<SVGCircleElement, SimulationNode, SimulationNode>) {
      if (!event.active) simulation.alphaTarget(0)
      // Keep scanner pinned, release others
      if (event.subject.type !== 'scanner') {
        event.subject.fx = null
        event.subject.fy = null
      }
    }

    return d3.drag<SVGCircleElement, SimulationNode>()
      .on('start', dragStarted)
      .on('drag', dragged)
      .on('end', dragEnded)
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full h-full min-h-[400px] bg-background', className)}
    >
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
      />

      {/* Hover tooltip */}
      {hoveredNode && (
        <NodeTooltip node={hoveredNode} />
      )}

      {/* Empty state */}
      {data.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          No topology data available
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Tooltip Component
// =============================================================================

interface NodeTooltipProps {
  node: TopologyNode
}

function NodeTooltip({ node }: NodeTooltipProps) {
  return (
    <div className="absolute top-4 right-4 p-3 bg-popover border rounded-lg shadow-lg text-sm max-w-xs">
      <div className="font-mono font-medium mb-2">{node.label}</div>
      <div className="space-y-1 text-muted-foreground">
        <div className="flex justify-between gap-4">
          <span>Type:</span>
          <span className="font-medium text-foreground">{node.type}</span>
        </div>
        {node.osGuess && (
          <div className="flex justify-between gap-4">
            <span>OS:</span>
            <span className="font-medium text-foreground">{node.osGuess}</span>
          </div>
        )}
        {!node.osGuess && node.osFamily !== 'unknown' && (
          <div className="flex justify-between gap-4">
            <span>OS Family:</span>
            <span className="font-medium text-foreground">{node.osFamily}</span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span>Responding Ports:</span>
          <span className="font-medium text-foreground">{node.portCount}</span>
        </div>
        {node.observedTtl !== undefined && (
          <div className="flex justify-between gap-4">
            <span>TTL:</span>
            <span className="font-medium text-foreground">{node.observedTtl}</span>
          </div>
        )}
        {node.estimatedHops > 0 && (
          <div className="flex justify-between gap-4">
            <span>Est. Hops:</span>
            <span className="font-medium text-foreground">{node.estimatedHops}</span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span>Connections:</span>
          <span className="font-medium text-foreground">{node.connectionCount}</span>
        </div>
        {node.lastSeen && (
          <div className="flex justify-between gap-4">
            <span>Last Seen:</span>
            <span className="font-medium text-foreground">
              {new Date(node.lastSeen * 1000).toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default NetworkGraph
