# TSC Timing Subsystem Analysis

## Overview

This document analyzes Jack Louis's original TSC (Time Stamp Counter) timing subsystem in unicornscan, designed in 2004-2006 for high-precision packet rate limiting.

## Original Design Philosophy

### The Problem

Network scanning requires precise control over packet transmission rate (packets per second). Too fast overwhelms the network or triggers IDS; too slow wastes time. Jack needed sub-millisecond timing precision for rates >300 pps.

### Three-Tier Timing System

Jack implemented three timing mechanisms based on required precision:

| Rate (pps) | Mechanism | File | Precision | CPU Usage |
|------------|-----------|------|-----------|-----------|
| >300 | TSC | `src/unilib/tsc.c` | Nanoseconds | High (busy-wait) |
| 50-300 | GTOD | `src/unilib/gtod.c` | Microseconds | Medium (busy-wait) |
| <50 | SLEEP | `src/unilib/sleep.c` | Milliseconds | Low (nanosleep) |

Selection logic in `src/unilib/xdelay.c:delay_getdef()`:
```c
if (pps < 50) return XDELAY_SLEEP;
else if (pps > 50 && pps < 300) return XDELAY_GTOD;
if (tsc_supported()) return XDELAY_TSC;
return XDELAY_GTOD;
```

## The Time-Slot Model

### Concept

Each packet is allocated a fixed "time slot". The slot includes all work (building packet, sending it) plus any remaining wait time.

```
|<---------- tsc_delay cycles ----------->|
|                                          |
| start_tslot |  [packet work]  | end_tslot |
|     ↓       |                 |     ↓     |
|  record TSC |  build & send   | busy-wait |
|  in s_time  |  (~10K cycles)  | until     |
|             |                 | current - |
|             |                 | s_time >= |
|             |                 | tsc_delay |
```

For 1000 pps at 2.8 GHz:
- Slot duration: 1/1000 second = 1ms
- In cycles: 2,800,000 cycles per packet
- Packet work: ~10,000 cycles
- Wait time: ~2,790,000 cycles

### Implementation Flow

1. **Calibration** (`tsc_init_tslot`):
   - Sleep 100ms using nanosleep
   - Measure TSC before and after
   - Calculate: `cps = (end - start) * 10`
   - Calculate: `tsc_delay = cps / pps`

2. **Packet Loop** (in `_send_packet()`):
   ```c
   start_tslot();      // Record slot start
   // ... build packet ...
   // ... send packet ...
   end_tslot();        // Wait for remaining time
   ```

3. **Rate Verification**:
   After workunit completes, actual pps calculated using wall-clock time:
   ```c
   tt = total_time.tv_sec + (total_time.tv_usec / 1000000.0);
   pps = packets_sent / tt;
   ```

## TSC Implementation Details

### The get_tsc() Function

**Original (2004, 32-bit)**:
```c
inline tsc_t get_tsc(void) {
    tsc_t j;
    asm volatile ("pause\n" "nop\n" "rdtsc" : "=A" (j));
    return j;
}
```

**Modernized (2024, x86_64 compatible)**:
```c
static inline tsc_t get_tsc(void) {
    uint32_t lo, hi;
    asm volatile ("pause\n" "nop\n" "rdtsc" : "=a" (lo), "=d" (hi));
    return ((tsc_t)hi << 32) | lo;
}
```

The `"=A"` constraint works on 32-bit x86 (combines EDX:EAX) but not on x86_64 where it has different semantics.

### Why `pause; nop; rdtsc`?

1. **`pause`**: Hints to CPU this is a spin-wait loop
   - Reduces power consumption
   - Prevents memory ordering violations
   - 2004: ~10 cycles on Pentium 4
   - 2016+: ~140 cycles on Skylake+

2. **`nop`**: Likely for alignment or as a spacer

3. **`rdtsc`**: Read Time Stamp Counter into EDX:EAX

### Calibration Code

```c
void tsc_init_tslot(uint32_t pps) {
    tsc_t start=0, end=0, cps=0;
    struct timespec s_time, rem;

    rem.tv_sec=0; rem.tv_nsec=0;
    s_time.tv_sec=0; s_time.tv_nsec=100000001;  // 100ms + 1ns

    start=get_tsc();

    do {
        if (nanosleep(&s_time, &rem) != -1) break;
    } while (rem.tv_sec != 0 && rem.tv_nsec != 0);  // BUG: should be ||

    end=get_tsc();

    cps=(end - start) * 10;      // Cycles per second
    tsc_delay=(cps / pps);       // Cycles per packet
}
```

### Busy-Wait Loop

