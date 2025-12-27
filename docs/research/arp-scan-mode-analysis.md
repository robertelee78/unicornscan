# ARP Scan Mode Analysis for Option A Implementation

**Date:** 2025-12-22
**Purpose:** Analyze existing ARP scan implementation to understand how to leverage it for Option A (ARP discovery before TCP/UDP scan)

## Executive Summary

Unicornscan's existing `-mA` (ARP scan mode) provides a complete, working implementation for ARP-based host discovery. The code already handles:
- ARP request packet construction
- Link-layer (Ethernet) transmission
- ARP reply capture and parsing
- Discovered MAC/IP storage in `arp_report_t` structures

**Key Finding:** We can leverage this existing infrastructure with minimal modifications to implement Option A's "ARP discovery → prune → scan" workflow.

---

## Complete ARP Scan Flow

### 1. Workunit Creation & Mode Selection

**File:** `src/scan_progs/send_packet.c`

**Lines 499-506:** When master process sends `ARP_SEND_MAGIC` workunit:
```c
else if (*wk_u.magic == ARP_SEND_MAGIC) {
    open_link(SOCK_LL, &s->ss->target, &s->ss->targetmask);

    DBG(M_WRK, "got arp workunit");
    s->ss->mode=MODE_ARPSCAN;
}
```

**Key Details:**
- Sets mode to `MODE_ARPSCAN` (value: 4)
- Opens **link layer socket** (`SOCK_LL`) via `eth_open()` instead of IP socket
- This is critical: ARP operates at Layer 2, not Layer 3

---

### 2. ARP Packet Construction

**File:** `src/scan_progs/send_packet.c`

**Lines 837-908:** `_send_packet()` function builds ARP requests:

#### 2.1 Ethernet Header (Lines 838-847)
```c
else if (s->ss->mode == MODE_ARPSCAN) {
    uint8_t ethbk[6]={ 0xff, 0xff, 0xff, 0xff, 0xff, 0xff };

    /****************************************************************
     *          BUILD ETH HEADER                                    *
     ****************************************************************/
    makepkt_build_ethernet(6,
                           (const uint8_t *)&ethbk[0],    // dst: broadcast MAC
                           (const uint8_t *)sl.esrc,       // src: our MAC
                           ETHERTYPE_ARP
    );
}
```
- **Destination MAC:** Broadcast (`ff:ff:ff:ff:ff:ff`)
- **Source MAC:** Interface's hardware address from workunit (`sl.esrc`)
- **EtherType:** `0x0806` (ARP)

#### 2.2 ARP Header (Lines 887-908)
```c
else if (s->ss->mode == MODE_ARPSCAN) {
    uint8_t arpbk[6]={ 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };

    if (ipv4 == 1) {
        makepkt_build_arp(ARPHRD_ETHER,                    // hw type: Ethernet
                          ETHERTYPE_IP,                     // proto: IPv4
                          6,                                 // hw addr len: 6
                          4,                                 // proto addr len: 4
                          ARPOP_REQUEST,                     // opcode: request
                          (const uint8_t *)sl.esrc,          // sender MAC
                          (const uint8_t *)&myaddr_u.sin->sin_addr.s_addr,  // sender IP
                          (const uint8_t *)&arpbk[0],        // target MAC (zeros)
                          (const uint8_t *)&target_u.sin->sin_addr.s_addr   // target IP
        );
    }
}
```

