# Jack Louis Coding Style Guide for Unicornscan

**Version:** 1.0
**Date:** 2025-12-23
**Purpose:** Guide for implementing compound modes in Jack Louis's original style

---

## 1. NAMING CONVENTIONS

### 1.1 Variable Names

**Pattern:** Lowercase with underscores, highly descriptive

```c
// Common patterns observed
uint8_t curttl;           // Current value, abbreviated type
int32_t local_port;       // Descriptive purpose
uint64_t packets_sent;    // Action + past tense
struct sockaddr_storage curhost;
struct sockaddr_storage curhost_cnt;  // Related with suffix
uint8_t esrc[THE_ONLY_SUPPORTED_HWADDR_LEN];  // Hardware-related
```

**Key observations:**
- Uses `cur` prefix for loop variables (curttl, curhost, curport, curround)
- Counter/limit pattern: `curhost` and `curhost_cnt`
- Abbreviated but clear: `esrc` (ethernet source), `plindex` (payload index)
- Type hints in name: `local_port`, `src_port` (not just `port`)

### 1.2 Function Names

**Pattern:** Verb_noun or action_context, all lowercase with underscores

```c
// Getters/Setters
int scan_getmode(void);
int scan_setsrcp(int port);
int scan_setrecvtimeout(int seconds);

// Parsing/Processing
int scan_parsemode(const char *str, ...);
int decode_tcpflags(const char *str);

// State management
void init_nextttl(void);
int  cmp_nextttl(void);
void inc_nextttl(void);

// Object conversion
char *strscanmode(int mode);
char *strworkunit(const void *ptr, size_t wul);

// Hierarchical naming
static void init_nexthost(void);
static int  cmp_nexthost(void);
static void inc_nexthost(void);
```

**Key patterns:**
- Action verbs: `init_`, `cmp_`, `inc_`, `get_`, `set_`, `decode_`, `parse_`
- String conversion: `str` prefix for functions returning strings
- Static helper functions follow same pattern as public ones
- Related functions grouped by shared suffix (nextttl, nexthost, nextport)

### 1.3 Type Names

```c
typedef struct fl_t { ... } fl_t;           // Struct with _t suffix
typedef struct wk_s { ... } wk_s;           // Struct with _s suffix
typedef struct interface_info_t { ... } interface_info_t;
typedef struct send_workunit_t { ... } send_workunit_t;
```

**Pattern:**
- Always typedef struct together: `typedef struct name_t { } name_t;`
- Suffix conventions: `_t` for types, `_s` for structures
- Descriptive compound names: `send_workunit_t`, `recv_workunit_t`

### 1.4 Macro Names

```c
// Constants - ALL CAPS with underscores
#define MODE_TCPSCAN    1
#define MODE_UDPSCAN    2
#define MIN_LOCALPORT   4096
#define CTVOID          1
#define CTPAYL          2

// Magic numbers - descriptive with MAGIC suffix
#define TCP_SEND_MAGIC  0x1a1b1c1d
#define UDP_SEND_MAGIC  0x2a2b2c2d
#define WK_MAGIC        0xf4f3f1f2
#define PRI_4SEND_MAGIC 0x6a6b6c6d

// Flag getters/setters - GET_/SET_ prefix, property in caps
#define GET_SHUFFLE()       (s->send_opts & S_SHUFFLE_PORTS)
#define SET_SHUFFLE(x)      ((x) ? (s->send_opts |= S_SHUFFLE_PORTS) : (s->send_opts &= ~(S_SHUFFLE_PORTS)))

// Debug categories - M_ prefix with STR version
#define M_WRK    1
#define M_WRKSTR "workunit"
```

**Key patterns:**
- Magic numbers use consistent pattern (0xNaNbNcNd)
- Bitfield flags: prefix indicates purpose (S_ for sender, L_ for listener, M_ for master)
- Paired GET/SET macros for flag manipulation
- Debug facilities have both numeric and string versions

---

## 2. CODE STRUCTURE

### 2.1 File Organization

**Standard file structure:**

```c
/**********************************************************************
 * Copyright (C) 2004-2006 (Jack Louis) <jack@rapturesecurity.org>    *
 * [GPL license header - 18 lines total]
 **********************************************************************/
#include <config.h>

[System includes]

[Project includes from subdirectories]

#include <settings.h>
[More project includes]

[Static function prototypes at top]

[Static variables]

[Functions - public first, then static helpers]
```

