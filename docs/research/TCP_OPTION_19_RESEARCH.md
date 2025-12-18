# TCP Option Kind 19 (0x13) - MD5 Signature Option Research

## Executive Summary

TCP Option Kind 19 is the **MD5 Signature Option** defined in RFC 2385, designed to authenticate TCP segments for protecting BGP routing sessions from spoofed TCP packets. Unicornscan's fingerprint 7 uses this option with **random data** (not valid signatures) as an evasion and fingerprinting technique.

---

## 1. What is TCP Option Kind 19?

### Official Definition
- **RFC 2385**: "Protection of BGP Sessions via the TCP MD5 Signature Option"
- **Published**: August 1998
- **Status**: Proposed Standard (obsoleted by RFC 5925 - TCP-AO)
- **Purpose**: Authenticate TCP segments to prevent spoofed packets and RST attacks

### How It Works
The MD5 Signature Option adds cryptographic authentication to TCP segments:

1. **Computation**: MD5 digest is computed over:
   - TCP pseudo-header (source/dest IP and ports)
   - TCP header (excluding options)
   - TCP segment data
   - A shared secret key known to both endpoints

2. **Verification**:
   - Both endpoints must be configured with the same secret
   - If MD5 verification fails, the segment is **silently dropped**
   - Unsigned packets (including SYN) are dropped when MD5 is enabled

3. **Security Model**:
   - Prevents third-party TCP reset attacks
   - Protects long-lived BGP sessions from spoofing
   - Requires eavesdropper to know shared secret to inject packets

---

## 2. Structure of TCP Option Kind 19

### Binary Format

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  Kind = 19    |  Length = 18  |                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+                               +
|                                                               |
+                     MD5 Digest (16 bytes)                     +
|                                                               |
+                                                               +
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

### Field Breakdown

| Field | Size | Value | Description |
|-------|------|-------|-------------|
| Kind | 1 byte | 19 (0x13) | Option identifier |
| Length | 1 byte | 18 (0x12) | Total option length |
| MD5 Digest | 16 bytes | Variable | 128-bit MD5 hash |

### Total Size
- **18 bytes** (2 header + 16 digest)
- Consumes significant portion of 40-byte TCP options space
- Typically combined with MSS, SACK_PERMITTED, and timestamps

---

## 3. Why Scanners Use MD5 Signature in SYN Packets

### Legitimate Use Cases (RARE in SYN packets)
- **BGP Router Peering**: Routers establishing BGP sessions
- **High-Security Protocols**: Custom TCP applications requiring authentication
- **Pre-Shared Key Systems**: Systems with pre-configured secrets

### Unicornscan Fingerprint 7 Usage (EVASION/FINGERPRINTING)

**Purpose:** Create unusual, hard-to-detect traffic patterns

#### Code Implementation (src/scan_progs/init_packet.c:322)
```c
/* md5 signature length 18 */
s->ss->tcpoptions[6]=0x13; s->ss->tcpoptions[7]=0x12;

/* Fill with RANDOM data (NOT valid signature) */
hash_w=prng_get32();
memcpy(s->ss->tcpoptions + 8, &hash_w, sizeof(hash_w));
hash_w=prng_get32();
memcpy(s->ss->tcpoptions + 12, &hash_w, sizeof(hash_w));
hash_w=prng_get32();
memcpy(s->ss->tcpoptions + 16, &hash_w, sizeof(hash_w));
hash_w=prng_get32();
memcpy(s->ss->tcpoptions + 20, &hash_w, sizeof(hash_w));
```

#### Fingerprint 7 Characteristics
- **Random TTL**: 128-255 (unusual for most OS)
- **Fixed MSS**: 1024 (uncommon value)
- **Large Window**: (MTU - 32) * 8
- **MD5 Option**: Contains RANDOM data, not valid signature
- **Other Options**: SACK_PERMITTED, TIMESTAMP, NOPs

#### Why This Works for Evasion

1. **Firewall Confusion**:
   - Most firewalls don't validate MD5 signatures
   - Unusual option ordering may bypass simple pattern matching
   - Large options field makes packet look legitimate

2. **IDS/IPS Evasion**:
   - Intrusion detection systems may whitelist BGP-like traffic
   - Random MD5 data prevents signature-based detection
   - Uncommon combination reduces detection probability

3. **OS Fingerprinting Resistance**:
   - No common OS uses this exact option combination
   - Makes it harder for target to identify scanner type
   - Appears as custom/hardened system rather than scan tool

