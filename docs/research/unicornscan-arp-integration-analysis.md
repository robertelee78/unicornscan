# Unicornscan ARP Integration Analysis: IPC and Report Module Flow

## Executive Summary

This document analyzes how ARP phase results flow through unicornscan's IPC and report module system, identifying integration points for capturing ARP responses (IP→MAC mappings) and using them to filter TCP phase 2 workunits. The analysis maintains Jack Louis's separation of concerns between master coordinator and drone workers.

**Key Finding**: ARP results flow real-time through MSG_OUTPUT IPC messages from listener to master. The master's `deal_with_output()` function (master.c:459) is the PRIMARY integration point where ARP reports can be intercepted, stored, and made available for workunit filtering before phase 2.

---

## 1. IPC Communication Flow

### 1.1 Message Flow Architecture

From the existing IPC analysis document and source examination:

```
┌──────────────────────────────────────────────────────────────┐
│                    MASTER PROCESS                             │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  master_read_drones() - Poll loop (master.c:320)        │ │
│  │                                                           │ │
│  │  ┌─────────────────────────────────────────────────┐    │ │
│  │  │ MSG_OUTPUT handler (master.c:434)               │    │ │
│  │  │   └──> deal_with_output() (master.c:459) ◄──────┼────┼─┼─ PRIMARY INTEGRATION POINT
│  │  │          │                                       │    │ │
│  │  │          ├──> IP_REPORT_MAGIC → IP processing   │    │ │
│  │  │          │      └─> push_jit_report_modules()   │    │ │
│  │  │          │      └─> connect_do() (TCP connect)  │    │ │
│  │  │          │                                       │    │ │
│  │  │          └──> ARP_REPORT_MAGIC → ARP storage ◄──┼────┼─┼─ NEW: Store IP→MAC here
│  │  │                 └─> r_u.a->od_q = fifo_init()   │    │ │
│  │  │                 └─> report_add() (end of scan)  │    │ │
│  │  └─────────────────────────────────────────────────┘    │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                              ▲
                              │ MSG_OUTPUT (IPC message)
                              │
┌──────────────────────────────────────────────────────────────┐
│                 LISTENER DRONE PROCESS                        │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  recv_packet() - Packet capture loop (recv_packet.c:84)│ │
│  │                                                           │ │
│  │  ┌──────────────────────────────────────────────────┐   │ │
│  │  │ pcap_dispatch() callback                         │   │ │
│  │  │   └──> packet_parse() (packet_parse.c)           │   │ │
│  │  │          └──> arp_report_t created               │   │ │
│  │  │                 • magic = ARP_REPORT_MAGIC       │   │ │
│  │  │                 • ipaddr (uint32_t)              │   │ │
│  │  │                 • hwaddr[6] (MAC address)        │   │ │
│  │  │                 • recv_time                      │   │ │
│  │  └──────────────────────────────────────────────────┘   │ │
│  │                                                           │ │
│  │  send_message(MSG_OUTPUT) (recv_packet.c:659,667)        │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 Message Types and Timing

**ARP Phase (Phase 1)**:
- Listener receives `ARP_RECV_MAGIC` workunit from master
- Listener captures ARP responses via pcap
- **REAL-TIME**: Each ARP response immediately sent as `MSG_OUTPUT` to master
- Master processes in `deal_with_output()` **while scan is running**

**TCP Phase (Phase 2)**:
- Listener receives `TCP_RECV_MAGIC` workunit
- Sender receives `TCP_SEND_MAGIC` workunit
- Same MSG_OUTPUT flow for TCP responses

**Critical Timing Property**: MSG_OUTPUT messages are processed **during the scan**, not just at the end. This enables mid-scan filtering.

---

## 2. Report Module System

### 2.1 Report Module Architecture

```
Report Flow Timeline:

PHASE 1: Real-time During Scan
┌────────────────────────────────────────────────────┐
│ Listener captures packet                           │
│   └──> packet_parse.c creates arp_report_t        │
│         └──> send_message(MSG_OUTPUT) to master   │
│                └──> master.c:deal_with_output()    │ ◄─── INTEGRATION POINT A
│                      └──> r_u.a->od_q=fifo_init()  │
│                      └──> push_jit_report_modules()│ ◄─── JIT modules can see ARP
└────────────────────────────────────────────────────┘

