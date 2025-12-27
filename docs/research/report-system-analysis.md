# Unicornscan Report System Analysis

## Overview
This document analyzes how unicornscan groups, stores, and formats scan results for output.

## Key Files

### Core Report Files
- **`/opt/unicornscan-0.4.7/src/scan_progs/report.c`** - Main report logic (1010 lines)
- **`/opt/unicornscan-0.4.7/src/scan_progs/report.h`** - Report interface
- **`/opt/unicornscan-0.4.7/src/scan_progs/scan_export.h`** - Data structure definitions
- **`/opt/unicornscan-0.4.7/src/scan_progs/options.c`** - Format string defaults

### Supporting Files
- **`/opt/unicornscan-0.4.7/src/scan_progs/master.c`** - Orchestration, calls `report_add()`
- **`/opt/unicornscan-0.4.7/src/scan_progs/recv_packet.c`** - Packet capture and initial processing
- **`/opt/unicornscan-0.4.7/src/unilib/rbtree.c`** - Red-black tree implementation for storage

---

## Data Structures

### IP Report Structure (`ip_report_t`)
```c
typedef struct _PACKED_ ip_report_t {
    uint32_t magic;           // IP_REPORT_MAGIC = 0xd2d19ff2
    uint16_t sport;           // Source port (from target)
    uint16_t dport;           // Destination port (on target)
    uint8_t proto;            // Protocol (IPPROTO_TCP, IPPROTO_UDP, IPPROTO_ICMP)
    uint16_t type;            // ICMP type or TCP flags
    uint16_t subtype;         // ICMP code (unused for TCP/UDP)
    uint32_t send_addr;       // Source IP (scanner)
    uint32_t host_addr;       // Target IP
    uint32_t trace_addr;      // Where packet came from (if different from target)
    uint8_t ttl;              // Time to live from wire
    struct timeval recv_time; // When packet was captured
    void *od_q;               // Output data queue (banners, OS detection)
    uint16_t flags;           // Bad checksum flags
    uint32_t mseq;            // TCP sequence (scanner)
    uint32_t tseq;            // TCP sequence (target)
    uint16_t window_size;     // TCP window size
    uint32_t t_tstamp;        // TCP timestamp (target)
    uint32_t m_tstamp;        // TCP timestamp (scanner)
    struct ip_report_t *next; // Chain for duplicate handling
    uint16_t doff;            // Packet data offset/length
} ip_report_t;
```

### ARP Report Structure (`arp_report_t`)
```c
typedef struct _PACKED_ arp_report_t {
    uint32_t magic;           // ARP_REPORT_MAGIC = 0xd9d82aca
    uint8_t hwaddr[6];        // MAC address
    uint32_t ipaddr;          // IP address
    struct timeval recv_time; // When packet was captured
    void *od_q;               // Output data queue
    uint16_t flags;           // Flags
    uint16_t doff;            // Packet data offset/length
} arp_report_t;
```

---

## Storage Mechanism

### Red-Black Tree Storage
Reports are stored in a **red-black tree** (`report_t`) for efficient lookup and duplicate detection:

```c
static void *report_t = NULL;  // Global red-black tree

void report_init(void) {
    report_t = rbinit(123);  // Initialize tree with expected size hint
}
```

### Key Generation

#### IP Report Key (64-bit)
The key uniquely identifies an IP-based result by combining:
- **Destination host** (32 bits) - Target IP
- **Destination port** (16 bits) - Target port
- **Compressed source host** (16 bits) - XOR of upper and lower 16 bits of source IP

```c
static uint64_t get_ipreport_key(uint32_t dhost, uint16_t dport, uint32_t shost) {
    union {
        struct {
            uint16_t cshost;    // Compressed source host
            uint16_t dport;     // Destination port
            uint32_t dhost;     // Destination host
        } ip;
        uint64_t key;
    } p_u;

    p_u.ip.dhost = dhost;
    p_u.ip.dport = dport;
    p_u.ip.cshost = (uint16_t)(shost >> 16) ^ (shost & 0x0000FFFF);

    return p_u.key;
}
```

**Grouping Behavior**: Results are grouped by **target IP + port + scanner IP**. This means:
- Each unique combination of target IP, port, and scanner creates a new entry
- Duplicate responses to the same target:port from the same scanner are handled based on flags

