# Product Requirements Document: Network Topology Route Discovery

**PRD-2026-001** | **Status**: Draft
**Author**: Claude (Architecture Agent)
**Date**: 2026-01-03
**Version**: 1.0

---

## 1. WHY (Problem Statement)

### 1.1 The Core Problem

When viewing network topology in Alicorn at `http://localhost:31337/topology`, **all discovered hosts appear flat in a star pattern radiating from the scanner**, regardless of their actual network location. A host at 192.168.1.100 (local LAN) appears visually identical to a host at 203.0.113.50 (three ISP hops away).

This flat representation fails to answer critical security questions:

- **"What path does traffic take to reach this host?"**
- **"Which routers does my traffic traverse?"**
- **"Are there chokepoints in our network?"**
- **"If a router fails, which hosts become unreachable?"**

### 1.2 Root Cause Analysis

The Alicorn topology visualization already supports route display. Looking at the code:

```typescript
// From hooks.ts - buildTopologyData()
for (const hop of hops) {
  // Add intermediate hops as router nodes
  if (!nodeMap.has(hop.hop_addr)) {
    nodeMap.set(hop.hop_addr, {
      type: 'router',
      estimatedHops: hop.hop_number || 1,
    })
  }
  // Create edge from hop to target
  edges.push({
    source: hop.hop_addr,
    target: hop.target_addr,
    hopNumber: hop.hop_number,
  })
}
```

**The problem isn't visualization—it's data collection.** The `uni_hops` table exists but is empty because:

1. **Unicornscan lacks an MTR-like mode** that actively discovers paths using incremental TTL
2. The existing `trace_addr` field captures incidental ICMP Time Exceeded responses, but **no mode systematically probes for them**
3. Without hop data, global topology defaults to direct scanner→host edges:

```typescript
// From hooks.ts line 121-136
if (hops.length === 0) {
  // No hops discovered - connect scanner directly to all hosts
  for (const host of hosts) {
    edges.push({ source: scannerAddr, target: hostIp })
  }
}
```

### 1.3 Impact

| Stakeholder | Impact |
|-------------|--------|
| Network Administrators | Cannot identify routing paths or bottlenecks |
| Security Analysts | Cannot understand attack surface topology |
| Incident Responders | Cannot quickly determine affected paths during outages |
| Penetration Testers | Cannot visualize pivot opportunities |

### 1.4 Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Hop data records in `uni_hops` | 0 | N per discovered host (where N = path length) |
| Average hops displayed per host | 1 (direct edge only) | Actual network hops |
| Router nodes in topology | 0 | All discovered intermediate routers |
| Path visualization accuracy | N/A | Matches `mtr` output within 1 hop |

---

## 2. WHAT (Proposed Solution)

### 2.1 Solution Overview

Add **MTR (My Traceroute) mode** to unicornscan that:

1. **Actively discovers paths** using incremental TTL probing (1, 2, 3, ...)
2. **Captures ICMP Time Exceeded responses** from intermediate routers
3. **Stores hop data** in the existing `uni_hops` table
4. **Enables Alicorn** to render accurate topology graphs with routes

### 2.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│  │ unicornscan  │────▶│  PostgreSQL  │────▶│   Alicorn    │        │
│  │   -M mtr     │     │  uni_hops    │     │  Topology    │        │
│  └──────┬───────┘     └──────────────┘     └──────────────┘        │
│         │                                                            │
│         │ TTL=1,2,3...N                                              │
│         ▼                                                            │
│  ┌──────────────┐                                                   │
│  │   Router 1   │──┐                                                │
│  │   (TTL=1)    │  │                                                │
│  └──────────────┘  │    ICMP Time Exceeded                          │
│         │          │    (captured and stored)                        │
│         ▼          │                                                │
│  ┌──────────────┐  │                                                │
│  │   Router 2   │──┤                                                │
│  │   (TTL=2)    │  │                                                │
│  └──────────────┘  │                                                │
│         │          │                                                │
│         ▼          ▼                                                │
│  ┌──────────────┐                                                   │
│  │    Target    │  TCP SYN-ACK / RST                                │
│  │   (TTL=3)    │  (destination reached)                            │
│  └──────────────┘                                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 User Stories

