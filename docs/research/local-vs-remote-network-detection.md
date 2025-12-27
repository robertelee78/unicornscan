# Local vs Remote Network Detection Research

**Date**: 2025-12-23
**Research Focus**: How unicornscan detects local vs remote targets and handles ARP scanning
**Codebase Version**: 0.4.7

## Executive Summary

Unicornscan uses a **routing table lookup approach** to determine network topology but **does NOT currently detect local vs remote targets** for the purpose of restricting ARP scan mode to local networks only. ARP scan mode (`-mA`) will attempt to send ARP requests to ANY target, including remote hosts, which will fail silently for routed networks.

### Key Findings

1. **Route Detection**: Uses `/proc/net/route` (Linux) or `sysctl` (BSD) to determine interface and gateway
2. **Gateway Detection**: `getroutes()` returns gateway information when `RTF_GATEWAY` flag is set
3. **No Local/Remote Check**: Current code does not validate if target is on local subnet before ARP scanning
4. **Existing Function Available**: `cidr_within()` can determine if target is within interface subnet
5. **Socket Mode Selection**: Code already distinguishes between `SOCK_LL` (link layer/ARP) and `SOCK_IP` (network layer)

---

## 1. How ARP Scan Mode (-mA) Currently Works

### 1.1 Mode Activation

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/send_packet.c`

**Lines 499-506**: ARP workunit triggers link-layer mode
```c
else if (*wk_u.magic == ARP_SEND_MAGIC) {
    open_link(SOCK_LL, &s->ss->target, &s->ss->targetmask);

    DBG(M_WRK, "got arp workunit");
    s->ss->mode=MODE_ARPSCAN;
} /* ARP send magic */
```

**Key Points**:
- ARP scan always uses `SOCK_LL` (link layer socket)
- Opens raw Ethernet interface (no routing through IP stack)
- **No validation** that target is on local network

### 1.2 ARP Packet Construction

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/send_packet.c`

**Lines 837-847**: Ethernet header with broadcast MAC
```c
else if (s->ss->mode == MODE_ARPSCAN) {
    uint8_t ethbk[6]={ 0xff, 0xff, 0xff, 0xff, 0xff, 0xff };

    /****************************************************************
     *			BUILD ETH HEADER			*
     ****************************************************************/
    makepkt_build_ethernet(	6,
                (const uint8_t *)&ethbk[0],  // Broadcast destination
                (const uint8_t *)sl.esrc,     // Source MAC
                ETHERTYPE_ARP
    );
}
```

**Lines 887-903**: ARP request construction
```c
else if (s->ss->mode == MODE_ARPSCAN) {
    uint8_t arpbk[6]={ 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };

    if (ipv4 == 1) {
        makepkt_build_arp(	ARPHRD_ETHER,
                    ETHERTYPE_IP,
                    6,
                    4,
                    ARPOP_REQUEST,
                    (const uint8_t *)sl.esrc,           // Source MAC
                    (const uint8_t *)&myaddr_u.sin->sin_addr.s_addr,  // Source IP
                    (const uint8_t *)&arpbk[0],         // Target MAC (unknown)
                    (const uint8_t *)&target_u.sin->sin_addr.s_addr   // Target IP
        );
    }
}
```

**Problem**: These packets are sent regardless of whether target is local or remote.

---

## 2. Routing Logic and Gateway Detection

### 2.1 Route Lookup Function

**File**: `/opt/unicornscan-0.4.7/src/unilib/route.h`

**Function Signature**:
```c
int getroutes(char **intf, const struct sockaddr *tgt,
              const struct sockaddr *tgtmask, struct sockaddr **gw);
```

**File**: `/opt/unicornscan-0.4.7/src/unilib/route.c`

