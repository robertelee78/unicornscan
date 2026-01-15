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
import { inferOsFromTtl, type OsFamily } from '@/types/database'
import type { Host, Hop, IpReport } from '@/types/database'
import type { TopologyData, TopologyNode, TopologyEdge, TopologyFilters } from './types'

// =============================================================================
// ASN Resolution Types
// =============================================================================

export interface AsnInfo {
  asn: number
  as_org: string | null
}

export type IpAsnMap = Map<string, AsnInfo | null>

const db = getDatabase()

// =============================================================================
// IP/CIDR Utilities
// =============================================================================

/**
 * Check if an IP address is within a CIDR range
 * @param ip - IP address to check (e.g., "192.168.1.100")
 * @param cidr - CIDR notation (e.g., "192.168.1.0/24")
 * @returns true if IP is in the CIDR range
 */
function isIpInCidr(ip: string, cidr: string): boolean {
  const [cidrNetwork, prefixStr] = cidr.split('/')
  const prefix = parseInt(prefixStr, 10)

  if (isNaN(prefix) || prefix < 0 || prefix > 32) {
    return false
  }

  const ipNum = ipToNumber(ip)
  const networkNum = ipToNumber(cidrNetwork)

  if (ipNum === null || networkNum === null) {
    return false
  }

  // Create mask from prefix length
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0

  // Check if IP is in network
  return (ipNum & mask) === (networkNum & mask)
}

/**
 * Convert IP string to 32-bit number
 */
function ipToNumber(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null

  let num = 0
  for (let i = 0; i < 4; i++) {
    const octet = parseInt(parts[i], 10)
    if (isNaN(octet) || octet < 0 || octet > 255) {
      return null
    }
    num = (num << 8) | octet
  }
  return num >>> 0 // Convert to unsigned
}

/**
 * Check if an IP address is private/RFC1918 (no meaningful ASN)
 */
function isPrivateIp(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4) return false

  // 10.0.0.0/8
  if (parts[0] === 10) return true
  // 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true
  // 127.0.0.0/8 (loopback)
  if (parts[0] === 127) return true
  // 169.254.0.0/16 (link-local)
  if (parts[0] === 169 && parts[1] === 254) return true

  return false
}

// =============================================================================
// Query Keys
// =============================================================================

export const topologyKeys = {
  all: ['topology'] as const,
  forScan: (scan_id: number) => [...topologyKeys.all, 'scan', scan_id] as const,
  global: (filters: TopologyFilters) => [...topologyKeys.all, 'global', filters] as const,
  osFamilyCounts: () => [...topologyKeys.all, 'osFamilyCounts'] as const,
}

// =============================================================================
// OS Family Color Mapping
// =============================================================================

/**
 * Get color for an OS family string from the database
 * Maps exact database values to colors
 */
export function getOsFamilyDisplayColor(osFamily: string): string {
  const lower = osFamily.toLowerCase()

  // Windows - Windows Blue
  if (lower === 'windows' || lower.includes('windows')) {
    return '#0078D4'
  }

  // macOS/iOS - Apple Aluminum
  if (lower === 'macos' || lower === 'ios' || lower.includes('mac') || lower.includes('ios') || lower.includes('apple') || lower.includes('darwin')) {
    return '#A8A9AD'
  }

  // Linux/Unix - Terminal Green
  if (lower === 'linux' || lower.includes('linux') || lower.includes('unix') || lower.includes('bsd') || lower.includes('android')) {
    return '#00FF00'
  }

  // Network Device - Dark Gray
  if (lower === 'network device' || lower.includes('router') || lower.includes('switch') || lower.includes('cisco') || lower.includes('juniper')) {
    return '#444444'
  }

  // Printer - Beige
  if (lower.includes('printer') || lower.includes('print')) {
    return '#F5F5DC'
  }

  // Unknown/Other - Medium Gray
  return '#888888'
}

/**
 * Hook to fetch top OS families by host count
 */
