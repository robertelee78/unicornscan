# Workunit Packet Count and Time Estimation Analysis

## Overview

This document analyzes how unicornscan calculates packet counts (`s->num_packets`), host counts (`s->num_hosts`), and time estimates (`s->num_secs`) during workunit generation. Understanding these calculations is critical for accurate progress reporting and time estimation.

---

## Key Data Structures

### Settings Structure (src/settings.h:122-125)
```c
typedef struct settings_s {
    double num_hosts;      /* Total number of hosts to scan */
    double num_packets;    /* Total number of packets to send */
    uint32_t num_secs;     /* Estimated time in seconds */
    uint32_t repeats;      /* Number of times to repeat each packet (line 155) */
    uint32_t pps;          /* Packets per second rate (line 198) */
    // ... other fields
} settings_t;
```

### Send Workunit Structure (src/scan_progs/workunits.h:44-73)
```c
typedef struct _PACKED_ send_workunit_t {
    uint32_t magic;
    uint32_t repeats;                    /* Number of times to send each packet */
    uint16_t send_opts;
    uint32_t pps;                        /* Packets per second for this workunit */
    uint8_t delay_type;
    struct sockaddr_storage myaddr;
    struct sockaddr_storage mymask;
    uint8_t hwaddr[THE_ONLY_SUPPORTED_HWADDR_LEN];
    uint16_t mtu;
    struct sockaddr_storage target;      /* Target network */
    struct sockaddr_storage targetmask;  /* Target netmask */
    uint8_t tos;
    uint8_t minttl;                      /* Minimum TTL */
    uint8_t maxttl;                      /* Maximum TTL */
    uint16_t ip_off;
    uint16_t fingerprint;
    int32_t src_port;
    uint8_t ipoptions[64];
    uint8_t ipoptions_len;
    uint16_t tcphdrflgs;
    uint8_t tcpoptions[64];
    uint8_t tcpoptions_len;
    uint16_t window_size;
    uint32_t syn_key;
    uint16_t port_str_len;              /* Length of port string (appended after struct) */
} send_workunit_t;
```

---

## Packet Count Calculation

### Location: workunit_add() in src/scan_progs/workunits.c:172-506

The function `workunit_add()` is responsible for calculating and accumulating packet counts. Here's the complete flow:

