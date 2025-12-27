# Time Estimation Quick Reference

**Quick lookup guide for time estimation calculation in unicornscan**

---

## The Formula

```
num_secs = Σ(all targets) [ ((hosts × ports × repeats × ttl_range) / pps) + recv_timeout ]
```

**Simplified** (single target, no multipliers):
```
num_secs = (hosts × ports / pps) + recv_timeout
```

---

## Key Variables

| Variable | Location | Default | Description |
|----------|----------|---------|-------------|
| `s->num_hosts` | settings.h:123 | 0.0 | Total hosts (accumulated) |
| `s->num_packets` | settings.h:124 | 0.0 | Total packets (accumulated) |
| `s->num_secs` | settings.h:125 | 0 | Total seconds (accumulated) |
| `s->pps` | - | 300 | Packets per second (-r option) |
| `s->ss->recv_timeout` | scanopts.h:83 | 7 | Receive timeout in seconds (-W option) |
| `s->repeats` | - | 1 | Scan repeats (-R option) |

---

## Code Locations

### Calculation
- **Host counting**: `src/unilib/cidr.c:489-521` (`cidr_numhosts()`)
- **Port parsing**: `src/scan_progs/portfunc.c:93-155` (`parse_pstr()`)
- **Accumulation**: `src/scan_progs/workunits.c:334-335`

### Display
- **Time formatting**: `src/main.c:193-223`
- **Output message**: `src/main.c:225-229`

### Configuration
- **recv_timeout constant**: `src/unicorn_defs.h:61` (`DEF_SCANTIMEOUT = 7`)
- **recv_timeout setter**: `src/scan_progs/scanopts.c:234`

---

## The Critical Lines

### Accumulation (workunits.c:334-335)
```c
s->num_packets += (num_hosts * num_pkts);
s->num_secs += ((num_hosts * num_pkts) / pps) + s->ss->recv_timeout;
```

### Display (main.c:225-229)
```c
VRB(0, "scaning %.2e total hosts with %.2e total packets, should take a little longer than %s",
    s->num_hosts,
    s->num_packets,
    time_est
);
```

---

## Quick Examples

### Single Host, Single Port
```bash
unicornscan -mT 192.168.1.1:80
```
- `hosts = 1, ports = 1, pps = 300, timeout = 7`
- `num_secs = (1 × 1 / 300) + 7 = 7 seconds`

### Class C, Two Ports
```bash
unicornscan -mT 192.168.1.0/24:80,443
```
- `hosts = 256, ports = 2, pps = 300, timeout = 7`
- `num_packets = 512`
- `num_secs = (512 / 300) + 7 = 8 seconds`

### With High Rate
```bash
unicornscan -mT 192.168.1.0/24:80 -r 1000
```
- `hosts = 256, ports = 1, pps = 1000, timeout = 7`
- `num_packets = 256`
- `num_secs = (256 / 1000) + 7 = 7 seconds`

### With Repeats
```bash
unicornscan -mT 192.168.1.0/24:80 -R 3
```
- `hosts = 256, ports = 1 × 3 = 3, pps = 300, timeout = 7`
- `num_packets = 768`
- `num_secs = (768 / 300) + 7 = 9 seconds`

### Large Network
```bash
unicornscan -mT 10.0.0.0/16:1-1024 -r 1000
```
- `hosts = 65536, ports = 1024, pps = 1000, timeout = 7`
- `num_packets = 67108864`
- `num_secs = (67108864 / 1000) + 7 = 67115 seconds`
- `= 18 Hours, 38 Minutes, 35 Seconds`

---

## Port String Shortcuts

| String | Expansion | Count | Description |
|--------|-----------|-------|-------------|
| `a` or `A` | `0-65535` | 65536 | All ports |
| `p` or `P` | `1-1024` | 1024 | Privileged ports |
| `q` or `Q` | (config) | varies | Quick ports from config |

---

## CIDR to Host Count

| CIDR | Hosts | Example |
|------|-------|---------|
| /32 | 1 | 192.168.1.1/32 |
| /24 | 256 | 192.168.1.0/24 |
| /16 | 65536 | 10.0.0.0/16 |
| /8 | 16777216 | 10.0.0.0/8 |

**Formula**: `hosts = 2^(32 - cidr_bits)`

**Code**: Uses bitwise calculation in `cidr_numhosts()`:
```c
high_ip = low_ip | ~(mask);
hosts = high_ip - low_ip + 1;
```

---

## Time Display Format

**Code** (main.c:198-223):
1. If `num_secs > 3600`: Extract hours
2. If `num_secs > 60`: Extract minutes
3. Remainder: Seconds

**Output Format**:
```
"X Hours, Y Minutes, Z Seconds"
```

**Examples**:
- `7 seconds` → "7 Seconds"
- `125 seconds` → "2 Minutes, 5 Seconds"
- `7325 seconds` → "2 Hours, 2 Minutes, 5 Seconds"

---

## Common Pitfalls

1. **Compound Mode**: Calculation doesn't account for phase filtering
   - Example: `-mA+T` calculates as if all hosts scanned in both phases
   - Reality: Only ARP-responding hosts scanned in TCP phase

2. **Integer Truncation**: Fractional seconds are lost
   - `7.9 seconds` becomes `7 seconds`

3. **Multiple Targets**: Each target adds full `recv_timeout`
   - May overestimate if targets scanned sequentially

4. **No Overhead**: Pure mathematical calculation
   - Real-world time typically 10-30% longer

---

## Command-Line Options Affecting Time

| Option | Default | Impact |
|--------|---------|--------|
| `-r <pps>` | 300 | Packets per second (lower = longer) |
| `-W <timeout>` | 7 | Receive timeout in seconds (added to each target) |
| `-R <repeats>` | 1 | Multiply packets by this factor |
| `--minttl <n>` | - | If != maxttl, multiply packets by (max - min) |
| `--maxttl <n>` | - | If != minttl, multiply packets by (max - min) |

---

## Debugging Time Estimates

### Enable Verbose Mode
```bash
unicornscan -v 3 -mT 192.168.1.0/24:80
```

Look for these messages:
- `"adding X.Xe+XX new hosts to scan"` (from workunits.c:284)
- `"adding <target> mode <mode> ports <ports> pps <pps>"` (from workunits.c:338)

### Calculate Manually
1. Count hosts: Use `ipcalc` or `prips`
2. Count ports: Parse port string
3. Apply formula: `(hosts × ports / pps) + timeout`
4. Compare to displayed estimate

### Check Intermediate Values
Add debug prints in `src/scan_progs/workunits.c:335`:
```c
DBG(M_WRK, "Time calc: (%f hosts * %u ports) / %u pps + %u timeout = %u total secs",
    num_hosts, num_pkts, pps, s->ss->recv_timeout,
    (uint32_t)(((num_hosts * num_pkts) / pps) + s->ss->recv_timeout));
```

---

## Related Files

- **Full Analysis**: `docs/research/time-estimation-calculation-analysis.md`
- **Phase Timing**: `docs/research/phase-transition-timing-analysis.md`
- **Workunit Flow**: `docs/research/workunit-execution-flow-analysis.md`
