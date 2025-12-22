# PCAP Linux SLL Header Investigation

## Issue Summary

The pcap capture configuration in `recv_packet.c` does not properly handle Linux Cooked Capture (SLL) headers, which are used when capturing on the "any" interface. This causes `util_getheadersize()` to return an error (-1) because it has no case for `DLT_LINUX_SLL` (link type 113).

## Root Cause Analysis

### 1. Interface Selection

**Location**: `src/scan_progs/recv_packet.c:176`

```c
pdev=pcap_open_live(s->interface_str, s->vi[0]->mtu + 64, (GET_PROMISC() ? 1 : 0), 100, errbuf);
```

The interface is determined by `s->interface_str`, which can be:
- A specific interface name (e.g., "eth0", "wlan0")
- The special "any" pseudo-interface (captures on all interfaces)

### 2. Link Layer Detection

**Location**: `src/unilib/pcaputil.c:33-82`

The `util_getheadersize()` function determines the link layer header size based on the datalink type returned by `pcap_datalink()`:

```c
int util_getheadersize(pcap_t *pdev, char *errorbuf) {
    int linktype=0;

    switch((linktype=pcap_datalink(pdev))) {
        case DLT_NULL:      return 4;
        case DLT_RAW:       return 0;
        case DLT_EN10MB:    return 14;  // Standard Ethernet
        case DLT_LOOP:      return 8;
        case DLT_PPP:       return 4;
        case DLT_IEEE802:   return 22;
        case DLT_IEEE802_11: return 24;
        // ... other cases ...
        default:
            snprintf(errorbuf, PCAP_ERRBUF_SIZE -1, "Unknown pcap linktype `%d'", linktype);
    }
    return -1;
}
```

**CRITICAL MISSING CASE**: There is NO handler for `DLT_LINUX_SLL` (113).

### 3. Linux Cooked Capture (SLL)

When pcap captures on the "any" interface on Linux, it uses **Linux Cooked Capture** mode:

- **Link type**: DLT_LINUX_SLL (113)
- **Header size**: **16 bytes** (not 14!)
- **Purpose**: Provides a uniform header format for packets captured from multiple interfaces with different link types

**Verified with test**:
```bash
$ sudo /tmp/check_pcap_datalink any
Testing interface: any
Link type: 113
Link type name: LINUX_SLL
Link type description: Linux cooked v1
DLT_LINUX_SLL - Linux cooked capture (16 bytes)
```

### 4. Header Length Calculation Flow

**Location**: `src/scan_progs/recv_packet.c:209-219`

```c
ret=util_getheadersize(pdev, errbuf);
if (ret < 0 || ret > 0xffff) {
    ERR("error getting link header size: %s", errbuf);

    DBG(M_IPC, "sending ready error message to parent");
    if (send_message(lc_s, MSG_READY, MSG_STATUS_ERROR, NULL, 0) < 0) {
        terminate("cant send message ready error");
    }
    terminate("informed parent, exiting");
}
s->ss->header_len=(uint16_t)ret;
```

**What happens when using "any" interface**:
1. `pcap_datalink(pdev)` returns 113 (DLT_LINUX_SLL)
2. `util_getheadersize()` hits the `default` case
3. Returns -1 (error)
4. recv_packet terminates with error

### 5. Impact on Packet Processing

**Location**: `src/scan_progs/packet_parse.c:282-294`

```c
pk_len=phdr->caplen;

if (pk_len <= s->ss->header_len) {
    ERR("this packet is too short " STFMT ", header length is %u", pk_len, s->ss->header_len);
    return;
}

if (ISDBG(M_PKT) || GET_SNIFF()) {
    INF("got packet with length %u (cap %u) with header length at %u",
        phdr->len, phdr->caplen, s->ss->header_len);
}

pk_len -= s->ss->header_len;  // Strip link layer header
packet += s->ss->header_len;  // Skip to IP layer
pk_layer++;
```

If `header_len` is wrong:
- **Too small (14 instead of 16)**: Skips only 14 bytes, leaving 2 bytes of SLL header in front of the IP packet → decode_ip() receives malformed data
- **Too large**: Skips into IP header data → decode_ip() receives truncated IP packet

## Linux SLL Header Structure

The Linux cooked capture header is **16 bytes**:

```c
struct sll_header {
    uint16_t sll_pkttype;     // Packet type (0-4)
    uint16_t sll_hatype;      // Link layer address type
    uint16_t sll_halen;       // Link layer address length
    uint8_t  sll_addr[8];     // Link layer address (MAC)
    uint16_t sll_protocol;    // Protocol type (e.g., 0x0800 for IP)
};
// Total: 16 bytes
```

Compare to Ethernet header (14 bytes):
```c
struct ether_header {
    uint8_t  ether_dhost[6];  // Destination MAC
    uint8_t  ether_shost[6];  // Source MAC
    uint16_t ether_type;      // Protocol type
};
// Total: 14 bytes
```

**Key difference**: SLL header is 2 bytes longer.

## The "1550 Bytes" Mystery

The user mentioned seeing "1550 bytes" consistently. Analysis:

```
Standard Ethernet packet:
  MTU:              1500 bytes (IP packet)
  Ethernet header:    14 bytes
  Total:            1514 bytes

Linux SLL packet:
  MTU:              1500 bytes (IP packet)
  SLL header:         16 bytes
  Total:            1516 bytes

