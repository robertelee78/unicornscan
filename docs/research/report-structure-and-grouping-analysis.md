# Unicornscan Report Output Mechanism Analysis

## Executive Summary

This document provides a comprehensive analysis of unicornscan's report output mechanism, focusing on how results are stored, organized, and iterated. The goal is to understand the current architecture and identify how results could be grouped by IP address instead of the current port/protocol-based organization.

---

## 1. Data Structures

### 1.1 IP Report Structure (`ip_report_t`)

**File:** `/opt/unicornscan-0.4.7/src/scan_progs/scan_export.h` **Lines 76-105**

```c
typedef struct _PACKED_ ip_report_t {
    uint32_t magic;           // IP_REPORT_MAGIC = 0xd2d19ff2
    uint16_t sport;           // Source port (from target)
    uint16_t dport;           // Destination port (on target machine)
    uint8_t proto;            // Protocol (IPPROTO_TCP, IPPROTO_UDP, IPPROTO_ICMP)
    uint16_t type;            // ICMP type or TCP flags
    uint16_t subtype;         // ICMP code (TCP/UDP unused)
    uint32_t send_addr;       // Local IP that initiated connection
    uint32_t host_addr;       // Target machine IP address
    uint32_t trace_addr;      // Actual source of response packet
    uint8_t ttl;              // TTL from response packet
    struct timeval recv_time; // Timestamp when packet captured
    void *od_q;               // Output data queue (banners, OS fingerprints)
    uint16_t flags;           // Bad CRC flags
    // TCP-specific fields
    uint32_t mseq;            // Master sequence number
    uint32_t tseq;            // Target sequence number
    uint16_t window_size;     // TCP window size
    uint32_t t_tstamp;        // Target timestamp
    uint32_t m_tstamp;        // Master timestamp
    struct ip_report_t *next; // Chain for duplicate key collisions
    uint16_t doff;            // Packet data offset
} ip_report_t;
```

**Key Field:** `next` pointer allows chaining multiple reports with same key (used for `-c` duplicate processing).

### 1.2 ARP Report Structure (`arp_report_t`)

**File:** `/opt/unicornscan-0.4.7/src/scan_progs/scan_export.h` **Lines 107-115**

```c
typedef struct _PACKED_ arp_report_t {
    uint32_t magic;           // ARP_REPORT_MAGIC = 0xd9d82aca
    uint8_t hwaddr[6];        // MAC address (Ethernet hardware address)
    uint32_t ipaddr;          // IP address (network byte order)
    struct timeval recv_time; // Timestamp when ARP reply captured
    void *od_q;               // Output data queue (for modules)
    uint16_t flags;           // Flags
    uint16_t doff;            // Packet data offset
} arp_report_t;
```

**Note:** No `next` pointer - ARP reports don't support duplicate processing.

---

## 2. Red-Black Tree Storage

### 2.1 Tree Structure

**File:** `/opt/unicornscan-0.4.7/src/unilib/rbtree.c` **Lines 44-57**

Both IP and ARP reports are stored in the **SAME red-black tree** (`report_t`):

```c
typedef struct rnode {
    struct rnode *lchld;      // Left child
    struct rnode *rchld;      // Right child
    struct rnode *parent;     // Parent node
    rbcolor_t color;          // red_e or black_e
    void *data;               // Points to ip_report_t or arp_report_t
    uint64_t key;             // Sorting key (see key generation below)
} rnode;

typedef struct rhead {
    uint32_t magic;           // RBMAGIC = 0xfee1dead
    uint32_t len;             // Number of nodes
    rnode *root;              // Root of tree
} rhead;
```

**Critical:** The tree is initialized once (`report_init()` line 97) and stores BOTH report types:
```c
report_t = rbinit(123);  // Single tree for all reports
```

### 2.2 Key Generation: The Core Sorting Logic

#### 2.2.1 IP Report Key Generation

**File:** `/opt/unicornscan-0.4.7/src/scan_progs/report.c` **Lines 1039-1054**

