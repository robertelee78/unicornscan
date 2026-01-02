# Unicornscan Coding Standards

This document captures critical coding patterns and anti-patterns for the unicornscan codebase. Most of this code was written by Jack Louis in 2004-2006 for single-threaded, performance-critical network scanning.

## 1. Static Buffer Functions

Several functions return pointers to static buffers for memory efficiency. This was a deliberate design choice for a single-threaded scanner in 2004, but it creates subtle bugs if you call them incorrectly.

### Functions That Return Static Buffers

| Function | Location | Buffer Size | Purpose |
|----------|----------|-------------|---------|
| `pgsql_escstr()` | `src/output_modules/database/pgsqldb.c` | Dynamic (2x input) | SQL string escaping |
| `build_mode_str()` | `src/output_modules/database/pgsqldb.c` | 64 bytes | Scan mode string ("T", "Tsf", "A+T+U") |
| `build_target_str()` | `src/output_modules/database/pgsqldb.c` | 4096 bytes | Concatenated target specifications |
| `workunit_pstr_get()` | `src/scan_progs/workunits.c` | 4096 bytes | Port string from workunit |
| `workunit_fstr_get()` | `src/scan_progs/workunits.c` | 1024 bytes | Filter string from workunit |

### Why Static Buffers?

These were intentional design decisions in 2004:
- **Memory efficiency**: Avoid malloc/free overhead in hot paths
- **Single-threaded design**: The scanner runs in one thread, so no race conditions
- **Performance**: Network scanners send/receive millions of packets; allocation matters

### CORRECT Usage Pattern

When you need to use the result of a static buffer function, **copy it immediately before calling the function again**:

```c
/* CORRECT: Copy before the next call */
static int pgsql_insert_hop(const char *target_addr, const char *hop_addr) {
    char esc_target[64], esc_hop[64];
    char *tmp = NULL;

    /* pgsql_escstr uses static buffer - copy before next call */
    tmp = pgsql_escstr(target_addr);
    if (tmp == NULL) return 0;
    strncpy(esc_target, tmp, sizeof(esc_target) - 1);
    esc_target[sizeof(esc_target) - 1] = '\0';

    tmp = pgsql_escstr(hop_addr);
    if (tmp == NULL) return 0;
    strncpy(esc_hop, tmp, sizeof(esc_hop) - 1);
    esc_hop[sizeof(esc_hop) - 1] = '\0';

    snprintf(querybuf, sizeof(querybuf) - 1,
        "INSERT INTO hops (target, hop) VALUES ('%s', '%s');",
        esc_target, esc_hop);

    return pgsql_exec(querybuf);
}
```

### WRONG Usage Pattern

**DO NOT** save a pointer and then call the function again:

```c
/* WRONG: Second call clobbers first result */
static int pgsql_insert_hop(const char *target_addr, const char *hop_addr) {
    char *escaped_target = NULL;
    char *escaped_hop = NULL;

    escaped_target = pgsql_escstr(target_addr);  /* Returns pointer to static buf */
    escaped_hop = pgsql_escstr(hop_addr);        /* CLOBBERS the static buf! */

    /* BUG: escaped_target now points to hop_addr's escaped value */
    snprintf(querybuf, sizeof(querybuf) - 1,
        "INSERT INTO hops (target, hop) VALUES ('%s', '%s');",
        escaped_target, escaped_hop);  /* Both strings are the same! */
}
```

### What Goes Wrong

The static buffer is shared across all calls:
1. First call to `pgsql_escstr("192.168.1.1")` writes "192.168.1.1" to static buffer, returns pointer
2. Second call to `pgsql_escstr("10.0.0.1")` overwrites buffer with "10.0.0.1"
3. Both `escaped_target` and `escaped_hop` now point to "10.0.0.1"
4. Your SQL query uses the wrong data

This was fixed in commit `64b9c54`.

## 2. SQL Security

### String Escaping

The codebase uses `PQescapeString()` from libpq for SQL escaping:

```c
/* From pgsql_escstr() */
PQescapeString(outstr, in, inlen - 1);
```

**Note**: `PQescapeString()` is deprecated but retained for compatibility. It assumes a single-byte encoding and does not handle all edge cases. For new code, consider `PQescapeLiteral()` if the connection handle is available.

### Attacker-Controlled Data

Banner data captured from remote hosts is **attacker-controlled**. Malicious hosts can send crafted banner responses. Always escape before database insertion:

```c
/* Banner comes from untrusted network data */
char *banner = packet_data->banner;

/* MUST escape before SQL insertion */
char *escaped_banner = pgsql_escstr(banner);
snprintf(querybuf, sizeof(querybuf) - 1,
    "INSERT INTO results (banner) VALUES ('%s');",
    escaped_banner);
```

Treat all received packet data as potentially malicious:
- Banners from service probes
- OS fingerprint responses
- Any data extracted from network packets

### Query Building

Use `snprintf()` with explicit buffer size limits:

```c
/* Good: explicit size limit */
snprintf(querybuf, sizeof(querybuf) - 1, "SELECT ...");

/* Avoid: potential truncation without check */
sprintf(querybuf, "SELECT ...");  /* NO! */
```

## 3. Memory Management

### xmalloc/xrealloc/xfree

The codebase provides wrapped allocation functions in `src/unilib/xmalloc.c`:

```c
#include <unilib/xmalloc.h>

void *ptr = xmalloc(size);    /* Panics on failure */
ptr = xrealloc(ptr, newsize); /* Panics on failure */
xfree(ptr);                   /* Panics on NULL, sets ptr to NULL */
```

Key behaviors:
- All three functions **panic** (abort) on error rather than returning NULL
- `xfree()` macro sets the pointer to NULL after freeing
- `xmalloc(0)` panics - never allocate zero bytes
- `xrealloc(NULL, n)` calls `xmalloc(n)`

### When to Use Static vs Dynamic Allocation

**Use static buffers when**:
- Function is called frequently in hot paths
- Buffer size is bounded and known
- Caller will use result immediately (before next call)
- Single-threaded access is guaranteed

**Use dynamic allocation when**:
- Caller needs to retain data across function calls
- Data size varies significantly
- Multiple instances needed simultaneously
- Memory will be passed to other subsystems

### Buffer Clearing

Use the `CLEAR()` macro from `src/unicorn_defs.h`:

```c
static char ret[4096];
CLEAR(ret);  /* memset(ret, 0, sizeof(ret)) */
```

## 4. Code Style

The original codebase follows these conventions from Jack Louis's code.

### File Header

Every source file has the standard GPL header:

```c
/**********************************************************************
 * Copyright (C) 2004-2006 (Jack Louis) <jack@rapturesecurity.org>    *
 *                                                                    *
 * This program is free software; you can redistribute it and/or      *
 * modify it under the terms of the GNU General Public License        *
 * ... (standard GPL v2 text)                                         *
 **********************************************************************/
```

### Include Order

1. `<config.h>` first (always)
2. Local headers in angle brackets: `<settings.h>`, `<unilib/output.h>`
3. System headers: `<arpa/inet.h>`, `<math.h>`

```c
#include <config.h>

#include <scan_progs/scanopts.h>
#include <settings.h>
#include <unilib/xmalloc.h>

#include <arpa/inet.h>
#include <math.h>
```

### Variable Declarations

Declare variables at the start of blocks, C89 style:

```c
static int function(const char *in) {
    char *ptr = NULL;
    int j = 0, j1 = 0;
    size_t len = 0;

    /* code starts here */
}
```

### Spacing and Braces

- No space before `(` in function calls: `strlen(in)` not `strlen (in)`
- Space after keywords: `if (`, `for (`, `while (`
- Operators without spaces around `=` in some contexts: `ptr=NULL`
- Opening brace on same line for functions and control structures

```c
void function(void) {
    if (condition) {
        /* code */
    }
    else {
        /* code */
    }
}
```

### Comments

Multi-line comments for function documentation:

```c
/*
 * Helper function to get mode character from mode flag
 * Returns: 'T' for TCP, 'U' for UDP, 'A' for ARP, 'I' for ICMP, 'P' for IP
 */
static char mode_to_char(uint8_t mode) {
```

Inline comments for non-obvious code:

```c
/* truncate \777 to 0xFF like \377 */
out[j1++] = (result & 0xFF);
```

### Function Documentation

Document parameters and return values for non-trivial functions:

```c
/*
 * Build target_str from settings->target_strs fifo
 * Concatenates all target specifications with space separator
 * Returns: pointer to static buffer containing target string, or NULL
 */
static const char *build_target_str(const settings_t *settings) {
```

### Assertions

Use `assert()` for invariants that should never fail:

```c
assert(targets != NULL && estr != NULL);
assert((buffer_size + in->len) > buffer_size);  /* Overflow check */
```

## 5. Common Patterns

### Union Type Punning

The codebase uses unions for type punning in network packet handling:

```c
union {
    const send_workunit_t *s;
    const char *c;
} s_u;

s_u.s = sw;
s_u.c += sizeof(send_workunit_t);
memcpy(ret, s_u.c, len);
```

### Error Reporting

Use the `DBG()` and `ERR()` macros from `<unilib/output.h>`:

```c
DBG(M_MOD, "fn_upsert_host failed: %s", PQerrorMessage(pgconn));
ERR("unhandled escapechar `%c'", in[j]);
```

### Null Checks

Always check pointers before use:

```c
if (in == NULL) {
    return NULL;
}
```

## 6. Summary: Preventing Common Bugs

1. **Static buffer functions**: Copy the result immediately before calling the function again
2. **SQL escaping**: Always escape attacker-controlled data (banners, fingerprints)
3. **Memory allocation**: Use xmalloc/xfree; they panic on failure
4. **Buffer sizes**: Always use sizeof() or explicit limits with snprintf()
5. **Null checks**: Validate pointers at function entry

When in doubt, look at how existing code in the same file handles similar situations.
