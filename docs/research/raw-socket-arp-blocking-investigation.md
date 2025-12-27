# Raw Socket ARP Blocking Investigation

**Date**: 2025-12-22
**Researcher**: Research Agent
**Context**: Unicornscan performance degradation due to kernel ARP resolution blocking

## Executive Summary

When using `AF_INET/SOCK_RAW/IPPROTO_RAW` sockets (as libdnet's `ip_send()` does), the Linux kernel **still performs ARP resolution** before sending packets. This causes `sendto()` to block for approximately 2.67-3 seconds when scanning non-existent hosts, as the kernel waits for ARP timeouts before returning. This blocking behavior reduces unicornscan's actual packet rate from requested 1000 pps to ~250 pps when scanning networks with many unreachable hosts.

**Key Findings:**
1. **AF_INET raw sockets CANNOT bypass ARP** - kernel always performs Layer 2 framing
2. **AF_PACKET sockets CAN bypass ARP** - operate at Layer 2, full Ethernet control
3. **libdnet provides both `ip_send()` (Layer 3) and `eth_send()` (Layer 2)**
4. **nmap and masscan both use AF_PACKET/libpcap** to avoid ARP blocking
5. **Switching to `eth_send()` or AF_PACKET is the only solution**

---

## Problem Context

### Current Behavior
- **Tool**: unicornscan using libdnet's `ip_send()`
- **Socket Type**: `AF_INET, SOCK_RAW, IPPROTO_RAW`
- **Issue**: When scanning `/24` network with many non-existent hosts
- **Symptom**: `sendto()` blocks for ~2.67 seconds per unreachable host
- **Impact**: Actual packet rate ~250 pps instead of requested 1000 pps

### Root Cause
The kernel's neighbor cache (ARP cache) enters "incomplete" state when no ARP response is received, retrying 3 times with 1 second intervals before giving up.

---

## Research Questions & Answers

### 1. Is it possible to bypass kernel ARP resolution with raw IP sockets?

**Answer: NO** - AF_INET raw sockets cannot bypass ARP resolution.

#### Evidence

From the [Linux raw(7) manual](https://www.man7.org/linux/man-pages/man7/raw.7.html):

> "A raw socket receives or sends the raw datagram not including link level headers. The IPv4 layer generates an IP header when sending a packet unless the IP_HDRINCL socket option is enabled on the socket."

Even with `IP_HDRINCL` enabled (which is implied by `IPPROTO_RAW`), **the kernel still handles Layer 2 (Ethernet) framing**, including ARP resolution.

From [Linux Raw Sockets guide](https://www.schoenitzer.de/blog/2018/Linux%20Raw%20Sockets.html):

> "In the IP_HDRINCL approach, you tell the kernel the IP header is included (by the user) using setsockopt() and the IP_HDRINCL flag, allowing modification of all values within the packet, but **the kernel fills out the layer 2 (data link) information (source and next-hop MAC addresses) for you**."

#### Network Stack Flow

From [Linux kernel networking documentation](https://wiki.linuxfoundation.org/networking/kernel_flow):

> "Data passes through the protocol layers which arrange the data into packets. The data passes through the routing layer, populating the destination and neighbour caches along the way (if they are cold). **This can generate ARP traffic if an ethernet address needs to be looked up**."

---

### 2. What's the difference between AF_INET SOCK_RAW and AF_PACKET SOCK_RAW for avoiding ARP delays?

**Answer: AF_PACKET operates at Layer 2 and completely bypasses kernel ARP resolution.**

#### AF_INET SOCK_RAW (Layer 3)

From [Linux raw(7) manual](https://www.man7.org/linux/man-pages/man7/raw.7.html):

- **Operates at**: IP layer (Layer 3)
- **Kernel handles**: Ethernet framing and ARP resolution
- **User provides**: IP header and payload (with IP_HDRINCL)
- **ARP resolution**: **ALWAYS PERFORMED** by kernel
- **Blocking behavior**: Yes, waits for ARP completion

#### AF_PACKET SOCK_RAW (Layer 2)

From [Linux packet(7) manual](https://man7.org/linux/man-pages/man7/packet.7.html):

> "Packet sockets are used to receive or send raw packets at the device driver (OSI Layer 2) level. They allow the user to implement protocol modules in user space on top of the physical layer."

> "SOCK_RAW packets are passed to and from the device driver without any changes in the packet data. When receiving a packet, the address is still parsed and passed in a standard sockaddr_ll address structure. When transmitting a packet, **the user supplied buffer should contain the physical layer header**."

Key differences:

| Feature | AF_INET SOCK_RAW | AF_PACKET SOCK_RAW |
|---------|------------------|---------------------|
| **Layer** | Layer 3 (IP) | Layer 2 (Ethernet) |
| **User provides** | IP header + payload | Ethernet header + IP header + payload |
| **Kernel provides** | Ethernet header, ARP | Nothing (direct to driver) |
| **ARP resolution** | Yes (blocking) | No (user provides MAC) |
| **Routing** | Kernel routes | User specifies interface |
| **Performance** | Slower (ARP delays) | Faster (no ARP delays) |

From [A Short SOCK_RAW Adventure](https://stevendanna.github.io/blog/2013/06/23/a-short-sock-raw-adventure/):

> "Using `socket(AF_PACKET, SOCK_RAW, htons(ETH_P_ALL))` gives the lowest level access: ethernet frames are passed from the device driver without any changes to your application, including the full level 2 header. When writing to the socket **the user-supplied buffer has to contain all the headers of layer 2 to 4**."

---

### 3. Are there socket options (like IP_HDRINCL, SO_BINDTODEVICE) that can help?

**Answer: NO** - These options do NOT bypass ARP resolution for AF_INET sockets.

#### IP_HDRINCL

From [Linux raw(7) manual](https://www.man7.org/linux/man-pages/man7/raw.7.html):

- **Purpose**: Allows user to construct complete IP header
- **Effect**: User provides IP header fields
- **Does NOT bypass**: Layer 2 framing or ARP resolution
- **Kernel still fills**: Source/destination MAC addresses via ARP

#### SO_BINDTODEVICE

From [Linux SO_BINDTODEVICE guide](https://djangocas.dev/blog/linux/linux-SO_BINDTODEVICE-and-mac-IP_BOUND_IF-to-bind-socket-to-a-network-interface/):

- **Purpose**: Binds socket to specific network interface
- **Requires**: `CAP_NET_RAW` capability or root privileges
- **Effect**: Limits socket to one interface
- **Does NOT bypass**: ARP resolution for that interface

From [Binding socket to network interface](https://linuxvox.com/blog/bind-socket-to-network-interface/):

> "If a socket is bound to an interface, only packets received from that particular interface are processed by the socket."

**Conclusion**: Neither option prevents the kernel from performing ARP lookups on AF_INET sockets.

---

### 4. How do other network scanners (nmap, masscan) handle this?

**Answer: Both use AF_PACKET/libpcap to bypass kernel ARP resolution.**

#### Nmap's Approach

From [Nmap Host Discovery Techniques](https://nmap.org/book/host-discovery-techniques.html):

> "**ARP scanning resolves both problems by putting Nmap in control**. Nmap issues the raw ARP requests and handles retransmission and timeout periods at its own discretion. The system ARP cache is bypassed."

> "Operating systems weren't written with the expectation that they would need to do millions of ARP requests against unavailable hosts in a short time period. **ARP scan puts Nmap and its optimized algorithms in charge of ARP requests**."

Nmap can bypass ARP with:
- `--send-ip` - Forces IP-level sending (but still subject to kernel ARP)
- **Default behavior**: Uses libpcap with AF_PACKET for ARP control

From [nmap libpcap source](https://svn.nmap.org/nmap/libpcap/pcap-linux.c):

Nmap uses libpcap which creates `PF_PACKET` sockets on Linux for both sending and receiving, giving full control over Layer 2.

#### Masscan's Approach

From [How masscan works](https://rushter.com/blog/how-masscan-works/):

> "Instead of relying on TCP/IP implementation from the operating system, **masscan implements its own TPC/IP stack** designed for port scanning. It runs in the user space and uses as few syscalls as possible. It is possible because of **raw sockets**."

> "Internally, masscan uses libpcap, which also uses raw sockets to send and receive packets but with extra optimizations (e.g., **PACKET_MMAP**) and provides a portable interface."

From [masscan source code analysis](https://github.com/robertdavidgraham/masscan/blob/master/src/rawsock-getmac.c):

Masscan uses:
- **AF_PACKET sockets** for MAC address retrieval
- **libpcap** for packet transmission (which uses AF_PACKET on Linux)
- **PF_RING driver** for ultra-high performance (10M pps)

When ARP timeout occurs, masscan displays:
```
FAIL: ARP timed-out resolving MAC address for router
```

Solutions:
- `--router-mac <MAC>` - Bypass ARP entirely by providing router MAC
- `--router <IP>` - Specify different router IP

#### Key Insight

Both scanners avoid kernel ARP delays by:
1. Using **AF_PACKET sockets** (directly or via libpcap)
2. Implementing **custom ARP handling** in userspace
3. Providing **MAC address caching** and manual specification
4. **Never blocking** on kernel ARP resolution

---

### 5. Can libdnet use AF_PACKET to bypass ARP?

**Answer: YES** - libdnet provides `eth_send()` which operates at Layer 2.

#### libdnet Architecture

From [libdnet documentation](https://libdnet.sourceforge.net/):

> "libdnet provides a simplified, portable interface to several low-level networking routines, including network address manipulation, kernel arp(4) cache and route(4) table lookup and manipulation, network firewalling, network interface lookup and manipulation, IP tunneling, and **raw IP packet and Ethernet frame transmission**."

#### libdnet Functions

From [libdnet send.c source](https://github.com/boundary/libdnet/blob/master/test/dnet/send.c):

**ip_send() - Layer 3 (Subject to ARP)**
```c
ip = ip_open();
ip_send(ip, pkt, len);  // Kernel handles Ethernet framing and ARP
```

**eth_send() - Layer 2 (Bypasses ARP)**
```c
eth = eth_open(interface);
eth_send(eth, pkt, len);  // User provides complete Ethernet frame
```

#### When to Use Each

| Use Case | Function | Layer | ARP Handling |
|----------|----------|-------|--------------|
| Simple IP packet sending | `ip_send()` | Layer 3 | Kernel (blocking) |
| Network scanning | `eth_send()` | Layer 2 | User (non-blocking) |
| Custom protocols | `eth_send()` | Layer 2 | User (non-blocking) |
| ARP spoofing | `eth_send()` | Layer 2 | User (non-blocking) |

**Conclusion**: Unicornscan should switch from `ip_send()` to `eth_send()` to avoid ARP blocking.

---

## Linux Kernel ARP Behavior

### ARP Cache States

From [Linux arp(7) manual](https://man7.org/linux/man-pages/man7/arp.7.html):

The Linux kernel neighbor cache transitions through states:
1. **NONE** - No entry exists
2. **INCOMPLETE** - ARP request sent, waiting for reply
3. **REACHABLE** - Valid entry, recently confirmed
4. **STALE** - Valid entry, needs reconfirmation
5. **DELAY** - Waiting before probing
6. **PROBE** - Sending unicast probes
7. **FAILED** - All probes failed

### Timeout Behavior

From [Linux ARP settings guide](https://www.baeldung.com/linux/arp-settings):

**Key parameters** (in `/proc/sys/net/ipv4/neigh/<interface>/`):

| Parameter | Default | Description |
|-----------|---------|-------------|
| `mcast_solicit` | 3 | Number of multicast ARP requests |
| `ucast_solicit` | 3 | Number of unicast ARP requests |
| `retrans_time_ms` | 1000 ms | Delay between retransmissions |
| `base_reachable_time` | 30 sec | Validity time for reachable entries |
| `gc_stale_time` | 60 sec | How often to check stale entries |

**Timeout Calculation** for non-existent hosts:
```
Total timeout = mcast_solicit × retrans_time_ms
              = 3 × 1000 ms
              = 3 seconds
```

This explains the **~2.67-3 second blocking** observed in unicornscan!

From [Cumulus Linux ARP timers](https://support.cumulusnetworks.com/hc/en-us/articles/202012933-Changing-ARP-timers-in-Cumulus-Linux):

> "If no ARP cache entry exists for a requested destination IP, the kernel will generate mcast_solicit ARP requests until receiving an answer. During this discovery period, **the ARP cache entry will be listed in an incomplete state**."

### Data Flow with AF_INET SOCK_RAW

From [Linux kernel networking flow](https://wiki.linuxfoundation.org/networking/kernel_flow):

```
sendto() system call
    ↓
Socket subsystem (AF_INET)
    ↓
Protocol layer (IPPROTO_RAW)
    ↓
Routing layer
    ↓
Neighbor cache lookup (ARP)
    ↓
    [No entry] → INCOMPLETE state
    ↓
    Send ARP request (broadcast)
    ↓
    Wait retrans_time_ms (1000ms)
    ↓
    [No reply] → Retry (mcast_solicit times)
    ↓
    [After 3 attempts] → FAILED state
    ↓
    Return error to sendto()
```

**Total blocking time**: 3 seconds minimum

---

## AF_PACKET Socket Programming

### Creating AF_PACKET Socket

From [Linux packet(7) manual](https://man7.org/linux/man-pages/man7/packet.7.html):

```c
#include <sys/socket.h>
#include <linux/if_packet.h>
#include <net/ethernet.h>

// Raw packet socket (includes Ethernet header)
int fd = socket(AF_PACKET, SOCK_RAW, htons(ETH_P_ALL));

// Cooked mode (Ethernet header removed by kernel)
int fd = socket(AF_PACKET, SOCK_DGRAM, htons(ETH_P_IP));
```

**Requirements**:
- `CAP_NET_RAW` capability
- Root privileges (or appropriate capability)

From [AF_PACKET manpage](https://manpages.org/af_packet/7):

> "In order to create a packet socket, a process must have the CAP_NET_RAW capability in the user namespace that governs its network namespace."

### Sending with AF_PACKET

```c
struct sockaddr_ll addr = {0};
addr.sll_family = AF_PACKET;
addr.sll_ifindex = if_nametoindex("eth0");  // Interface index
addr.sll_halen = ETH_ALEN;
addr.sll_protocol = htons(ETH_P_IP);
memcpy(addr.sll_addr, dst_mac, ETH_ALEN);  // Destination MAC

// User must provide complete Ethernet frame
struct {
    struct ether_header eth;
    struct ip ip;
    char payload[1500];
} packet;

// Fill in Ethernet header
memcpy(packet.eth.ether_dhost, dst_mac, ETH_ALEN);
memcpy(packet.eth.ether_shost, src_mac, ETH_ALEN);
packet.eth.ether_type = htons(ETH_P_IP);

// Fill in IP header and payload
// ...

sendto(fd, &packet, len, 0, (struct sockaddr*)&addr, sizeof(addr));
```

**No ARP blocking** - packet goes directly to network driver.

### Performance Optimizations

From [Linux PACKET_MMAP documentation](https://docs.kernel.org/5.15/networking/packet_mmap.html):

**PACKET_MMAP** (memory-mapped packet I/O):
- Zero-copy transmission
- Batch multiple packets
- Used by masscan for 10M pps

**PACKET_QDISC_BYPASS** (Linux 3.14+):
```c
int bypass = 1;
setsockopt(fd, SOL_PACKET, PACKET_QDISC_BYPASS, &bypass, sizeof(bypass));
```

From [Linux kernel PACKET_QDISC_BYPASS](https://github.com/jwbensley/EtherateMT/wiki/Linux-Kernel-tracing-for-sendto()-using-AF_PACKET,-PACKET_MMAP-and-PACKET_FANOUT):

> "By default, packets sent through packet sockets pass through the kernel's qdisc (traffic control) layer. When using `socket(AF_PACKET, SOCK_RAW, htons(ETH_P_ALL))`, the xmit virtual function can be changed by `setsockopt(PACKET_QDISC_BYPASS)` to use `packet_direct_xmit` instead of `dev_queue_xmit()`."

**Benefits**:
- Bypass kernel traffic control
- Direct hardware transmission
- Reduced latency
- Higher throughput

---

## Recommended Solutions for Unicornscan

### Solution 1: Switch to libdnet's eth_send() (Recommended)

**Advantages**:
✅ Uses existing libdnet dependency
✅ Portable across platforms
✅ Minimal code changes
✅ Completely bypasses ARP blocking

**Requirements**:
- Construct complete Ethernet frames
- Determine destination MAC address (router MAC for remote hosts)
- Handle interface selection

**Implementation outline**:
```c
// Instead of:
ip_t *ip = ip_open();
ip_send(ip, pkt, len);

// Use:
eth_t *eth = eth_open(interface);

// Construct Ethernet frame
uint8_t frame[ETH_HDR_LEN + ip_len];
struct eth_hdr *eth_hdr = (struct eth_hdr *)frame;

// Set destination MAC (router MAC for non-local destinations)
memcpy(eth_hdr->eth_dst, router_mac, ETH_ADDR_LEN);
memcpy(eth_hdr->eth_src, local_mac, ETH_ADDR_LEN);
eth_hdr->eth_type = htons(ETH_TYPE_IP);

// Copy IP packet after Ethernet header
memcpy(frame + ETH_HDR_LEN, ip_packet, ip_len);

eth_send(eth, frame, sizeof(frame));
```

**Router MAC determination**:
- Read from ARP cache: `arp_t *arp = arp_open(); arp_get(arp, &entry);`
- Allow user to specify: `--router-mac XX:XX:XX:XX:XX:XX`
- Perform single ARP lookup at startup (cache result)

### Solution 2: Use AF_PACKET Directly (Higher Performance)

**Advantages**:
✅ Maximum performance (10M+ pps with PACKET_MMAP)
✅ Full control over packet transmission
✅ Can use PACKET_QDISC_BYPASS

**Disadvantages**:
❌ Linux-specific (not portable)
❌ More complex implementation
❌ Need to handle interface binding manually

**When to use**:
- Ultra-high-speed scanning requirements
- Linux-only deployment
- Willing to maintain platform-specific code

### Solution 3: Use libpcap (Maximum Compatibility)

**Advantages**:
✅ Portable across all platforms
✅ Well-tested, stable API
✅ Nmap and masscan use it successfully

**Disadvantages**:
❌ Additional dependency
❌ Slightly more overhead than raw AF_PACKET

**Implementation**:
```c
pcap_t *pcap = pcap_open_live(interface, 65535, 0, 1, errbuf);
pcap_sendpacket(pcap, frame, frame_len);
```

### Solution 4: Hybrid Approach (Optimal)

**Strategy**:
1. Keep `ip_send()` for single-host scans
2. Use `eth_send()` for network scans
3. Cache router MAC address at startup
4. Allow `--router-mac` command-line option

**Benefits**:
✅ Best performance for common use case (network scans)
✅ Simplicity for single-host scans
✅ No ARP blocking for bulk scanning
✅ User override for special cases

---

## Implementation Recommendations

### Priority 1: Quick Fix (eth_send)

**Immediate steps**:
1. Add router MAC detection at startup
2. Implement `eth_send()` for packet transmission
3. Add `--router-mac` command-line option
4. Update documentation

**Estimated effort**: 4-8 hours

### Priority 2: Performance Optimization

**Additional improvements**:
1. Implement PACKET_MMAP for batch transmission
2. Add PACKET_QDISC_BYPASS option
3. Optimize frame construction
4. Add MAC address caching

**Estimated effort**: 16-24 hours

### Priority 3: Platform Support

**Cross-platform considerations**:
1. Keep `ip_send()` fallback for non-Linux
2. Add conditional compilation for AF_PACKET features
3. Test on BSD, macOS, Windows (if applicable)

**Estimated effort**: 8-16 hours

---

## Testing Strategy

### Test Scenarios

1. **Local network scan** (all hosts reachable)
   - Measure: packets per second
   - Expected: ~1000 pps (no ARP delays)

2. **Sparse network scan** (many non-existent hosts)
   - Measure: packets per second, total scan time
   - Expected: ~1000 pps (no blocking), 65536 packets in ~65 seconds

3. **Router MAC caching**
   - Measure: ARP requests generated
   - Expected: 0-1 ARP requests total (cached)

4. **Cross-platform compatibility**
   - Test on: Linux, FreeBSD, macOS
   - Expected: Graceful fallback to `ip_send()` where needed

### Performance Benchmarks

| Scenario | Current (ip_send) | Target (eth_send) |
|----------|-------------------|-------------------|
| All hosts up | ~1000 pps | ~1000 pps |
| 50% hosts down | ~500 pps | ~1000 pps |
| 90% hosts down | ~250 pps | ~1000 pps |
| Full /24 scan | ~262 seconds | ~65 seconds |

---

## Conclusion

**Root cause**: AF_INET raw sockets always perform kernel ARP resolution, causing 3-second blocking delays for non-existent hosts.

**Solution**: Switch to Layer 2 packet transmission using:
- **libdnet's `eth_send()`** (recommended for portability)
- **AF_PACKET sockets** (for maximum Linux performance)
- **libpcap** (for cross-platform compatibility)

**Expected improvement**: 4x performance increase for sparse network scans (from ~250 pps to ~1000 pps).

**Implementation priority**: High - significantly impacts scanning performance in real-world scenarios where many IP addresses are unallocated.

---

## References

### Linux Kernel Documentation
- [raw(7) - Linux raw sockets](https://www.man7.org/linux/man-pages/man7/raw.7.html)
- [packet(7) - Linux packet sockets](https://man7.org/linux/man-pages/man7/packet.7.html)
- [arp(7) - Linux ARP kernel module](https://man7.org/linux/man-pages/man7/arp.7.html)
- [ip(7) - Linux IPv4 protocol](https://man7.org/linux/man-pages/man7/ip.7.html)
- [Linux Kernel Networking Flow](https://wiki.linuxfoundation.org/networking/kernel_flow)
- [PACKET_MMAP Documentation](https://docs.kernel.org/5.15/networking/packet_mmap.html)

### Socket Programming Guides
- [Linux Raw Sockets Guide](https://www.schoenitzer.de/blog/2018/Linux%20Raw%20Sockets.html)
- [A Short SOCK_RAW Adventure](https://stevendanna.github.io/blog/2013/06/23/a-short-sock-raw-adventure/)
- [Guide to Using Raw Sockets](https://www.opensourceforu.com/2015/03/a-guide-to-using-raw-sockets/)
- [C Raw Socket Examples](https://www.pdbuchan.com/rawsock/rawsock.html)
- [AF_PACKET manpage](https://manpages.org/af_packet/7)

### Network Scanners
- [Nmap Host Discovery Techniques](https://nmap.org/book/host-discovery-techniques.html)
- [Nmap Scan Time Reduction](https://nmap.org/book/reduce-scantime.html)
- [How masscan works](https://rushter.com/blog/how-masscan-works/)
- [masscan GitHub repository](https://github.com/robertdavidgraham/masscan)
- [Unicornscan - Kali Tools](https://www.kali.org/tools/unicornscan/)

### ARP and Neighbor Cache
- [Linux ARP Settings](https://www.baeldung.com/linux/arp-settings)
- [Cumulus Linux ARP Timers](https://support.cumulusnetworks.com/hc/en-us/articles/202012933-Changing-ARP-timers-in-Cumulus-Linux)
- [Address Resolution Protocol](http://linux-ip.net/html/ether-arp.html)
- [Linux Kernel Neighbor Cache](http://haifux.org/lectures/180/netLec2.pdf)

### libdnet
- [libdnet homepage](https://libdnet.sourceforge.net/)
- [libdnet send.c source](https://github.com/boundary/libdnet/blob/master/test/dnet/send.c)
- [Net::Libdnet::Arp module](https://manpages.debian.org/trixie/libnet-libdnet-perl/Net::Libdnet::Arp.3pm.en.html)

### Performance Optimization
- [Monitoring Linux Networking Stack: Sending Data](https://blog.packagecloud.io/monitoring-tuning-linux-networking-stack-sending-data/)
- [Linux Kernel PACKET_QDISC_BYPASS](https://github.com/jwbensley/EtherateMT/wiki/Linux-Kernel-tracing-for-sendto()-using-AF_PACKET,-PACKET_MMAP-and-PACKET_FANOUT)

### libpcap
- [nmap libpcap-linux.c source](https://svn.nmap.org/nmap/libpcap/pcap-linux.c)
- [libpcap cooked mode discussion](https://github.com/the-tcpdump-group/libpcap/issues/246)
- [Raw socket sniffer implementation](https://organicprogrammer.com/2022/02/22/how-to-implement-libpcap-on-linux-with-raw-socket-part1/)

---

## Appendix A: Socket Type Comparison Matrix

| Feature | AF_INET SOCK_RAW | AF_PACKET SOCK_RAW | AF_PACKET SOCK_DGRAM |
|---------|------------------|---------------------|----------------------|
| **OSI Layer** | Layer 3 (Network) | Layer 2 (Data Link) | Layer 2 (Data Link) |
| **User provides** | IP header + data | Ethernet + IP + data | IP + data |
| **Kernel provides** | Ethernet header | Nothing | Ethernet header (removed on RX) |
| **ARP resolution** | Yes (kernel) | No (user) | No (user) |
| **Routing** | Yes (kernel) | No (user specifies interface) | No (user specifies interface) |
| **Portability** | High | Linux-specific | Linux-specific |
| **Performance** | Moderate | Highest | High |
| **Blocking on ARP** | Yes (3 sec) | No | No |
| **Use case** | Simple IP tools | Network scanners, sniffers | Packet analysis |

## Appendix B: Kernel ARP State Machine

```
┌─────────────────────────────────────────────────────────────┐
│                    ARP Cache State Machine                   │
└─────────────────────────────────────────────────────────────┘

NONE (no entry)
    │
    ├─[sendto() called]→ Create entry
    │
    ↓
INCOMPLETE (waiting for ARP reply)
    │
    ├─[ARP reply received]→ REACHABLE
    │
    ├─[timeout after mcast_solicit attempts]→ FAILED
    │
    │  Timing: retrans_time_ms × mcast_solicit
    │          = 1000ms × 3 = 3 seconds
    │
    ↓
FAILED (all probes failed)
    │
    └─[sendto() returns error]

REACHABLE (valid MAC address)
    │
    ├─[base_reachable_time expires]→ STALE
    │
    ↓
STALE (needs reconfirmation)
    │
    ├─[traffic to this host]→ DELAY
    │
    ↓
DELAY (waiting before probing)
    │
    ├─[delay_time expires]→ PROBE
    │
    ↓
PROBE (sending unicast ARP)
    │
    ├─[ARP reply]→ REACHABLE
    │
    └─[timeout]→ FAILED
```

**Key timing parameters** (defaults):
- `retrans_time_ms`: 1000 ms (1 second)
- `mcast_solicit`: 3 attempts
- `base_reachable_time`: 30 seconds
- `gc_stale_time`: 60 seconds
- `delay_time`: 5 seconds

**Total blocking time for non-existent host**: 3 seconds

## Appendix C: Code Examples

### Example 1: Current unicornscan (ip_send - blocking)

```c
#include <dnet.h>

// Current approach - subject to ARP blocking
ip_t *ip = ip_open();
if (!ip) {
    perror("ip_open");
    return -1;
}

// Construct IP packet
uint8_t packet[IP_HDR_LEN + payload_len];
struct ip_hdr *ip_hdr = (struct ip_hdr *)packet;
// ... fill IP header ...

// This WILL block for ~3 seconds if dest MAC unknown
ssize_t sent = ip_send(ip, packet, sizeof(packet));

ip_close(ip);
```

### Example 2: Proposed unicornscan (eth_send - non-blocking)

```c
#include <dnet.h>

// Proposed approach - no ARP blocking
eth_t *eth = eth_open(interface);
if (!eth) {
    perror("eth_open");
    return -1;
}

// Get router MAC (once at startup, cache it)
uint8_t router_mac[ETH_ADDR_LEN];
if (!get_router_mac(router_mac)) {
    // Fallback to user-specified or ARP lookup
    arp_t *arp = arp_open();
    struct arp_entry entry;
    addr_pton(gateway_ip, &entry.arp_pa);
    if (arp_get(arp, &entry) == 0) {
        memcpy(router_mac, &entry.arp_ha.addr_eth, ETH_ADDR_LEN);
    }
    arp_close(arp);
}

// Construct Ethernet frame
uint8_t frame[ETH_HDR_LEN + IP_HDR_LEN + payload_len];
struct eth_hdr *eth_hdr = (struct eth_hdr *)frame;

// Ethernet header
memcpy(eth_hdr->eth_dst, router_mac, ETH_ADDR_LEN);
memcpy(eth_hdr->eth_src, local_mac, ETH_ADDR_LEN);
eth_hdr->eth_type = htons(ETH_TYPE_IP);

// IP packet after Ethernet header
memcpy(frame + ETH_HDR_LEN, ip_packet, IP_HDR_LEN + payload_len);

// This will NOT block - goes directly to driver
ssize_t sent = eth_send(eth, frame, sizeof(frame));

eth_close(eth);
```

### Example 3: AF_PACKET with PACKET_QDISC_BYPASS (maximum performance)

```c
#include <sys/socket.h>
#include <linux/if_packet.h>
#include <net/ethernet.h>
#include <net/if.h>

// Create raw packet socket
int fd = socket(AF_PACKET, SOCK_RAW, htons(ETH_P_ALL));
if (fd < 0) {
    perror("socket");
    return -1;
}

// Enable PACKET_QDISC_BYPASS for direct hardware access
int bypass = 1;
if (setsockopt(fd, SOL_PACKET, PACKET_QDISC_BYPASS,
               &bypass, sizeof(bypass)) < 0) {
    perror("setsockopt PACKET_QDISC_BYPASS");
    // Non-fatal, continue without bypass
}

// Bind to specific interface
struct sockaddr_ll addr = {0};
addr.sll_family = AF_PACKET;
addr.sll_ifindex = if_nametoindex(interface);
addr.sll_protocol = htons(ETH_P_ALL);

if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
    perror("bind");
    return -1;
}

// Construct frame (same as Example 2)
uint8_t frame[ETH_HDR_LEN + IP_HDR_LEN + payload_len];
// ... fill frame ...

// Send directly to hardware - no kernel qdisc, no ARP
struct sockaddr_ll dest = {0};
dest.sll_family = AF_PACKET;
dest.sll_ifindex = addr.sll_ifindex;
dest.sll_halen = ETH_ALEN;
memcpy(dest.sll_addr, router_mac, ETH_ALEN);

ssize_t sent = sendto(fd, frame, sizeof(frame), 0,
                      (struct sockaddr *)&dest, sizeof(dest));

close(fd);
```

### Example 4: Router MAC determination

```c
#include <dnet.h>
#include <stdio.h>
#include <string.h>

int get_router_mac(const char *gateway_ip, uint8_t *mac_out) {
    arp_t *arp;
    struct arp_entry entry;
    int result = -1;

    // Open ARP handle
    arp = arp_open();
    if (!arp) {
        perror("arp_open");
        return -1;
    }

    // Convert gateway IP to addr
    memset(&entry, 0, sizeof(entry));
    if (addr_pton(gateway_ip, &entry.arp_pa) < 0) {
        fprintf(stderr, "Invalid gateway IP: %s\n", gateway_ip);
        goto cleanup;
    }

    // Look up in ARP cache
    if (arp_get(arp, &entry) == 0) {
        // Found in cache
        memcpy(mac_out, &entry.arp_ha.addr_eth, ETH_ADDR_LEN);
        printf("Router MAC from cache: "
               "%02x:%02x:%02x:%02x:%02x:%02x\n",
               mac_out[0], mac_out[1], mac_out[2],
               mac_out[3], mac_out[4], mac_out[5]);
        result = 0;
    } else {
        // Not in cache - could trigger ARP here, or require --router-mac
        fprintf(stderr, "Router MAC not in ARP cache. "
                       "Use --router-mac option.\n");
        result = -1;
    }

cleanup:
    arp_close(arp);
    return result;
}
```

---

**End of Report**
