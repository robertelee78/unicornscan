# OS Fingerprint Quick Reference

## Command Line Usage

```bash
unicornscan -W <number> [other options] target
```

## Available Fingerprints

| -W Value | OS Profile | TTL | DF Bit | Window | TCP Options | Use Case |
|----------|-----------|-----|--------|--------|-------------|----------|
| **0** | Cisco IOS 12.1 | 255 | No | 4128 | MSS only | Network equipment |
| **1** | OpenBSD 3.0-3.4 | 64 | Yes | 16384 | MSS,NOP,NOP,SACK,NOP,WSCALE0,NOP,NOP,TS | Unix server |
| **2** | Windows XP | 128 | Yes | 32767 | MSS,NOP,NOP,SACK | Windows client |
| **3** | p0f sendsyn | 255 | No | 12345 | None | Distinctive probe |
| **4** | FreeBSD 5.1 | 64 | Yes | 65535 | MSS,NOP,WSCALE1,NOP,NOP,TS | BSD server |
| **5** | NMAP probe | 61 | No | 3072 | WSCALE10,NOP,MSS265,TS,EOL | Port scanner |
| **6** | Linux 2.4/2.6 | 64 | Yes | ~5744* | MSS,SACK,TS,NOP,WSCALE0 | Linux server |
| **7** | strangetcp | 128-255** | Yes | ~variable* | MSS,SACK,MD5,TS,NOP (buggy) | Evasion |

\* Calculated dynamically based on MTU
\*\* Random value in range

## Quick Examples

```bash
# Scan as Cisco router
unicornscan -W 0 -mT -p 80,443 192.168.1.0/24

# Scan as Linux box
unicornscan -W 6 -mT -p 1-1024 target.example.com

# Scan as Windows XP
unicornscan -W 2 -mT -p 80 10.0.0.1

# Scan with NMAP probe signature
unicornscan -W 5 -mT -p 22-25 scanme.nmap.org

# Scan as OpenBSD
unicornscan -W 1 -mT -p 80,443,8080 target.local
```

## Parameter Comparison

### IP Layer

| FP | TTL | DF Bit | TOS |
|----|-----|--------|-----|
| 0  | 255 | No     | 0x00 |
| 1  | 64  | Yes    | 0x00 |
| 2  | 128 | Yes    | 0x00 |
| 3  | 255 | No     | 0x00 |
| 4  | 64  | Yes    | 0x10 |
| 5  | 61  | No     | 0x00 |
| 6  | 64  | Yes    | 0x00 |
| 7  | Rand| Yes    | 0x00 |

### TCP Layer

| FP | Window | MSS Formula | WSCALE | SACK | TS | Special |
|----|--------|-------------|--------|------|----|----- ---|
| 0  | 4128   | MTU-40      | No     | No   | No | Simple |
| 1  | 16384  | MTU-64      | 0      | Yes  | Yes| Full featured |
| 2  | 32767  | MTU-40      | No     | Yes  | No | Windows default |
| 3  | 12345  | None        | No     | No   | No | Signature value |
| 4  | 65535  | MTU-40      | 1      | No   | Yes| Max window |
| 5  | 3072   | 265 fixed   | 10     | No   | Yes| Unusual MSS |
| 6  | MTU×4  | MTU-64      | 0      | Yes  | Yes| Dynamic window |
| 7  | MTU×8  | 1024 fixed  | No     | Yes  | Yes| MD5 sig (broken)|

## Detection Characteristics

### Highly Distinctive Signatures

- **FP 3 (p0f)**: Window size 12345 is a signature value
- **FP 5 (NMAP)**: MSS of 265 and unusual option order
- **FP 7 (strangetcp)**: Includes MD5 signature option

### Realistic Profiles

- **FP 0 (Cisco)**: Common for network equipment
- **FP 1 (OpenBSD)**: Matches real OpenBSD 3.x systems
- **FP 4 (FreeBSD)**: Accurate for FreeBSD 5.x
- **FP 6 (Linux)**: Good match for Linux 2.4/2.6

### Dated/Obsolete

- **FP 2 (Windows XP)**: Operating system EOL since 2014
- Consider this more as "generic Windows" profile

## Code Locations

| Component | File | Function/Line |
|-----------|------|---------------|
| CLI Parsing | src/getconfig.c | Line 363-367 |
| Storage | src/scan_progs/scanopts.c | scan_setfingerprint() |
| Implementation | src/scan_progs/init_packet.c | init_packet() L81-350 |
| Application | src/scan_progs/send_packet.c | L804-879 |

## TCP Options Decoder

### Reading TCP Options in the Code

