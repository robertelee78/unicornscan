# OS Fingerprint Packet Structures

This document provides detailed packet structure diagrams for each OS fingerprint in unicornscan.

## Understanding the Diagrams

### Legend

```
IP Header Fields:
- TTL: Time To Live
- DF: Don't Fragment bit
- TOS: Type of Service

TCP Header Fields:
- Win: Window Size
- Opts: TCP Options length

TCP Option Codes:
- M: MSS (Maximum Segment Size) - 0x02
- N: NOP (No Operation) - 0x01
- S: SACK Permitted - 0x04
- W: Window Scale - 0x03
- T: Timestamp - 0x08
- E: End of Options List - 0x00
- D: MD5 Signature - 0x13
```

---

## Fingerprint 0: Cisco IOS 12.1

### IP Header
```
+-----+----+-------+
| TTL | DF | TOS   |
+-----+----+-------+
| 255 | 0  | 0x00  |
+-----+----+-------+
```

### TCP Header
```
+-------+----------+
| Win   | Opt Len  |
+-------+----------+
| 4128  | 4 bytes  |
+-------+----------+
```

### TCP Options (4 bytes)
```
Byte:  0    1    2    3
     +----+----+----+----+
     | 02 | 04 | MSS val |
     +----+----+----+----+
      \_____/  \________/
        MSS     MTU - 40
```

### Complete SYN Packet Structure
```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|Version|  IHL  |   TOS (0x00)  |         Total Length          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|         Identification        |Flags|     Fragment Offset     |
|                               | 0   |          0              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  TTL = 255    |   Protocol=6  |         Header Checksum       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       Source IP Address                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Destination IP Address                     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|          Source Port          |       Destination Port        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Sequence Number                        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Acknowledgment Number (0)                  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  Data |       |S|           |        Window = 4128            |
| Offset| Rsrvd |Y|   Flags   |                                 |
|   6   |       |N|           |                                 |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|           Checksum            |         Urgent Pointer        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Opt=2 | Len=4 |       MSS (MTU-40)    |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

**Key Characteristics:**
- Very high TTL (network equipment)
- No DF bit (allows fragmentation)
- Minimal TCP options
- Moderate window size

---

## Fingerprint 1: OpenBSD 3.0-3.4

### IP Header
```
+-----+----+-------+
| TTL | DF | TOS   |
+-----+----+-------+
| 64  | 1  | 0x00  |
+-----+----+-------+
```

### TCP Header
```
+-------+-----------+
| Win   | Opt Len   |
+-------+-----------+
| 16384 | 24 bytes  |
+-------+-----------+
```

### TCP Options (24 bytes)
```
Byte:  0    1    2    3    4    5    6    7
     +----+----+----+----+----+----+----+----+
     | 02 | 04 | MSS val | 01 | 01 | 04 | 02 |
     +----+----+----+----+----+----+----+----+
      \_____/  \________/  \_____/  \________/
        MSS     MTU - 64    NOP NOP   SACK OK

Byte:  8    9    10   11   12   13   14   15
     +----+----+----+----+----+----+----+----+
     | 01 | 03 | 03 | 00 | 01 | 01 | 08 | 0a |
     +----+----+----+----+----+----+----+----+
      \__/ \_________/    \_____/  \________/
      NOP  WSCALE=0       NOP NOP   TS kind

Byte:  16   17   18   19   20   21   22   23
     +----+----+----+----+----+----+----+----+
     |  Timestamp Val  |  Echo Timestamp=0  |
     +----+----+----+----+----+----+----+----+
```

### Option Sequence
```
M(MTU-64), N, N, S, N, W0, N, N, T
```

**Key Characteristics:**
- Unix-like TTL (64)
- DF bit set
- Window scale of 0 (unusual - no scaling)
- Complex option ordering with padding

---

## Fingerprint 2: Windows XP

### IP Header
```
+-----+----+-------+
| TTL | DF | TOS   |
+-----+----+-------+
| 128 | 1  | 0x00  |
+-----+----+-------+
```

### TCP Header
```
+-------+-----------+
| Win   | Opt Len   |
+-------+-----------+
| 32767 | 8 bytes   |
+-------+-----------+
```

### TCP Options (8 bytes)
```
Byte:  0    1    2    3    4    5    6    7
     +----+----+----+----+----+----+----+----+
     | 02 | 04 | MSS val | 01 | 01 | 04 | 02 |
     +----+----+----+----+----+----+----+----+
      \_____/  \________/  \_____/  \________/
        MSS     MTU - 40    NOP NOP   SACK OK
