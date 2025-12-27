# Unicornscan Workunit and Phase Execution Architecture Analysis

**Author**: Code Quality Analyzer
**Date**: 2025-12-23
**Purpose**: Document exact execution flow for implementing ARP->TCP phase filtering

---

## Executive Summary

This document traces the complete execution flow from user command to results display, with focus on understanding how to insert phase filtering between ARP and TCP scans. The architecture uses a master/sender/listener multi-process model with IPC-based workunit dispatch.

---

## 1. Workunit Lifecycle

### 1.1 Workunit Magic Constants (`src/scan_progs/workunits.h:22-34`)

```c
#define  TCP_SEND_MAGIC 0x1a1b1c1d
#define  UDP_SEND_MAGIC 0x2a2b2c2d
#define  ARP_SEND_MAGIC 0x3a3b3c3d
#define ICMP_SEND_MAGIC 0x4a4b4c4d
#define   IP_SEND_MAGIC 0x5a5b5c5d

#define  TCP_RECV_MAGIC 0xa1b1c1d1
#define  UDP_RECV_MAGIC 0xa2b2c2d2
#define  ARP_RECV_MAGIC 0xa3b3c4d3
#define ICMP_RECV_MAGIC 0xa4b4c4d4
```

**Key Insight**: Magic constants determine packet handling throughout the stack. ARP uses different magic (0x3a3b3c3d) than TCP (0x1a1b1c1d), enabling phase discrimination.

### 1.2 Workunit Creation (`src/scan_progs/workunits.c:137-443`)

**Function**: `workunit_add(const char *targets, char **estr)`

**Flow**:
1. **Parse target specification** (lines 182-208):
   - Format: `192.168.1.0/24:mTCP,80,443` or `192.168.1.0/24:mARP`
   - Extract mode string, port list, network/mask

2. **Determine scan mode** (lines 227-255, 292-321):
   ```c
   switch (mode) {
       case MODE_TCPSCAN:
           lwu_srch.magic = TCP_RECV_MAGIC;
           send_magic = TCP_SEND_MAGIC;
           break;
       case MODE_ARPSCAN:
           lwu_srch.magic = ARP_RECV_MAGIC;
           send_magic = ARP_SEND_MAGIC;
           break;
   }
   ```

3. **Create send workunit** (lines 394-434):
   - Allocate `send_workunit_t` + port_str_len
   - Set magic, target, mask, options
   - Copy to `s->swu` FIFO queue

4. **Create recv workunit** (lines 333-369):
   - Allocate `recv_workunit_t` + pcap_filter_len
   - Set magic, timeout, pcap filter
   - Copy to `s->lwu` FIFO queue

**Critical**: Both send and recv workunits are created together with matching magic constants.

### 1.3 Workunit Data Structures

```c
// src/scan_progs/workunits.h:44-73
typedef struct send_workunit_t {
    uint32_t magic;                     // TCP_SEND_MAGIC or ARP_SEND_MAGIC
    struct sockaddr_storage target;     // Network to scan
    struct sockaddr_storage targetmask; // CIDR mask
    uint16_t port_str_len;              // Length of port list (0 for ARP)
    // ... followed by port string for TCP/UDP
} send_workunit_t;

// src/scan_progs/workunits.h:75-86
typedef struct recv_workunit_t {
    uint32_t magic;                     // TCP_RECV_MAGIC or ARP_RECV_MAGIC
    uint8_t recv_timeout;               // Timeout after last packet
    struct sockaddr_storage listen_addr; // Phantom IP or real IP
    struct sockaddr_storage listen_mask; // Netmask for filtering
    uint16_t pcap_len;                  // BPF filter length
    // ... followed by pcap filter string
} recv_workunit_t;
```

### 1.4 Workunit Queues

**Global state** (`src/main.c:49`, `src/scan_progs/workunits.c:52-58`):
```c
settings_t *s;  // Global settings structure

// Inside workunit_init():
s->swu = fifo_init();  // Send workunit queue
s->lwu = fifo_init();  // Listen workunit queue
s->scan_iter = 0;      // Scan iteration counter
```

**Key Functions**:
- `workunit_get_sp(size_t *wk_len, uint32_t *wid)` - Pop send workunit (line 477)
- `workunit_get_lp(size_t *wk_len, uint32_t *wid)` - Pop listen workunit (line 445)

---

## 2. Multi-Process Coordination

### 2.1 Process Spawning (`src/main.c:53-264`)

**Main Process Flow**:

```c
int main(int argc, char **argv) {
    // 1. Initialize settings and modules (lines 60-92)
    s = xmalloc(sizeof(settings_t));
    workunit_init();

    // 2. Parse arguments and create workunits (lines 90-95)
    getconfig_argv(argc, argv);
    do_targets();  // Calls workunit_add() for each target

    // 3. Fork sender/listener processes (lines 190-208)
    if (s->forklocal) {
        chld_init();
        signals_children();
        chld_fork();  // Spawns unisend + unilisten
        chld_waitsync();
    }

    // 4. Run master orchestration loop (lines 235-239)
    for (s->cur_iter = 1; s->cur_iter <= s->scan_iter; s->cur_iter++) {
        workunit_reset();
        run_scan();  // Master dispatch loop
    }
}
```