**Lines 46-97**: Route resolution using Patricia tree
```c
int getroutes(char **intf, struct sockaddr *tgt, struct sockaddr *tgtmask, struct sockaddr **gw) {
    static char lookup[128];
    route_info_t ri_u;
    union sock_u ts_u, gws_u;
    static struct sockaddr_storage gw_s;
    char *rstr=NULL;
    unsigned int rmask=0;

    assert(intf != NULL && tgt != NULL && tgtmask != NULL && gw != NULL);

    ts_u.s=tgt;
    *gw=NULL;

    rstr=cidr_saddrstr(tgt);
    if (rstr == NULL) {
        return -1;
    }

    rmask=cidr_getmask(tgtmask);

    snprintf(lookup, sizeof(lookup) -1, "%s/%u", rstr, rmask);

    DBG(M_RTE, "looking up route for `%s'", lookup);

    if (need_netroutes) {
        get_netroutes();
    }

    node=try_search_best(rt, lookup);
    if (node == NULL) {
        ERR("no route to host for `%s'", lookup);
        *intf=NULL;
        *gw=NULL;
        return -EHOSTUNREACH;
    }
    ri_u.p=node->data;
    assert(node->data != NULL);

    DBG(M_RTE, "found interface `%s' for network `%s'", ri_u.info_s->intf, lookup);

    *intf=ri_u.info_s->intf;
    if (ri_u.info_s->gw.ss_family != 0) {
        memcpy(&gw_s, &ri_u.info_s->gw, sizeof(struct sockaddr_storage));
        gws_u.ss=&gw_s;
        *gw=gws_u.s;
    }
    else {
        *gw=NULL;
    }

    return 1;
}
```

**Key Points**:
- Returns interface name via `intf` pointer
- Returns gateway via `gw` pointer (NULL if directly connected)
- Uses Patricia tree for longest-prefix matching
- Reads routing table from `/proc/net/route` on Linux

### 2.2 Gateway Flag Detection

**File**: `/opt/unicornscan-0.4.7/src/unilib/route.c`

**Lines 154-181**: Parse `/proc/net/route` and extract gateway
```c
if (sscanf(lbuf, "%31s %x %x %hx %u %u %hu %x %hu %hu %u",
           intf, &dest, &gw, &flags, &refcnt, &use, &metric,
           &mask, &mtu, &window, &irtt) == 11) {
    int mycidr=0;
    struct in_addr ia;

    ia.s_addr=dest;
    inet_ntop(AF_INET, &ia, destnet, sizeof(destnet));
    mycidr=masktocidr(mask);
    ia.s_addr=gw;
    inet_ntop(AF_INET, &ia, gwstr, sizeof(gwstr));

    if (flags & RTF_UP && mycidr > -1) {
        union sock_u s_u;
        route_info_t ri_u;

        ri_u.p=xmalloc(sizeof(*ri_u.info_s));
        memset(ri_u.p, 0, sizeof(*ri_u.info_s));

        ri_u.info_s->intf=xstrdup(intf);
        ri_u.info_s->metric=metric;
        ri_u.info_s->flags=flags;
        if ((flags & RTF_GATEWAY) == RTF_GATEWAY) {  // <-- GATEWAY DETECTION
            s_u.ss=&ri_u.info_s->gw;
            s_u.sin->sin_addr.s_addr=gw;
            s_u.sin->sin_family=AF_INET;
        }
        // ... store route in Patricia tree
    }
}
```

**Critical Flag**: `RTF_GATEWAY` (value `0x0002`) indicates traffic must be routed through gateway

**Lines 141-142**: Flag definitions
```c
#define RTF_UP          0x0001          /* route usable                 */
#define RTF_GATEWAY     0x0002          /* destination is a gateway     */
```

### 2.3 Route Lookup Call Site

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/workunits.c`

**Lines 544-549**: Called during workunit distribution
```c
ret=getroutes(
    &add,
    (const struct sockaddr *)&w_u.w->s->target,
    (const struct sockaddr *)&w_u.w->s->targetmask,
    &gw
);
```

**Purpose**: Determine which interface to use for sending packets

**What it does NOT do**: Validate if ARP scanning is appropriate

---

## 3. Interface and Subnet Information

### 3.1 Interface Info Retrieval

**File**: `/opt/unicornscan-0.4.7/src/unilib/intf.c`