PHASE 2: After Scan Completes
┌────────────────────────────────────────────────────┐
│ report_add() (report.c:198)                        │
│   └──> Stores in red-black tree (report_t)        │
│         └──> Key: IP + MAC (get_arpreport_key)    │
│                                                     │
│ report_do() (report.c:165)                         │
│   └──> rbwalk(report_t, do_report_nodefunc)       │
│         └──> push_report_modules()                 │ ◄─── Regular report modules
│         └──> push_output_modules()                 │
│         └──> display_report()                      │
└────────────────────────────────────────────────────┘
```

### 2.2 Report Module Types

From `src/report_modules/osdetect/module.c` and module system:

**Module Initialization Parameters** (module.h):
```c
typedef struct mod_param_report_s {
    int ip_proto;        // 6=TCP, 17=UDP, 0=any
    int sport;           // Source port filter (-1=any)
    int dport;           // Dest port filter (-1=any)
    int immed;           // 1=immediate mode (JIT), 0=batch

    void (*init_report)(void);
    void (*fini_report)(void);
    int (*create_report)(const void *report);  // Called with ip_report_t or arp_report_t
} mod_param_report_t;
```

**Two Invocation Points**:

1. **JIT (Just-In-Time) Modules** - Called during scan:
   - `push_jit_report_modules()` in `deal_with_output()` (master.c:486)
   - Receives reports **while scanning**
   - Can access raw packet data (if doff > 0)
   - Example: osdetect module (immed=1)

2. **Batch Modules** - Called after scan:
   - `push_report_modules()` in `report_do()` (report.c:401)
   - Receives deduplicated reports from red-black tree
   - No access to raw packet data
   - Standard reporting modules

---

## 3. ARP Response Storage

### 3.1 ARP Report Structure

From `src/scan_progs/scan_export.h:107`:

```c
typedef struct _PACKED_ arp_report_t {
    uint32_t magic;           // ARP_REPORT_MAGIC (0xa3b3c4d3)
    uint8_t hwaddr[6];        // MAC address (CRITICAL)
    uint32_t ipaddr;          // IP address (CRITICAL)
    struct timeval recv_time; // When ARP response received
    void *od_q;               // Output data queue (fifo)
    uint16_t flags;           // Status flags
    uint16_t doff;            // Attached packet length (if ret_layers > 0)
} arp_report_t;
```

**Key Fields for IP→MAC Mapping**:
- `ipaddr`: The IP that responded (network byte order)
- `hwaddr[6]`: The MAC address from ARP response

### 3.2 Current Storage Mechanism

**End-of-Scan Storage** (report.c:323-344):

```c
report_add(void *o, size_t o_len) {
    arp_report_t *a = o;

    // Generate unique key from IP + MAC
    rkey = get_arpreport_key(a->ipaddr, a->hwaddr);

    // Store in red-black tree
    if (rbfind(report_t, rkey, &dummy) != 1) {
        arp_report_t *copy = xmalloc(o_len);
        memcpy(copy, o, o_len);
        rbinsert(report_t, rkey, copy);

        // Immediate output if -I flag set
        if (GET_IMMEDIATE()) {
            line = fmtcat(s->arp_imreport_fmt, a);
            OUT("%s", line);
        }
    }
}
```

**Deduplication Key** (report.c:992):

```c
static uint64_t get_arpreport_key(uint32_t dhost, uint8_t *dmac) {
    union {
        struct {
            uint32_t dhost;
            uint8_t cmac[4];  // XOR-compressed MAC
        } arp;
        uint64_t key;
    } p_u;

    // Compress 6-byte MAC to 4 bytes via XOR
    p_u.arp.cmac[0] = dmac[0] ^ dmac[1];
    p_u.arp.cmac[1] = dmac[3] ^ dmac[2];
    p_u.arp.cmac[2] = dmac[4];
    p_u.arp.cmac[3] = dmac[5];
    p_u.arp.dhost = dhost;

    return p_u.key;
}
```

---

## 4. Integration Points for ARP→TCP Filtering

### 4.1 PRIMARY INTEGRATION POINT: deal_with_output()

**Location**: `src/scan_progs/master.c:459`

**Current Code** (master.c:492-508):

```c
int deal_with_output(void *msg, size_t msg_len) {
    union {
        void *ptr;
        ip_report_t *i;
        arp_report_t *a;
        uint32_t *magic;
    } r_u;

    r_u.ptr = msg;

    if (*r_u.magic == IP_REPORT_MAGIC) {
        // ... IP report handling ...
        r_u.i->od_q = fifo_init();
        push_jit_report_modules(r_u.ptr);

        if (r_u.i->proto == IPPROTO_TCP && GET_DOCONNECT()) {
            connect_do(s->pri_work, (const ip_report_t *)r_u.i);
        }
    }
    else if (*r_u.magic == ARP_REPORT_MAGIC) {
        // CURRENT: Basic validation only
        if (r_u.a->doff > s->vi[0]->mtu) {
            ERR("impossible packet length");
            return -1;
        }

        // NEW: ADD IP→MAC STORAGE HERE ◄────────────────────────
        //
        // This is where we should:
        // 1. Extract r_u.a->ipaddr and r_u.a->hwaddr
        // 2. Store in global/settings data structure
        // 3. Make available for workunit filtering
        //
        r_u.a->od_q = fifo_init();  // Existing code

        // OPTIONAL: Call JIT report modules for ARP
        push_jit_report_modules(r_u.ptr);
    }

    report_add(msg, msg_len);  // Store for end-of-scan reporting
    return 1;
}
```

**Why This Is The Integration Point**:

1. ✅ **Real-time**: Called immediately when MSG_OUTPUT received
2. ✅ **Master process**: Has access to global settings and workunit queues
3. ✅ **Before phase 2**: ARP phase completes before TCP workunits dispatched
4. ✅ **Separation of concerns**: Listener just sends, master decides what to do
5. ✅ **Already handles both IP and ARP reports**: Familiar code pattern

### 4.2 Storage Data Structure Options

**Option A: Hash Table in Settings** (Recommended)

Add to `src/settings.h`:

```c
typedef struct arp_cache_entry_s {
    uint32_t ipaddr;          // Network byte order
    uint8_t hwaddr[6];        // MAC address
    struct timeval seen;      // When ARP response received
} arp_cache_entry_t;

