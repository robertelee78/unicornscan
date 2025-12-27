# Time Estimation Calculation Flow Diagram

**Visual representation of the time estimation calculation process**

---

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    UNICORNSCAN STARTUP                               │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 1: Initialize Settings Structure                              │
│  ───────────────────────────────────────────────────────────────   │
│  File: src/main.c:120-121                                           │
│                                                                      │
│  s = xmalloc(sizeof(settings_t));                                   │
│  memset(s, 0, sizeof(settings_t));                                  │
│                                                                      │
│  Result:                                                             │
│    s->num_hosts = 0.0                                               │
│    s->num_packets = 0.0                                             │
│    s->num_secs = 0                                                  │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 2: Parse Configuration & Command-Line Arguments               │
│  ───────────────────────────────────────────────────────────────   │
│  File: src/getconfig.c                                              │
│                                                                      │
│  Extracted Values:                                                   │
│    • pps (-r option, default: 300)                                  │
│    • recv_timeout (-W option, default: 7)                           │
│    • repeats (-R option, default: 1)                                │
│    • target specifications (IP/CIDR:ports)                          │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
         ┌──────────────────┴───────────────────┐
         │  FOR EACH TARGET SPECIFICATION       │
         └──────────────────┬───────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 3: Add Workunit for Target                                    │