**Lines 30-111**: Extract interface address and netmask
```c
int get_interface_info(const char *iname, interface_info_t *ii) {
    pcap_if_t *pif=NULL, *walk=NULL;
    struct pcap_addr *pa=NULL;
    int got_linkaddr=0, got_ipaddr=0;

    // ... pcap_findalldevs() ...

    for (walk=pif; walk != NULL; walk=walk->next) {
        if (strcmp(walk->name, iname) == 0) {
            for (pa=walk->addresses; pa != NULL; pa=pa->next) {
                pcapaddr_u.s=pa->addr;

                if (got_linkaddr == 0 && pcapaddr_u.fs->family == AF_PACKET) {
                    memcpy(ii->hwaddr, pcapaddr_u.sl->sll_addr, THE_ONLY_SUPPORTED_HWADDR_LEN);
                    got_linkaddr=1;
                }
                else if (got_ipaddr == 0 && pcapaddr_u.fs->family == AF_INET) {
                    myaddr_u.ss=&ii->myaddr;
                    mymask_u.ss=&ii->mymask;

                    memcpy(&ii->myaddr, pcapaddr_u.ss, sizeof(struct sockaddr_in));
                    mymask_u.sin->sin_addr.s_addr=0xffffffff;  // <-- WRONG!
                    mymask_u.sin->sin_family=AF_INET;
                    got_ipaddr=1;
                }
            }
        }
    }
    // ...
}
```

**CRITICAL BUG** (Line 75): Interface netmask hardcoded to `0xffffffff` (/32)!
- This means `ii->mymask` always represents single-host netmask
- **This is why subnet detection would fail** if attempted

### 3.2 Netmask Storage

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/workunits.c`

**Lines 604-606**: Workunit gets interface info
```c
memcpy(&w_u.w->s->myaddr, &s->vi[0]->myaddr, sizeof(struct sockaddr_storage));
memcpy(&w_u.w->s->mymask, &s->vi[0]->mymask, sizeof(struct sockaddr_storage));
memcpy(&w_u.w->s->hwaddr, s->vi[0]->hwaddr, THE_ONLY_SUPPORTED_HWADDR_LEN);
```

**But**: `s->vi[0]->mymask` is always `/32` due to bug in `get_interface_info()`

---

## 4. Existing Helper Functions (Reusable)

### 4.1 Subnet Membership Test

**File**: `/opt/unicornscan-0.4.7/src/unilib/cidr.c`

**Function**: `cidr_within()` - Lines 387-458
```c
int cidr_within(const struct sockaddr *host, const struct sockaddr *net, const struct sockaddr *mask) {
    union sock_u host_u, net_u, mask_u;

    host_u.p=host;
    net_u.p=net;
    mask_u.p=mask;

    if (net_u.fs->family != mask_u.fs->family) {
        ERR("net family not same as mask family");
        return -1;
    }

    if (host_u.fs->family != net_u.fs->family) {
        ERR("host family not same as network family");
        return 0;
    }

    if (host_u.fs->family == AF_INET) {
        uint32_t host_max, host_min, host_cur;

        host_min=ntohl(net_u.sin->sin_addr.s_addr);
        host_max=host_min | ~(ntohl(mask_u.sin->sin_addr.s_addr));
        host_cur=ntohl(host_u.sin->sin_addr.s_addr);

        if (host_cur > host_max || host_cur < host_min) {
            return 0;
        }

        return 1;
    }
    // ... IPv6 support ...
}
```

**Returns**:
- `1` if host is within network/netmask
- `0` if outside
- `-1` on error

**Usage Example** (hypothetical):
```c
if (cidr_within(&target, &myaddr, &mymask) == 1) {
    // Target is on local subnet - ARP is valid
} else {
    // Target is remote - must use IP layer
}
```

### 4.2 Other Useful CIDR Functions

**File**: `/opt/unicornscan-0.4.7/src/unilib/cidr.h`

Available functions:
```c
int cidr_get(const char *instr, struct sockaddr *net_id,
             struct sockaddr *netmask, unsigned int *cmask);

unsigned int cidr_getmask(const struct sockaddr *netmask);

double cidr_numhosts(const struct sockaddr *network, const struct sockaddr *netmask);

void cidr_randhost(struct sockaddr *host, const struct sockaddr *network,
                   const struct sockaddr *netmask);