typedef struct settings_t {
    // ... existing fields ...

    void *arp_cache;          // Hash table: IP → MAC
                              // Type: chtbl_t from unilib/chtbl.h
} settings_t;
```

**Advantages**:
- Fast O(1) lookup by IP address
- Unicornscan already has hash table implementation (`unilib/chtbl.h`)
- Matches Jack's pattern of using unilib data structures
- Easy to initialize/destroy with scan lifecycle

**Option B: Red-Black Tree** (Alternative)

Similar to existing `report_t` tree, but separate for real-time access.

### 4.3 Workunit Filtering Integration Point

**Location**: `src/scan_progs/master.c:320` in `master_read_drones()`

**Workunit Dispatch Flow**:

```c
run_scan() {
    // Phase 1: ARP scan
    for (master_state = MASTER_START; ...) {
        dispatch_work_units();  // Send ARP workunits
        drone_poll();
        master_read_drones();   // Receives MSG_OUTPUT with ARP results
                                // → deal_with_output() stores IP→MAC
    }
    // At this point: ARP cache is populated

    // Phase 2: TCP scan (new iteration, s->cur_iter++)
    for (master_state = MASTER_START; ...) {
        dispatch_work_units();  // ◄── FILTER HERE before sending TCP workunits
        ...
    }
}
```

**Filtering Point** in `dispatch_work_units()`:

```c
static int dispatch_work_units(void) {
    // Existing code to get workunit from queue
    struct wk_s *wk = fifo_pop(s->swu);  // Send workunit

    // NEW: If this is TCP phase 2, check ARP cache
    if (wk->s->magic == TCP_SEND_MAGIC && s->cur_iter == 2) {
        uint32_t target_ip = /* extract from workunit */;

        // Lookup in ARP cache
        if (!arp_cache_lookup(s->arp_cache, target_ip)) {
            // IP didn't respond to ARP - skip this workunit
            DBG(M_WRK, "Skipping TCP scan of %s - no ARP response",
                inet_ntoa(target_ip));
            workunit_destroy_sp(wk->wid);
            continue;  // Don't dispatch to sender
        }
    }

    // Existing code to dispatch workunit to drone
    send_message(drone->s, MSG_WORKUNIT, ...);
}
```

---

## 5. Report Timing Analysis

### 5.1 When Reports Are Available

From code analysis:

**DURING SCAN** (Real-time):
- `deal_with_output()` called for each MSG_OUTPUT
- Reports available **immediately** as packets arrive
- JIT report modules can process
- **CRITICAL**: This is BEFORE phase 2 workunits are created

**AFTER SCAN** (Batch):
- `report_do()` called after all iterations complete
- `rbwalk()` iterates stored reports
- Regular report modules process
- Final output display

### 5.2 Scan Iteration Flow

From `master.c` and `workunits.c`:

```
Iteration 1 (ARP Phase):
  ├─> master_state = MASTER_START
  ├─> dispatch_work_units() sends ARP workunits
  │     └─> Listeners: ARP_RECV_MAGIC
  │     └─> Senders: ARP_SEND_MAGIC
  ├─> Packets fly
  ├─> MSG_OUTPUT received (ARP responses)
  │     └─> deal_with_output() ◄─── STORE IP→MAC HERE
  ├─> master_state = MASTER_DONE
  └─> s->cur_iter++ (now = 2)