**Process Structure**:
```
┌──────────────┐
│   unicornscan│ (main process - MASTER)
│   (master)   │
└──────┬───────┘
       │
       ├─── IPC ───┐
       │           │
┌──────▼──────┐ ┌─▼───────────┐
│  unisend    │ │  unilisten  │
│  (sender)   │ │  (listener) │
└─────────────┘ └─────────────┘
```

### 2.2 IPC Mechanism

**Message Types** (from `unilib/xipc.h` - referenced in code):
```c
#define MSG_IDENT       // Request identification
#define MSG_IDENTSENDER // I am a sender
#define MSG_IDENTLISTENER // I am a listener
#define MSG_READY       // Ready for work
#define MSG_WORKUNIT    // Here's a workunit
#define MSG_WORKDONE    // Finished workunit
#define MSG_OUTPUT      // Scan results (listener→master)
#define MSG_TERMINATE   // Shut down
```

**Connection Sequence** (`src/scan_progs/send_packet.c:299-357`):
1. Sender/listener binds to IPC URI
2. Master connects to sender/listener
3. Master sends `MSG_IDENT`
4. Sender replies with `MSG_IDENTSENDER` + version
5. Master sends `MSG_ACK`
6. Sender sends `MSG_READY`

---

## 3. Execution Loop - Master State Machine

### 3.1 Master States (`src/scan_progs/master.c:50-56`)

```c
#define MASTER_START                    0  // Initial state
#define MASTER_SENT_LISTEN_WORKUNITS    1  // Sent to listener
#define MASTER_SENT_SENDER_WORKUNITS    2  // Sent to sender
#define MASTER_WAIT_SENDER              3  // Waiting for sender completion
#define MASTER_IN_TIMEOUT               4  // Recv timeout period
#define MASTER_DONE                     5  // Scan complete

static int master_state = 0;
```

### 3.2 Master Loop (`src/scan_progs/master.c:228-318`)

```c
void run_scan(void) {
    // State machine loop
    for (master_state = MASTER_START; (s->senders + s->listeners) > 0; ) {

        // DISPATCH PHASE: Send workunits
        if (master_state == MASTER_SENT_LISTEN_WORKUNITS ||
            master_state == MASTER_START) {
            int w_sent = dispatch_work_units();  // Line 253

            if (w_sent == 0 && master_state == MASTER_SENT_SENDER_WORKUNITS) {
                master_updatestate(MASTER_WAIT_SENDER);  // Line 260
            }
        }

        // POLL PHASE: Check for responses
        readable = drone_poll(s->master_tickrate);  // Line 265
        if (readable) {
            master_read_drones();  // Line 267 - Reads MSG_OUTPUT
        }

        // COMPLETION CHECK
        if (master_state == MASTER_WAIT_SENDER && senders_done()) {
            time(&wait_stime);
            master_updatestate(MASTER_IN_TIMEOUT);  // Line 272
        }

        // TIMEOUT PHASE: Wait for straggler responses
        if (master_state == MASTER_IN_TIMEOUT) {
            time(&tnow);
            if ((tnow - wait_stime) > s->ss->recv_timeout) {
                master_updatestate(MASTER_DONE);  // Line 291
                break;
            }
        }
    }
}
```

### 3.3 Workunit Dispatch (`src/scan_progs/master.c:588-723`)

```c
static int dispatch_work_units(void) {
    // State 0→1: Send LISTEN workunits first
    if (master_state == MASTER_START && c->type == DRONE_TYPE_LISTENER) {
        w_k.l = workunit_get_lp(&wk_len, &wid);  // Line 637

        if (w_k.l != NULL) {
            send_message(c->s, MSG_WORKUNIT, MSG_STATUS_OK, w_k.cr, wk_len);
            get_singlemessage(c->s, &msg_type, &status, &ptr, &msg_len);  // Wait for MSG_READY
            c->wid = wid;
            c->status = DRONE_STATUS_WORKING;
        } else {
            master_updatestate(MASTER_SENT_LISTEN_WORKUNITS);  // Line 681
            workunit_stir_sp();  // Prepare send workunits
            usleep(10000);  // Critical: Let listener start pcap_dispatch
        }
    }

    // State 1→2: Send SENDER workunits
    else if (master_state == MASTER_SENT_LISTEN_WORKUNITS &&
             c->type == DRONE_TYPE_SENDER) {
        w_k.s = workunit_get_sp(&wk_len, &wid);  // Line 697

        if (w_k.s != NULL) {
            send_message(c->s, MSG_WORKUNIT, MSG_STATUS_OK, w_k.cr, wk_len);
            c->wid = wid;
            c->status = DRONE_STATUS_WORKING;
        } else {
            master_updatestate(MASTER_SENT_SENDER_WORKUNITS);  // Line 717
        }
    }
}
```

**Critical Race Fix** (line 684-690):
```c
// Give listener subprocess time to enter its pcap_dispatch/xpoll loop.
// Without this delay, early packets from the sender may be missed
// because the listener hasn't started capturing yet (race condition).
// 10ms is sufficient for the listener to transition from sending
// MSG_READY to being in its main capture loop.
usleep(10000);
```

