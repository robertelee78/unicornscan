# Unicornscan 0.4.7 Modernization Analysis

**Jack Louis's Final Release - Resurrecting for Modern Linux**

This document captures comprehensive analysis for modernizing Unicornscan 0.4.7
to compile and run on modern Linux systems (tested with GCC 15.2.0).

---

## 1. What Unicornscan Is

Unicornscan is an **asynchronous stateless network scanner** designed for high-speed
network reconnaissance. Unlike synchronous scanners that wait for responses,
Unicornscan separates the sender and listener into distinct processes, allowing
it to achieve much higher packet rates.

### Key Architecture Features
- **Asynchronous Design**: Sender and listener are separate processes
- **Distributed Scanning**: "Drone" architecture for coordinated multi-host scanning
- **Modular System**: Dynamically loadable payload, output, and report modules
- **Raw Packet Injection**: Uses libdnet for crafting packets at any layer
- **Passive Response Collection**: Uses libpcap for efficient packet capture

---

## 2. Capabilities to Preserve

Every feature listed here MUST continue to work after modernization.

### 2.1 Scan Modes (src/scan_progs/scan_export.h)
| Mode | Flag | Description |
|------|------|-------------|
| TCP  | `-mT` | SYN scanning with customizable TCP flags |
| UDP  | `-mU` | UDP scanning with protocol-specific payloads |
| ARP  | `-mA` | Layer 2 ARP scanning for local networks |
| ICMP | `-mI` | ICMP echo/timestamp/etc scanning |
| IP   | `-mIP`| Raw IP protocol scanning |

### 2.2 TCP Flag Customization
Full control over TCP flags via `-T` option:
- `sf` = SYN+FIN (NULL scan variant)
- `s` = SYN only (standard half-open)
- `a` = ACK only (firewall mapping)
- `f` = FIN only (stealthy probing)
- Custom combinations supported

### 2.3 Rate Control & Timing
- **Packets Per Second (PPS)**: `-r <rate>` - default 300
- **Delay Types**: TSC, GTOD, sleep-based timing
- **Scan Repeats**: `-R <count>` - repeat entire scan
- **Packet Timeout**: `-w <seconds>` - response wait time

### 2.4 Network Layer Control
- **Source Address Spoofing**: `-s <ip>`
- **TTL Control**: `-t <ttl>` and TTL range scanning (`-t 1-64`)
- **ToS/DSCP**: `-O <tos>` for traffic classification
- **Broken CRC**: `-b` for firewall evasion testing
- **Source Port**: `-e <port>` for consistent source ports

### 2.5 Distributed Scanning (Drone Architecture)
Defined in `src/unilib/drone.h`:
```
DRONE_TYPE_SENDER   (1)  - Sends probe packets
DRONE_TYPE_LISTENER (2)  - Collects responses
DRONE_TYPE_OUTPUT   (4)  - Processes and stores results
DRONE_TYPE_SNODE    (8)  - Coordinator node
```
Drones communicate via IPC (Unix sockets or TCP).

### 2.6 Payload Modules (src/payload_modules/)
Protocol-specific payloads for triggering responses:
| Module | Protocol | Purpose |
|--------|----------|---------|
| http.c | HTTP | GET request payload |
| httpexp.c | HTTP | Extended HTTP probing |
| rdns.c | DNS | Reverse DNS queries |
| sip.c | SIP | VoIP device discovery |
| upnp.c | UPnP | IoT/router discovery |
| ntalk.c | Talk | Legacy talk protocol |
| defcon_demo/ | Various | Advanced exploitation demos |
| libunirainbow/ | Various | Rainbow table integration |

### 2.7 Output Modules (src/output_modules/)
| Module | Description |
|--------|-------------|
| database/pgsqldb.c | PostgreSQL result storage |

### 2.8 Report Modules (src/report_modules/)
| Module | Description |
|--------|-------------|
| osdetect/ | Passive OS fingerprinting from responses |

### 2.9 Additional Capabilities
- **pcap Reading**: `-r <file>` - analyze existing captures
- **pcap Writing**: `-W <file>` - save raw traffic
- **Custom pcap Filters**: `-p <filter>` - BPF filter expressions
- **Interface Selection**: `-i <interface>`
- **Port Specification**: `-p <ports>` - ranges, lists, exclusions
- **CIDR Support**: Target specification with `/netmask`
- **Banner Grabbing**: TCP connect mode for service identification
- **Fingerprint Database**: External fingerprint file support

---

## 3. Build System Issues

### 3.1 CRITICAL: Build-Blocking Error

**Location**: `libs/libdnet-1.10/src/tun-linux.c`

**Error**:
```
tun-linux.c:88:17: error: implicit declaration of function 'writev'
tun-linux.c:102:17: error: implicit declaration of function 'readv'
```

**Root Cause**: Missing include for POSIX scatter/gather I/O functions.

**Fix Required**: Add `#include <sys/uio.h>` near line 25.