#### US-001: Network Path Discovery
> As a **network administrator**, I want to discover the route to each scanned host, so that I can understand my network topology.

**Acceptance Criteria:**
- Running `unicornscan -M mtr 192.168.1.0/24:80` discovers paths to all reachable hosts
- Each intermediate router is recorded in `uni_hops`
- Path data is available in Alicorn topology view

#### US-002: Visual Topology with Routes
> As a **security analyst**, I want to see network paths in Alicorn's topology view, so that I can identify critical infrastructure.

**Acceptance Criteria:**
- Routers appear as amber nodes (type: 'router')
- Edges between routers and hosts show hop number
- Clicking a host shows its full path from scanner

#### US-003: Path Statistics
> As a **network engineer**, I want per-hop latency statistics, so that I can identify slow links.

**Acceptance Criteria:**
- RTT (round-trip time) recorded per hop
- Packet loss tracked per hop
- Statistics visible in Alicorn host details

### 2.4 Feature Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-001 | MTR mode with incremental TTL probing | P0 (Must) | Planned |
| FR-002 | ICMP Time Exceeded response capture | P0 (Must) | Exists (partial) |
| FR-003 | Hop data storage in PostgreSQL | P0 (Must) | Schema exists |
| FR-004 | Per-hop RTT measurement | P1 (Should) | Planned |
| FR-005 | Per-hop loss percentage | P1 (Should) | Planned |
| FR-006 | Continuous monitoring mode | P2 (Could) | Planned |
| FR-007 | UDP/ICMP probe protocols | P2 (Could) | Planned |
| FR-008 | JSON/CSV output formats | P3 (Nice) | Planned |

### 2.5 Out of Scope (This Release)

- IPv6 path discovery
- MPLS label discovery
- BGP AS path correlation
- Historical path comparison
- Real-time path monitoring dashboard

---

## 3. HOW (Implementation Details)

### 3.1 Component Changes

#### 3.1.1 Unicornscan Core (C)

**New Files:**
| File | Purpose |
|------|---------|
| `src/scan_progs/mtr_mode.h` | Data structures: `mtr_config_t`, `mtr_hop_stats_t`, `mtr_session_t` |
| `src/scan_progs/mtr_mode.c` | Session management, TTL iteration, state machine |
| `src/scan_progs/mtr_probe.c` | Probe creation (TCP SYN with variable TTL) |
| `src/scan_progs/mtr_stats.c` | RTT calculation, loss tracking |

**Modified Files:**
| File | Change |
|------|--------|
| `src/settings.h` | Add `MODE_MTRSCAN = 0x80`, `mtr_config_t` field |
| `src/getconfig.c` | Add `-M mtr`, `--mtr-*` options parsing |
| `src/scan_progs/packet_parse.c` | Enhance ICMP Type 11 extraction at line 938 |
| `src/scan_progs/recv_packet.c` | Route ICMP TTL Exceeded to MTR handler |
| `src/output_modules/database/pgsqldb.c` | Insert discovered hops to `uni_hops` |

#### 3.1.2 Database Schema

The schema already supports hops via the `uni_hops` table:

```sql
-- Already exists in schema v5+
CREATE TABLE uni_hops (
    hop_id SERIAL PRIMARY KEY,
    ipreport_id INTEGER REFERENCES uni_ip_reports(ipreport_id),
    scan_id INTEGER NOT NULL,
    target_addr TEXT NOT NULL,     -- Host we were probing
    hop_addr TEXT NOT NULL,        -- Intermediate router
    hop_number INTEGER,            -- Position in path (1, 2, 3...)
    ttl_observed INTEGER NOT NULL, -- TTL from response packet
    rtt_us INTEGER,                -- Round-trip time in microseconds
    extra_data JSONB
);
```

**No schema changes required.**

#### 3.1.3 Alicorn Frontend (TypeScript)

The frontend already supports hop visualization. Changes needed only for enhanced display:

| File | Change |
|------|--------|
| `src/features/topology/hooks.ts` | No changes (already handles hops) |
| `src/features/topology/NetworkGraph.tsx` | Optional: Style edges by RTT |
| `src/pages/HostDetail.tsx` | Add "Path to Host" section showing hop list |

### 3.2 Command-Line Interface