---

## 4. Sender Execution Loop

### 4.1 Sender Main Loop (`src/scan_progs/send_packet.c:264-662`)

```c
void send_packet(void) {
    // 1. Connect to master via IPC (lines 299-357)
    sl.c_socket = socktrans_accept(s_socket, DEF_SOCK_TIMEOUT);
    send_message(sl.c_socket, MSG_IDENTSENDER, MSG_STATUS_OK, ...);
    send_message(sl.c_socket, MSG_READY, MSG_STATUS_OK, ...);

    // 2. Workunit receive loop
    while (worktodo) {
        recv_messages(sl.c_socket);

        while (get_message(sl.c_socket, &msg_type, &status, &(wk_u.cr), &msg_len) > 0) {
            if (msg_type == MSG_QUIT) break;
            if (msg_type != MSG_WORKUNIT) continue;

            // 3. Decode workunit magic
            if (*wk_u.magic == TCP_SEND_MAGIC) {
                open_link(SOCK_IP, &s->ss->target, &s->ss->targetmask);  // Line 485
                s->ss->mode = MODE_TCPSCAN;
            }
            else if (*wk_u.magic == ARP_SEND_MAGIC) {
                open_link(SOCK_LL, &s->ss->target, &s->ss->targetmask);  // Line 501
                s->ss->mode = MODE_ARPSCAN;
            }

            // 4. Build nested loop structure (lines 577-623)
            destroy_loop_logic();

            // For TCP/UDP: repeats → ports → ttl → payload → hosts
            add_loop_logic(&init_nextround, &cmp_nextround, &inc_nextround);
            add_loop_logic(&init_nextport, &cmp_nextport, &inc_nextport);
            add_loop_logic(&init_nextttl, &cmp_nextttl, &inc_nextttl);
            add_loop_logic(&init_nexthost, &cmp_nexthost, &inc_nexthost);

            // For ARP: repeats → hosts
            add_loop_logic(&init_nextround, &cmp_nextround, &inc_nextround);
            add_loop_logic(&init_nexthost, &cmp_nexthost, &inc_nexthost);

            // 5. Execute loop_list() → calls _send_packet() for each combination
            loop_list(flhead);  // Line 628

            // 6. Report completion
            send_message(sl.c_socket, MSG_WORKDONE, MSG_STATUS_OK, &send_stats, ...);
        }
    }
}
```

### 4.2 Socket Mode Switch (`src/scan_progs/send_packet.c:1147-1196`)

```c
static void open_link(int mode, struct sockaddr_storage *target,
                     struct sockaddr_storage *targetmask) {
    // Close previous socket if mode changed
    if (sl.sockmode != mode) {
        switch (sl.sockmode) {
            case SOCK_LL:
                eth_close(sl.s_u.llsock);  // Close link layer
                break;
            case SOCK_IP:
                ip_close(sl.s_u.ipsock);   // Close network layer
                break;
        }
    }

    sl.sockmode = mode;

    switch (mode) {
        case SOCK_IP:  // TCP/UDP/ICMP
            sl.s_u.ipsock = ip_open();
            break;

        case SOCK_LL:  // ARP
            sl.s_u.llsock = eth_open(s->interface_str);
            break;
    }
}
```

**Key Insight**: Mode is determined by workunit magic. ARP workunits trigger `SOCK_LL` (ethernet), TCP/UDP trigger `SOCK_IP` (raw IP).

### 4.3 Packet Building (`src/scan_progs/send_packet.c:664-980`)

```c
static void _send_packet(void) {
    makepkt_clear();

    if (s->ss->mode == MODE_TCPSCAN || s->ss->mode == MODE_UDPSCAN) {
        // Build IP header
        makepkt_build_ipv4(s->ss->tos, ipid, ip_off, sl.curttl, proto, ...);

        // Build TCP/UDP header
        if (s->ss->mode == MODE_TCPSCAN) {
            TCPHASHTRACK(seq, target, rport, local_port, s->ss->syn_key);
            makepkt_build_tcp(local_port, rport, chksum, seq, ...);
        } else {
            makepkt_build_udp(local_port, rport, chksum, payload, payload_size);
        }

        // Send via IP socket
        ip_send(sl.s_u.ipsock, pbuf, buf_size);
    }
    else if (s->ss->mode == MODE_ARPSCAN) {
        // Build Ethernet header
        makepkt_build_ethernet(6, ethbk_dst, sl.esrc, ETHERTYPE_ARP);

        // Build ARP header
        makepkt_build_arp(ARPHRD_ETHER, ETHERTYPE_IP, 6, 4, ARPOP_REQUEST,
                         sl.esrc, myaddr, arpbk_target, target);

        // Send via link layer socket
        eth_send(sl.s_u.llsock, pbuf, buf_size);
    }

    sl.packets_sent++;
    end_tslot();  // Rate limiting
}
```

---

## 5. Listener Execution Loop

### 5.1 Listener Main Loop (`src/scan_progs/recv_packet.c:84-685`)