**Key observations:**
- Consistent 18-line GPL header with box comment style
- `#include <config.h>` ALWAYS first
- System includes before project includes
- Static function prototypes declared before first use
- Static variables declared after prototypes, before functions

### 2.2 Function Length and Organization

**Observed patterns:**

```c
// Short, focused functions (10-30 lines)
int scan_getmode(void) {
    return s->ss->mode;
}

// Medium functions with clear sections (30-100 lines)
int scan_setttl(const char *ttl) {
    unsigned short int a=0, b=0;

    if (ttl == NULL) {
        return -1;
    }

    if (sscanf(ttl, "%hu-%hu", &a, &b) == 2) {
        // Range handling
        if (a > 0xff || b > 0xff) {
            ERR("ttl out of range");
            return -1;
        }
        if (a > b) {
            unsigned short int t=0;
            t=a; a=b; b=t;
        }
        s->ss->minttl=(uint8_t)a;
        s->ss->maxttl=(uint8_t)b;
    }
    else if (sscanf(ttl, "%hu", &a) == 1) {
        // Single value handling
        if (a > 0xff) {
            ERR("ttl out of range");
            return -1;
        }
        s->ss->minttl=(uint8_t)a;
        s->ss->maxttl=(uint8_t)a;
    }
    else {
        ERR("bad ttl option `%s'", ttl);
        return -1;
    }

    return 1;
}

// Large functions organized with comment blocks (100+ lines)
void send_packet(void) {
    // Variable declarations grouped by type
    char conffile[512], *tmpchr=NULL;
    float pps=0.00, tt=0.00;
    uint8_t msg_type=0, *tmpptr=NULL, status=0;

    /****************************************************************
     *                  INITIALIZATION SECTION                      *
     ****************************************************************/
    if (init_modules() < 0) {
        terminate("cant initialize module structures, quiting");
    }

    /****************************************************************
     *                  MAIN LOOP                                   *
     ****************************************************************/
    while (worktodo) {
        // Loop body
    }
}
```

**Guidelines:**
- Functions under 50 lines: simple, direct implementation
- Functions 50-150 lines: use blank lines to separate logical sections
- Functions over 150 lines: use box comments to mark major sections
- Maximum observed: ~400 lines with clear sectioning

### 2.3 Static vs Public Functions

**Pattern observed:**

```c
// Public functions - declared in header
int scan_setmode(const char *str);
void send_packet(void);
int workunit_init(void);

// Static helpers - declared at top of .c file
static int add_loop_logic(const fl_t *);
static void destroy_loop_logic(void);
static void _send_packet(void);          // Note: leading underscore for "real" implementation
static int lwu_compare(const void *, const void *);
static int workunit_match_iter(const void *, const void *);
```

**Key pattern:**
- Public API functions at module level (scan_, workunit_, init_)
- Static functions for internal helpers
- Leading underscore for "real" worker function when public is wrapper
- Related static functions grouped with similar names (workunit_match_*)

---

## 3. ERROR HANDLING PATTERNS

### 3.1 Error Macros Usage

**Hierarchy observed:**

```c
// PANIC - unrecoverable errors, should never happen
PANIC("nyi");                                    // Not yet implemented
PANIC("no!");                                    // Impossible condition
PANIC("somehow an unknown scan mode is present");

// ERR - recoverable errors, report and continue or return
ERR("source port `%d' out of range", port);
ERR("ttl out of range");
ERR("cant adjust priority, expect some evilness: %s", strerror(errno));

// DBG - debug output with facility category
DBG(M_WRK, "adding new logic list head");
DBG(M_SND, "open link at `%s'", mode == SOCK_LL ? "link layer" : "network layer");
DBG(M_IPC, "got a message `%s' with status %u from parent", strmsgtype(msg_type), status);

// VRB - verbose output with level
VRB(0, "adding %s/%u mode `%s' ports `%s' pps %u", ...);  // Always shown if verbose
VRB(1, "scan iteration %u out of %u", s->cur_iter, s->scan_iter);
VRB(2, "main exiting");