│  ───────────────────────────────────────────────────────────────   │
│  File: src/scan_progs/workunits.c:add_workunit()                    │
│                                                                      │
│  Input: "192.168.1.0/24:80,443"                                     │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 3a. Calculate Number of Hosts                              │    │
│  │     File: src/unilib/cidr.c:489 (cidr_numhosts)            │    │
│  │                                                             │    │
│  │     CIDR Parsing:                                           │    │
│  │       192.168.1.0/24 → network=192.168.1.0, mask=/24       │    │
│  │                                                             │    │
│  │     Host Calculation:                                       │    │
│  │       mask_bits = 24                                        │    │
│  │       mask = 0xFFFFFF00 (255.255.255.0)                    │    │
│  │       low_ip  = 192.168.1.0   (0xC0A80100)                 │    │
│  │       high_ip = 192.168.1.255 (0xC0A801FF)                 │    │
│  │       num_hosts = high_ip - low_ip + 1 = 256               │    │
│  │                                                             │    │
│  │     Code:                                                   │    │
│  │       mask = ntohl(mask_u.sin->sin_addr.s_addr);           │    │
│  │       low_ip = ntohl(net_u.sin->sin_addr.s_addr);          │    │
│  │       high_ip = low_ip | ~(mask);                          │    │
│  │       num_hosts = (double)(high_ip - low_ip + 1);          │    │
│  └────────────────────────────────────────────────────────────┘    │
│                            │                                         │
│                            ▼                                         │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 3b. Parse Port String                                      │    │
│  │     File: src/scan_progs/portfunc.c:93 (parse_pstr)        │    │
│  │                                                             │    │
│  │     Input: "80,443"                                         │    │
│  │                                                             │    │
│  │     Parsing Process:                                        │    │
│  │       1. Split by comma: ["80", "443"]                     │    │
│  │       2. For each token:                                    │    │
│  │          - Check for range (e.g., "1-1024")                │    │
│  │          - If range: count = (high - low + 1)              │    │
│  │          - If single: count = 1                            │    │
│  │       3. Sum all counts                                     │    │
│  │                                                             │    │
│  │     Port Counting:                                          │    │
│  │       Token "80":  num_ports += 1  (total: 1)              │    │
│  │       Token "443": num_ports += 1  (total: 2)              │    │
│  │                                                             │    │
│  │     Result: num_pkts = 2                                    │    │
│  │                                                             │    │
│  │     Code:                                                   │    │
│  │       for (dtok = strtok_r(...)) {                         │    │
│  │         if (sscanf(dtok, "%u-%u", &low, &high) == 2) {     │    │
│  │           num_ports += ((high + 1) - low);                 │    │
│  │         } else if (sscanf(dtok, "%u", &low) == 1) {        │    │
│  │           num_ports++;                                      │    │
│  │         }                                                   │    │
│  │       }                                                     │    │
│  └────────────────────────────────────────────────────────────┘    │
│                            │                                         │
│                            ▼                                         │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 3c. Apply Multipliers                                      │    │
│  │     File: src/scan_progs/workunits.c:326-332               │    │
│  │                                                             │    │
│  │     Initial: num_pkts = 2                                   │    │
│  │                                                             │    │
│  │     If repeats > 1 (-R option):                             │    │
│  │       num_pkts *= s->repeats                               │    │
│  │       Example: -R 3 → num_pkts = 2 * 3 = 6                 │    │
│  │                                                             │    │
│  │     If TTL range set (--minttl != --maxttl):                │    │
│  │       num_pkts *= (s->ss->maxttl - s->ss->minttl)          │    │
│  │       Example: --minttl 1 --maxttl 5 → num_pkts *= 4       │    │
│  │                                                             │    │
│  │     Code:                                                   │    │
│  │       if (s->repeats > 1) {                                │    │
│  │         num_pkts *= s->repeats;                            │    │
│  │       }                                                     │    │
│  │       if (s->ss->minttl != s->ss->maxttl) {                │    │
│  │         num_pkts *= (s->ss->maxttl - s->ss->minttl);       │    │
│  │       }                                                     │    │
│  └────────────────────────────────────────────────────────────┘    │
│                            │                                         │
│                            ▼                                         │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 3d. Calculate and Accumulate Totals                        │    │
│  │     File: src/scan_progs/workunits.c:334-335               │    │
│  │                                                             │    │
│  │     Given Values:                                           │    │
│  │       num_hosts = 256                                       │    │
│  │       num_pkts = 2                                          │    │
│  │       pps = 300 (packets per second)                        │    │
│  │       recv_timeout = 7 (seconds)                            │    │
│  │                                                             │    │
│  │     Calculate Packets for This Target:                      │    │
│  │       target_packets = num_hosts × num_pkts                 │    │
│  │                      = 256 × 2                              │    │
│  │                      = 512                                  │    │
│  │                                                             │    │
│  │     Calculate Time for This Target:                         │    │
│  │       send_time = target_packets / pps                      │    │
│  │                 = 512 / 300                                 │    │
│  │                 = 1.707 seconds                             │    │
│  │                                                             │    │
│  │       target_time = send_time + recv_timeout               │    │
│  │                   = 1.707 + 7                               │    │
│  │                   = 8.707 seconds                           │    │
│  │                   → 8 seconds (truncated to uint32_t)       │    │
│  │                                                             │    │
│  │     Accumulate into Global Totals:                          │    │
│  │       s->num_packets += target_packets                      │    │
│  │       s->num_secs += target_time                            │    │
│  │                                                             │    │
│  │     Code:                                                   │    │
│  │       s->num_packets += (num_hosts * num_pkts);            │    │
│  │       s->num_secs += ((num_hosts * num_pkts) / pps)        │    │
│  │                      + s->ss->recv_timeout;                 │    │
│  └────────────────────────────────────────────────────────────┘    │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
         ┌──────────────────┴───────────────────┐
         │  REPEAT FOR EACH TARGET              │
         │  (Accumulates into same variables)   │
         └──────────────────┬───────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 4: Format Time String                                         │