### 3.2 Autoconf/Automake Issues

**File**: `configure.ac`
- Uses deprecated `AC_TRY_COMPILE` (should be `AC_COMPILE_IFELSE`)
- `libtool.m4` dates from 2004 - may cause issues with modern libtool

**Files**: Various `Makefile.in` files
- Generally compatible but may need tweaks for modern make

### 3.3 Compiler Strictness (GCC 15.2.0)

Modern GCC is much stricter. Warnings that become errors:
- Uninitialized variables in libdnet (addr.c, addr-util.c)
- Pointer signedness mismatches (`socklen_t*` vs `int*`)
- Format truncation in snprintf calls
- Implicit function declarations

---

## 4. Deprecated Functions - Full Analysis

"Deprecated" here means functions that have known flaws and SHOULD NOT be used
in new code. These aren't just style issues - they have real problems:

### 4.1 inet_ntoa() - 15 files affected

**Problem**: Returns pointer to static buffer. NOT thread-safe. If you call it
twice, the second call overwrites the first result. This causes bugs like:
```c
printf("%s -> %s", inet_ntoa(src), inet_ntoa(dst));  // BROKEN! Same value twice
```

**Affected Files**:
1. `src/scan_progs/send_packet.c`
2. `src/scan_progs/workunits.c`
3. `src/scan_progs/connect.c`
4. `src/scan_progs/packet_parse.c`
5. `src/scan_progs/report.c`
6. `src/output_modules/database/pgsqldb.c`
7. `src/payload_modules/http.c`
8. `src/payload_modules/defcon_demo/stage2/sc_server.c`
9. `src/report_modules/osdetect/module.c`
10. `src/tools/attic/unicycle.c`
11. `src/tools/fantaip.c`
12. `src/tools/fpdb.c`
13. `src/unilib/arch.c`
14. `src/unilib/route.c`
15. `src/unilib/socktrans.c`

**Replacement**: `inet_ntop(AF_INET, &addr, buffer, sizeof(buffer))`
- Requires caller-provided buffer (thread-safe)
- Supports IPv4 and IPv6
- Returns NULL on error (better error handling)

### 4.2 gethostbyname() - 1 file affected

**Location**: `src/unilib/socktrans.c:268`

**Problem**:
- Returns pointer to static buffer (not thread-safe)
- No IPv6 support
- No proper error codes (uses h_errno global)
- Can block indefinitely on DNS lookups

**Replacement**: `getaddrinfo()`
- Thread-safe
- Supports IPv6
- Supports service name resolution
- Better error handling with `gai_strerror()`

### 4.3 pcap_lookupdev() - 1 file affected

**Location**: `src/unilib/arch.c:94-96`

**Problem**:
- Returns static buffer
- May return wrong interface on multi-homed systems
- Officially deprecated by libpcap project
- Removed in some newer libpcap versions

**Replacement**: `pcap_findalldevs()`
- Returns linked list of ALL interfaces
- Includes interface addresses and flags
- Proper memory management with `pcap_freealldevs()`

---

## 5. Library Strategy Analysis

Unicornscan bundles three libraries in `libs/`:
- libdnet-1.10 (packet injection)
- libltdl (dynamic loading)
- libpcap-0.9.4 (packet capture)

### 5.1 Option A: Patch Bundled Libraries (Minimal Changes)

**Approach**: Fix only the build-blocking issues in bundled libs.

| Pros | Cons |
|------|------|
| Minimal code changes | Stuck with 2006-era functionality |
| Known working combinations | Missing 15+ years of bug fixes |
| Quick to get building | Security vulnerabilities unfixed |
| | No modern features (TPACKET_V3, etc) |
| | libdnet-1.10 lacks modern NIC support |

**Verdict**: Only for archaeology - not for actual use.

### 5.2 Option B: System Libraries Only

**Approach**: Remove bundled libs, use system `libpcap-dev`, `libdnet-dev`.

| Pros | Cons |
|------|------|
| Always current security fixes | API changes may break code |
| Modern features (AF_XDP, DPDK) | libdnet distro packages often old |
| No maintenance burden | Version testing required |
| Smaller distribution size | |

**Concerns**:
- libdnet is poorly maintained upstream; distro packages vary wildly
- libpcap API mostly stable, but some function signatures changed
- libltdl fairly stable; system version fine

### 5.3 Option C: Hybrid Approach

**Approach**: libdnet bundled (patched), system libpcap/libltdl.

| Pros | Cons |
|------|------|
| libpcap security updates | Still maintaining libdnet patches |
| Known-working libdnet | Must track libdnet upstream (dead?) |
| Modern capture performance | Complexity of two strategies |

### 5.4 Option D: Full Modernization (RECOMMENDED)

**Approach**:
1. Start with patched bundled libs to establish baseline
2. Update API calls to modern equivalents
3. Progressively switch to system libraries with testing
4. Add IPv6 support where possible