// INF - informational output
INF("## Buffer size is " STFMT " ######################", len);
```

**Rules:**
1. **PANIC**: Only for "impossible" conditions or critical NYI sections
2. **ERR**: For validation failures, system errors; function returns error code
3. **DBG**: Development/troubleshooting with category (M_WRK, M_SND, etc.)
4. **VRB**: User-facing progress info, level 0=important, 2=detailed
5. **INF**: General information output

### 3.2 Return Value Patterns

```c
// Success/failure pattern: 1 for success, -1 for error
int scan_setsrcp(int port) {
    if (port < -1 || port > 0xffff) {
        ERR("source port `%d' out of range", port);
        return -1;
    }
    s->ss->src_port=(int32_t)port;
    return 1;
}

// Boolean pattern: 1 for true, 0 for false
static int cmp_nextttl(void) {
    if (sl.curttl > s->ss->maxttl) {
        return 0;
    }
    return 1;
}

// Pointer pattern: NULL for error/not found
send_workunit_t *workunit_get_sp(size_t *wk_len, uint32_t *wid) {
    if ((w_u.ptr=fifo_find(s->swu, &srch, &workunit_match_slp)) != NULL) {
        *wid=w_u.w->wid;
        *wk_len=w_u.w->len;
        return w_u.w->s;
    }
    return NULL;
}

// Count pattern: number of items, or negative for error
if (recv_messages(sl.c_socket) < 1) {
    ERR("recv_messages fails, *shrug* no more work todo");
    worktodo=0;
    break;
}
```

**Guidelines:**
- Use `1` for success, `-1` for error (NOT 0 for success)
- Use `0` for false, `1` for true in boolean contexts
- NULL for pointer failures
- Negative count for errors, 0+ for success with count

### 3.3 Validation Pattern

```c
// Early validation, then processing
int scan_setttl(const char *ttl) {
    unsigned short int a=0, b=0;

    // Null check first
    if (ttl == NULL) {
        return -1;
    }

    // Parse and validate
    if (sscanf(ttl, "%hu-%hu", &a, &b) == 2) {
        if (a > 0xff || b > 0xff) {
            ERR("ttl out of range");
            return -1;
        }
        // Process valid range
    }
    else if (sscanf(ttl, "%hu", &a) == 1) {
        if (a > 0xff) {
            ERR("ttl out of range");
            return -1;
        }
        // Process single value
    }
    else {
        ERR("bad ttl option `%s'", ttl);
        return -1;
    }

    return 1;
}
```

**Pattern:** Validate early, fail fast, ERR + return -1 on errors

---

## 4. DATA STRUCTURE PATTERNS

### 4.1 Union Usage for Type Punning

**Extremely common pattern:**

```c
// Union for sockaddr family access
union sock_u {
    struct sockaddr *s;
    struct sockaddr_storage *ss;
    struct sockaddr_in *sin;
    struct sockaddr_in6 *sin6;
    struct sockaddr_ll *sl;
    struct f_s *fs;
};

// Usage:
union sock_u su;
su.ss=&sl.curhost;
if (su.fs->family == AF_INET) {
    // Access as sin
}

// Union for const version
union csock_u {
    const struct sockaddr *s;
    const struct sockaddr_storage *ss;
    const struct sockaddr_in *sin;
    // ...
};

// Local unions for workunit access
union {
    send_workunit_t *s;
    uint8_t *inc;
} sw_u;

sw_u.s=(send_workunit_t *)xmalloc(sizeof(send_workunit_t) + port_str_len);
memcpy(sw_u.inc + sizeof(send_workunit_t), port_str, port_str_len);

// Union for message parsing
union {
    drone_version_t *v;
    uint8_t *ptr;
} d_u;

d_u.v=&dv;
send_message(sl.c_socket, MSG_IDENTSENDER, MSG_STATUS_OK, d_u.ptr, sizeof(drone_version_t));
```

**Guidelines:**
- Unions for zero-cost type reinterpretation
- Name pattern: `name_u` suffix
- Define global union types when used in multiple places
- Define local unions for one-off conversions
- Provide const versions when needed

### 4.2 Struct Packing and Layout

```c
// Workunit structures are _PACKED_
typedef struct _PACKED_ send_workunit_t {
    uint32_t magic;                      // Magic number first
    uint32_t repeats;
    uint16_t send_opts;
    uint32_t pps;
    uint8_t delay_type;
    struct sockaddr_storage myaddr;      // Network structures
    struct sockaddr_storage mymask;
    uint8_t hwaddr[THE_ONLY_SUPPORTED_HWADDR_LEN];
    uint16_t mtu;
    // ... more fields
    uint16_t port_str_len;              // Variable data length last
} send_workunit_t;