char *cidr_saddrstr(const struct sockaddr *in);
```

---

## 5. Socket Mode Distinction

### 5.1 Link Layer vs Network Layer

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/send_packet.c`

**Lines 111-112**: Socket mode constants
```c
#define SOCK_LL 1  // Link layer (raw Ethernet, for ARP)
#define SOCK_IP 2  // Network layer (IP routing)
```

**Lines 1147-1189**: `open_link()` function
```c
static void open_link(int mode, struct sockaddr_storage *target, struct sockaddr_storage *targetmask) {

    DBG(M_SND, "open link at `%s'", mode == SOCK_LL ? "link layer" : "network layer");

    if (sl.sockmode != mode) {
        switch (sl.sockmode) {
            case SOCK_LL:
                if (sl.s_u.llsock != NULL) {
                    eth_close(sl.s_u.llsock);
                    sl.s_u.llsock=NULL;
                }
                break;
            case SOCK_IP:
                if (sl.s_u.ipsock != NULL) {
                    ip_close(sl.s_u.ipsock);
                    sl.s_u.ipsock=NULL;
                }
                break;
        }

        switch (mode) {
            case SOCK_IP:
                sl.s_u.ipsock=ip_open();
                // ...
                break;

            case SOCK_LL:
                sl.s_u.llsock=eth_open(s->interface_str);
                // ...
                break;
        }
        sl.sockmode=mode;
    }
}
```

### 5.2 Current Mode Selection Logic

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/send_packet.c`

**TCP/UDP Scans** (Lines 485, 493):
```c
open_link(SOCK_IP, &s->ss->target, &s->ss->targetmask);
```

**ARP Scans** (Line 501):
```c
open_link(SOCK_LL, &s->ss->target, &s->ss->targetmask);
```

**Key Insight**: Infrastructure already exists to switch between modes!

---

## 6. Where Local/Remote Detection Should Be Added

### 6.1 Optimal Insertion Point

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/send_packet.c`

**Location**: Lines 499-506 (ARP workunit handling)

**Current Code**:
```c
else if (*wk_u.magic == ARP_SEND_MAGIC) {

    open_link(SOCK_LL, &s->ss->target, &s->ss->targetmask);

    DBG(M_WRK, "got arp workunit");
    s->ss->mode=MODE_ARPSCAN;

}
```

**Proposed Logic** (pseudocode):
```c
else if (*wk_u.magic == ARP_SEND_MAGIC) {

    // Check if target is on local network
    if (is_local_target(&s->ss->target, &s->ss->myaddr, &s->ss->mymask)) {
        // Target is local - use ARP
        open_link(SOCK_LL, &s->ss->target, &s->ss->targetmask);
        s->ss->mode=MODE_ARPSCAN;
    } else {
        // Target is remote - cannot ARP scan
        ERR("ARP scan mode (-mA) cannot reach remote target %s",
            cidr_saddrstr(&s->ss->target));
        // Either skip or error out
    }
}
```

### 6.2 Alternative: Gateway-Based Detection

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/send_packet.c`

**Could leverage existing route lookup**:
```c
else if (*wk_u.magic == ARP_SEND_MAGIC) {
    char *intf = NULL;
    struct sockaddr *gw = NULL;

    // Get route info
    if (getroutes(&intf, &s->ss->target, &s->ss->targetmask, &gw) == 1) {
        if (gw == NULL) {
            // No gateway = directly connected network
            open_link(SOCK_LL, &s->ss->target, &s->ss->targetmask);
            s->ss->mode=MODE_ARPSCAN;
        } else {
            // Gateway required = remote network
            ERR("ARP scan cannot reach %s (requires gateway %s)",
                cidr_saddrstr(&s->ss->target), cidr_saddrstr(gw));
        }
    }
}
```

**Advantage**: Reuses existing routing infrastructure
**Disadvantage**: Requires route table to be populated (already happens in `get_netroutes()`)

---

## 7. Summary of Key Files and Functions

### 7.1 Routing and Network Detection

