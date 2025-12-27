# Unicornscan -R (Repeats) Option Analysis

## Executive Summary

The `-R` option in unicornscan controls **per-workunit packet repetition**, not phase repetition. In compound mode (`-mA+T`), `-R2` will cause the ARP packets to be sent twice, but the ARP **phase itself** only executes once. The repeats counter is embedded in each workunit and controls nested loop iteration within the sender process.

## Key Findings

### 1. Where Repeats is Handled

#### Command-Line Option Parsing
- **File**: `src/scan_progs/options.c`
- **Function**: `scan_setrepeats(int repeats)` (line 605)
- **Default**: `s->repeats = 1` (line 40)

```c
int scan_setrepeats(int repeats) {
    if (repeats < 1) {
        ERR("scan repeats is less than one");
        return -1;
    }
    s->repeats = (uint32_t)repeats;
    return 1;
}
```

#### Workunit Creation
- **File**: `src/scan_progs/workunits.c`
- **Function**: `workunit_add()` (line 461)
- **Action**: Copies `s->repeats` into each send_workunit_t

```c
sw_u.s->repeats = s->repeats;
```

The repeats value is **embedded in each workunit structure** when workunits are created.

#### Packet Sending Logic
- **File**: `src/scan_progs/send_packet.c`
- **Function**: `send_main()` (lines 453, 581-587)
- **Mechanism**: Creates nested loop structure

```c
/* repeats */
fnew.init = &init_nextround;
fnew.c_t = CTVOID;
fnew.c_u.cmp = &cmp_nextround;
fnew.inc = &inc_nextround;
fnew.next = NULL;
add_loop_logic((const fl_t *)&fnew);
```

### 2. How Repeats Works: Nested Loop Structure

The `send_packet.c` module implements a **dynamic nested loop system** using a linked list of loop controllers:

```
for (round = 0; round < s->repeats; round++) {          // ← Outermost loop (REPEATS)
    for (port in port_list) {                           // ← Port iteration
        for (ttl = minttl; ttl <= maxttl; ttl++) {      // ← TTL iteration
            for (payload in payload_list) {             // ← Payload iteration (UDP only)
                for (host in target_range) {            // ← Host iteration
                    _send_packet();                     // ← Actual packet send
                }
            }
        }
    }
}
```

#### Loop Order (Outermost to Innermost)
1. **Repeats** (curround: 0 to s->repeats-1)
2. **Ports** (for TCP/UDP modes)
3. **TTL** (for TCP/UDP modes)
4. **Payload** (for UDP mode only)
5. **Hosts** (target IP range)

This means `-R2` sends **each packet** twice before moving to the next packet specification.

### 3. Current Behavior for Compound Mode

#### Phase Execution Flow
From `src/main.c` (lines 306-346):

```c
for (s->cur_iter = 1; s->cur_iter < (s->scan_iter + 1); s->cur_iter++) {
    int num_phases_to_run = (s->num_phases > 1) ? s->num_phases : 1;

    for (s->cur_phase = 0; s->cur_phase < num_phases_to_run; s->cur_phase++) {
        if (s->num_phases > 1) {
            if (load_phase_settings(s->cur_phase) != 1) {
                terminate("failed to load phase %d settings", s->cur_phase + 1);
            }

            if (s->cur_phase > 0) {
                workunit_reinit();
                master_reset_phase_state();
                do_targets_from_arp_cache();  // Phase 2+ use ARP results
            }
        }

        workunit_reset();
        run_scan();  // ← Executes sender/listener with workunits
    }
}
```

#### For `-mA+T -R2`

**Current Behavior:**
```
Iteration 1:
  Phase 1 (ARP):
    for round 1..2:      ← Repeats happens HERE (inside sender)
      Send ARP for host1
      Send ARP for host1 (repeat)
      Send ARP for host2
      Send ARP for host2 (repeat)
      ...
    Wait for ARP replies

  Phase 2 (TCP):
    for round 1..2:      ← Repeats happens HERE too
      for port in port_list:
        Send TCP SYN to host1:port (repeat twice)
        Send TCP SYN to host2:port (repeat twice)
        ...
```

**Key Observation:** Each phase runs **once**, but within that phase execution, the sender's nested loop structure causes packets to be sent `s->repeats` times.

### 4. Does -R Repeat All Phases or Just Workunit Iteration?

**Answer:** `-R` repeats **workunit packet iteration**, NOT phases.

The outer phase loop in `main.c` is controlled by:
- `s->num_phases`: Number of phases (set at parse time, e.g., 2 for `-mA+T`)
- `s->cur_phase`: Current phase index (0-indexed)

There is **no connection** between the outer phase loop and `s->repeats`. The repeats counter only affects the nested loops inside `send_packet.c:loop_list()`.

### 5. For `-mA+T -R2`: Would -R2 Repeat the ARP Phase Twice?

**Answer:** No.

`-R2` causes the ARP **packets** to be sent twice (round 0, round 1), but the ARP **phase** itself executes only once (when `s->cur_phase == 0`).

#### Example Execution Timeline

