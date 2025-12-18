# Unicornscan IPC and Communication System Analysis

## Executive Summary

This document provides a comprehensive analysis of Unicornscan's inter-process communication (IPC) system used for cluster mode operation. The system enables distributed scanning across multiple nodes using a master-drone architecture with message-based communication over TCP/UNIX sockets.

**Key Findings:**
- Custom binary message protocol with magic header validation
- Socket-based transport supporting both INET and UNIX domains
- Work unit serialization for distributing scan tasks
- FIFO/LIFO queue structures for message and work management
- Poll-based multiplexing for concurrent drone communication
- Buffering and partial message handling for reliable transmission

---

## 1. Architecture Overview

### 1.1 Communication Model

```
┌──────────────┐
│    MASTER    │
│  (Coordinator)│
└──────┬───────┘
       │
       ├─────────────────┬─────────────────┐
       │                 │                 │
       ▼                 ▼                 ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│   SENDER    │   │  LISTENER   │   │   SENDER    │
│   Drone     │   │   Drone     │   │   Drone     │
└─────────────┘   └─────────────┘   └─────────────┘
```

**Components:**
- **Master**: Central coordinator that distributes work units and collects results
- **Sender Drones**: Execute packet transmission tasks
- **Listener Drones**: Capture and analyze responses
- **Relay Drones**: Intermediate nodes for multi-hop communication

### 1.2 Process Roles

From `src/unilib/xipc.h`:
```c
#define IPC_TYPE_MASTER     0
#define IPC_TYPE_LISTENER   1
#define IPC_TYPE_SENDER     2
#define IPC_TYPE_DISPLAY    3
```

---

## 2. Message Protocol (XIPC - Extended IPC)

### 2.1 Message Structure

**Header Format** (`src/unilib/xipc_private.h`):
```c
typedef struct _PACKED_ ipc_msghdr_t {
    uint32_t header;    // Magic: 0xf0f1f2f3 (endian detection)
    uint8_t  type;      // Message type (0-13)
    uint8_t  status;    // Status code (OK/ERROR/UNKNOWN)
    size_t   len;       // Payload length in bytes
} ipc_msghdr_t;

struct _PACKED_ message_s {
    ipc_msghdr_t hdr;
    uint8_t data[IPC_DSIZE - sizeof(ipc_msghdr_t)];
};
```

**Constants:**
```c
#define IPC_MAGIC_HEADER  0xf0f1f2f3
#define IPC_DSIZE         /* Buffer size from settings.h */
#define MAX_MSGS          (IPC_DSIZE / 8)
#define MAX_SLACKSIZE     2048  // Buffer overflow protection
#define MAX_CONNS         /* From settings.h */
```

### 2.2 Message Types

Complete enumeration from `src/unilib/xipc.h`:

| Type | Value | Direction | Purpose |
|------|-------|-----------|---------|
| `MSG_ERROR` | 0 | Any | Error condition |
| `MSG_VERSIONREQ` | 1 | Master→Drone | Request version info |
| `MSG_VERSIONREPL` | 2 | Drone→Master | Version response |
| `MSG_QUIT` | 3 | Master→Drone | Graceful shutdown |
| `MSG_WORKUNIT` | 4 | Master→Drone | Task assignment |
| `MSG_WORKDONE` | 5 | Drone→Master | Task completion |
| `MSG_OUTPUT` | 6 | Listener→Master | Scan results |
| `MSG_READY` | 7 | Drone→Master | Ready for work |
| `MSG_ACK` | 8 | Any | Acknowledgment |
| `MSG_IDENT` | 9 | Master→Drone | Identification request |
| `MSG_IDENTSENDER` | 10 | Sender→Master | Sender identification |
| `MSG_IDENTLISTENER` | 11 | Listener→Master | Listener identification |
| `MSG_NOP` | 12 | Any | No operation |
| `MSG_TERMINATE` | 13 | Master→Listener | Stop listening |

### 2.3 Status Codes

```c
#define MSG_STATUS_OK       0
#define MSG_STATUS_ERROR    1
#define MSG_STATUS_UNKNOWN  2
```

---

## 3. Transport Layer (socktrans.c)

### 3.1 Socket Types

**INET Sockets** (TCP/IP):
```c
// URI Format: "hostname:port"
// Example: "192.168.1.100:7001"
int socktrans_connect(const char *uri);
int socktrans_bind(const char *uri);
```

**UNIX Domain Sockets**:
```c
// URI Format: "unix:/path/to/socket"
// Example: "unix:/tmp/unicornscan.sock"
```

### 3.2 Socket Configuration

From `socktrans.c`:
```c
// Socket options applied
SO_REUSEADDR    // Allow address reuse
SO_RCVBUF       // Set receive buffer to IPC_DSIZE
SO_SNDBUF       // Set send buffer to IPC_DSIZE
TCP_NODELAY     // Disable Nagle (for immediate mode)
```

### 3.3 Connection Management