| File | Function | Purpose | Lines |
|------|----------|---------|-------|
| `/opt/unicornscan-0.4.7/src/unilib/route.c` | `getroutes()` | Lookup route, interface, gateway | 46-97 |
| `/opt/unicornscan-0.4.7/src/unilib/route.c` | `get_netroutes()` | Parse `/proc/net/route` | 115-199 |
| `/opt/unicornscan-0.4.7/src/unilib/cidr.c` | `cidr_within()` | Check if host in subnet | 387-458 |
| `/opt/unicornscan-0.4.7/src/unilib/intf.c` | `get_interface_info()` | Get interface IP/MAC/mask | 30-111 |

### 7.2 ARP Scan Mode Handling

| File | Function/Section | Purpose | Lines |
|------|------------------|---------|-------|
| `/opt/unicornscan-0.4.7/src/scan_progs/send_packet.c` | ARP workunit handler | Trigger ARP mode | 499-506 |
| `/opt/unicornscan-0.4.7/src/scan_progs/send_packet.c` | Ethernet header build | Construct broadcast frame | 837-847 |
| `/opt/unicornscan-0.4.7/src/scan_progs/send_packet.c` | ARP request build | Construct ARP WHO-HAS | 887-903 |
| `/opt/unicornscan-0.4.7/src/scan_progs/send_packet.c` | `open_link()` | Switch between LL/IP sockets | 1147-1189 |

### 7.3 Workunit Distribution

| File | Function | Purpose | Lines |
|------|----------|---------|-------|
| `/opt/unicornscan-0.4.7/src/scan_progs/workunits.c` | `balance_interfaces()` | Call getroutes() for interface | 544-549 |
| `/opt/unicornscan-0.4.7/src/scan_progs/workunits.c` | `balance_send_workunits()` | Copy interface info to workunit | 590-610 |

---

## 8. Current Behavior (Without Fix)

### 8.1 ARP Scan to Local Target

**Example**: `unicornscan -mA 192.168.1.100` (interface is 192.168.1.50/24)

**What Happens**:
1. ARP workunit created with `ARP_SEND_MAGIC`
2. `open_link(SOCK_LL, ...)` opens raw Ethernet socket
3. Broadcast ARP request sent: "Who has 192.168.1.100?"
4. Target responds with MAC address
5. ✅ **Works as expected**

### 8.2 ARP Scan to Remote Target

**Example**: `unicornscan -mA 8.8.8.8` (interface is 192.168.1.50/24)

**What Happens**:
1. ARP workunit created with `ARP_SEND_MAGIC`
2. `open_link(SOCK_LL, ...)` opens raw Ethernet socket
3. Broadcast ARP request sent: "Who has 8.8.8.8?"
4. No device on local network has that IP
5. ❌ **Request times out with no response**
6. No error message - just silent failure

**Problem**: User receives no feedback that ARP scan is inappropriate for remote targets

---

## 9. Existing Bugs That Would Affect Fix

### 9.1 Interface Netmask Bug

**File**: `/opt/unicornscan-0.4.7/src/unilib/intf.c`

**Line 75**: Netmask hardcoded to `/32`
```c
mymask_u.sin->sin_addr.s_addr=0xffffffff;
```

**Should be**: Retrieved from pcap interface info
```c
if (pa->netmask != NULL) {
    memcpy(&ii->mymask, pa->netmask, sizeof(struct sockaddr_in));
} else {
    // Fallback to /24 or /32
    mymask_u.sin->sin_addr.s_addr=0xffffff00;  // /24
}
```

**Impact**: `cidr_within()` would incorrectly report all targets as "not local" because interface mask is always /32

**Must be fixed** before implementing local/remote detection based on subnet membership

---

## 10. Recommendations for Implementation

### 10.1 Approach 1: Gateway-Based (Simplest)

**Advantages**:
- Leverages existing `getroutes()` infrastructure
- No dependency on broken netmask code
- Clear semantic: "gateway present = remote network"

