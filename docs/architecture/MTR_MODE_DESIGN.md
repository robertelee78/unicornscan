# Architectural Design Document: MTR-Like Mode for Unicornscan

## Document Metadata
- **Version**: 1.0
- **Date**: 2026-01-03
- **Author**: System Architecture Designer (Hive Mind Collective)
- **Status**: Draft for Collective Review

---

## 1. Executive Summary

This document proposes the addition of an MTR-like (My Traceroute) mode to unicornscan's tcptraceroute functionality. MTR combines the capabilities of traceroute and ping by using incremental TTL values to discover the network path to a target while gathering per-hop statistics including round-trip time (RTT) and packet loss.

### 1.1 Key Objectives
- Implement incremental TTL probing (TTL 1, 2, 3, ... N)
- Capture ICMP Time Exceeded responses from intermediate routers
- Provide per-hop statistics (RTT, loss rate, jitter)
- Support continuous monitoring mode (real-time updates)
- Integrate seamlessly with existing unicornscan architecture

---

## 2. Current Architecture Analysis

### 2.1 Relevant Existing Components

Based on codebase review, the following components are directly relevant:

| Component | File | Relevance |
|-----------|------|-----------|
| Mode definitions | `settings.h` | MODE_TCPSCAN, MODE_UDPSCAN exist |
| TTL configuration | `getconfig.c` | `-t` flag sets minttl/maxttl |
| ICMP definitions | `packets.h` | ICMP_TIME_EXCEEDED = 11 |
| Response capture | `recv_packet.c` | ICMP filter already included |
| Workunit management | `workunits.c` | Multi-phase scan support |
| Result reporting | `report.c` | ip_report_t with trace_addr |
| Compound modes | `getconfig.c` | `-mA+T` pattern exists |

### 2.2 Existing TTL Infrastructure

```c
// From settings.h - already exists
typedef struct scan_settings_s {
    uint8_t minttl;          // Minimum TTL value
    uint8_t maxttl;          // Maximum TTL value (default 128)
    // ...
} scan_settings_t;

// From getconfig.c - current TTL option
case 't': /* ttl on outgoing IP datagrams */
    if (scan_setttl(optarg) < 0) { usage(); }
    break;
```

### 2.3 ICMP Time Exceeded Support

```c
// From packets.h - already defined
#define ICMP_TIME_EXCEEDED    11    /* Time Exceeded */
#define ICMP_EXC_TTL          0     /* TTL count exceeded */

// From recv_packet.c - ICMP already captured
#define TCP_EFILTER "or icmp"
#define UDP_EFILTER "or icmp"
```

### 2.4 Compound Mode Pattern

The existing compound mode (`-mA+T` for ARP then TCP) demonstrates multi-phase scanning:

```c
// From workunits.c
void workunit_reinit(void *pri_work, const settings_t *s) {
    // Reinitializes workunit for next phase
    sw_u.s->minttl = s->ss->minttl;
    sw_u.s->maxttl = s->ss->maxttl;
}
```

---

## 3. Proposed Command-Line Interface

### 3.1 Primary Flag

```
-M mtr    or    --mtr-mode
```

### 3.2 Full Option Set

```
MTR Mode Options:
  -M mtr, --mtr-mode           Enable MTR (incremental TTL traceroute) mode
  --mtr-max-ttl <N>            Maximum TTL to probe (default: 30)
  --mtr-min-ttl <N>            Starting TTL value (default: 1)
  --mtr-probes <N>             Probes per TTL hop (default: 3)
  --mtr-interval <ms>          Interval between probe rounds (default: 1000)
  --mtr-continuous             Enable continuous monitoring mode
  --mtr-timeout <ms>           Per-probe timeout (default: 5000)
  --mtr-protocol <tcp|udp|icmp> Probe protocol (default: tcp)
```

### 3.3 Usage Examples

```bash
# Basic MTR-style TCP traceroute
unicornscan -M mtr 192.168.1.1:80

# Continuous monitoring with 5 probes per hop
unicornscan -M mtr --mtr-continuous --mtr-probes 5 10.0.0.1:443

# UDP MTR mode to max TTL 20
unicornscan -M mtr --mtr-protocol udp --mtr-max-ttl 20 8.8.8.8:53

# Combined with existing options (rate limiting, interface)
unicornscan -M mtr -r 100 -i eth0 192.168.1.1:22
```

