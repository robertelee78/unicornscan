# SOCK_LL Code Path Analysis

**Task:** L2 ARP Bypass: Analyze existing SOCK_LL code path
**Date:** 2025-12-22
**Status:** Complete

## Overview

Unicornscan already has complete Layer 2 (SOCK_LL) infrastructure for ARP scanning. This analysis documents how it works and what changes are needed to use it for TCP/UDP scans.

## Socket Mode Architecture

### Definitions (`src/scan_progs/send_packet.c:110-116`)

```c
int sockmode;
#define SOCK_LL 1   // Link Layer - uses eth_open()/eth_send()
#define SOCK_IP 2   // Network Layer - uses ip_open()/ip_send()
union {
    ip_t *ipsock;    // For SOCK_IP mode (ip_open/ip_send)
    eth_t *llsock;   // For SOCK_LL mode (eth_open/eth_send)
} s_u;
```

### Mode Selection by Scan Type (`send_packet.c:483-506`)

| Magic Constant  | Socket Mode | Socket Functions | ARP Behavior |
|-----------------|-------------|------------------|--------------|
| TCP_SEND_MAGIC  | SOCK_IP     | ip_open()/ip_send() | BLOCKS ~3s per non-existent host |
| UDP_SEND_MAGIC  | SOCK_IP     | ip_open()/ip_send() | BLOCKS ~3s per non-existent host |
| ARP_SEND_MAGIC  | SOCK_LL     | eth_open()/eth_send() | NO BLOCKING |

## open_link() Function (`send_packet.c:1147-1196`)

Handles socket mode switching:

```c
static void open_link(int mode, ...) {
    // Close old socket if mode changed
    if (sl.sockmode != mode) {
        switch (sl.sockmode) {
            case SOCK_LL:
                eth_close(sl.s_u.llsock);
                break;
            case SOCK_IP:
                ip_close(sl.s_u.ipsock);
                break;
        }
    }

    sl.sockmode = mode;

    switch (mode) {
        case SOCK_IP:
            sl.s_u.ipsock = ip_open();      // AF_INET SOCK_RAW
            break;
        case SOCK_LL:
            sl.s_u.llsock = eth_open(s->interface_str);  // PF_PACKET SOCK_RAW
            break;
    }
}
```

## Ethernet Frame Construction for ARP Mode

### Building the Ethernet Header (`send_packet.c:837-847`)

```c
if (s->ss->mode == MODE_ARPSCAN) {
    uint8_t ethbk[6] = { 0xff, 0xff, 0xff, 0xff, 0xff, 0xff };  // Broadcast

    makepkt_build_ethernet(
        6,                          // Address length (6 bytes for MAC)
        (const uint8_t *)&ethbk[0], // Destination MAC (broadcast)
        (const uint8_t *)sl.esrc,   // Source MAC (from workunit)
        ETHERTYPE_ARP               // EtherType 0x0806
    );
}
```

### makepkt_build_ethernet() (`src/scan_progs/makepkt.c:251-274`)

```c
int makepkt_build_ethernet(uint8_t addrlen, const uint8_t *dest,
                           const uint8_t *src, uint16_t type) {
    do_ipchk = 0;  // Disable IP checksum (we're at L2)

    memcpy(&pkt_buf[pkt_len], dest, addrlen);   // Dest MAC
    pkt_len += addrlen;

    memcpy(&pkt_buf[pkt_len], src, addrlen);    // Source MAC
    pkt_len += addrlen;

    *((uint16_t*)&pkt_buf[pkt_len]) = htons(type);  // EtherType
    pkt_len += sizeof(uint16_t);

    return 1;
}
```

## libdnet Layer 2 Implementation (`eth-linux.c`)

### eth_open() - Creates L2 Socket

```c
eth_t *eth_open(const char *device) {
    eth_t *e = calloc(1, sizeof(*e));

    // Create PF_PACKET raw socket (Layer 2, bypasses IP stack)
    e->fd = socket(PF_PACKET, SOCK_RAW, htons(ETH_P_ALL));

    // Get interface index
    strlcpy(e->ifr.ifr_name, device, sizeof(e->ifr.ifr_name));
    ioctl(e->fd, SIOCGIFINDEX, &e->ifr);

    // Setup sockaddr_ll for sendto()
    e->sll.sll_family = AF_PACKET;
    e->sll.sll_ifindex = e->ifr.ifr_ifindex;

    return e;
}
```

### eth_send() - Sends L2 Frame (NO ARP)

