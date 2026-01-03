# Product Requirements Document: Network Topology Visualization

**PRD-2026-001** | **Status**: Draft
**Author**: Claude (with PM Discovery)
**Date**: 2026-01-03
**Version**: 2.0

---

## 1. WHY (Problem Statement)

### 1.1 The Core Problem

When viewing network topology in Alicorn at `http://localhost:31337/topology`, **all discovered hosts appear as one intermingled blob**, regardless of their actual network location. Hosts from local scans (192.168.1.0/24) are mixed with hosts from external scans (www.google.com/24) in the same undifferentiated visual space.

This is a **broken window**: the visualization lies about network reality, making it useless for tactical decision-making.

### 1.2 The Job to Be Done

> **When I'm conducting network reconnaissance across multiple target networks, I want to see a topology visualization that accurately reflects network boundaries and routing paths, so that I can understand the relationship between different network segments and plan my engagement accordingly.**

A red teamer should be able to glance at the topology and immediately answer:
1. How many distinct networks did I discover?
2. How are those networks connected (routing path)?
3. Which hosts belong to which network segment?
4. Where are the network boundaries (routers/gateways)?

**Currently, the tool cannot answer any of these questions.**

### 1.3 Root Cause Analysis

Two distinct problems cause the flat visualization:

| Problem | Description | Solution Category |
|---------|-------------|-------------------|
| **No grouping** | Nodes from different CIDRs are spatially intermingled | Visualization (frontend) |
| **No path data** | We don't know the actual routers between networks | Data collection (scanner) |

The existing D3 force simulation treats all nodes equally. There's no clustering force, no CIDR awareness, and no path data to show routes.

### 1.4 Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Visual clustering by CIDR | None | All nodes grouped by /24 |
| Router nodes displayed | 0 | All discovered intermediate hops |
| Path edges between clusters | 0 | Edges showing actual route |
| Time to understand network layout | Minutes of confusion | Seconds (glance) |

---

## 2. WHAT (Proposed Solution)

### 2.1 Solution Overview

Implement a **two-layer topology visualization**:

1. **Layer 1: CIDR Grouping** (inference)
   - Cluster nodes by subnet (/24, /16, etc.)
   - Separate private (RFC1918) from public IP space
   - Visual organization, not network truth
   - Labeled as "Inferred Grouping"

2. **Layer 2: Route Discovery** (truth)
   - MTR mode for active path probing (small/medium scale)
   - Optional BGP route queries (large scale)
   - Real router nodes with actual IPs
   - Labeled as "Discovered Path"

### 2.2 Visual Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TOPOLOGY VISUALIZATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│    ┌─────────────────────┐                    ┌─────────────────────┐       │
│    │  192.168.1.0/24     │                    │   8.8.8.0/24        │       │
│    │  (Local Network)    │                    │   (External)        │       │
│    │                     │                    │                     │       │
│    │   ○ .10    ○ .25    │      ┌───┐        │   ○ .8     ○ .4     │       │
│    │                     │      │ R │        │                     │       │
│    │   ○ .15    ○ .30    │──────│   │────────│   ○ .1     ○ .2     │       │
│    │        ⬟            │      └───┘        │                     │       │
│    │     Scanner         │    10.0.0.1       │                     │       │
│    │                     │   (Hop 1 Router)  │                     │       │
│    └─────────────────────┘                    └─────────────────────┘       │
│                                                                              │
│    ○ = Host node          ⬟ = Scanner          R = Discovered router        │
│    ─── = Discovered path (MTR)                                              │
│    Dashed boundary = Inferred CIDR grouping                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Key Distinctions

| Aspect | CIDR Grouping (Layer 1) | Route Discovery (Layer 2) |
|--------|-------------------------|---------------------------|
| **Source** | Computed from IP addresses | Active probing / BGP |
| **Accuracy** | Heuristic (assumes /24 boundaries) | Empirical (actual network path) |
| **Shows** | "These IPs share address space" | "Traffic goes through these routers" |
| **Can mislead?** | Yes (VPCs, VPNs look same as LAN) | No (shows real topology) |
| **Label in UI** | "Inferred Grouping" | "Discovered Path" |
| **Timeline** | Phase 1 (days) | Phase 2 (weeks) |

### 2.4 User Stories

#### US-001: Visual Network Segmentation
> As a **red teamer**, I want hosts from different networks visually separated, so I can quickly identify distinct target environments.

**Acceptance Criteria:**
- Hosts in 192.168.x.x cluster separately from hosts in 10.x.x.x
- Public IPs (external scans) cluster separately from private IPs (internal scans)
- Cluster boundaries are visible but clearly labeled as "inferred"