### 3.4 Integration with getconfig.c

```c
// New option definitions
#define MTR_OPTS "M:"

// Long options addition
{"mtr-mode",       0, NULL, OPT_MTR_MODE},
{"mtr-max-ttl",    1, NULL, OPT_MTR_MAX_TTL},
{"mtr-min-ttl",    1, NULL, OPT_MTR_MIN_TTL},
{"mtr-probes",     1, NULL, OPT_MTR_PROBES},
{"mtr-interval",   1, NULL, OPT_MTR_INTERVAL},
{"mtr-continuous", 0, NULL, OPT_MTR_CONTINUOUS},
{"mtr-timeout",    1, NULL, OPT_MTR_TIMEOUT},
{"mtr-protocol",   1, NULL, OPT_MTR_PROTOCOL},

// Option enum values (add to existing)
#define OPT_MTR_MODE       0x1001
#define OPT_MTR_MAX_TTL    0x1002
#define OPT_MTR_MIN_TTL    0x1003
#define OPT_MTR_PROBES     0x1004
#define OPT_MTR_INTERVAL   0x1005
#define OPT_MTR_CONTINUOUS 0x1006
#define OPT_MTR_TIMEOUT    0x1007
#define OPT_MTR_PROTOCOL   0x1008
```

---

## 4. Core Data Structures

### 4.1 MTR Configuration Structure

```c
/**
 * MTR mode configuration
 * Extends scan_settings_t for MTR-specific options
 */
typedef struct mtr_config_s {
    uint8_t  enabled;           /* MTR mode enabled flag */
    uint8_t  min_ttl;           /* Starting TTL (default: 1) */
    uint8_t  max_ttl;           /* Maximum TTL (default: 30) */
    uint8_t  probes_per_hop;    /* Probes per TTL value (default: 3) */
    uint32_t probe_interval_ms; /* Interval between rounds (default: 1000) */
    uint32_t probe_timeout_ms;  /* Per-probe timeout (default: 5000) */
    uint8_t  continuous;        /* Continuous monitoring mode */
    uint8_t  protocol;          /* MTR_PROTO_TCP, MTR_PROTO_UDP, MTR_PROTO_ICMP */
    uint8_t  current_ttl;       /* Current TTL being probed */
    uint8_t  current_probe;     /* Current probe number for this TTL */
    uint32_t round_number;      /* Current monitoring round */
} mtr_config_t;

/* Protocol constants */
#define MTR_PROTO_TCP   1
#define MTR_PROTO_UDP   2
#define MTR_PROTO_ICMP  3
```

### 4.2 Per-Hop Statistics Structure

```c
/**
 * Statistics for a single hop in the path
 */
typedef struct mtr_hop_stats_s {
    uint8_t  ttl;                  /* TTL value for this hop */
    uint32_t router_ip;            /* IP address of responding router */
    char     router_hostname[256]; /* Resolved hostname (if available) */

    /* Probe tracking */
    uint32_t probes_sent;          /* Total probes sent to this hop */
    uint32_t probes_received;      /* Responses received */
    uint32_t probes_lost;          /* Lost probes (timeout) */

    /* RTT statistics (microseconds) */
    uint64_t rtt_sum;              /* Sum of all RTTs */
    uint64_t rtt_sum_sq;           /* Sum of squared RTTs (for stddev) */
    uint32_t rtt_min;              /* Minimum RTT observed */
    uint32_t rtt_max;              /* Maximum RTT observed */
    uint32_t rtt_last;             /* Most recent RTT */

    /* Derived statistics (calculated on demand) */
    /* avg = rtt_sum / probes_received */
    /* stddev = sqrt((rtt_sum_sq / n) - (avg * avg)) */
    /* loss% = (probes_lost / probes_sent) * 100 */

    /* Response tracking */
    uint8_t  icmp_type;            /* Last ICMP type received */
    uint8_t  icmp_code;            /* Last ICMP code received */
    uint8_t  reached_target;       /* 1 if this hop is the destination */

    /* Timestamps */
    struct timeval first_seen;     /* First response timestamp */
    struct timeval last_seen;      /* Most recent response timestamp */
} mtr_hop_stats_t;
```

