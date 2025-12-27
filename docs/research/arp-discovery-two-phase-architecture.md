# Two-Phase ARP Discovery Architecture

**Document Version:** 1.0
**Date:** 2025-12-22
**Author:** System Architecture Designer
**Status:** Design Review

## Executive Summary

This document describes the architecture for implementing a two-phase scanning approach in unicornscan to eliminate kernel ARP resolution blocking. The solution performs fast ARP discovery first, then only scans live hosts, reducing scan time by up to 95% for networks with sparse host populations.

**Problem:** TCP/UDP scans block ~3 seconds per non-existent host while kernel performs ARP resolution
**Solution:** Phase 1 ARP sweep (fast, no blocking) → Phase 2 TCP/UDP scan (only live hosts)
**Impact:** 20 host scan drops from ~60s to ~3-5s

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagrams](#architecture-diagrams)
3. [Component Design](#component-design)
4. [Data Flow](#data-flow)
5. [Implementation Plan](#implementation-plan)
6. [Integration Points](#integration-points)
7. [Configuration & CLI](#configuration--cli)
8. [Testing Strategy](#testing-strategy)

---

## 1. System Overview

### 1.1 Current Architecture Problems

```
Current Flow (Blocking):
┌─────────────────────────────────────────────────────┐
│ For each host in target range:                     │
│   For each port:                                    │
│     1. Build TCP/UDP packet                         │
│     2. Call ip_send()                               │
│     3. Kernel checks ARP cache                      │
│     4. If no entry: BLOCKS for ~3s doing ARP        │  ← BOTTLENECK
│     5. Send packet                                  │
│     6. Timeout waiting for response (1-5s)          │
└─────────────────────────────────────────────────────┘

Time per non-existent host: ~3-8 seconds
Time for 20 hosts (19 dead): ~60-150 seconds
```

### 1.2 Proposed Two-Phase Architecture

```
Optimized Flow (Non-blocking):
┌─────────────────────────────────────────────────────┐
│ PHASE 1: ARP Discovery (Fast Sweep)                │
│   For each host in target range:                   │
│     1. Send ARP request (eth_send, no kernel)       │
│     2. Wait 100-500ms total                         │
│   3. Collect all ARP responses                      │
│   4. Build live host table with MAC addresses       │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│ PHASE 2: TCP/UDP Scan (Only Live Hosts)            │
│   For each LIVE host only:                         │
│     For each port:                                  │
│       1. Build TCP/UDP packet                       │
│       2. Use cached MAC address                     │
│       3. Send via eth_send (L2, bypasses kernel)    │  ← NO BLOCKING
│       4. Receive responses                          │
└─────────────────────────────────────────────────────┘

Time per live host: ~0.5-2 seconds
Time for 20 hosts (1 live): ~3-5 seconds (95% reduction)
```

---

## 2. Architecture Diagrams

### 2.1 Component Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                         Main Process                                │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                      scan_main.c                              │ │
│  │  - Parse CLI arguments                                        │ │
│  │  - Detect if target is local subnet                           │ │
│  │  - Decide: ARP discovery needed?                              │ │
│  │  - Orchestrate two-phase execution                            │ │
│  └───────────────┬─────────────────────────────┬─────────────────┘ │
│                  │                             │                   │
│                  ▼                             ▼                   │
│  ┌───────────────────────────┐  ┌──────────────────────────────┐ │
│  │   arp_discovery.c         │  │   workunits.c                │ │
│  │   (NEW MODULE)            │  │   (ENHANCED)                 │ │
│  │                           │  │                              │ │
│  │ - arp_discovery_init()    │  │ - Store live host table      │ │
│  │ - arp_discovery_sweep()   │  │ - Filter targets by MAC      │ │
│  │ - arp_discovery_results() │  │ - Generate filtered WUs      │ │
│  │ - arp_cache_lookup()      │  │                              │ │
│  └───────────┬───────────────┘  └──────────────┬───────────────┘ │
│              │                                  │                 │
│              ▼                                  ▼                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              live_host_table.c (NEW MODULE)                │  │
│  │                                                             │  │
│  │  Data Structure:                                           │  │
│  │  typedef struct live_host_t {                              │  │
│  │      uint32_t ipaddr;           // IPv4 address            │  │
│  │      uint8_t  hwaddr[6];        // MAC address             │  │
│  │      uint32_t timestamp;        // Discovery time          │  │
│  │      uint16_t flags;            // Status flags            │  │
│  │      struct live_host_t *next;  // Hash chain              │  │
│  │  } live_host_t;                                            │  │
│  │                                                             │  │
│  │  Functions:                                                │  │
│  │  - lht_init()      // Initialize hash table                │  │
│  │  - lht_insert()    // Add discovered host                  │  │
│  │  - lht_lookup()    // Find host by IP                      │  │
│  │  - lht_foreach()   // Iterate all hosts                    │  │
│  │  - lht_count()     // Get live host count                  │  │
│  │  - lht_destroy()   // Cleanup                              │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                      Sender Process (Forked)                        │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                    send_packet.c (ENHANCED)                   │ │
│  │                                                               │ │
│  │  Phase 1 (ARP Discovery):                                    │ │
│  │    - open_link(SOCK_LL) for direct L2 access                 │ │
│  │    - _send_arp_discovery()                                   │ │
│  │      * Build ARP requests for range                          │ │
│  │      * Use eth_send() (no kernel involvement)                │ │
│  │      * Rate-limited (e.g., 1000 pps)                         │ │
│  │                                                               │ │
│  │  Phase 2 (TCP/UDP Scan):                                     │ │
│  │    - Check live_host_table before sending                    │ │
│  │    - If host not live: skip                                  │ │
│  │    - If host live: use cached MAC for L2 send                │ │
│  │    - Option: L2 bypass or L3 with cached ARP                 │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                    Receiver Process (Forked)                        │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                  recv_packet.c (ENHANCED)                     │ │
│  │                                                               │ │
│  │  Phase 1 (ARP Collection):                                   │ │
│  │    - _recv_arp_discovery()                                   │ │
│  │      * Listen for ARP replies (filter: arp and arp[6:2]=2)   │ │
│  │      * Extract IP + MAC from replies                         │ │
│  │      * Insert into live_host_table                           │ │
│  │      * Timeout after discovery window (0.5-2s)               │ │
│  │                                                               │ │
│  │  Phase 2 (TCP/UDP Reception):                                │ │
│  │    - Standard TCP/UDP receive logic                          │ │
│  │    - No changes needed                                       │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow Sequence Diagram

```
Main Process          Sender Process       Receiver Process      Network
─────────────────────────────────────────────────────────────────────────

PHASE 1: ARP DISCOVERY
──────────────────────

Parse CLI args
Detect local subnet
  │
  │ Enable ARP discovery?
  │ ├─ --arp-discovery=on/off/auto
  │ ├─ Auto: if target in local subnet
  │ └─ Threshold: if >N% of subnet
  │
  ├─────────────────────►│
  │   MSG_WORKUNIT        │
  │   (ARP_SEND_MAGIC)   │
  │                       │
  │                       ├─────────────────►│
  │                       │   Sync: Start    │
  │                       │   ARP listening  │
  │                       │                  │
  │                       │  Send ARP        │──────────────►
  │                       │  requests        │  ARP Request
  │                       │  (eth_send)      │  (broadcast)
  │                       │                  │
  │                       │                  │◄──────────────
  │                       │                  │  ARP Reply
  │                       │                  │  (from live hosts)
  │                       │                  │
  │                       │                  │  Extract:
  │                       │                  │  - IP address
  │                       │                  │  - MAC address
  │                       │                  │  Store in
  │                       │                  │  live_host_table
  │                       │                  │
  │                       │◄─────────────────┤
  │◄──────────────────────┤   MSG_WORKDONE   │
  │  MSG_WORKDONE         │                  │
  │  Live host count: N   │                  │
  │                       │                  │
  │  Receive live_host_table via IPC
  │  (shared memory or serialized)
  │

PHASE 2: TCP/UDP SCAN (ONLY LIVE HOSTS)
────────────────────────────────────────

Filter target list:
  │ For each target IP:
  │   If NOT in live_host_table:
  │     Skip (don't create workunit)
  │   Else:
  │     Create workunit with cached MAC
  │
  ├─────────────────────►│
  │   MSG_WORKUNIT        │
  │   (TCP/UDP_SEND)     │
  │   + MAC address       │
  │                       │
  │                       │  Lookup MAC
  │                       │  from live_host_table
  │                       │
  │                       │  Build packet:
  │                       │  - L2: dst MAC (cached)
  │                       │  - L3: IP header
  │                       │  - L4: TCP/UDP
  │                       │
  │                       │  Send via:
  │                       │  ├─ eth_send() (L2 bypass)
  │                       │  └─ OR ip_send() (kernel uses cache)
  │                       │                  │
  │                       │                  │◄──────────────
  │                       │                  │  TCP/UDP Reply
  │                       │                  │  (from live host)
  │                       │                  │
  │◄──────────────────────┴──────────────────┤
  │         Report results to main           │
  │         (ip_report_t structures)         │
  │                                          │

End scan
Display results
```

### 2.3 State Machine Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Scan State Machine                            │
└─────────────────────────────────────────────────────────────────┘

    START
      │
      ▼
┌──────────────┐
│ INIT         │  - Parse CLI arguments
│              │  - Detect network topology
│              │  - Check ARP discovery settings
└──────┬───────┘
       │
       │  Decision: ARP discovery needed?
       │  ├─ Local subnet? (route.c analysis)
       │  ├─ --arp-discovery flag
       │  └─ Threshold check (% of subnet)
       │
       ├─[NO]──────────────────────────────────────┐
       │                                           │
       │[YES]                                      │
       ▼                                           ▼
┌──────────────┐                           ┌──────────────┐
│ ARP_DISCOVER │                           │ DIRECT_SCAN  │
│              │                           │              │
│ - Send ARP   │                           │ - Skip Phase 1
│   requests   │                           │ - Go directly
│ - Collect    │                           │   to TCP/UDP
│   replies    │                           │   scan
│ - Build      │                           └──────┬───────┘
│   live table │                                  │
└──────┬───────┘                                  │
       │                                          │
       │ Timeout: 100-500ms                       │
       │ (or all hosts responded)                 │
       ▼                                          │
┌──────────────┐                                  │
│ FILTER_HOSTS │                                  │
│              │                                  │
│ - Review live│                                  │
│   host table │                                  │
│ - Prune dead │                                  │
│   targets    │                                  │
│ - Generate   │                                  │
│   filtered   │                                  │
│   workunits  │                                  │
└──────┬───────┘                                  │
       │                                          │
       └───────────────┬──────────────────────────┘
                       ▼
                 ┌──────────────┐
                 │ TCP_UDP_SCAN │
                 │              │
                 │ - For each   │
                 │   live host: │
                 │   * Send TCP │
                 │     or UDP   │
                 │   * Use MAC  │
                 │     cache    │
                 │   * Collect  │
                 │     responses│
                 └──────┬───────┘
                        │
                        ▼
                 ┌──────────────┐
                 │ REPORT       │
                 │              │
                 │ - Aggregate  │
                 │   results    │
                 │ - Display    │
                 │ - Export     │
                 └──────┬───────┘
                        │
                        ▼
                      END
```

---

## 3. Component Design

### 3.1 Live Host Table (NEW: live_host_table.c/h)

**Purpose:** Hash table for O(1) lookup of discovered hosts and their MAC addresses.

**Data Structures:**

```c
/* src/scan_progs/live_host_table.h */

#ifndef _LIVE_HOST_TABLE_H
#define _LIVE_HOST_TABLE_H

#include <stdint.h>
#include <sys/time.h>

/* Hash table size (power of 2 for fast modulo) */
#define LHT_HASH_SIZE 1024
#define LHT_HASH_MASK (LHT_HASH_SIZE - 1)

/* Host entry flags */
#define LHT_FLAG_ACTIVE     0x0001  /* Host responded to ARP */
#define LHT_FLAG_SCANNED    0x0002  /* Host has been scanned */
#define LHT_FLAG_RESPONSIVE 0x0004  /* Host responded to scan */

/* Live host entry */
typedef struct live_host_t {
    uint32_t ipaddr;                    /* IPv4 address (network order) */
    uint8_t  hwaddr[6];                 /* MAC address */
    uint16_t flags;                     /* Status flags */
    uint32_t discovery_time;            /* Timestamp (seconds) */
    uint16_t arp_response_time_ms;      /* ARP RTT in milliseconds */
    struct live_host_t *next;           /* Hash collision chain */
} live_host_t;

/* Live host table */
typedef struct live_host_table_t {
    live_host_t *buckets[LHT_HASH_SIZE]; /* Hash buckets */
    uint32_t count;                      /* Total live hosts */
    uint32_t scan_start_time;            /* Scan start timestamp */
    pthread_mutex_t lock;                /* Thread safety */
} live_host_table_t;

/* Statistics */
typedef struct lht_stats_t {
    uint32_t total_hosts;      /* Hosts in table */
    uint32_t active_hosts;     /* With LHT_FLAG_ACTIVE */
    uint32_t scanned_hosts;    /* With LHT_FLAG_SCANNED */
    uint32_t responsive_hosts; /* With LHT_FLAG_RESPONSIVE */
    uint32_t collisions;       /* Hash collisions */
} lht_stats_t;

/* API Functions */
live_host_table_t *lht_init(void);
void lht_destroy(live_host_table_t *table);

int lht_insert(live_host_table_t *table, uint32_t ipaddr,
               const uint8_t *hwaddr, uint16_t flags);

live_host_t *lht_lookup(live_host_table_t *table, uint32_t ipaddr);

int lht_update_flags(live_host_table_t *table, uint32_t ipaddr,
                     uint16_t flags, int set);

uint32_t lht_count(live_host_table_t *table);
void lht_get_stats(live_host_table_t *table, lht_stats_t *stats);

/* Iterator */
typedef int (*lht_iterator_fn)(live_host_t *host, void *user_data);
int lht_foreach(live_host_table_t *table, lht_iterator_fn callback,
                void *user_data);

/* Serialization for IPC */
int lht_serialize(live_host_table_t *table, uint8_t **buffer, size_t *size);
live_host_table_t *lht_deserialize(const uint8_t *buffer, size_t size);

/* Debug */
void lht_dump(live_host_table_t *table, FILE *fp);

#endif /* _LIVE_HOST_TABLE_H */
```

**Key Functions:**

```c
/* Hash function (FNV-1a for IP addresses) */
static inline uint32_t lht_hash(uint32_t ipaddr) {
    uint32_t hash = 2166136261U;
    hash ^= (ipaddr & 0xFF);
    hash *= 16777619;
    hash ^= ((ipaddr >> 8) & 0xFF);
    hash *= 16777619;
    hash ^= ((ipaddr >> 16) & 0xFF);
    hash *= 16777619;
    hash ^= ((ipaddr >> 24) & 0xFF);
    hash *= 16777619;
    return hash & LHT_HASH_MASK;
}

/* Insert a discovered host */
int lht_insert(live_host_table_t *table, uint32_t ipaddr,
               const uint8_t *hwaddr, uint16_t flags) {
    live_host_t *entry;
    uint32_t hash;

    if (!table || !hwaddr) return -1;

    pthread_mutex_lock(&table->lock);

    /* Check for duplicate */
    entry = lht_lookup_unlocked(table, ipaddr);
    if (entry) {
        /* Update existing entry */
        memcpy(entry->hwaddr, hwaddr, 6);
        entry->flags |= flags;
        pthread_mutex_unlock(&table->lock);
        return 0;
    }

    /* Create new entry */
    entry = xmalloc(sizeof(live_host_t));
    entry->ipaddr = ipaddr;
    memcpy(entry->hwaddr, hwaddr, 6);
    entry->flags = flags;
    entry->discovery_time = time(NULL);

    /* Insert at head of hash bucket */
    hash = lht_hash(ipaddr);
    entry->next = table->buckets[hash];
    table->buckets[hash] = entry;
    table->count++;

    pthread_mutex_unlock(&table->lock);
    return 1;
}
```

**Complexity:** Low (3-5 days)
- Simple hash table implementation
- Basic CRUD operations
- IPC serialization

---

### 3.2 ARP Discovery Module (NEW: arp_discovery.c/h)

**Purpose:** Orchestrate ARP sweep and response collection.

**API Design:**

```c
/* src/scan_progs/arp_discovery.h */

#ifndef _ARP_DISCOVERY_H
#define _ARP_DISCOVERY_H

#include "live_host_table.h"
#include <settings.h>

/* Discovery configuration */
typedef struct arp_discovery_config_t {
    uint8_t enabled;              /* 0=off, 1=on, 2=auto */
    uint32_t timeout_ms;          /* Total discovery timeout (100-2000ms) */
    uint32_t retry_count;         /* ARP request retries (1-3) */
    uint32_t retry_delay_ms;      /* Delay between retries (50-200ms) */
    uint32_t pps;                 /* ARP requests per second */
    uint8_t quiet;                /* Don't report ARP results separately */
    float threshold;              /* Auto-enable if scanning >X% of subnet */
} arp_discovery_config_t;

/* Discovery results */
typedef struct arp_discovery_results_t {
    uint32_t hosts_scanned;       /* IPs in target range */
    uint32_t hosts_discovered;    /* ARP replies received */
    uint32_t discovery_time_ms;   /* Total time for discovery */
    live_host_table_t *live_hosts; /* Discovered hosts */
} arp_discovery_results_t;

/* API Functions */

/* Initialize ARP discovery subsystem */
int arp_discovery_init(arp_discovery_config_t *config);

/* Perform ARP discovery sweep */
int arp_discovery_sweep(
    const struct sockaddr_storage *target,
    const struct sockaddr_storage *targetmask,
    arp_discovery_results_t *results
);

/* Get discovered host table */
live_host_table_t *arp_discovery_get_table(void);

/* Check if IP is live (fast lookup) */
int arp_discovery_is_live(uint32_t ipaddr);

/* Get MAC address for IP (if known) */
int arp_discovery_get_mac(uint32_t ipaddr, uint8_t *hwaddr);

/* Cleanup */
void arp_discovery_destroy(void);

/* Utility: Determine if target is on local subnet */
int arp_discovery_is_local_subnet(
    const struct sockaddr_storage *target,
    const struct sockaddr_storage *targetmask
);

/* Utility: Calculate discovery parameters */
void arp_discovery_auto_config(
    const struct sockaddr_storage *target,
    const struct sockaddr_storage *targetmask,
    arp_discovery_config_t *config
);

#endif /* _ARP_DISCOVERY_H */
```

**Implementation Highlights:**

```c
/* Pseudo-code for ARP sweep */
int arp_discovery_sweep(
    const struct sockaddr_storage *target,
    const struct sockaddr_storage *targetmask,
    arp_discovery_results_t *results)
{
    struct timeval start, end;
    live_host_table_t *table;
    uint32_t host_count;

    gettimeofday(&start, NULL);

    /* Initialize live host table */
    table = lht_init();

    /* Fork sender and receiver processes (or use existing) */
    /* Similar to current send_packet/recv_packet architecture */

    /* SENDER: Send ARP requests for entire range */
    for (each IP in target/targetmask range) {
        send_arp_request(IP, config->pps);
    }

    /* RECEIVER: Collect ARP replies with timeout */
    wait_for_arp_replies(table, config->timeout_ms);

    /* Populate results */
    gettimeofday(&end, NULL);
    results->hosts_scanned = host_count;
    results->hosts_discovered = lht_count(table);
    results->discovery_time_ms = time_diff_ms(&start, &end);
    results->live_hosts = table;

    return 0;
}
```

**Complexity:** Medium (5-7 days)
- Integration with existing IPC infrastructure
- ARP packet building (similar to existing MODE_ARPSCAN)
- Timing and coordination logic

---

### 3.3 Workunit Filtering (ENHANCED: workunits.c)

**Purpose:** Generate TCP/UDP workunits only for live hosts.

**New Functions:**

```c
/* src/scan_progs/workunits.h (additions) */

/* Set live host filter */
int workunit_set_live_filter(live_host_table_t *table);

/* Get live host table */
live_host_table_t *workunit_get_live_filter(void);

/* Clear filter */
void workunit_clear_live_filter(void);

/* Check if host should be scanned */
int workunit_should_scan_host(uint32_t ipaddr);
```

**Integration Points:**

```c
/* In workunit_add() or workunit generation */

static live_host_table_t *live_filter = NULL;

int workunit_set_live_filter(live_host_table_t *table) {
    live_filter = table;
    return 0;
}

/* During workunit creation (e.g., in scan_main.c) */
send_workunit_t *create_tcp_workunit(...) {
    /* Check if target IP is in live host table */
    if (live_filter != NULL) {
        union sock_u target_u;
        target_u.ss = &target;

        if (!lht_lookup(live_filter, target_u.sin->sin_addr.s_addr)) {
            /* Host not live, skip workunit creation */
            DBG(M_WRK, "Skipping non-live host %s",
                cidr_saddrstr((struct sockaddr *)&target));
            return NULL;
        }
    }

    /* Proceed with workunit creation for live host */
    ...
}
```

**Complexity:** Low (2-3 days)
- Simple filter check before workunit creation
- Minimal changes to existing code

---

### 3.4 Sender Process (ENHANCED: send_packet.c)

**Changes Needed:**

1. **L2 Sending with Cached MAC:**

```c
/* New function: Send with explicit MAC address */
static void _send_packet_l2(const uint8_t *target_mac) {
    /* Build Ethernet frame */
    makepkt_clear();

    /* ETH header with cached MAC */
    makepkt_build_ethernet(6,
                           target_mac,        /* Destination MAC */
                           sl.esrc,           /* Source MAC */
                           ETHERTYPE_IP);

    /* IP + TCP/UDP headers (existing code) */
    makepkt_build_ipv4(...);
    if (s->ss->mode == MODE_TCPSCAN) {
        makepkt_build_tcp(...);
    } else if (s->ss->mode == MODE_UDPSCAN) {
        makepkt_build_udp(...);
    }

    /* Send via L2 socket */
    eth_send(sl.s_u.llsock, pbuf, buf_size);
}

/* Modified: Check live host table in _send_packet() */
static void _send_packet(void) {
    union sock_u target_u;
    live_host_t *host_entry;

    target_u.ss = &sl.curhost;

    /* Check if we have a cached MAC address */
    host_entry = arp_discovery_get_table() ?
                 lht_lookup(arp_discovery_get_table(),
                           target_u.sin->sin_addr.s_addr) : NULL;

    if (host_entry != NULL) {
        /* Use L2 send with cached MAC (bypasses kernel ARP) */
        DBG(M_SND, "Using cached MAC for %s",
            cidr_saddrstr((struct sockaddr *)&sl.curhost));
        _send_packet_l2(host_entry->hwaddr);
    } else {
        /* Fall back to L3 send (kernel will do ARP) */
        DBG(M_SND, "No cached MAC, using L3 send");
        /* Existing ip_send() logic */
        ...
    }
}
```

2. **Open L2 Socket for TCP/UDP:**

```c
/* Modify open_link() to support L2 for TCP/UDP when MAC is cached */
static void open_link(int mode, struct sockaddr_storage *target,
                      struct sockaddr_storage *targetmask) {
    /* If we have live host table with MACs, use L2 even for TCP/UDP */
    if ((mode == SOCK_IP) &&
        (s->ss->mode == MODE_TCPSCAN || s->ss->mode == MODE_UDPSCAN) &&
        arp_discovery_get_table() != NULL) {

        DBG(M_SND, "Switching to L2 mode for TCP/UDP (MAC cache available)");
        mode = SOCK_LL;
    }

    /* Existing socket opening logic */
    ...
}
```

**Complexity:** Medium (3-5 days)
- New L2 packet building for TCP/UDP
- Integration with live host table lookup
- Testing L2 vs L3 send paths

---

### 3.5 Receiver Process (ENHANCED: recv_packet.c)

**Changes Needed:**

1. **ARP Reply Collection:**

```c
/* New function for Phase 1 ARP collection */
static void collect_arp_replies(live_host_table_t *table,
                                uint32_t timeout_ms) {
    struct timeval start, now, timeout_tv;
    pcap_t *pcap_handle;
    const u_char *packet;
    struct pcap_pkthdr *header;

    gettimeofday(&start, NULL);
    timeout_tv.tv_sec = timeout_ms / 1000;
    timeout_tv.tv_usec = (timeout_ms % 1000) * 1000;

    /* Set pcap filter for ARP replies only */
    /* Filter: "arp and arp[6:2] = 2" (ARP reply) */

    while (1) {
        int res = pcap_next_ex(pcap_handle, &header, &packet);

        if (res == 1) {
            /* Parse ARP reply */
            parse_arp_reply(packet, header->len, table);
        }

        /* Check timeout */
        gettimeofday(&now, NULL);
        if (timeval_diff_ms(&now, &start) >= timeout_ms) {
            break;
        }
    }

    DBG(M_RCV, "ARP discovery collected %u hosts in %u ms",
        lht_count(table), timeout_ms);
}

static void parse_arp_reply(const u_char *packet, uint32_t len,
                            live_host_table_t *table) {
    /* Extract Ethernet header */
    const struct ether_header *eth = (struct ether_header *)packet;

    /* Extract ARP header */
    const struct ether_arp *arp =
        (struct ether_arp *)(packet + sizeof(struct ether_header));

    /* Validate ARP reply */
    if (ntohs(arp->arp_op) != ARPOP_REPLY) return;

    /* Extract IP and MAC */
    uint32_t ipaddr;
    uint8_t hwaddr[6];

    memcpy(&ipaddr, arp->arp_spa, 4);
    memcpy(hwaddr, arp->arp_sha, 6);

    /* Insert into live host table */
    lht_insert(table, ipaddr, hwaddr, LHT_FLAG_ACTIVE);

    DBG(M_RCV, "ARP reply: %s is at %02x:%02x:%02x:%02x:%02x:%02x",
        inet_ntoa(*(struct in_addr *)&ipaddr),
        hwaddr[0], hwaddr[1], hwaddr[2],
        hwaddr[3], hwaddr[4], hwaddr[5]);
}
```

2. **No Changes for Phase 2:**

The existing TCP/UDP receive logic doesn't need changes. It will simply receive fewer packets because we're only scanning live hosts.

**Complexity:** Low-Medium (3-4 days)
- ARP reply parsing (similar to existing ARP scan code)
- Integration with live host table
- Timeout coordination

---

### 3.6 Local Subnet Detection (ENHANCED: route.c)

**Purpose:** Determine if target is on the same subnet (L2 reachable).

**New Function:**

```c
/* src/unilib/route.h (addition) */

/* Check if target is on local subnet (no gateway needed) */
int is_local_subnet(
    const struct sockaddr *target,
    const struct sockaddr *targetmask
);
```

**Implementation:**

```c
/* src/unilib/route.c */

int is_local_subnet(const struct sockaddr *target,
                    const struct sockaddr *targetmask) {
    struct sockaddr *gw = NULL;
    char *intf = NULL;
    int result;

    /* Use existing getroutes() to check if gateway is needed */
    result = getroutes(&intf, (struct sockaddr *)target,
                       (struct sockaddr *)targetmask, &gw);

    if (result < 0) {
        return 0; /* No route, assume not local */
    }

    /* If gw is NULL, target is on local subnet */
    if (gw == NULL) {
        DBG(M_RTE, "Target is on local subnet (interface %s)", intf);
        return 1;
    }

    DBG(M_RTE, "Target requires gateway %s",
        cidr_saddrstr((const struct sockaddr *)gw));
    return 0;
}
```

**Complexity:** Low (1-2 days)
- Wrapper around existing routing logic
- No new infrastructure needed

---

## 4. Data Flow

### 4.1 Phase 1: ARP Discovery

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Initialize ARP Discovery                                │
└─────────────────────────────────────────────────────────────────┘

Main Process:
  1. Parse target range (e.g., 192.168.1.0/24)
  2. Check if local subnet (route.c)
  3. Apply discovery policy:
     - If --arp-discovery=on: always discover
     - If --arp-discovery=auto: discover if local subnet
     - If --arp-discovery=off: skip to Phase 2
  4. Initialize live_host_table
  5. Create ARP discovery workunit:
     - Magic: ARP_SEND_MAGIC
     - Target range: 192.168.1.0/24
     - Timeout: 500ms
  6. Send workunit to sender process via IPC

┌─────────────────────────────────────────────────────────────────┐
│ Step 2: Send ARP Requests                                       │
└─────────────────────────────────────────────────────────────────┘

Sender Process (send_packet.c):
  1. Receive ARP_SEND_MAGIC workunit
  2. Open L2 socket (eth_open)
  3. For each IP in range (192.168.1.1 - 192.168.1.254):
     a. Build ARP request:
        - Ethernet: broadcast (ff:ff:ff:ff:ff:ff)
        - ARP: who-has <target_ip>? tell <my_ip>
     b. Send via eth_send() (NO kernel involvement)
     c. Rate limit to configured PPS (e.g., 1000 pps)
     d. Track progress (every 10%: DBG message)
  4. Send all 254 requests in ~250ms at 1000 pps
  5. Signal sender complete

┌─────────────────────────────────────────────────────────────────┐
│ Step 3: Collect ARP Replies                                     │
└─────────────────────────────────────────────────────────────────┘

Receiver Process (recv_packet.c):
  1. Set pcap filter: "arp and arp[6:2] = 2" (ARP replies only)
  2. Start timer: 500ms timeout
  3. While timeout not expired:
     a. pcap_next_ex() to get packet
     b. Parse ARP reply:
        - Extract sender IP (arp_spa)
        - Extract sender MAC (arp_sha)
        - Validate reply is for our request
     c. Insert into live_host_table:
        - lht_insert(ipaddr, hwaddr, LHT_FLAG_ACTIVE)
     d. Log discovery:
        DBG: "192.168.1.5 is at 00:11:22:33:44:55"
  4. After timeout:
     - Final count: 3 hosts discovered
     - Serialize live_host_table
     - Send to main process via IPC

┌─────────────────────────────────────────────────────────────────┐
│ Step 4: Filter Target List                                      │
└─────────────────────────────────────────────────────────────────┘

Main Process:
  1. Receive live_host_table from receiver
  2. Original targets: 254 IPs
  3. Live hosts: 3 IPs (192.168.1.5, .42, .100)
  4. Prune target list:
     - Keep only IPs in live_host_table
     - Reduction: 254 → 3 (98.8% fewer targets)
  5. Report to user:
     "ARP discovery: 3 of 254 hosts alive (1.2%)"
  6. Proceed to Phase 2 with filtered list
```

### 4.2 Phase 2: TCP/UDP Scan

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Generate Filtered Workunits                             │
└─────────────────────────────────────────────────────────────────┘

Main Process:
  1. For each port in port list (e.g., 1-1000):
     For each LIVE host only (3 hosts):
       a. Lookup MAC from live_host_table
       b. Create TCP/UDP workunit:
          - Target IP: 192.168.1.5
          - Target MAC: 00:11:22:33:44:55 (cached)
          - Port: 80
       c. Send workunit to sender
  2. Total workunits: 3 hosts × 1000 ports = 3000
     (vs. 254 hosts × 1000 ports = 254,000 without ARP discovery)

┌─────────────────────────────────────────────────────────────────┐
│ Step 2: Send TCP/UDP Packets with Cached MAC                    │
└─────────────────────────────────────────────────────────────────┘

Sender Process:
  1. Receive TCP_SEND_MAGIC or UDP_SEND_MAGIC workunit
  2. Extract target IP: 192.168.1.5
  3. Lookup MAC from workunit or live_host_table
  4. Choose send path:

     Option A: L2 Bypass (Recommended)
     ─────────────────────────────────
     a. Open eth_t socket (L2)
     b. Build complete frame:
        - Ethernet: dst_mac=00:11:22:33:44:55, src_mac=<my_mac>
        - IP: dst_ip=192.168.1.5, src_ip=<my_ip>
        - TCP/UDP: port, flags, etc.
     c. Send via eth_send()
     d. NO kernel involvement, NO ARP lookup

     Option B: L3 with Manual ARP Cache (Alternative)
     ─────────────────────────────────────────────────
     a. Manually add ARP entry to kernel:
        system("arp -s 192.168.1.5 00:11:22:33:44:55")
     b. Send via ip_send()
     c. Kernel uses our ARP cache entry
     d. More compatible but requires root + arp command

  5. Rate limit to configured PPS
  6. NO BLOCKING - MAC already known

┌─────────────────────────────────────────────────────────────────┐
│ Step 3: Receive TCP/UDP Responses                               │
└─────────────────────────────────────────────────────────────────┘

Receiver Process:
  - Same as current implementation
  - No changes needed
  - Just processes fewer packets (only from 3 hosts)

┌─────────────────────────────────────────────────────────────────┐
│ Step 4: Report Results                                          │
└─────────────────────────────────────────────────────────────────┘

Main Process:
  1. Aggregate scan results
  2. Display:
     - 192.168.1.5: TCP 80 open, 443 open
     - 192.168.1.42: TCP 22 open
     - 192.168.1.100: TCP 3389 open
  3. Performance metrics:
     - ARP discovery: 0.5s
     - TCP scan: 3s
     - Total: 3.5s
     - vs. without ARP discovery: ~60s (94% faster)
```

### 4.3 IPC Message Flow

```
Main Process          Sender Process       Receiver Process
─────────────────────────────────────────────────────────────

INITIALIZATION
──────────────
IPC Connect
   │
   ├───────────────────►│
   │   MSG_IDENT        │
   │◄───────────────────┤
   │   MSG_IDENTSENDER  │
   │                    │
   ├────────────────────┴──────────────────►│
   │            MSG_IDENT                   │
   │◄───────────────────────────────────────┤
   │            MSG_IDENTRECV               │

PHASE 1: ARP DISCOVERY
──────────────────────
   │
   ├───────────────────►│
   │   MSG_WORKUNIT     │
   │   (ARP_SEND_MAGIC) │
   │   size: sizeof(send_workunit_t)
   │   data: {
   │     magic: ARP_SEND_MAGIC,
   │     target: 192.168.1.0/24,
   │     timeout: 500ms,
   │     pps: 1000
   │   }
   │                    │
   │                    │  (Send ARP requests)
   │                    │
   │                    │───────────────────►│
   │                    │   (Implicit sync)  │
   │                    │                    │
   │                    │                    │  (Collect ARP replies)
   │                    │                    │  (Build live_host_table)
   │                    │                    │
   │◄───────────────────┴────────────────────┤
   │   MSG_WORKDONE                          │
   │   size: sizeof(send_stats_t) + serialized_table
   │   data: {
   │     pps: 1000,
   │     packets_sent: 254,
   │     live_host_table: {
   │       count: 3,
   │       hosts: [
   │         {ip: 192.168.1.5,   mac: 00:11:22:33:44:55},
   │         {ip: 192.168.1.42,  mac: aa:bb:cc:dd:ee:ff},
   │         {ip: 192.168.1.100, mac: 11:22:33:44:55:66}
   │       ]
   │     }
   │   }
   │
   │  (Deserialize live_host_table)
   │  (Filter target list: 254 → 3 hosts)
   │

PHASE 2: TCP/UDP SCAN
─────────────────────
   │
   ├───────────────────►│
   │   MSG_WORKUNIT     │
   │   (TCP_SEND_MAGIC) │
   │   size: sizeof(send_workunit_t) + port_str_len
   │   data: {
   │     magic: TCP_SEND_MAGIC,
   │     target: 192.168.1.5/32,  ← Single live host
   │     port_str: "1-1000",
   │     pps: 500
   │   }
   │                    │
   │                    │  (Lookup MAC from table)
   │                    │  (Send via L2 with cached MAC)
   │                    │
   │                    │───────────────────►│
   │                    │                    │  (Receive TCP responses)
   │                    │                    │
   │◄───────────────────┴────────────────────┤
   │   MSG_REPORT (ip_report_t structures)   │
   │
   │  (Process and display results)
   │
```

---

## 5. Implementation Plan

### 5.1 Phase 1: Core Infrastructure (Week 1)

**Deliverables:**
- live_host_table.c/h implementation
- Unit tests for hash table operations
- IPC serialization/deserialization

**Tasks:**
1. Create src/scan_progs/live_host_table.c
2. Implement hash table with FNV-1a hashing
3. Add thread safety (pthread_mutex)
4. Implement serialize/deserialize for IPC
5. Write unit tests (tests/live_host_table_test.c)

**Acceptance Criteria:**
- [ ] Insert 10,000 hosts in <10ms
- [ ] Lookup performance: O(1) average case
- [ ] Serialization round-trip preserves all data
- [ ] Thread-safe under concurrent access

---

### 5.2 Phase 2: ARP Discovery (Week 2)

**Deliverables:**
- arp_discovery.c/h implementation
- Integration with sender/receiver processes
- Local subnet detection

**Tasks:**
1. Create src/scan_progs/arp_discovery.c
2. Implement arp_discovery_sweep()
3. Integrate with send_packet.c for ARP transmission
4. Integrate with recv_packet.c for ARP collection
5. Add is_local_subnet() to route.c

**Acceptance Criteria:**
- [ ] ARP sweep completes in <500ms for /24 subnet
- [ ] 100% discovery rate for live hosts
- [ ] No false negatives (missed hosts)
- [ ] Properly detects local vs. routed subnets

---

### 5.3 Phase 3: Workunit Filtering (Week 3)

**Deliverables:**
- Workunit generation respects live host filter
- TCP/UDP packets use cached MAC addresses
- L2 bypass sending for TCP/UDP

**Tasks:**
1. Add workunit_set_live_filter() to workunits.c
2. Modify workunit creation to skip non-live hosts
3. Add _send_packet_l2() to send_packet.c
4. Implement MAC lookup in _send_packet()
5. Add open_link() mode switching for L2 TCP/UDP

**Acceptance Criteria:**
- [ ] Only live hosts generate workunits
- [ ] L2 send bypasses kernel ARP
- [ ] No ARP blocking during TCP/UDP scan
- [ ] Fallback to L3 if MAC not cached

---

### 5.4 Phase 4: CLI Integration (Week 4)

**Deliverables:**
- Command-line flags for ARP discovery
- Automatic configuration based on scan parameters
- User documentation

**Tasks:**
1. Add --arp-discovery=[on|off|auto] flag
2. Add --arp-discovery-timeout=<ms> flag
3. Add --arp-discovery-threshold=<percent> flag
4. Implement auto-configuration logic
5. Add status reporting (VRB messages)
6. Update man page and README

**Acceptance Criteria:**
- [ ] All CLI flags functional
- [ ] Auto mode correctly detects local scans
- [ ] Informative output messages
- [ ] Documentation complete

---

### 5.5 Phase 5: Testing & Optimization (Week 5)

**Deliverables:**
- Integration tests
- Performance benchmarks
- Bug fixes

**Tasks:**
1. Test on various network topologies
2. Benchmark with/without ARP discovery
3. Test edge cases:
   - Empty subnets (0 live hosts)
   - Full subnets (all hosts live)
   - Mixed IPv4/IPv6
   - Routed vs. local subnets
4. Optimize hash table size and algorithms
5. Profile and optimize hot paths

**Acceptance Criteria:**
- [ ] >90% performance improvement for sparse subnets
- [ ] No regressions for dense subnets
- [ ] All edge cases handled gracefully
- [ ] Code review passed

---

## 6. Integration Points

### 6.1 File Modifications Summary

| File | Type | Changes | Complexity | Lines Changed |
|------|------|---------|------------|---------------|
| src/scan_progs/live_host_table.c | NEW | Hash table implementation | Low | +400 |
| src/scan_progs/live_host_table.h | NEW | API definitions | Low | +100 |
| src/scan_progs/arp_discovery.c | NEW | ARP sweep orchestration | Medium | +600 |
| src/scan_progs/arp_discovery.h | NEW | API definitions | Low | +80 |
| src/scan_progs/workunits.c | ENHANCE | Add live host filtering | Low | +150 |
| src/scan_progs/workunits.h | ENHANCE | New filter APIs | Low | +30 |
| src/scan_progs/send_packet.c | ENHANCE | L2 send with MAC cache | Medium | +250 |
| src/scan_progs/recv_packet.c | ENHANCE | ARP reply collection | Medium | +200 |
| src/unilib/route.c | ENHANCE | is_local_subnet() | Low | +40 |
| src/unilib/route.h | ENHANCE | API definition | Low | +10 |
| src/scan_progs/scan_main.c | ENHANCE | Orchestrate two phases | Medium | +300 |
| src/scan_progs/scanopts.c | ENHANCE | CLI parsing | Low | +100 |
| src/settings.h | ENHANCE | Configuration fields | Low | +20 |
| **TOTAL** | | | | **~2,280 lines** |

---

### 6.2 Makefile Changes

```makefile
# src/scan_progs/Makefile.am

# Add new source files
unicornscan_SOURCES = \
    scan_main.c \
    send_packet.c \
    recv_packet.c \
    workunits.c \
    live_host_table.c \       # NEW
    arp_discovery.c \         # NEW
    ...

# Add new headers
noinst_HEADERS = \
    workunits.h \
    live_host_table.h \       # NEW
    arp_discovery.h \         # NEW
    ...

# Add unit tests
check_PROGRAMS = \
    tests/live_host_table_test \  # NEW
    tests/arp_discovery_test      # NEW

tests_live_host_table_test_SOURCES = \
    tests/live_host_table_test.c \
    live_host_table.c

tests_arp_discovery_test_SOURCES = \
    tests/arp_discovery_test.c \
    arp_discovery.c \
    live_host_table.c
```

---

### 6.3 Configuration Changes

```c
/* src/settings.h additions */

typedef struct settings_s {
    /* ... existing fields ... */

    /* ARP discovery configuration */
    struct {
        uint8_t enabled;           /* 0=off, 1=on, 2=auto */
        uint32_t timeout_ms;       /* Discovery timeout */
        uint32_t pps;              /* ARP request rate */
        float threshold;           /* Auto-enable threshold */
        uint8_t quiet;             /* Suppress ARP reporting */
    } arp_discovery;

} settings_t;
```

---

## 7. Configuration & CLI

### 7.1 Command-Line Flags

```
--arp-discovery=[on|off|auto]
    Control ARP discovery phase.
    - on:   Always perform ARP discovery before TCP/UDP scan
    - off:  Skip ARP discovery (traditional behavior)
    - auto: Automatically enable for local subnet scans (default)

--arp-discovery-timeout=<milliseconds>
    ARP discovery timeout in milliseconds.
    Default: 500ms
    Range: 100-5000ms

--arp-discovery-pps=<packets-per-second>
    Rate limit for ARP requests during discovery.
    Default: 1000 pps
    Range: 1-10000 pps

--arp-discovery-threshold=<percent>
    Auto-enable ARP discovery if scanning >X% of subnet.
    Default: 10 (enable if scanning >10% of subnet)
    Range: 0-100
    Example: --arp-discovery-threshold=25 (enable if >25% of subnet)

--arp-discovery-quiet
    Suppress ARP discovery results from output.
    Only show final TCP/UDP scan results.
```

### 7.2 Configuration File

```
# /etc/unicorn/unicorn.conf

# ARP Discovery Settings
arp_discovery {
    enabled = auto;              # on, off, or auto
    timeout = 500;               # milliseconds
    pps = 1000;                  # packets per second
    threshold = 10;              # percent of subnet
    quiet = false;               # suppress ARP results
}
```

### 7.3 Usage Examples

```bash
# Example 1: Auto mode (default)
# Automatically enables ARP discovery for local subnet
unicornscan -mT 192.168.1.0/24 -p 1-1000
# Output:
# [*] ARP discovery: scanning 254 hosts...
# [+] ARP discovery: 3 of 254 hosts alive (1.2%)
# [*] TCP scan: 3 hosts, 1000 ports each...

# Example 2: Force ARP discovery on
unicornscan --arp-discovery=on -mT 10.0.0.0/16 -p 80,443
# Even for large subnet, forces ARP discovery first

# Example 3: Disable ARP discovery
unicornscan --arp-discovery=off -mT 192.168.1.0/24 -p 1-1000
# Traditional behavior, may be slower

# Example 4: Custom timeout for slow networks
unicornscan --arp-discovery-timeout=2000 -mT 192.168.1.0/24 -p 1-65535
# Wait 2 seconds for ARP replies (useful for slow/congested networks)

# Example 5: Aggressive ARP discovery
unicornscan --arp-discovery-pps=5000 --arp-discovery-timeout=200 \
            -mT 192.168.1.0/24 -p 1-1000
# Fast ARP scan: 5000 pps, 200ms timeout

# Example 6: Quiet mode (no ARP output)
unicornscan --arp-discovery-quiet -mT 192.168.1.0/24 -p 1-1000
# Only show final TCP/UDP results, hide ARP discovery
```

### 7.4 Auto-Configuration Logic

```c
/* Pseudo-code for auto-configuration */

int should_enable_arp_discovery(settings_t *s) {
    /* Explicit user override */
    if (s->arp_discovery.enabled == 1) return 1; /* --arp-discovery=on */
    if (s->arp_discovery.enabled == 0) return 0; /* --arp-discovery=off */

    /* Auto mode: check conditions */

    /* Condition 1: Is target on local subnet? */
    if (!is_local_subnet(&s->ss->target, &s->ss->targetmask)) {
        DBG(M_WRK, "Target not on local subnet, skipping ARP discovery");
        return 0; /* Routed target, can't do ARP */
    }

    /* Condition 2: Are we scanning >threshold% of subnet? */
    uint32_t subnet_size = cidr_get_hostcount(&s->ss->targetmask);
    uint32_t target_count = cidr_get_rangecount(&s->ss->target,
                                                 &s->ss->targetmask);
    float percent = (float)target_count / subnet_size * 100.0;

    if (percent < s->arp_discovery.threshold) {
        DBG(M_WRK, "Scanning %.1f%% of subnet (< %.1f%% threshold), "
                   "ARP discovery beneficial",
            percent, s->arp_discovery.threshold);
        return 1; /* Sparse scan, ARP discovery helps */
    }

    /* Scanning entire subnet, ARP discovery may not help much */
    DBG(M_WRK, "Scanning %.1f%% of subnet (>= %.1f%% threshold), "
               "skipping ARP discovery",
        percent, s->arp_discovery.threshold);
    return 0;
}
```

**Decision Matrix:**

| Condition | Target Type | Scan Coverage | ARP Discovery |
|-----------|-------------|---------------|---------------|
| --arp-discovery=on | Any | Any | ✅ Enabled |
| --arp-discovery=off | Any | Any | ❌ Disabled |
| Auto + Local + <10% subnet | Local | Sparse | ✅ Enabled |
| Auto + Local + >10% subnet | Local | Dense | ❌ Disabled |
| Auto + Routed | Routed | Any | ❌ Disabled |

---

## 8. Testing Strategy

### 8.1 Unit Tests

**Test: live_host_table**

```c
/* tests/live_host_table_test.c */

void test_lht_basic_operations(void) {
    live_host_table_t *table = lht_init();
    assert(table != NULL);

    /* Insert */
    uint8_t mac1[6] = {0x00, 0x11, 0x22, 0x33, 0x44, 0x55};
    int result = lht_insert(table, 0xC0A80105, mac1, LHT_FLAG_ACTIVE);
    assert(result == 1);
    assert(lht_count(table) == 1);

    /* Lookup */
    live_host_t *host = lht_lookup(table, 0xC0A80105);
    assert(host != NULL);
    assert(host->ipaddr == 0xC0A80105);
    assert(memcmp(host->hwaddr, mac1, 6) == 0);

    /* Duplicate insert */
    result = lht_insert(table, 0xC0A80105, mac1, LHT_FLAG_ACTIVE);
    assert(result == 0); /* Should update, not add */
    assert(lht_count(table) == 1);

    lht_destroy(table);
}

void test_lht_serialization(void) {
    live_host_table_t *table = lht_init();

    /* Add hosts */
    for (uint32_t i = 1; i <= 10; i++) {
        uint8_t mac[6] = {0x00, 0x11, 0x22, 0x33, 0x44, i};
        lht_insert(table, 0xC0A80100 | i, mac, LHT_FLAG_ACTIVE);
    }

    /* Serialize */
    uint8_t *buffer = NULL;
    size_t size = 0;
    int result = lht_serialize(table, &buffer, &size);
    assert(result == 0);
    assert(buffer != NULL);
    assert(size > 0);

    /* Deserialize */
    live_host_table_t *table2 = lht_deserialize(buffer, size);
    assert(table2 != NULL);
    assert(lht_count(table2) == 10);

    /* Verify data */
    for (uint32_t i = 1; i <= 10; i++) {
        live_host_t *host = lht_lookup(table2, 0xC0A80100 | i);
        assert(host != NULL);
        assert(host->hwaddr[5] == i);
    }

    xfree(buffer);
    lht_destroy(table);
    lht_destroy(table2);
}
```

---

### 8.2 Integration Tests

**Test Scenario 1: Sparse Subnet (1 live host)**

```bash
#!/bin/bash
# tests/integration/test_sparse_subnet.sh

# Setup test environment
# - 1 live host at 192.168.1.100
# - 253 dead hosts

# Run scan with ARP discovery
unicornscan --arp-discovery=on -mT 192.168.1.0/24 -p 1-1000 \
            > /tmp/test_output.txt 2>&1

# Verify:
# 1. ARP discovery completed
grep "ARP discovery: 1 of 254 hosts alive" /tmp/test_output.txt
assert $? -eq 0

# 2. Only 1 host scanned (not 254)
packet_count=$(grep "packets_sent" /tmp/test_output.txt | awk '{print $2}')
assert $packet_count -lt 1500  # 1 host × 1000 ports + overhead

# 3. Scan completed quickly (<10s vs ~60s without ARP)
scan_time=$(grep "Total time" /tmp/test_output.txt | awk '{print $3}')
assert $scan_time -lt 10

echo "PASS: Sparse subnet test"
```

**Test Scenario 2: Dense Subnet (254 live hosts)**

```bash
# All hosts alive, ARP discovery shouldn't slow things down

unicornscan --arp-discovery=on -mT 192.168.1.0/24 -p 80 \
            > /tmp/test_output.txt 2>&1

# Verify:
# 1. All hosts discovered
grep "ARP discovery: 254 of 254 hosts alive" /tmp/test_output.txt
assert $? -eq 0

# 2. All hosts scanned
result_count=$(grep -c "TCP.*open" /tmp/test_output.txt)
assert $result_count -ge 200  # Most hosts have port 80 open

echo "PASS: Dense subnet test"
```

**Test Scenario 3: Routed Target (Auto-disable)**

```bash
# Target not on local subnet, ARP discovery should auto-disable

unicornscan --arp-discovery=auto -mT 8.8.8.8 -p 80,443 \
            > /tmp/test_output.txt 2>&1

# Verify ARP discovery was skipped
grep "Target not on local subnet" /tmp/test_output.txt
assert $? -eq 0

echo "PASS: Routed target test"
```

---

### 8.3 Performance Benchmarks

**Benchmark Script:**

```bash
#!/bin/bash
# tests/benchmarks/arp_discovery_benchmark.sh

echo "ARP Discovery Performance Benchmark"
echo "===================================="
echo ""

# Scenario 1: 1 live host out of 254
echo "Scenario 1: Sparse subnet (1/254 hosts alive)"
echo "  Without ARP discovery:"
time unicornscan --arp-discovery=off -mT 192.168.1.0/24 -p 80 2>&1 | \
     grep "Total time"

echo "  With ARP discovery:"
time unicornscan --arp-discovery=on -mT 192.168.1.0/24 -p 80 2>&1 | \
     grep "Total time"
echo ""

# Scenario 2: 10 live hosts out of 254
echo "Scenario 2: Medium density (10/254 hosts alive)"
echo "  Without ARP discovery:"
time unicornscan --arp-discovery=off -mT 192.168.2.0/24 -p 80,443 2>&1 | \
     grep "Total time"

echo "  With ARP discovery:"
time unicornscan --arp-discovery=on -mT 192.168.2.0/24 -p 80,443 2>&1 | \
     grep "Total time"
echo ""

# Scenario 3: 254 live hosts (worst case for ARP discovery overhead)
echo "Scenario 3: Full subnet (254/254 hosts alive)"
echo "  Without ARP discovery:"
time unicornscan --arp-discovery=off -mT 192.168.3.0/24 -p 80 2>&1 | \
     grep "Total time"

echo "  With ARP discovery:"
time unicornscan --arp-discovery=on -mT 192.168.3.0/24 -p 80 2>&1 | \
     grep "Total time"
echo ""

echo "Benchmark complete"
```

**Expected Results:**

| Scenario | Live Hosts | Without ARP | With ARP | Improvement |
|----------|------------|-------------|----------|-------------|
| Sparse | 1/254 | ~60s | ~3s | 95% ⬆ |
| Medium | 10/254 | ~55s | ~8s | 85% ⬆ |
| Dense | 254/254 | ~5s | ~6s | -20% ⬇ (acceptable overhead) |

---

## 9. Estimated Complexity

### 9.1 Development Time

| Component | Complexity | Days | Developer |
|-----------|------------|------|-----------|
| live_host_table.c/h | Low | 3-5 | Mid-level |
| arp_discovery.c/h | Medium | 5-7 | Senior |
| workunits.c enhancement | Low | 2-3 | Mid-level |
| send_packet.c enhancement | Medium | 3-5 | Senior |
| recv_packet.c enhancement | Medium | 3-4 | Senior |
| route.c enhancement | Low | 1-2 | Mid-level |
| CLI integration | Low | 2-3 | Mid-level |
| Testing & documentation | Medium | 5-7 | Senior |
| **TOTAL** | | **24-36 days** | 1-2 developers |

**Estimated Calendar Time:** 5-7 weeks with 1 senior + 1 mid-level developer

---

### 9.2 Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| L2 send compatibility issues | Medium | High | Extensive testing, L3 fallback |
| Hash table collisions | Low | Medium | Proper hash function, large table size |
| IPC serialization bugs | Low | High | Thorough unit testing |
| ARP timeout tuning | Medium | Low | Make configurable, document best practices |
| Regression in non-ARP scans | Low | High | Comprehensive regression testing |

---

## 10. Architecture Decision Records

### ADR-001: Use Hash Table for Live Host Storage

**Context:** Need O(1) lookup for IP → MAC mapping during TCP/UDP scan phase.

**Decision:** Implement custom hash table with FNV-1a hashing.

**Alternatives Considered:**
1. Kernel ARP cache manipulation (arp -s) - Rejected: requires root, not portable
2. Linear search - Rejected: O(n) lookup too slow for large subnets
3. Binary tree - Rejected: O(log n) not as fast as hash table
4. Existing library (e.g., uthash) - Rejected: avoid external dependency

**Consequences:**
- Fast O(1) average-case lookup
- Simple to implement and test
- No external dependencies

---

### ADR-002: L2 Bypass for TCP/UDP with Cached MAC

**Context:** Need to avoid kernel ARP blocking during TCP/UDP scan phase.

**Decision:** Send TCP/UDP packets directly via L2 (eth_send) with cached MAC addresses.

**Alternatives Considered:**
1. Manually populate kernel ARP cache - Rejected: requires root, system() calls
2. Use LD_PRELOAD to override kernel ARP - Rejected: too complex, fragile
3. Continue using ip_send() and accept blocking - Rejected: doesn't solve problem

**Consequences:**
- Completely bypasses kernel ARP resolution
- Requires building full Ethernet frame (minor complexity increase)
- Already supported by existing eth_send() infrastructure
- Falls back to L3 if MAC not cached

---

### ADR-003: IPC Serialization for Live Host Table

**Context:** Need to transfer live host table from receiver to main process.

**Decision:** Use simple binary serialization with magic header and length-prefixed entries.

**Alternatives Considered:**
1. Shared memory - Rejected: more complex, requires cleanup
2. JSON serialization - Rejected: too slow, overkill for simple data
3. Individual IPC messages per host - Rejected: too many messages, slow

**Consequences:**
- Single message transfer, fast
- Simple serialization format, easy to debug
- Fixed overhead per transfer (~4KB for 254 hosts)

---

## 11. Future Enhancements

### 11.1 IPv6 Support

Extend ARP discovery to Neighbor Discovery Protocol (NDP) for IPv6:
- ICMPv6 Neighbor Solicitation instead of ARP requests
- ICMPv6 Neighbor Advertisement instead of ARP replies
- 128-bit IP addresses, same MAC caching approach

**Complexity:** Medium (4-6 days)

---

### 11.2 Persistent MAC Cache

Cache discovered MAC addresses to disk for faster subsequent scans:
- ~/.unicorn/mac_cache.db (SQLite or flat file)
- TTL-based expiration (e.g., 24 hours)
- Skip ARP discovery if recent cache hit

**Complexity:** Low-Medium (3-5 days)

---

### 11.3 Incremental ARP Discovery

Instead of full subnet sweep, only ARP targets that failed L3 send:
- Try L3 send first (fast if host recently communicated)
- On ARP timeout, add to "ARP needed" list
- Batch ARP requests for failed hosts only

**Complexity:** Medium (5-7 days)

---

### 11.4 ARP Reply Fingerprinting

Extract OS fingerprint data from ARP replies:
- Ethernet padding patterns
- ARP packet size variations
- Timing analysis

**Complexity:** High (10-15 days)

---

## 12. Conclusion

This architecture provides a clean, efficient solution to the kernel ARP blocking problem by implementing a two-phase scanning approach:

1. **Phase 1 (ARP Discovery):** Fast, non-blocking ARP sweep collects live hosts and MAC addresses
2. **Phase 2 (TCP/UDP Scan):** Only scan live hosts, using cached MACs to bypass kernel ARP

**Key Benefits:**
- **95% faster** scans for sparse subnets (1-10% live hosts)
- **No kernel blocking** - all ARP done via L2 eth_send()
- **Minimal code changes** - ~2,300 lines across 13 files
- **Backward compatible** - can be disabled via --arp-discovery=off
- **Auto-configuration** - intelligently enables for local subnet scans

**Implementation Roadmap:**
- Week 1: Core infrastructure (hash table)
- Week 2: ARP discovery module
- Week 3: Workunit filtering and L2 send
- Week 4: CLI integration
- Week 5: Testing and optimization

**Total Effort:** 5-7 weeks with 1-2 developers

This design leverages unicornscan's existing architecture (IPC, workunits, send/recv processes) while adding minimal new complexity. The result is a significant performance improvement for the common case (scanning sparse subnets) with negligible overhead for dense subnets.

---

**Next Steps:**
1. Review this architecture document with stakeholders
2. Prioritize implementation phases
3. Begin Week 1 development (live_host_table)
4. Set up CI/CD for automated testing
5. Create detailed implementation tasks in project tracker

---

**Document History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-22 | System Architecture Designer | Initial architecture design |