Iteration 2 (TCP Phase):
  ├─> master_state = MASTER_START
  ├─> dispatch_work_units() ◄─── FILTER USING ARP CACHE
  │     • Check each TCP target IP against ARP cache
  │     • Only dispatch workunits for IPs that responded to ARP
  ├─> Packets fly (only to live hosts)
  ├─> MSG_OUTPUT received (TCP responses)
  └─> master_state = MASTER_DONE

After All Iterations:
  └─> report_do()
        └─> Display final results
```

---

## 6. Proposed Implementation Strategy

### 6.1 Minimal Changes Approach (Respects Jack's Design)

**Step 1: Add ARP Cache to Settings**

`src/settings.h`:
```c
void *arp_cache;  // Hash table for IP→MAC mapping during scan
```

`src/scan_progs/entry.c` (initialization):
```c
s->arp_cache = chtbl_init(1024, hash_ip, match_ip);
```

**Step 2: Store ARP Results in deal_with_output()**

`src/scan_progs/master.c:492`:
```c
else if (*r_u.magic == ARP_REPORT_MAGIC) {
    // Validation (existing)
    if (r_u.a->doff > s->vi[0]->mtu) return -1;

    // NEW: Store in ARP cache for phase 2 filtering
    arp_cache_entry_t *entry = xmalloc(sizeof(arp_cache_entry_t));
    entry->ipaddr = r_u.a->ipaddr;
    memcpy(entry->hwaddr, r_u.a->hwaddr, 6);
    entry->seen = r_u.a->recv_time;

    if (chtbl_insert(s->arp_cache, &entry->ipaddr, entry) < 0) {
        DBG(M_RPT, "Duplicate ARP entry for %s (ignoring)",
            inet_ntoa(entry->ipaddr));
        xfree(entry);
    } else {
        DBG(M_RPT, "Cached ARP: %s → %02x:%02x:%02x:%02x:%02x:%02x",
            inet_ntoa(entry->ipaddr),
            entry->hwaddr[0], entry->hwaddr[1], entry->hwaddr[2],
            entry->hwaddr[3], entry->hwaddr[4], entry->hwaddr[5]);
    }

    // Existing code
    r_u.a->od_q = fifo_init();
    push_jit_report_modules(r_u.ptr);
}
```

**Step 3: Filter Workunits in dispatch_work_units()**

`src/scan_progs/master.c` (in dispatch_work_units function):
```c
// When dispatching TCP send workunits in iteration 2+
if (wk->s->magic == TCP_SEND_MAGIC && s->cur_iter > 1) {
    uint32_t target_ip = wk->s->target.sin_addr.s_addr;

    // Check if IP responded to ARP in phase 1
    if (chtbl_lookup(s->arp_cache, &target_ip) == NULL) {
        // No ARP response - host likely down/unreachable
        DBG(M_WRK, "Filtering TCP workunit for %s (no ARP response)",
            inet_ntoa(target_ip));

        workunit_destroy_sp(wk->wid);
        xfree(wk);
        continue;  // Skip this workunit
    }
}