```c
static uint64_t get_ipreport_key(uint32_t dhost, uint16_t dport, uint32_t shost) {
    union {
        struct {
            uint16_t cshost;   // Compressed source host (low 16 bits)
            uint16_t dport;    // Destination port (middle 16 bits)
            uint32_t dhost;    // Destination host (high 32 bits)
        } ip;
        uint64_t key;
    } p_u;

    p_u.ip.dhost = dhost;
    p_u.ip.dport = dport;
    p_u.ip.cshost = (uint16_t)(shost >> 16) ^ (shost & 0x0000FFFF);

    return p_u.key;
}
```

**Key Structure (64-bit):**
```
┌────────────────┬────────────────┬────────────────┬────────────────┐
│   dhost (32)   │   dhost (32)   │  dport (16)    │  cshost (16)   │
│   bits 63-56   │   bits 55-32   │  bits 31-16    │  bits 15-0     │
└────────────────┴────────────────┴────────────────┴────────────────┘
        High significance  ───────────────────────►  Low significance
```

**Sorting Order:**
1. **Primary:** Target IP address (`dhost`) - highest 32 bits
2. **Secondary:** Destination port (`dport`) - middle 16 bits
3. **Tertiary:** Compressed source host (`cshost`) - lowest 16 bits

**Example:**
- Target: `192.168.1.100` (0xc0a80164)
- Port: `80` (0x0050)
- Source: `10.0.0.1` (0x0a000001)
- Key: `0xc0a80164005000a0` (source XORed to 0x00a0)

#### 2.2.2 ARP Report Key Generation

**File:** `/opt/unicornscan-0.4.7/src/scan_progs/report.c` **Lines 1056-1073**

```c
static uint64_t get_arpreport_key(uint32_t dhost, uint8_t *dmac) {
    union {
        struct {
            uint8_t cmac[4];   // Compressed MAC (low 32 bits)
            uint32_t dhost;    // IP address (high 32 bits)
        } arp;
        uint64_t key;
    } p_u;

    p_u.arp.cmac[0] = *(dmac)     ^ *(dmac + 1);  // XOR bytes 0 and 1
    p_u.arp.cmac[1] = *(dmac + 3) ^ *(dmac + 2);  // XOR bytes 2 and 3
    p_u.arp.cmac[2] = *(dmac + 4);                // Byte 4
    p_u.arp.cmac[3] = *(dmac + 5);                // Byte 5

    p_u.arp.dhost = dhost;

    return p_u.key;
}
```

**Key Structure (64-bit):**
```
┌────────────────┬────────────────┬────────────────────────────────┐
│   dhost (32)   │   dhost (32)   │      cmac (32)                 │
│   bits 63-56   │   bits 55-32   │      bits 31-0                 │
└────────────────┴────────────────┴────────────────────────────────┘
        High significance  ───────────────►  Low significance
```

**Sorting Order:**
1. **Primary:** IP address (`dhost`) - highest 32 bits
2. **Secondary:** Compressed MAC address (`cmac`) - lowest 32 bits

**Example:**
- IP: `192.168.1.100` (0xc0a80164)
- MAC: `aa:bb:cc:dd:ee:ff`
- Compressed MAC: `(aa^bb)(cc^dd)(ee)(ff)` = `0x11116eef`
- Key: `0xc0a8016411116eef`

**CRITICAL INSIGHT:** ARP reports are **already sorted by IP address** because `dhost` is the high 32 bits!

---

## 3. Tree Traversal and Output

### 3.1 Walk Order

**File:** `/opt/unicornscan-0.4.7/src/unilib/rbtree.c` **Lines 224-250, 544-556**

