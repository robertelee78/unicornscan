# UDP Service Detection Research Report

**Date**: 2025-12-16
**Researcher**: Research Agent
**Objective**: Identify comprehensive UDP service detection databases and probe formats suitable for embedding in unicornscan

---

## Executive Summary

This research identifies multiple comprehensive UDP service detection databases and probe formats that could be adapted for unicornscan, similar to how p0f OS fingerprinting signatures were embedded. The most promising sources are:

1. **Nmap's nmap-payloads** - 100+ UDP service payloads with well-documented format
2. **Nmap's nmap-service-probes** - Protocol-specific probe database with match patterns
3. **UDPX probe database** - Modern Go implementation with 45+ services
4. **UDP-Hunter** - 19 specialized IPv4/IPv6 service probes

---

## 1. Nmap Service Detection Database

### 1.1 nmap-service-probes File Format

**Documentation**: [Nmap Service Probes Format](https://nmap.org/book/vscan-fileformat.html)

#### Structure

```
Probe <protocol> <probename> <probestring> [no-payload]
ports <portlist>
match <service> <pattern> [<versioninfo>]
softmatch <service> <pattern>
```

#### UDP Probe Example

```
Probe UDP DNSStatusRequest q|\0\0\x10\0\0\0\0\0\0\0\0\0|
ports 53,135
match domain m|^\0\0\x90\x04\0\0\0\0\0\0\0\0|
```

**Key Features**:
- Protocol field (TCP/UDP) for filtering
- Plain English probe names for debugging
- C-style escape sequences in probe strings
- Port specification for targeting
- Regex match patterns for service identification
- Version extraction capabilities

**Probe String Format**:
- Must start with `q` followed by delimiter character
- Supports escape characters: `\\`, `\0`, `\a`, `\b`, `\f`, `\n`, `\r`, `\t`, `\v`, `\xHH`
- Example: `q|\x00\x00\x10\x00|` sends binary data

**Match Directives**:
- `match` - Positive service identification
- `softmatch` - Possible service identification
- Supports version extraction with capture groups

### 1.2 nmap-payloads File Format

**Documentation**: [Nmap Payloads](https://nmap.org/book/nmap-payloads.html)
**Source**: [nmap-payloads file](https://svn.nmap.org/nmap-releases/nmap-7.90/nmap-payloads)

#### Structure

```
udp <ports> "<payload_data>" [source <port>]
```

#### Example Entries

**Simple Service (Echo)**:
```
udp 7 "\x0D\x0A\x0D\x0A"
```

**DNS Query**:
```
udp 53 "\x00\x00\x10\x00\x00\x00\x00\x00\x00\x00\x00\x00"
```

**NTP Request**:
```
udp 123 "\xe3\x00\x04\xfa\x00\x01\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00"
       "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
       "\x00\x00\x00\x00\x00\x00\x00\x00\xc5\x4f\x23\x4b\x71\xb1\x52\xf3"
```

**SNMP v1 Public**:
```
udp 161,10161,16100-16105,16107
    "\x30\x26\x02\x01\x01\x04\x06\x70\x75\x62\x6c\x69\x63\xa0\x19"
    "\x02\x04\x71\xb4\xb5\x68\x02\x01\x00\x02\x01\x00\x30\x0b\x30"
    "\x09\x06\x05\x2b\x06\x01\x02\x01\x05\x00"
```

**IKE/IPSEC** (ports 500, 4500):
```
udp 500,4500
    "\x97\x5e\xa3\x66\x7f\x47\x8c\x23\x00\x00\x00\x00\x00\x00\x00\x00"
    "\x01\x10\x02\x00\x00\x00\x00\x00\x00\x00\x01\x48\x00\x00\x01\x2c"
    [... extensive IKE handshake payload ...]
```

**UPnP/SSDP Discovery** (port 1900):
```
udp 1900 "M-SEARCH * HTTP/1.1\r\nHost: 239.255.255.250:1900\r\n"
         "ST:upnp:rootdevice\r\nMan:\"ssdp:discover\"\r\nMX:3\r\n\r\n"
```

**Gaming Servers** (Quake 3):
```
udp 27960-27964 "\xff\xff\xff\xffgetstatus"
```

**Key Services Covered** (100+ total):
- Port 7: Echo
- Port 53: DNS
- Port 80: QUIC
- Port 111: RPC/Portmap
- Port 123: NTP
- Port 137: NetBIOS
- Port 161: SNMP
- Port 500/4500: IKE/IPSEC
- Port 520: RIP
- Port 623: IPMI
- Port 1194: OpenVPN
- Port 1900: SSDP/UPnP
- Ports 26000-30724: Various game servers

**Design Philosophy**:
- Evoke responses from services
- Avoid triggering IDS alerts
- Safe payloads that won't crash services
- Protocol-specific handshakes

---

## 2. IKE-Scan Database

**Documentation**: [IKE-Scan User Guide](https://www.royhills.co.uk/wiki/index.php/Ike-scan_User_Guide)
**Source**: [GitHub royhills/ike-scan](https://github.com/royhills/ike-scan)

### Database Files

1. **ike-backoff-patterns** - UDP backoff timing patterns for OS fingerprinting
2. **ike-vendor-ids** - Vendor identification payload database

### Detection Method

**UDP Backoff Fingerprinting**:
- Records IKE response packet timings
- Compares retransmission backoff patterns against known signatures
- Database stored in plain text for easy extension

**Vendor ID Fingerprinting**:
- Matches Vendor ID payloads from VPN servers
- Database of known vendor patterns
- Can add custom Vendor IDs to outgoing packets

### Key Capabilities

- Discovers IKE hosts on UDP 500/4500
- Identifies VPN implementation (Cisco, Check Point, etc.)
- Determines software versions
- Works when ICMP/TCP scanning fails

**Advantage**: Simple text-based database format makes adding new patterns straightforward.

---

## 3. Modern Open-Source Projects

### 3.1 UDPX (nullt3r/udpx)

**GitHub**: [nullt3r/udpx](https://github.com/nullt3r/udpx)

**Features**:
- Written in Go
- Single-packet UDP scanner
- 45+ service support
- Portable (Linux/macOS/Windows)
- Custom service addition capability

**Database Structure** (`pkg/probes/probes.go`):

```go
{
    Name: "service_name",
    Payloads: []string{"hex_encoded_data"},
    Port: []int{port1, port2},
}
```

**Example Probe**:
```go
{
    Name: "ike",
    Payloads: []string{
        "5b5e64c03e99b51100000000000000000110020000000000000001500000013400000001000000010000012801010008030000240101"
    },
    Port: []int{500, 4500},
}
```

**Supported Services** (45+):
ARD, BACnet, Chargen, Citrix, CoAP, DB2, DNS, Echo, ike, ipmi, Kerberos, LDAP, mDNS, Memcache, ms-sql, ms-sql-slam, NetBIOS, NTP, OpenVPN, Portmap, RDP, RIP, RPC, SIP, SNMP (v1/v2c/v3), SSDP, TFTP, Ubiquiti Discovery, UPnP, WSD, XDMCP

**Advantages**:
- Modern codebase
- Easy to extend
- Well-documented payload format
- No root privileges required

### 3.2 UDP-Hunter (NotSoSecure/udp-hunter)

**GitHub**: [NotSoSecure/udp-hunter](https://github.com/NotSoSecure/udp-hunter)

**Features**:
- Python-based
- IPv4 and IPv6 support
- 19 specialized service probes
- Network assessment focus

**Supported Probes**:
1. IKE
2. RPC
3. NTP
4. SNMP-public
5. MS-SQL
6. MS-SQL-SLAM
7. NetOp
8. TFTP
9. DB2
10. Citrix
11. Echo
12. Chargen
13. Systat
14. Daytime
15. Time
16. RPCCheck
17. DNSStatusRequest
18. DNSVersionBindReq
19. NBTStat

**Advantages**:
- IPv6 support
- Focus on widely-deployed protocols
- Audit-oriented design

### 3.3 UDPz (FalconOpsLLC/udpz)

**GitHub**: [FalconOps-Cybersecurity/udpz](https://github.com/FalconOps-Cybersecurity/udpz)

**Features**:
- Go-based
- Fast and efficient
- No root/privileged access required
- Cross-platform

**Advantages**:
- Faster than nmap UDP scanning
- Simplified deployment
- Suitable for large-scale scanning

### 3.4 ZMap UDP Probe Module

**Documentation**: [ZMap UDP Probe Module](https://github.com/zmap/zmap/wiki/UDP-Probe-Module)

**Payload Methods**:
1. `text` - ASCII-printable payloads
2. `hex` - Hexadecimal command-line payloads
3. `file` - External file payloads
4. `template` - Dynamic field generation

**Example**:
```bash
zmap -M udp -p 53 --probe-args=hex:00001000000000000000000000000000
```

**Advantages**:
- Multiple payload specification methods
- Template system for dynamic payloads
- Internet-scale scanning capability

---

## 4. Most Commonly Scanned UDP Ports

**Source**: [Nmap Port Selection Data](https://nmap.org/book/performance-port-selection.html)

### Statistical Analysis

**Coverage Statistics**:
- Top 1,000 UDP ports: 49% of open ports
- Top 1,075 UDP ports: 50% of open ports
- Top 11,307 UDP ports: 90% of open ports

**Comparison with TCP**:
- TCP: Top 1,000 ports = 93% coverage
- UDP: Top 1,000 ports = 49% coverage
- UDP requires broader scanning for comprehensive coverage

### Critical UDP Services (High Priority)

**Well-Known Ports** (0-1023):
- 53 - DNS
- 67/68 - DHCP
- 69 - TFTP
- 88 - Kerberos
- 123 - NTP
- 137/138/139 - NetBIOS
- 161/162 - SNMP
- 500 - ISAKMP/IKE
- 514 - Syslog
- 520 - RIP

**Registered Ports** (1024-49151):
- 1194 - OpenVPN
- 1434 - MS-SQL
- 1701 - L2TP
- 1812/1813 - RADIUS
- 1900 - SSDP/UPnP
- 4500 - IPsec NAT-T
- 5060/5061 - SIP
- 5353 - mDNS

**Security/Malware** (Various):
- 31337 - BackOrifice
- 27960-27964 - Quake 3 (often abused)

### Modern Network Considerations (2025-2026)

**Emerging Protocols**:
- QUIC (UDP 443, 80) - HTTP/3 transport
- WireGuard (UDP 51820) - Modern VPN
- DTLS (UDP 443, 853) - Secure transport
- WebRTC/STUN/TURN - Real-time communications

**Cloud/Enterprise**:
- 623 - IPMI (datacenter management)
- 6081 - VXLAN (network virtualization)
- Various cloud provider control planes

---

## 5. Recommendations for Unicornscan

### Primary Recommendation: Embed Nmap Payloads

**Rationale**:
1. **Comprehensive** - 100+ well-tested UDP service payloads
2. **Mature** - 20+ years of development and refinement
3. **Format** - Simple text format easy to parse and embed
4. **License** - Nmap Open Source License compatible
5. **Precedent** - Similar to p0f signature embedding

**Implementation Approach**:

```c
// Similar to p0f embedding strategy
struct udp_payload {
    uint16_t *ports;      // Array of applicable ports
    size_t port_count;    // Number of ports
    uint8_t *data;        // Binary payload data
    size_t data_len;      // Payload length
    char *description;    // Service description
};

// Embedded payload database
static const struct udp_payload udp_payloads[] = {
    // DNS
    {
        .ports = (uint16_t[]){53},
        .port_count = 1,
        .data = (uint8_t[])"\x00\x00\x10\x00\x00\x00\x00\x00\x00\x00\x00\x00",
        .data_len = 12,
        .description = "DNS Status Request"
    },
    // NTP
    {
        .ports = (uint16_t[]){123},
        .port_count = 1,
        .data = (uint8_t[])"\xe3\x00\x04\xfa...",
        .data_len = 48,
        .description = "NTP Request"
    },
    // ... more payloads
};
```

### Secondary Recommendation: Add UDPX Probes

**For modern services not in nmap-payloads**:
- Extract Go probe definitions from UDPX
- Convert to C structures
- Focus on cloud/modern protocols

### Tertiary Recommendation: IKE-Scan Backoff Patterns

**For advanced VPN detection**:
- Add UDP backoff timing analysis
- Embed ike-backoff-patterns database
- Enable VPN infrastructure discovery

---

## 6. Implementation Strategy

### Phase 1: Core Payload Database

1. **Extract nmap-payloads** - Parse and convert to C structures
2. **Embed in unicornscan** - Similar to p0f fingerprints
3. **Port-based selection** - Match payloads to target ports
4. **Basic response handling** - Detect open vs filtered

### Phase 2: Service Identification

1. **Add nmap-service-probes patterns** - Regex matching for services
2. **Response parsing** - Extract service banners
3. **Version detection** - Parse version information
4. **Reporting** - Enhanced output with service details

### Phase 3: Advanced Features

1. **UDPX modern services** - Add cloud/modern protocol support
2. **IKE backoff fingerprinting** - VPN OS detection
3. **Custom payload framework** - User-extensible probes
4. **Performance optimization** - Efficient payload delivery

---

## 7. Technical Considerations

### File Format Conversion

**nmap-payloads parsing**:
```python
# Pseudo-code parser
def parse_nmap_payloads(file):
    for line in file:
        if line.startswith('udp'):
            parts = parse_udp_line(line)
            ports = extract_ports(parts[1])
            payload = decode_escapes(parts[2])
            yield UDPPayload(ports, payload)
```

**C structure generation**:
```c
// Auto-generated from nmap-payloads
#define UDP_PAYLOAD_COUNT 127

static const struct udp_payload_entry {
    uint16_t ports[16];  // Max ports per payload
    uint8_t port_count;
    uint8_t payload[512]; // Max payload size
    uint16_t payload_len;
    const char *name;
} udp_payload_db[UDP_PAYLOAD_COUNT] = {
    // Generated entries
};
```

### Integration Points

**Existing unicornscan code**:
- `src/scan_progs/send_packet.c` - Payload delivery
- `src/scan_progs/makepkt.c:74` - `makepkt_build_udp()`
- Payload selection in `cmp_payload()` function

**New files needed**:
- `src/payloads/udp_payloads.h` - Payload database header
- `src/payloads/udp_payloads.c` - Embedded payload data
- `src/payloads/udp_match.c` - Response matching logic

### Performance Impact

**Payload database size**:
- ~127 payloads from nmap
- Average 100 bytes per payload
- Total: ~13KB embedded data
- Negligible memory/binary impact

**Scanning performance**:
- Protocol-specific payloads increase response rate
- Better open vs filtered discrimination
- Reduced false positives

---

## 8. License Compatibility

### Nmap Licensing

**Nmap Open Source License**:
- Based on GPL v2
- nmap-payloads file: "© 1996-2010 by Insecure.Com LLC"
- Distributed under Nmap Open Source license
- **Compatible with GPL v2** (unicornscan's license)

**Attribution Requirements**:
- Preserve copyright notices
- Document nmap as payload source
- Maintain license file

### Other Sources

**UDPX**: MIT License - Compatible, can extract and adapt
**IKE-Scan**: GPL v3 - Compatible with GPL v2 (one-way)
**UDP-Hunter**: Apache 2.0 - Compatible

---

## 9. Additional Resources

### Documentation Links

**Nmap**:
- [Service Detection](https://nmap.org/book/man-version-detection.html)
- [UDP Scanning](https://nmap.org/book/scan-methods-udp-scan.html)
- [nmap-service-probes format](https://nmap.org/book/vscan-fileformat.html)
- [nmap-payloads](https://nmap.org/book/nmap-payloads.html)

**Tools**:
- [UDPX GitHub](https://github.com/nullt3r/udpx)
- [UDP-Hunter GitHub](https://github.com/NotSoSecure/udp-hunter)
- [IKE-Scan](https://github.com/royhills/ike-scan)
- [ZMap UDP Module](https://github.com/zmap/zmap/wiki/UDP-Probe-Module)

**Research**:
- [Nmap Port Selection Statistics](https://nmap.org/book/performance-port-selection.html)
- [UDP Backoff Fingerprinting](https://github.com/royhills/ike-scan/blob/master/udp-backoff-fingerprinting-paper.txt)
- [FingerprintX - Modern Fingerprinting](https://www.praetorian.com/blog/fingerprintx/)

---

## 10. Next Steps

1. **Extract nmap-payloads** - Download and parse current version
2. **Create conversion script** - Python/Perl to generate C structures
3. **Design payload API** - Functions for payload selection and delivery
4. **Prototype integration** - Test with sample payloads
5. **Comprehensive testing** - Verify against known services
6. **Documentation** - Update unicornscan docs with new capabilities

---

## Appendix A: Sample nmap-payloads Entries

### DNS (Port 53)
```
udp 53 "\x00\x00\x10\x00\x00\x00\x00\x00\x00\x00\x00\x00"
```

### SNMP v1 Public (Port 161)
```
udp 161,10161,16100-16105,16107
    "\x30\x26\x02\x01\x01\x04\x06\x70\x75\x62\x6c\x69\x63\xa0\x19"
    "\x02\x04\x71\xb4\xb5\x68\x02\x01\x00\x02\x01\x00\x30\x0b\x30"
    "\x09\x06\x05\x2b\x06\x01\x02\x01\x05\x00"
```

### NTP (Port 123)
```
udp 123 "\xe3\x00\x04\xfa\x00\x01\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00"
       "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
       "\x00\x00\x00\x00\x00\x00\x00\x00\xc5\x4f\x23\x4b\x71\xb1\x52\xf3"
```

### SSDP/UPnP (Port 1900)
```
udp 1900 "M-SEARCH * HTTP/1.1\r\nHost: 239.255.255.250:1900\r\n"
         "ST:upnp:rootdevice\r\nMan:\"ssdp:discover\"\r\nMX:3\r\n\r\n"
```

---

## Appendix B: UDPX Service List

Complete list of 45+ services supported by UDPX:

1. ARD (Apple Remote Desktop)
2. BACnet
3. Chargen
4. Citrix
5. CoAP
6. DB2
7. DNS
8. Echo
9. ike (IKE/IPSEC)
10. ipmi (IPMI)
11. Kerberos
12. LDAP
13. mDNS
14. Memcache
15. ms-sql
16. ms-sql-slam
17. NetBIOS
18. NTP
19. OpenVPN
20. Portmap/RPC
21. RDP
22. RIP
23. RPC
24. SIP
25. snmp1 (SNMP v1)
26. snmp2 (SNMP v2c)
27. snmp3 (SNMP v3)
28. SSDP
29. TFTP
30. Ubiquiti Discovery
31. UPnP
32. WSD (Web Services Discovery)
33. XDMCP

Plus game servers, VoIP protocols, and cloud services.

---

## Conclusion

The most practical approach for enhancing unicornscan's UDP service detection is to embed the **nmap-payloads database** (100+ payloads) as the primary source, supplemented by **UDPX probes** for modern services, using a similar embedding strategy as the p0f OS fingerprinting integration. This provides comprehensive coverage with minimal implementation complexity.

The simple text format of nmap-payloads makes it straightforward to parse and convert into C structures, while the GPL v2 compatibility ensures license compliance. This approach will significantly improve unicornscan's UDP scanning capabilities and service identification accuracy.