```c
void recv_packet(void) {
    // 1. Connect to master
    lc_s = socktrans_accept(s_socket, DEF_SOCK_TIMEOUT);
    send_message(lc_s, MSG_IDENTLISTENER, MSG_STATUS_OK, ...);

    // 2. Receive workunit with BPF filter
    recv_messages(lc_s);
    get_message(lc_s, &msg_type, &status, &(wk_u.cr), &msg_len);

    // 3. Open pcap handle
    if (*wk_u.magic == TCP_RECV_MAGIC || *wk_u.magic == UDP_RECV_MAGIC) {
        // Network layer capture (IP packets)
        pdev = pcap_open_live(s->interface_str, s->ss->snaplen, 1, 0, errbuf);
    }
    else if (*wk_u.magic == ARP_RECV_MAGIC) {
        // Link layer capture (ethernet frames)
        pdev = pcap_open_live(s->interface_str, s->ss->snaplen, 1, 0, errbuf);
    }

    // 4. Set BPF filter from workunit
    pcap_compile(pdev, &filter, wk_u.l->pcap_filter, 1, 0);
    pcap_setfilter(pdev, &filter);

    // 5. Signal ready
    send_message(lc_s, MSG_READY, MSG_STATUS_OK, listener_info, ...);

    // 6. Capture loop
    gettimeofday(&start_time, NULL);
    while (!done) {
        // Dispatch packets to parse_packet()
        pcap_dispatch(pdev, 10, parse_packet, NULL);  // Line 463

        // Check for timeout
        gettimeofday(&tnow, NULL);
        if ((tnow.tv_sec - start_time.tv_sec) > wk_u.l->recv_timeout) {
            done = 1;
        }

        // Check for MSG_TERMINATE from master
        if (xpoll(&spdf, 1, 0) > 0 && spdf.rw & XPOLL_READABLE) {
            recv_messages(lc_s);
            get_message(lc_s, &msg_type, &status, &tmpptr, &msg_len);
            if (msg_type == MSG_TERMINATE) done = 1;
        }
    }

    // 7. Send statistics
    send_message(lc_s, MSG_WORKDONE, MSG_STATUS_OK, &recv_stats, ...);
}
```

### 5.2 Packet Parsing Callback (`src/scan_progs/recv_packet.c` - parse_packet)

```c
void parse_packet(u_char *user, const struct pcap_pkthdr *ph, const u_char *packet) {
    // Extract IP/ARP header
    // Match against sent packets
    // Build ip_report_t or arp_report_t

    if (matched) {
        // Send report to master via MSG_OUTPUT
        send_message(lc_s, MSG_OUTPUT, MSG_STATUS_OK, report_ptr, report_len);
    }
}
```

### 5.3 Result Flow Back to Master

**Path**: `listener:parse_packet()` → `MSG_OUTPUT` → `master:master_read_drones()` → `master:deal_with_output()` → `report_add()`

**Master Processing** (`src/scan_progs/master.c:434-440`):
```c
if (msg_type == MSG_OUTPUT && c->type == DRONE_TYPE_LISTENER) {
    if (deal_with_output(d_u.p, msg_len) < 0) {
        ERR("cant deal with output from drone");
        drone_updatestate(c, DRONE_STATUS_DEAD);
    }
}
```

**Report Storage** (`src/scan_progs/master.c:459-520`):
```c
int deal_with_output(void *msg, size_t msg_len) {
    if (*r_u.magic == IP_REPORT_MAGIC) {
        // TCP/UDP/ICMP response
        r_u.i->od_q = fifo_init();
        push_jit_report_modules(r_u.ptr);
        report_add(r_u.ptr, msg_len);
    }
    else if (*r_u.magic == ARP_REPORT_MAGIC) {
        // ARP response
        r_u.a->od_q = fifo_init();
        push_jit_report_modules(r_u.ptr);
        report_add(r_u.ptr, msg_len);
    }
}
```

---

## 6. Complete Execution Flow

### 6.1 User Command: `unicornscan 192.168.1.0/24`