**Client Connection**:
```c
int socktrans_connect(const char *uri) {
    // 1. Parse URI (inet or unix)
    // 2. Create socket
    // 3. Set socket options
    // 4. Bind local port (for inet)
    // 5. Connect to remote
    // 6. Return socket descriptor
}
```

**Server Accept**:
```c
int socktrans_accept(int bsock, int timeout) {
    // 1. Listen on socket
    // 2. Set SIGALRM timeout handler
    // 3. Accept connection (with EINTR retry)
    // 4. Verify peer credentials (SO_PEERCRED/SELinux)
    // 5. Close listening socket
    // 6. Return client socket
}
```

**Security Features**:
- SELinux context validation (if enabled)
- SO_PEERCRED peer credential checking (Linux)
- Timeout protection for accept operations

---

## 4. Message Passing Implementation

### 4.1 Sending Messages

**Function**: `send_message()` in `src/unilib/xipc.c`

```c
int send_message(int sock, int type, int status,
                 const uint8_t *data, size_t data_len) {
    // 1. Validate parameters
    assert(sock >= 0 && sock < MAX_CONNS);
    assert(data_len <= (IPC_DSIZE - sizeof(ipc_msghdr_t)));
    assert(type >= 0 && type <= 0xFF);
    assert(status >= 0 && status <= 0xFF);

    // 2. Build message header
    struct message_s m;
    m.hdr.header = IPC_MAGIC_HEADER;
    m.hdr.type = type;
    m.hdr.status = status;
    m.hdr.len = data_len;

    // 3. Copy payload
    if (data_len > 0) {
        memcpy(m.data, data, data_len);
    }

    // 4. Write to socket (with EINTR retry)
    ssize_t ret = write(sock, &m, sizeof(ipc_msghdr_t) + data_len);

    // 5. Handle partial writes (logged, not retried)
    return ret;
}
```

**Issues Identified**:
- Partial writes not properly handled (TODO in code)
- Could cause protocol desynchronization
- No retry logic for short writes

### 4.2 Receiving Messages

**Two-Phase Reception**:

**Phase 1**: `recv_messages()` - Bulk read
```c
int recv_messages(int sock) {
    // 1. Reset message pointers
    reset_messages(sock);

    // 2. Allocate read buffer
    msg_buf[sock] = xmalloc(IPC_DSIZE);

    // 3. Restore saved data from previous partial read
    if (save_size[sock] > 0) {
        memcpy(msg_buf[sock], save_buf[sock], save_size[sock]);
    }

    // 4. Read from socket (with EINTR retry)
    readsize[sock] = read(sock,
                          &msg_buf[sock][save_size[sock]],
                          IPC_DSIZE - save_size[sock]);

    // 5. Check for EOF
    if (readsize[sock] == 0) {
        return 0; // Peer closed
    }

    // 6. Validate minimum size
    if (ureadsize[sock] < sizeof(ipc_msghdr_t)) {
        return -1; // Invalid message
    }

    // 7. Parse messages into m_u array
    setup_mptrs(sock);

    return 1;
}
```

**Phase 2**: `get_message()` - Iterate messages
```c
int get_message(int sock, uint8_t *type, uint8_t *status,
                uint8_t **data, size_t *data_len) {
    // 1. Check if more messages available
    if (m_u[sock][m_off[sock]].ptr == NULL) {
        return 0; // No more messages
    }

    // 2. Validate magic header
    if (m_u[sock][m_off[sock]].m->hdr.header != IPC_MAGIC_HEADER) {
        PANIC("wrong magic number");
    }

    // 3. Extract message components
    *type = m_u[sock][m_off[sock]].m->hdr.type;
    *status = m_u[sock][m_off[sock]].m->hdr.status;
    *data = &m_u[sock][m_off[sock]].m->data[0];
    *data_len = m_u[sock][m_off[sock]].m->hdr.len;

    // 4. Advance to next message
    ++m_off[sock];

    return 1;
}
```

### 4.3 Partial Message Handling

**Buffer Management** in `setup_mptrs()`:
```c
static int setup_mptrs(int sock) {
    // Parse all complete messages in buffer
    for (m_off[sock]=0, mptr_off=0; mptr_off < ureadsize[sock]; ) {

        // Check if complete header available
        if (mptr_off + sizeof(ipc_msghdr_t) > ureadsize[sock]) {
            // Save incomplete header for next read
            save_size[sock] = ureadsize[sock] - mptr_off;
            save_buf[sock] = xmalloc(save_size[sock]);
            memcpy(save_buf[sock], &msg_buf[sock][mptr_off], save_size[sock]);
            break;
        }

        // Point to message
        m_u[sock][m_off[sock]].hdr = &msg_buf[sock][mptr_off];

        // Validate magic
        if (m_u[sock][m_off[sock]].m->hdr.header != IPC_MAGIC_HEADER) {
            PANIC("damaged message");
        }

        // Calculate next message offset
        size_t msg_size = m_u[sock][m_off[sock]].m->hdr.len +
                          sizeof(ipc_msghdr_t);

        // Check if complete message available
        if (mptr_off + msg_size > ureadsize[sock]) {
            // Save incomplete message for next read
            save_size[sock] = ureadsize[sock] - mptr_off;
            save_buf[sock] = xmalloc(save_size[sock]);
            memcpy(save_buf[sock], &msg_buf[sock][mptr_off], save_size[sock]);
            m_off[sock]--;
            m_u[sock][m_off[sock]].ptr = NULL;
            break;
        }

        mptr_off += msg_size;
        m_off[sock]++;
    }

    return 1;
}
```