export function useOsFamilyCounts(limit: number = 5) {
  return useQuery({
    queryKey: topologyKeys.osFamilyCounts(),
    queryFn: () => db.getOsFamilyCounts(limit),
    staleTime: 300000, // 5 minutes - this data doesn't change often
  })
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
 * @param asnMap - Optional map of IP -> ASN info for hierarchical grouping
 */
function buildTopologyData(
  hosts: Host[],
  hops: Hop[],
  reports: IpReport[],
  scannerAddr?: string,
  scannedCidrs: string[] = [],
  asnMap?: IpAsnMap
): TopologyData {
  const nodeMap = new Map<string, TopologyNode>()
  const edges: TopologyEdge[] = []

  // Add scanner as center node if known
  // Scanner DOES get CIDR-grouped so it appears in its local network cluster
  if (scannerAddr) {
    const scannerCidrGroup = determineIPGroup(scannerAddr, scannedCidrs) ?? undefined
    const scannerAsn = asnMap?.get(scannerAddr)
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
      asnNumber: scannerAsn?.asn,
      asnOrg: scannerAsn?.as_org ?? undefined,
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

    const { osFamily: ttlOsFamily, estimatedHops } = avgTtl
      ? inferOsFromTtl(avgTtl)
      : { osFamily: 'unknown' as OsFamily, estimatedHops: 0 }

    // Determine CIDR group based on scanned targets
    const cidrGroup = determineIPGroup(hostIp, scannedCidrs) ?? undefined

    // Get ASN info from map (if available)
    const hostAsn = asnMap?.get(hostIp)

    // Use actual OS family from database, or fallback to TTL-inferred label
    // Priority: os_family > os_name (extract family) > TTL inference
    const osFamily = host.os_family
      || (host.os_name ? extractOsFamilyFromName(host.os_name) : null)
      || ttlFamilyToLabel(ttlOsFamily)

    nodeMap.set(hostIp, {
      id: hostIp,
      type: 'host',
      label: host.hostname || hostIp,
      osFamily,
      osGuess: host.os_name || host.os_family || host.os_guess || undefined,
      portCount,
      connectionCount: 0,
      observedTtl: avgTtl,
      estimatedHops,
      topologySource: 'inferred',
      cidrGroup,
      asnNumber: hostAsn?.asn,
      asnOrg: hostAsn?.as_org ?? undefined,
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
 * Extract OS family label from os_name string
 * Returns a user-friendly label like "Windows", "Linux", "macOS"
 */
function extractOsFamilyFromName(osName: string): string {
  const lower = osName.toLowerCase()
  if (lower.includes('windows')) return 'Windows'
  if (lower.includes('macos') || lower.includes('mac os') || lower.includes('os x') || lower.includes('darwin')) return 'macOS'
  if (lower.includes('ios') || lower.includes('iphone') || lower.includes('ipad')) return 'iOS'
  if (lower.includes('linux')) return 'Linux'
  if (lower.includes('android')) return 'Android'
  if (lower.includes('freebsd') || lower.includes('openbsd') || lower.includes('netbsd')) return 'BSD'
  if (lower.includes('cisco') || lower.includes('juniper')) return 'Network Device'
  return osName // Return as-is if no pattern matches
}

/**
 * Convert TTL-inferred OsFamily enum to display label
 */
function ttlFamilyToLabel(family: OsFamily): string {
  switch (family) {
    case 'linux': return 'Linux'
    case 'windows': return 'Windows'
    case 'router': return 'Network Device'
    case 'apple': return 'macOS'
    default: return 'Unknown'
  }
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

  // Collect all IPs that need ASN resolution (hosts + scanner)
  const allIps = useMemo(() => {
    if (!hostsQuery.data || !reportsQuery.data) return []

    const scanHosts = reportsQuery.data.map(r => r.host_addr)
    const uniqueHosts = new Set(scanHosts)
    const hostIps = hostsQuery.data
      .filter(h => uniqueHosts.has(h.ip_addr ?? h.host_addr))
      .map(h => h.ip_addr ?? h.host_addr)

    // Include scanner address if available
    const scannerAddr = reportsQuery.data[0]?.send_addr
    if (scannerAddr) {
      hostIps.push(scannerAddr)
    }

    return [...new Set(hostIps)] // Deduplicate
  }, [hostsQuery.data, reportsQuery.data])

  // Fetch ASN data for all IPs (hybrid stored + JIT)
  const asnMapQuery = useIpAsnMap(scan_id, allIps)

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
      scannedCidrs,
      asnMapQuery.data // Pass ASN map to builder
    )
  }, [hostsQuery.data, hopsQuery.data, reportsQuery.data, scanQuery.data, asnMapQuery.data])

  return {
    data: topologyData,
    scan: scanQuery.data,
    isLoading: hostsQuery.isLoading || hopsQuery.isLoading || reportsQuery.isLoading || asnMapQuery.isLoading,
    error: hostsQuery.error || hopsQuery.error || reportsQuery.error || asnMapQuery.error,
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

  // Fetch all hops across all scans for traceroute path visualization
  const hopsQuery = useQuery({
    queryKey: [...topologyKeys.global(filters), 'hops'],
    queryFn: () => db.getAllHops(),
    staleTime: 60000,
  })

  // Fetch scanner addresses to show scanner nodes in the graph
  const scannersQuery = useQuery({
    queryKey: [...topologyKeys.global(filters), 'scanners'],
    queryFn: () => db.getScannerAddresses(),
    staleTime: 60000,
  })

  // Collect all IPs that need ASN resolution (after applying filters)
  const allIps = useMemo(() => {
    if (!hostsQuery.data) return []

    let hosts = hostsQuery.data

    // Apply same filters as in topology building (must match!)
    if (filters.minPorts !== undefined) {
      hosts = hosts.filter(h => (h.port_count ?? 0) >= filters.minPorts!)
    }
    if (filters.since !== undefined) {
      hosts = hosts.filter(h => parseTimestamp(h.last_seen) >= filters.since!)
    }
    if (filters.subnet) {
      const subnetFilter = filters.subnet.trim()
      if (subnetFilter.includes('/')) {
        hosts = hosts.filter(h => isIpInCidr(h.ip_addr ?? h.host_addr, subnetFilter))
      } else {
        hosts = hosts.filter(h => (h.ip_addr ?? h.host_addr).startsWith(subnetFilter))
      }
    }
    if (filters.osFamily && filters.osFamily.length > 0) {
      hosts = hosts.filter(h => {
        const hostOsFamily = h.os_family?.toLowerCase() ?? ''
        return filters.osFamily!.some(f => {
          const filterLower = f.toLowerCase()
          return hostOsFamily === filterLower || hostOsFamily.includes(filterLower)
        })
      })
    }

    const hostIps = hosts.map(h => h.ip_addr ?? h.host_addr)

    // Include scanner address if available
    const scannerAddr = scannersQuery.data?.[0]
    if (scannerAddr) {
      hostIps.push(scannerAddr)
    }

    return [...new Set(hostIps)] // Deduplicate
  }, [hostsQuery.data, scannersQuery.data, filters])

  // Fetch ASN data for all IPs (hybrid stored + JIT)
  // Use scanId=0 for global/cross-scan lookups
  const asnMapQuery = useIpAsnMap(0, allIps)

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

    // Subnet filter - supports partial IP (192.168) or CIDR notation (192.168.1.0/24)
    if (filters.subnet) {
      const subnetFilter = filters.subnet.trim()
      if (subnetFilter.includes('/')) {
        // CIDR notation - check if host IP is in the subnet
        hosts = hosts.filter(h => {
          const hostIp = h.ip_addr ?? h.host_addr
          return isIpInCidr(hostIp, subnetFilter)
        })
      } else {
        // Partial IP prefix matching - e.g., "192.168" matches "192.168.1.1"
        hosts = hosts.filter(h => {
          const hostIp = h.ip_addr ?? h.host_addr
          return hostIp.startsWith(subnetFilter)
        })
      }
    }

    // OS family filter - string comparison
    if (filters.osFamily && filters.osFamily.length > 0) {
      hosts = hosts.filter(h => {
        // Check os_family field from database
        const hostOsFamily = h.os_family?.toLowerCase() ?? ''
        return filters.osFamily!.some(f => {
          const filterLower = f.toLowerCase()
          // Match exact or contains for flexibility
          return hostOsFamily === filterLower || hostOsFamily.includes(filterLower)
        })
      })
    }

    // ASN filter (new) - filter hosts by ASN if specified
    if (filters.asn !== undefined && asnMapQuery.data) {
      hosts = hosts.filter(h => {
        const hostIp = h.ip_addr ?? h.host_addr
        const asnInfo = asnMapQuery.data.get(hostIp)
        return asnInfo?.asn === filters.asn
      })
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

    // Get hops data (empty array if still loading)
    let hops = hopsQuery.data ?? []

    // Filter hops to only include those that connect to remaining hosts
    // This removes orphaned router nodes when their target networks are filtered out
    if (filters.subnet || (filters.osFamily && filters.osFamily.length > 0) || filters.asn !== undefined) {
      const remainingHostIps = new Set(hosts.map(h => h.ip_addr ?? h.host_addr))
      hops = hops.filter(hop => remainingHostIps.has(hop.target_addr))
    }

    // Use first scanner address for now (most installations have one scanner)
    // Multiple scanner nodes will still appear if they're in the hops data
    const scannerAddr = scannersQuery.data?.[0]

    return buildTopologyData(hosts, hops, [], scannerAddr, scannedCidrs, asnMapQuery.data)
  }, [hostsQuery.data, scansQuery.data, hopsQuery.data, scannersQuery.data, filters, asnMapQuery.data])

  return {
    data: topologyData,
    isLoading: hostsQuery.isLoading || scansQuery.isLoading || hopsQuery.isLoading || asnMapQuery.isLoading,
    error: hostsQuery.error || scansQuery.error || hopsQuery.error || asnMapQuery.error,
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

// =============================================================================
// ASN Resolution Hook (Hybrid Stored + JIT)
// =============================================================================

/**
 * Get ASN mapping for a list of IPs
 * Uses hybrid pattern: stored uni_geoip data + live JIT lookups
 *
 * @param scanId - Scan ID (0 for global/all scans)
 * @param ips - List of IP addresses to resolve
 * @returns Map of IP -> AsnInfo (or null for private IPs / unavailable)
 */
export function useIpAsnMap(scanId: number, ips: string[]) {
  return useQuery({
    queryKey: [...topologyKeys.all, 'asnMap', scanId, ips.length],
    queryFn: async (): Promise<IpAsnMap> => {
      const asnMap: IpAsnMap = new Map()

      // Filter to public IPs only (private IPs have no ASN)
      const publicIps = ips.filter(ip => !isPrivateIp(ip))

      // Set null for all private IPs upfront
      for (const ip of ips) {
        if (isPrivateIp(ip)) {
          asnMap.set(ip, null)
        }
      }

      if (publicIps.length === 0) {
        return asnMap
      }

      // Step 1: Try to get stored GeoIP records from database
      const storedRecords = await fetchStoredGeoIPRecords(scanId, publicIps)
      const ipsWithStoredData = new Set<string>()

      for (const record of storedRecords) {
        if (record.asn) {
          asnMap.set(record.host_ip, {
            asn: record.asn,
            as_org: record.as_org || null,
          })
          ipsWithStoredData.add(record.host_ip)
        }
      }

      // Step 2: For IPs without stored ASN data, do live lookups (JIT)
      const ipsNeedingLookup = publicIps.filter(ip => !ipsWithStoredData.has(ip))

      if (ipsNeedingLookup.length > 0) {
        const liveResults = await fetchLiveAsnData(ipsNeedingLookup)
        for (const [ip, asnInfo] of liveResults) {
          asnMap.set(ip, asnInfo)
        }
      }

      return asnMap
    },
    enabled: ips.length > 0,
    staleTime: 60000, // Cache for 1 minute
  })
}

/**
 * Fetch stored GeoIP records from database
 */
async function fetchStoredGeoIPRecords(
  scanId: number,
  ips: string[]
): Promise<Array<{ host_ip: string; asn: number | null; as_org: string | null }>> {
  try {
    // Query database for GeoIP records
    // For scan-specific, filter by scan_id; for global, get all records for these IPs
    if (scanId > 0) {
      const records = await db.getGeoIPByScan(scanId)
      return records
        .filter(r => ips.includes(r.host_ip))
        .map(r => ({
          host_ip: r.host_ip,
          asn: r.asn,
          as_org: r.as_org,
        }))
    } else {
      // Global case - get GeoIP for all provided IPs
      const results: Array<{ host_ip: string; asn: number | null; as_org: string | null }> = []
      for (const ip of ips) {
        try {
          const record = await db.getGeoIPByHost(ip)
          if (record) {
            results.push({
              host_ip: record.host_ip,
              asn: record.asn,
              as_org: record.as_org,
            })
          }
        } catch {
          // Skip IPs that fail lookup
        }
      }
      return results
    }
  } catch {
    // Database might not have GeoIP table (v5 schema)
    return []
  }
}

/**
 * Fetch live ASN data from GeoIP API (JIT calculation)
 */
async function fetchLiveAsnData(ips: string[]): Promise<IpAsnMap> {
  const results: IpAsnMap = new Map()
  const apiUrl = import.meta.env.VITE_GEOIP_URL || 'http://localhost:3001'

  // Batch lookups with concurrency limit
  const batchSize = 20
  for (let i = 0; i < ips.length; i += batchSize) {
    const batch = ips.slice(i, i + batchSize)
    const batchPromises = batch.map(async (ip) => {
      try {
        const response = await fetch(`${apiUrl}/lookup/${encodeURIComponent(ip)}`)
        if (!response.ok) {
          results.set(ip, null)
          return
        }
        const data = await response.json()
        if (data.asn) {
          results.set(ip, {
            asn: data.asn,
            as_org: data.as_org || null,
          })
        } else {
          results.set(ip, null)
        }
      } catch {
        results.set(ip, null)
      }
    })
    await Promise.all(batchPromises)
  }

  return results
}