// Linked lists
typedef struct fl_t {
    void (*init)(void);                  // Function pointers
    uint8_t c_t;                        // Type discriminator
    union {                             // Variant data
        int (*cmp)(void);
        int (*gpl)(uint16_t, uint8_t **, ...);
    } c_u;
    void (*inc)(void);
    struct fl_t *next;                  // Next pointer last
} fl_t;
```

**Guidelines:**
- Magic numbers first in serialized structures
- Fixed-size fields before variable-size
- Length fields adjacent to variable data
- Function pointers for polymorphism
- Union for variant types
- Next pointer last in linked list nodes

### 4.3 Static Module-level State

```c
// Module state in static struct
static struct {
    uint32_t curround;
    struct sockaddr_storage curhost;
    uint32_t ipv4_mix;
    struct sockaddr_storage curhost_cnt;
    int32_t curport;
    int16_t plindex;
    uint8_t curttl;
    int32_t local_port;
    int c_socket;
    // ... more state
    uint64_t packets_sent;
    int sockmode;
    union {
        ip_t *ipsock;
        eth_t *llsock;
    } s_u;
} sl;

// Simple static variables
static fl_t *flhead=NULL;
static int swu_s=0, lwu_s=0;
static char interfaces[128];
static unsigned int interfaces_off=0;
```

**Guidelines:**
- Encapsulate related state in anonymous static struct
- Short module-global name (often 2 letters: `sl`, `r`, `w`)
- Simple counters/pointers as individual statics
- Initialize all statics to 0/NULL explicitly or via memset

---

## 5. MEMORY MANAGEMENT

### 5.1 Allocation Patterns

```c
// Simple allocation with explicit size
s->ss=(SCANSETTINGS *)xmalloc(sizeof(SCANSETTINGS));
memset(s->ss, 0, sizeof(SCANSETTINGS));

// Array allocation
s->vi=(interface_info_t **)xmalloc(sizeof(interface_info_t *));
s->vi[0]=(interface_info_t *)xmalloc(sizeof(interface_info_t));
memset(s->vi[0], 0, sizeof(interface_info_t));

// Variable-size allocation (struct + data)
sw_u.s=(send_workunit_t *)xmalloc(sizeof(send_workunit_t) + port_str_len);
memset(sw_u.s, 0, sizeof(send_workunit_t) + port_str_len);
// Then copy variable data
if (port_str_len > 0) {
    memcpy(sw_u.inc + sizeof(send_workunit_t), port_str, port_str_len);
}

// String duplication
port_str=xstrdup(ptr != NULL && strlen(ptr) > 0 ? ptr : s->gport_str);

// Cleanup pattern
if (s->ss->port_str != NULL) {
    xfree(s->ss->port_str);
    s->ss->port_str=NULL;
}
```

**Guidelines:**
- Always use `xmalloc()`, `xfree()`, `xstrdup()` (wrapper functions)
- Always `memset()` to zero after allocation
- Check for NULL before freeing, set to NULL after free
- Variable-size: allocate base struct + data size, use union to access tail

### 5.2 Cleanup Patterns

```c
// List cleanup
static void destroy_loop_logic(void) {
    fl_t *ptr=NULL;

    for (; flhead != NULL; ) {
        ptr=flhead->next;
        xfree(flhead);
        if (ptr == NULL) {
            break;
        }
        flhead=ptr;
    }

    flhead=NULL;
}

// Module cleanup
void workunit_destroy(void) {
    fifo_destroy(s->swu);
    fifo_destroy(s->lwu);
}

// Conditional cleanup
if (port_str != NULL) {
    xfree(port_str);
}
xfree(start);  // Always free non-NULL
```

**Guidelines:**
- Walk lists with temp pointer, free as you go
- Set head pointer to NULL at end
- Abstract data structure cleanup into functions
- Free in reverse order of allocation when dependencies exist

---

## 6. COMMENT STYLE

### 6.1 Section Comments

```c
/****************************************************************
 *                  BUILD IP HEADER                             *
 ****************************************************************/
makepkt_build_ipv4(...);

/****************************************************************
 *                  BUILD TCP HEADER                            *
 ****************************************************************/
makepkt_build_tcp(...);
```

**Pattern:** Box comment with centered title, 72 characters wide

### 6.2 Inline Comments

```c
/* default mode is tcp syn scan */
s->ss->mode=MODE_TCPSCAN;
s->ss->tcphdrflgs=TH_SYN; /* FSRPAUEC */