// Existing dispatch code continues...
```

**Step 4: Cleanup**

`src/scan_progs/entry.c` (shutdown):
```c
if (s->arp_cache != NULL) {
    chtbl_destroy(s->arp_cache, xfree);
    s->arp_cache = NULL;
}
```

### 6.2 Configuration Options

Add command-line flag to control behavior:

```c
// In settings.h
uint16_t master_flags;
#define MASTER_FILTER_ARPCACHE  0x0001  // Only scan IPs that responded to ARP

// In scanopts.c (option parsing)
case 'F':  // --filter-arp
    SET_FILTER_ARPCACHE(1);
    break;
```

Usage:
```bash
# Phase 1: ARP scan entire subnet
unicornscan -mA 192.168.1.0/24

# Phase 2: TCP scan only IPs that responded to ARP
unicornscan -mT -F 192.168.1.0/24
```

**Alternative**: Automatic filtering when both phases in same command:
```bash
# Combined: ARP then filtered TCP
unicornscan -mAT 192.168.1.0/24  # -F implied when multiple modes
```

---

## 7. Alternative: Report Module Approach

If we want to keep all ARP logic in a module (more modular):

### 7.1 JIT Report Module for ARP Caching

`src/report_modules/arpcache/module.c`:

```c
static void *arp_cache = NULL;

void arpcache_init(void) {
    arp_cache = chtbl_init(1024, hash_ip, match_ip);
    // Store reference in global settings
    s->arp_cache = arp_cache;
}

int arpcache_handle_report(const void *r) {
    const arp_report_t *ar = r;

    if (ar->magic != ARP_REPORT_MAGIC) {
        return 1;  // Not ARP, ignore
    }

    // Store IP→MAC mapping
    arp_cache_entry_t *entry = xmalloc(sizeof(arp_cache_entry_t));
    entry->ipaddr = ar->ipaddr;
    memcpy(entry->hwaddr, ar->hwaddr, 6);
    entry->seen = ar->recv_time;

    chtbl_insert(arp_cache, &entry->ipaddr, entry);

    return 1;
}

int init_module(mod_entry_t *m) {
    m->type = MI_TYPE_REPORT;
    m->param_u.report_s.immed = 1;  // JIT mode!
    m->param_u.report_s.init_report = &arpcache_init;
    m->param_u.report_s.create_report = &arpcache_handle_report;
    return 1;
}
```

**Advantages**:
- Clean separation: ARP caching is a module
- Can be enabled/disabled via config
- Follows unicornscan's module pattern

**Disadvantages**:
- Still need master.c changes for workunit filtering
- More complex (extra module to maintain)

---

## 8. Workunit Structure for Filtering

### 8.1 Send Workunit IP Extraction

From `src/scan_progs/workunits.h`:

```c
typedef struct _PACKED_ send_workunit_t {
    uint32_t magic;
    // ... many fields ...
    struct sockaddr_storage target;      // Target IP/netmask
    struct sockaddr_storage targetmask;
    // ... more fields ...
} send_workunit_t;
```

**Extracting Target IP** for filtering:

```c
send_workunit_t *swu = wk->s;