#### US-002: Actual Route Visibility
> As a **red teamer**, I want to see the actual routers between my scanner and target networks, so I can identify pivot points and chokepoints.

**Acceptance Criteria:**
- Running scan with MTR mode populates router nodes
- Router nodes appear between source and destination clusters
- Clicking a router shows its IP and position in path

#### US-003: Scale-Appropriate Visualization
> As a **red teamer**, I want the visualization to adapt to dataset size, so it remains useful whether I scanned 50 hosts or 50,000.

**Acceptance Criteria:**
- Small datasets (< 1000 hosts): Show individual nodes with MTR paths
- Large datasets (> 1000 hosts): Aggregate to subnet nodes, show BGP-style paths
- User can toggle between detailed and aggregated views

### 2.5 Feature Requirements

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| FR-001 | CIDR-based clustering force in D3 simulation | P0 | 1 |
| FR-002 | Visual cluster boundaries with subnet labels | P0 | 1 |
| FR-003 | Private vs public IP separation | P0 | 1 |
| FR-004 | "Inferred grouping" labeling in UI | P0 | 1 |
| FR-005 | MTR mode in unicornscan (-M mtr) | P0 | 2 |
| FR-006 | Router node rendering from hop data | P0 | 2 |
| FR-007 | Path edges between clusters | P0 | 2 |
| FR-008 | Hop data storage in uni_hops table | P0 | 2 |
| FR-009 | Scale-based view switching | P1 | 2 |
| FR-010 | BGP route query integration | P2 | Future |

### 2.6 Out of Scope (This Release)

- IPv6 topology visualization
- Real-time path monitoring
- Historical path comparison
- MPLS label discovery
- BGP AS path visualization (future consideration for scale)

---

## 3. HOW (Implementation Details)

### 3.1 Phase 0: Foundation (1-2 days)

**Goal:** Prevent architectural debt by designing for both phases upfront.

#### 3.1.1 Data Model Preparation

Add topology source tracking to distinguish inferred vs discovered data:

```typescript
// types.ts additions
interface TopologyNode {
  // ... existing fields ...

  // New: Clustering support
  cidrGroup?: string           // e.g., "192.168.1.0/24"
  cidrPrefix?: number          // e.g., 24
  isClusterNode?: boolean      // True for aggregated subnet nodes

  // New: Source tracking
  topologySource: 'inferred' | 'discovered' | 'unknown'
}

interface TopologyEdge {
  // ... existing fields ...

  // New: Path tracking
  pathSource: 'inferred' | 'mtr' | 'bgp' | 'unknown'
  isInterCluster?: boolean     // True for edges between clusters
}
```

#### 3.1.2 Stub Router Nodes

Add placeholder visualization for undiscovered routes:

```typescript
// In buildTopologyData(), add between-cluster edges
if (sourceCluster !== targetCluster && !hasDiscoveredPath) {
  edges.push({
    id: `${sourceCluster}->${targetCluster}`,
    source: sourceCluster,
    target: targetCluster,
    pathSource: 'inferred',
    // Renders as dashed line with "?" label
  })
}
```

### 3.2 Phase 1: CIDR Grouping (2-3 days)

**Goal:** Fix the broken window with visual clustering, clearly labeled as inference.

#### 3.2.1 CIDR Utility Functions

Create `/opt/unicornscan/alicorn/src/lib/cidr.ts`:

```typescript
/**
 * Parse IP into CIDR block
 */
export function ipToCidr(ip: string, prefixLength: number = 24): string {
  const parts = ip.split('.').map(Number)
  const mask = ~((1 << (32 - prefixLength)) - 1) >>> 0
  const network = [
    (parts[0] & (mask >>> 24)) & 0xff,
    (parts[1] & (mask >>> 16)) & 0xff,
    (parts[2] & (mask >>> 8)) & 0xff,
    (parts[3] & mask) & 0xff,
  ]
  return `${network.join('.')}/${prefixLength}`
}

/**
 * Check if IP is RFC1918 private address
 */
export function isPrivateIp(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  )
}

/**
 * Group IPs by CIDR prefix
 */
export function groupByCidr(
  ips: string[],
  prefixLength: number = 24
): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const ip of ips) {
    const cidr = ipToCidr(ip, prefixLength)
    const group = groups.get(cidr) || []
    group.push(ip)
    groups.set(cidr, group)
  }
  return groups
}
```

#### 3.2.2 Cluster Force Addition

Modify `/opt/unicornscan/alicorn/src/features/topology/NetworkGraph.tsx`:

```typescript
// After line 164 (collision force), add cluster force:

// Calculate cluster centroids
const clusterCentroids = new Map<string, { x: number; y: number; count: number }>()

// Cluster force: attract nodes to their CIDR centroid
const forceCluster = (alpha: number) => {
  // Recalculate centroids each tick
  clusterCentroids.clear()
  for (const node of nodes) {
    if (!node.cidrGroup) continue
    const centroid = clusterCentroids.get(node.cidrGroup) || { x: 0, y: 0, count: 0 }
    centroid.x += node.x ?? 0
    centroid.y += node.y ?? 0
    centroid.count++
    clusterCentroids.set(node.cidrGroup, centroid)
  }

  // Pull nodes toward their cluster centroid
  for (const node of nodes) {
    if (!node.cidrGroup || node.type === 'scanner') continue
    const centroid = clusterCentroids.get(node.cidrGroup)
    if (centroid && centroid.count > 1) {
      const cx = centroid.x / centroid.count
      const cy = centroid.y / centroid.count
      const k = alpha * 0.3. // Cluster strength
      node.vx! -= (node.x! - cx) * k
      node.vy! -= (node.y! - cy) * k
    }
  }
}

// Add to simulation
simulation.force('cluster', forceCluster)
```

#### 3.2.3 Visual Cluster Boundaries

Add translucent boundary polygons around clusters:

```typescript
// In NetworkGraph.tsx, after edge rendering:

// Draw cluster boundaries (convex hulls)
const clusterHulls = container.append('g').attr('class', 'cluster-hulls')

for (const [cidr, nodeIds] of clusterGroups) {
  const clusterNodes = nodes.filter(n => nodeIds.includes(n.id))
  if (clusterNodes.length < 3) continue

  const hull = d3.polygonHull(clusterNodes.map(n => [n.x!, n.y!]))
  if (!hull) continue

  clusterHulls.append('path')
    .attr('d', `M${hull.join('L')}Z`)
    .attr('fill', 'var(--color-cluster-bg)')
    .attr('fill-opacity', 0.1)
    .attr('stroke', 'var(--color-cluster-border)')
    .attr('stroke-dasharray', '4,4')  // Dashed = inferred
    .attr('stroke-opacity', 0.5)

  // Add CIDR label
  const [cx, cy] = d3.polygonCentroid(hull)
  clusterHulls.append('text')
    .attr('x', cx)
    .attr('y', cy - 20)
    .attr('text-anchor', 'middle')
    .attr('class', 'cluster-label')
    .text(cidr)
}
```

#### 3.2.4 UI Controls

Add clustering controls to TopologyControls.tsx:

```typescript
// New control section
<div className="flex items-center gap-4">
  <Label>Grouping</Label>
  <Select value={cidrPrefix} onValueChange={setCidrPrefix}>
    <SelectItem value="24">/24 (256 hosts)</SelectItem>
    <SelectItem value="20">/20 (4K hosts)</SelectItem>
    <SelectItem value="16">/16 (65K hosts)</SelectItem>
  </Select>
  <Badge variant="outline">Inferred</Badge>
</div>
```

### 3.3 Phase 2: Route Discovery (4-6 weeks)

**Goal:** Add MTR mode to unicornscan for real path discovery.

#### 3.3.1 Scanner Changes (C)

See [MTR_MODE_DESIGN.md](/opt/unicornscan/docs/architecture/MTR_MODE_DESIGN.md) for full specification.

**New files:**
- `src/scan_progs/mtr_mode.h` - Data structures
- `src/scan_progs/mtr_mode.c` - Session management, TTL iteration
- `src/scan_progs/mtr_probe.c` - Probe creation
- `src/scan_progs/mtr_stats.c` - Statistics calculation

**Modified files:**
- `src/settings.h` - Add `MODE_MTRSCAN`
- `src/getconfig.c` - Add `-M mtr` option parsing
- `src/scan_progs/packet_parse.c` - Enhanced ICMP Type 11 handling
- `src/output_modules/database/pgsqldb.c` - INSERT to uni_hops

**CLI:**
```bash
# Basic MTR mode
unicornscan -M mtr 192.168.1.0/24:80

# With options
unicornscan -M mtr --mtr-probes 5 --mtr-max-ttl 30 target.com:443

# Combined with database output (for Alicorn)
unicornscan -M mtr -o pg:postgresql://localhost/unicornscan 192.168.1.0/24:80
```

#### 3.3.2 Database Schema

The `uni_hops` table already exists:

```sql
CREATE TABLE uni_hops (
    hop_id SERIAL PRIMARY KEY,
    ipreport_id INTEGER REFERENCES uni_ip_reports(ipreport_id),
    scan_id INTEGER NOT NULL,
    target_addr TEXT NOT NULL,     -- Host we were probing
    hop_addr TEXT NOT NULL,        -- Intermediate router IP
    hop_number INTEGER,            -- Position in path (1, 2, 3...)
    ttl_observed INTEGER NOT NULL, -- TTL from ICMP response
    rtt_us INTEGER,                -- Round-trip time (microseconds)
    extra_data JSONB
);
```

#### 3.3.3 Alicorn Integration

The `buildTopologyData()` function in hooks.ts already handles hops:

```typescript
// Existing code (hooks.ts:87-117) - already works!
for (const hop of hops) {
  if (!nodeMap.has(hop.hop_addr)) {
    nodeMap.set(hop.hop_addr, {
      id: hop.hop_addr,
      type: 'router',
      label: hop.hop_addr,
      osFamily: 'router',
      estimatedHops: hop.hop_number || 1,
    })
  }

  edges.push({
    id: `${hop.hop_addr}->${hop.target_addr}`,
    source: hop.hop_addr,
    target: hop.target_addr,
    hopNumber: hop.hop_number,
    rttUs: hop.rtt_us,
  })
}
```

**Once MTR mode populates uni_hops, Alicorn will automatically render routes.**

#### 3.3.4 Visual Distinction

Update edge rendering to distinguish discovered vs inferred paths:

```typescript
// Solid lines for discovered paths
edgeElements
  .attr('stroke-dasharray', d =>
    d.pathSource === 'discovered' ? 'none' : '4,4'
  )
  .attr('stroke-width', d =>
    d.pathSource === 'discovered' ? 2 : 1
  )
```

### 3.4 Future: Large-Scale / BGP Integration

For datasets with > 10,000 hosts or internet-scale visualization:

1. **BGP Route Queries**: Query RouteViews or RIPE RIS for AS paths
2. **Macro Aggregation**: Show /16 or ASN-level clusters
3. **OPTE-Style Rendering**: Radial layout from scanner, incandescence coloring

This is out of scope for initial release but the architecture supports it.

---

## 4. Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Phase 0: Foundation** | 1-2 days | Data model, topology source tracking, stub nodes |
| **Phase 1: Grouping** | 2-3 days | CIDR clustering, visual boundaries, UI controls |
| **Phase 2: Discovery** | 4-6 weeks | MTR mode, hop storage, router visualization |
| **Future: Scale** | TBD | BGP integration, macro aggregation |

**Total to fix broken window:** ~1 week (Phases 0+1)
**Total for complete solution:** ~7-8 weeks (all phases)

---

## 5. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **"Good enough" trap** | Moderate | Phase 2 deprioritized | Label Phase 1 as "inferred", show placeholder router slots |
| **CIDR grouping misleads** | Moderate | Users assume network truth | Dashed boundaries, explicit "Inferred Grouping" badge |
| **ICMP rate limiting** | High | MTR paths incomplete | Configurable probe rate, mark incomplete paths |
| **Scale performance** | Low | Large graphs slow | Existing aggregation, WebGL for > 10K nodes |

---

## 6. Open Questions

1. **Default CIDR prefix**: /24 is standard, but should we auto-detect based on scan targets?
2. **Path caching**: Should MTR paths be refreshed on each scan or cached?
3. **Multi-scan aggregation**: How to visualize routes when combining scans with different paths?

---

## 7. Appendices

### A. Related Documents
- [MTR_MODE_DESIGN.md](/opt/unicornscan/docs/architecture/MTR_MODE_DESIGN.md) - Full MTR architecture
- [CODING_STANDARDS.md](/opt/unicornscan/CODING_STANDARDS.md) - Jack Louis coding conventions
- [Alicorn Topology Code](/opt/unicornscan/alicorn/src/features/topology/) - Current implementation

### B. OPTE Project Inspiration
The [OPTE Project](https://www.opte.org/) uses BGP data for internet-scale topology. Key techniques applicable here:
- Radial layout from central seed (scanner)
- Incandescence coloring (connection density = brightness)
- Hierarchical clustering (supernet → subnet → host)

### C. Agent Research Summary
Four agents analyzed this problem:
1. **Requirements Analyst**: Identified "job to be done" as tactical situational awareness
2. **OPTE Researcher**: Mapped visualization techniques adaptable to scan context
3. **Code Explorer**: Located specific integration points in Alicorn codebase
4. **Architect**: Recommended sequenced phases with "grouping vs topology" distinction

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-03 | Claude | Initial draft (skipped PM discovery) |
| 2.0 | 2026-01-03 | Claude | Complete rewrite after PM discovery session |

---

*This PRD incorporates feedback from PM discovery questions and multi-agent analysis. Ready for stakeholder review.*
