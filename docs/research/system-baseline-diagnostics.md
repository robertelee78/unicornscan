# System Baseline Diagnostics for Packet Rate Testing

## Test System

```
CPU: 12th Gen Intel(R) Core(TM) i7-12800H (Alder Lake, hybrid P+E cores)
TSC Flags: constant_tsc, nonstop_tsc, rdtscp, tsc_known_freq
Network: WiFi (wlp0s20f3) + loopback
Kernel: Linux 6.17.0-8-generic
```

## TSC Calibration Results

Both methods (pause+rdtsc and lfence+rdtsc) produce consistent results:

| Method | Cycles/100ms | Calculated GHz |
|--------|--------------|----------------|
| pause+nop+rdtsc | 280,497,443 | 2.80 |
| lfence+rdtsc | 281,041,703 | 2.81 |

nanosleep accuracy: 100.193 ms for 100ms request (0.2% overshoot)

## Maximum Packet Rate (Unlimited)

**Test**: Send 100,000 UDP packets to localhost as fast as possible

```
Sent 100000 packets in 0.559 seconds
Rate: 178,902 pps
```

**Conclusion**: System hardware can handle 179K+ pps with no timing constraints.

## TSC Rate-Limited Packet Sending

**Test**: Use TSC busy-wait loop (same as unicornscan) to rate-limit packet sending

| Target PPS | Achieved PPS | Accuracy |
|------------|--------------|----------|
| 100 | 99.8 | 99.8% |
| 1000 | 998.3 | 99.8% |
| 1000 (pause) | 998.9 | 99.9% |
| 5000 | 4989.3 | 99.8% |
| 10000 | 9982.1 | 99.8% |

**Conclusion**: TSC-based rate limiting works with >99.8% accuracy at all tested rates.

## Test Code Used

### TSC Rate-Limited Test (`/tmp/pps_limited.c`)

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <time.h>
#include <stdint.h>

static inline uint64_t get_tsc(void) {
    uint32_t lo, hi;
    asm volatile ("lfence\nrdtsc" : "=a" (lo), "=d" (hi));
    return ((uint64_t)hi << 32) | lo;
}

int main(int argc, char *argv[]) {
    int sock;
    struct sockaddr_in dest;
    char buf[64] = "test";
    int target_pps = argc > 1 ? atoi(argv[1]) : 1000;
    int count = target_pps * 5;  // 5 seconds worth
    struct timespec start, end, calib_sleep = {0, 100000001};
    uint64_t tsc_start, tsc_end, cps, tsc_delay, slot_start;
    double elapsed;

    // TSC calibration (same as unicornscan)
    tsc_start = get_tsc();
    nanosleep(&calib_sleep, NULL);
    tsc_end = get_tsc();
    cps = (tsc_end - tsc_start) * 10;
    tsc_delay = cps / target_pps;

    printf("TSC calibration: %.2f GHz, delay=%lu cycles for %d pps\n",
           cps/1e9, tsc_delay, target_pps);

    sock = socket(AF_INET, SOCK_DGRAM, 0);
    dest.sin_family = AF_INET;
    dest.sin_port = htons(12345);
    inet_aton("127.0.0.1", &dest.sin_addr);

    printf("Sending %d packets at target %d pps...\n", count, target_pps);

    clock_gettime(CLOCK_MONOTONIC, &start);
    for (int i = 0; i < count; i++) {
        slot_start = get_tsc();
        sendto(sock, buf, sizeof(buf), 0, (struct sockaddr*)&dest, sizeof(dest));
        // Busy wait like unicornscan
        while ((get_tsc() - slot_start) < tsc_delay) { }
    }
    clock_gettime(CLOCK_MONOTONIC, &end);

    elapsed = (end.tv_sec - start.tv_sec) + (end.tv_nsec - start.tv_nsec) / 1e9;
    printf("Achieved rate: %.1f pps (target: %d pps)\n", count / elapsed, target_pps);

    close(sock);
    return 0;
}
```

## Kernel Network Parameters

```
net.core.wmem_max = 212992
net.core.rmem_max = 212992
net.core.netdev_max_backlog = 1000
net.core.somaxconn = 4096
```

## clock_gettime Comparison

As a modern alternative to TSC, tested `clock_gettime(CLOCK_MONOTONIC)`:

| Target PPS | Achieved PPS | Accuracy |
|------------|--------------|----------|
| 1000 | 1000.0 | 100.0% |
| 10000 | 9981.2 | 99.8% |

**Advantage**: No calibration needed - directly uses nanosecond delays.
**Implementation**: VDSO-accelerated on Linux, ~20ns overhead per call.

```c
static inline uint64_t get_ns(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000000000ULL + ts.tv_nsec;
}

// In rate-limiting loop:
uint64_t ns_delay = 1000000000ULL / target_pps;
uint64_t slot_start = get_ns();
send_packet();
while ((get_ns() - slot_start) < ns_delay) { }
```

## Implications for unicornscan

Given that:
1. TSC calibration is accurate (2.81 GHz measured correctly)
2. TSC-based busy-wait achieves 99.8%+ accuracy at all rates
3. System can handle 179K+ pps unlimited

The reported issue of unicornscan achieving only 250 pps when 1000 pps is requested **cannot be a fundamental TSC or system limitation**. The issue must be:

1. Something specific to unicornscan's implementation
2. Something in the IPC between main process and sender
3. Something in how the workunit PPS value is used
4. Or the test was run on a different system with different characteristics

## Next Steps

1. Add diagnostic output to unicornscan's `tsc_init_tslot()` to verify calibration values
2. Add diagnostic output to verify `tsc_delay` value in sender process
3. Compare unicornscan behavior with this test harness
4. Check if issue only occurs on specific hardware (user's system vs build system)