// Target IP is in sockaddr_storage - need to cast
if (swu->target.ss_family == AF_INET) {
    struct sockaddr_in *sin = (struct sockaddr_in *)&swu->target;
    uint32_t target_ip = sin->sin_addr.s_addr;

    // Now can lookup in ARP cache
    if (chtbl_lookup(s->arp_cache, &target_ip) == NULL) {
        // No ARP response - filter this workunit
    }
}
```

### 8.2 Workunit Iterator Pattern

Workunits are stored in FIFO queues (`s->swu`, `s->lwu`). The dispatcher pops them:

```c
// Existing pattern in dispatch_work_units()
while ((wk = fifo_pop(s->swu)) != NULL) {
    // Filter here before sending to drone

    if (should_filter_workunit(wk)) {
        workunit_destroy_sp(wk->wid);
        xfree(wk);
        continue;
    }

    // Dispatch to sender drone
    send_message(drone->s, MSG_WORKUNIT, ...);
}
```

---

## 9. Data Flow Summary

### 9.1 Complete ARP→TCP Filter Data Flow

```
LISTENER DRONE:
  ARP request sent
    ↓
  ARP response captured (pcap)
    ↓
  packet_parse.c creates arp_report_t
    • ipaddr = 192.168.1.100
    • hwaddr = [00:11:22:33:44:55]
    ↓
  send_message(MSG_OUTPUT) to master
    ↓
═══════════════════════════════════════════════════════════════
MASTER PROCESS:
    ↓
  master_read_drones() receives MSG_OUTPUT
    ↓
  deal_with_output(arp_report_t *r)
    ↓
  ┌──────────────────────────────────────────────────┐
  │ INTEGRATION POINT A: Store in ARP cache          │
  │                                                   │
  │ arp_cache_entry_t *entry = malloc(...)          │
  │ entry->ipaddr = r->ipaddr                        │
  │ entry->hwaddr = r->hwaddr                        │
  │ chtbl_insert(s->arp_cache, &entry->ipaddr, ...) │
  └──────────────────────────────────────────────────┘
    ↓
  report_add(r)  // Store for final reporting
    ↓
    ...
    ↓
  [ARP phase completes, s->cur_iter++]
    ↓
  [TCP phase starts]
    ↓
  dispatch_work_units()
    ↓
  for each TCP send workunit:
    ↓
  ┌──────────────────────────────────────────────────┐
  │ INTEGRATION POINT B: Filter using ARP cache      │
  │                                                   │
  │ target_ip = workunit->target.sin_addr.s_addr     │
  │                                                   │
  │ if (chtbl_lookup(s->arp_cache, &target_ip) == NULL) {
  │   // No ARP response - skip this target          │
  │   workunit_destroy_sp(wk->wid)                   │
  │   continue                                        │
  │ }                                                 │
  └──────────────────────────────────────────────────┘
    ↓
  send_message(MSG_WORKUNIT) to sender
    • Only for IPs that responded to ARP
    ↓
═══════════════════════════════════════════════════════════════
SENDER DRONE:
  Sends TCP SYN packets
    • Only to filtered (alive) hosts
```

### 9.2 Separation of Concerns Maintained

**Listener Drone**:
- ✅ Captures packets (ARP and TCP)
- ✅ Parses to report structures
- ✅ Sends MSG_OUTPUT to master
- ✅ **NO filtering logic** - doesn't know about phases

**Sender Drone**:
- ✅ Receives workunits from master
- ✅ Sends packets per workunit
- ✅ **NO filtering logic** - doesn't know which IPs are filtered

**Master Process**:
- ✅ Receives all MSG_OUTPUT reports
- ✅ **Decides** what to do with reports (storage, filtering)
- ✅ **Decides** which workunits to dispatch
- ✅ Controls scan flow and phases
- ✅ **This is where filtering belongs** - master orchestrates

This maintains Jack's architecture: drones are workers, master is coordinator.

---

## 10. Configuration and Command-Line Integration

### 10.1 Proposed Options

**Option 1: Explicit Flag**
```bash
unicornscan -mT --filter-arp-cache 192.168.1.0/24
```

**Option 2: Automatic (Recommended)**
```bash
# When both modes specified, automatic filtering
unicornscan -mAT 192.168.1.0/24
```

**Option 3: Phase-Aware Syntax**
```bash
# Explicit phase specification
unicornscan -m A:1,T:2 --filter-phase=1 192.168.1.0/24
```

### 10.2 Settings Storage

`src/settings.h`:
```c
typedef struct settings_t {
    // Existing fields...

    // NEW: ARP-based filtering
    void *arp_cache;           // Hash table: IP → arp_cache_entry_t
    uint8_t filter_arp_phase;  // Which phase ARP results came from (1-based)
    uint16_t arp_cache_hits;   // Statistics: IPs found in cache
    uint16_t arp_cache_misses; // Statistics: IPs filtered out
} settings_t;
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

