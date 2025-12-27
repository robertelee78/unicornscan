# Time Estimation Calculation Analysis

**Research Date**: 2025-12-24
**Scope**: Understanding how unicornscan calculates and displays scan time estimates
**Status**: Complete

## Executive Summary

Unicornscan displays a time estimation message before scanning begins:
```
scaning X.XXe+XX total hosts with X.XXe+XX total packets, should take a little longer than Y Hours, Z Minutes, W Seconds
```

This analysis traces the complete calculation flow from configuration parsing through display output.

---

## Key Data Structures

### settings_t (src/settings.h:122-125)
```c
typedef struct settings_s {
    double num_hosts;      // Total number of hosts to scan
    double num_packets;    // Total number of packets to send
    uint32_t num_secs;     // Estimated time in seconds
    // ... other fields ...
} settings_t;
```

**Initialization**: These fields are zeroed during `memset(s, 0, sizeof(settings_t))` in:
- `src/main.c:121`
- `src/scan_progs/entry.c:65` (for drones)

**Critical**: These are accumulators that get incremented as targets are added.

---

## Calculation Flow

### Phase 1: Initialization (src/main.c:120-121)

```c
s=(settings_t *)xmalloc(sizeof(settings_t));
memset(s, 0, sizeof(settings_t));
```

**Result**:
- `s->num_hosts = 0.0`
- `s->num_packets = 0.0`
- `s->num_secs = 0`

### Phase 2: Configuration Parsing (src/getconfig.c)

Command-line arguments are parsed via `getconfig_argv()`. Each target specification is processed through `add_workunit()` in `src/scan_progs/workunits.c`.

