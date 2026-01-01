/**
 * Topology feature hooks
 * Data fetching and transformation for network graph visualization
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getDatabase } from '@/lib/database'
import { inferOsFromTtl } from '@/types/database'
import type { Host, Hop, IpReport } from '@/types/database'
import type { TopologyData, TopologyNode, TopologyEdge, TopologyFilters } from './types'

const db = getDatabase()

// =============================================================================
// Query Keys
// =============================================================================

export const topologyKeys = {
  all: ['topology'] as const,
  forScan: (scansId: number) => [...topologyKeys.all, 'scan', scansId] as const,
  global: (filters: TopologyFilters) => [...topologyKeys.all, 'global', filters] as const,
}

// =============================================================================
// Data Transformation
// =============================================================================

/**
 * Build topology graph from hosts, hops, and IP reports
 * Follows unicornscan philosophy: show actual discovered data
 */
function buildTopologyData(
  hosts: Host[],
  hops: Hop[],
  reports: IpReport[],
  scannerAddr?: string
): TopologyData {
  const nodeMap = new Map<string, TopologyNode>()
  const edges: TopologyEdge[] = []

  // Add scanner as center node if known
  if (scannerAddr) {
    nodeMap.set(scannerAddr, {
      id: scannerAddr,
      type: 'scanner',
      label: scannerAddr,
      osFamily: 'linux', // Assume scanner is Linux
      portCount: 0,
      connectionCount: 0,
      estimatedHops: 0,
    })
  }

  // Add hosts as nodes
  for (const host of hosts) {
    const hostIp = host.ip_addr ?? host.host_addr
    const portCount = host.open_port_count ?? host.port_count
    // Try to infer OS from reports for this host
    const hostReports = reports.filter(r => r.host_addr === hostIp)
    const avgTtl = hostReports.length > 0
      ? Math.round(hostReports.reduce((sum, r) => sum + r.ttl, 0) / hostReports.length)
      : undefined

    const { osFamily, estimatedHops } = avgTtl
      ? inferOsFromTtl(avgTtl)
      : { osFamily: 'unknown' as const, estimatedHops: 0 }

    nodeMap.set(hostIp, {
      id: hostIp,
      type: 'host',
      label: host.hostname || hostIp,
      osFamily: host.os_guess ? inferOsFamilyFromGuess(host.os_guess) : osFamily,
      osGuess: host.os_guess || undefined,
      portCount,
      connectionCount: 0,
      observedTtl: avgTtl,
      estimatedHops,
      firstSeen: host.first_seen,
      lastSeen: host.last_seen,
    })
  }

  // Add intermediate hops as router nodes
  for (const hop of hops) {
    // The hop_addr is the intermediate router
    if (!nodeMap.has(hop.hop_addr)) {
      nodeMap.set(hop.hop_addr, {
        id: hop.hop_addr,
        type: 'router',
        label: hop.hop_addr,
        osFamily: 'router',
        portCount: 0,
        connectionCount: 0,
        observedTtl: hop.ttl_observed,
        estimatedHops: hop.hop_number || 1,
      })
    }

    // Create edge from hop to target
    const edgeId = `${hop.hop_addr}->${hop.target_addr}`
    edges.push({
      id: edgeId,
      source: hop.hop_addr,
      target: hop.target_addr,
      hopNumber: hop.hop_number || undefined,
      rttUs: hop.rtt_us || undefined,
    })

    // Update connection counts
    const hopNode = nodeMap.get(hop.hop_addr)
    const targetNode = nodeMap.get(hop.target_addr)
    if (hopNode) hopNode.connectionCount++
    if (targetNode) targetNode.connectionCount++
  }

  // If scanner is known, add edges from scanner to first-hop nodes
  // This creates a star pattern from the scanner to the network
  if (scannerAddr && hops.length === 0) {
    // No hops discovered - connect scanner directly to all hosts
    for (const host of hosts) {
      const hostIp = host.ip_addr ?? host.host_addr
      const edgeId = `${scannerAddr}->${hostIp}`
      edges.push({
        id: edgeId,
        source: scannerAddr,
        target: hostIp,
      })
      const scannerNode = nodeMap.get(scannerAddr)
      const hostNode = nodeMap.get(hostIp)
      if (scannerNode) scannerNode.connectionCount++
      if (hostNode) hostNode.connectionCount++
    }
  }

  const nodes = Array.from(nodeMap.values())

  return {
    nodes,
    edges,
    scannerAddr,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    needsAggregation: nodes.length > 1000,
  }
}

/**
 * Infer OS family from os_guess string
 */
