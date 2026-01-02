# PRD: MAC Address Capture for Local Network IP Scans

## Overview

Extend unicornscan to capture and store the source MAC address from Ethernet headers when receiving responses from hosts on the local network during TCP, UDP, and connect scans (not just ARP scans).

**Author:** Claude (AI Assistant)
**Date:** 2025-01-01
**Version:** 1.0
**Schema Impact:** v9 (extends v8 MAC<->IP history)

---

## 1. Problem Statement

Currently, unicornscan only captures MAC addresses when:
- Performing ARP scans (`-mA`) where MAC is extracted from the ARP payload

However, when scanning local network hosts with TCP/UDP/connect modes (`-mT`, `-mU`, `-msf`), the Ethernet source MAC **is captured by pcap** but **discarded** before parsing. This means:

1. Local network TCP/UDP scans do not record the responding host's MAC address
2. The MAC<->IP history tracking (v8 schema) is only populated from ARP scans
3. Users must run separate ARP scans to get MAC addresses for local hosts

## 2. Existing Infrastructure

The codebase already has the necessary components:

### 2.1 Local Network Detection
**Location:** `src/scan_progs/workunits.c:257-278`
```c
struct sockaddr *gw=NULL;
if (getroutes(&intf, &netid, &mask, &gw) == 1 && gw != NULL) {
    // gw != NULL → remote target (requires gateway)
}
// gw == NULL → local target (directly L2-reachable)
```

### 2.2 Ethernet Header Structure
**Location:** `src/scan_progs/packets.h:177-181`
```c
struct _PACKED_ my6etherheader {
  uint8_t  ether_dhost[6];   // Destination MAC (bytes 0-5)
  uint8_t  ether_shost[6];   // Source MAC (bytes 6-11) ← WE NEED THIS
  uint16_t ether_type;       // EtherType (bytes 12-13)
};
```

### 2.3 Where Ethernet Header is Discarded
**Location:** `src/scan_progs/packet_parse.c:294-295`
```c
pk_len -= s->ss->header_len;   // header_len = 14 for Ethernet
packet += s->ss->header_len;   // <-- Skips Ethernet header!
```

### 2.4 MAC<->IP History (v8 Schema)
Already implemented:
- `uni_mac_ip_history` table
- `fn_record_mac_ip()` function
- `v_hosts` includes `current_mac`

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Extract source MAC from Ethernet header for IP packet responses | Must |
| FR2 | Only extract MAC for L2-reachable (local network) targets | Must |
| FR3 | Store MAC with IP report in database | Must |
| FR4 | Call `fn_record_mac_ip()` for local IP responses with MAC | Must |
| FR5 | Display MAC in scan output when available | Should |
| FR6 | Integrate with `v_hosts.current_mac` view | Should |
| FR7 | Work for TCP, UDP, ICMP, and connect (`-msf`) modes | Must |
| FR8 | No change to ARP mode behavior | Must |

### 3.2 Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR1 | Minimal performance impact (MAC extraction is O(1)) |
| NFR2 | No change to IPC protocol structure (backward compatibility) |
| NFR3 | Only affects Ethernet link type (DLT_EN10MB) |

## 4. Technical Design

### 4.1 Modify `ip_report_t` Structure
**File:** `src/scan_progs/scan_export.h`

Add optional MAC field (6 bytes + 1 flag byte):
```c
typedef struct _PACKED_ ip_report_t {
    // ... existing fields ...
    uint16_t doff;

    /* v9: Ethernet source MAC for L2-local responses */
    uint8_t  eth_hwaddr[6];    /* Source MAC from Ethernet header */
    uint8_t  eth_hwaddr_valid; /* 1 if MAC is valid (local network), 0 otherwise */
} ip_report_t;
```

**Alternative:** Use a flag bit in existing `flags` field to indicate MAC validity.

### 4.2 Modify `packet_parse.c`
**Location:** `packet_parse()` function, before skipping Ethernet header

```c
void packet_parse(const struct pcap_pkthdr *phdr, const uint8_t *packet) {
    // ... existing code ...

    /* v9: Save Ethernet source MAC before skipping header */
    uint8_t saved_eth_shost[6] = {0};
    int eth_mac_available = 0;

    if (s->ss->header_len == 14) {  /* Ethernet */
        const struct my6etherheader *eth = (const struct my6etherheader *)packet;
        memcpy(saved_eth_shost, eth->ether_shost, 6);
        eth_mac_available = 1;
    }

    pk_len -= s->ss->header_len;
    packet += s->ss->header_len;

    // ... pass saved_eth_shost to decode_ip() ...
}
```

### 4.3 Modify `decode_ip()`
Pass saved MAC and check if target is L2-local:

```c
static void decode_ip(const uint8_t *packet, size_t pk_len, int pk_layer,
                      const uint8_t *eth_shost, int eth_mac_available) {
    // ... existing decode logic ...

    /* v9: Store MAC if local network response */
    if (eth_mac_available && is_local_target(r_u.i.host_addr)) {
        memcpy(r_u.i.eth_hwaddr, eth_shost, 6);
        r_u.i.eth_hwaddr_valid = 1;
    }
}
```

### 4.4 Add Local Target Check Function
**File:** `src/scan_progs/packet_parse.c` or `src/unilib/route.c`