**Key Features**:
- Multiple messages can arrive in single read
- Partial messages saved across read calls
- Magic header validation prevents desynchronization
- MAX_SLACKSIZE (2048) limits saved buffer size

---

## 5. Work Unit Serialization

### 5.1 Work Unit Types

**Send Work Units** (`send_workunit_t`):
```c
typedef struct _PACKED_ send_workunit_t {
    uint32_t magic;              // TCP/UDP/ARP/ICMP/IP_SEND_MAGIC
    uint32_t repeats;            // Packet repetitions
    uint16_t send_opts;          // Send options flags
    uint32_t pps;                // Packets per second
    uint8_t  delay_type;         // Delay distribution type

    // Interface info
    struct sockaddr_storage myaddr;
    struct sockaddr_storage mymask;
    uint8_t hwaddr[6];
    uint16_t mtu;

    // Target info
    struct sockaddr_storage target;
    struct sockaddr_storage targetmask;

    // IP options
    uint8_t  tos;
    uint8_t  minttl;
    uint8_t  maxttl;
    uint16_t ip_off;
    uint16_t fingerprint;
    int32_t  src_port;
    uint8_t  ipoptions[64];
    uint8_t  ipoptions_len;

    // TCP options
    uint16_t tcphdrflgs;
    uint8_t  tcpoptions[64];
    uint8_t  tcpoptions_len;
    uint16_t window_size;
    uint32_t syn_key;

    // Variable-length port string follows
    uint16_t port_str_len;
} send_workunit_t;
```

**Receive Work Units** (`recv_workunit_t`):
```c
typedef struct _PACKED_ recv_workunit_t {
    uint32_t magic;              // TCP/UDP/ARP/ICMP/IP_RECV_MAGIC
    uint8_t  recv_timeout;       // Capture timeout
    uint8_t  ret_layers;         // Protocol layers to return
    uint16_t recv_opts;          // Receive options flags
    uint32_t window_size;        // TCP window size
    uint32_t syn_key;            // SYN cookie key

    // Listener filtering
    struct sockaddr_storage listen_addr;  // Filter address
    struct sockaddr_storage listen_mask;  // Filter netmask

    // Variable-length pcap filter follows
    uint16_t pcap_len;
} recv_workunit_t;
```

**Priority Work Units** (for TCP connect):
```c
typedef struct _PACKED_ send_ipv4_pri_workunit_t {
    uint32_t magic;              // PRI_4SEND_MAGIC
    uint32_t dhost;              // Destination IP
    uint16_t dport;              // Destination port
    uint16_t sport;              // Source port
    uint32_t shost;              // Source IP
    uint32_t flags;              // TCP flags
    uint32_t mseq;               // My sequence number
    uint32_t tseq;               // Target sequence number
    uint32_t t_tstamp;           // Target timestamp
    uint32_t m_tstamp;           // My timestamp
    uint16_t window_size;        // TCP window
    uint16_t doff;               // Data offset
} send_pri_workunit_t;
```

### 5.2 Work Unit Magic Numbers

```c
#define  TCP_SEND_MAGIC  0x1a1b1c1d
#define  UDP_SEND_MAGIC  0x2a2b2c2d
#define  ARP_SEND_MAGIC  0x3a3b3c3d
#define ICMP_SEND_MAGIC  0x4a4b4c4d
#define   IP_SEND_MAGIC  0x5a5b5c5d
#define PRI_4SEND_MAGIC  0x6a6b6c6d
#define PRI_6SEND_MAGIC  0x7a7b7c7d

#define  TCP_RECV_MAGIC  0xa1b1c1d1
#define  UDP_RECV_MAGIC  0xa2b2c2d2
#define  ARP_RECV_MAGIC  0xa3b3c4d3
#define ICMP_RECV_MAGIC  0xa4b4c4d4
#define   IP_RECV_MAGIC  0xa5b5c5d5
```

### 5.3 Work Unit Wrapper

Internal structure for tracking work units:
```c
struct wk_s {
    uint32_t magic;              // WK_MAGIC (0xf4f3f1f2)
    size_t len;                  // Total length
    send_workunit_t *s;          // Send WU pointer
    recv_workunit_t *r;          // Recv WU pointer
    int iter;                    // Scan iteration
    int used;                    // Already dispatched flag
    uint32_t wid;                // Work unit ID
};
```

---