#### ARP Report Key (64-bit)
The key combines:
- **Destination host** (32 bits) - IP address
- **Compressed MAC address** (32 bits) - XORed bytes of hardware address

```c
static uint64_t get_arpreport_key(uint32_t dhost, uint8_t *dmac) {
    union {
        struct {
            uint32_t dhost;
            uint8_t cmac[4];
        } arp;
        uint64_t key;
    } p_u;

    p_u.arp.cmac[0] = *(dmac)     ^ *(dmac + 1);
    p_u.arp.cmac[1] = *(dmac + 3) ^ *(dmac + 2);
    p_u.arp.cmac[2] = *(dmac + 4);
    p_u.arp.cmac[3] = *(dmac + 5);
    p_u.arp.dhost = dhost;

    return p_u.key;
}
```

**Grouping Behavior**: ARP results are grouped by **IP + MAC address**.

---

## Report Processing Flow

### 1. Packet Reception
`recv_packet.c` captures packets → `packet_parse.c` creates report structures → Sent to master

### 2. Master Processing
`master.c::deal_with_output()` receives reports:
```c
int deal_with_output(void *msg, size_t msg_len) {
    // Validate magic number (IP or ARP)
    // Initialize output data queue
    // Push to JIT report modules
    // Add to report tree via report_add()
}
```

### 3. Report Addition
`report.c::report_add()` handles deduplication and storage:

```c
int report_add(void *o, size_t o_len) {
    // Generate unique key
    rkey = get_ipreport_key(host_addr, sport, send_addr);

    // Check if port is "open" or if processing errors
    if (port_open(proto, type, subtype)) {
        if (rbfind(report_t, rkey, &dummy) != 1) {
            // New entry - insert into tree
            rbinsert(report_t, rkey, copy);

            if (GET_IMMEDIATE()) {
                // Immediate mode: print now
                line = fmtcat(s->ip_imreport_fmt, report);
                OUT("%s", line);
            }
        }
        else if (GET_PROCDUPS()) {
            // Chain duplicate to existing entry
            walk->next = new_copy;

            if (GET_IMMEDIATE()) {
                // Print duplicate immediately
                line = fmtcat(s->ip_imreport_fmt, report);
                OUT("%s", line);
            }
        }
        else {
            // Ignore duplicate
        }
    }
}
```

### 4. Final Report Generation
At scan completion, `report_do()` walks the tree:

```c
void report_do(void) {
    rbwalk(report_t, do_report_nodefunc, 1, NULL);
}

static int do_report_nodefunc(uint64_t rkey, void *ptr, void *cbdata) {
    // Push to report modules (OS detection, etc.)
    push_report_modules(ptr);

    // Grab banners if connect mode
    if (GET_DOCONNECT()) {
        connect_grabbanners(report);
    }

    // Push to output modules (database, etc.)
    push_output_modules(ptr);

    // Display to console
    if (!GET_REPORTQUIET()) {
        display_report(ptr);
    }

    // Process chained duplicates
    if (report->next != NULL) {
        do_report_nodefunc(0, report->next, NULL);
    }
}
```

---

## Immediate Mode vs Final Output

### Immediate Mode (`-I` flag)
- **When**: `GET_IMMEDIATE()` is true
- **Where**: In `report_add()` after inserting into tree
- **Format**: Uses `s->ip_imreport_fmt` or `s->arp_imreport_fmt`
- **Default format**: `"%-8r %h:%p %T ttl %t"` (compact, one line per result)
- **Behavior**: Prints results as soon as they arrive, **in addition to** final output

### Final Output (Default)
- **When**: At scan completion via `report_do()`
- **Where**: `rbwalk()` traverses entire tree
- **Format**: Uses `s->ip_report_fmt` or `s->arp_report_fmt`
- **Default format**: `"%-8r\t%16P[%5p]\t\tFrom %h %T ttl %t"` (detailed, formatted)
- **Behavior**: Prints all results once, in tree order (sorted by key)

### Key Difference
Immediate mode shows results **as they arrive** (real-time feedback), while final output shows results **sorted and organized** at the end.

---

## Current Grouping Behavior

### How Results Are Currently Grouped

**By Unique Key**: Results are organized by the 64-bit key which combines:
- **Target IP** (most significant)
- **Target Port**
- **Scanner IP** (compressed)

**Tree Ordering**: Red-black tree stores entries in **key order**, which effectively groups by:
1. First by target IP (primary sort)
2. Then by port within each IP
3. Then by scanner IP (for distributed scans)