```c
/* Check if target IP is on local network (L2-reachable) */
static int is_local_target(uint32_t target_addr) {
    struct sockaddr_in target, mask;
    struct sockaddr *gw = NULL;
    char *intf = NULL;

    target.sin_family = AF_INET;
    target.sin_addr.s_addr = target_addr;
    mask.sin_family = AF_INET;
    mask.sin_addr.s_addr = 0xFFFFFFFF;  /* /32 lookup */

    if (getroutes(&intf, (struct sockaddr *)&target,
                  (struct sockaddr *)&mask, &gw) == 1) {
        return (gw == NULL);  /* Local if no gateway required */
    }
    return 0;  /* Assume remote on error */
}
```

### 4.5 Modify Database Module
**File:** `src/output_modules/database/pgsqldb.c`

In `pgsql_dealwith_ipreport()`:
```c
/* v9: Record MAC<->IP if valid */
if (report->eth_hwaddr_valid) {
    char mac_str[32];
    snprintf(mac_str, sizeof(mac_str), "%02x:%02x:%02x:%02x:%02x:%02x",
        report->eth_hwaddr[0], report->eth_hwaddr[1], report->eth_hwaddr[2],
        report->eth_hwaddr[3], report->eth_hwaddr[4], report->eth_hwaddr[5]);

    pgsql_record_mac_ip(host_addr_str, mac_str, pgscanid);
}
```

### 4.6 Schema Changes (v9)
**File:** `sql/pgsql_schema.sql`

Add optional MAC column to `uni_ipreports`:
```sql
alter table "uni_ipreports" add column "eth_hwaddr" macaddr;
```

Update version:
```sql
-- v9: MAC capture from Ethernet header for L2-local IP responses
```

## 5. Task Breakdown

### Phase 1: Core Infrastructure (Priority: High)
1. [ ] Add `eth_hwaddr[6]` and `eth_hwaddr_valid` to `ip_report_t`
2. [ ] Modify `packet_parse()` to save Ethernet source MAC before skipping header
3. [ ] Add `is_local_target()` function using `getroutes()`
4. [ ] Modify `decode_ip()` to populate MAC for local targets
5. [ ] Update IPC if structure size changes

### Phase 2: Database Storage (Priority: High)
6. [ ] Add `eth_hwaddr` column to `uni_ipreports` table (v9 schema)
7. [ ] Modify `pgsql_dealwith_ipreport()` to store MAC
8. [ ] Call `pgsql_record_mac_ip()` for local IP responses with MAC
9. [ ] Add v9 migration DDL to `pgsql_schema_embedded.h`

### Phase 3: Output & Display (Priority: Medium)
10. [ ] Add `%M` format specifier to IP report format strings
11. [ ] Update `strreport()` to display MAC when available
12. [ ] Add MAC to XML/JSON output modules

### Phase 4: Frontend (Priority: Medium)
13. [ ] Update `IpReport` TypeScript type with `eth_hwaddr`
14. [ ] Display MAC in scan results table when available
15. [ ] Integrate with existing MAC<->IP history views

### Phase 5: Testing (Priority: High)
16. [ ] Unit test: `is_local_target()` with various network configurations
17. [ ] Integration test: Local network scan captures MAC
18. [ ] Integration test: Remote scan does NOT attempt MAC capture
19. [ ] Verify no impact to ARP scan behavior
20. [ ] Verify schema migration from v8 to v9

## 6. Link Type Considerations

### 6.1 Supported Link Types
This feature only applies when:
- Link type is Ethernet (`DLT_EN10MB`)
- `header_len == 14`

### 6.2 Unsupported Link Types
MAC extraction is NOT applicable for:
- Loopback (`DLT_NULL`, `DLT_LOOP`) - No Ethernet header
- Raw IP (`DLT_RAW`) - No Ethernet header
- PPP (`DLT_PPP`) - Different header format
- WiFi in monitor mode (`DLT_IEEE802_11_RADIO`) - Different header

For unsupported link types, `eth_hwaddr_valid` remains 0.

## 7. Performance Impact

| Operation | Cost | Frequency |
|-----------|------|-----------|
| Save 6-byte MAC | O(1) memcpy | Per packet |
| `is_local_target()` | O(log n) route lookup | Per packet |
| DB insert | O(1) | Per unique MAC<->IP pair |

**Mitigation:** Cache route lookup result per target IP during scan.

## 8. Backward Compatibility

| Component | Impact |
|-----------|--------|
| `ip_report_t` struct | Size increase (7 bytes) |
| IPC protocol | May require version check |
| Database | New column, NULL for old data |
| Output format | New `%M` specifier (optional) |

## 9. Future Considerations

- IPv6 support (link-local addresses, NDP)
- VLAN tag handling (802.1Q)
- MAC OUI vendor lookup
- MAC spoofing detection (multiple MACs per IP in same scan)

---

## Appendix A: Code Location Summary

| File | Purpose |
|------|---------|
| `src/scan_progs/scan_export.h:76-105` | `ip_report_t` structure |
| `src/scan_progs/packet_parse.c:294-295` | Ethernet header skip |
| `src/scan_progs/packets.h:177-181` | `my6etherheader` structure |
| `src/scan_progs/workunits.c:257-278` | Local network check example |
| `src/unilib/route.c:46-97` | `getroutes()` function |
| `src/output_modules/database/pgsqldb.c` | DB storage |
| `src/output_modules/database/sql/pgsql_schema.sql` | Schema |