## 6. Queue Structures (qfifo.c)

### 6.1 Queue Implementation

**Generic Queue/FIFO/LIFO**:
```c
typedef struct qnode_t {
    struct qnode_t *last;
    struct qnode_t *next;
    void *bucket;               // Payload pointer
} qnode_t;

typedef enum { pfifo, plifo } personality_t;

typedef struct qfifo_t {
    uint32_t magic;             // QFIFOMAGIC (0xdeafbabe)
    personality_t pers;         // FIFO or LIFO
    qnode_t *top;               // Top of stack/queue
    qnode_t *bottom;            // Bottom of queue
    uint32_t len;               // Number of elements
} qfifo_t;
```

### 6.2 Queue Operations

**Initialization**:
```c
void *fifo_init(void);          // Create FIFO
void *lifo_init(void);          // Create LIFO
void fifo_destroy(void *fifo);  // Free empty queue
```

**Manipulation** (O(1)):
```c
uint32_t fifo_push(void *fifo, void *water);  // Add to top
void *fifo_pop(void *fifo);                   // Remove (FIFO=bottom, LIFO=top)
uint32_t fifo_length(void *fifo);             // Get count
```

**Search** (O(n)):
```c
void *fifo_find(void *fifo, const void *water,
                int (*compare)(const void *, const void *));
uint32_t fifo_delete_first(void *fifo, const void *water,
                            int (*compare)(const void *, const void *),
                            int freedata);
```

**Traversal**:
```c
void fifo_walk(void *fifo, void (*walk_func)(void *));
```

**Sorting**:
```c
uint32_t fifo_order(void *fifo,
                    int (*compare)(const void *, const void *),
                    int direction);  // Radix sort
```

### 6.3 Queue Usage in IPC

**Work Unit Queues**:
```c
s->swu = fifo_init();  // Send work units
s->lwu = fifo_init();  // Listen work units
s->pri_work = fifo_init();  // Priority work
```

**Output Queue**:
```c
r_u.i->od_q = fifo_init();  // Output data queue per report
```

---

## 7. Polling and Multiplexing (xpoll)

### 7.1 Polling Abstraction

**Structure**:
```c
typedef struct xpoll_t {
    int fd;     // File descriptor
    int rw;     // Read/Write status flags
} xpoll_t;

// Status flags
#define XPOLL_READABLE      1  // Data available
#define XPOLL_PRIREADABLE   2  // Priority data
#define XPOLL_DEAD          8  // Connection closed/error
```

### 7.2 Polling Implementation

**Based on poll(2)**:
```c
int xpoll(xpoll_t *array, uint32_t len, int timeout) {
    struct pollfd pdf[MAX_CONNS];

    // Setup poll structures
    for (j=0; j < len; j++) {
        pdf[j].fd = array[j].fd;
        pdf[j].events = POLLIN | POLLPRI;
        pdf[j].revents = 0;
        array[j].rw = 0;
    }

    // Poll with EINTR retry
repoll:
    if ((ret = poll(&pdf[0], len, timeout)) < 0) {
        if (errno == EINTR) goto repoll;
        return -1;
    }

    // Process results
    for (j=0; j < len; j++) {
        if (pdf[j].revents & (POLLHUP|POLLERR|POLLNVAL)) {
            array[j].rw |= XPOLL_DEAD;
        }
        if (pdf[j].revents & POLLIN) {
            array[j].rw |= XPOLL_READABLE;
        }
        if (pdf[j].revents & POLLPRI) {
            array[j].rw |= XPOLL_PRIREADABLE;
        }
    }

    return ret;
}
```

**Future Extensions** (from comments):
- epoll support for large-scale connections
- Real-time I/O wrappers
- Dynamic array sizing (currently bounded by MAX_CONNS)

### 7.3 Drone Polling

**Master polls all drones**:
```c
int drone_poll(int timeout) {
    xpoll_t p[MAX_CONNS];
    drone_t *d;
    uint32_t d_offset = 0;

    // Build poll array from drone list
    for (d = s->dlh->head; d != NULL; d = d->next, d_offset++) {
        p[d_offset].fd = d->s;
    }

    // Poll all sockets
    if (xpoll(&p[0], d_offset, timeout) < 0) {
        return -1;
    }

    // Update drone status
    for (d = s->dlh->head, d_offset = 0; d != NULL;
         d = d->next, d_offset++) {
        d->s_rw = 0;
        if (d->status != DRONE_STATUS_DEAD &&
            d->status != DRONE_STATUS_DONE) {
            d->s_rw = p[d_offset].rw;
        }
    }

    return ret;
}
```

---

## 8. Master-Drone Protocol Flow

### 8.1 Initial Handshake

**Drone Connection Sequence**:
```
DRONE                                    MASTER
  |                                        |
  |---- TCP/UNIX Connect ---------------->|
  |                                        |
  |<--- MSG_IDENT (request ID) ------------|
  |                                        |
  |---- MSG_IDENTSENDER/IDENTLISTENER ---->|
  |     (with drone_version_t)             |
  |                                        |
  |<--- MSG_ACK (accepted) ----------------|
  |                                        |
  |---- MSG_READY (with listener_info?) -->|
  |                                        |
```