function inferOsFamilyFromGuess(guess: string): TopologyNode['osFamily'] {
  const lower = guess.toLowerCase()
  if (lower.includes('linux') || lower.includes('unix') || lower.includes('bsd') || lower.includes('mac')) {
    return 'linux'
  }
  if (lower.includes('windows')) {
    return 'windows'
  }
  if (lower.includes('cisco') || lower.includes('router') || lower.includes('switch')) {
    return 'router'
  }
  return 'unknown'
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Get topology data for a specific scan
 */
export function useTopologyForScan(scansId: number) {
  // Fetch all required data
  const hostsQuery = useQuery({
    queryKey: [...topologyKeys.forScan(scansId), 'hosts'],
    queryFn: () => db.getHosts({ limit: 10000 }),
    staleTime: 60000,
  })

  const hopsQuery = useQuery({
    queryKey: [...topologyKeys.forScan(scansId), 'hops'],
    queryFn: () => db.getHops(scansId),
    staleTime: 60000,
  })

  const reportsQuery = useQuery({
    queryKey: [...topologyKeys.forScan(scansId), 'reports'],
    queryFn: () => db.getIpReports(scansId),
    staleTime: 60000,
  })

  const scanQuery = useQuery({
    queryKey: [...topologyKeys.forScan(scansId), 'scan'],
    queryFn: () => db.getScan(scansId),
    staleTime: 60000,
  })

  // Build topology data from fetched data
  const topologyData = useMemo(() => {
    if (!hostsQuery.data || !hopsQuery.data || !reportsQuery.data) {
      return null
    }

    // Filter hosts to those in this scan's reports
    const scanHosts = reportsQuery.data.map(r => r.host_addr)
    const uniqueHosts = new Set(scanHosts)
    const filteredHosts = hostsQuery.data.filter(h => uniqueHosts.has(h.ip_addr ?? h.host_addr))

    // Get scanner address from the first report's send_addr
    const scannerAddr = reportsQuery.data[0]?.send_addr

    return buildTopologyData(
      filteredHosts,
      hopsQuery.data,
      reportsQuery.data,
      scannerAddr
    )
  }, [hostsQuery.data, hopsQuery.data, reportsQuery.data])

  return {
    data: topologyData,
    scan: scanQuery.data,
    isLoading: hostsQuery.isLoading || hopsQuery.isLoading || reportsQuery.isLoading,
    error: hostsQuery.error || hopsQuery.error || reportsQuery.error,
  }
}

/**
 * Get global topology data across all scans
 */
export function useGlobalTopology(filters: TopologyFilters = {}) {
  const hostsQuery = useQuery({
    queryKey: [...topologyKeys.global(filters), 'hosts'],
    queryFn: () => db.getHosts({ limit: 10000 }),
    staleTime: 60000,
  })

  // For global view, we'd need to aggregate hops from all scans
  // This is a simplified version - just show all hosts
  const topologyData = useMemo(() => {
    if (!hostsQuery.data) return null

    let hosts = hostsQuery.data

    // Apply filters
    if (filters.minPorts !== undefined) {
      hosts = hosts.filter(h => (h.open_port_count ?? h.port_count) >= filters.minPorts!)
    }
    if (filters.since !== undefined) {
      hosts = hosts.filter(h => h.last_seen >= filters.since!)
    }

    return buildTopologyData(hosts, [], [])
  }, [hostsQuery.data, filters])

  return {
    data: topologyData,
    isLoading: hostsQuery.isLoading,
    error: hostsQuery.error,
  }
}

// =============================================================================
// Aggregation for Large Datasets
// =============================================================================

/**
 * Aggregate nodes by subnet for large datasets
 * Groups nodes into /24 subnets for manageable visualization
 */
export function aggregateBySubnet(data: TopologyData): TopologyData {
  if (!data.needsAggregation) return data

  const subnetMap = new Map<string, TopologyNode>()

  for (const node of data.nodes) {
    if (node.type === 'scanner') {
      subnetMap.set(node.id, node)
      continue
    }

    // Get /24 subnet
    const parts = node.id.split('.')
    if (parts.length !== 4) continue
    const subnet = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`

    const existing = subnetMap.get(subnet)
    if (existing) {
      // Aggregate
      existing.portCount += node.portCount
      existing.connectionCount++
    } else {
      subnetMap.set(subnet, {
        id: subnet,
        type: 'host',
        label: subnet,
        osFamily: 'unknown',
        portCount: node.portCount,
        connectionCount: 1,
        estimatedHops: node.estimatedHops,
      })
    }
  }

  // Rebuild edges between subnets
  // For now, just remove edges in aggregated view
  const nodes = Array.from(subnetMap.values())

  return {
    nodes,
    edges: [],
    scannerAddr: data.scannerAddr,
    nodeCount: nodes.length,
    edgeCount: 0,
    needsAggregation: nodes.length > 1000,
  }
}
