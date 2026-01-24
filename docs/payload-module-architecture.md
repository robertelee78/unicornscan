# Payload Module Architecture

This document captures the architectural findings from investigating the `s->plh != NULL` assertion failure in the TLS payload module.

## The Bug

When running unicornscan with TCP connect mode, a PANIC occurred:

```
PANIC: Assertion 's->plh != NULL' fails at add_default_payload [payload.c:40]
```

**Root cause**: The TLS module called `add_default_payload()` directly from its `init_module()` function, but in the Sender process, `init_modules()` runs before `init_payloads()`, so `s->plh` is NULL when the call is made.

## Jack Louis's Module Architecture

Jack designed a clear separation of concerns for payload modules:

### The Pattern

| Function | Purpose | What It Should Do |
|----------|---------|-------------------|
| `init_module()` | Declare capabilities | Set metadata ONLY |
| `init_payload_modules()` | Register payloads | Framework calls `add_payload()` |

### Metadata-Only in init_module()

Every original payload module (upnp.c, rdns.c, http.c, sip.c, ntalk.c, httpexp.c) follows this pattern:

```c
int init_module(mod_entry_t *m) {
    snprintf(m->license, sizeof(m->license) -1, "GPLv2");
    snprintf(m->author, sizeof(m->author) -1, "jack");
    snprintf(m->desc, sizeof(m->desc) -1, "description");
    m->iver=0x0103;
    m->type=MI_TYPE_PAYLOAD;

    m->param_u.payload_s.proto=IPPROTO_UDP;
    m->param_u.payload_s.sport=-1;
    m->param_u.payload_s.dport=PORT;
    m->param_u.payload_s.payload_group=1;

    _m=m;
    s=_m->s;
    return 1;
}
```

**Key observation**: NO function calls to registration APIs. Pure metadata population.

### Framework Handles Registration

The `init_payload_modules()` function in `modules.c` iterates through all loaded modules and calls `add_payload()` using the metadata from `param_u.payload_s`:

```c
int init_payload_modules(int (*add_pl)(...)) {
    for (walk=mod_list_head; walk != NULL; walk=walk->next) {
        if (walk->type == MI_TYPE_PAYLOAD) {
            walk->func_u.dl_create_payload=lt_dlsym(walk->handle, "create_payload");

            add_pl(walk->param_u.payload_s.proto,
                   walk->param_u.payload_s.dport,
                   walk->param_u.payload_s.sport,
                   NULL, 0,
                   walk->func_u.dl_create_payload,
                   walk->param_u.payload_s.payload_group);
        }
    }
}
```

## The Three-Process Architecture

Unicornscan uses three separate processes with different initialization orders:

### Master (unicornscan)

```
init_payloads()           → Allocates s->plh
init_modules()            → Loads .so files, calls init_module()
init_payload_modules()    → Registers payloads via add_payload()
```

### Sender (unisend)

```
init_modules()            → Loads .so files, calls init_module()
init_payloads()           → Allocates s->plh (AFTER modules!)
init_payload_modules()    → Registers payloads
```

### Listener (unilisten)

```
close_payload_modules()   → Explicitly closes payloads (doesn't use them)
```

The TLS module's direct call to `add_default_payload()` in `init_module()` worked in Master (where `init_payloads()` runs first) but crashed in Sender (where it runs after).

## TCP Payload Flow

Understanding where TCP payloads are actually used was critical:

| Process | Calls `get_payload(TCP)` | Calls `create_payload(TCP)` |
|---------|--------------------------|----------------------------|
| Master  | Yes (connect.c:518)      | Yes (connect.c:533)        |
| Sender  | NO                       | NO                         |
| Listener| NO                       | NO                         |

**Key insight**: TCP payloads are only looked up and created in the Master process. The Sender receives pre-built payloads embedded in priority workunits via IPC.

## Cluster Mode Safety

The `payload_t` structure is process-local and never transmitted over IPC:

```c
typedef struct payload_struct {
    uint16_t proto;
    uint16_t port;
    int32_t local_port;
    uint8_t *payload;           // Pointer - not transmitted
    uint32_t payload_size;
    int (*create_payload)(...); // Function pointer - not transmitted
    uint16_t payload_group;
    struct payload_struct *next;
    struct payload_struct *over;
} payload_t;
```

IPC workunits (`send_workunit_t`, `send_pri_workunit_t`) contain:
- Target information (CIDR, ports)
- Inline payload bytes (not pointers)
- Never `payload_t` structures

This means changes to `payload_t` have zero impact on cluster mode compatibility.

## Default vs Port-Specific Payloads

Jack implemented two payload registration mechanisms:

### Port-Specific (`add_payload`)

- Registers for a specific destination port
- Stored in `s->plh->top` linked list
- Looked up by exact port match

### Default (`add_default_payload`)

- Registers as fallback for any port
- Stored in `s->plh->def` linked list
- Used when no port-specific match found and `GET_DEFAULT()` is true

The TLS module is unique in needing BOTH:
- Port 443: Specific registration via module params
- Any port: Default registration for TLS on non-standard ports

## The Fix

The solution extends Jack's existing `-1` convention (already used for `sport` to mean "any source port") to `dport`, and splits the TLS module into two separate files sharing common code.

### 1. modules.h - Widen dport field (commit 39cd391)

