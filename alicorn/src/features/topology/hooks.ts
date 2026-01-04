/**
 * Topology feature hooks
 * Data fetching and transformation for network graph visualization
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getDatabase } from '@/lib/database'
import { parseTimestamp } from '@/lib/utils'
import { getCIDRGroup, parseCIDRTarget, determineIPGroup } from '@/lib/cidr'
import { inferOsFromTtl } from '@/types/database'
import type { Host, Hop, IpReport } from '@/types/database'
import type { TopologyData, TopologyNode, TopologyEdge, TopologyFilters } from './types'

const db = getDatabase()

// =============================================================================
// Query Keys
// =============================================================================

export const topologyKeys = {
  all: ['topology'] as const,
  forScan: (scan_id: number) => [...topologyKeys.all, 'scan', scan_id] as const,
  global: (filters: TopologyFilters) => [...topologyKeys.all, 'global', filters] as const,
}

// =============================================================================
// Data Transformation
// =============================================================================

/**
 * Build topology graph from hosts, hops, and IP reports
 * Follows unicornscan philosophy: show actual discovered data
 *
 * @param hosts - Host records from database
 * @param hops - Hop records from MTR discovery
 * @param reports - IP reports from scans
 * @param scannerAddr - Scanner's IP address (center node)
 * @param scannedCidrs - Array of normalized CIDR targets from scans for intelligent grouping
 */