**Version Structure**:
```c
typedef struct drone_version_t {
    uint32_t magic;  // 0x533f000d
    uint8_t  maj;    // Major version
    uint16_t min;    // Minor version
    uint8_t  res;    // Reserved
} drone_version_t;
```

**Listener Info**:
```c
typedef struct listener_info_t {
    struct sockaddr_storage myaddr;  // Interface address
    struct sockaddr_storage mymask;  // Interface netmask
    uint8_t hwaddr[6];               // MAC address
    uint16_t mtu;                    // MTU
} listener_info_t;
```

### 8.2 Work Distribution

**Master State Machine**:
```c
#define MASTER_START                    0
#define MASTER_SENT_LISTEN_WORKUNITS    1
#define MASTER_SENT_SENDER_WORKUNITS    2
#define MASTER_WAIT_SENDER              3
#define MASTER_IN_TIMEOUT               4
#define MASTER_DONE                     5
```

**Listener Work Unit Assignment**:
```
MASTER                                 LISTENER
  |                                        |
  |---- MSG_WORKUNIT (recv_workunit_t) -->|
  |                                        |
  |<--- MSG_READY (acknowledged) ----------|
  |                                        |
```

**Sender Work Unit Assignment**:
```
MASTER                                  SENDER
  |                                        |
  |---- MSG_WORKUNIT (send_workunit_t) -->|
  |                                        |
  |     (no ack, sender starts immediately)|
  |                                        |
```

**Timing Synchronization**:
```c
// After all listener workunits sent, before sender workunits
usleep(10000);  // 10ms delay

// Ensures listeners enter pcap_dispatch/xpoll loop
// before senders start transmitting packets
// Prevents early packet loss from race condition
```

### 8.3 Work Completion

**Sender Completion**:
```
SENDER                                  MASTER
  |                                        |
  |---- MSG_WORKDONE (send_stats_t) ----->|
  |                                        |
  |     (returns to READY state)           |
  |                                        |
```

**Send Statistics**:
```c
typedef struct send_stats_t {
    uint32_t magic;          // 0x4211dccd
    float pps;               // Actual packets/sec
    uint64_t packets_sent;   // Total sent
} send_stats_t;
```

**Listener Completion**:
```
LISTENER                                MASTER
  |                                        |
  |---- MSG_WORKDONE (recv_stats_t) ----->|
  |                                        |
```

**Receive Statistics**:
```c
typedef struct recv_stats_t {
    uint32_t magic;              // 0x4211dccd
    uint32_t packets_recv;       // Received count
    uint32_t packets_dropped;    // Dropped count
    uint32_t interface_dropped;  // Interface drops
} recv_stats_t;
```

### 8.4 Output Reporting

**Listener Output Stream**:
```
LISTENER                                MASTER
  |                                        |
  |---- MSG_OUTPUT (ip_report_t) -------->|
  |---- MSG_OUTPUT (ip_report_t) -------->|
  |---- MSG_OUTPUT (ip_report_t) -------->|
  |        ...                             |
  |---- MSG_WORKDONE (recv_stats_t) ----->|
  |                                        |
```

**Report Structure**:
```c
typedef struct ip_report_t {
    uint32_t magic;          // IP_REPORT_MAGIC
    // ... report fields ...
    uint16_t doff;           // Data offset (packet attached)
    void *od_q;              // Output data queue
} ip_report_t;
```

### 8.5 Termination

**Graceful Shutdown**:
```
MASTER                                 LISTENER
  |                                        |
  |---- MSG_TERMINATE -------------------->|
  |                                        |
  |<--- MSG_WORKDONE (final stats) --------|
  |                                        |
```

**Error Handling**:
```
Any                                      Any
  |                                        |
  |---- MSG_ERROR (status=ERROR) --------->|
  |                                        |
  |     (drone marked DEAD, socket closed) |
  |                                        |
```

---

## 9. Priority Work Units

### 9.1 Purpose

Priority work units handle TCP connection establishment tasks generated from received SYN-ACK packets during scanning.

**Flow**:
```
1. Sender sends SYN packets
2. Listener receives SYN-ACK responses
3. Listener reports to master (MSG_OUTPUT)
4. Master generates priority work unit
5. Master dispatches to sender (MSG_WORKUNIT)
6. Sender completes 3-way handshake
```

### 9.2 Priority Queue Distribution