```bash
# Basic MTR mode - discover paths to all hosts on subnet
unicornscan -M mtr 192.168.1.0/24:80

# With options
unicornscan -M mtr --mtr-probes 5 --mtr-max-ttl 30 10.0.0.1:443

# Combined with database output (for Alicorn)
unicornscan -M mtr -o pg:postgresql://localhost/unicornscan 192.168.1.0/24:80

# Full option set
Options:
  -M mtr, --mtr-mode           Enable MTR (incremental TTL traceroute) mode
  --mtr-max-ttl <N>            Maximum TTL to probe (default: 30)
  --mtr-min-ttl <N>            Starting TTL value (default: 1)
  --mtr-probes <N>             Probes per TTL hop (default: 3)
  --mtr-interval <ms>          Interval between probe rounds (default: 1000)
  --mtr-timeout <ms>           Per-probe timeout (default: 5000)
  --mtr-protocol <tcp|udp|icmp> Probe protocol (default: tcp)
```

### 3.3 Algorithm: MTR Probe Sequence

```
FOR each target_host in scan_targets:
    session = create_mtr_session(target_host)

    FOR ttl = 1 TO max_ttl:
        FOR probe = 1 TO probes_per_hop:
            # Send TCP SYN with current TTL
            packet = create_tcp_syn(target_host, target_port, ttl)
            send_packet(packet)
            record_probe_time(session, ttl, probe)
        END FOR
    END FOR

    # Wait for responses
    WHILE has_outstanding_probes(session) AND NOT timeout:
        response = receive_packet()

        IF response.type == ICMP_TIME_EXCEEDED:
            # Router at this hop responded
            hop = extract_hop_info(response)
            hop.router_ip = response.source_ip
            hop.ttl = original_packet.ttl  # From ICMP payload
            hop.rtt = calculate_rtt(session, original_packet)
            insert_hop_to_database(session, hop)

        ELSE IF response.type == TCP_SYNACK or TCP_RST:
            # Reached destination
            session.path_discovered = true
            hop.router_ip = target_host
            hop.ttl = current_ttl
            insert_hop_to_database(session, hop)
        END IF
    END WHILE
END FOR
```

### 3.4 Data Flow: Scanner to Visualization

```
┌───────────────────────────────────────────────────────────────────────────┐
│                            DATA FLOW SEQUENCE                              │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  1. SCAN EXECUTION                                                         │
│     $ unicornscan -M mtr -o pg:... 192.168.1.0/24:80                      │
│                                                                            │
│  2. PACKET TRANSMISSION (mtr_probe.c)                                      │
│     TTL=1: SYN → 192.168.1.x:80                                           │
│     TTL=2: SYN → 192.168.1.x:80                                           │
│     TTL=3: SYN → 192.168.1.x:80                                           │
│     ...                                                                    │
│                                                                            │
│  3. RESPONSE CAPTURE (recv_packet.c)                                       │
│     ← ICMP Type 11 from 10.0.0.1 (TTL=1)                                  │
│     ← ICMP Type 11 from 172.16.0.1 (TTL=2)                                │
│     ← TCP SYN-ACK from 192.168.1.x (destination reached)                  │
│                                                                            │
│  4. HOP EXTRACTION (mtr_mode.c)                                            │
│     Parse ICMP payload → extract original packet → match to probe          │
│     Calculate RTT = now - probe_send_time                                  │
│                                                                            │
│  5. DATABASE INSERT (pgsqldb.c)                                            │
│     INSERT INTO uni_hops (scan_id, target_addr, hop_addr, hop_number, ...)│
│     VALUES (1, '192.168.1.100', '10.0.0.1', 1, ...)                       │
│     VALUES (1, '192.168.1.100', '172.16.0.1', 2, ...)                     │
│     VALUES (1, '192.168.1.100', '192.168.1.100', 3, ...)                  │
│                                                                            │
│  6. ALICORN QUERY (hooks.ts)                                               │
│     const hopsQuery = db.getHops(scan_id)                                  │
│     → Returns hop records from uni_hops                                    │
│                                                                            │
│  7. TOPOLOGY BUILD (hooks.ts - buildTopologyData)                          │
│     for (hop of hops) {                                                    │
│       nodeMap.set(hop.hop_addr, { type: 'router', ... })                  │
│       edges.push({ source: hop.hop_addr, target: hop.target_addr })       │
│     }                                                                      │
│                                                                            │
│  8. VISUALIZATION (NetworkGraph.tsx)                                       │
│     D3 force-directed layout renders:                                      │
│     [Scanner] ──→ [Router 1] ──→ [Router 2] ──→ [Target Host]             │
│                                                                            │
└───────────────────────────────────────────────────────────────────────────┘
```