```
┌─────────────────────────────────────────────────────────────┐
│ 1. INITIALIZATION (main.c:53-92)                            │
├─────────────────────────────────────────────────────────────┤
│ • Parse arguments                                           │
│ • Initialize settings structure                             │
│ • workunit_init() - Create s->swu, s->lwu queues           │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│ 2. TARGET PARSING (main.c:95, workunits.c:137-443)         │
├─────────────────────────────────────────────────────────────┤
│ do_targets():                                               │
│   for each target specification:                           │
│     workunit_add("192.168.1.0/24:mTCP,80,443")            │
│       → Create send_workunit_t (magic=TCP_SEND_MAGIC)      │
│       → Create recv_workunit_t (magic=TCP_RECV_MAGIC)      │
│       → Push to s->swu and s->lwu queues                   │
│                                                             │
│ Result: Workunits queued, s->scan_iter set                 │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│ 3. PROCESS FORKING (main.c:190-208)                        │
├─────────────────────────────────────────────────────────────┤
│ if (s->forklocal):                                          │
│   chld_fork():                                              │
│     fork() → unisend (sender process)                       │
│     fork() → unilisten (listener process)                   │
│                                                             │
│ Process tree:                                               │
│   unicornscan (MASTER)                                      │
│   ├─── unisend (SENDER)                                     │
│   └─── unilisten (LISTENER)                                 │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│ 4. IPC CONNECTION HANDSHAKE                                 │
├─────────────────────────────────────────────────────────────┤
│ Sender (send_packet.c:299-357):                            │
│   bind(ipc_uri) → accept() → recv(MSG_IDENT)               │
│   → send(MSG_IDENTSENDER) → recv(MSG_ACK)                  │
│   → send(MSG_READY)                                         │
│                                                             │
│ Listener (recv_packet.c similar flow):                     │
│   bind(ipc_uri) → accept() → recv(MSG_IDENT)               │
│   → send(MSG_IDENTLISTENER) → recv(MSG_ACK)                │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│ 5. MASTER ORCHESTRATION LOOP (master.c:228-318)            │
├─────────────────────────────────────────────────────────────┤
│ for (s->cur_iter=1; cur_iter <= scan_iter; cur_iter++):    │
│   run_scan():                                               │
│                                                             │
│   STATE 0 (MASTER_START):                                  │
│   ┌───────────────────────────────────────────┐            │
│   │ dispatch_work_units():                    │            │
│   │   workunit_get_lp() → recv_workunit_t     │            │
│   │   send(LISTENER, MSG_WORKUNIT, recv_wu)   │            │
│   │   wait for MSG_READY from listener        │            │
│   │   master_state → SENT_LISTEN_WORKUNITS    │            │
│   │   usleep(10000)  ← CRITICAL RACE FIX      │            │
│   └───────────────────────────────────────────┘            │
│                                                             │
│   STATE 1 (MASTER_SENT_LISTEN_WORKUNITS):                  │
│   ┌───────────────────────────────────────────┐            │
│   │ dispatch_work_units():                    │            │
│   │   workunit_get_sp() → send_workunit_t     │            │
│   │   send(SENDER, MSG_WORKUNIT, send_wu)     │            │
│   │   master_state → SENT_SENDER_WORKUNITS    │            │
│   └───────────────────────────────────────────┘            │
│                                                             │
│   STATE 2 (MASTER_SENT_SENDER_WORKUNITS):                  │
│   ┌───────────────────────────────────────────┐            │
│   │ No more workunits to send                 │            │
│   │ master_state → WAIT_SENDER                │            │
│   └───────────────────────────────────────────┘            │
│                                                             │
│   POLLING LOOP:                                             │
│   ┌───────────────────────────────────────────┐            │
│   │ while (state < DONE):                     │            │
│   │   drone_poll() - Wait for socket activity │            │
│   │   if (readable):                          │            │
│   │     master_read_drones():                 │            │
│   │       recv(MSG_OUTPUT) → deal_with_output()│           │
│   │       recv(MSG_WORKDONE) → state++        │            │
│   └───────────────────────────────────────────┘            │
│                                                             │
│   STATE 3→4 (WAIT_SENDER → IN_TIMEOUT):                    │
│   ┌───────────────────────────────────────────┐            │
│   │ if (senders_done()):                      │            │
│   │   time(&wait_stime)                       │            │
│   │   master_state → IN_TIMEOUT               │            │
│   │                                            │            │
│   │ while (time_elapsed < recv_timeout):      │            │
│   │   continue polling for stragglers         │            │
│   │                                            │            │
│   │ master_state → DONE                       │            │
│   └───────────────────────────────────────────┘            │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ├──────────────────────┐
                             │                      │
┌────────────────────────────▼─────┐  ┌─────────────▼──────────────────┐
│ 6. SENDER EXECUTION              │  │ 7. LISTENER EXECUTION           │
│    (send_packet.c:264-662)       │  │    (recv_packet.c:84-685)       │
├──────────────────────────────────┤  ├─────────────────────────────────┤
│ recv(MSG_WORKUNIT):              │  │ recv(MSG_WORKUNIT):             │
│   wk_u.s = (send_workunit_t*)msg │  │   wk_u.l = (recv_workunit_t*)msg│
│                                  │  │                                 │
│ Switch on magic:                 │  │ Switch on magic:                │
│   TCP_SEND_MAGIC:                │  │   TCP_RECV_MAGIC:               │
│     open_link(SOCK_IP)           │  │     pdev = pcap_open_live()     │
│     s->ss->mode = MODE_TCPSCAN   │  │     pcap_setfilter(tcp_filter)  │
│   ARP_SEND_MAGIC:                │  │   ARP_RECV_MAGIC:               │
│     open_link(SOCK_LL)           │  │     pdev = pcap_open_live()     │
│     s->ss->mode = MODE_ARPSCAN   │  │     pcap_setfilter(arp_filter)  │
│                                  │  │                                 │
│ Build loop structure:            │  │ send(MSG_READY)                 │
│   For TCP: repeats→ports→ttl→host│  │                                 │
│   For ARP: repeats→hosts         │  │ Capture loop:                   │
│                                  │  │   while (!done):                │
│ loop_list(flhead):               │  │     pcap_dispatch(pdev, 10,     │
│   for each host:                 │  │       parse_packet, NULL)       │
│     _send_packet():              │  │                                 │
│       makepkt_build_ipv4(...)    │  │     // In parse_packet():       │
│       makepkt_build_tcp(...)     │  │     if (packet_matches):        │
│       ip_send(ipsock, buf)       │  │       build ip_report_t         │
│       OR                         │  │       send(master, MSG_OUTPUT,  │
│       makepkt_build_ethernet(...)│  │            report, report_len)  │
│       makepkt_build_arp(...)     │  │                                 │
│       eth_send(llsock, buf)      │  │     xpoll(master_socket, 0)     │
│       end_tslot() // Rate limit  │  │     if (MSG_TERMINATE): break   │
│                                  │  │                                 │
│ send(MSG_WORKDONE, &send_stats)  │  │ send(MSG_WORKDONE, &recv_stats) │
└──────────────────────────────────┘  └─────────────────────────────────┘
                             │                      │
                             └──────────┬───────────┘
                                        │
┌───────────────────────────────────────▼────────────────────┐
│ 8. RESULT AGGREGATION (master.c:459-520, report.c)        │
├────────────────────────────────────────────────────────────┤
│ master_read_drones():                                      │
│   for each drone:                                          │
│     if (MSG_OUTPUT received):                              │
│       deal_with_output(msg, msg_len):                      │
│         if (IP_REPORT_MAGIC):                              │
│           push_jit_report_modules(ip_report)               │
│           report_add(ip_report)                            │
│         if (ARP_REPORT_MAGIC):                             │
│           push_jit_report_modules(arp_report)              │
│           report_add(arp_report)                           │
└────────────────────────────────┬───────────────────────────┘
                                 │
┌────────────────────────────────▼───────────────────────────┐
│ 9. DISPLAY RESULTS (main.c:241-242, report.c)             │
├────────────────────────────────────────────────────────────┤
│ report_do():                                               │
│   Sort and format aggregated reports                       │
│   Print to stdout                                          │
│                                                            │
│ Output format:                                             │
│   TCP open     192.168.1.100:80   from 10.0.0.1:12345     │
│   TCP open     192.168.1.100:443  from 10.0.0.1:12346     │
│   ARP reply    192.168.1.100      00:11:22:33:44:55       │
└────────────────────────────────────────────────────────────┘
```