Format: `s->ss->tcpoptions[offset] = value`

```c
// MSS (Maximum Segment Size)
tcpoptions[0] = 0x02;     // Kind
tcpoptions[1] = 0x04;     // Length (4 bytes total)
tcpoptions[2-3] = MSS;    // Value (network byte order)

// NOP (No Operation - padding)
tcpoptions[n] = 0x01;     // Kind only

// Window Scale
tcpoptions[n] = 0x03;     // Kind
tcpoptions[n+1] = 0x03;   // Length (3 bytes total)
tcpoptions[n+2] = shift;  // Scale factor (0-14)

// SACK Permitted
tcpoptions[n] = 0x04;     // Kind
tcpoptions[n+1] = 0x02;   // Length (2 bytes total)

// Timestamp
tcpoptions[n] = 0x08;     // Kind
tcpoptions[n+1] = 0x0a;   // Length (10 bytes total)
tcpoptions[n+2 to n+5] = TSval;    // Timestamp value
tcpoptions[n+6 to n+9] = TSecr;    // Echo reply (0 for SYN)

// EOL (End of Options List)
tcpoptions[n] = 0x00;     // Kind only
```

## Troubleshooting

### Unknown Fingerprint

If you specify a fingerprint > 7:
```
unknown fingerprint `8', defaulting to 0
```
System will fall back to Cisco (FP 0).

### Option Too Long

If tcpoptions_len > 40 (60-byte max TCP header - 20-byte fixed header):
```
bad tcp optlen
```
System will panic/terminate.

### Broken Fingerprint 7

FP 7 has known bugs - tcpoptions_len capped at 24 bytes but attempts to write more. Use with caution.

## p0f Detection Results

What p0f passive OS fingerprinting sees for each profile:

| FP | p0f Output |
|----|-----------|
| 0  | "Cisco IOS" or unidentified (simple signature) |
| 1  | "OpenBSD 3.0-3.4" (exact match) |
| 2  | "Windows XP" or "Windows 2000" (close match) |
| 3  | May appear as unknown/unusual |
| 4  | "FreeBSD 4.7-5.1" or "MacOS X 10.2-10.3" |
| 5  | "NMAP OS detection probe" (exact match) |
| 6  | "Linux 2.4/2.6" (exact match) |
| 7  | Unknown/invalid (broken options) |

## Best Practices

### For Evading Detection

1. Use FP 1, 4, or 6 (realistic, common profiles)
2. Avoid FP 3, 5 (distinctive signatures)
3. Match network environment (Linux for servers, Windows for desktops)
4. Combine with other evasion (-f fragmentation, -t TTL variation)

### For Testing

1. Use FP 5 to test NMAP detection
2. Use FP 3 to verify OS fingerprinting is active
3. Use FP 7 for malformed packet testing (broken options)

### For Realistic Scanning

1. Match your actual OS if possible
2. Use FP 6 for general Linux server scanning
3. Use FP 0 for infrastructure scanning (looks like router)

## Combining with Other Options

```bash
# Evade firewall as Linux box
unicornscan -W 6 -mT -s r -t 64 -r 100 target:1-1024

# Scan as Cisco with random source
unicornscan -W 0 -s 10.0.0.0/24 -t 255 -mT target:80

# Slow scan as Windows XP
unicornscan -W 2 -mT -r 10 -R 3 target:1-100

# Fragment packets as BSD
unicornscan -W 4 -F -mT target:80,443

# Multiple fingerprints in sequence
for fp in 0 1 2 4 6; do
  unicornscan -W $fp -mT -p 80 target
done
```

## Integration with Scan Modules

The fingerprint affects:
- Initial SYN packet characteristics
- OS detection evasion
- IDS/IPS signature matching

The fingerprint does NOT affect:
- Port scanning logic
- Response interpretation
- Payload content (UDP scans)
- ARP scanning

## Further Reading

- Full analysis: `docs/OS_FINGERPRINT_SPOOFING_ANALYSIS.md`
- p0f database: `/etc/p0f/p0f.fp` (if installed)
- RFC 793 - TCP specification
- RFC 1323 - TCP Extensions (timestamps, window scaling)
- RFC 2385 - TCP MD5 Signature Option

## Quick Decision Tree

```
Need to scan as...
├─ Network device → FP 0 (Cisco)
├─ Linux server → FP 6 (Linux)
├─ BSD server → FP 1 (OpenBSD) or FP 4 (FreeBSD)
├─ Windows desktop → FP 2 (Windows XP)
├─ Test detection → FP 5 (NMAP) or FP 3 (p0f)
└─ Unusual/evasive → FP 7 (strangetcp) - WARNING: buggy
```