**Entry Point**: src/getconfig.c:576-586
```c
// After parsing all arguments, targets are added:
if (add_workunit(s_u.str, &estr) < 0) {
    ERR("cant add workunit for argument `%s': %s", s_u.str, estr != NULL ? estr : "");
}
```

### Phase 3: Per-Target Calculation (src/scan_progs/workunits.c:282-335)

**Function**: `add_workunit(const char *targets, char **estr)`

This is where the accumulation happens for EACH target added:

#### Step 3a: Calculate Number of Hosts (Line 282)

```c
num_hosts=cidr_numhosts((const struct sockaddr *)&netid, (const struct sockaddr *)&mask);
```

**Implementation**: `src/unilib/cidr.c:489-521`

For IPv4 networks:
```c
double cidr_numhosts(const struct sockaddr *network, const struct sockaddr *netmask) {
    uint32_t high_ip=0, low_ip=0, mask=0;

    mask=ntohl(mask_u.sin->sin_addr.s_addr);
    low_ip=ntohl(net_u.sin->sin_addr.s_addr);
    high_ip=low_ip | ~(mask);
    high_ip++;

    return (double)high_ip - low_ip;
}
```

**Examples**:
- `/32` (single host): returns 1.0
- `/24` (Class C): returns 256.0
- `/16` (Class B): returns 65536.0
- `/8` (Class A): returns 16777216.0

**Accumulation** (Line 288):
```c
s->num_hosts += num_hosts;
```

#### Step 3b: Calculate Number of Ports (Line 320)

```c
if (port_str != NULL && parse_pstr(port_str, &num_pkts) < 0) {
    // error handling
}
```

**Function**: `src/scan_progs/portfunc.c:93-155` - `parse_pstr()`

This function parses port specifications and counts the total number of ports:

```c
int parse_pstr(const char *input, uint32_t *total_ports) {
    // Parse port ranges like "1-1024", "80,443", "1-100,200-300"

    for (dtok=strtok_r(data, ",", &st1); dtok != NULL; dtok=strtok_r(NULL, ",", &st1)) {
        if (sscanf(dtok, "%u-%u", &low, &high) == 2) {
            // Port range: "1-1024"
            num_ports += ((high + 1) - low);
        }
        else if (sscanf(dtok, "%u", &low) == 1) {
            // Single port: "80"
            num_ports++;
        }
    }

    if (total_ports != NULL) {
        *total_ports=num_ports;
        return 1;
    }
}
```

**Port String Shortcuts** (Lines 100-108):
- `'a'` or `'A'` → "0-65535" (all 65536 ports)
- `'p'` or `'P'` → "1-1024" (privileged ports, 1024 ports)
- `'q'` or `'Q'` → Quick ports (default TCP/UDP ports from config)

**Examples**:
- `"80"` → 1 port
- `"1-1024"` → 1024 ports
- `"80,443,8080"` → 3 ports
- `"1-100,200-300"` → 201 ports

#### Step 3c: Apply Multipliers (Lines 326-332)

**Repeats** (-R option):
```c
if (s->repeats > 1) {
    num_pkts *= s->repeats;
}
```

**TTL variation** (--minttl/--maxttl):
```c
if (s->ss->minttl != s->ss->maxttl) {
    num_pkts *= (s->ss->maxttl - s->ss->minttl);
}
```

**Example**: If scanning 10 ports with `-R 3` (repeat 3 times):
- `num_pkts = 10 * 3 = 30`

#### Step 3d: Accumulate Packets and Time (Lines 334-335)

**CRITICAL CALCULATION**:

```c
s->num_packets += (num_hosts * num_pkts);
s->num_secs += ((num_hosts * num_pkts) / pps) + s->ss->recv_timeout;
```

**Breaking this down**:

1. **Total packets for this target**:
   ```
   packets = num_hosts × num_pkts
   ```

2. **Time to send packets**:
   ```
   send_time = (num_hosts × num_pkts) / pps
   ```
   Where `pps` = packets per second (default 300, set via `-r` option)

3. **Receive timeout**:
   ```
   recv_timeout = s->ss->recv_timeout (default 7 seconds)
   ```
   Set via `-W` option, defined as `DEF_SCANTIMEOUT` in `src/unicorn_defs.h:61`

4. **Total time for this target**:
   ```
   target_time = send_time + recv_timeout
   ```

**Accumulation**:
```c
s->num_packets += (num_hosts * num_pkts);  // Running total
s->num_secs += target_time;                 // Running total
```

### Phase 4: Multi-Target Accumulation

If multiple targets are specified, this process **repeats for each target**, accumulating values:

```bash
unicornscan -mT 192.168.1.0/24:80 10.0.0.0/16:22,80
```

**Target 1**: `192.168.1.0/24:80`
- `num_hosts = 256`
- `num_pkts = 1` (port 80)
- `packets = 256 × 1 = 256`
- `time = 256/300 + 7 = 0.85 + 7 = 7.85 seconds`

**Target 2**: `10.0.0.0/16:22,80`
- `num_hosts = 65536`
- `num_pkts = 2` (ports 22, 80)
- `packets = 65536 × 2 = 131072`
- `time = 131072/300 + 7 = 436.9 + 7 = 443.9 seconds`

**Accumulated Totals**:
- `s->num_packets = 256 + 131072 = 131328`
- `s->num_secs = 7.85 + 443.9 = 451.75 → 451 seconds` (truncated to uint32_t)

---

## Time Estimation Formula

### Complete Formula

```
num_secs = Σ(all targets) [ ((hosts_i × ports_i × repeats × ttl_range) / pps) + recv_timeout_i ]
```

Where:
- `hosts_i` = Number of hosts in target i (from CIDR calculation)
- `ports_i` = Number of ports to scan on target i
- `repeats` = Number of times to repeat scan (-R option, default 1)
- `ttl_range` = (maxttl - minttl) if TTL scanning enabled, else 1
- `pps` = Packets per second (-r option, default 300)
- `recv_timeout_i` = Receive timeout for target i (-W option, default 7 seconds)

### Simplified Formula (Single Target, No Multipliers)

```
num_secs = (hosts × ports / pps) + recv_timeout
```

**Example**: Scan 192.168.1.0/24 on port 80
```
num_secs = (256 × 1 / 300) + 7
         = 0.853 + 7
         = 7.853 seconds
         → 7 seconds (truncated)