```

### Option Sequence
```
M(MTU-40), N, N, S
```

**Key Characteristics:**
- Windows TTL (128)
- Large window (almost max 16-bit)
- No timestamps or window scaling
- Simple modern TCP features

---

## Fingerprint 3: p0f sendsyn

### IP Header
```
+-----+----+-------+
| TTL | DF | TOS   |
+-----+----+-------+
| 255 | 0  | 0x00  |
+-----+----+-------+
```

### TCP Header
```
+-------+-----------+
| Win   | Opt Len   |
+-------+-----------+
| 12345 | 0 bytes   |
+-------+-----------+
```

### TCP Options
```
(None - completely bare SYN)
```

**Key Characteristics:**
- Distinctive window size (12345)
- No TCP options at all
- High TTL
- Intentionally unusual signature

---

## Fingerprint 4: FreeBSD 5.1-5.2

### IP Header
```
+-----+----+-------+
| TTL | DF | TOS   |
+-----+----+-------+
| 64  | 1  | 0x10  |
+-----+----+-------+
```

### TCP Header
```
+-------+-----------+
| Win   | Opt Len   |
+-------+-----------+
| 65535 | 20 bytes  |
+-------+-----------+
```

### TCP Options (20 bytes)
```
Byte:  0    1    2    3    4    5    6    7
     +----+----+----+----+----+----+----+----+
     | 02 | 04 | MSS val | 01 | 03 | 03 | 01 |
     +----+----+----+----+----+----+----+----+
      \_____/  \________/  \__/ \_________/
        MSS     MTU - 40    NOP  WSCALE=1

Byte:  8    9    10   11   12   13   14   15
     +----+----+----+----+----+----+----+----+
     | 01 | 01 | 08 | 0a |  Timestamp Val    |
     +----+----+----+----+----+----+----+----+
      \_____/  \________/  \_________________
      NOP NOP   TS kind

Byte:  16   17   18   19
     +----+----+----+----+
            Timestamp Val |  Echo TS = 0    |
     ____________________/+----+----+----+----+
```

### Option Sequence
```
M(MTU-40), N, W1, N, N, T
```

**Key Characteristics:**
- TOS 0x10 (low delay - telnet)
- Maximum window size (65535)
- Window scale of 1 (doubles effective window)
- Timestamps enabled

---

## Fingerprint 5: NMAP OS Detection Probe

### IP Header
```
+-----+----+-------+
| TTL | DF | TOS   |
+-----+----+-------+
| 61  | 0  | 0x00  |
+-----+----+-------+
```

### TCP Header
```
+-------+-----------+
| Win   | Opt Len   |
+-------+-----------+
| 3072  | 20 bytes  |
+-------+-----------+
```

### TCP Options (20 bytes)
```
Byte:  0    1    2    3    4    5    6    7
     +----+----+----+----+----+----+----+----+
     | 03 | 03 | 0a | 01 | 02 | 04 | 01 | 09 |
     +----+----+----+----+----+----+----+----+
      \_________/    \__/ \_____/  \________/
       WSCALE=10     NOP   MSS    MSS=265

Byte:  8    9    10   11   12   13   14   15
     +----+----+----+----+----+----+----+----+
     | 08 | 0a |  Timestamp Val    |   Echo  |
     +----+----+----+----+----+----+----+----+
      \________/  \_________________

Byte:  16   17   18   19
     +----+----+----+----+
              Echo TS = 0| 00 | 00 |
     ____________________/+----+----+
                          EOL  EOL