**Duplicate Handling**:
- **Default**: Ignore duplicates (same target:port)
- **With `-c` flag**: Chain duplicates via `report->next` pointer
- **No per-protocol grouping**: TCP, UDP, and ICMP are intermixed based on key value

### What Is NOT Grouped
- **No protocol separation**: TCP port 80 and UDP port 80 are separate entries, but not grouped together
- **No IP-level grouping**: Results for 192.168.1.1:22 and 192.168.1.1:80 are separate tree nodes
- **No port range grouping**: Each port is a separate entry

---

## Output Format Strings

### Default Formats (from `options.c`)
```c
s->ip_report_fmt    = "%-8r\t%16P[%5p]\t\tFrom %h %T ttl %t";
s->ip_imreport_fmt  = "%-8r %h:%p %T ttl %t";
s->arp_report_fmt   = "%M (%o) is %h";
s->arp_imreport_fmt = "%h at %M";
```

### Format Specifiers (from `report.c::fmtcat()`)
- **`%h`** - Target host IP address
- **`%hn`** - Target host (DNS name if available)
- **`%p`** - Target port number
- **`%pn`** - Target port (service name if available)
- **`%P`** - Padded target IP address
- **`%L`** - Local (scanner) port
- **`%Ln`** - Local port (service name)
- **`%r`** - Response type (e.g., "TCP open", "ICMP:T03C03")
- **`%s`** - Source (scanner) IP address
- **`%sn`** - Source (DNS name)
- **`%t`** - TTL value
- **`%T`** - Trace address (if different from target)
- **`%Tn`** - Trace address (DNS name)
- **`%w`** - TCP window size
- **`%S`** - TCP sequence number (hex)
- **`%M`** - MAC address (ARP only)
- **`%o`** - OUI vendor name (ARP only)
- **`%C`** - Country code (GeoIP, if available)

### Escape Sequences
- **`\n`** - Newline
- **`\t`** - Tab
- **`\r`** - Carriage return
- **`\a`** - Alert/bell
- **`\b`** - Backspace
- **`\f`** - Form feed
- **`\v`** - Vertical tab
- **`\\`** - Backslash

### Response Type Translation (`%r`)
When `GET_DOTRANS()` is enabled (default):
- **TCP SYN+ACK** → "TCP open"
- **TCP RST+ACK** → "TCP closed"
- **UDP response** → "UDP open"
- **ICMP Type 3 Code 3** → "UDP closed"

Without translation:
- **TCP** → "TCP" + flags (e.g., "TCPSA" for SYN+ACK)
- **ICMP** → "ICMP:T{type}C{code}" (e.g., "ICMP:T03C03")
- **Other IP** → "IP:P{proto}T{type}S{subtype}"

---

## Port State Detection

### Open Port Detection (`port_open()`)
```c
static int port_open(uint8_t proto, uint16_t type, uint16_t subtype) {
    switch (proto) {
        case IPPROTO_TCP:
            if ((type & (TH_SYN|TH_ACK)) == (TH_SYN|TH_ACK)) {
                return 1;  // SYN+ACK = open
            }
            break;

        case IPPROTO_UDP:
            return 1;  // Any UDP response = open
            break;
    }
    return 0;
}
```

### Closed Port Detection (`port_closed()`)
```c
static int port_closed(uint8_t proto, uint16_t type, uint16_t subtype) {
    switch (proto) {
        case IPPROTO_TCP:
            if ((type & (TH_ACK|TH_RST)) == (TH_ACK|TH_RST)) {
                return 1;  // RST+ACK = closed
            }
            break;

        case IPPROTO_ICMP:
            if (type == 3 && subtype == 3) {
                return 1;  // Port unreachable = closed
            }
            break;
    }
    return 0;
}
```

**Filter Behavior**:
- **Default**: Only "open" ports stored and reported
- **With `-e` flag** (`GET_PROCERRORS()`): Closed/error responses also stored
- **ICMP errors**: Only stored if `-e` is set

---

## Output Example Analysis

### Default IP Output
```
TCP open    192.168.1.100[   22]         From 10.0.0.1  ttl 64
```
Format: `"%-8r\t%16P[%5p]\t\tFrom %h %T ttl %t"`
- `%-8r` → "TCP open" (left-aligned, 8 chars)
- `%16P` → "192.168.1.100" (right-aligned, 16 chars)
- `%5p` → "22" (right-aligned, 5 chars)
- `%h` → "10.0.0.1" (scanner IP)
- `%t` → "64" (TTL)