│  ───────────────────────────────────────────────────────────────   │
│  File: src/main.c:193-223                                           │
│                                                                      │
│  Input: s->num_secs = 7325 seconds (example)                        │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 4a. Extract Hours                                          │    │
│  │                                                             │    │
│  │     if (num_secs > 3600) {                                 │    │
│  │       hours = num_secs / 3600                              │    │
│  │             = 7325 / 3600                                  │    │
│  │             = 2 hours                                      │    │
│  │                                                             │    │
│  │       time_est = "2 Hours, "                               │    │
│  │       num_secs -= (2 * 3600)                               │    │
│  │                 = 7325 - 7200                              │    │
│  │                 = 125 seconds remaining                     │    │
│  │     }                                                       │    │
│  └────────────────────────────────────────────────────────────┘    │
│                            │                                         │
│                            ▼                                         │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 4b. Extract Minutes                                        │    │
│  │                                                             │    │
│  │     if (num_secs > 60) {                                   │    │
│  │       minutes = num_secs / 60                              │    │
│  │               = 125 / 60                                   │    │
│  │               = 2 minutes                                  │    │
│  │                                                             │    │
│  │       time_est = "2 Hours, 2 Minutes, "                    │    │
│  │       num_secs -= (2 * 60)                                 │    │
│  │                 = 125 - 120                                │    │
│  │                 = 5 seconds remaining                       │    │
│  │     }                                                       │    │
│  └────────────────────────────────────────────────────────────┘    │
│                            │                                         │
│                            ▼                                         │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 4c. Add Remaining Seconds                                  │    │
│  │                                                             │    │
│  │     time_est = "2 Hours, 2 Minutes, 5 Seconds"             │    │
│  └────────────────────────────────────────────────────────────┘    │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 5: Display Message                                            │
│  ───────────────────────────────────────────────────────────────   │
│  File: src/main.c:225-229                                           │
│                                                                      │
│  VRB(0, "scaning %.2e total hosts with %.2e total packets,          │
│          should take a little longer than %s",                      │
│      s->num_hosts,                                                  │
│      s->num_packets,                                                │
│      time_est                                                       │
│  );                                                                 │
│                                                                      │
│  Output:                                                             │
│    scaning 2.56e+02 total hosts with 5.12e+02 total packets,       │
│    should take a little longer than 2 Hours, 2 Minutes, 5 Seconds  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Calculation Example

### Command
```bash
unicornscan -mT 192.168.1.0/24:80,443 10.0.0.0/24:22
```

### Processing Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  INITIAL STATE                                                       │
│  ─────────────                                                       │
│  s->num_hosts = 0.0                                                 │
│  s->num_packets = 0.0                                               │
│  s->num_secs = 0                                                    │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  TARGET 1: 192.168.1.0/24:80,443                                    │
│  ────────────────────────────────────                               │
│                                                                      │
│  CIDR Calculation:                                                   │
│    192.168.1.0/24 → num_hosts = 256                                │
│                                                                      │
│  Port Parsing:                                                       │
│    "80,443" → num_pkts = 2                                          │
│                                                                      │
│  Time Calculation:                                                   │
│    target_packets = 256 × 2 = 512                                   │
│    send_time = 512 / 300 = 1.707 seconds                            │
│    target_time = 1.707 + 7 = 8.707 → 8 seconds                     │
│                                                                      │
│  Accumulation:                                                       │
│    s->num_packets = 0 + 512 = 512                                   │
│    s->num_secs = 0 + 8 = 8                                          │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AFTER TARGET 1                                                      │
│  ──────────────                                                      │
│  s->num_hosts = 256.0                                               │
│  s->num_packets = 512.0                                             │
│  s->num_secs = 8                                                    │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  TARGET 2: 10.0.0.0/24:22                                           │
│  ──────────────────────────────                                     │
│                                                                      │
│  CIDR Calculation:                                                   │
│    10.0.0.0/24 → num_hosts = 256                                   │
│                                                                      │
│  Port Parsing:                                                       │
│    "22" → num_pkts = 1                                              │
│                                                                      │
│  Time Calculation:                                                   │
│    target_packets = 256 × 1 = 256                                   │
│    send_time = 256 / 300 = 0.853 seconds                            │
│    target_time = 0.853 + 7 = 7.853 → 7 seconds                     │
│                                                                      │
│  Accumulation:                                                       │
│    s->num_packets = 512 + 256 = 768                                 │
│    s->num_secs = 8 + 7 = 15                                         │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  FINAL STATE                                                         │
│  ───────────                                                         │
│  s->num_hosts = 512.0 (256 + 256)                                   │
│  s->num_packets = 768.0 (512 + 256)                                 │
│  s->num_secs = 15 (8 + 7)                                           │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  TIME FORMATTING                                                     │
│  ───────────────                                                     │
│  num_secs = 15                                                      │
│                                                                      │
│  Hours: 15 < 3600 → Skip                                            │
│  Minutes: 15 < 60 → Skip                                            │
│  Seconds: 15 → "15 Seconds"                                         │
│                                                                      │
│  time_est = "15 Seconds"                                            │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  OUTPUT                                                              │
│  ──────                                                              │
│  scaning 5.12e+02 total hosts with 7.68e+02 total packets,         │
│  should take a little longer than 15 Seconds                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