### 4.3 MTR Session State

```c
/**
 * Complete MTR session state
 * Manages the entire trace operation
 */
typedef struct mtr_session_s {
    mtr_config_t config;                /* Session configuration */

    /* Target information */
    uint32_t target_ip;                 /* Destination IP address */
    uint16_t target_port;               /* Destination port */

    /* Path discovery */
    uint8_t  path_discovered;           /* 1 if target reached */
    uint8_t  max_hops_seen;             /* Highest TTL with response */

    /* Hop statistics array */
    mtr_hop_stats_t hops[MAX_MTR_HOPS]; /* Per-hop statistics */

    /* Probe tracking */
    uint32_t seq_base;                  /* Starting sequence number */
    uint32_t current_seq;               /* Current sequence number */

    /* Session timing */
    struct timeval session_start;       /* Session start time */
    struct timeval round_start;         /* Current round start time */

    /* State machine */
    uint8_t  state;                     /* MTR_STATE_* values */
} mtr_session_t;

#define MAX_MTR_HOPS 64

/* Session states */
#define MTR_STATE_INIT       0
#define MTR_STATE_PROBING    1
#define MTR_STATE_WAITING    2
#define MTR_STATE_REPORTING  3
#define MTR_STATE_COMPLETE   4
#define MTR_STATE_CONTINUOUS 5
```

### 4.4 Probe Tracking Structure

```c
/**
 * Individual probe tracking
 * Maps outbound probes to expected responses
 */
typedef struct mtr_probe_s {
    uint32_t seq;                 /* Sequence number / ID */
    uint8_t  ttl;                 /* TTL value used */
    uint16_t sport;               /* Source port (for TCP/UDP) */
    uint16_t dport;               /* Destination port */
    struct timeval sent_time;     /* Timestamp when sent */
    uint8_t  responded;           /* 1 if response received */
    uint8_t  timeout;             /* 1 if timed out */
} mtr_probe_t;

/**
 * Outstanding probe tracker
 * Ring buffer of pending probes
 */
typedef struct mtr_probe_tracker_s {
    mtr_probe_t probes[MAX_OUTSTANDING_PROBES];
    uint16_t head;                /* Next insert position */
    uint16_t tail;                /* Oldest probe position */
    uint16_t count;               /* Current count */
} mtr_probe_tracker_t;

#define MAX_OUTSTANDING_PROBES 256
```

---

## 5. Core Algorithm Pseudocode

### 5.1 Main MTR Loop

```
ALGORITHM: MTR_Main_Loop
INPUT: target_ip, target_port, mtr_config
OUTPUT: Path statistics to stdout/report

BEGIN
    session = MTR_Initialize_Session(target_ip, target_port, mtr_config)

    WHILE session.state != MTR_STATE_COMPLETE DO

        SWITCH session.state:

            CASE MTR_STATE_INIT:
                // Initialize for first round
                session.current_ttl = config.min_ttl
                session.current_probe = 0
                session.state = MTR_STATE_PROBING
                BREAK

            CASE MTR_STATE_PROBING:
                // Send probe at current TTL
                probe = MTR_Create_Probe(session, session.current_ttl)
                MTR_Send_Probe(probe)
                MTR_Track_Probe(session, probe)

                session.current_probe++

                IF session.current_probe >= config.probes_per_hop THEN
                    // Move to next TTL
                    session.current_ttl++
                    session.current_probe = 0

                    IF session.current_ttl > config.max_ttl OR
                       session.path_discovered THEN
                        session.state = MTR_STATE_WAITING
                    END IF
                END IF
                BREAK

            CASE MTR_STATE_WAITING:
                // Wait for final responses
                timeout = MTR_Calculate_Wait_Timeout(session)
                MTR_Wait_For_Responses(session, timeout)
                session.state = MTR_STATE_REPORTING
                BREAK

            CASE MTR_STATE_REPORTING:
                // Display current statistics
                MTR_Report_Statistics(session)

                IF config.continuous THEN
                    // Reset for next round
                    session.round_number++
                    session.current_ttl = config.min_ttl
                    session.current_probe = 0
                    MTR_Sleep(config.probe_interval_ms)
                    session.state = MTR_STATE_PROBING
                ELSE
                    session.state = MTR_STATE_COMPLETE
                END IF
                BREAK

        END SWITCH

        // Process any received responses (non-blocking)
        MTR_Process_Incoming_Responses(session)

        // Check for timeouts
        MTR_Check_Probe_Timeouts(session)

    END WHILE

    RETURN session
END
```