### 3.5 Existing Infrastructure Leverage

The implementation leverages significant existing code:

| Component | Existing | Needed |
|-----------|----------|--------|
| ICMP Type 11 parsing | ✅ `packet_parse.c:938` | Route to MTR handler |
| `trace_addr` field | ✅ `ip_report_t` | Use in MTR mode |
| TTL configuration | ✅ `minttl/maxttl` in settings | Per-probe TTL |
| PostgreSQL output | ✅ `pgsqldb.c` | Add hop INSERT |
| `uni_hops` table | ✅ Schema v5+ | Already defined |
| Alicorn hop display | ✅ `buildTopologyData()` | Already implemented |

### 3.6 Testing Strategy

#### Unit Tests
```c
// mtr_stats_test.c
void test_rtt_calculation(void);
void test_loss_percentage(void);
void test_hop_statistics_aggregation(void);

// mtr_probe_test.c
void test_tcp_syn_construction_with_ttl(void);
void test_probe_to_response_matching(void);
void test_icmp_payload_extraction(void);
```

#### Integration Tests
```bash
# Compare with system mtr
mtr -r -c 10 8.8.8.8 > /tmp/mtr_reference.txt
unicornscan -M mtr --mtr-probes 10 8.8.8.8:53 > /tmp/unicorn_mtr.txt
diff_hop_count < 2  # Should match within 1 hop

# Verify database population
SELECT COUNT(*) FROM uni_hops WHERE scan_id = (SELECT MAX(scan_id) FROM uni_scans);
# Expected: > 0

# Verify Alicorn visualization
curl http://localhost:31337/api/topology?scan_id=X | jq '.edges | length'
# Expected: > number_of_hosts (edges include hops)
```

### 3.7 Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1: Foundation | 2 weeks | Basic TTL probing, ICMP capture, single path discovery |
| Phase 2: Statistics | 2 weeks | RTT measurement, loss calculation, database storage |
| Phase 3: Integration | 1 week | PostgreSQL output module integration, testing |
| Phase 4: Polish | 1 week | Documentation, edge cases, performance optimization |

**Total: 6 weeks**

### 3.8 Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ICMP rate limiting by firewalls | High | Medium | Configurable probe rate, fallback to estimation |
| Asymmetric routing (different return path) | Medium | Low | Document as known limitation |
| High packet loss affecting accuracy | Medium | Medium | Multiple probes per hop, confidence scoring |
| Performance impact on large scans | Medium | Medium | Separate MTR mode from fast scans |

---

## 4. Appendix

### A. Current Alicorn Topology Types

```typescript
// From types.ts
interface TopologyNode {
  id: string           // IP address
  type: NodeType       // 'scanner' | 'host' | 'router' | 'unknown'
  portCount: number
  connectionCount: number
  observedTtl?: number
  estimatedHops: number
}

interface TopologyEdge {
  source: string | TopologyNode
  target: string | TopologyNode
  hopNumber?: number   // This is the key field for path visualization
  rttUs?: number
}
```

### B. Database Hop Interface

```typescript
// From database.ts
interface Hop {
  hop_id: number
  ipreport_id: number
  scan_id: number
  target_addr: string   // The host we were probing
  hop_addr: string      // Intermediate router that responded
  hop_number: number | null
  ttl_observed: number
  rtt_us: number | null
  extra_data: Record<string, unknown> | null
}
```

### C. References

- [MTR_MODE_DESIGN.md](/opt/unicornscan/docs/architecture/MTR_MODE_DESIGN.md) - Detailed architectural design
- [tcptraceroute source](/opt/tcptraceroute/) - Reference implementation
- RFC 792 - Internet Control Message Protocol
- Unicornscan ICMP handling: `packet_parse.c:938`

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-03 | Claude | Initial draft |

---

*This PRD is ready for stakeholder review. The implementation builds on existing infrastructure and addresses a clear user need for network path visibility.*