```c
int rbwalk(void *lh, int (*wf)(uint64_t, void *, void *), int wt, void *cbdata) {
    switch (wt) {
        case RBORD_PREO:   // Pre-order: node, left, right
            return _rb_preo_walk(h_u.lh->root, wf, cbdata);
        case RBORD_INO:    // In-order: left, node, right (DEFAULT)
            return _rb_ino_walk(h_u.lh->root, wf, cbdata);
        case RBORD_POSTO:  // Post-order: left, right, node
            return _rb_posto_walk(h_u.lh->root, wf, cbdata);
        default:
            return _rb_ino_walk(h_u.lh->root, wf, cbdata);  // Default is in-order
    }
}

static int _rb_ino_walk(rnode *n, int (*wf)(uint64_t, void *, void *), void *cbdata) {
    if (n != NULL) {
        _rb_ino_walk(n->lchld, wf, cbdata);    // Left subtree
        wf(n->key, n->data, cbdata);           // Current node
        _rb_ino_walk(n->rchld, wf, cbdata);    // Right subtree
    }
    return 1;
}
```

**Both `report_do()` and `report_do_arp()` use in-order traversal (wt=1):**

```c
rbwalk(report_t, do_report_nodefunc, 1, NULL);      // Final report output
rbwalk(report_t, do_arpreport_nodefunc, 1, NULL);   // ARP-only output
```

**In-order traversal visits nodes in ASCENDING KEY ORDER** (left → root → right).

### 3.2 Current Iteration Order

#### For IP Reports (TCP/UDP scans):

**File:** `/opt/unicornscan-0.4.7/src/scan_progs/report.c` **Line 176**

```
Sorting hierarchy:
1. Target IP (ascending)
2. Port number (ascending within each IP)
3. Source IP compressed (ascending within each port)
```

**Example output:**
```
192.168.1.1:22   TCP open
192.168.1.1:80   TCP open
192.168.1.1:443  TCP open
192.168.1.2:22   TCP open
192.168.1.2:3306 TCP open
```

**Results ARE grouped by IP!** But separated by port within each IP.

#### For ARP Reports:

**File:** `/opt/unicornscan-0.4.7/src/scan_progs/report.c` **Line 192**

```
Sorting hierarchy:
1. IP address (ascending)
2. MAC address compressed (ascending within each IP)
```

**Example output:**
```
192.168.1.1 from aa:bb:cc:dd:ee:ff
192.168.1.2 from 11:22:33:44:55:66
192.168.1.3 from aa:bb:cc:dd:ee:ff
```

**ARP results ARE already grouped by IP!**

---

## 4. Report Functions

### 4.1 `report_do()` - Final Output

**File:** `/opt/unicornscan-0.4.7/src/scan_progs/report.c` **Lines 166-179**