### Immediate Mode IP Output
```
TCP open 192.168.1.100:22  ttl 64
```
Format: `"%-8r %h:%p %T ttl %t"`
- More compact, shows results as they arrive

### ARP Output
```
00:11:22:33:44:55 (Dell Inc.) is 192.168.1.1
```
Format: `"%M (%o) is %h"`
- `%M` → MAC address
- `%o` → OUI vendor name
- `%h` → IP address

---

## Configuration Flags Affecting Output

### Report Behavior Flags (in `settings.h`)
```c
#define M_PROC_ERRORS   1    // Process ICMP errors and TCP resets
#define M_IMMEDIATE     2    // Display as received (immediate mode)
#define M_DO_CONNECT    32   // Grab banners from open TCP ports
#define M_REPORT_QUIET  64   // Suppress console output (modules only)
#define M_DO_DNS        256  // Reverse DNS lookups in reports
#define M_DO_TRANS      512  // Translate to "open"/"closed" strings
#define M_PROC_DUPS     1024 // Chain duplicate reports
```

### Access Macros
```c
GET_PROCERRORS()   // -e flag: Include errors/closed ports
GET_IMMEDIATE()    // -I flag: Show results immediately
GET_DOCONNECT()    // -b flag: Connect and grab banners
GET_REPORTQUIET()  // -q flag: Quiet mode (no console output)
GET_DODNS()        // DNS lookups in output
GET_DOTRANS()      // Translate response types (default on)
GET_PROCDUPS()     // -c flag: Process duplicate responses
```

---

## Implications for IP Grouping Feature

### Current Limitations
1. **No IP-level aggregation**: Each port creates a separate tree entry
2. **No multi-port summary**: Cannot show "IP has ports 22,80,443 open"
3. **Key design prevents grouping**: Key includes port, so same IP/different ports = different nodes
4. **Tree walk is sequential**: Results printed in key order, not grouped by IP

### To Add IP-Based Grouping
Would need to:

1. **Add secondary grouping structure**:
   - After tree population, walk tree and group by IP
   - Create IP→ports mapping structure
   - Sort ports within each IP

2. **Modify `report_do()` to aggregate**:
   - Walk tree collecting all entries for each unique IP
   - Group ports by protocol (TCP, UDP, ICMP)
   - Format as: `IP: tcp(22,80,443) udp(53,161)`

3. **Keep immediate mode separate**:
   - Immediate mode shows individual ports (real-time)
   - Final report shows grouped by IP (summary)

4. **Handle mixed scan types**:
   - TCP and UDP can have same port number
   - Need protocol prefix: `tcp(22,80) udp(53,161)`

### Format String Considerations
- Current format strings are per-port
- Would need new format string for IP-grouped output
- Could use: `"%h: tcp(%p,%p,%p) udp(%p,%p)"`
- Or more readable: `"%h has %d ports open: tcp(%p-%p,%p) udp(%p)"`

---

## Summary

### Current Grouping: Per-Port Entries
- **Storage**: Red-black tree with 64-bit key (IP+port+source)
- **Ordering**: By key value (effectively IP primary, port secondary)
- **Display**: One line per unique target IP:port combination
- **Duplicates**: Optional chaining via `->next` pointer

### Immediate vs Final Output
- **Immediate** (`-I`): Real-time display as packets arrive
- **Final**: Tree walk at scan end (sorted, complete)
- Both use same storage structure

### Data Structures
- **`ip_report_t`**: Rich structure with TCP state, timing, TTL, etc.
- **`arp_report_t`**: MAC and IP mapping
- **`od_q`**: Queue for banners, OS detection data

### Output Formatting
- Highly customizable via format strings
- Supports DNS lookup, service name translation
- GeoIP integration available (libmaxminddb)
- Protocol-aware state translation (open/closed)

### Key Insight for IP Grouping
The current architecture stores results per-port in a red-black tree. To group by IP, we would need a **post-processing aggregation step** that:
1. Walks the tree collecting all ports for each unique IP
2. Groups ports by protocol type
3. Generates a summarized output format

This would be a new feature on top of the existing per-port storage, not a replacement of it.