**ARP Cache Operations**:
```c
// Test hash table insertion/lookup
test_arp_cache_insert();
test_arp_cache_lookup();
test_arp_cache_duplicate();
test_arp_cache_cleanup();
```

**Workunit Filtering**:
```c
// Test filtering logic
test_filter_with_arp_match();     // IP in cache → dispatch
test_filter_without_arp_match();  // IP not in cache → skip
test_filter_wrong_iteration();    // Iteration 1 → no filter
```

### 11.2 Integration Tests

**Scenario 1: Mixed Live/Dead Hosts**
```bash
# Setup: 192.168.1.1-10 live, 192.168.1.11-254 down

# Phase 1: ARP scan
unicornscan -mA 192.168.1.0/24 > arp_results.txt

# Expect: 10 ARP responses cached

# Phase 2: Filtered TCP scan
unicornscan -mT --filter-arp 192.168.1.0/24 > tcp_results.txt

# Verify: Only 10 TCP workunits dispatched (not 254)
```

**Scenario 2: Statistics Validation**
```bash
# Enable debug mode
unicornscan -mAT -vvv 192.168.1.0/24 2>&1 | tee scan.log

# Check logs for:
# - "Cached ARP: X.X.X.X → MAC" messages
# - "Filtering TCP workunit for X.X.X.X (no ARP response)"
# - Final stats: "Filtered N/254 hosts based on ARP"
```

### 11.3 Performance Tests

**Measure Reduction**:
```bash
# Baseline: Full TCP scan (no filtering)
time unicornscan -mT 10.0.0.0/16  # 65536 hosts

# Optimized: ARP-filtered TCP scan
time unicornscan -mAT 10.0.0.0/16  # Only live hosts

# Measure:
# - Total time reduction
# - Packet count reduction
# - Workunit dispatch reduction
```

---

## 12. Potential Issues and Solutions

### 12.1 ARP Cache Memory Usage

**Issue**: Large subnets (/16, /8) could use significant memory.

**Solution**:
```c
// Limit cache size
#define MAX_ARP_CACHE_ENTRIES 65536

if (chtbl_size(s->arp_cache) >= MAX_ARP_CACHE_ENTRIES) {
    ERR("ARP cache full, older entries may be overwritten");
    // Use LRU eviction or refuse new entries
}
```

### 12.2 Multiple Interface Scenarios

**Issue**: Listener on different interface than sender.

**Current Design**: Listener sends interface info in `listener_info_t` including MAC address. Master already knows which listener is on which interface.

**Solution**: Filter workunit targets based on which listener responded with ARP. Requires tracking listener→IP mappings.

### 12.3 ARP Spoofing/False Positives

**Issue**: Gratuitous ARP or ARP spoofing could poison cache.

**Solution**:
```c
// Option: Only cache ARP replies, not gratuitous
if (arp_packet->ar_op != ARPOP_REPLY) {
    return;  // Ignore non-replies
}

// Option: Validate sender IP is in scan range
if (!is_in_target_range(arp->sender_ip, s->ss->target)) {
    return;  // Ignore out-of-range ARP
}
```

### 12.4 Cluster Mode Considerations

**Issue**: Multiple listeners may see different ARP responses.

**Current Design**: All MSG_OUTPUT goes to single master. Master sees all ARP responses from all listeners.

**Solution**: Already works! Master aggregates ARP from all listeners into single cache.

---

## 13. Code Locations Reference

### 13.1 Key Files for Modification