```

### Option Sequence
```
W10, N, M265, T, E
```

**Key Characteristics:**
- Unusual TTL (61)
- Small window with large scale (3072 * 1024 = 3MB effective)
- Fixed MSS of 265 (signature value)
- Option order matches NMAP exactly

---

## Fingerprint 6: Linux 2.4/2.6

### IP Header
```
+-----+----+-------+
| TTL | DF | TOS   |
+-----+----+-------+
| 64  | 1  | 0x00  |
+-----+----+-------+
```

### TCP Header
```
+----------------+-----------+
| Win            | Opt Len   |
+----------------+-----------+
| (MTU-64) × 4   | 20 bytes  |
+----------------+-----------+
Example: MTU=1500 → Win=5744
```

### TCP Options (20 bytes)
```
Byte:  0    1    2    3    4    5    6    7
     +----+----+----+----+----+----+----+----+
     | 02 | 04 | MSS val | 04 | 02 | 08 | 0a |
     +----+----+----+----+----+----+----+----+
      \_____/  \________/  \________/  \______
        MSS     MTU - 64     SACK OK    TS kind

Byte:  8    9    10   11   12   13   14   15
     +----+----+----+----+----+----+----+----+
     |  Timestamp Val      |  Echo TS = 0    |
     +----+----+----+----+----+----+----+----+
      \_________________________________/

Byte:  16   17   18   19
     +----+----+----+----+
     | 01 | 03 | 03 | 00 |
     +----+----+----+----+
      \__/ \_________/
      NOP  WSCALE=0
```

### Option Sequence
```
M(MTU-64), S, T, N, W0
```

**Key Characteristics:**
- Window calculated from MTU (adaptive)
- MSS calculated as MTU-64 (IP+TCP headers with options)
- Linux-specific option ordering
- Window scale of 0

---

## Fingerprint 7: strangetcp (Custom/Exotic)

### IP Header
```
+-------------+----+-------+
| TTL         | DF | TOS   |
+-------------+----+-------+
| 128-255     | 1  | 0x00  |
| (random)    |    |       |
+-------------+----+-------+
```

### TCP Header
```
+----------------+-----------+
| Win            | Opt Len   |
+----------------+-----------+
| (MTU-32) × 8   | 24 bytes* |
+----------------+-----------+
Example: MTU=1500 → Win=11,744

*Should be 34+ bytes but truncated
```

### TCP Options (24 bytes - INCOMPLETE/BUGGY)
```
Byte:  0    1    2    3    4    5    6    7
     +----+----+----+----+----+----+----+----+
     | 02 | 04 | 04 | 00 | 04 | 02 | 13 | 12 |
     +----+----+----+----+----+----+----+----+
      \_____/  \________/  \________/  \_______
        MSS    MSS=1024     SACK OK    MD5 sig

Byte:  8    9    10   11   12   13   14   15
     +----+----+----+----+----+----+----+----+
     |      Random MD5 Signature Data        |
     +----+----+----+----+----+----+----+----+

Byte:  16   17   18   19   20   21   22   23
     +----+----+----+----+----+----+----+----+
     |   Random MD5   | 08 | 0a | Timestamp  |
     +----+----+----+----+----+----+----+----+
                       \_______/  (TRUNCATED)

Note: Options are incomplete - MD5 signature should be 18 bytes
      but overlaps with timestamp. Implementation is buggy.
