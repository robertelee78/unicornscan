# Remote Compound Mode Strategies for Unicornscan

## Research Document: Extending Compound Mode Beyond Local Networks

**Date:** 2026-01-23
**Author:** Research Agent
**Version:** 1.0

---

## 1. Problem Statement

The current compound mode (`-mA+T`, `-mA+U`) works well for local network scanning:

1. **Phase 1 (ARP):** Discovers which hosts respond on the local broadcast domain
2. **Phase 2+ (TCP/UDP):** Only scans hosts that responded to ARP

This eliminates the kernel's 3-second ARP resolution delay for non-existent hosts, dramatically improving scan efficiency.

**The Problem:** For remote hosts (those requiring gateway routing), ARP is meaningless. The ARP response comes from the gateway, not the target host. We need alternative "host alive" discovery mechanisms for remote networks.

---

## 2. Current Architecture Analysis

### 2.1 Phase Filter System (`/opt/unicornscan/src/scan_progs/phase_filter.c`)

The phase filter provides:

```c
int phase_filter_init(void);                              // Initialize cache
int phase_filter_store(uint32_t ipaddr, const uint8_t *hwaddr);  // Store responder
int phase_filter_check(uint32_t ipaddr);                  // Check if host responded
uint32_t phase_filter_count(void);                        // Count responders
void phase_filter_walk(callback, ctx);                    // Iterate responders
void phase_filter_destroy(void);                          // Cleanup
```

The key data stored is:
- **IP address** (network byte order)
- **Hardware address** (MAC, 6 bytes)

For remote scanning, we need to generalize this to store just **responding IPs** without requiring a MAC address.

### 2.2 Report System (`/opt/unicornscan/src/scan_progs/report.c`)

The report system already tracks TCP response states:

```c
static int port_open(uint8_t proto, uint16_t type, uint16_t subtype) {
    switch (proto) {
        case IPPROTO_TCP:
            // SYN-ACK = open port
            if ((type & (TH_SYN|TH_ACK)) == (TH_SYN|TH_ACK)) {
                return 1;
            }
            break;
        case IPPROTO_UDP:
            return 1;  // Any response = alive
            break;
    }
    return 0;
}

static int port_closed(uint8_t proto, uint16_t type, uint16_t subtype) {
    switch (proto) {
        case IPPROTO_TCP:
            // RST-ACK = closed but host alive
            if ((type & (TH_ACK|TH_RST)) == (TH_ACK|TH_RST)) {
                return 1;
            }
            break;
        case IPPROTO_ICMP:
            // Port Unreachable = host alive
            if (type == 3 && subtype == 3) {
                return 1;
            }
            break;
    }
    return 0;
}
```

### 2.3 IP Report Structure (`/opt/unicornscan/src/scan_progs/scan_export.h`)

```c
typedef struct _PACKED_ ip_report_t {
    uint32_t magic;           // IP_REPORT_MAGIC
    uint16_t sport;           // source port (our local port)
    uint16_t dport;           // target port
    uint8_t proto;            // IPPROTO_TCP, IPPROTO_ICMP, etc.
    uint16_t type;            // TCP flags or ICMP type
    uint16_t subtype;         // ICMP code
    uint32_t send_addr;       // who started conversation
    uint32_t host_addr;       // target machine
    uint32_t trace_addr;      // where packet came from
    uint8_t ttl;              // received TTL
    // ... additional fields
} ip_report_t;
```

---

## 3. TCP Response States Indicating "Host Alive"

Based on analysis of `report.c` and TCP/IP standards:

| Response Type | TCP Flags | Meaning | Host State |
|---------------|-----------|---------|------------|
| SYN-ACK | `TH_SYN \| TH_ACK` | Port open | **Alive** |
| RST-ACK | `TH_RST \| TH_ACK` | Port closed | **Alive** |
| RST | `TH_RST` | Unsolicited reset | **Alive** |
| ICMP Type 3, Code 1 | N/A | Host Unreachable | **Filtered/Down** |
| ICMP Type 3, Code 3 | N/A | Port Unreachable | **Alive** (port closed) |
| ICMP Type 3, Code 9/10/13 | N/A | Admin Prohibited | **Alive** (filtered) |
| No Response | N/A | Timeout | **Unknown** |

**Key Insight:** Any TCP response (SYN-ACK or RST) proves the host is alive. ICMP "Port Unreachable" also proves the host is alive. Only "Host Unreachable" or no response suggests the host may be down.

---

## 4. How Other Scanners Handle This

### 4.1 Nmap Host Discovery

From [Nmap documentation](https://nmap.org/book/man-host-discovery.html):

**Default Discovery (privileged):**
- ICMP Echo Request
- TCP SYN to port 443
- TCP ACK to port 80
- ICMP Timestamp Request

**Key Options:**
- `-PS<ports>`: TCP SYN Ping - expects SYN-ACK or RST
- `-PA<ports>`: TCP ACK Ping - expects RST (good for stateless firewalls)
- `-PU<ports>`: UDP Ping - expects ICMP Port Unreachable
- `-PE`: ICMP Echo Request
- `-Pn`: Skip discovery, treat all hosts as up

**Strategy:** Nmap sends multiple probe types to maximize detection through different firewall configurations.

### 4.2 Masscan Approach

From [Masscan GitHub](https://github.com/robertdavidgraham/masscan):

**Key Characteristics:**
- **Stateless SYN scanning** - no discovery phase
- **Implicit `-Pn`** - assumes all hosts might be up
- **Fire and forget** - sends SYNs regardless of whether host exists
- **Retries** - configurable retries at 1-second intervals

**Trade-off:** Masscan trades accuracy for speed. It doesn't waste time on discovery but may scan many non-existent hosts.

---

## 5. Proposed Compound Mode Strategies for Remote Hosts

### 5.1 Strategy A: TCP Ping Discovery (`-mP+T`, `-mP+U`)

**Concept:** Use TCP probes to specific ports as a discovery mechanism.

**Phase 1: TCP Ping**
- Send TCP SYN to common open ports (80, 443, 22, etc.)
- Any response (SYN-ACK or RST) proves host alive
- Cache responding IPs in phase filter

**Phase 2+: Full Scan**
- Only scan hosts that responded in phase 1

**Advantages:**
- Works through NAT and over the internet
- RST response proves host alive even if port closed
- Fast (single packet per host per probe port)

**Implementation Notes:**
- New mode: `MODE_TCPPING` (or reuse `MODE_TCPSCAN` with special flag)
- Phase filter needs generalization to store IP-only entries
- Default probe ports: 80, 443, 22, 8080

**Syntax Examples:**
```bash
# TCP ping to port 80 + full TCP scan
unicornscan -mP80+T 10.0.0.0/24:1-1024

# TCP ping to multiple ports + UDP scan
unicornscan -mP80,443,22+U 192.168.1.0/24:53,123,161
```

### 5.2 Strategy B: ICMP Echo Discovery (`-mI+T`, `-mI+U`)

**Concept:** Use ICMP echo as remote equivalent of ARP.

**Phase 1: ICMP Echo**
- Send ICMP Echo Request to all targets
- Any response (Echo Reply) proves host alive
- Cache responding IPs in phase filter

**Phase 2+: Full Scan**
- Only scan hosts that responded to ICMP

**Advantages:**
- Simple, widely understood
- Single packet per host
- Works when ICMP is allowed

**Disadvantages:**
- Many networks filter ICMP
- Will miss hosts behind ICMP-blocking firewalls

**Implementation Notes:**
- `MODE_ICMPSCAN` already exists
- Need to add phase filter integration for ICMP responses
- Handle ICMP Echo Reply (type 0) as "alive" indicator

**Syntax Example:**
```bash
unicornscan -mI+T 10.0.0.0/24:1-65535
```

### 5.3 Strategy C: Inverse Filtering - Port to Port (`-mT@+U@`)

**Concept:** TCP scan first to find open ports, then UDP scan only those same ports.

**Phase 1: TCP Scan**
- Full TCP SYN scan of specified ports
- Record which ports responded (open)
- Store as (IP, port) tuples, not just IPs

**Phase 2: UDP Scan**
- UDP scan only the ports that had TCP response
- Useful for services that run on same port (DNS, NTP)

**Use Cases:**
- Finding UDP services on ports where TCP responded
- Dual-stack protocol discovery (e.g., DNS on TCP+UDP)

**Implementation Notes:**
- Requires new phase filter structure: (IP, port) tuples
- Or use existing IP filter + per-host port mask
- More complex but enables port-level filtering

**Syntax Example:**
```bash
# TCP scan, then UDP only to ports where TCP responded
unicornscan -mT@+U@ 10.0.0.0/24:53,123,161
```

### 5.4 Strategy D: Combined Discovery (`-mC+T`)

**Concept:** Send multiple probe types simultaneously for maximum coverage.

**Phase 1: Combined Probes**
- Send ICMP Echo + TCP SYN to port 80 + TCP ACK to port 443
- Any response from any probe = host alive
- Similar to Nmap's default behavior

**Phase 2+: Full Scan**
- Scan all hosts that responded to any probe

**Advantages:**
- Maximum host discovery coverage
- Compensates for different firewall configurations

**Disadvantages:**
- More packets per host in discovery phase
- More complex implementation

---

## 6. Architectural Changes Required

### 6.1 Generalized Phase Filter

Current filter stores IP + MAC. For remote scanning, we need IP-only storage:

```c
/* Extended phase filter API */
int phase_filter_store_ip(uint32_t ipaddr);           // IP-only storage
int phase_filter_store_port(uint32_t ipaddr, uint16_t port);  // For Strategy C
```

**Option 1:** Add parallel hash table for IP-only entries
**Option 2:** Store dummy MAC (00:00:00:00:00:00) for remote hosts
**Option 3:** Refactor to use a union with different entry types

Recommendation: **Option 2** is simplest - store dummy MAC for non-ARP responses. The MAC is only used for display, not filtering.

### 6.2 Response Classification in Listener

In `recv_packet.c` and `packet_parse.c`, add logic to classify responses as "host alive":

```c
/* In deal_with_output() or similar */
if (is_compound_mode() && current_phase == 1) {
    if (is_host_alive_response(report)) {
        phase_filter_store_ip(report->host_addr);
    }
}

static int is_host_alive_response(ip_report_t *r) {
    switch (r->proto) {
        case IPPROTO_TCP:
            /* SYN-ACK or RST means host alive */
            if (r->type & (TH_SYN | TH_RST)) return 1;
            break;
        case IPPROTO_ICMP:
            /* Echo Reply = alive */
            if (r->type == ICMP_ECHOREPLY) return 1;
            /* Port Unreachable = alive (port closed) */
            if (r->type == ICMP_DEST_UNREACH && r->subtype == 3) return 1;
            break;
        case IPPROTO_UDP:
            /* Any UDP response = alive */
            return 1;
    }
    return 0;
}
```

### 6.3 Mode Parser Extensions

In `scan_export.c` `scan_parsemode()`, add new mode indicators:

```c
case 'P':  /* TCP Ping */
    mode = MODE_TCPPING;
    break;
case 'I':  /* ICMP Echo (already exists as MODE_ICMPSCAN) */
    mode = MODE_ICMPSCAN;
    break;
case 'C':  /* Combined discovery */
    mode = MODE_COMBINED;
    break;
```

### 6.4 Remote Detection

Before creating workunits, detect if target is local or remote:

```c
/* In workunit_add() or do_targets() */
int target_is_local = (gateway == NULL);

if (target_is_local) {
    /* ARP discovery valid */
} else {
    /* Need alternative discovery or skip to direct scan */
    if (phase_mode == MODE_ARPSCAN) {
        WARN("ARP discovery not valid for remote target %s", target);
        /* Either fail or auto-switch to TCP ping */
    }
}
```

**Current behavior:** Already implemented in `workunit_add()` - it checks for gateway and fails with helpful error message.

---

## 7. Recommended Implementation Priority

### Phase 1: TCP Ping Discovery (Strategy A) - HIGH PRIORITY

**Rationale:**
- Most practical for real-world remote scanning
- TCP responses reliably indicate host alive
- Implementation reuses existing TCP scan infrastructure

**Work Items:**
1. Add `MODE_TCPPING` constant
2. Modify phase filter to accept IP-only entries
3. Add "alive" classification in `deal_with_output()`
4. Update mode parser for `-mP` syntax
5. Test with remote networks

### Phase 2: ICMP Echo Discovery (Strategy B) - MEDIUM PRIORITY

**Rationale:**
- Simpler than TCP ping
- Useful for networks allowing ICMP
- `MODE_ICMPSCAN` already exists

**Work Items:**
1. Add phase filter integration for ICMP
2. Handle ICMP Echo Reply as "alive"
3. Document limitations (ICMP filtering)

### Phase 3: Port-to-Port Filtering (Strategy C) - LOW PRIORITY

**Rationale:**
- Specialized use case
- More complex data structures
- Can be emulated with scripting

**Work Items:**
1. Extend phase filter for (IP, port) tuples
2. Modify workunit generation for port-specific filtering
3. New syntax for port-level compound mode

---

## 8. Alternative Approaches Considered

### 8.1 Skip Discovery Entirely (Like Masscan)

```bash
unicornscan -Pn -mT 10.0.0.0/16:80
```

**Pros:** Simple, no architecture changes
**Cons:** Scans non-existent hosts, slower for sparse networks

### 8.2 External Discovery Script

```bash
# Use nmap for discovery, unicornscan for scanning
nmap -sn 10.0.0.0/24 -oG - | awk '/Up/{print $2}' > live.txt
unicornscan -mT -f live.txt:1-65535
```

**Pros:** No code changes needed
**Cons:** Requires external tool, two-step process

### 8.3 Parallel Discovery + Scanning

Run TCP ping and full scan simultaneously, discard results for non-responding hosts in post-processing.

**Pros:** Single pass
**Cons:** Wastes bandwidth, complex implementation

---

## 9. Summary and Recommendations

### Immediate Recommendation

For users needing remote compound mode today:

1. **Use two-step scanning:**
   ```bash
   # Step 1: Find live hosts with TCP SYN to port 80
   unicornscan -mT target/24:80 -l live-hosts.txt

   # Step 2: Full scan of live hosts only
   unicornscan -mT -f live-hosts.txt:1-65535
   ```

2. **Or accept full scan of subnet:**
   ```bash
   unicornscan -mT target/24:1-65535
   ```

### Long-term Architecture

Implement TCP Ping Discovery (`-mP+T`) as the primary remote compound mode:

```bash
# Future syntax
unicornscan -mP80,443+T target/24:1-65535
```

This provides:
- Efficient host discovery through TCP probes
- Automatic filtering of non-responding hosts
- Seamless compound mode for both local and remote networks

---

## 10. References

- [Nmap Host Discovery Documentation](https://nmap.org/book/man-host-discovery.html)
- [Nmap Host Discovery Techniques](https://nmap.org/book/host-discovery-techniques.html)
- [Masscan GitHub Repository](https://github.com/robertdavidgraham/masscan)
- Unicornscan Source: `/opt/unicornscan/src/scan_progs/`

---

**Document Status:** Research Complete
**Next Steps:** Implementation planning for Strategy A (TCP Ping Discovery)