**Primary Integration**:
- `src/scan_progs/master.c:459` - `deal_with_output()` - Store ARP results
- `src/scan_progs/master.c` - `dispatch_work_units()` - Filter workunits
- `src/settings.h` - Add `arp_cache` field
- `src/scan_progs/entry.c` - Initialize/cleanup ARP cache

**Supporting Files**:
- `src/unilib/chtbl.c` - Hash table implementation (already exists)
- `src/scan_progs/report.c` - Existing ARP report handling (reference)
- `src/scan_progs/recv_packet.c:659` - Where MSG_OUTPUT sent (reference)

### 13.2 Existing Functions to Leverage

**Hash Table** (unilib/chtbl.h):
```c
void *chtbl_init(int buckets,
                  int (*h)(const void *key),
                  int (*match)(const void *key1, const void *key2));
int chtbl_insert(void *chtbl, const void *key, const void *data);
void *chtbl_lookup(const void *chtbl, const void *key);
void chtbl_destroy(void *chtbl, void (*destroy)(void *data));
```

**Workunit Management** (scan_progs/workunits.h):
```c
void workunit_destroy_sp(uint32_t wid);
void workunit_reject_sp(uint32_t wid);  // Return to queue
```

**Report Structures** (scan_progs/scan_export.h):
```c
arp_report_t - Already defined
ip_report_t - Already defined
```

---

## 14. Recommendations

### 14.1 Implementation Priority

**Phase 1: Minimal Viable Implementation**
1. Add `arp_cache` to settings structure
2. Store ARP results in `deal_with_output()`
3. Filter TCP workunits based on cache
4. Add `--filter-arp` command-line flag
5. Basic testing with small subnets

**Phase 2: Robustness**
1. Add statistics tracking (hits/misses)
2. Memory limits and error handling
3. ARP validation (reply only, range check)
4. Comprehensive testing

**Phase 3: Advanced Features**
1. Report module for ARP caching (optional)
2. Multi-interface support refinement
3. Cluster mode testing
4. Performance benchmarking

### 14.2 Design Principles to Maintain

1. **Separation of Concerns**:
   - Drones capture and report
   - Master decides and dispatches
   - Keep filtering logic in master

2. **Minimal Changes**:
   - Reuse existing data structures (chtbl)
   - Leverage existing message flow (MSG_OUTPUT)
   - Don't modify IPC protocol

3. **Backward Compatibility**:
   - ARP filtering is optional (flag-controlled)
   - Default behavior unchanged
   - Existing scans still work

4. **Jack's Patterns**:
   - Use unilib utilities
   - Follow existing error handling
   - Match existing debug/verbose patterns

---

## 15. Conclusion

### 15.1 Summary of Findings

1. **MSG_OUTPUT flows real-time** during scan, enabling mid-scan filtering
2. **`deal_with_output()` is the primary integration point** for capturing ARP results
3. **Workunit dispatch is centralized** in master, perfect for filtering
4. **Existing hash table infrastructure** (`chtbl`) can store IP→MAC mappings
5. **Jack's separation of concerns is maintained** - master orchestrates, drones work

### 15.2 Integration Points Summary

| Integration Point | File:Line | Purpose | Timing |
|-------------------|-----------|---------|---------|
| **A: ARP Storage** | master.c:492 | Store IP→MAC in cache | Real-time (phase 1) |
| **B: Workunit Filter** | master.c (dispatch) | Filter based on cache | Before phase 2 dispatch |
| **C: Cache Init** | entry.c | Create hash table | Scan startup |
| **D: Cache Cleanup** | entry.c | Free hash table | Scan shutdown |

### 15.3 Next Steps

1. Review this analysis with project stakeholders
2. Decide on configuration interface (flag vs. automatic)
3. Implement Phase 1 (minimal viable)
4. Test with controlled environment
5. Iterate based on results

---

**Document Version**: 1.0
**Date**: 2025-12-23
**Author**: System Architecture Analysis
**Based On**: Unicornscan 0.4.7 source code
**Related Documents**:
- `docs/research/unicornscan-ipc-communication-analysis.md`
- `docs/research/myiphdr-bitfield-alignment-analysis.md`