**ARP Request Fields:**
- **Sender MAC:** Our interface MAC
- **Sender IP:** Randomized from `myaddr` range (line 753-757)
- **Target MAC:** `00:00:00:00:00:00` (unknown, we're asking)
- **Target IP:** Current host from scan range (`sl.curhost`)

**File:** `src/scan_progs/makepkt.c` **Lines 221-249:** `makepkt_build_arp()` implementation
```c
int makepkt_build_arp(uint16_t hwfmt, uint16_t protfmt,
                      uint8_t hwlen, uint8_t protlen,
                      uint16_t opcode,
                      const uint8_t *s_hwaddr, const uint8_t *s_protoaddr,
                      const uint8_t *t_hwaddr, const uint8_t *t_protoaddr) {
    struct myarphdr ma;

    ma.hw_type=htons(hwfmt);
    ma.protocol=htons(protfmt);
    ma.hwsize=hwlen;
    ma.protosize=protlen;
    ma.opcode=htons(opcode);

    memcpy(&pkt_buf[pkt_len], &ma, sizeof(ma));
    pkt_len += sizeof(ma);
    memcpy(&pkt_buf[pkt_len], s_hwaddr, hwlen); pkt_len += hwlen;     // sender MAC
    memcpy(&pkt_buf[pkt_len], s_protoaddr, protlen); pkt_len += protlen; // sender IP
    memcpy(&pkt_buf[pkt_len], t_hwaddr, hwlen); pkt_len += hwlen;     // target MAC
    memcpy(&pkt_buf[pkt_len], t_protoaddr, protlen); pkt_len += protlen; // target IP

    return 1;
}
```

#### 2.3 Link-Layer Transmission (Lines 946-964)
```c
else if (sl.sockmode == SOCK_LL) {
    size_t buf_size;
    const uint8_t *pbuf=NULL;

    makepkt_getbuf(&buf_size, &pbuf);

    if (pbuf != NULL && buf_size) {
        ssize_t ets=0;

        ets=eth_send(sl.s_u.llsock, pbuf, buf_size);  // libdnet eth_send()

        if (ets < 0 || (size_t)ets != buf_size) {
            terminate("ethernet send fails somehow");
        }
    }
    else {
        terminate("ethernet buffer NULL");
    }
}
```
- Uses **libdnet's `eth_send()`** to bypass kernel IP stack
- Sends raw Ethernet frames directly to wire
- Socket opened via `eth_open(s->interface_str)` at line 1184

---

### 3. ARP Reply Capture

**File:** `src/scan_progs/recv_packet.c`

#### 3.1 pcap Filter Setup (Lines 554-556)
```c
case MODE_ARPSCAN:
    snprintf(base_filter, sizeof(base_filter) -1, "%s", ARP_PFILTER);
    break;
```
Where `ARP_PFILTER` is defined (line 58):
```c
#define ARP_PFILTER "arp"
```
- Simple pcap BPF filter: captures only ARP packets
- No address filtering needed (we check sender MAC manually)

#### 3.2 Packet Dispatch (Lines 298-303)
```c
switch (s->ss->mode) {
    case MODE_ARPSCAN:
        report_init(REPORT_TYPE_ARP, &phdr->ts);
        packet_init(packet, pk_len);
        decode_arp(packet, pk_len, pk_layer);  // Parse ARP reply
        break;
```

---

### 4. ARP Reply Parsing

**File:** `src/scan_progs/packet_parse.c` **Lines 319-381:** `decode_arp()` function

#### 4.1 Validation (Lines 329-348)
```c
static void decode_arp (const uint8_t *packet, size_t pk_len, int pk_layer) {
    union {
        const struct myetherarphdr *a;
        const uint8_t *d;
    } a_u;
    uint16_t hwtype=0, opcode=0;

    a_u.d=packet;
    r_u.a.flags=0;

    if (pk_len < sizeof(struct myetherarphdr)) {
        ERR("short arp packet");
        return;
    }

    hwtype=ntohs(a_u.a->hw_type);
    opcode=ntohs(a_u.a->opcode);

    if (a_u.a->protosize != 4 || a_u.a->hwsize != 6) {
        DBG(M_PKT, "arp packet isnt 6:4, giving up");
        return;
    }

    if (opcode != ARPOP_REPLY) {  // Only process replies
        return;
    }

    if (memcmp(s->vi[0]->hwaddr, a_u.a->smac, 6) == 0) {
        return; /* we sent this - ignore our own packets */
    }
```

**Checks:**
1. Packet size >= ARP header size
2. Hardware address length = 6 (MAC)
3. Protocol address length = 4 (IPv4)
4. Opcode = `ARPOP_REPLY` (2) - **only replies**, ignore requests
5. Sender MAC != our MAC (ignore our own broadcasts)

#### 4.2 Data Extraction (Lines 366-371)
```c
    pk_len -= sizeof(struct myetherarphdr);

    memcpy(r_u.a.hwaddr, a_u.a->smac, THE_ONLY_SUPPORTED_HWADDR_LEN);  // Store MAC
    memcpy(&r_u.a.ipaddr, &a_u.a->sip, sizeof(r_u.a.ipaddr));          // Store IP

    report_push();  // Queue report for master process
```

**Stored Data:**
- `r_u.a.hwaddr`: 6-byte MAC address from sender
- `r_u.a.ipaddr`: 4-byte IP address from sender
- Both pushed to report queue for IPC transmission

---

### 5. Report Structure

**File:** `src/scan_progs/scan_export.h` **Lines 107-115:**
```c
typedef struct _PACKED_ arp_report_t {
    uint32_t magic;          // 0xd9d82aca (ARP_REPORT_MAGIC)
    uint8_t hwaddr[6];       // Discovered MAC address
    uint32_t ipaddr;         // IP address (network byte order)
    struct timeval recv_time; // When reply was captured
    void *od_q;              // Output data queue (for modules)
    uint16_t flags;          // Status flags
    uint16_t doff;           // Attached packet data offset (if any)
} arp_report_t;
```

**Key Fields for Option A:**
- `ipaddr`: The live host IP
- `hwaddr`: Its MAC address (for Layer 2 reachability verification)
- `recv_time`: Timestamp (can calculate RTT if needed)

---

### 6. Report Transmission to Master

**File:** `src/scan_progs/recv_packet.c` **Lines 619-625:** Report size determination
```c
while ((r_u.ptr=fifo_pop(r_queue)) != NULL) {
    if (*r_u.r_magic == IP_REPORT_MAGIC) {
        r_size=sizeof(ip_report_t);
    }
    else if (*r_u.r_magic == ARP_REPORT_MAGIC) {
        r_size=sizeof(arp_report_t);  // Size for IPC transfer
    }
    else {
        PANIC("report size/type unknown [%08x magic]", *r_u.r_magic);
    }
```

**Lines 666-670:** Send to master via IPC
```c
else {
    if (send_message(lc_s, MSG_OUTPUT, MSG_STATUS_OK, r_u.cr, r_size) < 0) {
        terminate("cant send message output");
    }
}
```

---

### 7. Master Process Handling

**File:** `src/scan_progs/master.c` **Lines 492-507:**
```c
else if (*r_u.magic == ARP_REPORT_MAGIC) {
    if (r_u.a->doff > s->vi[0]->mtu) {
        ERR("impossible packet length %u with mtu %u", r_u.a->doff, s->vi[0]->mtu);
        return -1;
    }

    if (msg_len < sizeof(arp_report_t) + r_u.a->doff) {
        ERR("ARP report claims impossible length");
        return -1;
    }

    DBG(M_RPT, "ARP report has a %u byte packet attached to it", r_u.a->doff);

    r_u.a->od_q=fifo_init();

    push_jit_report_modules(r_u.ptr);  // Send to output modules
}
```

**Processing:**
1. Validates packet length
2. Initializes output data queue (`od_q`)
3. **Pushes to report modules** for storage/display

---

### 8. Report Processing & Storage

**File:** `src/scan_progs/report.c`

#### 8.1 Deduplication (Lines 323-347)
```c
else if (*o_u.magic == ARP_REPORT_MAGIC) {
    rkey=get_arpreport_key(o_u.a->ipaddr, o_u.a->hwaddr);

    if (rbfind(report_t, rkey, &dummy) != 1) {
        /* NEW discovery - not seen before */
        arp_report_t *new_ar=NULL;

        new_ar=(arp_report_t *)xmalloc(sizeof(arp_report_t));
        memcpy(new_ar, o_u.a, sizeof(arp_report_t));
        new_ar->od_q=NULL;

        rbinsert(report_t, rkey, (void *)new_ar);  // Add to red-black tree

        DBG(M_CLD, "adding new arp report (total of %u now)", report_t->size);
        add_report(o_u.ptr);  // Add to report output queue
    }
    else {
        DBG(M_CLD, "duplicate arp report");
    }

    xfree(o_u.ptr);  // Free original report
}
```

**Key Insight:** Red-black tree (`report_t`) stores **unique** IP+MAC combinations
- **For Option A:** This is our "discovered live hosts" data structure!

#### 8.2 Report Key Generation (Lines not shown, but referenced)
```c
// Combines IP + MAC into unique key
uint64_t get_arpreport_key(uint32_t ipaddr, const uint8_t *hwaddr);
```

#### 8.3 Output Formatting (Lines 372-374, 687-690)
```c
else if (*r_u.magic == ARP_REPORT_MAGIC) {
    fmt=s->arp_report_fmt;  // User-specified format string
}

...

case 'M': /* link address */
    if (*r_u.magic == ARP_REPORT_MAGIC) {
        char hwstr[64];

        snprintf(hwstr, sizeof(hwstr) -1, "%02x:%02x:%02x:%02x:%02x:%02x",
                 r_u.a->hwaddr[0], r_u.a->hwaddr[1], r_u.a->hwaddr[2],
                 r_u.a->hwaddr[3], r_u.a->hwaddr[4], r_u.a->hwaddr[5]);
        REPSTR(hwstr);
    }
    break;
```

**Output Variables:**
- `%I`: IP address
- `%M`: MAC address (formatted)
- `%o`: OUI vendor name
- `%T`: Timestamp

---

## Current ARP Scan Workflow (Existing `-mA`)

```
┌─────────────────────────────────────────────────────────────┐
│ Master Process                                              │
│                                                              │
│  1. Create ARP_SEND_MAGIC workunit                          │
│     - target: 192.168.1.0/24                                │
│     - targetmask: 255.255.255.0                             │
│     - hwaddr: aa:bb:cc:dd:ee:ff                             │
│     ↓                                                        │
└──────────────┬──────────────────────────────────────────────┘
               │ IPC: MSG_WORKUNIT
               ↓
┌─────────────────────────────────────────────────────────────┐
│ Sender Child Process                                        │
│                                                              │
│  2. open_link(SOCK_LL) → eth_open("eth0")                   │
│     - Opens raw Ethernet socket                             │
│                                                              │
│  3. Loop: for each IP in 192.168.1.0/24                     │
│     a) Build Ethernet frame:                                │
│        - Dst: ff:ff:ff:ff:ff:ff (broadcast)                 │
│        - Src: aa:bb:cc:dd:ee:ff (our MAC)                   │
│        - Type: 0x0806 (ARP)                                 │
│                                                              │
│     b) Build ARP request:                                   │
│        - Opcode: 1 (request)                                │
│        - Sender MAC: aa:bb:cc:dd:ee:ff                      │
│        - Sender IP: <random from myaddr range>              │
│        - Target MAC: 00:00:00:00:00:00                      │
│        - Target IP: 192.168.1.X                             │
│                                                              │
│     c) eth_send() → raw frame to wire                       │
│        - Rate-limited by PPS setting                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Listener Child Process                                      │
│                                                              │
│  4. pcap_open_live("eth0")                                  │
│     - BPF filter: "arp"                                     │
│                                                              │
│  5. For each ARP reply received:                            │
│     a) decode_arp():                                        │
│        - Validate: opcode == ARPOP_REPLY                    │
│        - Ignore: sender MAC == our MAC                      │
│        - Extract:                                           │
│          * IP: reply.sender_ip                              │
│          * MAC: reply.sender_mac                            │
│                                                              │
│     b) Create arp_report_t:                                 │
│        - magic: ARP_REPORT_MAGIC                            │
│        - ipaddr: discovered IP                              │
│        - hwaddr: discovered MAC                             │
│        - recv_time: pcap timestamp                          │
│                                                              │
│     c) fifo_push(r_queue, report)                           │
│        ↓                                                     │
└──────────────┬──────────────────────────────────────────────┘
               │ IPC: MSG_OUTPUT
               ↓
┌─────────────────────────────────────────────────────────────┐
│ Master Process                                              │
│                                                              │
│  6. deal_with_output():                                     │
│     - Receive arp_report_t via IPC                          │
│                                                              │
│  7. push_jit_report_modules():                              │
│     a) rbfind(report_t, ip+mac_key)                         │
│        - Check if already seen                              │
│                                                              │
│     b) If new:                                              │
│        - rbinsert(report_t, key, report)                    │
│        - add_report() → output queue                        │
│                                                              │
│  8. Report output:                                          │
│     - Format: %I (IP) %M (MAC) %o (vendor)                  │
│     - Display: "192.168.1.50 12:34:56:78:9a:bc [Vendor]"    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Structures for Host Discovery

### Red-Black Tree Storage

**File:** `src/scan_progs/report.c`

The `report_t` red-black tree stores **all discovered hosts**:

```c
static rbtree *report_t=NULL;  // Global RB-tree for reports

// Initialization
report_t=rbinit(&compare_reports);

// Lookup
if (rbfind(report_t, rkey, &dummy) != 1) {
    // New host discovered
}

// Insert
rbinsert(report_t, rkey, (void *)new_ar);

// Iteration (for retrieving all live hosts)
rbwalk(report_t, walk_callback, data);
```

**Access Pattern:**
- **Key:** Combined IP+MAC hash
- **Value:** Pointer to `arp_report_t` structure
- **Complexity:** O(log n) insert/lookup
- **Deduplication:** Automatic via key uniqueness

---

## Option A Implementation Strategy

### Proposed Workflow

```
Phase 1: ARP Discovery Scan
┌────────────────────────────────────────────────┐
│ unicornscan -mA 192.168.1.0/24                 │
│   ↓                                             │
│ [Existing ARP scan code - NO CHANGES NEEDED]   │
│   ↓                                             │
│ report_t RB-tree populated with:               │
│   - 192.168.1.5  → aa:bb:cc:dd:ee:f1           │
│   - 192.168.1.20 → aa:bb:cc:dd:ee:f2           │
│   - 192.168.1.87 → aa:bb:cc:dd:ee:f3           │
│   [50 live hosts discovered]                   │
└────────────────────────────────────────────────┘
                    ↓
Phase 2: Prune Target List
┌────────────────────────────────────────────────┐
│ NEW FUNCTION: prune_targets_by_arp()           │
│                                                 │
│ Input:  target_range (192.168.1.0/24)          │
│         report_t (discovered hosts)            │
│                                                 │
│ Output: pruned_target_list                     │
│         [192.168.1.5, .20, .87, ...]           │
│                                                 │
│ Pseudo-code:                                   │
│   foreach ip in target_range:                  │
│     key = get_arpreport_key(ip, NULL)          │
│     if rbfind(report_t, key):                  │
│       add_to_pruned_list(ip)                   │
└────────────────────────────────────────────────┘
                    ↓
Phase 3: TCP/UDP Scan (Modified Target Range)
┌────────────────────────────────────────────────┐
│ unicornscan -mT -p1-65535 <pruned_list>        │
│   ↓                                             │
│ [Existing TCP scan code]                       │
│   BUT: Only scan 50 hosts instead of 254!      │
│                                                 │
│ Results: Port scan data for live hosts only    │
└────────────────────────────────────────────────┘
```

### Required Code Changes

#### 1. Add ARP-Based Target Pruning Function

**New File:** `src/scan_progs/arp_prune.c`

```c
#include <scan_progs/report.h>
#include <scan_progs/scan_export.h>

/**
 * prune_targets_by_arp - Filter target list to only ARP-responsive hosts
 *
 * @param target: Original target network (e.g., 192.168.1.0/24)
 * @param targetmask: Network mask
 * @param arp_reports: RB-tree from ARP scan (report_t)
 * @param pruned_list: Output buffer for live IPs
 *
 * Returns: Number of live hosts
 */
int prune_targets_by_arp(
    struct sockaddr_storage *target,
    struct sockaddr_storage *targetmask,
    rbtree *arp_reports,
    uint32_t **pruned_list
) {
    uint32_t num_live = 0;
    struct sockaddr_storage current_ip;

    // Allocate worst-case array (full /24 = 254 hosts)
    *pruned_list = xmalloc(256 * sizeof(uint32_t));

    // Initialize to first IP in range
    cidr_init_range(&current_ip, target, targetmask);

    // Walk through target range
    while (cidr_within(&current_ip, target, targetmask)) {
        union sock_u su;
        su.ss = &current_ip;

        // Generate lookup key (IP-only, MAC doesn't matter)
        uint64_t key = get_arpreport_key(su.sin->sin_addr.s_addr, NULL);

        void *found = NULL;
        if (rbfind(arp_reports, key, &found) == 1) {
            // This IP responded to ARP - add to pruned list
            (*pruned_list)[num_live++] = su.sin->sin_addr.s_addr;
        }

        cidr_inchost(&current_ip);
    }

    VRB(0, "ARP scan found %u live hosts (pruned from %u total IPs)",
        num_live, cidr_count_hosts(target, targetmask));

    return num_live;
}
```

#### 2. Modify Workunit Creation

**File:** `src/scan_progs/workunits.c` (modifications)

Add option to create workunits from pruned list instead of CIDR range:

```c
/**
 * workunit_add_from_list - Create workunit with explicit IP list
 *
 * Used after ARP pruning to only scan discovered hosts
 */
int workunit_add_from_list(
    const char *port_str,
    uint32_t *ip_list,
    uint32_t num_ips,
    int scan_mode  // MODE_TCPSCAN or MODE_UDPSCAN
) {
    send_workunit_t *swu;

    // ... (similar to existing workunit_add, but:)
    //  - Store ip_list instead of CIDR range
    //  - Set target/targetmask to cover list bounds
    //  - Add flag: WORKUNIT_FROM_IPLIST

    return 1;
}
```

#### 3. Modify Sender Loop Logic

**File:** `src/scan_progs/send_packet.c` (modifications)

Currently, `init_nexthost()` walks CIDR ranges. Add alternate mode:

```c
static void init_nexthost_from_list(void) {
    if (s->ss->send_opts & WORKUNIT_FROM_IPLIST) {
        sl.list_index = 0;  // Start at first IP in list
    }
    else {
        init_nexthost();  // Existing CIDR walk
    }
}

static int cmp_nexthost_from_list(void) {
    if (s->ss->send_opts & WORKUNIT_FROM_IPLIST) {
        return (sl.list_index < s->ss->ip_list_count);
    }
    else {
        return cmp_nexthost();  // Existing CIDR check
    }
}

static void inc_nexthost_from_list(void) {
    if (s->ss->send_opts & WORKUNIT_FROM_IPLIST) {
        union sock_u su;
        su.ss = &sl.curhost;

        sl.list_index++;
        if (sl.list_index < s->ss->ip_list_count) {
            su.sin->sin_addr.s_addr = s->ss->ip_list[sl.list_index];
        }
    }
    else {
        inc_nexthost();  // Existing CIDR increment
    }
}
```

#### 4. CLI Integration

**File:** `src/unilib/options.c` (modifications)

Add new option: `-A` (ARP-first mode)

```c
case 'A':
    // Enable ARP discovery before main scan
    SET_ARPFIRST();
    break;
```

**File:** `src/scan_progs/master.c` (modifications)

Modify `run_scan()`:

```c
void run_scan(void) {
    // ... existing initialization ...

    if (GET_ARPFIRST()) {
        VRB(0, "Phase 1: ARP discovery scan");

        // 1. Run ARP scan to populate report_t
        s->ss->mode = MODE_ARPSCAN;
        run_scan_phase();  // Execute ARP workunit

        VRB(0, "Phase 2: Pruning targets based on ARP responses");

        // 2. Prune target list
        uint32_t *live_hosts = NULL;
        int num_live = prune_targets_by_arp(
            &s->ss->target,
            &s->ss->targetmask,
            report_t,  // Global RB-tree with ARP discoveries
            &live_hosts
        );

        if (num_live == 0) {
            ERR("No live hosts found via ARP - aborting scan");
            return;
        }

        VRB(0, "Phase 3: Port scanning %d live hosts", num_live);

        // 3. Create workunit with pruned list
        s->ss->mode = MODE_TCPSCAN;  // Or MODE_UDPSCAN
        workunit_add_from_list(s->ss->port_str, live_hosts, num_live, s->ss->mode);

        // 4. Run TCP/UDP scan
        run_scan_phase();

        xfree(live_hosts);
    }
    else {
        // Original workflow - no ARP pruning
        run_scan_phase();
    }

    // ... existing cleanup ...
}
```

---

## Key Implementation Questions

### Q1: How to preserve ARP results between scan phases?

**Answer:** The `report_t` red-black tree is already global and persistent across the master process lifetime.

**Current Code:**
```c
// src/scan_progs/report.c
static rbtree *report_t=NULL;  // Global - survives across scan phases

void report_init(void) {
    report_t=rbinit(&compare_reports);  // Only called once at startup
}
```

**Strategy:**
1. Phase 1 (ARP scan) populates `report_t` with `arp_report_t` entries
2. Phase 2 (prune) reads from `report_t` to build live host list
3. Phase 3 (TCP/UDP scan) can optionally keep ARP data for correlation

**No changes needed** - existing architecture supports this!

---

### Q2: Can we run ARP and TCP/UDP in single invocation?

**Answer:** Yes, but requires master process state machine modification.

**Current State Machine:**
```c
// src/scan_progs/master.c
#define MASTER_START                    0
#define MASTER_SENT_LISTEN_WORKUNITS    1
#define MASTER_SENT_SENDER_WORKUNITS    2
#define MASTER_WAIT_SENDER              3
#define MASTER_IN_TIMEOUT               4
#define MASTER_DONE                     5
```

**Proposed Multi-Phase Extension:**
```c
#define MASTER_START                    0
#define MASTER_SENT_LISTEN_WORKUNITS    1
#define MASTER_SENT_SENDER_WORKUNITS    2
#define MASTER_WAIT_SENDER              3
#define MASTER_IN_TIMEOUT               4
#define MASTER_ARP_COMPLETE             5  // NEW: ARP phase done
#define MASTER_PRUNING_TARGETS          6  // NEW: Building live host list
#define MASTER_PHASE2_START             7  // NEW: Starting TCP/UDP scan
#define MASTER_DONE                     8  // Renumbered
```

**Transition Logic:**
```c
// After ARP scan completes (in MASTER_IN_TIMEOUT)
if (GET_ARPFIRST() && s->ss->mode == MODE_ARPSCAN) {
    master_updatestate(MASTER_ARP_COMPLETE);

    // Prune targets
    int num_live = prune_targets_by_arp(...);
    master_updatestate(MASTER_PRUNING_TARGETS);

    // Create new workunits for TCP/UDP with pruned list
    s->ss->mode = MODE_TCPSCAN;
    workunit_add_from_list(...);
    master_updatestate(MASTER_PHASE2_START);

    // Reset sender/listener state counters
    send_workunits_complete = 0;
    listen_workunits_complete = 0;

    // Continue scan loop - will dispatch TCP/UDP workunits
    continue;
}
```

---

### Q3: Performance impact of RB-tree lookups?

**Answer:** Minimal - O(log n) lookups are fast for typical network sizes.

**Complexity Analysis:**
- `/24` network: 254 hosts → max 8 comparisons per lookup
- `/16` network: 65,534 hosts → max 16 comparisons per lookup
- RB-tree rebalancing: O(log n) on insert (only during ARP phase)

**Benchmark Estimate:**
- Modern CPU: ~1 billion comparisons/second
- 65k host lookup: 16 comparisons = 16ns
- **Pruning overhead:** negligible compared to packet I/O

**Alternative (if needed):** Hash table for O(1) lookups
```c
#include <unilib/chtbl.h>  // Existing hash table implementation

chtbl *arp_cache;
chtbl_init(&arp_cache, 65536, hash_ipaddr, compare_ipaddr);
chtbl_insert(arp_cache, &ip, &arp_report);
```

---

### Q4: How to handle ARP cache expiry?

**Answer:** Not needed for single-run discovery, but optional for long scans.

**Current Behavior:**
- `report_t` stores ALL discoveries until process exit
- No TTL or aging mechanism
- **Assumption:** Hosts remain live for scan duration

**If needed** (e.g., for daemon mode or very long scans):

```c
// Add timestamp to arp_report_t
typedef struct _PACKED_ arp_report_t {
    // ... existing fields ...
    time_t discovered_at;  // NEW: When ARP reply received
    time_t last_seen;      // NEW: Most recent confirmation
} arp_report_t;

// Aging function
void age_arp_reports(rbtree *reports, time_t max_age) {
    time_t now = time(NULL);

    // Walk tree, remove stale entries
    rbwalk(reports, check_age_callback, &now);
}

int check_age_callback(void *key, void *value, void *now_ptr) {
    arp_report_t *ar = (arp_report_t *)value;
    time_t now = *(time_t *)now_ptr;

    if ((now - ar->last_seen) > ARP_CACHE_TTL) {
        rbdelete(report_t, key);  // Remove stale entry
    }
    return 0;
}
```

**Recommendation:** Skip for Phase 1 implementation - add only if real-world testing shows need.

---

### Q5: What about non-Ethernet networks (WiFi, VPN, etc.)?

**Answer:** Current code already handles this via libdnet abstraction.

**Evidence from code:**

**File:** `src/scan_progs/send_packet.c` **Lines 1182-1188:**
```c
case SOCK_LL:
    if (sl.s_u.llsock == NULL) {
        sl.s_u.llsock=eth_open(s->interface_str);  // libdnet handles interface type
        if (sl.s_u.llsock == NULL) {
            terminate("dnet eth_open `%s' fails", s->interface_str);
        }
    }
    break;
```

**libdnet `eth_open()` behavior:**
- **Ethernet:** Direct BPF/PF_PACKET access
- **WiFi:** May use monitor mode or cooked sockets
- **VPN/Tunnel:** Typically fails (no ARP support) - fall back to ICMP

**Handling:**
```c
// Pre-flight check in master process
if (GET_ARPFIRST()) {
    // Test if interface supports ARP
    eth_t *test = eth_open(s->interface_str);
    if (test == NULL) {
        ERR("Interface %s doesn't support ARP - falling back to ICMP ping sweep",
            s->interface_str);
        SET_ICMPFIRST();  // Use ICMP echo instead
        UNSET_ARPFIRST();
    }
    else {
        eth_close(test);
    }
}
```

---

## Minimal Viable Implementation (Quick Win)

For **immediate testing** with minimal code changes:

### Approach: Two-Stage CLI Invocation

```bash
#!/bin/bash
# arp-then-scan.sh - Proof of concept using existing CLI

# Stage 1: ARP discovery, save live IPs to file
unicornscan -mA 192.168.1.0/24 | \
    awk '{print $1}' | \
    grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' \
    > /tmp/live_hosts.txt

# Stage 2: Port scan only live hosts
cat /tmp/live_hosts.txt | while read ip; do
    unicornscan -mT -p1-65535 "$ip"
done
```

**Advantages:**
- Zero code changes
- Validates pruning benefit immediately
- Can measure performance gain

**Disadvantages:**
- Slower (process overhead per IP)
- Loses parallelism benefits
- No correlation between ARP and TCP data

**Next Step:** If this shows significant speedup, justify full integration.

---

## Testing Strategy

### Unit Tests

**File:** `tests/test_arp_prune.c`

```c
#include <check.h>
#include <scan_progs/arp_prune.h>

START_TEST(test_prune_all_live) {
    // Simulate ARP scan finding all 10 hosts
    rbtree *arp_cache = rbinit(&compare_reports);

    // Add 10.0.0.1 - 10.0.0.10
    for (int i = 1; i <= 10; i++) {
        arp_report_t *ar = xmalloc(sizeof(arp_report_t));
        ar->ipaddr = htonl((10 << 24) | i);
        ar->hwaddr = {0xaa, 0xbb, 0xcc, 0xdd, 0xee, i};

        uint64_t key = get_arpreport_key(ar->ipaddr, ar->hwaddr);
        rbinsert(arp_cache, key, ar);
    }

    // Prune against 10.0.0.0/24
    struct sockaddr_in target, mask;
    target.sin_addr.s_addr = htonl(10 << 24);
    mask.sin_addr.s_addr = htonl(0xffffff00);

    uint32_t *pruned = NULL;
    int count = prune_targets_by_arp(
        (struct sockaddr_storage *)&target,
        (struct sockaddr_storage *)&mask,
        arp_cache,
        &pruned
    );

    ck_assert_int_eq(count, 10);  // All 10 found
    // ... verify IPs in pruned list ...
}
END_TEST
```

### Integration Tests

**Test Case 1:** ARP-first vs. Full Scan Timing
```bash
# Baseline: Scan all 254 IPs in /24
time unicornscan -mT -p1-1000 192.168.1.0/24

# ARP-first: Only scan live hosts
time {
    unicornscan -mA 192.168.1.0/24 > /tmp/arp.txt
    # Extract IPs, scan them
    # ... (see script above)
}

# Compare total runtime
```

**Test Case 2:** Verify No False Negatives
```bash
# Ensure ARP-first doesn't miss hosts that respond to TCP but not ARP
# (Some firewalls drop ARP, but allow TCP)

# Find hosts via ARP
unicornscan -mA 192.168.1.0/24 | awk '{print $1}' | sort > arp_hosts.txt

# Find hosts via TCP SYN (slow)
unicornscan -mT -p80 192.168.1.0/24 | awk '{print $1}' | sort | uniq > tcp_hosts.txt

# Compare
comm -13 arp_hosts.txt tcp_hosts.txt  # Hosts that respond to TCP but not ARP
```

**Expected:** Some devices (printers, IoT) may not respond to ARP from non-gateway IPs.

---

## Limitations & Edge Cases

### 1. ARP Filtering/Spoofing Protection

**Issue:** Some networks drop ARP requests from unauthorized MAC addresses.

**Symptoms:**
- No ARP replies received
- `report_t` remains empty
- Fallback needed

**Solution:**
```c
if (GET_ARPFIRST()) {
    run_arp_scan();

    if (report_t->size == 0) {
        ERR("No ARP responses received - network may filter ARP");
        ERR("Falling back to full TCP/UDP scan");
        SET_IGNOREFIRSTPHASE();
    }
}
```

### 2. Non-Local Networks (Routing Required)

**Issue:** ARP only works on local Layer 2 segment.

**Example:**
```bash
# This WON'T work - requires routing, not ARP
unicornscan -A -mT -p80 8.8.8.0/24
```

**Solution:** Pre-flight validation
```c
if (GET_ARPFIRST()) {
    // Check if target is on local network
    if (!is_local_network(&s->ss->target, &s->vi[0]->myaddr, &s->vi[0]->mymask)) {
        ERR("ARP discovery requires targets on local network");
        ERR("Use ICMP ping sweep for routed networks");
        return -1;
    }
}

int is_local_network(struct sockaddr_storage *target,
                     struct sockaddr_storage *myaddr,
                     struct sockaddr_storage *mymask) {
    union sock_u t_u, my_u, mask_u;
    t_u.ss = target; my_u.ss = myaddr; mask_u.ss = mymask;

    // Check if target network overlaps with our interface network
    uint32_t my_net = my_u.sin->sin_addr.s_addr & mask_u.sin->sin_addr.s_addr;
    uint32_t t_net = t_u.sin->sin_addr.s_addr & mask_u.sin->sin_addr.s_addr;

    return (my_net == t_net);
}
```

### 3. IPv6 (Not Currently Supported)

**Current Code:**
```c
// src/scan_progs/makepkt.c:906
else {
    PANIC("nyi");  // Not Yet Implemented for IPv6
}
```

**IPv6 Uses NDP (Neighbor Discovery Protocol), not ARP:**
- Different packet format (ICMPv6, not ARP)
- Multicast instead of broadcast
- Requires separate implementation

**Recommendation:** Phase 2 feature - focus on IPv4 first.

---

## Performance Expectations

### Scenario: /24 Network (254 Hosts), 20% Live (50 Hosts)

#### Without ARP-First (Current Behavior)
```
Scan: 192.168.1.0/24, ports 1-1000

Packets sent: 254 hosts × 1000 ports = 254,000 TCP SYNs
Time (1000 PPS): 254,000 / 1000 = 254 seconds ≈ 4.2 minutes
```

#### With ARP-First (Option A)
```
Phase 1: ARP discovery
  Packets sent: 254 ARP requests
  Time (1000 PPS): 254 / 1000 = 0.25 seconds
  Replies: 50 hosts

Phase 2: Pruned port scan
  Packets sent: 50 hosts × 1000 ports = 50,000 TCP SYNs
  Time (1000 PPS): 50,000 / 1000 = 50 seconds

Total time: 0.25 + 50 = 50.25 seconds ≈ 0.84 minutes
```

**Speedup:** 4.2 / 0.84 = **5x faster**

---

## Conclusion & Recommendations

### Summary

Unicornscan's existing `-mA` ARP scan mode provides **all necessary infrastructure** for Option A:

1. ✅ **ARP packet construction** - `makepkt_build_arp()` works perfectly
2. ✅ **Link-layer transmission** - `eth_send()` via libdnet
3. ✅ **Reply capture & parsing** - `decode_arp()` extracts IP+MAC
4. ✅ **Deduplication storage** - `report_t` RB-tree tracks discoveries
5. ✅ **IPC to master** - `arp_report_t` structures transmitted
6. ✅ **Output formatting** - Report system displays results

### Required Changes (Minimal)

1. **Add `prune_targets_by_arp()` function** (~100 lines)
   - Walk `report_t` RB-tree
   - Build array of live IPs

2. **Add `workunit_add_from_list()` function** (~150 lines)
   - Create workunits from explicit IP list (not CIDR)

3. **Modify sender loop logic** (~80 lines)
   - `init_nexthost_from_list()`
   - `cmp_nexthost_from_list()`
   - `inc_nexthost_from_list()`

4. **Extend master state machine** (~200 lines)
   - Add ARP→TCP/UDP phase transition
   - Reset workunit counters between phases

5. **Add CLI option `-A`** (~20 lines)
   - Set `ARPFIRST` flag

6. **Add validation checks** (~50 lines)
   - Verify local network
   - Check interface supports ARP
   - Fallback handling

**Total LOC:** ~600 lines (conservative estimate)

### Recommended Approach

**Phase 1: Proof of Concept (1-2 days)**
- Implement shell script version (see "Minimal Viable Implementation")
- Benchmark against full scan
- Validate no false negatives

**Phase 2: Core Integration (3-5 days)**
- Implement `arp_prune.c` with RB-tree walker
- Add workunit list mode
- Test with single-invocation workflow

**Phase 3: Polish & Edge Cases (2-3 days)**
- Add validation (local network check)
- Error handling (no ARP replies)
- IPv6 stub (return error, not panic)
- Documentation

**Phase 4: Testing (2-3 days)**
- Unit tests for prune logic
- Integration tests on real networks
- Performance benchmarks
- Security review (ensure no new vulns)

**Total Estimate:** 8-13 days development + testing

### Success Criteria

✅ **Correctness:** ARP-first mode finds ≥95% of hosts found by full scan
✅ **Performance:** ≥3x speedup on networks with <50% live hosts
✅ **Reliability:** Graceful fallback when ARP fails
✅ **Compatibility:** Works with existing CLI/config options

### Next Steps

1. **Validate approach** with stakeholders
2. **Run PoC script** on test networks (confirm speedup)
3. **Create GitHub issue** for tracking
4. **Begin Phase 1 implementation** (arp_prune.c)

---

**End of Analysis**

