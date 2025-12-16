# Unicornscan OS Fingerprint Spoofing System - Technical Analysis

## Executive Summary

This document provides a comprehensive technical analysis of unicornscan's OS fingerprint spoofing system, which allows the scanner to send packets that mimic specific operating systems. This is accomplished through the `-W` flag and involves modifying multiple TCP/IP stack parameters to match known OS signatures.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Command Line Interface](#command-line-interface)
3. [Fingerprint Definitions](#fingerprint-definitions)
4. [Implementation Details](#implementation-details)
5. [Extending the System](#extending-the-system)

---

## System Architecture

### Data Flow

```
Command Line (-W flag)
    ↓
getconfig.c:364 → scan_setfingerprint()
    ↓
scanopts.c:87-97 → Store in s->ss->fingerprint
    ↓
init_packet.c:81-350 → init_packet() applies fingerprint
    ↓
send_packet.c:804-879 → Packets built with fingerprint params
    ↓
Network (spoofed OS signature)
```

### Key Data Structures

**File: src/scan_progs/scanopts.h:24-62**
```c
typedef struct scan_settings_t {
    uint16_t fingerprint;       // OS fingerprint to emulate (line 31)

    // IP layer parameters affected by fingerprint
    uint8_t tos;                // Type of Service (line 34)
    uint8_t minttl;             // Minimum TTL (line 35)
    uint8_t maxttl;             // Maximum TTL (line 36)
    uint16_t ip_off;            // IP flags (DF bit, etc) (line 37)

    // TCP layer parameters affected by fingerprint
    uint16_t tcphdrflgs;        // TCP flags (line 47)
    uint8_t tcpoptions[64];     // TCP options (line 48)
    uint8_t tcpoptions_len;     // TCP options length (line 49)
    uint32_t window_size;       // TCP window size (line 52)
} scan_settings_t;
```

---

## Command Line Interface

### Option Definition

**File: src/getconfig.c:136**
```c
{"fingerprint", 1, NULL, 'W'},
```

**File: src/getconfig.c:363-367**
```c
case 'W': /* what stack to pretend to have */
    if (scan_setfingerprint(atoi(optarg)) < 0) {
        usage();
    }
    break;
```

### Usage Documentation

**File: src/getconfig.c:488-489**
```
-W, --fingerprint    *OS fingerprint 0=cisco(def) 1=openbsd 2=WindowsXP 3=p0fsendsyn 4=FreeBSD 5=nmap
                      6=linux 7:strangetcp
```

### Available Fingerprints

| Value | OS/Profile | Description |
|-------|------------|-------------|
| 0 | Cisco IOS | Default - Cisco IOS 12.1 router |
| 1 | OpenBSD | OpenBSD 3.0-3.4 |
| 2 | Windows XP | Windows XP or similar |
| 3 | p0fsendsyn | p0f sendsyn signature |
| 4 | FreeBSD | FreeBSD 5.1-5.2 |
| 5 | nmap | NMAP OS detection probe |
| 6 | Linux | Linux 2.4/2.6 kernel |
| 7 | strangetcp | Custom unusual TCP stack |

---

## Fingerprint Definitions

All fingerprint implementations are in **src/scan_progs/init_packet.c:81-350**

### Fingerprint 0: Cisco IOS 12.1

**Lines: 88-103**

**TCP/IP Parameters:**
```c
TTL:            255
IP Flags:       0 (No DF bit)
Window Size:    4128
TCP Options:    MSS only (4 bytes total)
                <MSS (MTU-40)>
```

**TCP Options Encoding:**
```c
s->ss->tcpoptions[0] = 0x02;  // Option kind: MSS
s->ss->tcpoptions[1] = 0x04;  // Option length: 4 bytes
mtu = htons(s->vi[0]->mtu - 40);
memcpy(s->ss->tcpoptions + 2, &mtu, sizeof(mtu));  // MSS value
```

**Reference:** "Cisco IOS 12.1 on a 2600 router type device, from tcpdump"

**Characteristics:**
- High TTL (255) typical of network infrastructure
- Simple TCP options (MSS only)
- Moderate window size (4128)
- No DF (Don't Fragment) bit set

---

### Fingerprint 1: OpenBSD 3.0-3.4

**Lines: 105-138**

**TCP/IP Parameters:**
```c
TTL:            64
IP Flags:       IP_DF (0x4000 - Don't Fragment)
Window Size:    16384
TCP Options:    24 bytes
                <MSS (MTU-64), NOP, NOP, SACK_PERMITTED, NOP,
                 WINDOW_SCALE 0, NOP, NOP, TIMESTAMP>
```

**TCP Options Encoding:**
```c
Offset  Value   Description
------  -----   -----------
0-1     02 04   MSS option kind and length
2-3     [MTU]   MSS value = MTU - 64 (network byte order)
4-5     01 01   NOP, NOP
6-7     04 02   SACK_PERMITTED option kind and length
8       01      NOP
9-11    03 03 00 WINDOW_SCALE option (kind, length, shift=0)
12-13   01 01   NOP, NOP
14-15   08 0a   TIMESTAMP option kind and length
16-19   [TSTAMP] Timestamp value (random)
20-23   00 00 00 00 Echo timestamp (0 for SYN)
```

**Reference:** "openbsd 3.0-3.4 from the p0f fp file"

**Characteristics:**
- DF bit set (typical for modern OS)
- Complex TCP option ordering
- Window scale of 0 (unusual)
- Includes TCP timestamps

---

### Fingerprint 2: Windows XP

**Lines: 139-160**

**TCP/IP Parameters:**
```c
TTL:            128
IP Flags:       IP_DF (0x4000 - Don't Fragment)
Window Size:    32767 (0x7FFF)
TCP Options:    8 bytes
                <MSS (MTU-40), NOP, NOP, SACK_PERMITTED>
```

**TCP Options Encoding:**
```c
Offset  Value   Description
------  -----   -----------
0-1     02 04   MSS option kind and length
2-3     [MTU]   MSS value = MTU - 40
4-5     01 01   NOP, NOP
6-7     04 02   SACK_PERMITTED option kind and length
```

**Reference:** "windows xp or something from the p0f fp file"

**Characteristics:**
- TTL of 128 (Windows default)
- Large window size (32767)
- DF bit set
- Simple SACK support without timestamps or window scaling

---

### Fingerprint 3: p0f sendsyn

**Lines: 162-175**

**TCP/IP Parameters:**
```c
TTL:            255
IP Flags:       0 (No DF bit)
Window Size:    12345
TCP Options:    0 bytes (none)
```

**Reference:** "p0f sendsyn (aprox)"

**Characteristics:**
- Unusual window size (12345) - signature value
- No TCP options at all
- High TTL (255)
- No DF bit
- Minimal fingerprint designed to be distinctive

---

### Fingerprint 4: FreeBSD 5.1-5.2

**Lines: 176-214**

**TCP/IP Parameters:**
```c
TTL:            64
IP Flags:       IP_DF (0x4000 - Don't Fragment)
TOS:            0x10 (if not already set)
Window Size:    65535 (0xFFFF)
TCP Options:    20 bytes
                <MSS (MTU-40), NOP, WINDOW_SCALE 1, NOP, NOP, TIMESTAMP>
```

**TCP Options Encoding:**
```c
Offset  Value   Description
------  -----   -----------
0-1     02 04   MSS option kind and length
2-3     [MTU]   MSS value = MTU - 40
4       01      NOP
5-7     03 03 01 WINDOW_SCALE option (kind, length, shift=1)
8-9     01 01   NOP, NOP
10-11   08 0a   TIMESTAMP option kind and length
12-15   [TSTAMP] Timestamp value (random)
16-19   00 00 00 00 Echo timestamp (0 for SYN)
```

**Reference:**
```
From FreeBSD 5.2.1-RELEASE
IP (tos 0x10, ttl 63, id 10466, offset 0, flags [DF], length: 60)
X.X.X.X.49362 > Y.Y.Y.Y.80: S [tcp sum ok] 3005084049:3005084049(0)
win 65535 <mss 1460,nop,wscale 1,nop,nop,timestamp 286071223 0>
```

**Characteristics:**
- TOS 0x10 (low delay - telnet characteristic)
- Maximum window size (65535)
- Window scale of 1 (effective window = 65535 * 2)
- TCP timestamps enabled

---

### Fingerprint 5: NMAP OS Detection Probe

**Lines: 215-255**

**TCP/IP Parameters:**
```c
TTL:            61
IP Flags:       0 (No DF bit)
Window Size:    3072
TCP Options:    20 bytes
                <WINDOW_SCALE 10, NOP, MSS 265, TIMESTAMP, EOL>
```

**TCP Options Encoding:**
```c
Offset  Value   Description
------  -----   -----------
0-2     03 03 0a WINDOW_SCALE option (kind, length, shift=10)
3       01      NOP
4-5     02 04   MSS option kind and length
6-7     01 09   MSS value = 265 (hardcoded unusual value)
8-9     08 0a   TIMESTAMP option kind and length
10-13   [TSTAMP] Timestamp value (random)
14-17   00 00 00 00 Echo timestamp (0)
18-19   00 00   EOL, EOL (padding)
```

**Reference:**
```
p0f says:
3072:64:0:60:W10,N,M265,T,E:PF:-*NMAP:OS detection probe w/flags (4)

tcpdump says:
IP (tos 0x0, ttl 41, id 19158, offset 0, flags [none], length: 60)
X.X.X.X.62266 > Y.Y.Y.Y.5555: S [tcp sum ok] 2696440034:2696440034(0)
win 3072 <wscale 10,nop,mss 265,timestamp 1061109567 0,eol>
```

**Characteristics:**
- Unusual MSS value (265) - signature
- Unusual option ordering (WSCALE before MSS)
- Window scale of 10 (effective window = 3072 * 1024 = 3,145,728)
- Distinctive signature that p0f identifies as NMAP

---

### Fingerprint 6: Linux 2.4/2.6

**Lines: 256-293**

**TCP/IP Parameters:**
```c
TTL:            64
IP Flags:       IP_DF (0x4000 - Don't Fragment)
Window Size:    (MTU - 64) * 4
TCP Options:    20 bytes
                <MSS (MTU-64), SACK_PERMITTED, TIMESTAMP, NOP, WINDOW_SCALE 0>
```

**TCP Options Encoding:**
```c
Offset  Value   Description
------  -----   -----------
0-1     02 04   MSS option kind and length
2-3     [MTU]   MSS value = MTU - 64
4-5     04 02   SACK_PERMITTED option kind and length
6-7     08 0a   TIMESTAMP option kind and length
8-11    [TSTAMP] Timestamp value (random)
12-15   00 00 00 00 Echo timestamp (0)
16      01      NOP
17-19   03 03 00 WINDOW_SCALE option (kind, length, shift=0)
```

**Reference:**
```
IP (tos 0x0, ttl 63, id 12954, offset 0, flags [DF], length: 60)
Y.Y.Y.Y.32917 > X.X.X.X.7777: S [tcp sum ok] 2611271644:2611271644(0)
win 5744 <mss 1436,sackOK,timestamp XXXX32940 0,nop,wscale 0>

p0f identifies as:
Linux 2.4/2.6 (up: 7524 hrs)
```

**Characteristics:**
- Dynamic window size calculation based on MTU
- Specific option ordering (MSS, SACK, TIMESTAMP, NOP, WSCALE)
- Window scale of 0
- DF bit set
- TTL of 64

---

### Fingerprint 7: strangetcp

**Lines: 294-339**

**TCP/IP Parameters:**
```c
TTL:            Random (0x80-0xFF, i.e., 128-255)
IP Flags:       IP_DF (0x4000 - Don't Fragment)
Window Size:    (MTU - 32) * 8
TCP Options:    24 bytes (truncated, should be 34)
                <MSS 1024, SACK_PERMITTED, MD5_SIGNATURE, TIMESTAMP, NOP, NOP>
```

**TCP Options Encoding:**
```c
Offset  Value   Description
------  -----   -----------
0-1     02 04   MSS option kind and length
2-3     04 00   MSS value = 1024 (hardcoded)
4-5     04 02   SACK_PERMITTED option kind and length
6-7     13 12   MD5 signature option (kind 0x13, length 18)
8-23    [RAND]  Random MD5 signature data (16 bytes)
24-25   08 0a   TIMESTAMP option kind and length
26-29   [TSTAMP] Timestamp value
30-33   00 00 00 00 Echo timestamp
34-37   01 01 01 01 NOPs (note: code has bug, overlapping writes)
```

**Note:** Comment on line 311 indicates: "i cant make this as big as i want, not sure where this is breaking"

**Characteristics:**
- Random TTL in upper range (128-255)
- Includes MD5 signature option (RFC 2385) with random data
- Fixed MSS of 1024 (unusual)
- Large dynamic window size
- Intentionally unusual/invalid to avoid detection
- Code bug: tcpoptions_len=24 but code writes beyond that

---

## Implementation Details

### Core Functions

#### 1. scan_setfingerprint()

**File: src/scan_progs/scanopts.c:87-97**

```c
int scan_setfingerprint(int fp) {
    if (fp < 0 || fp > 0xffff) {
        ERR("bad fingerprint value");
        return -1;
    }

    s->ss->fingerprint=(uint16_t)fp;

    return 1;
}
```

**Purpose:** Validates and stores the fingerprint value.

**Validation:** Accepts values 0-65535, but only 0-7 are defined.

---

#### 2. init_packet()

**File: src/scan_progs/init_packet.c:81-350**

```c
void init_packet(void) {
    uint32_t l_tstamp=0, r_tstamp=0;

    l_tstamp=prng_get32();  // Random local timestamp
    r_tstamp=0;             // Remote timestamp (0 for SYN)

    switch (s->ss->fingerprint) {
        case 0:  // Cisco
            // ... set parameters
            break;
        case 1:  // OpenBSD
            // ... set parameters
            break;
        // ... cases 2-7
        case 8:  // Fallback
        default:
            ERR("unknown fingerprint `%d', defaulting to 0", s->ss->fingerprint);
            s->ss->fingerprint=0;
            init_packet();  // Recursive call with fingerprint=0
            break;
    }
}
```

**Purpose:** Applies the selected fingerprint by setting TCP/IP parameters.

**Called from:**
- send_packet.c:511 after receiving a workunit
- Recursively for unknown fingerprints (defaults to 0)

**Key Actions:**
1. Generates random timestamp for TCP options
2. Sets TTL via scan_setttl() if not already set
3. Configures IP flags (DF bit)
4. Sets TCP window size
5. Builds TCP options array
6. Sets TCP options length

---

#### 3. get_postoptions()

**File: src/scan_progs/init_packet.c:36-79**

```c
void get_postoptions(uint32_t refl_ts, uint32_t my_tstamp) {
    uint32_t p_tstamp=0, t_tstamp=0;

    p_tstamp=htonl(my_tstamp);
    t_tstamp=htonl(refl_ts);

    s->ss->posttcpoptions_len=0;
    memset(s->ss->posttcpoptions, 0, sizeof(s->ss->posttcpoptions));

    switch (s->ss->fingerprint) {
        case 0: /* cisco ios */
        case 2: /* windows 3.1 */
        case 3: /* p0f sendsyn */
            break;  // No post-options

        case 6: /* linux */
        case 1: /* OpenBSD */
        case 7: /* no comment */
        case 4: /* FreeBSD 5.1 */
            if (refl_ts != 0 && my_tstamp != 0) {
                // Build timestamp options for ACK packets
                s->ss->posttcpoptions_len=12;
                // <NOP, NOP, TIMESTAMP>
            }
            break;
    }
}
```

**Purpose:** Builds TCP options for non-SYN packets (ACK, etc.) that need to echo timestamps.

**Called from:**
- send_packet.c:1076 in priority_send_packet() for response packets
- Used during TCP handshake completion

---

#### 4. Packet Building Flow

**File: src/scan_progs/send_packet.c:804-879**

```c
// Build IP header
makepkt_build_ipv4(
    s->ss->tos,                      // From fingerprint (FreeBSD=0x10)
    (uint16_t)prng_get32(),          // Random IP ID
    s->ss->ip_off,                   // From fingerprint (DF bit)
    sl.curttl,                       // From fingerprint (TTL)
    IPPROTO_TCP,
    n_chksum,
    myaddr_u.sin->sin_addr.s_addr,
    target_u.sin->sin_addr.s_addr,
    NULL, 0,                         // IP options
    NULL, 0                          // Payload
);

// Build TCP header
makepkt_build_tcp(
    (uint16_t)sl.local_port,
    rport,
    t_chksum,
    seq,
    0,                               // ACK seq
    s->ss->tcphdrflgs,               // TCP flags
    s->ss->window_size,              // From fingerprint
    0,                               // URG pointer
    s->ss->tcpoptions,               // From fingerprint
    s->ss->tcpoptions_len,           // From fingerprint
    NULL, 0                          // Payload
);
```

**Integration:** The fingerprint parameters set by init_packet() are passed directly to packet building functions.

---

### TCP Options Reference

TCP options used in fingerprints:

| Code | Name | Length | Format | Description |
|------|------|--------|--------|-------------|
| 0x00 | EOL | 1 | `00` | End of option list |
| 0x01 | NOP | 1 | `01` | No operation (padding) |
| 0x02 | MSS | 4 | `02 04 [MSS]` | Maximum segment size |
| 0x03 | WSCALE | 3 | `03 03 [shift]` | Window scale factor |
| 0x04 | SACK_OK | 2 | `04 02` | SACK permitted |
| 0x08 | TIMESTAMP | 10 | `08 0a [ts] [echo]` | Timestamps |
| 0x13 | MD5SIG | 18 | `13 12 [sig]` | MD5 signature (RFC 2385) |

**Format Notes:**
- First byte: Option kind
- Second byte: Option length (includes kind and length bytes)
- Remaining bytes: Option-specific data
- Options must be padded to 4-byte boundaries

---

### Workunit Data Propagation

**File: src/scan_progs/workunits.c:410**

```c
sw_u.s->fingerprint=s->ss->fingerprint;
```

**File: src/scan_progs/send_packet.c:464**

```c
s->ss->fingerprint=wk_u.s->fingerprint;
```

The fingerprint value is passed through workunits from the master process to the sender process via IPC, ensuring the sender process applies the correct fingerprint.

---

## Extending the System

### Adding a New Fingerprint

To add a new OS fingerprint (e.g., fingerprint 8 for macOS):

#### Step 1: Update Usage Documentation

**File: src/getconfig.c:488-489**

```c
"\t-W, --fingerprint    *OS fingerprint 0=cisco(def) 1=openbsd 2=WindowsXP 3=p0fsendsyn 4=FreeBSD 5=nmap\n"
"\t                      6=linux 7=strangetcp 8=macOS\n"
```

#### Step 2: Add Case to init_packet()

**File: src/scan_progs/init_packet.c** (after line 339)

```c
case 8: /* macOS 10.15 Catalina */
    if (s->ss->minttl == 0 && s->ss->maxttl == 0) {
        scan_setttl("64");
    }
    if (s->ss->ip_off == 0) {
        s->ss->ip_off=IP_DF;
    }

    if (s->ss->mode == MODE_TCPSCAN) {
        s->ss->window_size=65535;
        s->ss->tcpoptions_len=20;

        // MSS (4 bytes): <02 04 [MSS]>
        s->ss->tcpoptions[0]=0x02;
        s->ss->tcpoptions[1]=0x04;
        mtu=htons(s->vi[0]->mtu - 40);
        memcpy(s->ss->tcpoptions + 2, &mtu, sizeof(mtu));

        // NOP (1 byte): <01>
        s->ss->tcpoptions[4]=0x01;

        // Window Scale (3 bytes): <03 03 06>
        s->ss->tcpoptions[5]=0x03;
        s->ss->tcpoptions[6]=0x03;
        s->ss->tcpoptions[7]=0x06;  // Scale factor 6

        // NOP (1 byte): <01>
        s->ss->tcpoptions[8]=0x01;

        // NOP (1 byte): <01>
        s->ss->tcpoptions[9]=0x01;

        // Timestamp (10 bytes): <08 0a [TS] [ECHO]>
        s->ss->tcpoptions[10]=0x08;
        s->ss->tcpoptions[11]=0x0a;
        memcpy(s->ss->tcpoptions + 12, &l_tstamp, sizeof(l_tstamp));
        memcpy(s->ss->tcpoptions + 16, &r_tstamp, sizeof(r_tstamp));
    }
    break;
```

#### Step 3: Add Post-Options Support (if needed)

**File: src/scan_progs/init_packet.c:45-77**

If the OS needs timestamp options in ACK packets, add to get_postoptions():

```c
case 8: /* macOS */
    if (refl_ts != 0 && my_tstamp != 0) {
        s->ss->posttcpoptions_len=12;
        s->ss->posttcpoptions[0]=0x01;
        s->ss->posttcpoptions[1]=0x01;
        s->ss->posttcpoptions[2]=0x08;
        s->ss->posttcpoptions[3]=0x0a;
        memcpy(s->ss->posttcpoptions + 4, &p_tstamp, sizeof(p_tstamp));
        memcpy(s->ss->posttcpoptions + 8, &t_tstamp, sizeof(t_tstamp));
    }
    break;
```

#### Step 4: Research Required Parameters

To create an accurate fingerprint, capture real packets from the target OS:

```bash
# On target OS, run:
tcpdump -i any -nn -vv 'tcp[tcpflags] & tcp-syn != 0' -c 10

# Or use p0f database:
cat /etc/p0f/p0f.fp | grep -A5 "macOS"
```

**Key parameters to capture:**
- TTL value
- IP flags (DF bit)
- TCP window size
- TCP options (exact order and values)
- TOS/DSCP field
- Window scale factor
- MSS calculation (typically MTU - 40 or MTU - 60)

---

### Fingerprint Quality Assessment

Current fingerprints vary in quality and accuracy:

| FP | OS | Quality | Notes |
|----|----|---------| ------|
| 0 | Cisco | Good | Based on real tcpdump, simple signature |
| 1 | OpenBSD | Excellent | From p0f database, comprehensive |
| 2 | Windows XP | Good | From p0f, but dated (WinXP is obsolete) |
| 3 | p0fsendsyn | Good | Intentionally distinctive |
| 4 | FreeBSD | Excellent | Well documented with tcpdump reference |
| 5 | nmap | Excellent | Matches nmap's actual probe |
| 6 | Linux | Excellent | From real traffic, p0f validated |
| 7 | strangetcp | Poor | Has implementation bug, incomplete |

#### Issues with Fingerprint 7

**File: src/scan_progs/init_packet.c:311**

```c
s->ss->tcpoptions_len=24; /* i cant make this as big as i want,
                             not sure where this is breaking */
```

The code attempts to build 34+ bytes of options but truncates at 24. This results in an incomplete/invalid fingerprint. The MD5 signature and timestamp options are malformed.

---

### Recommendations for Improvement

#### 1. Update Obsolete Fingerprints

- Fingerprint 2 (Windows XP) should be updated to Windows 10/11
- Consider adding fingerprints for:
  - macOS (Catalina/Big Sur/Monterey)
  - Modern Windows (10/11)
  - Android
  - iOS

#### 2. Fix Fingerprint 7

Debug why tcpoptions_len can't exceed 24 bytes. The TCP options field supports up to 40 bytes of options (60-byte header - 20-byte fixed header).

**Investigation needed in:**
- src/scan_progs/makepkt.c:114-119 (validates tcpopts_s % 4 and tcpopts_s > 60)
- Workunit structure size limits
- IPC message size limits

#### 3. Add Validation

Implement fingerprint validation to ensure:
- TCP options are properly aligned (multiple of 4 bytes)
- TCP options don't exceed 40 bytes
- TTL values are realistic (1-255)
- Window sizes are valid

#### 4. Configuration File Support

Move fingerprint definitions to configuration files instead of hardcoded:

```
# etc/unicorn.conf
fingerprint = {
    name = "Cisco IOS 12.1"
    id = 0
    ttl = 255
    ip_flags = 0
    window_size = 4128
    tcp_options = "M(MTU-40)"
}
```

#### 5. Dynamic Fingerprint Updates

Support loading fingerprints from p0f database format:

```bash
unicornscan --fingerprint-db /etc/p0f/p0f.fp --fingerprint "Linux 4.x"
```

---

## TCP/IP Stack Parameters Summary

### Parameters Modified by Fingerprints

| Parameter | Location | Values Observed |
|-----------|----------|-----------------|
| **TTL** | IP Header | 61, 64, 128, 255, random(128-255) |
| **TOS** | IP Header | 0x00 (default), 0x10 (FreeBSD) |
| **DF Bit** | IP Header flags | Set (0x4000) or Clear (0) |
| **Window Size** | TCP Header | 3072, 4128, 5744, 16384, 32767, 65535, calculated |
| **TCP Options** | TCP Header | 0-24 bytes, various combinations |
| **MSS** | TCP Option 0x02 | MTU-40, MTU-64, 265, 1024 |
| **WSCALE** | TCP Option 0x03 | 0, 1, 6, 10 |
| **Timestamps** | TCP Option 0x08 | Included or omitted |
| **SACK** | TCP Option 0x04 | Permitted or not |

### Parameters NOT Modified

These remain standard for all fingerprints:
- Source/destination IP addresses
- Source/destination ports (unless specified by -B flag)
- TCP sequence number (calculated from syn_key)
- IP identification (random)
- Checksums (calculated or optionally broken with -b flag)

---

## Security Considerations

### Ethical Use

OS fingerprint spoofing has legitimate uses:
- **Security testing**: Evading IDS/IPS that filter by OS signature
- **Penetration testing**: Testing defenses against specific OS attacks
- **Research**: Studying OS detection mechanisms

### Detection Resistance

The effectiveness of fingerprint spoofing varies:

**Effective Against:**
- Passive OS fingerprinting (p0f, NetworkMiner)
- Basic firewall rules filtering by OS signature
- Simple IDS signatures

**Less Effective Against:**
- Active OS detection (nmap -O)
- Multi-layer analysis (application layer + TCP/IP)
- Behavioral analysis
- Deep packet inspection noting inconsistencies

### Limitations

Spoofing is limited to outbound SYN packets. Full TCP connections require:
- Matching response behavior (window updates, timestamps)
- Application layer consistency
- RTT characteristics matching the spoofed OS

---

## Code Locations Reference

### Key Files

| File | Purpose | Lines of Interest |
|------|---------|-------------------|
| src/getconfig.c | Command line parsing | 136 (option def), 363-367 (handler), 488-489 (usage) |
| src/scan_progs/scanopts.h | Data structure definitions | 24-62 (scan_settings_t) |
| src/scan_progs/scanopts.c | Fingerprint setter | 87-97 (scan_setfingerprint) |
| src/scan_progs/init_packet.c | Fingerprint implementation | 36-79 (get_postoptions), 81-350 (init_packet) |
| src/scan_progs/send_packet.c | Packet transmission | 464 (fingerprint from workunit), 511 (init_packet call), 804-879 (packet building) |
| src/scan_progs/workunits.c | Workunit propagation | 410 (fingerprint assignment) |
| src/scan_progs/workunits.h | Workunit structure | 44-73 (send_workunit_t) |
| src/scan_progs/makepkt.c | Packet construction | 107-150 (TCP building) |
| src/scan_progs/packets.h | Header definitions | 55-86 (mytcphdr), 88-101 (TCP option constants) |

---

## Appendix: TCP Option Encodings Reference

### Complete TCP Options Used in Fingerprints

```
EOL (End of Option List)
+--------+
| 0x00   |
+--------+
1 byte total

NOP (No Operation)
+--------+
| 0x01   |
+--------+
1 byte total

MSS (Maximum Segment Size)
+--------+--------+--------+--------+
| 0x02   | 0x04   |   MSS value     |
+--------+--------+--------+--------+
 Kind     Length    2-byte MSS
4 bytes total

Window Scale
+--------+--------+--------+
| 0x03   | 0x03   | shift  |
+--------+--------+--------+
 Kind     Length   scale
3 bytes total

SACK Permitted
+--------+--------+
| 0x04   | 0x02   |
+--------+--------+
 Kind     Length
2 bytes total

Timestamp
+--------+--------+--------+--------+--------+--------+
| 0x08   | 0x0a   |   TS value      | Echo TS value   |
+--------+--------+--------+--------+--------+--------+
 Kind     Length    4-byte TS        4-byte echo
10 bytes total

MD5 Signature (TCP-MD5, RFC 2385)
+--------+--------+--------------------------------+
| 0x13   | 0x12   |     16-byte MD5 digest        |
+--------+--------+--------------------------------+
 Kind     Length         signature
18 bytes total
```

---

## Conclusion

Unicornscan's OS fingerprint spoofing system is a well-designed mechanism for modifying TCP/IP stack parameters to mimic different operating systems. The implementation is centralized in `init_packet.c` with clear separation between IP and TCP layer modifications.

**Strengths:**
- Clean architecture with centralized fingerprint logic
- Based on real packet captures and p0f database
- Covers major OS families (Cisco, OpenBSD, Windows, Linux, FreeBSD)
- Includes exotic fingerprints (nmap probe, p0f sendsyn)

**Weaknesses:**
- Some fingerprints are outdated (Windows XP)
- Fingerprint 7 has implementation bugs
- Hardcoded fingerprints (should be in config files)
- Limited to initial SYN packets
- No support for IPv6 fingerprints (all are IPv4)

**Recommendations:**
1. Fix fingerprint 7 implementation
2. Add modern OS fingerprints (Windows 10/11, macOS, Android)
3. Move fingerprints to external configuration
4. Add IPv6 support
5. Implement fingerprint validation
6. Document TCP option byte layouts in code comments

The system provides a solid foundation for OS spoofing and with the suggested improvements would be even more effective for security testing and research purposes.