**Round-Robin Distribution**:
```c
int dispatch_pri_work(void) {
    uint32_t pri_len = fifo_length(s->pri_work);

    // Round up to multiple of sender count
    uint32_t rem = pri_len % s->senders;
    if (rem) {
        pri_len += (s->senders - rem);
    }

    // Distribute evenly to all senders
    for (c = s->dlh->head; c != NULL; c = c->next) {
        if (c->type == DRONE_TYPE_SENDER &&
            c->status == DRONE_STATUS_READY) {

            uint32_t share = pri_len / s->senders;
            for (wuc = 0; wuc < share; wuc++) {
                send_pri_workunit_t *pw = fifo_pop(s->pri_work);
                if (pw == NULL) break;

                send_message(c->s, MSG_WORKUNIT, MSG_STATUS_OK,
                            (uint8_t *)pw,
                            sizeof(send_pri_workunit_t) + pw->doff);
            }
        }
    }
}
```

---

## 10. Synchronization Mechanisms

### 10.1 Work Unit Tracking

**Work Unit IDs**:
```c
// Global sequence counter
s->wk_seq++;

// Assigned to each work unit
w_p->wid = s->wk_seq;

// Stored in drone when dispatched
drone->wid = workunit_wid;

// Used for completion tracking
workunit_destroy_sp(drone->wid);
```

### 10.2 Iteration Tracking

**Scan Iterations**:
```c
// Groups related send/receive work units
s->scan_iter++;
w_p->iter = s->scan_iter;
s->cur_iter = /* current iteration being processed */

// Work units matched by iteration
if (wa_u.w->iter == wb_u.w->iter) {
    return 0;  // Same scan group
}
```

### 10.3 State Synchronization

**Drone States**:
```c
#define DRONE_STATUS_UNKNOWN    0  // Initial state
#define DRONE_STATUS_CONNECTED  1  // Socket connected
#define DRONE_STATUS_IDENT      2  // Identified
#define DRONE_STATUS_READY      3  // Awaiting work
#define DRONE_STATUS_DEAD       4  // Failed/closed
#define DRONE_STATUS_WORKING    5  // Processing workunit
#define DRONE_STATUS_DONE       6  // Completed
```

**State Transitions**:
```c
void drone_updatestate(drone_t *d, int status) {
    d->status = status;
    shutdown(d->s, SHUT_RDWR);
    close(d->s);
    d->s = -1;
    d->s_rw = 0;

    // Update global counters
    switch (d->type) {
        case DRONE_TYPE_SENDER:
            --s->senders;
            break;
        case DRONE_TYPE_LISTENER:
            --s->listeners;
            break;
    }
}
```

### 10.4 Completion Detection

**Sender Completion**:
```c
int workunit_check_sp(void) {
    struct wk_s w;
    w.iter = s->cur_iter;
    w.magic = WK_MAGIC;

    // Check if any send workunits remain for current iteration
    if (fifo_find(s->swu, &w, &workunit_match_iter) != NULL) {
        return 0;  // Not done
    }

    return 1;  // All complete
}
```

**Listener Completion**:
```c
// Wait until all listeners report statistics
do {
    readable = drone_poll(s->master_tickrate);
    if (readable > 0) {
        master_read_drones();
    }
} while (s->listeners != listener_stats);
```

---

## 11. Error Handling

### 11.1 Socket Errors

**Connection Failures**:
```c
if (connect(rsock, ...) < 0) {
    if (errno == ECONNREFUSED) {
        usleep(s->conn_delay);
        s->conn_delay *= 2;  // Exponential backoff
        return -1;
    }
    ERR("connect fails: %s", strerror(errno));
    return -1;
}
```

**Read/Write Errors**:
```c
// EINTR retry pattern
again:
    ret = read(sock, buffer, size);
    if (ret < 0 && errno == EINTR) {
        goto again;
    }
```

### 11.2 Protocol Validation

**Magic Number Checks**:
```c
if (m_u[sock][m_off[sock]].m->hdr.header != IPC_MAGIC_HEADER) {
    PANIC("wrong magic number for IPC header");
}
```

**Message Size Validation**:
```c
if (ureadsize[sock] < sizeof(ipc_msghdr_t)) {
    ERR("undersized ipc message");
    return -1;
}

if (data_len > (IPC_DSIZE - sizeof(ipc_msghdr_t))) {
    PANIC("attempt to send oversized packet");
}
```

**Work Unit Validation**:
```c
if (msg_len != sizeof(send_stats_t)) {
    ERR("bad send status message, too short");
    drone_updatestate(c, DRONE_STATUS_DEAD);
    break;
}
```

### 11.3 Drone Failure Recovery

**Dead Drone Detection**:
```c
if (recv_messages(c->s) < 1) {
    ERR("cant recieve messages from fd %d, marking as dead", c->s);
    drone_updatestate(c, DRONE_STATUS_DEAD);
    continue;
}

if (msg_type == MSG_ERROR || status != MSG_STATUS_OK) {
    ERR("drone on fd %d is dead", c->s);
    drone_updatestate(c, DRONE_STATUS_DEAD);
    break;
}
```

**Work Unit Rejection**:
```c
if (send_message(c->s, MSG_WORKUNIT, ...) < 0) {
    ERR("cant send workunit to listener on fd %d", c->s);
    workunit_reject_lp(wid);  // Return to pool
    drone_updatestate(c, DRONE_STATUS_DEAD);
    continue;
}
```

