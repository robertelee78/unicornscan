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
// Node Sizing and Shapes
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
  // Scanner nodes: same size as minimum (distinguished by color, not size)
  if (node.type === 'scanner') return minRadius
  // Router nodes: small diamonds - they're waypoints, not destinations
  if (node.type === 'router') return minRadius * 0.7
  if (maxPorts === 0) return minRadius

  const ratio = Math.min(node.portCount / maxPorts, 1)
  return minRadius + ratio * (maxRadius - minRadius)
}

/**
 * Generate diamond path for router nodes
 * Diamond shape distinguishes network infrastructure from endpoints
 *
 * @param cx - Center x coordinate
 * @param cy - Center y coordinate
 * @param size - Half-diagonal of the diamond (like radius for circles)
 */
function getDiamondPath(cx: number, cy: number, size: number): string {
  // Diamond points: top, right, bottom, left
  return `M ${cx} ${cy - size} L ${cx + size} ${cy} L ${cx} ${cy + size} L ${cx - size} ${cy} Z`
}

/**
 * Get node color based on type and OS family
 * OPTE-style: categorical coloring by characteristic
 */
function getNodeColor(node: TopologyNode): string {
  if (node.type === 'scanner') return 'var(--color-topo-scanner)' // Red - scanner is the origin
  if (node.type === 'router') return 'var(--color-topo-router)'   // Amber - network infrastructure
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
// CIDR Cluster Force
// =============================================================================

/**
 * Custom D3 force that clusters nodes by their CIDR group.
 * Nodes with the same cidrGroup are gently pulled toward their group centroid.
 *
 * OPTE-inspired: let natural network structure emerge through grouping.
 *
 * @param strength - Force strength (0-1). Lower values allow more organic spread.
 *                   Default 0.3 is gentle enough to not override charge/collision.
 */
function forceCluster(strength: number = 0.3): d3.Force<SimulationNode, undefined> {
  let nodes: SimulationNode[] = []

  function force(alpha: number) {
    // Group nodes by cidrGroup
    const groups = new Map<string, SimulationNode[]>()

    for (const node of nodes) {
      const group = node.cidrGroup
      if (!group) continue // Scanner, routers without cidrGroup

      if (!groups.has(group)) {
        groups.set(group, [])
      }
      groups.get(group)!.push(node)
    }

    // For each group, compute centroid and apply gentle pull
    for (const groupNodes of groups.values()) {
      if (groupNodes.length < 2) continue // No clustering for single nodes

      // Compute centroid of current positions
      let cx = 0
      let cy = 0
      for (const n of groupNodes) {
        cx += n.x ?? 0
        cy += n.y ?? 0
      }
      cx /= groupNodes.length
      cy /= groupNodes.length

      // Apply force toward centroid
      for (const n of groupNodes) {
        const dx = cx - (n.x ?? 0)
        const dy = cy - (n.y ?? 0)

        // Velocity adjustment (D3 convention)
        n.vx = (n.vx ?? 0) + dx * strength * alpha
        n.vy = (n.vy ?? 0) + dy * strength * alpha
      }
    }
  }

  // D3 force interface
  force.initialize = function(_nodes: SimulationNode[]) {
    nodes = _nodes
  }

  // Chainable strength setter for future configurability
  force.strength = function(s: number) {
    strength = s
    return force
  }

  return force
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

    // Create container groups for layering (order matters: clusters behind edges behind nodes)
    const container = svg.append('g').attr('class', 'topology-container')
    const clusterGroup = container.append('g').attr('class', 'clusters')
    const edgeGroup = container.append('g').attr('class', 'edges')
    const nodeGroup = container.append('g').attr('class', 'nodes')
    const labelGroup = container.append('g').attr('class', 'labels')

    // Helper: check if IP is in private range (RFC 1918)
    function isPrivateIP(ip: string): boolean {
      const parts = ip.split('.').map(Number)
      if (parts.length !== 4) return false
      // 10.0.0.0/8
      if (parts[0] === 10) return true
      // 172.16.0.0/12
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
      // 192.168.0.0/16
      if (parts[0] === 192 && parts[1] === 168) return true
      return false
    }

    // Prepare simulation data (D3 mutates nodes for position)
    // cidrGroup is already computed by hooks.ts using intelligent scan-based grouping
    const nodes: SimulationNode[] = data.nodes.map(n => ({ ...n }))
    const edges: SimulationLink[] = data.edges.map(e => ({
      ...e,
      source: e.source as string,
      target: e.target as string,
    }))

    // Layout matching user's sketch:
    // [Local Cluster] -- Scanner(red) -- o--o--o--o -- [Remote Cluster]
    //                                   router chain
    const localClusterX = config.width * 0.15   // Local network cluster center
    const scannerX = config.width * 0.27        // Scanner at right edge of local cluster
    const pathStartX = config.width * 0.32      // Router chain starts here
    const pathEndX = config.width * 0.58        // Router chain ends here
    const remoteClusterX = config.width * 0.75  // Remote targets cluster center
    const centerY = config.height / 2
    const clusterSpread = config.height * 0.25

    for (const node of nodes) {
      if (node.type === 'scanner') {
        // Scanner at right edge of local cluster - where path begins
        node.x = scannerX
        node.y = centerY
      } else if (node.type === 'host') {
        if (isPrivateIP(node.id)) {
          // Local network hosts - clustered on the left
          node.x = localClusterX + (Math.random() - 0.5) * 80
          node.y = centerY + (Math.random() - 0.5) * clusterSpread
        } else if (node.isTracerouteTarget && !node.cidrGroup) {
          // Traceroute targets without a cluster: position at end of router chain
          // They're the endpoint of the path, should be where the chain terminates
          node.x = pathEndX + 30 + (Math.random() - 0.5) * 20
          node.y = centerY + (Math.random() - 0.5) * 40
        } else {
          // Remote targets with clusters - clustered on the right
          node.x = remoteClusterX + (Math.random() - 0.5) * 120
          node.y = centerY + (Math.random() - 0.5) * clusterSpread
        }
      }
      // Routers will be positioned later based on hop number
    }

    // Collect unique CIDR groups for cluster visualization
    const cidrGroups = new Set<string>()
    for (const node of nodes) {
      if (node.cidrGroup) {
        cidrGroups.add(node.cidrGroup)
      }
    }
    const cidrGroupList = Array.from(cidrGroups).sort()

    // Color scale for clusters (D3 categorical colors with reduced opacity)
    const clusterColorScale = d3.scaleOrdinal<string>()
      .domain(cidrGroupList)
      .range(d3.schemeCategory10)

    // Helper: compute convex hull path for a set of points with padding
    function computeHullPath(points: [number, number][], padding: number = 20): string | null {
      if (points.length < 3) return null

      const hull = d3.polygonHull(points)
      if (!hull) return null

      // Expand hull outward by padding
      const centroid = d3.polygonCentroid(hull)
      const expandedHull = hull.map(([x, y]) => {
        const dx = x - centroid[0]
        const dy = y - centroid[1]
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len === 0) return [x, y] as [number, number]
        return [
          x + (dx / len) * padding,
          y + (dy / len) * padding,
        ] as [number, number]
      })

      // Create smooth path using cardinal curve
      const lineGenerator = d3.line<[number, number]>()
        .x(d => d[0])
        .y(d => d[1])
        .curve(d3.curveCardinalClosed.tension(0.7))

      return lineGenerator(expandedHull)
    }

    // Helper: compute ellipse for 2 nodes
    function computeEllipse(p1: [number, number], p2: [number, number], padding: number = 25): {
      cx: number, cy: number, rx: number, ry: number, angle: number
    } {
      const cx = (p1[0] + p2[0]) / 2
      const cy = (p1[1] + p2[1]) / 2
      const dx = p2[0] - p1[0]
      const dy = p2[1] - p1[1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      const angle = Math.atan2(dy, dx) * (180 / Math.PI)

      return {
        cx,
        cy,
        rx: dist / 2 + padding,
        ry: padding,
        angle,
      }
    }

    // Create cluster boundary elements (will be updated on tick)
    interface ClusterData {
      cidr: string
      nodes: SimulationNode[]
    }

    const clusterData: ClusterData[] = cidrGroupList.map(cidr => ({
      cidr,
      nodes: nodes.filter(n => n.cidrGroup === cidr),
    })).filter(c => c.nodes.length >= 2) // Only groups with 2+ nodes

    // Create cluster paths (for 3+ nodes)
    const clusterPaths = clusterGroup
      .selectAll<SVGPathElement, ClusterData>('path.cluster-hull')
      .data(clusterData.filter(c => c.nodes.length >= 3), d => d.cidr)
      .join('path')
      .attr('class', 'cluster-hull')
      .attr('fill', d => clusterColorScale(d.cidr))
      .attr('fill-opacity', 0.1)
      .attr('stroke', d => clusterColorScale(d.cidr))
      .attr('stroke-opacity', 0.3)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,2')

    // Create cluster ellipses (for 2 nodes)
    const clusterEllipses = clusterGroup
      .selectAll<SVGEllipseElement, ClusterData>('ellipse.cluster-ellipse')
      .data(clusterData.filter(c => c.nodes.length === 2), d => d.cidr)
      .join('ellipse')
      .attr('class', 'cluster-ellipse')
      .attr('fill', d => clusterColorScale(d.cidr))
      .attr('fill-opacity', 0.1)
      .attr('stroke', d => clusterColorScale(d.cidr))
      .attr('stroke-opacity', 0.3)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,2')

    // Create cluster labels
    const clusterLabels = clusterGroup
      .selectAll<SVGTextElement, ClusterData>('text.cluster-label')
      .data(clusterData, d => d.cidr)
      .join('text')
      .attr('class', 'cluster-label')
      .attr('font-size', '11px')
      .attr('fill', d => clusterColorScale(d.cidr))
      .attr('fill-opacity', 0.8)
      .attr('pointer-events', 'none')
      .attr('text-anchor', 'middle')
      .text(d => `${d.cidr} (Inferred)`)

    // PIN router positions along a straight horizontal line from scanner to targets
    // This creates the "connect the dots" path the user wants
    const maxHops = Math.max(...nodes.filter(n => n.type === 'router').map(n => n.estimatedHops || 1), 1)

    for (const node of nodes) {
      if (node.type === 'router' && node.estimatedHops) {
        // Position routers along horizontal line based on hop number
        // pathStartX and pathEndX defined above (32% to 58% of width)
        const hopRatio = node.estimatedHops / (maxHops + 1)

        // PIN the position (fx, fy) so simulation doesn't move them
        node.x = pathStartX + (pathEndX - pathStartX) * hopRatio
        node.y = centerY
        node.fx = node.x  // Fix X position
        node.fy = node.y  // Fix Y position
      }
    }

    // Create force simulation
    // Routers are PINNED (fx/fy set above) so they won't move
    // Only hosts and scanner participate in force simulation
    const simulation = d3.forceSimulation<SimulationNode>(nodes)
      .force('link', d3.forceLink<SimulationNode, SimulationLink>(edges)
        .id(d => d.id)
        .distance(config.linkDistance)
        .strength(0.3))
      .force('charge', d3.forceManyBody()
        .strength(config.chargeStrength)
        .distanceMax(300))
      .force('center', d3.forceCenter(config.width / 2, config.height / 2)
        .strength(config.centerStrength))
      .force('collision', d3.forceCollide<SimulationNode>()
        .radius(d => getNodeRadius(d, config.minNodeRadius, config.maxNodeRadius, maxPorts) + 2))
      // CIDR cluster force: gently group nodes by network
      .force('cluster', forceCluster(0.3))

    simulationRef.current = simulation

    // Pin scanner at right edge of local cluster (where path to routers begins)
    const scannerNode = nodes.find(n => n.type === 'scanner')
    if (scannerNode) {
      scannerNode.fx = scannerX
      scannerNode.fy = centerY
    }

    // Draw edges with pathSource-based styling
    // MTR-discovered edges are solid, inferred edges are dashed
    const edgeElements = edgeGroup
      .selectAll<SVGLineElement, SimulationLink>('line')
      .data(edges)
      .join('line')
      .attr('class', 'edge')
      .attr('stroke', 'var(--color-topo-edge)')
      .attr('stroke-opacity', d => d.pathSource === 'mtr' ? 0.6 : 0.4)
      .attr('stroke-width', d => d.pathSource === 'mtr' ? 2 : 1)
      .attr('stroke-dasharray', d => d.pathSource === 'inferred' ? '4,3' : null)

    // Separate nodes by type for different shapes
    const hostNodes = nodes.filter(n => n.type !== 'router')
    const routerNodes = nodes.filter(n => n.type === 'router')

    // Draw host/scanner nodes as circles
    const circleElements = nodeGroup
      .selectAll<SVGCircleElement, SimulationNode>('circle.node-circle')
      .data(hostNodes, d => d.id)
      .join('circle')
      .attr('class', 'node node-circle')
      .attr('r', d => getNodeRadius(d, config.minNodeRadius, config.maxNodeRadius, maxPorts))
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', d => getNodeStroke(d, maxConnections))
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(drag(simulation))

    // Draw router nodes as diamonds
    // Diamond shape visually distinguishes network infrastructure from endpoints
    const diamondElements = nodeGroup
      .selectAll<SVGPathElement, SimulationNode>('path.node-diamond')
      .data(routerNodes, d => d.id)
      .join('path')
      .attr('class', 'node node-diamond')
      .attr('d', d => {
        const size = getNodeRadius(d, config.minNodeRadius, config.maxNodeRadius, maxPorts)
        return getDiamondPath(d.x ?? 0, d.y ?? 0, size)
      })
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', d => getNodeStroke(d, maxConnections))
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(dragPath(simulation))

    // Node interactions for circles
    circleElements
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

    // Node interactions for diamonds (routers)
    diamondElements
      .on('mouseenter', function(_event, d) {
        const size = getNodeRadius(d, config.minNodeRadius, config.maxNodeRadius, maxPorts) * 1.3
        d3.select(this)
          .transition()
          .duration(150)
          .attr('d', getDiamondPath(d.x ?? 0, d.y ?? 0, size))
          .attr('stroke-width', 3)

        setHoveredNode(d)
        onNodeHover?.(d)
      })
      .on('mouseleave', function(_event, d) {
        const size = getNodeRadius(d, config.minNodeRadius, config.maxNodeRadius, maxPorts)
        d3.select(this)
          .transition()
          .duration(150)
          .attr('d', getDiamondPath(d.x ?? 0, d.y ?? 0, size))
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
        .attr('fill', 'var(--color-topo-label)')
        .attr('pointer-events', 'none')
        .text(d => d.label)
    }

    // Update positions on tick
    simulation.on('tick', () => {
      // Update cluster boundaries (convex hulls for 3+ nodes)
      clusterPaths.attr('d', d => {
        const points: [number, number][] = d.nodes.map(n => [n.x ?? 0, n.y ?? 0])
        return computeHullPath(points) ?? ''
      })

      // Update cluster ellipses (for 2 nodes)
      clusterEllipses.each(function(d) {
        if (d.nodes.length !== 2) return
        const p1: [number, number] = [d.nodes[0].x ?? 0, d.nodes[0].y ?? 0]
        const p2: [number, number] = [d.nodes[1].x ?? 0, d.nodes[1].y ?? 0]
        const ellipse = computeEllipse(p1, p2)
        d3.select(this)
          .attr('cx', ellipse.cx)
          .attr('cy', ellipse.cy)
          .attr('rx', ellipse.rx)
          .attr('ry', ellipse.ry)
          .attr('transform', `rotate(${ellipse.angle}, ${ellipse.cx}, ${ellipse.cy})`)
      })

      // Update cluster labels (position at top of cluster)
      clusterLabels.attr('x', d => {
        const xs = d.nodes.map(n => n.x ?? 0)
        return (Math.min(...xs) + Math.max(...xs)) / 2
      }).attr('y', d => {
        const ys = d.nodes.map(n => n.y ?? 0)
        return Math.min(...ys) - 30 // Above the cluster
      })

      // Update edges
      edgeElements
        .attr('x1', d => (d.source as SimulationNode).x ?? 0)
        .attr('y1', d => (d.source as SimulationNode).y ?? 0)
        .attr('x2', d => (d.target as SimulationNode).x ?? 0)
        .attr('y2', d => (d.target as SimulationNode).y ?? 0)

      // Update circle nodes (hosts, scanner)
      circleElements
        .attr('cx', d => d.x ?? 0)
        .attr('cy', d => d.y ?? 0)

      // Update diamond nodes (routers)
      diamondElements
        .attr('d', d => {
          const size = getNodeRadius(d, config.minNodeRadius, config.maxNodeRadius, maxPorts)
          return getDiamondPath(d.x ?? 0, d.y ?? 0, size)
        })

      // Update node labels
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

  // Drag behavior for circle nodes
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

  // Drag behavior for path nodes (diamonds/routers)
  function dragPath(simulation: d3.Simulation<SimulationNode, SimulationLink>) {
    function dragStarted(event: d3.D3DragEvent<SVGPathElement, SimulationNode, SimulationNode>) {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      event.subject.fx = event.subject.x
      event.subject.fy = event.subject.y
    }

    function dragged(event: d3.D3DragEvent<SVGPathElement, SimulationNode, SimulationNode>) {
      event.subject.fx = event.x
      event.subject.fy = event.y
    }

    function dragEnded(event: d3.D3DragEvent<SVGPathElement, SimulationNode, SimulationNode>) {
      if (!event.active) simulation.alphaTarget(0)
      // Routers can be released after drag
      event.subject.fx = null
      event.subject.fy = null
    }

    return d3.drag<SVGPathElement, SimulationNode>()
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
  // Format topology source for display
  const sourceLabel = {
    'inferred': 'Inferred',
    'mtr': 'MTR Discovered',
    'bgp': 'BGP Route',
    'static': 'Static',
  }[node.topologySource] ?? node.topologySource

  return (
    <div className="absolute top-4 right-4 p-3 bg-popover border rounded-lg shadow-lg text-sm max-w-xs">
      <div className="font-mono font-medium mb-2">{node.label}</div>
      <div className="space-y-1 text-muted-foreground">
        <div className="flex justify-between gap-4">
          <span>Type:</span>
          <span className="font-medium text-foreground capitalize">{node.type}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Discovery:</span>
          <span className="font-medium text-foreground">{sourceLabel}</span>
        </div>
        {node.cidrGroup && (
          <div className="flex justify-between gap-4">
            <span>Network:</span>
            <span className="font-mono font-medium text-foreground">{node.cidrGroup}</span>
          </div>
        )}
        {node.osGuess && (
          <div className="flex justify-between gap-4">
            <span>OS:</span>
            <span className="font-medium text-foreground">{node.osGuess}</span>
          </div>
        )}
        {!node.osGuess && node.osFamily !== 'unknown' && node.osFamily !== 'router' && (
          <div className="flex justify-between gap-4">
            <span>OS Family:</span>
            <span className="font-medium text-foreground">{node.osFamily}</span>
          </div>
        )}
        {node.type !== 'router' && (
          <div className="flex justify-between gap-4">
            <span>Responding Ports:</span>
            <span className="font-medium text-foreground">{node.portCount}</span>
          </div>
        )}
        {node.observedTtl !== undefined && (
          <div className="flex justify-between gap-4">
            <span>TTL:</span>
            <span className="font-medium text-foreground">{node.observedTtl}</span>
          </div>
        )}
        {node.estimatedHops > 0 && (
          <div className="flex justify-between gap-4">
            <span>{node.type === 'router' ? 'Hop #:' : 'Est. Hops:'}</span>
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