/* XXX normally only 1 iter */
fnew.init=&init_nextttl;

/* check to see if the user specified TCP flags with TCP mode */
if (strlen(walk) > 0) {

// Very rare, but used for C++ style comments in a few places
// Mostly Jack uses /* */ style
```

**Guidelines:**
- Use `/* */` style, not `//` (K&R style)
- Brief explanatory comments on same line for flag meanings
- Full sentence comments before code blocks
- `XXX` prefix for notes/warnings/todos
- `NYI` for not-yet-implemented (often with PANIC)

### 6.3 Documentation Comments

```c
// Function prototypes with parameter hints
static int   cmp_payload(uint16_t /* dport */, uint8_t ** /* data */, uint32_t * /* dsize */, ...);
static void  decode_arp (const uint8_t * /* packet */, size_t /* pk_len */, int /* pk_layer */);

// Struct field comments
typedef struct settings_s {
    double num_hosts;
    double num_packets;
    uint32_t num_secs;

    char *gport_str;
    char *tcpquickports;
    char *udpquickports;

    void *swu; /* fifo target list  */
    void *lwu; /* ditto for sniffer */

    uint32_t wk_seq;
    // ... more fields
} settings_t;
```

**Guidelines:**
- Inline parameter documentation in prototypes using `/* comment */`
- Struct field comments for non-obvious purposes
- Group related fields with blank lines
- Minimal comments for obvious code

---

## 7. CONTROL FLOW PREFERENCES

### 7.1 Early Returns

**Strongly preferred pattern:**

```c
int scan_setsrcp(int port) {
    if (port < -1 || port > 0xffff) {
        ERR("source port `%d' out of range", port);
        return -1;
    }
    s->ss->src_port=(int32_t)port;
    return 1;
}

static int cmp_nexthost(void) {
    return cidr_within(
        (const struct sockaddr *)&sl.curhost_cnt,
        (const struct sockaddr *)&s->ss->target,
        (const struct sockaddr *)&s->ss->targetmask
    );
}
```

**Guidelines:**
- Validate early, return error immediately
- Avoid deep nesting
- Single return at end for success case
- Direct return for simple functions

### 7.2 Switch Statements

```c
switch (*str) {
    case 'F':
        ret |= TH_FIN;
        break;
    case 'f':
        ret &= ~(TH_FIN);
        break;
    case 'S':
        ret |= TH_SYN;
        break;
    // ... more cases
    default:
        ERR("unknown TCP flag `%c' (FfSsRrPpAaUuEeCc are valid)", *str);
        return -1;
}

// Enumeration switch
switch (mode) {
    case MODE_TCPSCAN:
        strcpy(modestr, "TCPscan");
        break;
    case MODE_UDPSCAN:
        strcpy(modestr, "UDPscan");
        break;
    default:
        sprintf(modestr, "Unknown [%d]", mode);
        break;
}
```

**Guidelines:**
- Always break after each case (no fallthrough)
- Always include default case
- Default case handles errors with ERR() or assigns fallback
- Enumerate all known values, use default for unknown

### 7.3 Loop Patterns

```c
// For loop with iterator increment
for (; *str != '\0' && (! isdigit(*str)); str++) {
    switch (*str) {
        // ... cases
    }
}

// For loop with pointer walking
for (ptr=in, psize=0; psize < len; psize++, ptr++) {
    if (psize != 0 && ((psize % 16) == 0)) {
        // ...
    }
}

// While loop with explicit condition
while (worktodo) {
    if (recv_messages(sl.c_socket) < 1) {
        ERR("recv_messages fails, *shrug* no more work todo");
        worktodo=0;
        break;
    }
    // ... work
}