### 11.4 Timeout Management

**Accept Timeout**:
```c
// SIGALRM-based timeout
alarm(timeout);
cli_fd = accept(bsock, &s_u.sa, &sin_len);
if (accept_timedout) {
    return -1;
}
alarm(0);
```

**Receive Timeout**:
```c
// Poll-based timeout
time_t wait_stime;
time(&wait_stime);

while (1) {
    time_t tnow;
    time(&tnow);
    if ((tnow - wait_stime) > s->ss->recv_timeout) {
        master_updatestate(MASTER_DONE);
        break;
    }
}
```

---

## 12. Relay Mode (Drone Chaining)

### 12.1 Relay Architecture

```
MASTER ←→ RELAY_DRONE ←→ WORKER_DRONE
```

**Relay Function**:
```c
void run_drone(void) {
    // Relay drone accepts from master
    csock = socktrans_accept(lsock, 0);

    // Relay connects to worker
    // (worker connection established via s->dlh->head)

    while (1) {
        xpoll_t spdf[2];
        spdf[0].fd = worker_socket;
        spdf[1].fd = master_socket;

        xpoll(&spdf[0], 2, -1);

        for (j=0; j < 2; j++) {
            if (spdf[j].rw & XPOLL_READABLE) {
                recv_messages(spdf[j].fd);

                while (get_message(...)) {
                    // Forward to other socket
                    send_message(spdf[(j == 0 ? 1 : 0)].fd,
                                msg_type, status, data, msg_len);
                }
            }
        }
    }
}
```

**Relay Properties**:
- Transparent message forwarding
- No message inspection/modification
- Bidirectional relay
- Enables multi-hop distributed scanning

---

## 13. Performance Considerations

### 13.1 Buffer Sizes

**IPC Buffer** (from settings.h):
```c
#define IPC_DSIZE  /* Typically 8192 or larger */

// Socket buffers match IPC buffer
setsockopt(sock, SOL_SOCKET, SO_RCVBUF, &IPC_DSIZE, ...);
setsockopt(sock, SOL_SOCKET, SO_SNDBUF, &IPC_DSIZE, ...);
```

### 13.2 Message Batching

**Multiple Messages per Read**:
- `setup_mptrs()` parses all messages in buffer
- Reduces read() syscall overhead
- Improves throughput for high message rates

### 13.3 Connection Limits

**Maximum Connections**:
```c
#define MAX_CONNS  /* Bounded by compile-time constant */

// Limits:
// - Number of concurrent drones
// - Number of open sockets
// - Poll array size
```

### 13.4 Polling Efficiency

**Current**: poll(2) - O(n) per call
**TODO**: epoll(7) - O(1) for event retrieval

**Tickrate**:
```c
s->master_tickrate  // Master poll timeout (milliseconds)
// Balances responsiveness vs CPU usage
```

---

## 14. Security Considerations

### 14.1 Authentication

**Peer Credential Checking**:
```c
#ifdef SO_PEERCRED
struct ucred ccred;
getsockopt(cli_fd, SOL_SOCKET, SO_PEERCRED, &ccred, &ccred_len);
// Verifies peer UID, GID, PID (local sockets only)
#endif
```

**SELinux Context**:
```c
#ifdef WITH_SELINUX
security_context_t peercon;
getpeercon(cli_fd, &peercon);
// Verifies SELinux security context
#endif
```

### 14.2 Input Validation

**Buffer Overflow Protection**:
```c
// Maximum slack buffer size
assert(save_size[sock] <= MAX_SLACKSIZE);

// Maximum message size
if (data_len > (IPC_DSIZE - sizeof(ipc_msghdr_t))) {
    PANIC("oversized packet");
}
```

**Magic Number Validation**:
- Header magic: 0xf0f1f2f3
- Work unit magics: prevent type confusion
- Endian detection (magic will be different if endian mismatch)

### 14.3 Vulnerabilities

**Known Issues**:

1. **Partial Write Handling**:
```c
// TODO: Proper retry logic needed
if (ret > 0 && (size_t)ret != sizeof(ipc_msghdr_t) + data_len) {
    ERR("partial write, this is likely going to cause problems");
}
```

2. **No Encryption**:
- All traffic sent in cleartext
- Vulnerable to eavesdropping
- No message integrity protection

3. **No Authentication**:
- Drones trusted based on connection source
- No cryptographic authentication
- Vulnerable to MITM attacks

4. **Resource Exhaustion**:
- No rate limiting on message reception
- Fixed-size buffers could be DoS vector
- No flow control mechanism

---

## 15. Code Quality Issues

### 15.1 Error Handling

**Inconsistent Error Returns**:
- Some functions use -1, others use 0
- PANIC() used for recoverable errors
- Missing error checks on malloc/socket operations

### 15.2 Memory Management