### 5.2 Response Processing

```
ALGORITHM: MTR_Process_ICMP_Response
INPUT: icmp_packet, session
OUTPUT: Updated hop statistics

BEGIN
    // Extract ICMP header
    icmp_type = icmp_packet.type
    icmp_code = icmp_packet.code

    IF icmp_type == ICMP_TIME_EXCEEDED AND icmp_code == ICMP_EXC_TTL THEN
        // TTL expired - intermediate router response

        // Extract original packet from ICMP payload
        original_ip = Extract_Original_IP_Header(icmp_packet)
        original_transport = Extract_Original_Transport(icmp_packet)

        // Match to outstanding probe
        probe = MTR_Match_Probe(session, original_transport)

        IF probe != NULL AND NOT probe.responded THEN
            // Calculate RTT
            rtt = Current_Time() - probe.sent_time

            // Get hop index from probe TTL
            hop_index = probe.ttl - session.config.min_ttl
            hop = session.hops[hop_index]

            // Update statistics
            hop.router_ip = icmp_packet.source_ip
            hop.probes_received++
            hop.rtt_sum += rtt
            hop.rtt_sum_sq += rtt * rtt
            hop.rtt_last = rtt

            IF rtt < hop.rtt_min OR hop.rtt_min == 0 THEN
                hop.rtt_min = rtt
            END IF
            IF rtt > hop.rtt_max THEN
                hop.rtt_max = rtt
            END IF

            hop.icmp_type = icmp_type
            hop.icmp_code = icmp_code

            probe.responded = TRUE

            // Update max hops seen
            IF probe.ttl > session.max_hops_seen THEN
                session.max_hops_seen = probe.ttl
            END IF
        END IF

    ELSE IF icmp_type == ICMP_DEST_UNREACH THEN
        // Destination unreachable - could be final hop
        // Process similarly but mark as destination
        probe = MTR_Match_Probe_From_ICMP(session, icmp_packet)
        IF probe != NULL THEN
            MTR_Update_Hop_Stats(session, probe, icmp_packet)
            hop.reached_target = TRUE
            session.path_discovered = TRUE
        END IF

    ELSE IF icmp_type == ICMP_ECHOREPLY THEN
        // Echo reply for ICMP probes - destination reached
        probe = MTR_Match_ICMP_Probe(session, icmp_packet)
        IF probe != NULL THEN
            MTR_Update_Hop_Stats(session, probe, icmp_packet)
            hop.reached_target = TRUE
            session.path_discovered = TRUE
        END IF
    END IF
END
```

### 5.3 TCP/UDP Response Processing