**Implementation**:
```c
// In send_packet.c, around line 499
else if (*wk_u.magic == ARP_SEND_MAGIC) {
    char *intf = NULL;
    struct sockaddr *gw = NULL;

    if (getroutes(&intf, (struct sockaddr *)&s->ss->target,
                  (struct sockaddr *)&s->ss->targetmask, &gw) == 1) {
        if (gw != NULL) {
            ERR("ARP scan mode cannot reach remote target %s (gateway: %s)",
                cidr_saddrstr((struct sockaddr *)&s->ss->target),
                cidr_saddrstr(gw));
            continue; // Skip this workunit
        }
    }

    open_link(SOCK_LL, &s->ss->target, &s->ss->targetmask);
    DBG(M_WRK, "got arp workunit");
    s->ss->mode=MODE_ARPSCAN;
}
```

### 10.2 Approach 2: Subnet-Based (More Correct)

**Advantages**:
- Semantically precise
- Handles edge cases (e.g., multiple interfaces on same subnet)

**Prerequisites**:
1. **Fix netmask bug** in `get_interface_info()`
2. Implement subnet check

**Implementation**:
```c
// Step 1: Fix intf.c netmask retrieval (lines 69-78)
else if (got_ipaddr == 0 && pcapaddr_u.fs->family == AF_INET) {
    myaddr_u.ss=&ii->myaddr;
    mymask_u.ss=&ii->mymask;

    memcpy(&ii->myaddr, pcapaddr_u.ss, sizeof(struct sockaddr_in));

    if (pa->netmask != NULL) {
        memcpy(&ii->mymask, pa->netmask, sizeof(struct sockaddr_in));
    } else {
        mymask_u.sin->sin_addr.s_addr=0xffffff00; // Default /24
        mymask_u.sin->sin_family=AF_INET;
    }
    got_ipaddr=1;
}

// Step 2: Add local check in send_packet.c
else if (*wk_u.magic == ARP_SEND_MAGIC) {
    int is_local = cidr_within(
        (struct sockaddr *)&s->ss->target,
        (struct sockaddr *)&s->ss->myaddr,
        (struct sockaddr *)&s->ss->mymask
    );

    if (is_local != 1) {
        ERR("ARP scan mode (-mA) cannot reach remote target %s (not on local subnet %s/%u)",
            cidr_saddrstr((struct sockaddr *)&s->ss->target),
            cidr_saddrstr((struct sockaddr *)&s->ss->myaddr),
            cidr_getmask((struct sockaddr *)&s->ss->mymask));
        continue;
    }

    open_link(SOCK_LL, &s->ss->target, &s->ss->targetmask);
    s->ss->mode=MODE_ARPSCAN;
}
```

### 10.3 Recommended Approach

**Use Approach 1 (Gateway-Based)** because:
1. Doesn't require fixing netmask bug first (can be separate task)
2. Simpler implementation
3. Matches semantic intent: "Is this target routed or direct?"
4. Already reliable code path (`getroutes()` is used elsewhere)

**Later**: Implement Approach 2 after fixing netmask bug as a more robust solution

---

## 11. Testing Strategy

### 11.1 Test Cases for Local Detection

| Test Case | Target | Interface | Expected Result |
|-----------|--------|-----------|-----------------|
| Local host | 192.168.1.100 | 192.168.1.50/24 | ARP sent, response received |
| Broadcast | 192.168.1.255 | 192.168.1.50/24 | ARP sent to all hosts |
| Own IP | 192.168.1.50 | 192.168.1.50/24 | ARP sent (should get own MAC) |
| Remote host | 8.8.8.8 | 192.168.1.50/24 | **ERROR: Cannot ARP remote** |
| Other subnet | 192.168.2.1 | 192.168.1.50/24 | **ERROR: Cannot ARP remote** |
| Gateway | 192.168.1.1 | 192.168.1.50/24 | ARP sent (gateway is local) |

### 11.2 Verification Commands

```bash
# Test local target (should work)
unicornscan -mA 192.168.1.1

# Test remote target (should error with gateway-based check)
unicornscan -mA 8.8.8.8

# Test CIDR range mixing local and remote (partial success expected)
unicornscan -mA 192.168.1.0/23  # Includes both .1.x and .2.x subnets
```

---

## 12. Related Code Patterns