4. **Network Device Bypass**:
   - Some security devices may assume MD5-signed traffic is "trusted"
   - Could bypass rate limiting or connection tracking
   - May receive different handling in QoS systems

---

## 4. Operating Systems Using TCP MD5 in SYN Fingerprints

### Common Operating Systems: **NONE**

Standard desktop/server operating systems **do not** use TCP MD5 Signature in their default SYN fingerprints:
- Windows (all versions): No
- Linux (all distributions): No
- macOS/BSD: No
- Android/iOS: No

### Specialized Systems That DO Use It

#### 1. Network Equipment (BGP Routers)
**Cisco IOS/IOS-XE:**
```
router bgp 65000
  neighbor 192.168.1.1 password MySecret
```
- Enables TCP MD5 for BGP sessions
- Used in SYN packets when establishing peering
- Common in ISP/enterprise routing infrastructure

**Juniper Junos:**
```
protocols bgp group peers {
    peer-as 65001;
    neighbor 192.168.1.1 {
        authentication-key MySecret;
    }
}
```

**Arista EOS, Nokia SR OS, Huawei VRP:**
- All major router vendors support TCP MD5 for BGP
- Enabled when BGP authentication is configured

#### 2. Linux with BGP Daemons
**FRRouting (FRR), BIRD, Quagga:**
- Linux systems running BGP routing software
- Requires kernel CONFIG_TCP_MD5SIG enabled
- Uses TCP_MD5SIG socket option

**Example Linux Kernel Config:**
```
CONFIG_TCP_MD5SIG=y
```

#### 3. OpenBSD Routing Systems
- Native TCP MD5 support via security associations
- Used by OpenBGPD for authenticated sessions

#### 4. Load Balancers & Network Appliances
- F5 BIG-IP (when configured for BGP)
- Citrix ADC/NetScaler
- HAProxy (with TCP MD5 kernel support)

### Detection in the Wild

**Characteristics of Real MD5-Signed SYN:**
- **Valid Digest**: 16 bytes computed with shared secret
- **Consistent Options**: MSS + WScale + Timestamp + MD5 + SACK
- **Standard Window**: Typically MSS multiples (14600, 29200, etc.)
- **Predictable TTL**: 64 (Linux routers) or 255 (Cisco)
- **BGP Context**: Usually to TCP port 179

**Unicornscan Fingerprint 7 Differences:**
- **Random Digest**: Pseudo-random data, not cryptographic
- **Unusual Options**: Non-standard ordering and combinations
- **Fixed MSS**: 1024 (uncommon)
- **Random TTL**: 128-255 range
- **Any Port**: Not limited to BGP port 179

---

## 5. OS Fingerprinting and Evasion Applications

### TCP MD5 for OS Fingerprinting

#### Passive Fingerprinting (p0f, SYNSCAN)
Tools examine SYN packets for OS identification:

**Normal Fingerprinting Parameters:**
- Window size
- MSS value
- TCP option ordering
- TTL value
- DF (Don't Fragment) bit
- Initial sequence number algorithm

**MD5 Option Impact:**
- **Positive ID**: Likely BGP router or Linux routing system
- **Random Data**: Indicates scanner/evasion tool
- **Signature Validation**: Real MD5 vs. random data distinguishes purpose

#### Active Fingerprinting (Nmap)
Nmap's OS detection sends probe packets and analyzes responses:

**Nmap Probes:**
- SEQ: Six TCP SYN packets to open port (ISN analysis)
- OPS: TCP options in unusual combinations
- WIN: Window size variations
- T1-T7: Various TCP flag combinations

**MD5 Option in Nmap:**
- Nmap does NOT typically use MD5 signature option
- Could be added via `--ip-options` or custom scripts
- Would appear in fingerprint database if common

#### JA4T Fingerprinting
Modern TCP fingerprinting for device identification:

**JA4T Components:**
- TCP SYN packet structure
- Option ordering and values
- Window size, MSS, TTL
- Combined with TLS fingerprint (JA4)

**Detection of Spoofing:**
```
Real Chrome on Windows:
  JA4 (TLS): Chrome signature
  JA4T (TCP): Windows signature
  Result: LEGITIMATE

Spoofed Request:
  JA4 (TLS): Chrome signature
  JA4T (TCP): Linux signature (with MD5 option)
  Result: FRAUDULENT - BLOCK
```

### Evasion Techniques Using TCP Option 19

#### 1. IDS/IPS Evasion
**Technique:** Appear as legitimate BGP traffic
```
Assumptions by Security Devices:
- BGP is trusted routing protocol
- MD5-signed traffic is authenticated
- May bypass deep packet inspection
- Could evade rate limiting
```

**Limitations:**
- Modern IDS validates MD5 signatures
- BGP traffic expected only between routers
- Port 179 restriction (BGP port)
- Unlikely to work against enterprise-grade systems

#### 2. Firewall Bypass
**Technique:** Exploit firewall rule exceptions
```
Potential Firewall Rules:
allow tcp from any to router-subnet port 179 (options MD5)
allow tcp from trusted-routers to any (established)
```

**Attack Vector:**
- Craft SYN with MD5 option to match "trusted" pattern
- Hope firewall has overly permissive BGP rules
- Exploit stateful tracking assumptions

**Reality Check:**
- Most firewalls don't parse TCP options deeply
- BGP ports are typically restricted by IP address
- Unlikely to provide significant advantage

#### 3. Scanner Obfuscation
**Technique:** Make scanner traffic unrecognizable

**Unicornscan Fingerprint 7 Strategy:**
- Random TTL (128-255)
- Uncommon MSS (1024)
- MD5 option with random data
- Large window size
- Unusual option combination

**Effectiveness:**
- **Signature-based detection**: May evade simple rules
- **Behavioral analysis**: Still detectable by connection patterns
- **Anomaly detection**: Unusual options may INCREASE suspicion
- **Human analysis**: Clearly not standard OS fingerprint

#### 4. Anti-Fingerprinting
**Technique:** Prevent target from identifying scanner OS

**Goal:** Appear as unknown/custom OS rather than common scanner

**Methods:**
- Unusual option combinations
- Non-standard values (MSS 1024, random TTL)
- Options rarely seen together
- Inconsistent with any known OS

**Limitations:**
- Scanner behavior still detectable by timing, ports scanned
- Network-level patterns reveal scanning activity
- May increase suspicion rather than reduce it

#### 5. Research and Testing
**Legitimate Uses:**
- TCP stack vulnerability testing
- Firewall rule validation
- IDS/IPS effectiveness evaluation
- Network security auditing

---

## Security Implications

### Vulnerabilities in TCP MD5

#### 1. Cryptographic Weakness
**MD5 Algorithm:**
- Collision attacks demonstrated (2004)
- Not suitable for modern cryptographic use
- RFC 5925 (TCP-AO) supersedes with stronger algorithms

**Impact:**
- Attacker could potentially forge signatures
- Man-in-the-middle attacks possible with collision
- Should not be used for new deployments

#### 2. Implementation Issues
**Blind Reset Attack:**
- Attacker sends RST with guessed sequence number
- If MD5 not enabled: connection reset
- If MD5 enabled: requires shared secret knowledge

**Password Management:**
- Shared secrets often never rotated
- No standard key rotation mechanism
- Compromise of one session exposes others

#### 3. Performance Impact
**MD5 Calculation Overhead:**
- CPU cost on every packet
- DDoS amplification: flood with fake MD5 packets
- Router CPU exhaustion possible

### Detection of Malicious Use

#### Indicators of Abuse (Random MD5 Data)

1. **MD5 Digest Patterns:**
   - Valid: Cryptographically computed, appears random but consistent
   - Fake: Pseudo-random, changes every packet, no valid crypto properties

2. **Traffic Context:**
   - Valid: BGP port 179, between known router IPs
   - Suspicious: Non-BGP ports, scanning patterns, random targets

3. **Option Combinations:**
   - Valid: Standard MSS/WScale/SACK/Timestamp/MD5
   - Suspicious: Unusual orderings, uncommon MSS values

4. **Behavioral Patterns:**
   - Valid: Persistent sessions, bidirectional traffic
   - Suspicious: SYN-only floods, port scanning, no established connections

#### Detection Rules

**Snort/Suricata Example:**
```
alert tcp any any -> any any (
  msg:"Suspicious MD5 signature option in non-BGP traffic";
  tcpopt: 19;
  flow:to_server;
  content:!"|00 B3|"; offset:2; depth:2;  # Not port 179 (BGP)
  classtype:attempted-recon;
  sid:1000001;
)
```

**Zeek/Bro Script:**
```zeek
event tcp_option(c: connection, kind: count, data: string) {
  if (kind == 19) {  # MD5 Signature
    if (c$id$resp_p != 179/tcp) {  # Not BGP
      NOTICE([$note=SuspiciousMD5Option,
              $msg=fmt("MD5 option on non-BGP port %d", c$id$resp_p),
              $conn=c]);
    }
  }
}
```

---

## Unicornscan Fingerprint 7 Analysis

### Current Implementation (src/scan_progs/init_packet.c)

```c
case 7:
    /* Unknown/BGP-like fingerprint with MD5 signature */
    s->ss->tos=0x00;
    s->ss->ttl=RANGETT(128, 255, ttl_ofs);  // Random high TTL
    s->ss->ipflags=0x02;  // DF bit
    s->ss->window_size=(s->vi[0]->mtu - 32) * 8;  // Large window
    s->ss->tcpoptions_len=24;  // NOTE: Actually writes 37 bytes!

    /* MSS option: kind=2, len=4, value=1024 */
    mtu=htons(1024);
    s->ss->tcpoptions[0]=0x02; s->ss->tcpoptions[1]=0x04;
    memcpy(s->ss->tcpoptions + 2, &mtu, sizeof(mtu));

    /* SACK_PERMITTED: kind=4, len=2 */
    s->ss->tcpoptions[4]=0x04; s->ss->tcpoptions[5]=0x02;

    /* MD5 SIGNATURE: kind=19, len=18 */
    s->ss->tcpoptions[6]=0x13; s->ss->tcpoptions[7]=0x12;

    /* Random 16-byte "signature" (NOT cryptographic) */
    hash_w=prng_get32();
    memcpy(s->ss->tcpoptions + 8, &hash_w, sizeof(hash_w));
    hash_w=prng_get32();
    memcpy(s->ss->tcpoptions + 12, &hash_w, sizeof(hash_w));
    hash_w=prng_get32();
    memcpy(s->ss->tcpoptions + 16, &hash_w, sizeof(hash_w));
    hash_w=prng_get32();
    memcpy(s->ss->tcpoptions + 20, &hash_w, sizeof(hash_w));

    /* TIMESTAMP: kind=8, len=10 */
    s->ss->tcpoptions[24]=0x08; s->ss->tcpoptions[25]=0x0a;
    memcpy(s->ss->tcpoptions + 26, &l_tstamp, sizeof(l_tstamp));
    memcpy(s->ss->tcpoptions + 30, &r_tstamp, sizeof(r_tstamp));

    /* NOPs (with code bug - overlapping writes) */
    s->ss->tcpoptions[34]=0x01; s->ss->tcpoptions[35]=0x01;
    s->ss->tcpoptions[35]=0x01; s->ss->tcpoptions[36]=0x01;
    break;
```

### Packet Structure

```
TCP Options Layout (40 bytes max):
Offset  Bytes     Option              Details
------  --------  ------------------  --------------------------
0-3     02 04     MSS                 value=1024 (0x0400)
        04 00
4-5     04 02     SACK_PERMITTED
6-7     13 12     MD5 Signature       length=18
8-23    [16 rand] MD5 digest          RANDOM data (pseudo-random)
24-25   08 0a     TIMESTAMP           length=10
26-29   [4 bytes] TSval                local timestamp
30-33   [4 bytes] TSecr                echo timestamp (0)
34-36   01 01 01  NOP                 padding (bug: overlapping)
        01

Total: 37 bytes (EXCEEDS declared tcpoptions_len=24!)
```

### Issues Identified

1. **Buffer Overrun**: Code writes 37 bytes but declares only 24
2. **Overlapping Writes**: Lines 335/336 write to tcpoptions[35] twice
3. **Invalid MD5**: Random data instead of cryptographic digest
4. **Unusual Combination**: No real OS uses this exact pattern
5. **Comment Indicates Problem**: "i cant make this as big as i want, not sure where this is breaking"

### Recommendations

**For Security Research:**
- Document this as "BGP Router Evasion Fingerprint"
- Note that MD5 digest is RANDOM, not cryptographic
- Clarify intended use case (evasion vs. impersonation)

**For Code Quality:**
- Fix buffer size: `tcpoptions_len=40`
- Fix overlapping NOP writes
- Add validation for option length calculations
- Document why MD5 uses random data vs. real signature

**For Ethical Use:**
- Include warnings about detection
- Note this fingerprint is HIGHLY suspicious
- Recommend against use in production networks
- Suggest only for authorized security testing

---

## Comparison: Real BGP vs. Unicornscan Fingerprint 7

| Parameter | Real Cisco BGP Router | Unicornscan FP7 |
|-----------|----------------------|-----------------|
| **TTL** | 255 (IETF recommendation) | 128-255 (random) |
| **Window** | 4128-8192 (MSS multiples) | (MTU-32)*8 (dynamic) |
| **MSS** | 1460 (Ethernet), 1024 (varies) | 1024 (fixed) |
| **MD5 Digest** | Valid cryptographic hash | Random pseudo-random data |
| **Dest Port** | 179 (BGP) | Any (scanning) |
| **Options Order** | MSS, MD5, SACK, TS, WS | MSS, SACK, MD5, TS, NOP |
| **Consistency** | Stable per session | Random each packet |
| **Context** | Router-to-router | Scanner-to-target |

---

## References

### RFCs
- [RFC 2385 - Protection of BGP Sessions via the TCP MD5 Signature Option](https://datatracker.ietf.org/doc/html/rfc2385)
- [RFC 5925 - The TCP Authentication Option (TCP-AO)](https://datatracker.ietf.org/doc/html/rfc5925)
- [RFC 1321 - The MD5 Message-Digest Algorithm](https://datatracker.ietf.org/doc/html/rfc1321)

### Standards Bodies
- [IANA - Transmission Control Protocol (TCP) Parameters](https://www.iana.org/assignments/tcp-parameters)
- [RFC 6994 - Shared Use of Experimental TCP Options](https://tools.ietf.org/html/rfc6994)

### Technical Articles
- [TCP MD5 - Technical Blog Analysis](https://blog.habets.se/2019/11/TCP-MD5.html)
- [Cisco - Configure MD5 Authentication Between BGP Peers](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/112188-configure-md5-bgp-00.html)
- [TCP MD5 Signature Option - Cisco Certified Expert](https://www.ccexpert.us/internet-routing/tcp-md5-signature-option.html)

### OS Fingerprinting
- [TCP/IP Stack Fingerprinting - Wikipedia](https://en.wikipedia.org/wiki/TCP/IP_stack_fingerprinting)
- [Nmap - TCP/IP Fingerprinting Methods](https://nmap.org/book/osdetect-methods.html)
- [JA4 & JA4T - Next-Gen TLS/TCP Fingerprinting](https://trueguard.io/knowledgebase/what-is-ja4-and-ja4t-fingerprints)

### Security Research
- [SYNSCAN: Towards Complete TCP/IP Fingerprinting](https://citeseerx.ist.psu.edu/document?repid=rep1&type=pdf&doi=7cf56adb702bfb1806eac68682415eb5a3a23c0f)
- [Fingerprinting Network Packets - Medium](https://medium.com/thg-tech-blog/fingerprinting-network-packets-53ee32ddf07a)

### BGP Security
- [BGP Security – MD5 Password and GTSM | Noction](https://www.noction.com/blog/bgp-security-md5-password-gtsm)
- [Rackspace - MD5 Authentication with BGP](https://www.rackspace.com/blog/md5-authentication-between-bgp-peers-on-cisco-device)

---

## Conclusion

TCP Option Kind 19 (MD5 Signature) is a legitimate security feature designed for BGP router authentication, but its use in unicornscan's fingerprint 7 serves an entirely different purpose: **evasion and obfuscation**.

**Key Takeaways:**

1. **Legitimate Use**: BGP routers and high-security TCP applications
2. **Unicornscan Use**: Evasion fingerprint with random MD5 data (not cryptographic)
3. **Detection**: Easily distinguished by context (port, traffic patterns, digest validation)
4. **Effectiveness**: Limited evasion capability; may increase suspicion
5. **Security**: Real MD5 option is cryptographically weak (use RFC 5925 TCP-AO instead)

**For Security Professionals:**
- Understand the difference between legitimate BGP MD5 and scanner obfuscation
- Implement detection rules based on context (port, IP ranges, digest validity)
- Be aware that this fingerprint is primarily a research/testing artifact

**For Researchers:**
- Document this as an example of TCP option manipulation for evasion
- Note the implementation bugs (buffer overrun, overlapping writes)
- Consider modern alternatives (TCP-AO, custom TCP stacks)

---

**Document Version:** 1.0
**Date:** 2025-12-16
**Author:** Research Agent (Claude Code)
**Project:** Unicornscan OS Fingerprint Analysis