```
ALGORITHM: MTR_Process_TCP_Response
INPUT: tcp_packet, session
OUTPUT: Updated hop statistics

BEGIN
    // For TCP probes, a response means we reached the destination
    // The hop before this was the last router

    probe = MTR_Match_TCP_Probe(session, tcp_packet)

    IF probe != NULL AND NOT probe.responded THEN
        rtt = Current_Time() - probe.sent_time
        hop_index = probe.ttl - session.config.min_ttl
        hop = session.hops[hop_index]

        // This is the destination
        hop.router_ip = session.target_ip
        hop.reached_target = TRUE
        hop.probes_received++

        MTR_Update_RTT_Stats(hop, rtt)

        probe.responded = TRUE
        session.path_discovered = TRUE
    END IF
END


ALGORITHM: MTR_Process_UDP_Response
INPUT: udp_packet, session
OUTPUT: Updated hop statistics

BEGIN
    // Similar to TCP - a response means destination reached
    // Typically expect ICMP Port Unreachable for closed ports

    probe = MTR_Match_UDP_Probe(session, udp_packet)

    IF probe != NULL AND NOT probe.responded THEN
        rtt = Current_Time() - probe.sent_time
        hop_index = probe.ttl - session.config.min_ttl
        hop = session.hops[hop_index]

        hop.router_ip = session.target_ip
        hop.reached_target = TRUE
        hop.probes_received++

        MTR_Update_RTT_Stats(hop, rtt)

        probe.responded = TRUE
        session.path_discovered = TRUE
    END IF
END
```

### 5.4 Probe Creation

```
ALGORITHM: MTR_Create_TCP_Probe
INPUT: session, ttl
OUTPUT: TCP SYN packet with specified TTL

BEGIN
    packet = Allocate_Packet_Buffer()

    // IP Header
    packet.ip.version = 4
    packet.ip.ttl = ttl
    packet.ip.protocol = IPPROTO_TCP
    packet.ip.src = session.source_ip
    packet.ip.dst = session.target_ip

    // TCP Header - SYN probe
    packet.tcp.src_port = Generate_Source_Port(session)
    packet.tcp.dst_port = session.target_port
    packet.tcp.seq = session.current_seq++
    packet.tcp.flags = TH_SYN
    packet.tcp.window = DEFAULT_WINDOW_SIZE

    // Calculate checksums
    packet.ip.checksum = IP_Checksum(packet.ip)
    packet.tcp.checksum = TCP_Checksum(packet)

    RETURN packet
END


ALGORITHM: MTR_Create_ICMP_Probe
INPUT: session, ttl
OUTPUT: ICMP Echo Request with specified TTL

BEGIN
    packet = Allocate_Packet_Buffer()

    // IP Header
    packet.ip.version = 4
    packet.ip.ttl = ttl
    packet.ip.protocol = IPPROTO_ICMP
    packet.ip.src = session.source_ip
    packet.ip.dst = session.target_ip

    // ICMP Header - Echo Request
    packet.icmp.type = ICMP_ECHO
    packet.icmp.code = 0
    packet.icmp.id = session.icmp_id
    packet.icmp.seq = session.current_seq++

    // Payload with timestamp for RTT verification
    packet.icmp.payload = Encode_Timestamp(Current_Time())

    // Calculate checksums
    packet.ip.checksum = IP_Checksum(packet.ip)
    packet.icmp.checksum = ICMP_Checksum(packet.icmp)

    RETURN packet
END
```

### 5.5 Statistics Calculation

```
ALGORITHM: MTR_Calculate_Hop_Statistics
INPUT: hop
OUTPUT: Calculated statistics (avg, stddev, loss%)

BEGIN
    stats = new Statistics()

    IF hop.probes_sent == 0 THEN
        RETURN empty_stats
    END IF

    // Loss percentage
    stats.loss_pct = (hop.probes_lost / hop.probes_sent) * 100.0

    IF hop.probes_received == 0 THEN
        stats.avg = 0
        stats.stddev = 0
        RETURN stats
    END IF

    // Average RTT
    stats.avg = hop.rtt_sum / hop.probes_received

    // Standard deviation
    // stddev = sqrt(E[X^2] - (E[X])^2)
    mean_sq = hop.rtt_sum_sq / hop.probes_received
    sq_mean = stats.avg * stats.avg
    variance = mean_sq - sq_mean
    stats.stddev = sqrt(variance)

    stats.min = hop.rtt_min
    stats.max = hop.rtt_max
    stats.last = hop.rtt_last

    RETURN stats
END
```

---

## 6. Integration Strategy