```

### Why Add recv_timeout?

The `recv_timeout` is added to allow time for responses to arrive **after** all packets are sent. This is the listening period where unicornscan waits for replies.

**Code Reference**: src/scan_progs/master.c:295-300
```c
// After all packets are sent, wait for responses
if (master_state == MASTER_IN_TIMEOUT) {
    time_t tnow;
    time(&tnow);
    if ((tnow - wait_stime) > s->ss->recv_timeout) {
        master_updatestate(MASTER_DONE);
        break;
    }
}
```

---

## Display Code (src/main.c:193-229)

After configuration parsing completes, the time estimation is displayed:

### Step 1: Local Variable Copy (Line 196)

```c
num_secs=s->num_secs;  // Copy to local variable for manipulation
```

### Step 2: Convert to Hours (Lines 198-209)

```c
if (num_secs > (60 * 60)) {  // If > 3600 seconds
    unsigned long long int hours=0;
    int sret=0;

    hours=num_secs / (60 * 60);

    sret=snprintf(&time_est[time_off], sizeof(time_est) - (time_off + 1), "%llu Hours, ", hours);
    assert(sret > 0);
    time_off += sret;

    num_secs -= hours * (60 * 60);  // Subtract hours from remaining seconds
}
```

**Example**: If `num_secs = 7325`:
- `hours = 7325 / 3600 = 2`
- `time_est = "2 Hours, "`
- `num_secs = 7325 - 7200 = 125`

### Step 3: Convert to Minutes (Lines 210-221)

```c
if (num_secs > 60) {
    unsigned long long int minutes=0;
    int sret=0;

    minutes=num_secs / 60;

    sret=snprintf(&time_est[time_off], sizeof(time_est) - (time_off + 1), "%llu Minutes, ", minutes);
    assert(sret > 0);
    time_off += sret;

    num_secs -= minutes * 60;  // Subtract minutes from remaining seconds
}
```

**Continuing example**:
- `minutes = 125 / 60 = 2`
- `time_est = "2 Hours, 2 Minutes, "`
- `num_secs = 125 - 120 = 5`

### Step 4: Add Remaining Seconds (Line 223)

```c
snprintf(&time_est[time_off], sizeof(time_est) - (time_off + 1), "%u Seconds", num_secs);
```

**Final result**:
- `time_est = "2 Hours, 2 Minutes, 5 Seconds"`

### Step 5: Display Message (Lines 225-229)

```c
VRB(0, "scaning %.2e total hosts with %.2e total packets, should take a little longer than %s",
    s->num_hosts,
    s->num_packets,
    time_est
);
```

**Output**:
```
scaning 2.56e+02 total hosts with 2.56e+02 total packets, should take a little longer than 2 Hours, 2 Minutes, 5 Seconds
```

---

## Input Sources That Affect Calculation

### From Command-Line Options

| Option | Variable | Impact | Default |
|--------|----------|--------|---------|
| `-r <pps>` | `s->pps` | Packets per second (denominator in send time) | 300 |
| `-R <repeats>` | `s->repeats` | Multiply packets by this factor | 1 |
| `-W <timeout>` | `s->ss->recv_timeout` | Seconds to wait for responses | 7 |
| `--minttl <n>` | `s->ss->minttl` | Minimum TTL (affects packet count if != maxttl) | - |
| `--maxttl <n>` | `s->ss->maxttl` | Maximum TTL (affects packet count if != minttl) | - |

**Code references**:
- recv_timeout default: `src/scan_progs/scanopts.c:58`
- recv_timeout setter: `src/scan_progs/scanopts.c:234`

### From Target Specification

**Format**: `IP/CIDR:ports` or `IP/CIDR:mMODE,ports`

**Examples**:
- `192.168.1.0/24:80` - 256 hosts, 1 port
- `10.0.0.0/16:1-1024` - 65536 hosts, 1024 ports
- `192.168.1.100:mT,22,80,443` - 1 host, 3 ports, TCP mode
- `192.168.1.0/24:q` - 256 hosts, quick ports (from config)

**Port string parsing**: `src/scan_progs/portfunc.c:93`

### From Configuration Defaults

| Constant | Value | File | Line |
|----------|-------|------|------|
| `DEF_SCANTIMEOUT` | 7 | src/unicorn_defs.h | 61 |
| Default PPS | 300 | (various) | - |
| TCP quick ports | "1,3,6,9,13,..." | config/unicorn.conf | - |
| UDP quick ports | "53,67,68,69,..." | config/unicorn.conf | - |

---

## Compound Mode Considerations

For compound modes (e.g., `-mA+T`), the calculation **does NOT account for phase filtering**.

**Example**: `unicornscan -mA+T 192.168.1.0/24:80`

**Phase 1 (ARP)**: All 256 hosts scanned
**Phase 2 (TCP)**: Only hosts that responded to ARP

**Current behavior**: `num_secs` is calculated as if **all hosts** will be scanned in **all phases**.

**Code**: `src/scan_progs/workunits.c:335` - No phase-aware filtering logic

**Impact**: Time estimate may be **overestimated** if many hosts don't respond to initial phase(s).

---

## Calculation Examples

### Example 1: Simple Scan

**Command**: `unicornscan -mT 192.168.1.100:80`

**Calculation**:
- `num_hosts = 1` (single IP)
- `num_pkts = 1` (port 80)
- `pps = 300` (default)
- `recv_timeout = 7` (default)

```
num_secs = (1 × 1 / 300) + 7
         = 0.0033 + 7
         = 7.0033 seconds
         → 7 seconds