```c
void report_do(void) {
    DBG(M_RPT, "formats are ip `%s' imip `%s' arp `%s' imarp `%s', you should see %u results",
        s->ip_report_fmt,
        s->ip_imreport_fmt,
        s->arp_report_fmt,
        s->arp_imreport_fmt,
        rbsize(report_t)
    );

    rbwalk(report_t, do_report_nodefunc, 1, NULL);  // In-order walk
}
```

**Callback:** `do_report_nodefunc()` (lines 411-469)
- Skips ARP reports in compound mode (already output by `report_do_arp()`)
- Processes IP reports normally
- Handles chained reports via `next` pointer
- Calls output modules and display functions
- Frees memory after output

### 4.2 `report_do_arp()` - Compound Mode ARP Output

**File:** `/opt/unicornscan-0.4.7/src/scan_progs/report.c` **Lines 186-195**

```c
void report_do_arp(void) {
    DBG(M_RPT, "compound mode: outputting ARP reports sorted by IP, %u total reports",
        rbsize(report_t)
    );

    rbwalk(report_t, do_arpreport_nodefunc, 1, NULL);  // In-order walk
}
```

**Callback:** `do_arpreport_nodefunc()` (lines 475-502)
- **Only processes ARP reports** - skips IP reports
- Does NOT free reports (cleanup happens in `report_do()` later)
- Outputs ARP results sorted by IP address

**Called from:** `master.c:269` after phase 1 completes in compound mode.

### 4.3 Mixed Tree Storage

**Both IP and ARP reports share the SAME tree.**

**File:** `/opt/unicornscan-0.4.7/src/scan_progs/report.c` **Lines 215-373**

```c
int report_add(void *o, size_t o_len) {
    union {
        void *ptr;
        arp_report_t *a;
        ip_report_t *i;
        uint32_t *magic;
    } o_u;

    o_u.ptr = o;

    if (*o_u.magic == IP_REPORT_MAGIC) {
        rkey = get_ipreport_key(o_u.i->host_addr, o_u.i->sport, o_u.i->send_addr);

        if (port_open(...) || GET_PROCERRORS()) {
            if (rbfind(report_t, rkey, &dummy) != 1) {
                rbinsert(report_t, rkey, oc_u.ptr);  // Insert into tree
            }
            else if (GET_PROCDUPS()) {
                // Chain onto existing report's ->next pointer
            }
        }
    }
    else if (*o_u.magic == ARP_REPORT_MAGIC) {
        rkey = get_arpreport_key(o_u.a->ipaddr, o_u.a->hwaddr);

        if (rbfind(report_t, rkey, &dummy) != 1) {
            rbinsert(report_t, rkey, oc_u.ptr);  // Insert into SAME tree
        }
    }
}
```

**Tree contents during compound mode scan:**
```
Key Range                Report Type
─────────────────────────────────────────
0x0a000001_XXXX...       IP reports (10.0.0.1)
0xc0a80101_XXXX...       ARP reports (192.168.1.1)
0xc0a80101_YYYY...       IP reports (192.168.1.1)
0xc0a80164_XXXX...       ARP reports (192.168.1.100)
0xc0a80164_YYYY...       IP reports (192.168.1.100)
```

**The tree is sorted by key, NOT by report type.**

---

## 5. Answers to Research Questions

### Q1: How does `report_do()` iterate through results? What order?

**Answer:**
- Uses **in-order traversal** (`RBORD_INO = 1`) of the red-black tree
- Visits nodes in **ascending key order** (left subtree → node → right subtree)
- For **IP reports:** sorted by target IP, then port, then compressed source IP
- For **ARP reports:** sorted by IP address, then compressed MAC
- **Mixed tree:** ARP and IP reports are interleaved based on their keys

**Order guarantee:** Results are deterministic and sorted by the 64-bit key.

### Q2: Are ARP and TCP results stored in the same tree or separate trees?

**Answer:**
**SAME TREE.** Both report types share `report_t` (single red-black tree).

**Evidence:**
```c
// report.c:97 - Single tree initialization
static void *report_t = NULL;
report_t = rbinit(123);

// report.c:243 - IP reports inserted
rbinsert(report_t, rkey, oc_u.ptr);