| Pros | Cons |
|------|------|
| Best of all worlds | Most work required |
| Future-proof | Incremental testing needed |
| Community can contribute | Must understand all code paths |
| Proper IPv6 support | |
| Modern performance | |

**Phased Plan**:
1. Phase 1: Fix build blockers, get it compiling
2. Phase 2: Replace deprecated functions
3. Phase 3: Switch to system libpcap (with testing)
4. Phase 4: Evaluate libdnet (patch or replace)
5. Phase 5: Add IPv6 support
6. Phase 6: Performance modernization (optional)

---

## 6. Code Quality Observations

### 6.1 Good Design Decisions (Keep These)
- Clean separation of sender/listener processes
- Well-defined module interfaces
- Configurable at runtime via keyval system
- Sensible default settings
- Comprehensive option parsing

### 6.2 Areas Needing Care
- Heavy use of global state (`settings_t *s`)
- Manual memory management throughout
- Some complex pointer casting
- Mixed coding styles (K&R and ANSI)
- Limited error handling in some paths

### 6.3 Security Considerations
- Privilege separation via chroot + setuid (good)
- Raw socket handling (requires root - unavoidable)
- IPC channel security (Unix sockets adequate)
- Input validation varies by module

---

## 7. Test Plan

### 7.1 Test Environment
- Network: 192.168.1.0/24 (per user specification)
- Systems: Mix of Linux, Windows, IoT devices
- Baseline: Compare against known-good nmap results

### 7.2 Test Cases by Capability
1. **TCP SYN Scan**: `unicornscan -mT 192.168.1.0/24:1-1024`
2. **UDP Scan**: `unicornscan -mU 192.168.1.0/24:53,67,123,161`
3. **ARP Scan**: `unicornscan -mA 192.168.1.0/24`
4. **Rate Control**: Verify PPS matches `-r` setting
5. **Output Module**: PostgreSQL storage works
6. **pcap I/O**: Read/write capture files
7. **OS Detection**: Verify fingerprint matching

---

## 8. File Reference

### 8.1 Core Source Files
| File | Purpose |
|------|---------|
| src/main.c | Entry point, process orchestration |
| src/settings.h | Global settings structure |
| src/getconfig.c | Command-line parsing (all options) |
| src/chld.c | Child process management |
| src/drone_setup.c | Drone initialization |

### 8.2 Scan Engine
| File | Purpose |
|------|---------|
| src/scan_progs/send_packet.c | Packet transmission engine |
| src/scan_progs/recv_packet.c | Response collection |
| src/scan_progs/scan_export.h | Scan mode definitions |
| src/scan_progs/makepkt.c | Packet construction |
| src/scan_progs/packet_parse.c | Response parsing |
| src/scan_progs/connect.c | TCP connection tracking |

### 8.3 Support Libraries
| File | Purpose |
|------|---------|
| src/unilib/arch.c | Architecture abstraction |
| src/unilib/drone.h | Drone definitions |
| src/unilib/modules.h | Module interface |
| src/unilib/socktrans.c | Socket operations |
| src/unilib/cidr.c | CIDR math |

### 8.4 Build Files to Modify
| File | Changes Needed |
|------|----------------|
| libs/libdnet-1.10/src/tun-linux.c | Add sys/uio.h |
| configure.ac | Update deprecated macros |
| src/unilib/arch.c | pcap_lookupdev replacement |
| src/unilib/socktrans.c | gethostbyname replacement |
| 15 files | inet_ntoa replacements |

---

## 9. Recommended Task Sequence

### Phase 1: Get It Building (Minimal Changes)
1. Add `#include <sys/uio.h>` to libs/libdnet-1.10/src/tun-linux.c
2. Fix uninitialized variable warnings in libdnet
3. Verify configure && make succeeds
4. Run basic smoke test

### Phase 2: Deprecated Function Replacement
1. Create `inet_ntop()` wrapper or replace inline
2. Replace `gethostbyname()` in socktrans.c
3. Replace `pcap_lookupdev()` in arch.c
4. Test all scan modes

### Phase 3: System Library Migration
1. Test with system libpcap (configure --without-bundled-libpcap)
2. Test with system libltdl
3. Document any API compatibility issues
4. Decide on libdnet strategy

### Phase 4: Enhancements (Optional)
1. IPv6 support
2. Modern timing mechanisms
3. Performance profiling
4. Documentation updates

---

## 10. Summary

Unicornscan 0.4.7 is a well-designed asynchronous scanner with a clean architecture.
Modernization is achievable through incremental changes:

**Immediate blocker**: Missing `#include <sys/uio.h>` in bundled libdnet.

**Short-term work**: Replace 17 deprecated function calls across 16 files.

**Medium-term work**: Transition to system libraries where appropriate.

**The code is worth saving.** The architectural decisions are sound, and the
modular design means we can update pieces without rewriting everything.

---

*Document created during codebase analysis - December 2024*
*For Jack.*