// Infinite loop for cleanup
for (; flhead != NULL; ) {
    ptr=flhead->next;
    xfree(flhead);
    if (ptr == NULL) {
        break;
    }
    flhead=ptr;
}
```

**Guidelines:**
- Prefer for loops for iteration
- Use while for condition-based loops
- Explicitly set loop variable to terminating value before break
- Use `for (;;)` or `for (; condition; )` for specialized loops

### 7.4 Recursive Patterns

```c
// Elegant recursive list traversal
void loop_list(fl_t *node) {
    assert(node != NULL);

    switch (node->c_t) {
        case CTVOID:
            for (node->init(); node->c_u.cmp(); node->inc()) {
                if (node->next) {
                    loop_list(node->next);  // Recurse
                }
                else {
                    _send_packet();         // Leaf action
                }
            }
            break;

        case CTPAYL:
            for (node->init(); node->c_u.gpl(...); node->inc()) {
                if (node->next) {
                    loop_list(node->next);
                }
                else {
                    _send_packet();
                }
            }
            break;

        default:
            terminate("runtime error...");
    }

    return;
}
```

**Guidelines:**
- Use recursion for tree/list traversal when natural
- Base case at leaf (no next pointer)
- Terminate on error conditions
- Explicit return at end even for void functions

---

## 8. MACRO USAGE PATTERNS

### 8.1 Helper Macros

```c
// Clear/zero macro
#define CLEAR(x) memset(&(x), 0, sizeof(x))

// Usage:
CLEAR(modestr);
CLEAR(ret);

// Identifier macro
#undef IDENT
#define IDENT "[SEND]"

// Size format string
#define STFMT "%zu"  // For size_t printf

// Min/Max
#define MIN(a,b) ((a) < (b) ? (a) : (b))
```

**Guidelines:**
- Define convenience macros for common operations
- Always parenthesize macro arguments
- Undef and redefine IDENT per compilation unit
- Use standard names (MIN, MAX, CLEAR)

### 8.2 Flag Manipulation Macros

```c
// Getter pattern - test single bit
#define GET_SHUFFLE()      (s->send_opts & S_SHUFFLE_PORTS)
#define GET_OVERRIDE()     (s->send_opts & S_SRC_OVERRIDE)

// Setter pattern - conditional set/clear
#define SET_SHUFFLE(x)     ((x) ? (s->send_opts |= S_SHUFFLE_PORTS) : (s->send_opts &= ~(S_SHUFFLE_PORTS)))
#define SET_OVERRIDE(x)    ((x) ? (s->send_opts |= S_SRC_OVERRIDE) : (s->send_opts &= ~(S_SRC_OVERRIDE)))

// Usage:
if (GET_SHUFFLE()) {
    shuffle_ports();
}

SET_OVERRIDE(1);
SET_PROMISC(1);
```

**Guidelines:**
- GET macros return boolean result (use directly in if)
- SET macros take boolean parameter
- Consistent naming: SET_XXX pairs with GET_XXX
- Ternary operator for conditional set/clear

### 8.3 Debug Macros

```c
#define DBG(facility, fmt, args...) \
    if ((s->debugmask & (facility)) == facility) { \
        _display(M_DBG, __FILE__, __LINE__, (fmt), ## args); \
    }

#define ISDBG(facility) \
    ((s->debugmask & (facility)) == facility)

// Usage:
DBG(M_WRK, "adding new scan group");

if (ISDBG(M_SND)) {
    // Expensive debug-only computation
    char myhost[256];
    snprintf(myhost, sizeof(myhost) -1, "%s", cidr_saddrstr(...));
    DBG(M_SND, "sending to `%s:%d' from `%s:%u'", ...);
}
```

**Guidelines:**
- Variadic macros with `## args` for GNU extension
- Debug output includes FILE and LINE via macro
- ISDBG for conditional expensive operations
- Facility mask for category-based filtering

---

## 9. PARSING PATTERN

### 9.1 Mode String Parsing

**Observed in scan_parsemode():**

```c
int scan_parsemode(const char *str, uint8_t *mode, uint16_t *flags, ...) {
    const char *walk=NULL;

    // Assertions for all pointers
    assert(str != NULL);
    assert(mode != NULL); assert(flags != NULL);
    assert(sf != NULL); assert(lf != NULL);
    assert(mf != NULL); assert(pps != NULL);

    // Length check
    if (strlen(str) < 1) {
        return -1;
    }

    walk=str;

    // Primary mode character
    if (*walk == 'T') {
        *mode=MODE_TCPSCAN;
        walk++;

        // Optional flags after mode
        if (strlen(walk) > 0) {
            ret=decode_tcpflags(walk);
            if (ret < 0) {
                ERR("bad tcp flags `%s'", str);
                return -1;
            }
            *flags=(uint16_t)ret;

            // Skip to numeric part
            for (;*walk != '\0' && ! isdigit(*walk); walk++) {
                ;
            }
        }
    }
    else if (*walk == 'U') {
        *mode=MODE_UDPSCAN;
        walk++;
    }
    // ... more modes

    // Optional numeric suffix (pps)
    if (*walk == '\0') {
        return 1;
    }

    if (sscanf(walk, "%u", pps) == 1) {
        return 1;
    }

    ERR("bad pps `%s', using default %u", walk, s->pps);
    *pps=s->pps;

    return 1;
}
```

**Pattern for compound modes:**
1. Assert all output parameters non-NULL
2. Validate input not empty
3. Walk pointer through string
4. Parse primary mode character
5. Parse optional modifiers (flags, etc.)
6. Parse optional numeric suffix
7. Error on invalid, use defaults where reasonable
8. Return 1 for success, -1 for error

### 9.2 Flag Decoding Pattern

```c
int decode_tcpflags(const char *str) {
    int ret=0;

    // Walk until end or digit
    for (; *str != '\0' && (! isdigit(*str)); str++) {
        switch (*str) {
            case 'F':
                ret |= TH_FIN;
                break;
            case 'f':
                ret &= ~(TH_FIN);
                break;
            // ... more flags
            default:
                ERR("unknown TCP flag `%c' (FfSsRrPpAaUuEeCc are valid)", *str);
                return -1;
        }
    }

    return ret;
}
```

**Pattern:**
- Uppercase sets bit
- Lowercase clears bit
- Accumulate in int, return final value
- Return -1 on error with descriptive ERR()

---

## 10. DESIGN PHILOSOPHY OBSERVATIONS

### 10.1 Abstraction Through Function Pointers

```c
// Generic loop structure with function pointers
typedef struct fl_t {
    void (*init)(void);
    uint8_t c_t;
    union {
        int (*cmp)(void);
        int (*gpl)(uint16_t, uint8_t **, ...);
    } c_u;
    void (*inc)(void);
    struct fl_t *next;
} fl_t;