### 6.1 Component Integration Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                        UNICORNSCAN ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│  │  getconfig.c │────▶│  settings.h  │────▶│   main.c     │        │
│  │  (CLI parse) │     │  (config)    │     │  (entry)     │        │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘        │
│         │                    │                    │                 │
│         │ NEW: MTR options   │ NEW: mtr_config_t  │                 │
│         ▼                    ▼                    ▼                 │
│  ┌──────────────────────────────────────────────────────┐          │
│  │                    NEW: mtr_mode.c                    │          │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │          │
│  │  │ MTR Session │  │  Hop Stats  │  │   Probe     │   │          │
│  │  │  Manager    │  │  Tracker    │  │  Tracker    │   │          │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘   │          │
│  └─────────┼────────────────┼────────────────┼──────────┘          │
│            │                │                │                      │
│            ▼                ▼                ▼                      │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│  │ send_packet.c│     │recv_packet.c │     │  report.c    │        │
│  │ (probe send) │     │(ICMP capture)│     │ (display)    │        │
│  └──────────────┘     └──────────────┘     └──────────────┘        │
│         │                    │                    │                 │
│         │ EXISTING           │ MODIFY: Add        │ EXTEND: Add    │
│         │                    │ ICMP TTL parse     │ MTR format     │
│         ▼                    ▼                    ▼                 │
│  ┌──────────────────────────────────────────────────────┐          │
│  │                    workunits.c                        │          │
│  │            (coordinate MTR phases/rounds)             │          │
│  └──────────────────────────────────────────────────────┘          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 New Files to Create

| File | Purpose |
|------|---------|
| `src/scan_progs/mtr_mode.h` | MTR data structures and constants |
| `src/scan_progs/mtr_mode.c` | MTR session and state management |
| `src/scan_progs/mtr_probe.c` | Probe creation and tracking |
| `src/scan_progs/mtr_stats.c` | Statistics calculation and display |

### 6.3 Files to Modify

| File | Modification |
|------|--------------|
| `src/getconfig.c` | Add MTR command-line options |
| `src/settings.h` | Add MODE_MTRSCAN, mtr_config_t |
| `src/scan_progs/recv_packet.c` | Enhance ICMP Time Exceeded parsing |
| `src/scan_progs/report.c` | Add MTR output format |
| `src/scan_progs/workunits.c` | Add MTR workunit phase support |
| `src/scan_progs/Makefile.am` | Add new source files |

### 6.4 Integration with Existing Packet Handling

The existing `recv_packet.c` already captures ICMP alongside TCP/UDP:

```c
// Current filter in recv_packet.c
#define TCP_EFILTER "or icmp"
#define UDP_EFILTER "or icmp"

// Enhancement needed: Parse ICMP Time Exceeded payload
// to extract original packet and match to outbound probes
```

### 6.5 Integration with Workunit System

```c
// Proposed addition to workunits.c
typedef struct mtr_workunit_s {
    uint8_t  current_ttl;      /* TTL for this phase */
    uint8_t  probes_remaining; /* Probes left for this TTL */
    uint32_t round_number;     /* Current monitoring round */
} mtr_workunit_t;

// MTR mode workunit initialization
void mtr_workunit_init(send_workunit_t *wu, mtr_config_t *cfg) {
    wu->mtr.current_ttl = cfg->min_ttl;
    wu->mtr.probes_remaining = cfg->probes_per_hop;
    wu->mtr.round_number = 0;
}

// MTR mode workunit advancement
void mtr_workunit_next(send_workunit_t *wu, mtr_config_t *cfg) {
    wu->mtr.probes_remaining--;
    if (wu->mtr.probes_remaining == 0) {
        wu->mtr.current_ttl++;
        wu->mtr.probes_remaining = cfg->probes_per_hop;
    }
}
```

---

## 7. Output Format

### 7.1 Standard Output (MTR-style)

```
                           My Traceroute  [v0.4.22]
Target: 192.168.1.1:80 (tcp)                    2026-01-03T15:30:00
Keys:  Help   Display mode   Restart statistics   Order of fields   quit

                                       Packets               RTT (ms)
 #  Host                             Loss%   Snt   Last   Avg  Best  Wrst StDev
 1. 10.0.0.1                          0.0%    10    1.2   1.1   0.8   1.5   0.2
 2. 172.16.0.1                        0.0%    10    5.3   5.1   4.8   5.8   0.3
 3. 203.0.113.1                      10.0%    10   12.1  11.8  10.2  14.3   1.2
 4. 198.51.100.1                      0.0%    10   15.7  15.4  14.1  17.2   0.9
 5. 192.168.1.1                       0.0%    10   18.2  17.9  16.5  20.1   1.1
```

