# Masscan High-Performance Packet Scanning Research

**Research Date:** 2025-12-22
**Purpose:** Understand masscan's techniques for achieving high packet rates and compare with unicornscan's approach to identify potential ARP resolution issues.

## Executive Summary

Masscan achieves 10-25 million packets per second through **complete kernel bypass** using raw Ethernet frames with a custom TCP/IP stack. In contrast, unicornscan uses libdnet's IP layer abstraction (`ip_send()` and `eth_send()`), which may still interact with kernel ARP resolution depending on the socket type and kernel version.

## Key Findings

### 1. Socket Type Used by Masscan

**Answer:** Masscan uses **libpcap/PF_PACKET** sockets operating at Layer 2 (Ethernet).

**Evidence from masscan source code:**

```c
// From rawsock.c lines 4-5:
// "This uses both 'libpcap' on systems, but on Linux, we try to use the
//  basic raw sockets, bypassing libpcap for better performance."

// From rawsock.c lines 731-747:
adapter->pcap = PCAP.create(adapter_name, errbuf);
// ... configuration ...
err = PCAP.activate(adapter->pcap);
```

**Advanced performance mode:** For >2M pps, masscan can use:
- **PF_RING ZC (Zero Copy)** - Direct DMA from userspace to NIC
- Bypasses kernel entirely with DNA driver