---

## 7. ARP vs TCP Mode Differences

### 7.1 Socket Layer Selection

| Mode | Magic Constant | Socket Type | Library Function | Layer |
|------|----------------|-------------|------------------|-------|
| ARP  | `ARP_SEND_MAGIC` (0x3a3b3c3d) | `SOCK_LL` | `eth_open()`, `eth_send()` | Link (L2) |
| TCP  | `TCP_SEND_MAGIC` (0x1a1b1c1d) | `SOCK_IP` | `ip_open()`, `ip_send()` | Network (L3) |

**Mode Switch Location**: `src/scan_progs/send_packet.c:483-510`

```c
if (*wk_u.magic == TCP_SEND_MAGIC) {
    open_link(SOCK_IP, &s->ss->target, &s->ss->targetmask);
    s->ss->mode = MODE_TCPSCAN;
}
else if (*wk_u.magic == ARP_SEND_MAGIC) {
    open_link(SOCK_LL, &s->ss->target, &s->ss->targetmask);
    s->ss->mode = MODE_ARPSCAN;
}
```

### 7.2 Packet Construction Differences

**ARP Mode** (`send_packet.c:837-908`):
```c
// Build ethernet header (broadcast MAC)
uint8_t ethbk[6] = { 0xff, 0xff, 0xff, 0xff, 0xff, 0xff };
makepkt_build_ethernet(6, ethbk, sl.esrc, ETHERTYPE_ARP);

// Build ARP request
uint8_t arpbk[6] = { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
makepkt_build_arp(ARPHRD_ETHER, ETHERTYPE_IP, 6, 4, ARPOP_REQUEST,
                 sl.esrc,           // Sender MAC
                 &myaddr,           // Sender IP
                 arpbk,             // Target MAC (unknown)
                 &target);          // Target IP

// Send at link layer
eth_send(sl.s_u.llsock, pbuf, buf_size);
```

**TCP Mode** (`send_packet.c:812-886`):
```c
// Build IP header
makepkt_build_ipv4(s->ss->tos, ipid, ip_off, sl.curttl, IPPROTO_TCP,
                  n_chksum, myaddr, target, NULL, 0, NULL, 0);

// Build TCP header with sequence tracking
TCPHASHTRACK(seq, target, rport, local_port, s->ss->syn_key);
makepkt_build_tcp(local_port, rport, t_chksum, seq, 0,
                 s->ss->tcphdrflgs, s->ss->window_size, 0,
                 s->ss->tcpoptions, s->ss->tcpoptions_len,
                 NULL, 0);

// Send at network layer
ip_send(sl.s_u.ipsock, pbuf, buf_size);
```

### 7.3 Loop Structure Differences