function buildTopologyData(
  hosts: Host[],
  hops: Hop[],
  reports: IpReport[],
  scannerAddr?: string,
  scannedCidrs: string[] = []
): TopologyData {
  const nodeMap = new Map<string, TopologyNode>()
  const edges: TopologyEdge[] = []

  // Add scanner as center node if known
  // Scanner DOES get CIDR-grouped so it appears in its local network cluster
  if (scannerAddr) {
    const scannerCidrGroup = determineIPGroup(scannerAddr, scannedCidrs) ?? undefined
    nodeMap.set(scannerAddr, {
      id: scannerAddr,
      type: 'scanner',
      label: scannerAddr,
      osFamily: 'linux', // Assume scanner is Linux
      portCount: 0,
      connectionCount: 0,
      estimatedHops: 0,
      topologySource: 'static',
      cidrGroup: scannerCidrGroup,
    })
  }

  // Add hosts as nodes
  for (const host of hosts) {
    const hostIp = host.ip_addr ?? host.host_addr
    const portCount = host.port_count ?? 0
    // Try to infer OS from reports for this host
    const hostReports = reports.filter(r => r.host_addr === hostIp)
    const avgTtl = hostReports.length > 0
      ? Math.round(hostReports.reduce((sum, r) => sum + r.ttl, 0) / hostReports.length)
      : undefined

    const { osFamily, estimatedHops } = avgTtl
      ? inferOsFromTtl(avgTtl)
      : { osFamily: 'unknown' as const, estimatedHops: 0 }

    // Determine CIDR group based on scanned targets
    const cidrGroup = determineIPGroup(hostIp, scannedCidrs) ?? undefined

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
      topologySource: 'inferred',
      cidrGroup,
      firstSeen: parseTimestamp(host.first_seen),
      lastSeen: parseTimestamp(host.last_seen),
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
        topologySource: 'mtr',
      })
    }
  }

  // Build hop chain edges: sender → hop1 → hop2 → ... → target
  // Group hops by target_addr (each traceroute path is to a specific target)
  const hopsByTarget = new Map<string, typeof hops>()
  for (const hop of hops) {
    const existing = hopsByTarget.get(hop.target_addr)
    if (existing) {
      existing.push(hop)
    } else {
      hopsByTarget.set(hop.target_addr, [hop])
    }
  }

  // For each target, sort hops by hop_number and create chain edges
  for (const [targetAddr, targetHops] of hopsByTarget) {
    // Sort by hop_number ascending (1, 2, 3, ...)
    const sortedHops = [...targetHops].sort((a, b) => (a.hop_number ?? 0) - (b.hop_number ?? 0))

    // Create edge from scanner to first hop (if scanner known and first hop exists)
    if (scannerAddr && sortedHops.length > 0) {
      const firstHop = sortedHops[0]
      const edgeId = `${scannerAddr}->${firstHop.hop_addr}`
      // Only add if not already present (avoid duplicates across targets)
      if (!edges.some(e => e.id === edgeId)) {
        edges.push({
          id: edgeId,
          source: scannerAddr,
          target: firstHop.hop_addr,
          pathSource: 'mtr',
          hopNumber: 0, // Before hop 1
        })
        const scannerNode = nodeMap.get(scannerAddr)
        const firstHopNode = nodeMap.get(firstHop.hop_addr)
        if (scannerNode) scannerNode.connectionCount++
        if (firstHopNode) firstHopNode.connectionCount++
      }
    }

    // Create chain edges between consecutive hops: hop[n] → hop[n+1]
    for (let i = 0; i < sortedHops.length - 1; i++) {
      const currentHop = sortedHops[i]
      const nextHop = sortedHops[i + 1]
      const edgeId = `${currentHop.hop_addr}->${nextHop.hop_addr}`

      // Only add if not already present
      if (!edges.some(e => e.id === edgeId)) {
        edges.push({
          id: edgeId,
          source: currentHop.hop_addr,
          target: nextHop.hop_addr,
          pathSource: 'mtr',
          hopNumber: currentHop.hop_number || undefined,
          rttUs: currentHop.rtt_us || undefined,
        })
        const currentNode = nodeMap.get(currentHop.hop_addr)
        const nextNode = nodeMap.get(nextHop.hop_addr)
        if (currentNode) currentNode.connectionCount++
        if (nextNode) nextNode.connectionCount++
      }
    }

    // Create edge from last hop to target (if last hop is not the target itself)
    if (sortedHops.length > 0) {
      const lastHop = sortedHops[sortedHops.length - 1]
      if (lastHop.hop_addr !== targetAddr) {
        const edgeId = `${lastHop.hop_addr}->${targetAddr}`
        if (!edges.some(e => e.id === edgeId)) {
          edges.push({
            id: edgeId,
            source: lastHop.hop_addr,
            target: targetAddr,
            pathSource: 'mtr',
            hopNumber: lastHop.hop_number || undefined,
            rttUs: lastHop.rtt_us || undefined,
          })
          const lastNode = nodeMap.get(lastHop.hop_addr)
          const targetNode = nodeMap.get(targetAddr)
          if (lastNode) lastNode.connectionCount++
          if (targetNode) targetNode.connectionCount++
        }
      }
    }
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
        pathSource: 'inferred',
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
export function useTopologyForScan(scan_id: number) {
  // Fetch all required data
  const hostsQuery = useQuery({
    queryKey: [...topologyKeys.forScan(scan_id), 'hosts'],
    queryFn: () => db.getHosts({ limit: 10000 }),
    staleTime: 60000,
  })

  const hopsQuery = useQuery({
    queryKey: [...topologyKeys.forScan(scan_id), 'hops'],
    queryFn: () => db.getHops(scan_id),
    staleTime: 60000,
  })

  const reportsQuery = useQuery({
    queryKey: [...topologyKeys.forScan(scan_id), 'reports'],
    queryFn: () => db.getIpReports(scan_id),
    staleTime: 60000,
  })

  const scanQuery = useQuery({
    queryKey: [...topologyKeys.forScan(scan_id), 'scan'],
    queryFn: () => db.getScan(scan_id),
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

    // Parse scan target for CIDR grouping
    const scannedCidrs: string[] = []
    if (scanQuery.data?.target_str) {
      const normalized = parseCIDRTarget(scanQuery.data.target_str)
      if (normalized) {
        scannedCidrs.push(normalized)
      }
    }

    return buildTopologyData(
      filteredHosts,
      hopsQuery.data,
      reportsQuery.data,
      scannerAddr,
      scannedCidrs
    )
  }, [hostsQuery.data, hopsQuery.data, reportsQuery.data, scanQuery.data])

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

  // Fetch all scan summaries to get target_str values for CIDR grouping
  const scansQuery = useQuery({
    queryKey: [...topologyKeys.global(filters), 'scans'],
    queryFn: () => db.getScanSummaries({ limit: 1000 }),
    staleTime: 60000,
  })

  // For global view, we'd need to aggregate hops from all scans
  // This is a simplified version - just show all hosts
  const topologyData = useMemo(() => {
    if (!hostsQuery.data) return null

    let hosts = hostsQuery.data

    // Apply filters
    if (filters.minPorts !== undefined) {
      hosts = hosts.filter(h => (h.port_count ?? 0) >= filters.minPorts!)
    }
    if (filters.since !== undefined) {
      hosts = hosts.filter(h => parseTimestamp(h.last_seen) >= filters.since!)
    }

    // Collect all scanned CIDRs from all scans for intelligent grouping
    const scannedCidrs: string[] = []
    if (scansQuery.data) {
      for (const scan of scansQuery.data) {
        if (scan.target_str) {
          const normalized = parseCIDRTarget(scan.target_str)
          if (normalized) {
            scannedCidrs.push(normalized)
          }
        }
      }
    }

    return buildTopologyData(hosts, [], [], undefined, scannedCidrs)
  }, [hostsQuery.data, scansQuery.data, filters])

  return {
    data: topologyData,
    isLoading: hostsQuery.isLoading || scansQuery.isLoading,
    error: hostsQuery.error || scansQuery.error,
  }
}

// =============================================================================
// Aggregation for Large Datasets
// =============================================================================

/**
 * Aggregate nodes by subnet for large datasets
 * Groups nodes into subnets for manageable visualization
 * @param prefixLength - CIDR prefix length (default 24 for /24 subnets)
 */
export function aggregateBySubnet(
  data: TopologyData,
  prefixLength: number = 24
): TopologyData {
  if (!data.needsAggregation) return data

  const subnetMap = new Map<string, TopologyNode>()

  for (const node of data.nodes) {
    if (node.type === 'scanner') {
      subnetMap.set(node.id, node)
      continue
    }

    // Skip non-IPv4 addresses (IPv6 support coming later)
    const parts = node.id.split('.')
    if (parts.length !== 4) continue

    // Get subnet using CIDR utilities
    const subnet = getCIDRGroup(node.id, prefixLength)

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
        topologySource: 'inferred',
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