// report.c:347 - ARP reports inserted into SAME tree
rbinsert(report_t, rkey, oc_u.ptr);
```

**Implication:** The tree contains a mix of both report types, sorted by their respective keys.

### Q3: What is the key structure for TCP/UDP results vs ARP results?

**Answer:**

**IP Report Key (TCP/UDP/ICMP):**
```
Bits 63-32: Target IP (dhost)          - Primary sort
Bits 31-16: Destination port (dport)   - Secondary sort
Bits 15-0:  Compressed source (cshost) - Tertiary sort
```

**ARP Report Key:**
```
Bits 63-32: Target IP (dhost)          - Primary sort
Bits 31-0:  Compressed MAC (cmac)      - Secondary sort
```

**Comparison:**
- **Both** use target IP as the **highest-order bits** (primary sort)
- IP reports further subdivide by port number
- ARP reports subdivide by MAC address
- **Result:** Both are naturally grouped by IP at the top level

### Q4: How could results be grouped by IP instead of by port/protocol?

**Answer:**

**Current behavior:**
```
192.168.1.1:22   TCP open    (IP key: 0xc0a801010016...)
192.168.1.1:80   TCP open    (IP key: 0xc0a801010050...)
192.168.1.1      aa:bb:...   (ARP key: 0xc0a80101XXXX...)
192.168.1.2:22   TCP open    (IP key: 0xc0a801020016...)
```

**They ARE already grouped by IP** at the primary level! The issue is that ports separate them.

**To group ALL results for an IP together:**

#### Option A: Change Key Generation (Most Intrusive)

Modify `get_ipreport_key()` to use IP-only keys:

```c
static uint64_t get_ipreport_key(uint32_t dhost, uint16_t dport, uint32_t shost) {
    // Make IP the ONLY sort criteria
    return ((uint64_t)dhost << 32) | (random_nonce & 0xFFFFFFFF);
}
```

**Problem:** This breaks deduplication and could cause key collisions.

#### Option B: Post-Processing Iterator (Recommended)

Create a wrapper around `rbwalk()` that buffers results per-IP:

```c
void report_do_grouped(void) {
    // Map: IP → list of reports
    void *ip_groups = hashmap_init();

    // Walk tree and group by IP
    rbwalk(report_t, group_by_ip_callback, 1, ip_groups);

    // Iterate IPs in sorted order
    for each IP in sorted(ip_groups):
        for each report in ip_groups[IP]:
            display_report(report);
}
```

**Advantage:** Non-invasive, preserves tree structure.

#### Option C: Secondary Sort During Walk (Minimal Change)

Track current IP during walk and output buffered results when IP changes:

```c
static uint32_t last_ip = 0;
static void *ip_buffer = NULL;  // FIFO

static int grouped_walk_callback(uint64_t key, void *data, void *cbdata) {
    uint32_t current_ip = extract_ip_from_key(key);

    if (current_ip != last_ip && last_ip != 0) {
        // IP changed - flush buffer
        flush_ip_buffer(ip_buffer);
        ip_buffer = fifo_init();
    }

    fifo_push(ip_buffer, data);
    last_ip = current_ip;
    return 1;
}
```

**Advantage:** Simple, leverages existing sort order.

### Q5: What would be needed to output "all results for IP X" together?

**Answer:**

**Current architecture supports this with minimal changes:**

1. **ARP results are ALREADY sorted by IP** (high 32 bits of key)
2. **IP reports are ALREADY sorted by IP first, then port**
3. **The tree traversal is deterministic** (in-order = ascending keys)

**Implementation approaches:**

#### Approach 1: Modify Callback to Buffer (Least Invasive)

```c
typedef struct {
    uint32_t ip;
    void **reports;     // Array of reports
    size_t count;
    size_t capacity;
} ip_group_t;

static ip_group_t *current_group = NULL;

static int buffer_by_ip_callback(uint64_t key, void *data, void *cbdata) {
    uint32_t ip = (uint32_t)(key >> 32);  // Extract IP from key

    if (current_group == NULL || current_group->ip != ip) {
        // Flush previous group
        if (current_group != NULL) {
            output_ip_group(current_group);
            free_ip_group(current_group);
        }

        // Start new group
        current_group = create_ip_group(ip);
    }

    add_to_group(current_group, data);
    return 1;
}
```

**Called as:**
```c
rbwalk(report_t, buffer_by_ip_callback, 1, NULL);
output_ip_group(current_group);  // Flush last group
```

#### Approach 2: Two-Pass System

```c
// Pass 1: Build IP list
void report_do_grouped(void) {
    void *ip_list = build_ip_list(report_t);  // Scan tree for unique IPs

    // Pass 2: For each IP, walk tree and output matching reports
    for each ip in ip_list:
        printf("\n--- Results for %s ---\n", format_ip(ip));
        rbwalk(report_t, filter_by_ip_callback, 1, &ip);
}