Changed `dport` from `uint16_t` to `int32_t` to support the `-1` sentinel value:

```c
struct payload_mod {
    int16_t proto;
    int32_t sport;
    int32_t dport;           /* -1 for default payload (matches sport convention) */
    uint16_t payload_group;
} payload_s;
```

### 2. Two Module Files (commit c155ffb)

Split TLS into two modules sharing common code via a header:

**tls.c** - Port 443 specific:
```c
#include "tls_common.h"

int init_module(mod_entry_t *m) {
    snprintf(m->desc, sizeof(m->desc) - 1, "TLS 1.2/1.3 ClientHello (port 443)");
    m->param_u.payload_s.sport=-1;
    m->param_u.payload_s.dport=443;    /* Port-specific */
    m->param_u.payload_s.proto=IPPROTO_TCP;
    m->param_u.payload_s.payload_group=1;
    return 1;
}

int create_payload(uint8_t **data, uint32_t *dlen, void *i) {
    return tls_create_payload(data, dlen, i);
}
```

**tls_default.c** - Default TCP payload:
```c
#include "tls_common.h"

int init_module(mod_entry_t *m) {
    snprintf(m->desc, sizeof(m->desc) - 1, "TLS 1.2/1.3 ClientHello (default)");
    m->param_u.payload_s.sport=-1;
    m->param_u.payload_s.dport=-1;     /* Default payload for all TCP ports */
    m->param_u.payload_s.proto=IPPROTO_TCP;
    m->param_u.payload_s.payload_group=1;
    return 1;
}

int create_payload(uint8_t **data, uint32_t *dlen, void *i) {
    return tls_create_payload(data, dlen, i);
}
```

**tls_common.h** - Shared implementation (313 lines):
- TLS protocol constants (versions, extension types)
- Cipher suite arrays (TLS 1.3 and 1.2)
- Supported groups and signature algorithms
- `tls_create_payload()` static function that builds the ClientHello

### 3. modules.c - Framework handles dport=-1 (commits 3fbf025, d785abd)

Added MAIN/SEND macros matching `parse.y` convention:

```c
#define MAIN (ident == IDENT_MASTER || ident == IDENT_ANY)
#define SEND (ident == IDENT_SEND || ident == IDENT_ANY)
```

Extended `init_payload_modules()` to detect and route default payloads:

```c
if (walk->param_u.payload_s.dport == -1) {
    int proto = walk->param_u.payload_s.proto;

    if (SEND && proto == IPPROTO_UDP) {
        /* Sender handles UDP default payloads */
        add_default_payload(proto, sport, NULL, 0, create_payload, payload_group);
    }
    else if (MAIN && proto == IPPROTO_TCP) {
        /* Master handles TCP default payloads */
        add_default_payload(proto, sport, NULL, 0, create_payload, payload_group);
    }
}
else {
    /* Port-specific payload - register via callback */
    add_pl(proto, (uint16_t)dport, sport, NULL, 0, create_payload, payload_group);
}
```

## Why This Is Jack-Correct

1. **Reuses existing convention** - The `-1` sentinel already exists for `sport`; extending it to `dport` is consistent
2. **Follows the separation pattern** - `init_module()` sets metadata only; framework handles registration
3. **Matches parse.y guards** - The MAIN/SEND macros and TCP/UDP routing replicate Jack's pattern from the config parser
4. **Two thin wrappers** - Each module file is ~55 lines, sharing the 313-line payload implementation via header
5. **No IPC impact** - Cluster mode completely unaffected (payloads are process-local)
6. **Zero struct bloat** - No new fields added, just widened existing `dport` field

## Module Pattern Summary

| Module | dport | proto | payload_group | Notes |
|--------|-------|-------|---------------|-------|
| http.c | 80 | TCP | 1 | Standard port-specific |
| httpexp.c | 80 | TCP | 3 | Exploit variant |
| rdns.c | 53 | UDP | 1 | Reverse DNS |
| upnp.c | 1900 | UDP | 1 | UPnP discovery |
| sip.c | 5060 | UDP | 1 | SIP OPTIONS |
| mongo.c | 27017 | TCP | 1 | MongoDB isMaster |
| tls.c | 443 | TCP | 1 | TLS on standard port |
| **tls_default.c** | **-1** | TCP | 1 | **TLS default payload** |

## Creating a Default Payload Module

To create a new default payload module:

1. Set `dport = -1` in `init_module()`:
   ```c
   m->param_u.payload_s.dport = -1;  /* Default payload */
   ```

2. Set the appropriate protocol:
   - `IPPROTO_TCP` for TCP default payloads (registered in Master)
   - `IPPROTO_UDP` for UDP default payloads (registered in Sender)

3. The framework handles registration via `add_default_payload()` at the correct time

## References

- `src/scan_progs/payload.c` - `add_default_payload()` implementation
- `src/unilib/modules.c:259-327` - dport=-1 detection and MAIN/SEND guards
- `src/unilib/modules.h:68` - `int32_t dport` field with -1 convention
- `src/parse/parse.y:32-33` - Original MAIN/SEND macros and guard pattern
- `src/scan_progs/connect.c` - Master's TCP connection handling
- `src/payload_modules/tls.c` - Port 443 specific TLS module
- `src/payload_modules/tls_default.c` - Default TCP TLS module
- `src/payload_modules/tls_common.h` - Shared TLS implementation