Observed:           1550 bytes
```

**Hypothesis**:
- 1550 bytes suggests a slightly larger than standard MTU
- 1550 - 16 (SLL) = 1534 byte IP packet (non-standard)
- 1550 - 14 (Ethernet) = 1536 byte IP packet (also non-standard)
- Could be:
  - Jumbo frames enabled
  - VLAN tagging (adds 4 bytes to Ethernet)
  - Custom MTU configuration
  - Test packet with specific size

## Implications

### Current Behavior

1. **Using specific interface** (e.g., "eth0"):
   - Link type: DLT_EN10MB (1)
   - Header length: 14 bytes ✅ Works correctly

2. **Using "any" interface**:
   - Link type: DLT_LINUX_SLL (113)
   - Header length: **Error - not supported** ❌
   - Program terminates with: "Unknown pcap linktype `113`"

### Why This Matters

- The "any" interface is useful for:
  - Capturing traffic on multiple interfaces simultaneously
  - Systems where the active interface is unknown
  - Container/virtualized environments
  - Cluster mode where packets may arrive on any interface

- Without SLL support, unicornscan **cannot** use the "any" interface

## Fix Required

**File**: `src/unilib/pcaputil.c`

Add support for DLT_LINUX_SLL in `util_getheadersize()`:

```c
int util_getheadersize(pcap_t *pdev, char *errorbuf) {
    int linktype=0;

    switch((linktype=pcap_datalink(pdev))) {
        case DLT_NULL:
            return 4;
#ifdef DLT_RAW
        case DLT_RAW:
            return 0;
#endif
        case DLT_EN10MB:
            return 14;
#ifdef DLT_LINUX_SLL
        case DLT_LINUX_SLL:
            return 16;  // ← ADD THIS CASE
#endif
#ifdef DLT_LOOP
        case DLT_LOOP:
            return 8;
#endif
        // ... rest of cases ...
        default:
            snprintf(errorbuf, PCAP_ERRBUF_SIZE -1, "Unknown pcap linktype `%d'", linktype);
    }

    return -1;
}
```

### Additional Considerations

1. **DLT_LINUX_SLL2** (276): Linux cooked capture v2, also 16 bytes header
   - Should also be supported for newer systems

2. **Error handling**: The current code terminates on unknown link types
   - Could be more graceful (warning + fallback?)

3. **ARP scanning check**:
   ```c
   if (s->ss->mode == MODE_ARPSCAN) {
       if (s->ss->header_len != 14) {
           terminate("wrong linktype for arp scan");
       }
   }
   ```
   This prevents ARP scanning on SLL interfaces (intentional - ARP is L2)

## Testing Strategy

1. **Verify link type detection**:
   ```bash
   sudo unicornscan -i any -p 80 127.0.0.1
   # Should now work instead of terminating
   ```

2. **Compare packet capture**:
   ```bash
   # Capture on specific interface
   sudo unicornscan -i eth0 -p 80 target

   # Capture on any interface
   sudo unicornscan -i any -p 80 target

   # Results should be identical
   ```

3. **Validate header stripping**:
   - Enable debug mode with `-vvv`
   - Check "got packet with length X (cap Y) with header length at Z"
   - Verify Z=16 for "any", Z=14 for specific interfaces

4. **Edge cases**:
   - WiFi interfaces (may support both DLT_EN10MB and DLT_IEEE802_11)
   - Loopback (DLT_NULL or DLT_LOOP)
   - VPN interfaces (various DLT types)

## Related Code Locations

### Packet Capture Setup
- `src/scan_progs/recv_packet.c:176` - pcap_open_live()
- `src/scan_progs/recv_packet.c:192` - util_try_set_datalink_ethernet()
- `src/scan_progs/recv_packet.c:209` - util_getheadersize()

### Header Length Usage
- `src/scan_progs/recv_packet.c:219` - Set s->ss->header_len
- `src/scan_progs/recv_packet.c:369` - ARP mode check
- `src/scan_progs/packet_parse.c:284` - Packet too short check
- `src/scan_progs/packet_parse.c:293-294` - Strip header

### Link Layer Detection
- `src/unilib/pcaputil.c:33-82` - util_getheadersize()
- `src/unilib/pcaputil.c:88-111` - util_try_set_datalink_ethernet()

## References

- **Linux SLL**: https://www.tcpdump.org/linktypes/LINKTYPE_LINUX_SLL.html
- **DLT_LINUX_SLL definition**: /usr/include/pcap/dlt.h line 347
- **pcap_datalink()**: libpcap documentation
- **commit b6744a8**: "Fix pcap packet capture timing for WiFi phantom IP scanning"
  - Added WiFi datalink support (DLT_EN10MB cooked mode)
  - Changed pcap timeout from 0 to 100ms
  - Did NOT add DLT_LINUX_SLL support

## Conclusion

The unicornscan pcap capture system is missing support for Linux Cooked Capture (DLT_LINUX_SLL), which is essential for using the "any" interface. The fix is straightforward: add a case for `DLT_LINUX_SLL` returning 16 bytes in `util_getheadersize()`.

This is a **critical missing feature** for:
- Multi-interface capture scenarios
- Container/VM environments
- Cluster mode deployments
- Situations where the active interface is unknown

**Priority**: High - should be fixed before release
**Complexity**: Low - single case statement addition
**Risk**: Low - well-defined constant, widely used in pcap applications
