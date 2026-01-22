# Multi-Payload TCP Implementation Plan

## Overview

Implement multi-payload TCP support following Jack's architectural patterns, specifically
mirroring the UDP payload loop in send_packet.c rather than adding hack logic in connect.c.

## Current State

### Hack to Revert (2 commits)

**Commit 130ef58** - "Add multi-payload TCP support for protocol fallback"
- `src/scan_progs/connect.c` - Added `pending_payload_tbl`, `queue_multipayload_syns()` **[REVERT]**
- `src/scan_progs/scan_export.h` - Added `count_payloads()` declaration **[KEEP - useful utility]**
- `src/scan_progs/payload.c` - Added `count_payloads()` **[KEEP - useful utility]**
- `etc/payloads.conf` - Added SSL 3.0 payloads **[KEEP - actual payloads we want]**

**Commit c5b6c81** - "WIP: Multi-payload TCP bugfixes"
- `src/scan_progs/connect.c` - Sport/dport fixes for the hack **[REVERT with above]**

### What Was Wrong With the Hack

1. **Wrong layer**: Added multi-payload logic in `connect.c` (receiver side) instead of
   `send_packet.c` (sender side) where Jack's UDP pattern lives.

2. **Wrong queue**: Used `pri_work` queue which is designed for REACTIVE packets (ACKs, FINs),
   not proactive SYNs.

3. **Wrong lifecycle**: `senders_done()` in master.c doesn't know about pending payloads,
   causing premature scan termination.

4. **Against Jack's design**: Jack's architecture sends ALL probes from the sender loop,
   then receives responses separately. The hack violated this by having the receiver
   spawn new connections.

## Proper Implementation

### Architecture

Follow Jack's UDP multi-payload pattern in `send_packet.c:617-624`:

```c
if (s->ss->mode == MODE_UDPSCAN) {
    fnew.init=&init_payload;
    fnew.c_t=CTPAYL;
    fnew.c_u.gpl=&cmp_payload;
    fnew.inc=&inc_payload;
    add_loop_logic((const fl_t *)&fnew);
}
```

For TCP connect mode, add similar loop that:
1. Counts payloads per target port
2. Iterates through payload indices
3. Sends one SYN per payload_index
4. Encodes payload_index in source port for correlation

### Source Port Encoding

**Problem**: When SYN-ACK arrives, we need to know which payload_index it corresponds to.

**Solution**: Encode payload_index in source port.

**Safe Range**: Use `PAYLOAD_PORT_BASE = 49152` (IANA ephemeral range start)
- Avoids conflict with `TRACE_PORT_BASE = 40960` (used for traceroute TTL encoding)
- Source port = `PAYLOAD_PORT_BASE + (base_sport % 1024) * 16 + payload_index`
- Supports up to 16 payload indices per port (plenty for protocol fallback)

### Files to Modify

#### Phase 1: Revert Hack

1. **Revert connect.c changes** from 130ef58 and c5b6c81
   - Remove `pending_payload_tbl` hash table
   - Remove `queue_multipayload_syns()` function
   - Remove `lookup_pending_payload()` function
   - Remove `remove_pending_payload()` function
   - Revert `send_connect()` to use `get_payload(0, ...)` directly

2. **scan_export.h** - NO CHANGES NEEDED
   - `count_payloads()` declaration added in 130ef58 is useful utility - KEEP IT
   - Note: `connection_status_t` was LOCAL to connect.c, NOT in scan_export.h

#### Phase 2: Implement Proper Solution

1. **src/scan_progs/send_packet.c** - Add TCP payload loop
   - Add `init_tcp_payload()`, `cmp_tcp_payload()`, `inc_tcp_payload()` functions
   - Mirror the UDP payload loop pattern
   - Add loop logic for `MODE_TCPSCAN` with connect (`-msf` or `-msfT`)
   - Encode `payload_index` in source port

2. **src/scan_progs/send_packet.h** (or relevant header)
   - Define `PAYLOAD_PORT_BASE = 49152`
   - Add function to encode/decode payload_index from source port