### Step 1: Parse Port String (lines 320-324)
```c
if (port_str != NULL && parse_pstr(port_str, &num_pkts) < 0) {
    snprintf(emsg, sizeof(emsg) -1, "port string `%s' rejected by parser", port_str);
    return -1;
}
```

**Function: parse_pstr() (src/scan_progs/portfunc.c:93-208)**

This function counts the total number of ports in a port specification:

```c
int parse_pstr(const char *input, uint32_t *total_ports) {
    // Special cases:
    // "a" or "A" -> "0-65535" (65536 ports)
    // "p" or "P" -> "1-1024" (1024 ports)

    // Parse comma-separated port specs:
    for (dtok=strtok_r(data, ",", &st1); dtok != NULL; dtok=strtok_r(NULL, ",", &st1)) {
        if (sscanf(dtok, "%u-%u", &low, &high) == 2) {
            // Range: "80-443"
            if (low > high) SWAP(low, high);
            num_ports += ((high + 1) - low);
        }
        else if (sscanf(dtok, "%u", &low) == 1) {
            // Single port: "80"
            num_ports++;
        }
    }

    *total_ports = num_ports;
    return 1;
}
```

**Examples:**
- `"80"` → 1 port
- `"80,443"` → 2 ports
- `"1-1024"` → 1024 ports
- `"80-90,443,8000-8010"` → (11 + 1 + 11) = 23 ports

### Step 2: Apply Repeats Multiplier (lines 326-328)
```c
if (s->repeats > 1) {
    num_pkts *= s->repeats;
}
```

If `--repeats N` option is used, multiply the port count by N.

**Example:**
- 100 ports × 3 repeats = 300 packets per host

### Step 3: Apply TTL Range Multiplier (lines 330-332)
```c
if (s->ss->minttl != s->ss->maxttl) {
    num_pkts *= (s->ss->maxttl - s->ss->minttl);
}
```

If scanning with varying TTL values (for traceroute-like functionality), multiply by the TTL range.

**Example:**
- 100 ports × (64 - 1) = 6300 packets per host (TTL 1-64)

### Step 4: Calculate Host Count (line 282)
```c
num_hosts = cidr_numhosts((const struct sockaddr *)&netid, (const struct sockaddr *)&mask);
```

This calculates the number of hosts in the target CIDR range.

**Examples:**
- `192.168.1.1/32` → 1 host
- `192.168.1.0/24` → 256 hosts
- `10.0.0.0/16` → 65536 hosts

### Step 5: Accumulate Total Packets (line 334)
```c
s->num_packets += (num_hosts * num_pkts);
```

Multiply packets per host by number of hosts and add to running total.

**Example:**
- 256 hosts × 100 ports = 25,600 total packets

### Step 6: Accumulate Total Hosts (line 288)
```c
s->num_hosts += num_hosts;
```

Add the number of hosts in this target to the running total.

---

## Time Estimation Calculation

### Location: workunit_add() in src/scan_progs/workunits.c:335

```c
s->num_secs += ((num_hosts * num_pkts) / pps) + s->ss->recv_timeout;
```

### Formula Breakdown

**Time = (Total Packets / PPS) + Receive Timeout**

Where:
- `Total Packets` = `num_hosts × num_pkts`
- `PPS` = packets per second rate (default 250, customizable)
- `Receive Timeout` = time to wait for responses after sending (default depends on mode)

### Components

1. **Send Time**: `(num_hosts × num_pkts) / pps`
   - Time to send all packets at the specified rate
   - Integer division (rounds down)

2. **Receive Timeout**: `s->ss->recv_timeout`
   - Additional time to wait for late responses
   - Ensures all replies are captured before scan completes

### Examples

**Example 1: Small scan**
- Target: `192.168.1.0/24` (256 hosts)
- Ports: `80,443` (2 ports)
- PPS: 250
- Repeats: 1
- Receive timeout: 5 seconds

Calculation:
```
Total packets = 256 hosts × 2 ports = 512 packets
Send time = 512 / 250 = 2 seconds
Total time = 2 + 5 = 7 seconds
```

**Example 2: Medium scan with repeats**
- Target: `10.0.0.0/22` (1024 hosts)
- Ports: `1-1024` (1024 ports)
- PPS: 1000
- Repeats: 2
- Receive timeout: 10 seconds

Calculation:
```
Ports per host = 1024 ports × 2 repeats = 2048 packets/host
Total packets = 1024 hosts × 2048 = 2,097,152 packets
Send time = 2,097,152 / 1000 = 2097 seconds (≈35 minutes)
Total time = 2097 + 10 = 2107 seconds (≈35 minutes, 7 seconds)
```

**Example 3: Large scan**
- Target: `10.0.0.0/16` (65536 hosts)
- Ports: `1-65535` (65535 ports)
- PPS: 10000
- Repeats: 1
- Receive timeout: 30 seconds

Calculation:
```
Total packets = 65536 hosts × 65535 ports = 4,294,836,480 packets
Send time = 4,294,836,480 / 10000 = 429,483 seconds (≈119 hours)
Total time = 429,483 + 30 = 429,513 seconds (≈119 hours)
```

---

## Multiple Target Accumulation

When multiple targets are specified, `workunit_add()` is called once per target, and the values accumulate:

```c
// First target: 192.168.1.0/24 ports 80,443
workunit_add("192.168.1.0/24:80,443", &estr);
// s->num_packets += 256 × 2 = 512
// s->num_secs += (512 / 250) + 5 = 7

