# Timing Subsystem Modernization Recommendations

## Executive Summary

Based on comprehensive diagnostics, the system hardware and TSC mechanism work correctly. The reported 4x slowdown (250 pps vs 1000 pps) in unicornscan is **not** a fundamental TSC or system limitation.

### Baseline Results

| Test | Result |
|------|--------|
| Maximum unlimited packet rate | 178,902 pps |
| TSC rate-limited accuracy | 99.8%+ at all rates |
| clock_gettime accuracy | 99.8-100% at all rates |
| TSC calibration | 2.81 GHz (correct) |
| nanosleep accuracy | 100.193 ms for 100ms (0.2% error) |

## Recommended Approach for 2025

### Option A: Modernize with clock_gettime (Recommended)

Replace TSC-based timing with `clock_gettime(CLOCK_MONOTONIC)`:

**Advantages:**
- No calibration phase needed
- Portable across architectures (x86, ARM, etc.)
- Handles CPU frequency scaling transparently
- Handles CPU core migration automatically
- VDSO-accelerated on Linux (no syscall overhead)
- Tested to achieve 100% accuracy at 1000 pps

**Implementation:**
```c
#include <time.h>
#include <stdint.h>

static uint64_t ns_delay = 0;
static uint64_t slot_start = 0;

static inline uint64_t get_ns(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000000000ULL + ts.tv_nsec;
}

void modern_init_tslot(uint32_t pps) {
    ns_delay = 1000000000ULL / pps;  // nanoseconds per packet
}

void modern_start_tslot(void) {
    slot_start = get_ns();
}

void modern_end_tslot(void) {
    while ((get_ns() - slot_start) < ns_delay) {
        // Busy wait - could add pause hint for power efficiency
        __asm__ volatile("pause");
    }
}
```

### Option B: Fix and Enhance TSC (Alternative)

Keep TSC but add improvements:

1. **Add lfence for serialization:**
```c
static inline uint64_t get_tsc(void) {
    uint32_t lo, hi;
    asm volatile ("lfence\nrdtsc" : "=a" (lo), "=d" (hi));
    return ((uint64_t)hi << 32) | lo;
}
```

2. **Fix nanosleep loop bug:**
```c
// Change && to || in calibration
while (rem.tv_sec != 0 || rem.tv_nsec != 0);
```

3. **Add diagnostic output:**
```c
void tsc_init_tslot(uint32_t pps) {
    // ... calibration code ...
    DBG(M_TSC, "TSC calibration: %.2f GHz, delay=%lu cycles for %u pps",
        cps/1e9, tsc_delay, pps);
}
```

### Option C: Hybrid Approach

Use TSC for high rates (>1000 pps), clock_gettime for lower rates:

```c
void init_tslot(uint32_t pps, uint8_t delay_type) {
    if (delay_type == XDELAY_TSC && tsc_supported() && pps > 1000) {
        use_tsc_timing(pps);
    } else {
        use_clockgettime_timing(pps);
    }
}
```

## Recommended Changes to xdelay.c

```c
// New delay type for modern timing
#define XDELAY_CLOCK 4  // clock_gettime(CLOCK_MONOTONIC)

int delay_getdef(uint32_t pps) {
    // Prefer clock_gettime for all rates - proven 99.8%+ accurate
    return XDELAY_CLOCK;

    // Or use traditional logic:
    // if (pps < 50) return XDELAY_SLEEP;
    // else if (pps < 300) return XDELAY_GTOD;
    // else return XDELAY_TSC;
}
```

## New File: src/unilib/clocktime.c

```c
/**
 * clocktime.c - Modern clock_gettime-based timing for rate limiting
 */
#include <config.h>
#include <time.h>
#include <stdint.h>
#include <settings.h>
#include <unilib/xdelay.h>
#include <unilib/output.h>

static uint64_t clock_delay = 0;  // nanoseconds per packet
static uint64_t clock_s_time = 0; // slot start time

static inline uint64_t get_clock_ns(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000000000ULL + ts.tv_nsec;
}

int clock_supported(void) {
    struct timespec ts;
    return (clock_gettime(CLOCK_MONOTONIC, &ts) == 0);
}

void clock_init_tslot(uint32_t pps) {
    clock_delay = 1000000000ULL / pps;
    DBG(M_TSC, "clock_gettime timing: delay=%lu ns for %u pps", clock_delay, pps);
}

void clock_start_tslot(void) {
    clock_s_time = get_clock_ns();
}

void clock_end_tslot(void) {
    uint64_t now;
    while (1) {
        now = get_clock_ns();
        if ((now - clock_s_time) >= clock_delay) {
            break;
        }
        // Power-efficient pause in spin loop
        __asm__ volatile("pause");
    }
    clock_s_time = 0;
}
```

## Testing Checklist

Before deploying any changes:

1. [ ] Run TSC calibration test on target system
2. [ ] Verify `constant_tsc` and `nonstop_tsc` flags present
3. [ ] Test rate accuracy at 100, 1000, 5000, 10000 pps
4. [ ] Compare with existing unicornscan behavior
5. [ ] Test on WiFi and Ethernet interfaces
6. [ ] Verify no regression in scan results

## Debugging the 4x Slowdown

To diagnose the reported 250 pps issue, add this debug output:

```c
// In tsc_init_tslot():
fprintf(stderr, "DEBUG TSC: start=%lu end=%lu diff=%lu cps=%lu delay=%lu pps=%u\n",
        start, end, end-start, cps, tsc_delay, pps);

// In send_packet.c after init_tslot():
fprintf(stderr, "DEBUG: initialized timing for %u pps using %s\n",
        s->pps, delay_getname(s->delay_type_exp));
```

Then run unicornscan and compare calibration values with the standalone test.

## Conclusion

The system is capable of 179K+ pps. Both TSC and clock_gettime achieve 99.8%+ accuracy. The 4x slowdown issue is likely in unicornscan's specific implementation, not the timing mechanism itself.

Recommended action: Implement Option A (clock_gettime) for maximum portability and reliability, while keeping TSC as a fallback for specialized use cases.