**Potential Leaks**:
```c
// msg_buf allocated but not always freed on error paths
msg_buf[sock] = xmalloc(IPC_DSIZE);
// If read() fails, msg_buf may leak
```

**Double Free Risk**:
```c
// save_buf managed manually
xfree(save_buf[sock]);
save_buf[sock] = NULL;  // Good: nulled after free
```

### 15.3 Code Comments

From source:
```c
/* XXX this needs to be written more clearly */  // xipc.c:29
/* XXX */  // multiple locations
/* in practice this doesnt generally fail (partial writes mostly),
 * but we should check for it and retry */  // xipc.c:349
```

---

## 16. Recommendations

### 16.1 Protocol Improvements

1. **Add Sequence Numbers**:
```c
typedef struct ipc_msghdr_t {
    uint32_t header;
    uint32_t sequence;  // ADD: Message sequence number
    uint8_t  type;
    uint8_t  status;
    size_t   len;
} ipc_msghdr_t;
```

2. **Add Checksums**:
```c
typedef struct ipc_msghdr_t {
    uint32_t header;
    uint8_t  type;
    uint8_t  status;
    size_t   len;
    uint32_t checksum;  // ADD: CRC32 of header+payload
} ipc_msghdr_t;
```

3. **Implement TLS/SSL**:
- Use OpenSSL for encryption
- Mutual certificate authentication
- Message integrity protection

### 16.2 Code Improvements

1. **Fix Partial Write Handling**:
```c
ssize_t send_message_reliable(int sock, ...) {
    size_t total = sizeof(ipc_msghdr_t) + data_len;
    size_t sent = 0;

    while (sent < total) {
        ssize_t ret = write(sock, &msg + sent, total - sent);
        if (ret < 0) {
            if (errno == EINTR) continue;
            return -1;
        }
        sent += ret;
    }
    return sent;
}
```

2. **Add Flow Control**:
```c
#define MSG_FLOW_PAUSE   14
#define MSG_FLOW_RESUME  15

// Receiver can signal sender to slow down
if (queue_length > WATERMARK_HIGH) {
    send_message(sock, MSG_FLOW_PAUSE, ...);
}
```

3. **Implement epoll**:
```c
#ifdef HAVE_EPOLL
int xpoll_epoll(xpoll_t *array, uint32_t len, int timeout) {
    int epfd = epoll_create1(0);
    // ... epoll implementation ...
}
#endif
```

### 16.3 Documentation Improvements

1. Add protocol state machine diagrams
2. Document all message payload formats
3. Add sequence diagrams for common operations
4. Document error recovery procedures

---

## 17. Summary

### 17.1 Strengths

1. **Simplicity**: Straightforward binary protocol
2. **Flexibility**: Supports both TCP and UNIX sockets
3. **Buffering**: Handles partial messages correctly
4. **Multiplexing**: Efficient polling of multiple drones
5. **Extensibility**: Easy to add new message types

### 17.2 Weaknesses

1. **Security**: No encryption or authentication
2. **Reliability**: Partial write handling incomplete
3. **Scalability**: Fixed buffer sizes, poll() limitations
4. **Error Handling**: Inconsistent, uses PANIC() inappropriately
5. **Documentation**: Minimal inline documentation

### 17.3 Use Cases

**Ideal For**:
- Trusted local network environments
- Moderate-scale distributed scanning
- Research and development

**Not Recommended For**:
- Hostile network environments
- Internet-facing deployments
- High-security applications
- Massive scale (>100 drones)

---

## 18. Related Files

### 18.1 Core IPC
- `src/unilib/xipc.h` - Public IPC API
- `src/unilib/xipc.c` - IPC implementation
- `src/unilib/xipc_private.h` - Internal structures

### 18.2 Transport
- `src/unilib/socktrans.c` - Socket transport layer

### 18.3 Data Structures
- `src/unilib/qfifo.c` - Queue/FIFO/LIFO implementation
- `src/unilib/qfifo.h` - Queue API

### 18.4 Polling
- `src/unilib/xpoll.c` - Polling abstraction
- `src/unilib/xpoll.h` - Polling API

### 18.5 Coordination
- `src/scan_progs/master.c` - Master coordinator
- `src/unilib/drone.c` - Drone management
- `src/unilib/drone.h` - Drone structures

### 18.6 Work Units
- `src/scan_progs/workunits.h` - Work unit definitions
- `src/scan_progs/workunits.c` - Work unit management

---

## 19. Glossary

- **XIPC**: Extended Inter-Process Communication
- **WID**: Work Unit ID
- **WU**: Work Unit
- **PPS**: Packets Per Second
- **FIFO**: First-In-First-Out queue
- **LIFO**: Last-In-First-Out queue (stack)
- **MTU**: Maximum Transmission Unit
- **TTL**: Time To Live
- **TOS**: Type Of Service
- **CIDR**: Classless Inter-Domain Routing

---

**Document Version**: 1.0
**Date**: 2025-12-16
**Analysis Based On**: Unicornscan 0.4.7 source code