static int filter_by_ip_callback(uint64_t key, void *data, void *cbdata) {
    uint32_t target_ip = *(uint32_t*)cbdata;
    uint32_t report_ip = (uint32_t)(key >> 32);

    if (report_ip == target_ip) {
        display_report(data);
    }
    return 1;
}
```

**Trade-off:** Multiple tree traversals vs. memory for buffering.

---

## 6. Compound Mode Behavior

**File:** `/opt/unicornscan-0.4.7/src/scan_progs/master.c` **Lines 265-270**

```c
if (s->num_phases > 1) {
    // Between phase 1 (ARP) and phase 2 (TCP/UDP):
    MSG(MSG_USR, "Phase 1 complete, outputting ARP results...");
    report_do_arp();  // Output ARP sorted by IP
}

// At scan end:
report_do();  // Output IP reports (ARP already shown)
```

**Workflow:**
1. Phase 1 (ARP scan): Reports stored in tree
2. `report_do_arp()` called: ARP results output sorted by IP, NOT freed
3. Phase 2 (TCP/UDP scan): IP reports added to SAME tree
4. `report_do()` called:
   - Skips ARP reports (line 427: `if (s->num_phases > 1 && ARP_REPORT_MAGIC)`)
   - Outputs IP reports sorted by IP+port
   - Frees ALL reports (both ARP and IP)

**Current compound output:**
```
Phase 1:
192.168.1.1 from aa:bb:cc:dd:ee:ff
192.168.1.2 from 11:22:33:44:55:66

Phase 2:
192.168.1.1:22   TCP open
192.168.1.1:80   TCP open
192.168.1.2:22   TCP open
```

**Desired grouped output:**
```
192.168.1.1:
  MAC: aa:bb:cc:dd:ee:ff
  22/tcp   open
  80/tcp   open

192.168.1.2:
  MAC: 11:22:33:44:55:66
  22/tcp   open
```

---

## 7. Key Implementation Insights

### 7.1 Tree Contains Mixed Types

The red-black tree stores **heterogeneous data** (both ARP and IP reports). Each node's `data` pointer must be type-checked:

```c
union {
    void *ptr;
    ip_report_t *ir;
    arp_report_t *ar;
    uint32_t *magic;
} r_u;

r_u.ptr = node_data;

if (*r_u.magic == IP_REPORT_MAGIC) {
    // Process IP report
}
else if (*r_u.magic == ARP_REPORT_MAGIC) {
    // Process ARP report
}
```

### 7.2 IP is Already the Primary Sort Key

Both key generation functions place the target IP in the **high 32 bits**:

```c
// IP report key
p_u.ip.dhost = dhost;      // Bits 63-32
p_u.ip.dport = dport;      // Bits 31-16
p_u.ip.cshost = ...;       // Bits 15-0

// ARP report key
p_u.arp.dhost = dhost;     // Bits 63-32
p_u.arp.cmac[...] = ...;   // Bits 31-0
```

**This means:** The tree is **already primarily sorted by IP address**. Grouping by IP just requires buffering or filtering during the walk.

### 7.3 Duplicate Handling

**IP reports** support chaining via the `next` pointer:

```c
if (GET_PROCDUPS()) {
    ip_report_t *walk = existing_report;
    while (walk->next != NULL) walk = walk->next;
    walk->next = new_report;  // Chain
}
```

**ARP reports** do NOT support chaining:
```c
else if (GET_PROCDUPS()) {
    ERR("arp duplicates not yet implemented");
    SET_PROCDUPS(0);
}
```

---

## 8. Recommendations for IP-Grouped Output

### 8.1 Minimal-Change Approach (Recommended)

**Modify `report_do()` to buffer results per-IP:**

```c
typedef struct {
    uint32_t ip;
    void **arp_reports;
    void **tcp_reports;
    size_t arp_count;
    size_t tcp_count;
} ip_group_t;

void report_do_grouped(void) {
    ip_group_t *group = NULL;

    rbwalk(report_t, collect_by_ip, 1, &group);

    if (group != NULL) {
        output_ip_group(group);
    }
}