// Second target: 10.0.1.0/24 ports 22,80,443
workunit_add("10.0.1.0/24:22,80,443", &estr);
// s->num_packets += 256 × 3 = 768 (total: 1280)
// s->num_secs += (768 / 250) + 5 = 8 (total: 15)
```

---

## Key Insights for Progress Tracking

### 1. Packet Count Formula
```
Total Packets = Σ(hosts_i × ports_i × repeats × ttl_range)
```

Where:
- `hosts_i` = number of hosts in target i
- `ports_i` = number of ports for target i
- `repeats` = global or per-target repeat count
- `ttl_range` = (maxttl - minttl) if different, else 1

### 2. Time Estimate Formula
```
Total Time = Σ((hosts_i × ports_i × repeats × ttl_range) / pps_i) + Σ(recv_timeout_i)
```

### 3. Progress Percentage
```
Progress % = (packets_sent / s->num_packets) × 100
```

### 4. Remaining Time Estimate
```
Remaining Time = ((s->num_packets - packets_sent) / current_pps) + recv_timeout
```

---

## Important Notes

### 1. Integer Division
The time calculation uses integer division, which truncates:
```c
s->num_secs += ((num_hosts * num_pkts) / pps) + s->ss->recv_timeout;
```

This means the estimate may be slightly low for small scans:
- 100 packets / 250 pps = 0 seconds (truncated from 0.4)
- 500 packets / 250 pps = 2 seconds (exactly)

### 2. Accumulation Across Targets
Values are cumulative across all `workunit_add()` calls:
- `s->num_hosts` keeps a running total
- `s->num_packets` keeps a running total
- `s->num_secs` keeps a running total

### 3. Per-Target PPS
Each target can specify its own PPS rate in the target string:
```
192.168.1.0/24:m500,80-443
```
Where `m500` sets PPS to 500 for this target.

### 4. Receive Timeout Impact
The receive timeout is added once per `workunit_add()` call. For multiple targets, this means:
```
Total time = send_time_1 + timeout_1 + send_time_2 + timeout_2 + ...
```

This can make the estimate appear high for many small targets.

### 5. ARP Mode (no ports)
For ARP scans (`-mA`), `port_str` is set to NULL:
```c
case MODE_ARPSCAN:
    port_str = NULL;
    break;
```

In this case, `num_pkts` is 0, and the calculation becomes:
```c
// parse_pstr() is skipped when port_str is NULL
// num_pkts remains 0
// After repeats: num_pkts = 0 × repeats = 0
// This is WRONG for ARP mode!
```

**BUG IDENTIFIED**: ARP scans don't calculate packet counts correctly because they have no port string. The packet count should be equal to the number of hosts, not 0.

---

## Compound Mode Behavior

In compound mode (e.g., `-mA+T`), workunits are created for each phase separately:

1. **Phase 1 (ARP)**: `workunit_add()` called for each target with ARP parameters
2. **workunit_reinit()**: Clears workunits between phases
3. **Phase 2 (TCP)**: `workunit_add()` called for discovered hosts with TCP parameters

The packet count and time estimate from Phase 1 are lost when `workunit_reinit()` is called. **This means the initial estimate only covers the first phase.**

---

## Recommendations for Progress Tracking

### 1. Track Per-Phase Estimates
Store packet counts and time estimates for each phase before calling `workunit_reinit()`:
```c
struct phase_stats {
    double packets;
    double hosts;
    uint32_t secs;
};
phase_stats[num_phases];
```

### 2. Fix ARP Packet Count
For ARP mode, set `num_pkts = 1` since each host gets one ARP request:
```c
if (mode == MODE_ARPSCAN) {
    num_pkts = 1;  // One ARP packet per host
}
```

### 3. Use Floating Point for Time
Use floating point arithmetic to avoid truncation:
```c
s->num_secs += (double)((num_hosts * num_pkts) / pps) + s->ss->recv_timeout;
```

### 4. Track Actual PPS
Monitor actual packets sent per second and use it for remaining time estimation:
```c
actual_pps = packets_sent / elapsed_time;
remaining_time = (num_packets - packets_sent) / actual_pps;
```

---

## Code References

- **Packet count calculation**: src/scan_progs/workunits.c:320-334
- **Time estimation**: src/scan_progs/workunits.c:335
- **Port parsing**: src/scan_progs/portfunc.c:93-208
- **Host count calculation**: src/unilib/cidr.c (cidr_numhosts)
- **Settings structure**: src/settings.h:122-125
- **Send workunit structure**: src/scan_progs/workunits.h:44-73

---

## Summary

The packet count and time estimation system in unicornscan:

1. **Calculates packets per host** by parsing the port string
2. **Applies multipliers** for repeats and TTL ranges
3. **Multiplies by host count** from CIDR calculation
4. **Accumulates across targets** in global counters
5. **Estimates time** using simple formula: (packets / pps) + timeout

This calculation happens in `workunit_add()` and is reset between phases in compound mode, which means **the initial estimate only reflects the first phase** of a multi-phase scan.