### 12.1 How TCP/UDP Mode Determines Route

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/send_packet.c`

**Lines 485, 493**: Always use `SOCK_IP` (network layer)
```c
open_link(SOCK_IP, &s->ss->target, &s->ss->targetmask);
```

**Key Difference**: IP layer routing handles both local and remote automatically:
- **Local**: IP stack sends ARP request internally, then sends IP packet
- **Remote**: IP stack forwards to gateway

**ARP mode** cannot do this - it's explicitly asking for Layer 2 (link layer) communication

### 12.2 Priority Send (Connect Mode)

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/send_packet.c`

**Lines 415**: Priority workunits also use IP layer
```c
open_link(SOCK_IP, &s_u.ss, NULL);
```

**Implication**: Only ARP mode uses `SOCK_LL`, everything else uses `SOCK_IP`

---

## 13. Future Enhancements

### 13.1 Automatic Fallback

Instead of erroring, could auto-convert ARP scan to TCP/UDP scan for remote targets:

```c
else if (*wk_u.magic == ARP_SEND_MAGIC) {
    struct sockaddr *gw = NULL;

    getroutes(&intf, &s->ss->target, &s->ss->targetmask, &gw);

    if (gw != NULL) {
        WARN("Target %s is remote, converting ARP scan to TCP SYN scan",
             cidr_saddrstr(&s->ss->target));
        *wk_u.magic = TCP_SEND_MAGIC;  // Convert workunit type
        open_link(SOCK_IP, &s->ss->target, &s->ss->targetmask);
        s->ss->mode = MODE_TCPSCAN;
    } else {
        open_link(SOCK_LL, &s->ss->target, &s->ss->targetmask);
        s->ss->mode = MODE_ARPSCAN;
    }
}
```

**Pros**: More user-friendly
**Cons**: Surprising behavior change, may not match user intent

### 13.2 Mixed-Mode Scanning

For CIDR ranges spanning local and remote subnets:
- Local targets get ARP scan
- Remote targets get warning/skip or automatic TCP scan

---

## 14. Code Locations Reference

### 14.1 Files to Modify (Approach 1: Gateway-Based)

1. **Primary**: `/opt/unicornscan-0.4.7/src/scan_progs/send_packet.c`
   - Lines 499-506: Add gateway check before ARP mode activation

### 14.2 Files to Modify (Approach 2: Subnet-Based)

1. **Fix netmask bug**: `/opt/unicornscan-0.4.7/src/unilib/intf.c`
   - Lines 69-78: Retrieve actual netmask from pcap

2. **Add subnet check**: `/opt/unicornscan-0.4.7/src/scan_progs/send_packet.c`
   - Lines 499-506: Use `cidr_within()` to validate local target

### 14.3 Supporting Files (Read-Only for Context)

- `/opt/unicornscan-0.4.7/src/unilib/route.c` - Understand routing logic
- `/opt/unicornscan-0.4.7/src/unilib/cidr.c` - Review `cidr_within()` usage
- `/opt/unicornscan-0.4.7/src/scan_progs/workunits.c` - See where routes are looked up

---

## 15. Conclusion

### Current State
- **No local/remote detection** exists for ARP scan mode
- **Routing infrastructure exists** (`getroutes()`) but not used for ARP validation
- **Subnet checking function exists** (`cidr_within()`) but not used
- **Netmask bug** in interface code prevents subnet-based detection

### Recommended Fix
1. **Immediate**: Implement gateway-based detection (Approach 1)
   - Simple, reliable, doesn't depend on broken code
   - Insert check at line 499 of `send_packet.c`

2. **Follow-up**: Fix netmask bug in `intf.c`
   - Required for proper subnet-based detection

3. **Enhancement**: Implement subnet-based detection (Approach 2)
   - More precise, handles edge cases

### Reusable Functions
- `getroutes()` - Returns gateway (NULL if local)
- `cidr_within()` - Tests subnet membership
- `cidr_saddrstr()` - Format addresses for error messages
- Existing `SOCK_LL` vs `SOCK_IP` socket mode switching

---

**Document Version**: 1.0
**Last Updated**: 2025-12-23
**Author**: Research Agent (Claude Code)