static int collect_by_ip(uint64_t key, void *data, void *cbdata) {
    ip_group_t **group_ptr = (ip_group_t **)cbdata;
    uint32_t ip = (uint32_t)(key >> 32);

    union {
        void *p;
        uint32_t *magic;
        ip_report_t *ir;
        arp_report_t *ar;
    } r_u;
    r_u.p = data;

    // New IP - flush previous group
    if (*group_ptr != NULL && (*group_ptr)->ip != ip) {
        output_ip_group(*group_ptr);
        free_ip_group(*group_ptr);
        *group_ptr = NULL;
    }

    // Initialize new group
    if (*group_ptr == NULL) {
        *group_ptr = init_ip_group(ip);
    }

    // Add to group
    if (*r_u.magic == ARP_REPORT_MAGIC) {
        add_arp_to_group(*group_ptr, r_u.ar);
    }
    else if (*r_u.magic == IP_REPORT_MAGIC) {
        add_tcp_to_group(*group_ptr, r_u.ir);
    }

    return 1;
}
```

### 8.2 Output Format Example

```c
static void output_ip_group(ip_group_t *group) {
    char ip_str[INET_ADDRSTRLEN];
    struct in_addr ia;

    ia.s_addr = group->ip;
    inet_ntop(AF_INET, &ia, ip_str, sizeof(ip_str));

    printf("\n%s:\n", ip_str);

    // Output ARP results
    for (size_t i = 0; i < group->arp_count; i++) {
        printf("  MAC: %02x:%02x:%02x:%02x:%02x:%02x",
            group->arp_reports[i]->hwaddr[0],
            group->arp_reports[i]->hwaddr[1],
            group->arp_reports[i]->hwaddr[2],
            group->arp_reports[i]->hwaddr[3],
            group->arp_reports[i]->hwaddr[4],
            group->arp_reports[i]->hwaddr[5]);
        printf(" (OUI: %s)\n", getouiname(/*...*/));
    }

    // Output TCP/UDP results
    for (size_t i = 0; i < group->tcp_count; i++) {
        printf("  %hu/%s\t%s\n",
            group->tcp_reports[i]->sport,
            ipproto_tostr(group->tcp_reports[i]->proto),
            strresptype(group->tcp_reports[i]));
    }
}
```

### 8.3 Integration Points

**Modify these files:**

1. **`src/scan_progs/report.c`:**
   - Add `report_do_grouped()` function
   - Add helper functions for buffering
   - Keep `report_do()` unchanged for backward compatibility

2. **`src/scan_progs/report.h`:**
   - Add `void report_do_grouped(void);` declaration

3. **`src/scan_progs/master.c`:**
   - Call `report_do_grouped()` instead of `report_do()` when desired
   - Could be controlled by a command-line flag (e.g., `-G` for grouped)

4. **`src/scan_progs/scanopts.c`:**
   - Add new option for grouped output

---

## 9. Performance Considerations

### 9.1 Memory Overhead

**Buffering approach:**
- Stores pointers to reports (not copies)
- Maximum buffer size: reports for one IP address
- Typical case: 10-1000 ports per IP = 40-4000 bytes of pointers

**Two-pass approach:**
- First pass: Build sorted IP list (4 bytes per unique IP)
- Second pass: Multiple tree traversals (O(n log n) per IP)

**Recommendation:** Buffering is more efficient.

### 9.2 Time Complexity

**Current `report_do()`:**
- O(n) - Single tree traversal

**Grouped with buffering:**
- O(n) - Single tree traversal
- O(m) - Output buffered groups (m = number of unique IPs)
- **Total: O(n + m)** - Still linear

**Grouped with filtering:**
- O(m × n) - m tree traversals for m unique IPs
- **Total: O(n²)** - Quadratic (not recommended)

---

## 10. Conclusion

### Key Findings

1. **Single Tree:** Both ARP and IP reports share the same red-black tree (`report_t`)

2. **Already Sorted by IP:** Both key generation functions place the target IP in the high 32 bits, making IP the primary sort key

3. **In-Order Traversal:** `rbwalk()` uses in-order traversal (ascending key order), guaranteeing deterministic, sorted output

4. **Natural Grouping:** Reports ARE already grouped by IP at the tree level; ports simply subdivide within each IP

5. **Compound Mode:** ARP results are output sorted by IP via `report_do_arp()`, then IP results via `report_do()`

### Implementation Path

**To output "all results for IP X together":**

1. **Simplest:** Modify the walk callback to buffer reports per-IP
2. **Most flexible:** Create `report_do_grouped()` alongside existing `report_do()`
3. **Backward compatible:** Add command-line flag to choose output format
4. **Minimal overhead:** O(n) time, O(ports_per_ip) space

**No fundamental architecture changes needed** - the current design already supports IP-grouped output with a simple buffering layer during tree traversal.

---

## Appendix A: Complete Key Examples

### Example 1: TCP Scan

**Target:** `192.168.1.100:22` from `10.0.0.1`

```
IP:     192.168.1.100 = 0xc0a80164
Port:   22            = 0x0016
Source: 10.0.0.1      = 0x0a000001
        Compressed    = (0x0a00 ^ 0x0001) = 0x0a01