**ARP Mode**: Simple iteration over hosts
```c
// add_loop_logic calls (send_packet.c:582-623)
add_loop_logic(&init_nextround, &cmp_nextround, &inc_nextround);  // Repeats
add_loop_logic(&init_nexthost, &cmp_nexthost, &inc_nexthost);    // Hosts

// Effective loop:
for (round = 0; round < s->repeats; round++) {
    for (host in target_network) {
        _send_packet();  // Send ARP request
    }
}
```

**TCP Mode**: Multi-dimensional iteration
```c
// add_loop_logic calls
add_loop_logic(&init_nextround, ...);  // Repeats
add_loop_logic(&init_nextport, ...);   // Ports
add_loop_logic(&init_nextttl, ...);    // TTL values
add_loop_logic(&init_nexthost, ...);   // Hosts

// Effective loop:
for (round = 0; round < s->repeats; round++) {
    for (port in port_list) {
        for (ttl = minttl; ttl <= maxttl; ttl++) {
            for (host in target_network) {
                _send_packet();  // Send TCP SYN
            }
        }
    }
}
```

---

## 8. Phase Filtering Implementation Points

### 8.1 Current Scan Iteration Model

**Single-phase execution** (`src/main.c:235-239`):
```c
for (s->cur_iter = 1; s->cur_iter <= s->scan_iter; s->cur_iter++) {
    workunit_reset();
    run_scan();  // Executes ALL workunits for this iter
}
```

**Current workunit grouping** (`workunits.c:333-383`):
- Workunits grouped by `(magic, recv_opts)` tuple
- `s->scan_iter` incremented when new group created
- All workunits in same group dispatched together

### 8.2 Proposed Phase-Based Filtering

**Goal**: After ARP phase, filter targets based on ARP responses before TCP phase.

**Implementation Strategy**:

#### Option A: Two-Pass Iteration
```c
// Modify main.c run loop
for (s->cur_iter = 1; s->cur_iter <= s->scan_iter; s->cur_iter++) {
    workunit_reset();

    // Pass 1: Execute ARP workunits only
    if (has_arp_workunits(s->cur_iter)) {
        run_scan_phase(MODE_ARPSCAN);  // Only dispatch ARP_*_MAGIC

        // Filter based on ARP responses
        struct arp_response_list *arp_results = get_arp_results();
        filter_tcp_targets(s->cur_iter, arp_results);
    }

    // Pass 2: Execute filtered TCP workunits
    if (has_tcp_workunits(s->cur_iter)) {
        run_scan_phase(MODE_TCPSCAN);  // Only dispatch TCP_*_MAGIC
    }
}
```

#### Option B: Phase-Aware Workunit Dispatch
```c
// Modify dispatch_work_units() to be phase-aware
static int dispatch_work_units(uint8_t phase_filter) {
    for (c = s->dlh->head; c != NULL; c = c->next) {
        if (master_state == MASTER_SENT_LISTEN_WORKUNITS &&
            c->type == DRONE_TYPE_SENDER) {

            w_k.s = workunit_get_sp_filtered(&wk_len, &wid, phase_filter);

            // Only send workunits matching phase_filter magic
            if (w_k.s != NULL && matches_phase(w_k.s->magic, phase_filter)) {
                send_message(c->s, MSG_WORKUNIT, ...);
            }
        }
    }
}
```

#### Option C: Workunit Queue Manipulation
```c
// After ARP phase completes, modify TCP workunits
void filter_tcp_workunits_by_arp(void) {
    struct wk_s *wk = NULL;
    struct arp_response_list *arp_live_hosts = get_arp_responses();

    // Walk s->swu queue
    fifo_walk(s->swu, filter_workunit_callback);
}

void filter_workunit_callback(void *wptr) {
    struct wk_s *w = (struct wk_s *)wptr;

    if (w->s->magic == TCP_SEND_MAGIC) {
        // Check if target in ARP response list
        if (!arp_response_exists(w->s->target, arp_live_hosts)) {
            // Mark workunit for deletion or skip
            w->used = 1;  // Hack: Mark as already sent
        }
    }
}
```

### 8.3 Critical Synchronization Points

**Where phase filtering must occur**:

1. **After ARP completion** (`master.c:270-273`):
   ```c
   if (master_state == MASTER_WAIT_SENDER && senders_done()) {
       // ARP scan complete, results in report queue
       if (current_phase == PHASE_ARP) {
           extract_arp_results();
           filter_tcp_workunits();
       }
       master_updatestate(MASTER_IN_TIMEOUT);
   }
   ```

2. **Before TCP workunit dispatch** (`master.c:693-718`):
   ```c
   if (master_state == MASTER_SENT_LISTEN_WORKUNITS &&
       c->type == DRONE_TYPE_SENDER) {

       w_k.s = workunit_get_sp(&wk_len, &wid);

       // Filter TCP workunits here
       if (w_k.s->magic == TCP_SEND_MAGIC &&
           !target_alive_from_arp(w_k.s->target)) {
           workunit_destroy_sp(wid);  // Skip this workunit
           continue;
       }
   }
   ```

3. **ARP result extraction** (new function needed):
   ```c
   struct arp_response_list *extract_arp_results(void) {
       struct arp_response_list *results = NULL;

       // Walk report queue (populated by deal_with_output)
       report_walk(extract_arp_callback, &results);

       return results;
   }
   ```