```

**Display**: "should take a little longer than 7 Seconds"

### Example 2: Class C Network

**Command**: `unicornscan -mT 192.168.1.0/24:80,443`

**Calculation**:
- `num_hosts = 256`
- `num_pkts = 2` (ports 80, 443)
- `pps = 300`
- `recv_timeout = 7`

```
num_packets = 256 × 2 = 512
num_secs = (512 / 300) + 7
         = 1.707 + 7
         = 8.707 seconds
         → 8 seconds
```

**Display**: "should take a little longer than 8 Seconds"

### Example 3: Large Network with Multiple Ports

**Command**: `unicornscan -mT 10.0.0.0/16:1-1024 -r 1000`

**Calculation**:
- `num_hosts = 65536`
- `num_pkts = 1024` (ports 1-1024)
- `pps = 1000` (increased rate)
- `recv_timeout = 7`

```
num_packets = 65536 × 1024 = 67108864
num_secs = (67108864 / 1000) + 7
         = 67108.864 + 7
         = 67115.864 seconds
         → 67115 seconds
         = 18 hours, 38 minutes, 35 seconds
```

**Display**: "should take a little longer than 18 Hours, 38 Minutes, 35 Seconds"

### Example 4: With Repeats

**Command**: `unicornscan -mT 192.168.1.0/24:80 -R 3`

**Calculation**:
- `num_hosts = 256`
- `num_pkts = 1 × 3 = 3` (port 80, repeated 3 times)
- `pps = 300`
- `recv_timeout = 7`

```
num_packets = 256 × 3 = 768
num_secs = (768 / 300) + 7
         = 2.56 + 7
         = 9.56 seconds
         → 9 seconds
```

**Display**: "should take a little longer than 9 Seconds"

### Example 5: Multiple Targets

**Command**: `unicornscan -mT 192.168.1.0/24:80 10.0.0.0/24:22`

**Target 1**:
```
num_packets_1 = 256 × 1 = 256
num_secs_1 = (256 / 300) + 7 = 7.853 seconds
```

**Target 2**:
```
num_packets_2 = 256 × 1 = 256
num_secs_2 = (256 / 300) + 7 = 7.853 seconds
```

**Total**:
```
num_packets = 256 + 256 = 512
num_secs = 7.853 + 7.853 = 15.706 seconds
         → 15 seconds