3. **src/scan_progs/connect.c** - Decode payload_index from source port
   - In connection handling, extract payload_index from received source port
   - Pass correct payload_index to `get_payload()`

4. **src/scan_progs/recv_packet.c** (if needed)
   - Ensure source port is preserved through the receive path

### Detailed Changes

#### send_packet.c Additions

```c
/* Payload port encoding for TCP multi-payload support */
#define PAYLOAD_PORT_BASE   49152
#define PAYLOAD_INDEX_BITS  4
#define PAYLOAD_INDEX_MASK  ((1 << PAYLOAD_INDEX_BITS) - 1)  /* 0x0F, max 16 indices */

/* Encode payload_index into source port */
static inline uint16_t encode_payload_sport(uint16_t base_sport, uint16_t payload_index) {
    return PAYLOAD_PORT_BASE + ((base_sport % 1024) << PAYLOAD_INDEX_BITS) + (payload_index & PAYLOAD_INDEX_MASK);
}

/* Decode payload_index from source port */
static inline uint16_t decode_payload_index(uint16_t sport) {
    if (sport < PAYLOAD_PORT_BASE) return 0;
    return (sport - PAYLOAD_PORT_BASE) & PAYLOAD_INDEX_MASK;
}

/* TCP payload loop state */
static uint16_t tcp_payload_count = 0;
static uint16_t tcp_payload_index = 0;

static void init_tcp_payload(void) {
    tcp_payload_index = 0;
    /* tcp_payload_count set by caller based on target port */
}

static int cmp_tcp_payload(void) {
    return (tcp_payload_index < tcp_payload_count);
}

static void inc_tcp_payload(void) {
    tcp_payload_index++;
}
```

#### connect.c Modifications

```c
/* In recv_packet handler or connection setup */
uint16_t payload_index = decode_payload_index(r->sport);

/* Use decoded payload_index */
if (get_payload(payload_index, proto, port, &data, &data_len, &local_port, &payload_init, payload_group) != 1) {
    /* Fallback to index 0 if specific index not found */
    get_payload(0, proto, port, &data, &data_len, &local_port, &payload_init, payload_group);
}
```

### Testing Plan

1. **Single payload per port** - Verify existing behavior unchanged
   - Scan port 80 (single HTTP payload) - should work as before

2. **Multiple payloads per port** - Verify parallel probing
   - Scan port 443 with both TLS 1.3 and SSL 3.0 payloads
   - Should see two SYNs sent (different source ports)
   - Both should complete handshakes and send payloads

3. **Source port decoding** - Verify correlation
   - Enable debug logging
   - Confirm payload_index decoded correctly from SYN-ACK source port

4. **Edge cases**
   - Port with 1 payload (payload_index always 0)
   - Port with no payload (uses default)
   - Port with max payloads (16)

### Rollback Plan

If issues arise, revert to commit `bab222b` (before any multi-payload work):
```bash
git revert --no-commit c5b6c81 130ef58
```

### Style Compliance

All code will follow `/opt/unicornscan/docs/jack-louis-coding-style-guide.md`:
- Function names: `verb_noun()` lowercase with underscores
- Return values: 1 for success, -1 for error
- Comments: `/* */` style, box comments for sections
- Error handling: `ERR()` macro, meaningful messages
- No tabs, consistent indentation

## Execution Order

1. **Revert hack** - `git revert` commits c5b6c81 and 130ef58 (preserve payloads.conf and count_payloads())
2. **Add source port encoding** - Constants and helper functions in send_packet.c
3. **Add TCP payload loop** - init/cmp/inc pattern like UDP
4. **Modify connect.c** - Decode payload_index from source port
5. **Test single payload** - Verify no regression
6. **Test multi-payload** - Verify parallel probing works
7. **Commit with proper message**

## Questions Resolved

- **payload_index**: Index into ->over chain for same port/proto/group
- **When it matters**: Only when count_payloads() > 1 for a port
- **Source port safety**: [49152-65279] range avoids TRACE_PORT_BASE conflict