Key: 0xc0a801640016_0a01
     └─────┬─────┘└┬─┘└┬┘
         IP      Port Src
```

### Example 2: ARP Discovery

**Target:** `192.168.1.100` with MAC `aa:bb:cc:dd:ee:ff`

```
IP:  192.168.1.100 = 0xc0a80164
MAC: aa:bb:cc:dd:ee:ff
     Compressed:
       Byte 0^1: aa ^ bb = 0x11
       Byte 2^3: cc ^ dd = 0x11
       Byte 4:   ee      = 0xee
       Byte 5:   ff      = 0xff
     cmac = 0x1111eeff

Key: 0xc0a80164_1111eeff
     └─────┬─────┘└───┬───┘
         IP         MAC
```

### Example 3: Tree Order

**Scenario:** Scan results for 192.168.1.1 and 192.168.1.2

```
Tree in ascending key order:
┌─────────────────────────────────────────┐
│ 0xc0a80101_0016_XXXX  192.168.1.1:22   │  ← IP=0xc0a80101
│ 0xc0a80101_0050_XXXX  192.168.1.1:80   │     (same IP)
│ 0xc0a80101_01bb_XXXX  192.168.1.1:443  │     (same IP)
│ 0xc0a80101_XXXXXXXX   192.168.1.1 ARP  │     (same IP, MAC varies)
│ 0xc0a80102_0016_XXXX  192.168.1.2:22   │  ← IP=0xc0a80102
│ 0xc0a80102_XXXXXXXX   192.168.1.2 ARP  │     (same IP, MAC varies)
└─────────────────────────────────────────┘
```

**All reports for IP X naturally cluster together due to the high-bits sort!**

---

## Appendix B: Code Location Reference

| Function/Structure | File | Lines | Purpose |
|-------------------|------|-------|---------|
| `ip_report_t` | `scan_export.h` | 76-105 | IP report structure |
| `arp_report_t` | `scan_export.h` | 107-115 | ARP report structure |
| `report_init()` | `report.c` | 90-164 | Initialize report tree |
| `report_do()` | `report.c` | 166-179 | Final output (all reports) |
| `report_do_arp()` | `report.c` | 186-195 | ARP-only output (compound) |
| `report_add()` | `report.c` | 215-373 | Add report to tree |
| `do_report_nodefunc()` | `report.c` | 411-469 | Walk callback (all reports) |
| `do_arpreport_nodefunc()` | `report.c` | 475-502 | Walk callback (ARP only) |
| `get_ipreport_key()` | `report.c` | 1039-1054 | IP report key generation |
| `get_arpreport_key()` | `report.c` | 1056-1073 | ARP report key generation |
| `rbwalk()` | `rbtree.c` | 224-250 | Tree traversal |
| `_rb_ino_walk()` | `rbtree.c` | 544-556 | In-order traversal |
| Red-black node | `rbtree.c` | 44-51 | Tree node structure |
| Red-black head | `rbtree.c` | 53-57 | Tree root structure |

---

**End of Analysis**