**Source:** [masscan/src/rawsock.c](https://github.com/robertdavidgraham/masscan/blob/master/src/rawsock.c)

### 2. Does Masscan Bypass Kernel ARP Resolution?

**Answer:** **YES - Completely**

Masscan implements its own ARP stack and handles all ARP operations in userspace:

**ARP Resolution at Startup (Synchronous):**
```c
// From stack-arpv4.c lines 102-272:
int stack_arp_resolve(struct Adapter *adapter,
    ipv4address_t my_ipv4, macaddress_t my_mac_address,
    ipv4address_t your_ipv4, macaddress_t *your_mac_address)
{
    // Constructs raw ARP request packet
    // Sends at Layer 2 directly
    // Waits for response (polling pcap)
    // Parses response manually
    // Stores MAC address
}
```

**ARP Responses During Scanning (Asynchronous):**
```c
// From stack-arpv4.c lines 281-362:
int stack_arp_incoming_request(struct stack_t *stack,
    ipv4address_t my_ip, macaddress_t my_mac,
    const unsigned char *px, unsigned length)
{
    // Parses incoming ARP requests
    // Constructs ARP reply manually
    // Queues for transmission
}
```

**Sources:**
- [masscan/src/stack-arpv4.c](https://github.com/robertdavidgraham/masscan/blob/master/src/stack-arpv4.c)
- [masscan/src/proto-arp.c](https://github.com/robertdavidgraham/masscan/blob/master/src/proto-arp.c)

### 3. Ethernet vs IP Layer Handling

**Masscan:** **Full Layer 2 (Ethernet) control**

**Packet Construction:**
```c
// From templ-pkt.c lines 30-54:
static unsigned char default_tcp_template[] =
    "\0\1\2\3\4\5"         // Ethernet: destination MAC
    "\6\7\x8\x9\xa\xb"     // Ethernet: source MAC
    "\x08\x00"             // Ethernet type: IPv4
    "\x45"                 // IP header starts here
    // ... complete IP + TCP headers ...
```

**Key characteristics:**
1. **Pre-built packet templates** at Ethernet layer
2. **Only modifies necessary fields** (IPs, ports, checksums, sequence numbers)
3. **No kernel involvement** - packets go directly to NIC
4. **Custom TCP/IP stack** - handles all protocol logic in userspace

**Transmission:**
```c
// From rawsock.c lines 332-336:
if (adapter->pcap)
    return PCAP.sendpacket(adapter->pcap, packet, length);
```

**Performance benefit:** Avoids kernel overhead of:
- Route lookups
- ARP lookups
- Netfilter checks
- Protocol stack processing

**Source:** [How masscan works - Artem Golubin](https://rushter.com/blog/how-masscan-works/)

### 4. Multi-Host Scanning Techniques

**Masscan's approach:**

1. **Asynchronous transmission** - No waiting for responses during send
2. **Stateless scanning** - Uses SYN cookies instead of connection tracking
3. **Randomized targets** - Spreads load across network
4. **Pre-resolved gateway MAC** - Single ARP at startup for default gateway
5. **Fixed Ethernet destination** - All packets go to router MAC, only IP changes

**Architecture:**
```
Masscan Structure:
├── Transmit Thread (sends probes)
│   └── Uses pre-resolved gateway MAC
├── Receive Thread (processes responses)
│   └── Validates via SYN cookies
└── No state sharing between threads
```

**Source:** [Masscan: The entire Internet in 3 minutes - Errata Security](https://blog.erratasec.com/2013/09/masscan-entire-internet-in-3-minutes.html)

## Unicornscan vs Masscan Comparison

| Aspect | Unicornscan | Masscan |
|--------|-------------|---------|
| **Socket Type** | libdnet `ip_t` / `eth_t` | libpcap `PF_PACKET` |
| **Layer** | IP layer (Layer 3) with optional Ethernet | Pure Ethernet (Layer 2) |
| **ARP Handling** | Depends on libdnet/kernel | Custom userspace stack |
| **Kernel Interaction** | Still uses kernel for some operations | Complete bypass |
| **Speed** | ~1-2M pps | 10-25M pps |

### Unicornscan's Approach

**From send_packet.c:**
```c
// Line 25: Uses libdnet
#include <dnet.h>

// Lines 114-116: Socket abstraction
union {
    ip_t *ipsock;   // IP layer socket
    eth_t *llsock;  // Link layer socket
} s_u;

// Line 936: IP layer send
ips = ip_send(sl.s_u.ipsock, pbuf, buf_size);

// Line 955: Link layer send
ets = eth_send(sl.s_u.llsock, pbuf, buf_size);
```

**Critical difference:**
- Unicornscan uses `ip_send()` for TCP/UDP (SOCK_IP mode)
- This may trigger kernel ARP resolution on modern kernels
- Only uses `eth_send()` for ARP scanning (SOCK_LL mode)

**Source:** `/opt/unicornscan-0.4.7/src/scan_progs/send_packet.c`

## Linux Kernel ARP Changes Analysis

### Recent Kernel Behavior

**IPv6 Neighbor Resolution Bug (2019):**
- **Bug Report:** [LP#1834465 - IPv6 neighbor resolution with raw socket](https://bugs.launchpad.net/ubuntu/+source/linux/+bug/1834465)
- **Affected kernels:** 4.4, 4.15, 5.0
- **Impact:** Raw sockets incorrectly triggered neighbor discovery
- **Fix:** Backported to stable kernels

**Subnet filtering for ARP (2022):**
- **Blog:** [Linux kernel patches - ARP & NDISC neighbor discovery](https://jhpark1013.github.io/blog/2022/07/07/linux-kernel-patches-new-feature-in-arp-and-ndisc-neighbor-discovery.html)
- **Change:** Added `arp_accept` third option for subnet-based filtering
- **Impact:** More granular control over unsolicited ARP learning

**Kernel 6.x GC changes:**
- IPv6 cached route entry garbage collection deprecated
- New neighbor cache management for better scalability

### Why "This Didn't Happen Before"

**Hypothesis:**
Modern Linux kernels (5.x/6.x) may have changed the behavior of `SOCK_RAW` at the IP layer:

1. **Older kernels (<5.0):** IP layer sockets may have bypassed ARP for raw packets
2. **Newer kernels (≥5.0):** Stricter enforcement of neighbor resolution even for raw IP packets
3. **Impact on unicornscan:** Using `ip_send()` now triggers kernel ARP, causing the timeout

**Evidence needed:**
- Kernel changelogs between 4.x and 6.x for raw socket ARP behavior
- Testing unicornscan on older vs newer kernels
- Comparing `strace` output on different kernel versions

### Neighbor Cache Behavior

**From kernel documentation:**

> If no ARP cache entry exists for a requested destination IP, the kernel will generate mcast_solicit ARP requests until receiving an answer. During this discovery period, the ARP cache entry will be listed in an incomplete state.

**Default parameters:**
- `gc_interval`: 30s between garbage collection
- `gc_stale_time`: 60s before entry considered stale
- `mcast_solicit`: Number of multicast ARP requests (default: 3)

**Impact:**
If unicornscan's `ip_send()` triggers kernel ARP resolution, and the target doesn't exist, the kernel will:
1. Send 3 ARP requests
2. Wait for timeout
3. Mark entry as "failed"
4. Block the send operation during this time

**Sources:**
- [Linux ARP Manual - man7.org](https://man7.org/linux/man-pages/man7/arp.7.html)
- [Linux IP Sysctl Documentation](https://www.kernel.org/doc/html/latest/networking/ip-sysctl.html)

## Recommendations for Unicornscan

### Option 1: Switch to Pure Layer 2 (Like Masscan)

**Change:** Use `eth_send()` for all packet types, not just ARP

**Benefits:**
- Complete kernel ARP bypass
- Consistent behavior across targets
- Better performance

**Challenges:**
- Must manually construct Ethernet headers for all protocols
- Need to resolve gateway MAC at startup
- More complex packet templates

### Option 2: Pre-populate ARP Cache

**Change:** Resolve all target MACs before scanning

**Benefits:**
- Kernel already has ARP entries
- No runtime ARP delays
- Compatible with current architecture

**Challenges:**
- Slow for large scans
- ARP entries may expire during scan
- Doesn't work for non-existent hosts

### Option 3: Use PF_PACKET Sockets Directly

**Change:** Bypass libdnet, use raw `PF_PACKET` sockets like masscan

**Benefits:**
- Maximum performance
- Full control
- No library dependencies

**Challenges:**
- Significant code rewrite
- Loss of libdnet abstraction
- Platform-specific code needed

### Option 4: Kernel ARP Timeout Workaround

**Change:** Set aggressive ARP timeouts or use `arp_accept=0`

**Benefits:**
- Minimal code changes
- Works with current architecture

**Challenges:**
- System-wide settings (may affect other apps)
- Doesn't solve root cause
- Still slower than bypass

## Conclusion

Masscan's extraordinary performance comes from **complete kernel bypass** at the Ethernet layer with a custom TCP/IP stack. It handles ARP entirely in userspace and pre-resolves the gateway MAC address at startup.

Unicornscan's use of libdnet's `ip_send()` appears to trigger kernel ARP resolution on modern Linux kernels, causing timeouts when scanning non-existent hosts. The behavior likely changed between kernel 4.x and 6.x series.

**Recommended solution:** Investigate switching unicornscan to use `eth_send()` for all packet types (like masscan), with proper Ethernet header construction and manual gateway MAC resolution.

## References

### Masscan Resources
- [GitHub - robertdavidgraham/masscan](https://github.com/robertdavidgraham/masscan)
- [Masscan README](https://github.com/robertdavidgraham/masscan/blob/master/README.md)
- [How masscan works - Artem Golubin](https://rushter.com/blog/how-masscan-works/)
- [Masscan: The entire Internet in 3 minutes - Errata Security](https://blog.erratasec.com/2013/09/masscan-entire-internet-in-3-minutes.html)

### Kernel Bypass Resources
- [On Kernel-Bypass Networking - Pekka Enberg](https://medium.com/@penberg/on-kernel-bypass-networking-and-programmable-packet-processing-799609b06898)
- [Kernel bypass - Cloudflare](https://blog.cloudflare.com/kernel-bypass/)
- [Bypassing the Linux kernel for high-performance packet filtering - HN](https://news.ycombinator.com/item?id=10181042)

### Linux Kernel ARP/Neighbor Resources
- [Linux ARP Manual - man7.org](https://man7.org/linux/man-pages/man7/arp.7.html)
- [Bug #1834465 - IPv6 neighbor resolution with raw socket](https://bugs.launchpad.net/ubuntu/+source/linux/+bug/1834465)
- [Linux kernel patches - ARP & NDISC](https://jhpark1013.github.io/blog/2022/07/07/linux-kernel-patches-new-feature-in-arp-and-ndisc-neighbor-discovery.html)
- [Linux Neighboring Subsystem Wiki](https://wiki.linuxfoundation.org/networking/neighboring_subsystem)

### Raw Socket Documentation
- [raw(7) - Linux manual page](https://www.man7.org/linux/man-pages/man7/raw.7.html)
- [C Raw Socket Examples - pdbuchan.com](https://www.pdbuchan.com/rawsock/rawsock.html)
- [Linux Kernel raw.c source](https://github.com/torvalds/linux/blob/master/net/ipv4/raw.c)

---

**Research conducted by:** Research Agent (Claude Sonnet 4.5)
**Date:** 2025-12-22
**Task ID:** task-1766461354082-dfabqrb4o
**Duration:** 163.76 seconds