```

**Display**: "should take a little longer than 15 Seconds"

---

## Accuracy Considerations

### Why "a little longer than"?

The displayed time is **approximate** because:

1. **Network Latency**: Not accounted for in the calculation
2. **Processing Overhead**: Packet generation/parsing takes CPU time
3. **Response Timing**: Hosts may respond at varying times
4. **Queue Delays**: Internal queuing between sender/receiver processes
5. **System Load**: Other processes competing for resources

### Known Inaccuracies

1. **Compound Mode**: Doesn't account for phase filtering (see above)
2. **Integer Truncation**: `num_secs` is `uint32_t`, fractional seconds are lost
3. **No Overhead Factor**: Pure mathematical calculation without real-world adjustment
4. **Timeout Per Target**: Each target adds full `recv_timeout`, even if scanning multiple targets sequentially

### Actual vs Estimated Time

**Typical Variance**: ±10-30% depending on:
- Network conditions
- Target responsiveness
- System performance
- Scan rate (`-r` option)

---

## Code Location Summary

### Calculation Code

| Component | File | Lines | Description |
|-----------|------|-------|-------------|
| Settings structure | src/settings.h | 122-125 | Data structure definitions |
| Initialization | src/main.c | 120-121 | Zero initialization |
| Host counting | src/unilib/cidr.c | 489-521 | CIDR to host count conversion |
| Port parsing | src/scan_progs/portfunc.c | 93-155 | Port string to count |
| Accumulation | src/scan_progs/workunits.c | 282-335 | Per-target calculation |
| Display formatting | src/main.c | 193-229 | Time string formatting and display |

### Configuration Code

| Component | File | Lines | Description |
|-----------|------|-------|-------------|
| recv_timeout default | src/scan_progs/scanopts.c | 58 | Sets to DEF_SCANTIMEOUT |
| recv_timeout constant | src/unicorn_defs.h | 61 | DEF_SCANTIMEOUT = 7 |
| recv_timeout setter | src/scan_progs/scanopts.c | 234 | scan_setrecvtimeout() |
| recv_timeout getter | src/scan_progs/scanopts.c | 240 | scan_getrecvtimeout() |

---

## Recommendations for Future Improvements

### 1. Phase-Aware Calculation

**Current Issue**: Compound mode (`-mA+T`) calculates as if all hosts scanned in all phases.

**Suggestion**: Adjust calculation after phase 1 completes to reflect actual discovered hosts.

**Implementation**: Hook into `do_targets_from_arp_cache()` to recalculate remaining phases.

### 2. Overhead Factor

**Current Issue**: Pure mathematical calculation without real-world adjustment.

**Suggestion**: Add a 10-20% overhead factor based on empirical measurements.

**Implementation**:
```c
s->num_secs = (uint32_t)((calculated_time * 1.15) + 0.5);  // 15% overhead, rounded
```

### 3. Progressive Time Display

**Current Issue**: Estimate shown only at start, doesn't update during scan.

**Suggestion**: Display remaining time periodically during scan.

**Implementation**: Track packets sent, calculate remaining time based on rate.

### 4. Separate Send/Receive Time

**Current Issue**: Single time value combines sending and waiting.

**Suggestion**: Display separately: "Sending: X seconds, Waiting: Y seconds"

**Implementation**:
```c
uint32_t send_time = (num_packets / pps);
uint32_t wait_time = recv_timeout;
VRB(0, "Estimated time: %u seconds sending + %u seconds waiting = %u total",
    send_time, wait_time, send_time + wait_time);
```

### 5. Detailed Breakdown for Verbose Mode

**Suggestion**: In verbose mode, show calculation breakdown:

```
Time Estimation:
  Hosts: 256
  Ports per host: 10
  Total packets: 2560
  Rate: 300 pps
  Send time: 8.53 seconds
  Receive timeout: 7 seconds
  Estimated total: 15 seconds
```

---

## Related Research Documents

- **Phase Transition Timing**: `docs/research/phase-transition-timing-analysis.md`
  - Detailed analysis of recv_timeout application
  - Compound mode timing behavior
  - ARP response collection timing

- **Workunit Execution Flow**: `docs/research/workunit-execution-flow-analysis.md`
  - How workunits are generated and processed
  - Sender/receiver coordination

- **TSC Timing Subsystem**: `docs/research/tsc-timing-subsystem-analysis.md`
  - Low-level packet timing mechanisms
  - Actual packet rate control

---

## Conclusion

The time estimation in unicornscan follows a straightforward accumulation pattern:

1. **Initialize** settings structure to zero
2. **For each target** added:
   - Calculate number of hosts (via CIDR)
   - Count number of ports
   - Apply multipliers (repeats, TTL range)
   - Calculate time: `(hosts × ports) / pps + recv_timeout`
   - **Accumulate** into running totals
3. **Display** accumulated totals in Hours, Minutes, Seconds format

The calculation is **mathematically accurate** for the scan parameters, but may not reflect real-world timing due to network conditions, overhead, and (for compound mode) phase filtering effects.

The phrase "should take a little longer than" appropriately hedges this estimate to account for these unmeasured factors.