```
unicornscan -mA+T -R2 192.168.1.0/24 -p1-100

Phase Loop:
  s->cur_phase = 0 (ARP phase):
    load_phase_settings(0) → MODE_ARPSCAN
    Sender creates loop structure:
      - Repeats: 0..1 (2 iterations)
      - Hosts: 192.168.1.1..192.168.1.254

    Execution:
      round 0:
        ARP who-has 192.168.1.1
        ARP who-has 192.168.1.2
        ...
        ARP who-has 192.168.1.254

      round 1: (REPEAT)
        ARP who-has 192.168.1.1
        ARP who-has 192.168.1.2
        ...
        ARP who-has 192.168.1.254

    Listener collects ARP replies → ARP cache populated

  s->cur_phase = 1 (TCP phase):
    load_phase_settings(1) → MODE_TCPSCAN
    do_targets_from_arp_cache() → Create workunits only for hosts that replied
    Sender creates loop structure:
      - Repeats: 0..1 (2 iterations)
      - Ports: 1..100
      - Hosts: (only those from ARP cache)

    Execution:
      round 0:
        for each port 1..100:
          TCP SYN to 192.168.1.5:port  (if 192.168.1.5 replied to ARP)
          TCP SYN to 192.168.1.10:port (if 192.168.1.10 replied to ARP)
          ...

      round 1: (REPEAT)
        (same as round 0)

End of scan.
```

## Architecture: How It All Fits Together

### Global Settings Structure
```c
// src/settings.h (line 122)
typedef struct settings_s {
    uint32_t repeats;           // Line 155: -R option value

    int scan_iter;              // Line 146: Distinct scan iterations (for pcap filters)
    int cur_iter;               // Line 147: Current iteration

    SCANPHASE *phases;          // Line 150: Array of phases (compound mode)
    uint8_t num_phases;         // Line 151: Count of phases
    uint8_t cur_phase;          // Line 152: Current phase (0-indexed)
} settings_t;
```

### Workunit Structure
```c
// src/scan_progs/workunits.h (line 44)
typedef struct send_workunit_t {
    uint32_t magic;
    uint32_t repeats;           // ← Copied from s->repeats at workunit creation
    uint16_t send_opts;
    uint32_t pps;
    // ... rest of workunit data
} send_workunit_t;
```

### Sender State
```c
// src/scan_progs/send_packet.c (line 85)
static struct {
    uint32_t curround;          // Line 86: Current repeat iteration (0 to repeats-1)
    struct sockaddr_storage curhost;
    int32_t curport;
    uint8_t curttl;
    // ... other state
} sl;
```

## What Changes Would Be Needed for Per-Phase Repeats?

If you wanted `-R2` to **repeat the entire ARP phase twice** (not just ARP packets):

### Option 1: Outer Phase Repeat Loop

Modify `src/main.c`:

```c
// Add outer repeat loop around phase loop
for (phase_repeat = 0; phase_repeat < s->repeats; phase_repeat++) {
    for (s->cur_phase = 0; s->cur_phase < num_phases_to_run; s->cur_phase++) {
        // existing phase logic
        run_scan();
    }
}
```

**Problem:** This would repeat **all phases** s->repeats times, not just ARP.

### Option 2: Per-Phase Repeat Configuration

Add phase-specific repeat counts:

```c
typedef struct scan_phase_t {
    uint32_t mode;
    uint16_t tcphdrflgs;
    uint16_t send_opts;
    uint32_t phase_repeats;  // ← New field
} scan_phase_t;
```

Then in `main.c`:

```c
for (s->cur_phase = 0; s->cur_phase < num_phases_to_run; s->cur_phase++) {
    for (phase_rep = 0; phase_rep < s->phases[s->cur_phase].phase_repeats; phase_rep++) {
        // existing phase logic
        run_scan();
    }
}
```

### Option 3: New CLI Option (-RA for ARP repeats)

Add new option:
- `-R <n>`: Packet-level repeats (existing behavior)
- `-RA <n>`: ARP phase repeats (new)

This would require:
1. New parser for `-RA` option
2. Store `arp_phase_repeats` in settings
3. Conditional loop in phase execution for ARP mode

## Recommendations

### For the Current Issue (ARP Discovery Reliability)

**Do NOT use phase-level repeats.** Instead:

1. **Packet-level repeats already work:** `-R2` or `-R3` will send each ARP request multiple times with proper timing delays
2. **This is the correct approach:** Network reliability issues are best solved by packet-level redundancy with delays
3. **Phase repetition is wasteful:** Repeating the entire phase would re-ARP hosts that already responded

### Better Solutions for ARP Reliability

1. **Use existing `-R` option:** `unicornscan -mA+T -R3 -p1-100 192.168.1.0/24`
   - Sends each ARP request 3 times
   - Delays between repeats (controlled by pps)
   - Increases chance of catching hosts in different power states

2. **Adjust PPS for slower networks:** `-R2 --pps 50`
   - More time between ARP requests
   - Allows switches to process requests

3. **Add inter-repeat delay (if needed):**
   - Could add small sleep between `round` increments in `send_packet.c`
   - Example: 100ms between repeat rounds

## Conclusion

The `-R` (repeats) option in unicornscan:

1. ✅ **Works at the packet level** (nested loop inside sender)
2. ✅ **Applies to all scan modes** (ARP, TCP, UDP)
3. ✅ **Does NOT repeat phases** in compound mode
4. ✅ **Is embedded in workunits** at creation time
5. ✅ **Already provides ARP redundancy** when used with `-mA+T`

For compound mode `-mA+T -R2`:
- ARP packets sent **2 times each** (round 0, round 1)
- ARP phase executes **1 time** (phase 0)
- TCP packets sent **2 times each** (round 0, round 1)
- TCP phase executes **1 time** (phase 1)

**No changes needed** to make repeats work with compound mode — it already works correctly at the packet level, which is the appropriate granularity for reliability.