### 8.4 Data Structures for Filtering

**ARP response tracking**:
```c
typedef struct arp_response_node {
    struct sockaddr_storage ip_addr;    // Responding IP
    uint8_t mac_addr[6];                // Responding MAC
    struct arp_response_node *next;
} arp_response_node_t;

typedef struct arp_response_list {
    arp_response_node_t *head;
    uint32_t count;
    pthread_mutex_t lock;  // If threading needed
} arp_response_list_t;
```

**Workunit filtering state**:
```c
typedef struct phase_filter_state {
    uint8_t current_phase;              // PHASE_ARP or PHASE_TCP
    arp_response_list_t *arp_results;   // Live hosts from ARP
    uint32_t filtered_workunits;        // Count of skipped TCP workunits
} phase_filter_state_t;

// Add to settings_t
struct settings {
    // ... existing fields ...
    phase_filter_state_t *phase_filter;
};
```

---

## 9. Key Files for Phase Filtering Implementation

| File | Functions to Modify | Purpose |
|------|---------------------|---------|
| `src/main.c` | `main()` | Add phase loop logic |
| `src/scan_progs/master.c` | `run_scan()`, `dispatch_work_units()`, `deal_with_output()` | Phase-aware dispatch, result extraction |
| `src/scan_progs/workunits.c` | `workunit_get_sp()`, add filter functions | Workunit filtering |
| `src/scan_progs/report.c` | Add ARP extraction functions | Extract ARP results |
| `src/settings.h` | Add `phase_filter_state_t` | Track phase state |

**New files needed**:
- `src/scan_progs/phase_filter.c` - Phase filtering logic
- `src/scan_progs/phase_filter.h` - Filter structures and prototypes

---

## 10. Summary and Recommendations

### 10.1 Execution Flow Recap

```
User Command
    ↓
Parse Targets → Create Workunits (ARP + TCP)
    ↓
Fork Processes (Master, Sender, Listener)
    ↓
Master State Machine:
    1. Send LISTEN workunits → Listener starts pcap_dispatch
    2. usleep(10ms) - CRITICAL RACE FIX
    3. Send SENDER workunits → Sender executes loop_list
    ↓
Sender: For each workunit:
    - Switch socket mode (SOCK_LL for ARP, SOCK_IP for TCP)
    - Build packets (ethernet+ARP or IP+TCP)
    - Send via eth_send() or ip_send()
    - Rate limit via end_tslot()
    ↓
Listener:
    - pcap_dispatch() captures responses
    - parse_packet() matches to sent packets
    - Send MSG_OUTPUT(report) to master
    ↓
Master:
    - master_read_drones() receives MSG_OUTPUT
    - deal_with_output() stores in report queue
    - Wait for recv_timeout after senders complete
    ↓
Display Results
```

### 10.2 Best Insertion Point for Phase Filtering

**Recommended Approach**: **Option C - Workunit Queue Manipulation**

**Rationale**:
1. **Minimal architectural changes** - No need to modify state machine
2. **Clean separation** - Filter logic isolated in new module
3. **Preserves IPC semantics** - Master/sender/listener protocols unchanged
4. **Easy rollback** - Can be disabled with single flag

**Implementation Plan**:
1. Add `phase_filter.c/h` with ARP result extraction
2. Hook `master.c:deal_with_output()` to collect ARP responses
3. After ARP phase completes, walk `s->swu` and mark TCP workunits for skip
4. Modify `workunit_get_sp()` to skip marked workunits

### 10.3 Critical Timing Considerations

1. **10ms listener startup delay** (`master.c:690`) - Ensure not affected by filtering
2. **recv_timeout window** (`master.c:279`) - Must complete ARP phase before filtering
3. **Workunit ordering** - ARP workunits must be in earlier `scan_iter` than TCP

### 10.4 Testing Strategy

**Validation Points**:
1. Verify ARP-only scan produces correct results
2. Verify TCP-only scan unaffected
3. Verify ARP→TCP filtering reduces TCP packets sent
4. Check edge cases:
   - No ARP responses → Skip all TCP
   - All ARP responses → Send all TCP
   - Partial ARP responses → Filter correctly

**Test Commands**:
```bash
# ARP-only baseline
unicornscan -mA 192.168.1.0/24

# TCP-only baseline
unicornscan -mT 192.168.1.0/24:80,443

# Combined with filtering (after implementation)
unicornscan --arp-filter -mA,T 192.168.1.0/24:80,443
```

---

## 11. Conclusion

This analysis provides a complete map of unicornscan's execution architecture, from command-line parsing through workunit dispatch, packet sending, response capture, and result aggregation. The multi-process coordination via IPC, workunit magic constants, and master state machine are the key control points for implementing phase-based filtering.

**Next Steps**:
1. Review proposed implementation approach
2. Design ARP result extraction API
3. Implement workunit filtering logic
4. Test with controlled network environment

---

**Document Version**: 1.0
**Last Updated**: 2025-12-23
**Related Documents**:
- `parallel-build-race-condition-analysis.md`
- `pcap-sll-header-investigation.md`
- `myiphdr-bitfield-alignment-analysis.md`
