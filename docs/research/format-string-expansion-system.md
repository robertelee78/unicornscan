# Unicornscan Format String Expansion System

**Research Date:** 2025-12-24
**Scope:** Understanding the %M, %h, %o and other format specifiers used in report format strings
**Primary Files:** `src/scan_progs/report.c`, `src/scan_progs/portfunc.c`, `src/FMTCAT_ARGS`

## Executive Summary

Unicornscan uses a custom format string expansion system implemented in the `fmtcat()` function (`report.c:564-919`) to generate flexible output reports. This system supports custom format specifiers for both IP scan reports and ARP scan reports, with printf-style formatting modifiers.

## Core Implementation

### Main Function: `fmtcat()`

**Location:** `/opt/unicornscan-0.4.7/src/scan_progs/report.c:564-919`

**Signature:**
```c
static char *fmtcat(const char *fmt, const void *report);
```

**Purpose:** Expands format strings containing custom specifiers into formatted output strings.

**Implementation Details:**

1. **State Machine Parser:**
   - `state=0`: Normal character copying
   - `state=1`: Format specifier processing (after `%`)
   - `state=2`: Escape sequence processing (after `\`)

2. **Dynamic Memory Management:**
   - Starts with 128-byte buffer
   - Doubles size when needed (cursz *= 2)
   - Uses macros `KEH(x)` and `KEHSTR(x)` for safe expansion

3. **printf-style Modifiers Support:**
   - Supports `-`, `0`, ` ` (space) flags
   - Supports field width specifiers (up to 999 digits)
   - Examples: `%16P`, `%-8r`, `%5p`

## Complete Format Specifier Reference

### IP Report Format Specifiers

| Specifier | Meaning | Example Output | Notes |
|-----------|---------|----------------|-------|
| `%h` | Host IP address | `192.168.1.1` | Target IP |
| `%hn` | Host DNS name | `example.com` | Requires `-Gn` option + DNS lookup |
| `%p` | Port number | `80` | Target port |
| `%pn` | Port service name | `http` | From `/etc/unicorn/ports.txt` |
| `%L` | Local port | `53` | Source/local port |
| `%Ln` | Local service name | `domain` | Service name for local port |
| `%s` | Source IP address | `10.0.0.1` | Sender IP |
| `%sn` | Source DNS name | `scanner.local` | DNS name of sender |
| `%r` | Response type | `TCP open` | Formatted response (see below) |
| `%t` | TTL value | `64` | IP Time-To-Live |
| `%T` | Trace IP address | `192.168.1.254` | Gateway/intermediate hop |
| `%Tn` | Trace DNS name | `gateway.local` | DNS name of trace address |
| `%S` | TCP sequence number | `a1b2c3d4` | In hexadecimal |
| `%w` | TCP window size | `65535` | TCP window |
| `%C` | Country code | `US` | From GeoIP database (MaxMindDB) |

### ARP Report Format Specifiers

| Specifier | Meaning | Example Output | Notes |
|-----------|---------|----------------|-------|
| `%M` | MAC address | `00:11:22:33:44:55` | Hardware address |
| `%o` | OUI vendor name | `Intel Corp.` | From `/etc/unicorn/oui.txt` |
| `%h` | IP address | `192.168.1.1` | IP assigned to MAC |
| `%hn` | DNS name | `host.local` | DNS name of IP |

### Universal Specifiers

| Specifier | Meaning | Notes |
|-----------|---------|-------|
| `%%` | Literal `%` | Escape character |

### Escape Sequences

| Sequence | Output | Notes |
|----------|--------|-------|
| `\t` | Tab | Horizontal tab |
| `\n` | Newline | Line feed |
| `\r` | Carriage return | CR |
| `\v` | Vertical tab | VT |
| `\a` | Bell/Alert | BEL |
| `\b` | Backspace | BS |
| `\f` | Form feed | FF |
| `\\` | Literal backslash | Escape |

## Default Format Strings

**Location:** `/opt/unicornscan-0.4.7/src/scan_progs/options.c:76-79`

```c
s->ip_report_fmt    = "%-8r\t%16P[%5p]\t\tFrom %h %T ttl %t";
s->ip_imreport_fmt  = "%-8r %h:%p %T ttl %t";
s->arp_report_fmt   = "%M (%o) is %h";
s->arp_imreport_fmt = "%h at %M";
```

### Format Types

1. **`ip:`** - IP scan final report format
2. **`imip:`** - IP scan immediate report format (with `-i` option)
3. **`arp:`** - ARP scan final report format
4. **`imarp:`** - ARP scan immediate report format (with `-i` option)

## Response Type Formatting (`%r`)

**Implementation:** `strresptype()` at `report.c:921-943`

### With Translation (`GET_DOTRANS()` enabled - default)

- **Open ports:** `"TCP open"` or `"UDP open"`
- **Closed ports:** `"TCP closed"` or `"ICMP closed"`

### Without Translation

- **TCP:** `"TCP[FSRPAUEC]"` - Shows TCP flags
  - F=FIN, S=SYN, R=RST, P=PSH, A=ACK, U=URG, E=ECE, C=CWR
  - Example: `"TCP-SA---"` for SYN+ACK
- **ICMP:** `"ICMP:T03C03"` - Type and Code in hex
- **Other:** `"IP:P06T0002S0000"` - Protocol, Type, Subtype

## Helper Functions

### 1. `getservname()` - Port to Service Name Resolution

**Location:** `src/scan_progs/portfunc.c:210-308`

**Purpose:** Converts port numbers to service names

**Data Source:** `/etc/unicorn/ports.txt`

**Format:** Standard `/etc/services` format:
```
http 80/tcp
domain 53/udp
```

**Implementation:**
- Uses red-black tree cache for performance
- Searches file on cache miss
- Returns "unknown" if not found
- Protocol-aware (TCP vs UDP)

### 2. `getouiname()` - MAC OUI to Vendor Name

**Location:** `src/scan_progs/portfunc.c:310-347`

**Purpose:** Converts MAC address first 3 octets to vendor name

**Data Source:** `/etc/unicorn/oui.txt` (OUI_CONF)

**Format:**
```
00-11-22:Vendor Name
AA-BB-CC:Another Vendor
```

**Implementation:**
- Linear file search (no caching - marked as "slow and bad")
- Parses hex octets separated by dashes
- Returns "unknown" if not found
- Returns "error" if file cannot be opened

### 3. `fmtcat_ip4addr()` - IP Address Formatting

**Location:** `src/scan_progs/report.c:537-562`

**Purpose:** Converts 32-bit IP to string, optionally with DNS lookup

**Behavior:**
- If `doname==1` and `GET_DODNS()` enabled: Perform reverse DNS lookup
- Otherwise: Return dotted-decimal IP address
- Uses `stddns_getname()` for DNS resolution

### 4. `strtcpflgs()` - TCP Flags to String

**Location:** `src/unilib/pktutil.c:136-151`

**Purpose:** Converts TCP flags bitmask to readable string

**Format:** 8-character string with flags or dashes
```
Position: 01234567
Flags:    FSRPAUEC
Example:  -SA-----  (SYN+ACK)
```

## Advanced Features

### 1. GeoIP Country Lookup (`%C`)

**Location:** `report.c:660-704`

**Requirements:**
- Compiled with `HAVE_LIBMAXMINDDB`
- MaxMind GeoIP2/GeoLite2 database installed

**Database Search Order:**
1. `$GEOIP_DATABASE` environment variable
2. Configure-time path (`--with-geoip-db`)
3. Standard paths:
   - `/usr/share/GeoIP/`
   - `/var/lib/GeoIP/`
   - `/usr/local/share/GeoIP/`
4. CONF_DIR fallback

**Supported Databases:**
- GeoLite2-Country.mmdb
- GeoIP2-Country.mmdb
- dbip-country-lite.mmdb
- IP2LOCATION-LITE-DB1.mmdb

**Output:**
- 2-letter ISO country code (e.g., "US", "GB", "JP")
- "??" if country not found or database unavailable

### 2. DNS Name Resolution

**Specifiers:** `%hn`, `%sn`, `%Tn`, `%Ln`, `%pn`

**Requirements:**
- Append `n` to IP/port specifier
- Enable with `-Gn` command-line option
- Uses `stddns_getname()` from standard DNS module

**Behavior:**
- If DNS disabled: Falls back to IP address/port number
- If lookup fails: Returns IP address/port number
- Caches results for performance

## Usage Examples

### Example 1: Default IP Report
```bash
Format: "%-8r\t%16P[%5p]\t\tFrom %h %T ttl %t"
Output: "TCP open        192.168.1.1[  80]          From 10.0.0.1  ttl 64"
```

### Example 2: Custom ARP Format
```bash
Format: "%M (%o) is %h"
Output: "00:11:22:33:44:55 (Intel Corp.) is 192.168.1.100"
```

### Example 3: DNS-Enabled Format
```bash
Format: "%hn:%pn is %r"
Output: "www.example.com:http is TCP open"
# Requires: unicornscan -Gn [other options]
```

### Example 4: GeoIP Format
```bash
Format: "%h [%C] port %p is %r"
Output: "8.8.8.8 [US] port 53 is UDP open"
# Requires: GeoIP database installed
```

### Example 5: Detailed TCP Info
```bash
Format: "%h:%p %r seq:%S win:%w ttl:%t"
Output: "192.168.1.1:80 TCP-SA--- seq:a1b2c3d4 win:65535 ttl:64"
```

## Setting Custom Formats

### Command-Line

```bash
# IP scan format
unicornscan -eip:"%h:%p is %r" 192.168.1.0/24

# ARP scan format
unicornscan -earp:"%M (%o) at %h" 192.168.1.0/24

# Immediate report format
unicornscan -eimip:"%h:%p %r" -i 192.168.1.0/24
```

### Configuration File

In `/etc/unicorn/unicorn.conf`:
```
ip_report_format = "%h:%p %r ttl:%t"
arp_report_format = "%M (%o) is %h"
```

### API (Programmatic)

```c
scan_setformat("ip:%h:%p is %r");
scan_setformat("arp:%M (%o) at %h");
```

**Implementation:** `src/scan_progs/options.c:133-172`

## Code Flow for Report Generation

### 1. Report Collection
```
packet_parse.c:parse_*()
  → report_add()
    → rbinsert(report_t, key, report_struct)
```

### 2. Report Output
```
report_do() / report_do_arp()
  → rbwalk(report_t, do_report_nodefunc/do_arpreport_nodefunc)
    → display_report()
      → fmtcat(format_string, report_struct)
        → OUT("%s", formatted_line)
```

### 3. Format Expansion Process
```
fmtcat(fmt, report)
  1. Parse format string character-by-character
  2. Detect '%' and enter state=1
  3. Extract printf modifiers (-, 0, width)
  4. Switch on format specifier character
  5. Call helper functions:
     - fmtcat_ip4addr() for IPs
     - getservname() for port names
     - getouiname() for MAC vendors
     - strresptype() for response types
  6. Format with snprintf() using ofmt
  7. Append to output buffer (with dynamic growth)
  8. Return formatted string
```

## Memory Management

### Buffer Growth Strategy
```c
cursz = 128;                    // Initial size
outline = xmalloc(cursz);

// When space needed:
if (outoff + needed > cursz) {
    cursz *= 2;                 // Double the size
    outline = realloc(outline, cursz);
}
```

### String Expansion Macros
```c
#define KEH(x)      // Add single character
#define KEHSTR(x)   // Add string with growth check
```

## Performance Characteristics

### Caching Strategies

1. **Service Name Cache** (`getservname()`):
   - Red-black tree indexed by (proto, port)
   - O(log n) lookup after first access
   - Persistent across all reports

2. **OUI Lookup** (`getouiname()`):
   - **NO CACHING** - linear file scan every time
   - O(n) where n = number of OUI entries (~35,000)
   - **Performance Issue:** Author notes "slow and bad"

3. **GeoIP Lookup** (`%C`):
   - Memory-mapped database (MMDB_MODE_MMAP)
   - Efficient binary tree lookup
   - Database kept open for scan duration

### Optimization Opportunities

1. **OUI Caching:** Could implement hash table or red-black tree like service names
2. **DNS Caching:** Already implemented in `stddns_*()` functions
3. **Format String Pre-parsing:** Could compile format strings once

## Error Handling

### Invalid Specifiers
- Prints to stderr: `"unknown format string character 'X'"`
- Continues processing rest of format string

### Missing Data Files
- Service names: Returns "error" or "unknown"
- OUI names: Returns "error" or "unknown"
- GeoIP: Returns "??" for country lookups

### Invalid Report Types
- Checks magic number (IP_REPORT_MAGIC vs ARP_REPORT_MAGIC)
- Skips incompatible format specifiers silently
- Example: `%M` in IP report → no output for that specifier

## Integration Points

### 1. Settings Structure
```c
struct settings_t {
    char *ip_report_fmt;      // Default IP format
    char *ip_imreport_fmt;    // Immediate IP format
    char *arp_report_fmt;     // Default ARP format
    char *arp_imreport_fmt;   // Immediate ARP format
    // ...
};
```

### 2. Report Structures

**IP Report:**
```c
typedef struct ip_report_t {
    uint32_t magic;           // IP_REPORT_MAGIC
    uint32_t host_addr;       // %h
    uint16_t sport;           // %p
    uint16_t dport;           // %L
    uint32_t send_addr;       // %s
    uint32_t trace_addr;      // %T
    uint8_t ttl;              // %t
    uint8_t proto;            // For %r
    uint16_t type;            // For %r
    uint16_t subtype;         // For %r
    uint32_t tseq;            // %S (TCP only)
    uint16_t window_size;     // %w (TCP only)
    // ...
} ip_report_t;
```

**ARP Report:**
```c
typedef struct arp_report_t {
    uint32_t magic;           // ARP_REPORT_MAGIC
    uint32_t ipaddr;          // %h
    uint8_t hwaddr[6];        // %M, %o
    // ...
} arp_report_t;
```

## Configuration Files

### 1. OUI Database (`/etc/unicorn/oui.txt`)

**Format:**
```
# Comment lines start with #
00-00-0C:Cisco Systems, Inc
00-01-02:3Com Corporation
00-50-56:VMware, Inc.
```

**Generation:** Updated from IEEE OUI registry

**Reference:** Defined as `OUI_CONF` in `src/unicorn_defs.h:69`

### 2. Port Numbers (`/etc/unicorn/ports.txt`)

**Format:** Standard `/etc/services` format
```
# service port/protocol [aliases]
http 80/tcp www
domain 53/udp nameserver
domain 53/tcp nameserver
```

**Reference:** Defined as `PORT_NUMBERS` macro

## Compound Mode Behavior

### ARP Report Timing
- **Single-phase mode:** ARP reports use immediate format (`arp_imreport_fmt`)
- **Compound mode:** ARP reports suppressed during phase 1
  - Collection continues during ARP phase
  - Output delayed until `report_do_arp()` called
  - Reports sorted by IP address (via get_arpreport_key())
  - Final output uses standard format (`arp_report_fmt`)

**Code Reference:** `report.c:354` - immediate output check:
```c
if (GET_IMMEDIATE() && s->num_phases <= 1) {
    line=fmtcat(s->arp_imreport_fmt, o_u.a);
    // ...
}
```

## Common Format String Patterns

### Minimal Information
```
"%h:%p"                           # Simple host:port
"%M is %h"                        # MAC and IP only
```

### Standard Formats
```
"%-8r %h:%p"                      # Response type, host:port
"%M (%o) is %h"                   # MAC (vendor) is IP
```

### Detailed Formats
```
"%h:%p %r seq:%S win:%w ttl:%t"   # Full TCP details
"%h [%C] :%pn is %r"              # IP with GeoIP and service name
```

### Custom Analysis Formats
```
"%h\t%p\t%r\t%t"                  # Tab-separated for parsing
"%C,%h,%p,%r"                     # CSV format
```

## Best Practices

### 1. Format String Design
- Use field width modifiers for aligned output: `%-8r %16h`
- Include context labels: `"host %h port %p is %r"`
- Use escape sequences for structure: `\t` for tabs

### 2. DNS Lookups
- Only use `n` suffix when necessary (adds latency)
- Enable with `-Gn` option explicitly
- Consider performance impact on large scans

### 3. GeoIP Usage
- Verify database installation before using `%C`
- Falls back gracefully to "??" if unavailable
- No performance penalty if database missing

### 4. Service Name Resolution
- Efficient due to caching
- Safe to use `%pn` and `%Ln` liberally
- Returns "unknown" for unregistered ports

## Limitations and Known Issues

### 1. OUI Lookup Performance
- **Issue:** Linear file scan on every lookup, no caching
- **Impact:** Slow for large ARP scans
- **Workaround:** Consider removing `%o` from format for large scans
- **Source:** Comment in code: "this is slow and bad" (`portfunc.c:315`)

### 2. Static Buffer Sizes
- Service names: 64 bytes max
- OUI vendor names: 64 bytes max
- Temporary buffers: 256 bytes
- Can truncate very long names

### 3. Format String Length
- No explicit limit documented
- Dynamic buffer growth should handle arbitrary lengths
- Practical limit: available memory

### 4. Error Reporting
- Unknown specifiers print to stderr
- May not be visible in redirected output
- No validation before scan starts

## Future Enhancement Opportunities

### 1. Format String Compiler
- Pre-parse format strings at initialization
- Build execution plan to avoid repeated parsing
- Validate format strings early

### 2. OUI Lookup Optimization
- Implement hash table or red-black tree cache
- Load entire OUI file into memory at startup
- Potentially 100-1000x speedup

### 3. Additional Specifiers
- `%A` - Application/banner detection
- `%O` - Operating system fingerprint
- `%R` - RTT (round-trip time)
- `%D` - Discovery method (ARP/ICMP/TCP)

### 4. Format String Profiles
- Predefined formats for common use cases
- User-savable format profiles
- Context-aware defaults (ARP vs TCP vs UDP)

## Testing and Validation

### Format String Test Cases

```bash
# Test basic IP specifiers
unicornscan -eip:"%h:%p" 192.168.1.1:80

# Test field width modifiers
unicornscan -eip:"%-20h %5p" 192.168.1.1:80

# Test ARP specifiers
unicornscan -mU -earp:"%M (%o) is %h" 192.168.1.0/24

# Test escape sequences
unicornscan -eip:"%h\t%p\t%r\n" 192.168.1.1:80

# Test DNS resolution
unicornscan -Gn -eip:"%hn:%pn" 192.168.1.1:80

# Test GeoIP
unicornscan -eip:"%h [%C]" 8.8.8.8:53
```

## Related Files and Functions

### Primary Files
- `/opt/unicornscan-0.4.7/src/scan_progs/report.c` - Main format expansion
- `/opt/unicornscan-0.4.7/src/scan_progs/portfunc.c` - Helper functions
- `/opt/unicornscan-0.4.7/src/scan_progs/options.c` - Format setting
- `/opt/unicornscan-0.4.7/src/unilib/pktutil.c` - TCP flag formatting

### Support Files
- `/opt/unicornscan-0.4.7/src/FMTCAT_ARGS` - Format specifier reference
- `/opt/unicornscan-0.4.7/src/unicorn_defs.h` - Configuration paths
- `/opt/unicornscan-0.4.7/src/settings.h` - Settings structure

### Data Files
- `/etc/unicorn/oui.txt` - MAC vendor database
- `/etc/unicorn/ports.txt` - Port to service mapping
- `/usr/share/GeoIP/*.mmdb` - GeoIP databases

## References

### Function Locations
- `fmtcat()` - `report.c:564-919`
- `fmtcat_ip4addr()` - `report.c:537-562`
- `getservname()` - `portfunc.c:210-308`
- `getouiname()` - `portfunc.c:310-347`
- `strtcpflgs()` - `pktutil.c:136-151`
- `strresptype()` - `report.c:921-943`
- `scan_setformat()` - `options.c:133-172`

### Key Constants
- `IP_REPORT_MAGIC` - IP report type identifier
- `ARP_REPORT_MAGIC` - ARP report type identifier
- `OUI_CONF` - `/etc/unicorn/oui.txt`
- `PORT_NUMBERS` - `/etc/unicorn/ports.txt`

---

**Document Status:** Complete
**Validation:** Code analysis completed, all format specifiers documented
**Next Steps:** Consider implementing OUI caching optimization