// Polymorphic for loop: for (init(); cmp(); inc())
for (node->init(); node->c_u.cmp(); node->inc()) {
    // body
}
```

**Philosophy:** Abstract iteration patterns with function pointers rather than code duplication

### 10.2 Magic Numbers for Robustness

```c
#define WK_MAGIC        0xf4f3f1f2
#define TCP_SEND_MAGIC  0x1a1b1c1d

// Validation on every access
assert(w_u.w->magic == WK_MAGIC);
if (*wk_u.magic == PRI_4SEND_MAGIC) {
    // Process priority workunit
}
```

**Philosophy:** Defend against memory corruption and type confusion with magic numbers

### 10.3 Fail-Safe Defaults

```c
// Default to safe value on parse error
if (sscanf(walk, "%u", pps) == 1) {
    return 1;
}
ERR("bad pps `%s', using default %u", walk, s->pps);
*pps=s->pps;  // Use default, but still report error
return 1;     // Continue operation
```

**Philosophy:** Report errors but continue with safe defaults when possible

### 10.4 Explicit State Machines

```c
// Sender socket mode tracking
#define SOCK_LL 1
#define SOCK_IP 2

union {
    ip_t *ipsock;
    eth_t *llsock;
} s_u;
int sockmode;

// Explicit state transitions
if (sl.sockmode != mode) {
    switch (sl.sockmode) {
        case SOCK_LL:
            eth_close(sl.s_u.llsock);
            sl.s_u.llsock=NULL;
            break;
        case SOCK_IP:
            ip_close(sl.s_u.ipsock);
            sl.s_u.ipsock=NULL;
            break;
    }
}
sl.sockmode=mode;
```

**Philosophy:** Explicit state tracking and clean transitions

---

## 11. COMPOUND MODE IMPLEMENTATION GUIDE

### 11.1 Adding New Mode Character

**Follow this pattern from scanopts.c:**

```c
int scan_parsemode(const char *str, ...) {
    // After existing modes (T, U, A)

    // NEW: Compound mode example
    else if (*walk == 'C') {  // 'C' for compound TCP+UDP
        *mode=MODE_COMPOUND_TU;  // New mode constant
        walk++;

        // Parse modifiers specific to compound
        if (strlen(walk) > 0) {
            // Handle compound-specific syntax
            // Example: C:T<tcpflags>:U for TCP+UDP compound
        }
    }

    // Rest of function unchanged
}
```

### 11.2 Define Mode Constants

```c
// In scan_export.h:
#define MODE_TCPSCAN     1
#define MODE_UDPSCAN     2
#define MODE_ARPSCAN     4
#define MODE_COMPOUND_TU 32  // New compound mode (keep powers of 2)
```

### 11.3 Workunit Magic Numbers

```c
// In workunits.h:
#define COMPOUND_TU_SEND_MAGIC 0x8a8b8c8d
#define COMPOUND_TU_RECV_MAGIC 0xa8b8c8d8
```

### 11.4 Update String Conversion

```c
// In scanopts.c:
char *strscanmode(int mode) {
    static char modestr[64];
    CLEAR(modestr);

    switch (mode) {
        case MODE_TCPSCAN:
            strcpy(modestr, "TCPscan");
            break;
        case MODE_UDPSCAN:
            strcpy(modestr, "UDPscan");
            break;
        // ... existing modes
        case MODE_COMPOUND_TU:
            strcpy(modestr, "TCP+UDPscan");
            break;
        default:
            sprintf(modestr, "Unknown [%d]", mode);
            break;
    }
    return modestr;
}
```

### 11.5 Workunit Creation Pattern

```c
// In workunit_add() - add compound case:

switch (mode) {
    case MODE_TCPSCAN:
        lwu_srch.magic=TCP_RECV_MAGIC;
        send_magic=TCP_SEND_MAGIC;
        break;

    case MODE_COMPOUND_TU:
        lwu_srch.magic=COMPOUND_TU_RECV_MAGIC;
        send_magic=COMPOUND_TU_SEND_MAGIC;
        break;

    // ... rest
}
```

### 11.6 Packet Sending Logic

```c
// In send_packet.c - handle compound workunit:

if (*wk_u.magic == COMPOUND_TU_SEND_MAGIC) {
    open_link(SOCK_IP, &s->ss->target, &s->ss->targetmask);

    DBG(M_WRK, "got compound TCP+UDP workunit");
    s->ss->mode=MODE_COMPOUND_TU;

    // Compound mode: iterate TCP ports, then UDP ports
    // (Custom loop logic in _send_packet)
}
```

---

## 12. STYLE CHECKLIST

Before committing code for compound modes, verify:

### Naming
- [ ] Variables: lowercase_with_underscores
- [ ] Functions: verb_noun pattern
- [ ] Types: name_t suffix
- [ ] Macros: ALL_CAPS
- [ ] Magic numbers: consistent 0xNaNbNcNd pattern

### Structure
- [ ] GPL header with Jack's copyright
- [ ] `#include <config.h>` first
- [ ] Static function prototypes before definitions
- [ ] Static variables after prototypes
- [ ] Public functions before static helpers

### Error Handling
- [ ] Input validation with early returns
- [ ] ERR() for user-facing errors
- [ ] DBG() with appropriate facility (M_WRK, M_SND, etc.)
- [ ] PANIC() only for impossible conditions
- [ ] Return 1 for success, -1 for error

### Data Structures
- [ ] Magic number first in serialized structs
- [ ] Unions for type punning with _u suffix
- [ ] memset after allocation
- [ ] NULL check before free, NULL after free

### Comments
- [ ] Box comments for major sections
- [ ] `/* */` style, not `//`
- [ ] Inline parameter docs in prototypes
- [ ] XXX for warnings/notes

### Control Flow
- [ ] Early returns for validation
- [ ] Switch with default case
- [ ] Explicit loop termination
- [ ] No fallthrough in switch

### Memory
- [ ] xmalloc/xfree wrappers
- [ ] Cleanup in reverse order
- [ ] List traversal with temp pointer

---

## 13. FILE PATHS FOR REFERENCE

**Key files analyzed:**
- `/opt/unicornscan-0.4.7/src/scan_progs/scanopts.c` - Mode parsing
- `/opt/unicornscan-0.4.7/src/scan_progs/send_packet.c` - Packet sending
- `/opt/unicornscan-0.4.7/src/scan_progs/workunits.c` - Workunit management
- `/opt/unicornscan-0.4.7/src/main.c` - Program structure
- `/opt/unicornscan-0.4.7/src/unilib/output.c` - Error handling
- `/opt/unicornscan-0.4.7/src/settings.h` - Main configuration types
- `/opt/unicornscan-0.4.7/src/scan_progs/workunits.h` - Workunit types
- `/opt/unicornscan-0.4.7/src/unilib/output.h` - Debug macros

---

**Document Version:** 1.0
**Last Updated:** 2025-12-23
**Maintainer:** Research Agent analyzing unicornscan codebase