### 7.2 JSON Output (--format json)

```json
{
  "target": {
    "ip": "192.168.1.1",
    "port": 80,
    "protocol": "tcp"
  },
  "timestamp": "2026-01-03T15:30:00Z",
  "round": 1,
  "hops": [
    {
      "ttl": 1,
      "ip": "10.0.0.1",
      "hostname": "gateway.local",
      "loss_pct": 0.0,
      "sent": 10,
      "received": 10,
      "rtt": {
        "last": 1.2,
        "avg": 1.1,
        "min": 0.8,
        "max": 1.5,
        "stddev": 0.2
      }
    },
    // ... more hops
  ],
  "path_complete": true,
  "total_hops": 5
}
```

### 7.3 CSV Output (--format csv)

```csv
ttl,ip,hostname,loss_pct,sent,received,rtt_last,rtt_avg,rtt_min,rtt_max,rtt_stddev
1,10.0.0.1,gateway.local,0.0,10,10,1.2,1.1,0.8,1.5,0.2
2,172.16.0.1,,0.0,10,10,5.3,5.1,4.8,5.8,0.3
3,203.0.113.1,,10.0,10,9,12.1,11.8,10.2,14.3,1.2
4,198.51.100.1,,0.0,10,10,15.7,15.4,14.1,17.2,0.9
5,192.168.1.1,,0.0,10,10,18.2,17.9,16.5,20.1,1.1
```

---

## 8. Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Objectives:**
- Basic incremental TTL probing
- ICMP Time Exceeded response capture
- Simple hop discovery

**Deliverables:**
1. `mtr_mode.h` - Data structures
2. `mtr_mode.c` - Basic session management
3. Modifications to `getconfig.c` for `-M mtr` flag
4. Single-round path discovery (no statistics yet)

**Testing:**
- Verify TTL increment (1, 2, 3...)
- Confirm ICMP Time Exceeded capture
- Validate path discovery to target

### Phase 2: Statistics (Week 3-4)

**Objectives:**
- Per-hop RTT measurement
- Loss calculation
- Statistics accumulation

**Deliverables:**
1. `mtr_stats.c` - Statistics calculation
2. Enhanced `report.c` for MTR output
3. RTT tracking in hop structures

**Testing:**
- Verify RTT accuracy (compare with ping)
- Validate loss percentage calculation
- Test statistics over multiple probes

### Phase 3: Probe Management (Week 5-6)

**Objectives:**
- Multiple probes per hop
- Probe timeout handling
- Outstanding probe tracking

**Deliverables:**
1. `mtr_probe.c` - Probe tracking
2. Timeout detection and handling
3. Configurable probes-per-hop

**Testing:**
- Test with high packet loss paths
- Verify timeout detection
- Validate probe matching

### Phase 4: Continuous Mode (Week 7-8)

**Objectives:**
- Real-time continuous monitoring
- Round-based statistics updates
- Interactive display

**Deliverables:**
1. Continuous monitoring loop
2. Round tracking
3. Real-time display updates

**Testing:**
- Long-running stability test
- Memory leak verification
- Display refresh accuracy

### Phase 5: Protocol Options (Week 9-10)

**Objectives:**
- UDP probe support
- ICMP probe support
- Protocol-specific handling

**Deliverables:**
1. UDP probe creation
2. ICMP Echo probe creation
3. Protocol-specific response handling

**Testing:**
- Compare TCP vs UDP vs ICMP paths
- Validate each protocol's accuracy
- Test with firewalled paths

### Phase 6: Polish & Integration (Week 11-12)

**Objectives:**
- JSON/CSV output formats
- Integration testing
- Documentation
- Performance optimization

**Deliverables:**
1. Output format handlers
2. Integration test suite
3. Man page updates
4. Performance profiling

