# Payload Protocol Specifications Reference

This document provides exact binary payloads for service identification, extracted from RFCs, and official protocol documentation.

## Table of Contents

1. [SCADA/ICS Protocols](#scadaics-protocols)
   - [S7comm (Siemens S7)](#s7comm-siemens-s7)
   - [Modbus TCP](#modbus-tcp)
   - [DNP3](#dnp3)
   - [BACnet/IP](#bacnetip)
   - [EtherNet/IP](#ethernetip)
   - [Niagara Fox](#niagara-fox)
2. [NoSQL Databases](#nosql-databases)
   - [MongoDB](#mongodb)
   - [Redis](#redis)
   - [Cassandra CQL](#cassandra-cql)
3. [Message Queue Protocols](#message-queue-protocols)
   - [AMQP](#amqp)
   - [MQTT](#mqtt)
   - [Apache Kafka](#apache-kafka)
   - [NATS](#nats)
4. [Modern Transport Protocols](#modern-transport-protocols)
   - [TLS 1.3](#tls-13)
   - [QUIC](#quic)
   - [gRPC/HTTP/2](#grpchttp2)
5. [Directory Services](#directory-services)
   - [LDAP](#ldap)
6. [IoT Protocols](#iot-protocols)
   - [CoAP](#coap)
7. [Remote Desktop](#remote-desktop)
   - [RDP/Terminal Server](#rdpterminal-server)
8. [SMB/CIFS](#smbcifs)

---

## SCADA/ICS Protocols

### S7comm (Siemens S7)

**Port:** 102/tcp (ISO-TSAP)

**Source:** PLCScan

S7comm runs over ISO-COTP. Connection requires a 3-phase handshake.

#### Phase 1: COTP Connection Request

**Standard COTP (dst TSAP 0x0102):**
```
Hex: 03 00 00 16 11 e0 00 00 00 14 00 c1 02 01 00 c2 02 01 02 c0 01 0a

Breakdown:
  03 00           TPKT version 3, reserved
  00 16           Length (22 bytes)
  11              COTP length indicator
  e0              COTP PDU type: CR (Connection Request)
  00 00           DST reference
  00 14           SRC reference
  00              Class 0
  c1 02 01 00     Parameter: src-tsap = 0x0100
  c2 02 01 02     Parameter: dst-tsap = 0x0102 (PLC)
  c0 01 0a        Parameter: TPDU size = 1024
```

**Alternate COTP (dst TSAP 0x0200, for some HMIs):**
```
Hex: 03 00 00 16 11 e0 00 00 00 05 00 c1 02 01 00 c2 02 02 00 c0 01 0a
```

**Expected Response:** COTP CC (Connection Confirm) with PDU type 0xd0 at byte offset 5 (0-indexed).

#### Phase 2: S7comm Setup Communication

```
Hex: 03 00 00 19 02 f0 80 32 01 00 00 00 00 00 08 00 00 f0 00 00 01 00 01 01 e0

Breakdown:
  03 00 00 19     TPKT header (25 bytes)
  02 f0 80        COTP data header
  32              S7comm protocol ID
  01              Message type: Job Request
  00 00           Reserved
  00 00           PDU reference
  00 08           Parameter length (8 bytes)
  00 00           Data length (0 bytes)
  f0              Function: Setup communication
  00              Reserved
  00 01           Max AmQ calling
  00 01           Max AmQ called
  01 e0           PDU length (480)
```

**Expected Response:** Protocol ID 0x32 at byte offset 7.

#### Phase 3: SZL Read Request (Device Info)

**Read SZL 0x0011 Index 0x0001 (Module identification):**
```
Hex: 03 00 00 21 02 f0 80 32 07 00 00 00 00 00 08 00 08 00 01 12 04 11 44 01 00 ff 09 00 04 00 11 00 01

Breakdown:
  03 00 00 21     TPKT header (33 bytes)
  02 f0 80        COTP data header
  32              S7comm protocol ID
  07              Message type: Userdata
  00 00 00 00     Reserved + PDU reference
  00 08           Parameter length
  00 08           Data length
  00 01 12 04 11 44 01 00  Userdata header
  ff 09 00 04     Return code + transport size
  00 11           SZL-ID: 0x0011 (Module identification)
  00 01           Index: 0x0001
```

**Read SZL 0x001c Index 0x0001 (Component identification):**
```
Hex: 03 00 00 21 02 f0 80 32 07 00 00 00 00 00 08 00 08 00 01 12 04 11 44 01 00 ff 09 00 04 00 1c 00 01
```

**Response Parsing:**
- Byte 8: Protocol ID (must be 0x32)
- Byte 31: SZL-ID second byte
- Offset 44: Module name (null-terminated)
- Offset 72: Basic hardware (null-terminated)
- Offset 123-125: Version (3 bytes: major.minor.patch)

---

### Modbus TCP

**Port:** 502/tcp

**Source:** Modbus Application Protocol V1.1b

#### Frame Format
```
Modbus TCP/IP ADU:
  Bytes 0-1:   Transaction ID (2 bytes)
  Bytes 2-3:   Protocol ID (0x0000 for Modbus)
  Bytes 4-5:   Length (following bytes count)
  Byte 6:      Unit ID (slave address, 1-247)
  Byte 7:      Function code
  Bytes 8+:    Data (function-specific)
```

#### Report Slave ID (Function 0x11)
```
Hex: 00 00 00 00 00 02 01 11

Breakdown:
  00 00       Transaction ID
  00 00       Protocol ID (Modbus)
  00 02       Length (2 bytes follow)
  01          Unit ID (slave 1)
  11          Function code: Report Slave ID (17)
```

#### Read Device Identification (Function 0x2B, MEI 0x0E)
```
Hex: 00 00 00 00 00 05 01 2b 0e 01 00

Breakdown:
  00 00       Transaction ID
  00 00       Protocol ID
  00 05       Length (5 bytes)
  01          Unit ID
  2b          Function code: Encapsulated Interface Transport (43)
  0e          MEI type: Read Device Identification (14)
  01          Read device ID code: Basic (01=basic, 02=regular, 03=extended, 04=specific)
  00          Object ID to start from
```

**Expected Response:**
- Successful: Function code 0x2B in response
- Error: Function code 0x2B + 0x80 (0xAB) with exception code

**Exception Codes:**
| Code | Description |
|------|-------------|
| 0x01 | Illegal Function |
| 0x02 | Illegal Data Address |
| 0x03 | Illegal Data Value |
| 0x04 | Slave Device Failure |
| 0x05 | Acknowledge |
| 0x06 | Slave Device Busy |
| 0x08 | Memory Parity Error |
| 0x0A | Gateway Path Unavailable |
| 0x0B | Gateway Target Device Failed to Respond |

---

### DNP3

**Port:** 20000/tcp (or 20000/udp)

**Source:** IEEE 1815-2012, DNP3 Specification

#### Data Link Layer Frame Format (FT3)
```
Frame Structure:
  Bytes 0-1:   Start bytes (0x05 0x64)
  Byte 2:      Length (5-255, user data bytes + 5)
  Byte 3:      Control
  Bytes 4-5:   Destination address (little-endian)
  Bytes 6-7:   Source address (little-endian)
  Bytes 8-9:   CRC-16 of header

Data Blocks:
  Each 16-byte block followed by 2-byte CRC-16
  Final block may be shorter
```

#### Read Class 0 Data Request
```
Hex: 05 64 05 c0 01 00 00 00 [CRC] [Transport + App Layer]

Breakdown:
  05 64       Start bytes (FT3 frame sync)
  05          Length
  c0          Control: DIR=1, PRM=1, FCB=0, FCV=0, FC=0 (Reset Link)
  01 00       Destination: 1 (outstation)
  00 00       Source: 0 (master)
```

**Transport Layer Header:**
```
Byte 0: FIN=1, FIR=1, Sequence (0-63)
  Bit 7: FIN (final fragment)
  Bit 6: FIR (first fragment)
  Bits 0-5: Sequence number
```

**Application Layer (Class 0 Read):**
```
Hex: c0 01 3c 01 06

Breakdown:
  c0          Application Control: FIR=1, FIN=1, CON=0, UNS=0, SEQ=0
  01          Function code: Read
  3c 01 06    Object header: Group 60, Var 1, Qualifier 06 (all)
```

**CRC-16 Polynomial:** 0x3D65 (DNP CRC)

---

### BACnet/IP

**Port:** 47808/udp (0xBAC0)

**Source:** ASHRAE 135

#### Read Property Request (Device Object Identifier)
```
Hex: 81 0a 00 11 01 04 00 05 01 0c 0c 02 00 00 00 19 4b

Breakdown:
  81          BVLC Type: BACnet/IP
  0a          BVLC Function: Original-Unicast-NPDU
  00 11       BVLC Length (17 bytes)
  01          NPDU Version
  04          NPDU Control: expecting reply
  00 05       Network number (optional)
  01          DLEN
  0c          Destination address
  0c          APDU Type: Confirmed-REQ, PDU flags
  02 00 00 00 Object Identifier: Device, instance 0
  19 4b       Property Identifier: object-identifier (75)
```

#### Who-Is (Broadcast Discovery)
```
Hex: 81 0b 00 0c 01 20 ff ff 00 ff 10 08

Breakdown:
  81          BVLC Type
  0b          BVLC Function: Original-Broadcast-NPDU
  00 0c       Length (12 bytes)
  01          NPDU Version
  20          NPDU Control: broadcast
  ff ff       DNET: broadcast
  00          DLEN
  ff          Hop count
  10 08       APDU: Unconfirmed Who-Is
```

---

### EtherNet/IP

**Port:** 44818/tcp (explicit messaging), 2222/udp (implicit)

**Source:** ODVA EtherNet/IP Specification

#### List Identity Request
```
Hex: 63 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00

Breakdown:
  63 00       Command: List Identity (0x0063)
  00 00       Length: 0 (no data)
  00 00 00 00 Session handle (0 for this command)
  00 00 00 00 Status
  00 00 00 00 00 00 00 00  Sender context
  00 00 00 00 Options
```

#### Register Session Request
```
Hex: 65 00 04 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 00 00 00

Breakdown:
  65 00       Command: Register Session (0x0065)
  04 00       Length: 4
  [16 bytes]  Header (session=0, status=0, context, options)
  01 00       Protocol version: 1
  00 00       Options flags: 0
```

---

### Niagara Fox

**Port:** 1911/tcp, 4911/tcp (TLS)

**Source:** Digital Bond research

#### Fox Hello Request
```
Text:
fox a 1 -1 fox hello
{
fox.version=s:1.0
id=i:1
};;

Hex (with CRLF):
66 6f 78 20 61 20 31 20 2d 31 20 66 6f 78 20 68
65 6c 6c 6f 0a 7b 0a 66 6f 78 2e 76 65 72 73 69
6f 6e 3d 73 3a 31 2e 30 0a 69 64 3d 69 3a 31 0a
7d 3b 3b 0a
```

**Expected Response:**
- Starts with "fox a 0" (success)
- Contains key-value pairs: hostName, hostAddress, fox.version, app.name, app.version, vm.name, vm.version, os.name, timeZone, hostId, vmUuid, brandId

---

## NoSQL Databases

### MongoDB

**Port:** 27017/tcp

**Source:** MongoDB Wire Protocol

#### OP_QUERY: listDatabases
```
MongoDB Wire Protocol Header (16 bytes):
  Bytes 0-3:   Message length (little-endian)
  Bytes 4-7:   Request ID
  Bytes 8-11:  Response To (0 for requests)
  Bytes 12-15: OpCode (2004 = OP_QUERY)

OP_QUERY Structure:
  Bytes 16-19: Flags
  Bytes 20+:   Collection name (cstring)
  Number to skip (4 bytes)
  Number to return (4 bytes)
  Query document (BSON)
```

**listDatabases Command (OP_MSG, modern):**
```
OpCode: 2013 (OP_MSG)
Flags: 0x00000000
Section Kind 0 (body):
  BSON: { "listDatabases": 1, "$db": "admin" }
```

**Expected Response:** BSON document containing "databases" array and "totalSize".

---

### Redis

**Port:** 6379/tcp

**Source:** RESP Protocol

#### INFO Command
```
Text: INFO\r\n
Hex:  49 4e 46 4f 0d 0a
```

#### RESP Protocol INFO (Array format)
```
Text: *1\r\n$4\r\nINFO\r\n
Hex:  2a 31 0d 0a 24 34 0d 0a 49 4e 46 4f 0d 0a

Breakdown:
  2a 31 0d 0a    "*1\r\n" - Array of 1 element
  24 34 0d 0a    "$4\r\n" - Bulk string, 4 bytes
  49 4e 46 4f    "INFO"
  0d 0a          CRLF
```

#### PING Command
```
Text: PING\r\n
Hex:  50 49 4e 47 0d 0a

Expected Response: +PONG\r\n (Hex: 2b 50 4f 4e 47 0d 0a)
```

---

### Cassandra CQL

**Port:** 9042/tcp

**Source:** Apache Cassandra CQL Native Protocol v4

#### OPTIONS Request
```
Hex: 04 00 00 00 05 00 00 00 00

Breakdown:
  04          Version: 4 (request, protocol v4)
  00          Flags: none
  00 00       Stream ID: 0
  05          Opcode: OPTIONS
  00 00 00 00 Length: 0 (no body)
```

**Frame Header (9 bytes):**
```
Byte 0:     Version (bit 7: direction, bits 0-6: version number)
            Request: 0x04 (v4), Response: 0x84
Byte 1:     Flags (0x00 = none, 0x01 = compression, 0x02 = tracing)
Bytes 2-3:  Stream ID (signed 16-bit)
Byte 4:     Opcode
Bytes 5-8:  Length (big-endian 32-bit)
```

**Opcodes:**
| Code | Name | Direction |
|------|------|-----------|
| 0x00 | ERROR | Response |
| 0x01 | STARTUP | Request |
| 0x02 | READY | Response |
| 0x05 | OPTIONS | Request |
| 0x06 | SUPPORTED | Response |
| 0x07 | QUERY | Request |
| 0x08 | RESULT | Response |

**Expected Response:** Opcode 0x06 (SUPPORTED) with version byte 0x84.

---

## Message Queue Protocols

### AMQP

**Port:** 5672/tcp

**Source:** AMQP 0-9-1 Specification

#### Protocol Header
```
Hex: 41 4d 51 50 00 00 09 01

Breakdown:
  41 4d 51 50 "AMQP" literal
  00          Protocol ID (0 = AMQP)
  00          Major version: 0
  09          Minor version: 9
  01          Revision: 1
```

**Expected Response:** Connection.Start method frame containing server-properties.

---

### MQTT

**Port:** 1883/tcp (plain), 8883/tcp (TLS)

**Source:** MQTT 3.1.1/5.0 Specification

#### CONNECT Packet (MQTT 3.1.1)
```
Hex: 10 10 00 04 4d 51 54 54 04 02 00 3c 00 04 74 65 73 74

Breakdown:
  10          Fixed header: CONNECT (type 1), flags 0
  10          Remaining length: 16
  00 04       Protocol name length: 4
  4d 51 54 54 "MQTT"
  04          Protocol level: 4 (MQTT 3.1.1)
  02          Connect flags: Clean session
  00 3c       Keep alive: 60 seconds
  00 04       Client ID length: 4
  74 65 73 74 "test"
```

**Expected Response:** CONNACK (type 2) with return code 0x00 (accepted).

---

### Apache Kafka

**Port:** 9092/tcp

**Source:** Apache Kafka Protocol Guide

#### ApiVersions Request (v0, minimal)
```
Hex: 00 00 00 0a 00 12 00 00 00 00 00 01 00 04 74 65 73 74

Breakdown:
  00 00 00 0a Size: 10 bytes (request body)
  00 12       API Key: 18 (ApiVersions)
  00 00       API Version: 0
  00 00 00 01 Correlation ID: 1
  00 04       Client ID length: 4
  74 65 73 74 "test"
```

**Minimal ApiVersions (10 bytes):**
```
Hex: 00 00 00 06 00 12 00 00 00 00 00 01

Breakdown:
  00 00 00 06 Size: 6 bytes
  00 12       API Key: 18 (ApiVersions)
  00 00       API Version: 0
  00 00 00 01 Correlation ID
```

**Response:** ApiVersions response with supported API keys and version ranges.

---

### NATS

**Port:** 4222/tcp

**Source:** NATS Protocol Documentation

#### CONNECT Command
```
Text: CONNECT {"verbose":false,"pedantic":false,"tls_required":false,"name":"probe"}\r\n

Hex:
43 4f 4e 4e 45 43 54 20 7b 22 76 65 72 62 6f 73
65 22 3a 66 61 6c 73 65 2c 22 70 65 64 61 6e 74
69 63 22 3a 66 61 6c 73 65 2c 22 74 6c 73 5f 72
65 71 75 69 72 65 64 22 3a 66 61 6c 73 65 2c 22
6e 61 6d 65 22 3a 22 70 72 6f 62 65 22 7d 0d 0a
```

**Minimal CONNECT:**
```
Text: CONNECT {}\r\n
Hex:  43 4f 4e 4e 45 43 54 20 7b 7d 0d 0a
```

**Server Info Response:** Server sends INFO {...}\r\n upon connection containing server version, auth requirements, etc.

---

## Modern Transport Protocols

### TLS 1.3

**Port:** 443/tcp (HTTPS), various

**Source:** RFC 8446

#### ClientHello with SNI
```
Record Layer:
  16          Content type: Handshake
  03 03       Version: TLS 1.2 (compatibility)
  XX XX       Length (2 bytes, big-endian)

Handshake:
  01          Type: ClientHello
  XX XX XX    Length (3 bytes)
  03 03       Legacy version: TLS 1.2
  [32 bytes]  Random
  XX          Session ID length (0-32)
  [0-32 bytes] Session ID
  XX XX       Cipher suites length
  [cipher suites]
  XX          Compression methods length
  00          Null compression
  XX XX       Extensions length
```

**SNI Extension (Type 0x0000):**
```
00 00       Extension type: server_name
XX XX       Extension length
XX XX       Server name list length
00          Name type: host_name
XX XX       Host name length
[hostname bytes]
```

**supported_versions Extension (Required for TLS 1.3):**
```
00 2b       Extension type: supported_versions (43)
XX XX       Extension length
XX          Supported versions length
03 04       TLS 1.3
03 03       TLS 1.2 (fallback)
```

**Minimal ClientHello (TLS 1.3):**
```
Hex:
16 03 01 00 f1 01 00 00 ed 03 03 [32 random bytes]
00 [session id: 00 or with bytes]
00 02 13 01 [cipher: TLS_AES_128_GCM_SHA256]
01 00 [compression: null]
00 c2 [extensions length]
00 00 00 0e 00 0c 00 00 09 [SNI: localhost]
00 2b 00 03 02 03 04 [supported_versions: TLS 1.3]
00 0a 00 04 00 02 00 1d [supported_groups: x25519]
00 0d 00 04 00 02 08 04 [signature_algorithms: rsa_pss_rsae_sha256]
00 33 00 26 00 24 00 1d 00 20 [key_share: x25519 public key]
```

---

### QUIC

**Port:** 443/udp

**Source:** RFC 9000

#### Initial Packet (Long Header)
```
Header:
  Byte 0:     Header form (1) | Fixed bit (1) | Long packet type (2) | Reserved (2) | Packet number length (2)
              Initial packet: 0xc0 (11000000)
  Bytes 1-4:  Version
              QUIC v1: 00 00 00 01
              QUIC v2: 6b 33 43 cf
  Byte 5:     DCID Length (0-20)
  [DCID]      Destination Connection ID (variable, min 8 for Initial)
  Byte N:     SCID Length
  [SCID]      Source Connection ID (variable)
  [Token Length] Variable-length integer
  [Token]     Token (variable, 0 for new connection)
  [Length]    Variable-length integer (packet payload length)
  [Packet Number] 1-4 bytes
  [Payload]   CRYPTO frames containing ClientHello
```

**Minimal Initial Packet:**
```
Hex:
c0 00 00 00 01 08 [8 random DCID bytes] 00 00 [payload]

Breakdown:
  c0          Long header, Initial packet
  00 00 00 01 Version 1
  08          DCID length: 8
  [8 bytes]   DCID
  00          SCID length: 0
  00          Token length: 0 (varint)
```

---

### gRPC/HTTP/2

**Port:** Various (commonly 443, 50051)

**Source:** RFC 7540, gRPC Protocol

#### HTTP/2 Connection Preface
```
Text: PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n

Hex: 50 52 49 20 2a 20 48 54 54 50 2f 32 2e 30 0d 0a 0d 0a 53 4d 0d 0a 0d 0a

Length: 24 bytes (magic)
```

**Must be followed by SETTINGS frame:**
```
Frame Header (9 bytes):
  00 00 XX    Length (3 bytes, payload length)
  04          Type: SETTINGS (4)
  00          Flags
  00 00 00 00 Stream ID: 0 (connection-level)

Empty SETTINGS:
Hex: 00 00 00 04 00 00 00 00 00
```

**SETTINGS Parameters (6 bytes each):**
```
00 01 XX XX XX XX  HEADER_TABLE_SIZE
00 02 00 00 00 XX  ENABLE_PUSH (0 or 1)
00 03 XX XX XX XX  MAX_CONCURRENT_STREAMS
00 04 XX XX XX XX  INITIAL_WINDOW_SIZE
00 05 XX XX XX XX  MAX_FRAME_SIZE
00 06 XX XX XX XX  MAX_HEADER_LIST_SIZE
```

**Expected Response:** Server connection preface (SETTINGS frame).

---

## Directory Services

### LDAP

**Port:** 389/tcp (plain), 636/tcp (LDAPS)

**Source:** RFC 4511

#### SearchRequest (RootDSE)
```
LDAP Message:
  30 XX       SEQUENCE, length
  02 01 01    MessageID: 1
  63 XX       SearchRequest tag (APPLICATION 3)
  04 00       baseObject: "" (empty = rootDSE)
  0a 01 00    scope: baseObject (0)
  0a 01 00    derefAliases: neverDerefAliases (0)
  02 01 00    sizeLimit: 0 (unlimited)
  02 01 00    timeLimit: 0
  01 01 00    typesOnly: FALSE
  87 0b       Filter: present (objectClass)
    6f 62 6a 65 63 74 43 6c 61 73 73  "objectClass"
  30 00       Attributes: empty (return all)
```

**Minimal RootDSE Query:**
```
Hex:
30 1b 02 01 01 63 16 04 00 0a 01 00 0a 01 00 02
01 00 02 01 00 01 01 00 87 0b 6f 62 6a 65 63 74
43 6c 61 73 73 30 00

Breakdown:
  30 1b       SEQUENCE, 27 bytes
  02 01 01    INTEGER: MessageID = 1
  63 16       SearchRequest, 22 bytes
  04 00       BaseDN: "" (empty)
  0a 01 00    Scope: baseObject
  0a 01 00    DerefAliases: never
  02 01 00    SizeLimit: 0
  02 01 00    TimeLimit: 0
  01 01 00    TypesOnly: false
  87 0b ...   Filter: (objectClass=*)
  30 00       Attributes: all
```

---

## IoT Protocols

### CoAP

**Port:** 5683/udp

**Source:** RFC 7252

#### GET /.well-known/core (Resource Discovery)
```
Hex: 40 01 00 01 b5 2e 77 65 6c 6c 2d 6b 6e 6f 77 6e 04 63 6f 72 65

Breakdown:
  40          Ver=1, Type=CON, TKL=0
  01          Code: 0.01 (GET)
  00 01       Message ID: 1
  b5          Option delta=11 (Uri-Path), length=5
  2e 77 65 6c 6c  ".well"
  2d 6b 6e 6f 77 6e  "-known"  (extended)
  04          Option delta=0, length=4
  63 6f 72 65 "core"
```

**Simpler Discovery:**
```
Hex: 40 01 00 01

Breakdown:
  40          Ver=1, Type=CON (Confirmable), TKL=0
  01          Code: GET
  00 01       Message ID
```

**Response:** ACK (Type=2) with 2.05 Content and resource links.

---

## Remote Desktop

### RDP/Terminal Server

**Port:** 3389/tcp

**Source:** MS-RDPBCGR

#### X.224 Connection Request
```
Hex:
03 00 00 2b 26 e0 00 00 00 00 00 43 6f 6f 6b 69
65 3a 20 6d 73 74 73 68 61 73 68 3d 6e 6d 61 70
0d 0a 01 00 08 00 0b 00 00 00

Breakdown:
  03 00       TPKT version 3
  00 2b       Length: 43 bytes
  26          X.224 length
  e0          Connection Request
  00 00       DST reference
  00 00       SRC reference
  00          Class 0
  43 6f 6f 6b 69 65 3a 20  "Cookie: "
  6d 73 74 73 68 61 73 68 3d  "mstshash="
  6e 6d 61 70  "unicornscan"
  0d 0a       CRLF
  01 00       RDP_NEG_REQ type
  08 00       Length: 8
  0b 00 00 00 Requested protocols (TLS + CredSSP + RDSTLS)
```

**Minimal Connection Request:**
```
Hex: 03 00 00 0b 06 e0 00 00 00 00 00

Breakdown:
  03 00       TPKT v3
  00 0b       Length: 11
  06          X.224 length
  e0          Connection Request
  00 00 00 00 DST/SRC ref
  00          Class 0
```

---

## SMB/CIFS

**Port:** 445/tcp (direct), 139/tcp (over NetBIOS)

**Source:** MS-SMB2

#### SMB2 Negotiate Request
```
Hex:
00 00 00 54 fe 53 4d 42 40 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 24 00 02 00
01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 02 02 10 02

Breakdown:
  00 00 00 54 NetBIOS session (84 bytes)
  fe 53 4d 42 SMB2 magic (\xfeSMB)
  40 00       Header length: 64
  00 00       Credit charge
  00 00       Status
  00 00       Command: Negotiate (0)
  [...]       Credits, flags, message ID, etc.
  24 00       Structure size: 36
  02 00       Dialect count: 2
  01 00       Security mode
  00 00       Reserved
  00 00 00 00 Capabilities
  [16 bytes]  Client GUID
  00 00 00 00 Negotiate context offset
  02 02       Dialect: SMB 2.002
  10 02       Dialect: SMB 2.1
```

**Minimal SMB1 Negotiate (triggers SMB2):**
```
Hex:
00 00 00 25 ff 53 4d 42 72 00 00 00 00 08 01 c8
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 02 00 02 4e 54 20 4c 4d 20 30 2e
31 32 00

Breakdown:
  00 00 00 25 NetBIOS length: 37
  ff 53 4d 42 SMB1 magic (\xffSMB)
  72          Command: Negotiate
  [...]       Flags, status
  00 02 00 02 NT LM 0.12 dialect
```

---

## Appendix: Quick Reference Table

| Protocol | Port | First Bytes (Hex) | Description |
|----------|------|-------------------|-------------|
| S7comm/COTP | 102 | 03 00 00 16 11 e0 | TPKT + COTP CR |
| Modbus | 502 | 00 00 00 00 00 02 | Transaction + Protocol ID |
| DNP3 | 20000 | 05 64 | FT3 sync bytes |
| BACnet | 47808 | 81 0a/0b | BVLC type |
| EtherNet/IP | 44818 | 63 00/65 00 | List Identity/Register |
| Fox | 1911 | 66 6f 78 | "fox" |
| MongoDB | 27017 | [len] ... op | Wire protocol |
| Redis | 6379 | 2a/24/2b | RESP array/bulk/simple |
| Cassandra | 9042 | 04 00 00 00 05 | CQL v4 OPTIONS |
| AMQP | 5672 | 41 4d 51 50 | "AMQP" |
| MQTT | 1883 | 10 | CONNECT packet |
| Kafka | 9092 | 00 00 00 XX | Size prefix |
| NATS | 4222 | 43 4f 4e 4e | "CONN" (text) |
| TLS | 443 | 16 03 01/03 | Handshake record |
| QUIC | 443/udp | c0 00 00 00 01 | Long header Initial |
| HTTP/2 | various | 50 52 49 20 2a | "PRI *" preface |
| LDAP | 389 | 30 XX 02 01 | SEQUENCE + MessageID |
| CoAP | 5683/udp | 40 01 | CON GET |
| RDP | 3389 | 03 00 00 XX | TPKT |
| SMB2 | 445 | fe 53 4d 42 | \xfeSMB |

---

## References

1. Modbus Application Protocol V1.1b: http://www.modbus.org/docs/
2. RFC 8446 - TLS 1.3
3. RFC 9000 - QUIC
4. RFC 7540 - HTTP/2
5. RFC 4511 - LDAP
6. RFC 7252 - CoAP
7. MS-RDPBCGR: Microsoft RDP Basic Connectivity
8. MS-SMB2: Microsoft SMB2 Protocol
9. Apache Kafka Protocol: https://kafka.apache.org/protocol
10. Apache Cassandra CQL Native Protocol v4
11. NATS Protocol: https://docs.nats.io/reference/reference-protocols/nats-protocol