```

### Intended Option Sequence (not fully implemented)
```
M1024, S, D(16-byte random), T, N, N
```

**Key Characteristics:**
- Random TTL (changes each run)
- Fixed MSS of 1024 (unusual)
- MD5 signature option (rare, for BGP)
- Large dynamic window
- **BUGGY**: Options truncated and malformed

---

## Comparison Matrix

### IP Layer Comparison

```
FP  | TTL        | DF Bit | TOS  | IP Options |
----|------------|--------|------|------------|
0   | 255        | No     | 0x00 | None       |
1   | 64         | Yes    | 0x00 | None       |
2   | 128        | Yes    | 0x00 | None       |
3   | 255        | No     | 0x00 | None       |
4   | 64         | Yes    | 0x10 | None       |
5   | 61         | No     | 0x00 | None       |
6   | 64         | Yes    | 0x00 | None       |
7   | Random     | Yes    | 0x00 | None       |
```

### TCP Option Comparison

```
FP  | Opts | MSS      | WSCALE | SACK | TS  | Other |
----|------|----------|--------|------|-----|-------|
0   | 4    | MTU-40   | -      | -    | -   |       |
1   | 24   | MTU-64   | 0      | Yes  | Yes |       |
2   | 8    | MTU-40   | -      | Yes  | -   |       |
3   | 0    | -        | -      | -    | -   |       |
4   | 20   | MTU-40   | 1      | -    | Yes |       |
5   | 20   | 265      | 10     | -    | Yes | EOL   |
6   | 20   | MTU-64   | 0      | Yes  | Yes |       |
7   | 24   | 1024     | -      | Yes  | Yes | MD5   |
```

### Window Size Comparison

```
FP  | Window Formula  | Example (MTU=1500) |
----|-----------------|-------------------|
0   | Fixed 4128      | 4,128             |
1   | Fixed 16384     | 16,384            |
2   | Fixed 32767     | 32,767            |
3   | Fixed 12345     | 12,345            |
4   | Fixed 65535     | 65,535            |
5   | Fixed 3072      | 3,072             |
6   | (MTU-64) × 4    | 5,744             |
7   | (MTU-32) × 8    | 11,744            |
```

## Effective Window Sizes

Accounting for window scaling:

```
FP  | Advertised | Scale | Effective    |
----|------------|-------|--------------|
0   | 4,128      | -     | 4,128        |
1   | 16,384     | 0     | 16,384       |
2   | 32,767     | -     | 32,767       |
3   | 12,345     | -     | 12,345       |
4   | 65,535     | 1     | 131,070      |
5   | 3,072      | 10    | 3,145,728    |
6   | 5,744      | 0     | 5,744        |
7   | 11,744     | -     | 11,744       |
```

## Tcpdump Output Examples

### FP 0 (Cisco)
```
IP (tos 0x0, ttl 255, id 12345, flags [none], proto TCP (6), length 44)
  10.0.0.1.54321 > 10.0.0.2.80: Flags [S], seq 123456789, win 4128,
  options [mss 1460], length 0
```

### FP 1 (OpenBSD)
```
IP (tos 0x0, ttl 64, id 12345, offset 0, flags [DF], proto TCP (6), length 64)
  10.0.0.1.54321 > 10.0.0.2.80: Flags [S], seq 123456789, win 16384,
  options [mss 1436,nop,nop,sackOK,nop,wscale 0,nop,nop,TS val 987654321 ecr 0],
  length 0
```

### FP 6 (Linux)
```
IP (tos 0x0, ttl 64, id 12345, offset 0, flags [DF], proto TCP (6), length 60)
  10.0.0.1.54321 > 10.0.0.2.80: Flags [S], seq 123456789, win 5744,
  options [mss 1436,sackOK,TS val 987654321 ecr 0,nop,wscale 0], length 0
```

## Wireshark Filters

To isolate fingerprint characteristics in packet captures:

```
# Show packets with specific TTL
ip.ttl == 64
ip.ttl == 128
ip.ttl == 255

# Show packets with DF bit
ip.flags.df == 1

# Show specific window sizes
tcp.window_size == 4128
tcp.window_size == 16384
tcp.window_size == 65535

# Show packets with specific TCP options
tcp.options.mss
tcp.options.wscale
tcp.options.sack_perm
tcp.options.timestamp
```

## Notes on Implementation

### Option Alignment

TCP options must be padded to 4-byte boundaries:
- Options ending at byte 1: Add 3 NOPs
- Options ending at byte 2: Add 2 NOPs
- Options ending at byte 3: Add 1 NOP
- Options ending at byte 0: No padding needed

### Network Byte Order

Multi-byte values are stored in network byte order (big-endian):
- MSS value: `htons(mss)`
- Timestamp: 4 bytes network byte order
- Window size: `htons(window)`

### Random Values

Some values are randomized:
- TCP sequence number (based on syn_key XOR)
- IP identification
- Timestamp values (from prng_get32())
- FP 7 TTL (random in range)

## Source Code References

All packet structure implementations:
- `/opt/unicornscan-0.4.7/src/scan_progs/init_packet.c`

Packet building functions:
- `/opt/unicornscan-0.4.7/src/scan_progs/makepkt.c`

Header definitions:
- `/opt/unicornscan-0.4.7/src/scan_progs/packets.h`