**Testing:**
- Full integration testing
- Performance benchmarks
- Documentation review

---

## 9. Risk Assessment

### 9.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ICMP rate limiting by firewalls | High | Medium | Add exponential backoff, alternative protocols |
| Asymmetric routing paths | Medium | Low | Document limitation, show as informational |
| High packet loss affecting accuracy | Medium | Medium | Increase probes-per-hop, confidence intervals |
| Timing accuracy on busy systems | Low | Medium | Use high-resolution timers, kernel timestamps |
| Memory growth in continuous mode | Low | High | Implement ring buffer, periodic stats reset |

### 9.2 Integration Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Conflicts with existing scan modes | Low | High | Thorough testing, clear mode separation |
| Performance impact on high-speed scans | Medium | Medium | Separate code paths, optional feature |
| Breaking existing functionality | Low | Critical | Comprehensive regression testing |

---

## 10. Testing Strategy

### 10.1 Unit Tests

```c
// Test cases for mtr_stats.c
void test_rtt_average_calculation(void);
void test_rtt_stddev_calculation(void);
void test_loss_percentage_calculation(void);
void test_hop_statistics_reset(void);

// Test cases for mtr_probe.c
void test_probe_creation_tcp(void);
void test_probe_creation_udp(void);
void test_probe_creation_icmp(void);
void test_probe_matching(void);
void test_probe_timeout_detection(void);

// Test cases for mtr_mode.c
void test_session_initialization(void);
void test_ttl_progression(void);
void test_round_completion(void);
void test_continuous_mode_reset(void);
```

### 10.2 Integration Tests

```bash
# Test basic path discovery
./unicornscan -M mtr 8.8.8.8:53

# Test with specific probe count
./unicornscan -M mtr --mtr-probes 5 8.8.8.8:53

# Test continuous mode (run for 60 seconds)
timeout 60 ./unicornscan -M mtr --mtr-continuous 8.8.8.8:53

# Test UDP mode
./unicornscan -M mtr --mtr-protocol udp 8.8.8.8:53

# Compare with system mtr
mtr -r -c 10 8.8.8.8
./unicornscan -M mtr --mtr-probes 10 8.8.8.8:53
```

### 10.3 Performance Benchmarks

- Measure memory usage over 1-hour continuous run
- Compare RTT accuracy with system ping
- Measure probe/response processing latency
- Evaluate CPU usage under high probe rates

---

## 11. Appendices

### A. ICMP Type Reference

```c
/* Relevant ICMP types for MTR mode */
#define ICMP_ECHOREPLY      0   /* Echo Reply */
#define ICMP_DEST_UNREACH   3   /* Destination Unreachable */
#define ICMP_ECHO           8   /* Echo Request */
#define ICMP_TIME_EXCEEDED  11  /* Time Exceeded */

/* ICMP Time Exceeded codes */
#define ICMP_EXC_TTL        0   /* TTL count exceeded */
#define ICMP_EXC_FRAGTIME   1   /* Fragment reassembly timeout */

/* ICMP Destination Unreachable codes */
#define ICMP_NET_UNREACH    0   /* Network Unreachable */
#define ICMP_HOST_UNREACH   1   /* Host Unreachable */
#define ICMP_PORT_UNREACH   3   /* Port Unreachable */
```

### B. Glossary

| Term | Definition |
|------|------------|
| TTL | Time To Live - IP header field decremented by each router |
| RTT | Round Trip Time - time from probe sent to response received |
| MTR | My Traceroute - combines traceroute and ping functionality |
| Hop | Single router in the network path |
| ICMP | Internet Control Message Protocol |
| Time Exceeded | ICMP message sent when TTL reaches zero |

### C. References

1. RFC 792 - Internet Control Message Protocol
2. RFC 1393 - Traceroute Using an IP Option
3. MTR Project - https://www.bitwizard.nl/mtr/
4. Unicornscan Documentation - existing codebase

---

## Document Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Author | System Architect | 2026-01-03 | Pending |
| Reviewer | Hive Mind Collective | | Pending |
| Approver | | | Pending |

---

*This document is subject to collective review and may be updated based on feedback from the Hive Mind.*