```c
ssize_t eth_send(eth_t *e, const void *buf, size_t len) {
    struct eth_hdr *eth = (struct eth_hdr *)buf;

    e->sll.sll_protocol = eth->eth_type;

    // sendto() directly to interface - NO kernel ARP resolution!
    return sendto(e->fd, buf, len, 0,
                  (struct sockaddr *)&e->sll, sizeof(e->sll));
}
```

## Key Insight: Why eth_send() Doesn't Block

| Socket Type | API | Kernel Behavior |
|-------------|-----|-----------------|
| `AF_INET, SOCK_RAW, IPPROTO_RAW` | ip_send() | Kernel adds Ethernet header → Needs ARP for dest MAC → BLOCKS |
| `PF_PACKET, SOCK_RAW` | eth_send() | User provides complete Ethernet frame → Direct to NIC → NO ARP |

## The _send_packet() Function Flow (`send_packet.c:928-964`)

```c
if (sl.sockmode == SOCK_IP) {
    makepkt_getbuf(&buf_size, &pbuf);
    ip_send(sl.s_u.ipsock, pbuf, buf_size);  // L3 send - BLOCKS ON ARP
}
else if (sl.sockmode == SOCK_LL) {
    makepkt_getbuf(&buf_size, &pbuf);
    eth_send(sl.s_u.llsock, pbuf, buf_size); // L2 send - NO ARP
}
```

## What Changes for TCP/UDP to Use SOCK_LL

### 1. Workunit Mode Selection (`send_packet.c:483-506`)

**Current:**
```c
if (*wk_u.magic == TCP_SEND_MAGIC) {
    open_link(SOCK_IP, ...);  // Uses ip_send()
}
else if (*wk_u.magic == UDP_SEND_MAGIC) {
    open_link(SOCK_IP, ...);  // Uses ip_send()
}
```

**Required:**
```c
if (*wk_u.magic == TCP_SEND_MAGIC) {
    open_link(SOCK_LL, ...);  // Use eth_send() instead
}
else if (*wk_u.magic == UDP_SEND_MAGIC) {
    open_link(SOCK_LL, ...);  // Use eth_send() instead
}
```

### 2. Packet Construction Order (`send_packet.c:808-836`)

**Current (TCP/UDP):**
```
makepkt_clear()
makepkt_build_ipv4(...)    // Only IP header
makepkt_build_tcp/udp(...) // TCP/UDP header
```

**Required:**
```
makepkt_clear()
makepkt_build_ethernet(...) // NEW: Ethernet header first
makepkt_build_ipv4(...)     // Then IP header
makepkt_build_tcp/udp(...)  // Then TCP/UDP header
```

### 3. Destination MAC Resolution

**For ARP mode:** Always broadcast (ff:ff:ff:ff:ff:ff)

**For TCP/UDP mode:**
- **Routed traffic (off-link):** Gateway MAC address
- **Direct traffic (on-link):** Target's MAC (need to resolve once, async)

### 4. Gateway MAC Resolution (New Requirement)

Need to resolve gateway MAC before scan starts:
1. Get default gateway IP from routing table
2. Send single ARP request to gateway
3. Cache gateway MAC for entire scan duration
4. Use gateway MAC as destination MAC for all routed packets

## Existing Infrastructure Reuse

| Component | Exists | Location |
|-----------|--------|----------|
| eth_open() | Yes | libdnet |
| eth_send() | Yes | libdnet |
| makepkt_build_ethernet() | Yes | makepkt.c |
| SOCK_LL socket handling | Yes | send_packet.c |
| Source MAC (sl.esrc) | Yes | From workunit |
| Interface binding | Yes | eth_open() |

## Estimated Changes

1. **send_packet.c:**
   - Change mode selection for TCP/UDP from SOCK_IP → SOCK_LL
   - Add Ethernet header construction before IP header for TCP/UDP
   - Add gateway MAC resolution at scan start
   - Add destination MAC selection logic (gateway vs direct)

2. **getconfig.c:**
   - Add --router-mac CLI option

3. **settings.h:**
   - Add router_mac field

4. **options.c:**
   - Add router MAC storage/retrieval functions

## Conclusion

Unicornscan already has complete Layer 2 infrastructure. The ARP scan mode demonstrates that eth_send() works correctly. The changes needed for TCP/UDP are:

1. Switch socket mode from SOCK_IP to SOCK_LL
2. Build Ethernet header before IP header
3. Resolve and cache gateway MAC at scan start
4. Use gateway MAC as destination for all packets

No new dependencies required - all functionality exists in libdnet.