```
Configuration
     │
     ├─→ pps (default: 300) ──────────────────┐
     ├─→ recv_timeout (default: 7) ────────┐  │
     ├─→ repeats (default: 1) ──────────┐  │  │
     └─→ target specs ──────────┐       │  │  │
                                 │       │  │  │
                                 ▼       │  │  │
Target: "192.168.1.0/24:80,443"  │       │  │  │
     │                            │       │  │  │
     ├─→ cidr_numhosts()          │       │  │  │
     │       └─→ num_hosts = 256  │       │  │  │
     │                            │       │  │  │
     └─→ parse_pstr()             │       │  │  │
             └─→ num_pkts = 2     │       │  │  │
                                  │       │  │  │
                Apply Multipliers │       │  │  │
                     │            │       │  │  │
                     ├─→ repeats ◄┘       │  │  │
                     └─→ ttl_range        │  │  │
                            │              │  │  │
                            ▼              │  │  │
                  num_pkts (final)        │  │  │
                            │              │  │  │
                            ├──────────────┼──┼──┘
                            │              │  │
                            ▼              ▼  ▼
                   Calculate: (num_hosts × num_pkts / pps) + recv_timeout
                                         │
                                         ▼
                            Accumulate into s->num_secs
                                         │
                                         ▼
                            Format time string (Hours, Minutes, Seconds)
                                         │
                                         ▼
                                   Display message
```

---

## Key Decision Points

```
┌─────────────────────┐
│  Port String        │
└──────┬──────────────┘
       │
       ├─→ 'a' or 'A' ──→ Expand to "0-65535" (65536 ports)
       ├─→ 'p' or 'P' ──→ Expand to "1-1024" (1024 ports)
       ├─→ 'q' or 'Q' ──→ Use quick ports from config
       └─→ Other ───────→ Parse as-is
```

```
┌─────────────────────┐
│  Repeats Option     │
└──────┬──────────────┘
       │
       ├─→ s->repeats > 1 ──→ num_pkts *= s->repeats
       └─→ s->repeats == 1 ──→ No change
```

```
┌─────────────────────┐
│  TTL Range          │
└──────┬──────────────┘
       │
       ├─→ minttl != maxttl ──→ num_pkts *= (maxttl - minttl)
       └─→ minttl == maxttl ──→ No change
```

```
┌─────────────────────┐
│  Time Formatting    │
└──────┬──────────────┘
       │
       ├─→ num_secs > 3600 ──→ Extract hours
       ├─→ num_secs > 60 ────→ Extract minutes
       └─→ Remainder ────────→ Display as seconds
```

---

## Function Call Graph

```
main()
  │
  ├─→ memset(s, 0, sizeof(settings_t))  [Initialize]
  │
  ├─→ getconfig_argv()
  │      │
  │      └─→ add_workunit()  [For each target]
  │             │
  │             ├─→ cidr_get()  [Parse CIDR]
  │             │
  │             ├─→ cidr_numhosts()  [Calculate hosts]
  │             │      │
  │             │      └─→ Bitwise calculation
  │             │           low_ip | ~(mask)
  │             │
  │             ├─→ parse_pstr()  [Parse ports]
  │             │      │
  │             │      ├─→ strtok_r()  [Split by comma]
  │             │      │
  │             │      └─→ sscanf()  [Parse ranges/singles]
  │             │
  │             └─→ Accumulation
  │                    s->num_packets += (num_hosts * num_pkts)
  │                    s->num_secs += ((num_hosts * num_pkts) / pps) + recv_timeout
  │
  └─→ Display
         │
         ├─→ Time formatting  [Convert to Hours, Minutes, Seconds]
         │
         └─→ VRB(0, ...)  [Output message]
```

---

## Related Documentation

- **Detailed Analysis**: `docs/research/time-estimation-calculation-analysis.md`
- **Quick Reference**: `docs/research/time-estimation-quick-reference.md`
- **Phase Timing**: `docs/research/phase-transition-timing-analysis.md`