```c
void tsc_end_tslot(void) {
    while (1) {
        if ((get_tsc() - tsc_s_time) >= tsc_delay) {
            break;
        }
    }
    tsc_s_time=0;
}
```

## Known Issues

### 1. Nanosleep Loop Bug

```c
while (rem.tv_sec != 0 && rem.tv_nsec != 0);  // BUG
```

Should be `||` not `&&`. If interrupted with only nanoseconds remaining:
- `rem.tv_sec = 0, rem.tv_nsec = 50000000`
- Condition: `0 != 0 && 50M != 0` = `false && true` = `false`
- Loop exits early!

**Impact**: Would cause FASTER timing (fewer cycles measured), not slower.

### 2. No Serialization

Modern out-of-order CPUs can reorder `rdtsc` relative to surrounding instructions. Intel recommends:
- `lfence; rdtsc` for timing measurements
- Or use `rdtscp` (includes implicit fence and CPU ID)

### 3. No Diagnostic Output

No DBG() calls in calibration code, making debugging difficult:
- Can't see start/end TSC values
- Can't see calculated cps or tsc_delay
- Can't compare to expected values

### 4. Pause Instruction Latency Change

| Era | CPU | Pause Latency |
|-----|-----|---------------|
| 2004 | Pentium 4 | ~10 cycles |
| 2008 | Nehalem | ~10 cycles |
| 2016 | Skylake | ~140 cycles |
| 2019+ | Ice Lake | ~140 cycles |

This doesn't affect timing accuracy (we measure elapsed cycles, not iterations), but does affect CPU efficiency.

## Modern Considerations (2025)

### CPU Features to Check

```bash
grep -E "constant_tsc|nonstop_tsc|tsc_reliable|rdtscp" /proc/cpuinfo
```

- **constant_tsc**: TSC runs at constant rate regardless of frequency scaling
- **nonstop_tsc**: TSC continues in deep sleep states
- **tsc_reliable**: Kernel trusts TSC for timekeeping
- **rdtscp**: Serialized rdtsc with CPU ID available

### Modern Alternatives

| Method | Overhead | Resolution | Portability |
|--------|----------|------------|-------------|
| rdtsc | ~17ns | Sub-nanosecond | x86 only |
| rdtscp | ~25ns | Sub-nanosecond | x86 only, serialized |
| clock_gettime(MONOTONIC) | ~20ns | Nanosecond | Portable, VDSO |
| clock_gettime(MONOTONIC_RAW) | ~20ns | Nanosecond | Not NTP-adjusted |

**Key insight**: `clock_gettime(CLOCK_MONOTONIC)` is now implemented in VDSO on Linux, requiring no syscall. Overhead is only ~13% more than raw rdtsc.

### Hybrid CPU Considerations

Intel 12th gen+ CPUs have P-cores (performance) and E-cores (efficiency). While Intel claims invariant TSC works across all cores, there may be edge cases with:
- Different TSC rates between core types (unlikely but possible)
- Scheduler moving process between core types
- Calibration on one core type, execution on another

## Recommendations for Modernization

### Option 1: Minimal Fix

1. Fix nanosleep loop: `&&` → `||`
2. Add `lfence` before `rdtsc` for serialization
3. Add diagnostic output for calibration values

### Option 2: Use clock_gettime

Replace TSC with `clock_gettime(CLOCK_MONOTONIC)`:
- Portable across architectures
- VDSO-accelerated on Linux (no syscall)
- Handles CPU migration transparently
- Similar overhead (~20ns vs ~17ns)

### Option 3: Hybrid Approach

1. Use `rdtscp` for timing (serialized, includes CPU ID)
2. Detect CPU migration and re-calibrate if needed
3. Fall back to clock_gettime on non-x86

## File References

- `src/unilib/tsc.c` - TSC timing implementation
- `src/unilib/gtod.c` - gettimeofday timing
- `src/unilib/sleep.c` - nanosleep timing
- `src/unilib/xdelay.c` - Delay type selection and dispatch
- `src/scan_progs/send_packet.c:516` - Where init_tslot() is called
- `src/scan_progs/send_packet.c:671,977` - start_tslot()/end_tslot() usage

## References

- [Measuring Latency in Linux](http://btorpey.github.io/blog/2014/02/18/clock-sources-in-linux/)
- [Time Stamp Counter - Wikipedia](https://en.wikipedia.org/wiki/Time_Stamp_Counter)
- [Pitfalls of TSC usage](http://oliveryang.net/2015/09/pitfalls-of-TSC-usage/)
- [Time, but Faster - ACM Queue](https://queue.acm.org/detail.cfm?id=3036398)
- Intel SDM Vol. 3B, Chapter 17 - Time-Stamp Counter
