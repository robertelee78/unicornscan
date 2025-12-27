# Compound Mode Remote Target Handling - Architecture Decision Record

**Date**: 2025-12-23
**Status**: Proposed
**Task ID**: b09a614e-6e5c-4126-8417-48bedafd9e94
**Related PRD**: PRD: Compound Modes (ARP-Filtered Multi-Phase Scanning)

---

## Problem Statement

When users specify compound modes like `-mA+T` or `-mA+U`, they expect:
1. ARP phase to discover live Layer 2 hosts
2. Subsequent TCP/UDP phases to target only ARP responders

However, **ARP only works on the local broadcast domain** (Layer 2). If targets are remote (1+ router hops away), the ARP phase will:
- Never receive ARP responses from remote hosts
- Only discover the local gateway (if even that)
- Leave the ARP cache empty, causing phase 2+ to skip ALL workunits

**User expectation vs reality:**
```
User runs: unicornscan -mA+T 8.8.8.0/24 -r1000

Expected: ARP discovers live hosts, TCP scans them
Actual:   ARP phase fails (remote network), TCP phase scans NOTHING
```

This is a critical design decision that impacts user experience, performance, and adherence to Jack Louis's philosophy.

---

## Context: How Other Tools Handle This

### Nmap's Approach (Auto-Magical)

**Behavior**: Nmap automatically detects local vs remote targets and adjusts accordingly.

```bash
# On local network (192.168.1.0/24)
nmap -sn 192.168.1.0/24
# Uses ARP scan automatically (even without -PR flag)

# On remote network (8.8.8.0/24)
nmap -sn 8.8.8.0/24
# Skips ARP, uses ICMP/TCP ping instead
```

**From nmap man page:**
> "ARP/Neighbor Discovery is done by default against targets on a local Ethernet network
> even if you specify other -P* options, because it is almost always faster and more effective."

**Detection logic:**
1. Compare target IP to interface subnet/netmask
2. If `(target_ip & netmask) == (interface_ip & netmask)`, target is local
3. If local → use ARP, if remote → skip ARP

**Philosophy**: Convenience over explicitness. Users don't need to know about L2/L3 distinction.

### Masscan's Approach (Explicit + Fail-Fast)

**Behavior**: Masscan uses `--router-mac` flag for explicit control.

```bash
# User MUST specify router MAC for scanning
masscan 192.168.1.0/24 --router-mac 00:11:22:33:44:55 -p80

# Without it, masscan resolves gateway MAC at startup
# Fails if resolution fails
```

**From masscan documentation:**
> "This program requires a raw socket to transmit packets, which requires on Linux the
> CAP_NET_RAW capability. You'll also need to configure the router MAC address."

**Philosophy**: Explicit is better than implicit. User must understand they're sending raw packets.

### Unicornscan's Current Behavior (Silent Failure)

```bash
unicornscan -mT 192.168.1.0/24 -r1000
# Uses ip_send() → kernel ARP resolution → blocks on non-existent hosts
# Result: Extremely slow scan (250 pps instead of 1000)
```

**Current weakness**: No detection, no warning, just poor performance.

---

## Design Options Analysis

### Option 1: Fail Early with Clear Error Message ✓ RECOMMENDED

**Behavior:**
```bash
# User specifies compound mode with remote targets
unicornscan -mA+T 8.8.8.0/24 -r1000

# Output:
ERROR: Compound mode -mA+T specified, but targets are not on local network.
ARP scanning requires targets on the same Layer 2 broadcast domain.

Target: 8.8.8.0/24 (remote network, 1+ hops away)
Interface: eth0 (192.168.1.5/24)

Options:
  1. Use -mT alone to skip ARP phase
  2. Scan local network: unicornscan -mA+T 192.168.1.0/24
  3. Use --force-remote to run anyway (ARP phase will yield no results)
```

**Implementation:**
```c
// In scan_parsemode_compound() or phase validation
int validate_compound_mode_targets(const char *target_spec) {
    // 1. Parse target IP range
    // 2. Get interface IP and netmask from settings
    // 3. Check if ANY target is outside local subnet
    // 4. If remote targets detected AND phase 1 is ARP:
    //    - If --force-remote flag: continue with warning
    //    - Else: error and exit

    if (has_remote_targets && first_phase_is_arp && !s->force_remote) {
        ERROR("Compound mode with ARP phase requires local targets");
        // Print helpful error message
        exit(1);
    }
}
```

**Pros:**
- ✓ Explicit - user gets immediate feedback about the problem
- ✓ Educational - error message explains L2 vs L3 distinction
- ✓ Matches Jack's philosophy - no auto-magical behavior
- ✓ Prevents wasted time running useless ARP scan
- ✓ User makes informed decision (change mode or change targets)

**Cons:**
- Requires target range parsing early (before workunit generation)
- Slightly more code complexity
- Some users might find it restrictive

**Severity**: Low - This is a correctness issue, not a convenience tradeoff

---

### Option 2: Warn and Skip ARP Phase

**Behavior:**
```bash
unicornscan -mA+T 8.8.8.0/24 -r1000

# Output:
WARNING: Targets 8.8.8.0/24 are remote (not on local network 192.168.1.0/24)
WARNING: Skipping ARP phase - proceeding directly to TCP SYN scan
```

**Implementation:**
```c
// In master.c or workunits.c
if (cur_phase == 0 && phase[0].mode == MODE_ARPSCAN) {
    if (has_remote_targets()) {
        MSG(M_WARN, "Skipping ARP phase for remote targets");
        cur_phase = 1; // Skip to phase 2
    }
}
```

**Pros:**
- ✓ Graceful degradation - scan still works
- ✓ Informs user about what's happening
- ✓ No manual intervention required

**Cons:**
- ✗ Violates explicit philosophy - auto-magical behavior
- ✗ User's intent was `-mA+T`, but they're getting just `-mT`
- ✗ Silently changes behavior based on target
- ✗ Confusing: "I specified -mA but no ARP output?"

**Verdict**: This goes against Jack's design philosophy. Unicornscan is explicit, not helpful.

---

### Option 3: Mixed Handling (Local vs Remote Filtering)

**Behavior:**
```bash
unicornscan -mA+T 192.168.1.0/24,8.8.8.0/24 -r1000

# Phase 1 (ARP): Scan 192.168.1.0/24 only (local)
# Phase 2 (TCP): Scan 192.168.1.0/24 (filtered by ARP) + 8.8.8.0/24 (all IPs)
```

**Implementation:**
```c
// In workunit generation
for each workunit:
    if (phase == 0 && mode == MODE_ARPSCAN && is_remote_target(wu->target_ip)):
        skip_workunit(); // Don't ARP remote targets

    if (phase > 0 && is_remote_target(wu->target_ip)):
        send_workunit(); // Don't apply ARP filter to remote targets

    if (phase > 0 && is_local_target(wu->target_ip)):
        if (in_arp_cache(wu->target_ip)):
            send_workunit(); // Apply ARP filter to local targets
```

**Pros:**
- ✓ Maximally flexible
- ✓ Works for mixed local/remote target lists
- ✓ User gets sensible behavior

**Cons:**
- ✗ **Most complex implementation**
- ✗ Still auto-magical - behavior differs by target
- ✗ Inconsistent filtering logic (some filtered, some not)
- ✗ Hard to explain: "ARP filtering applies only to local targets"

**Verdict**: Over-engineered for a rare use case. Adds complexity without clear benefit.

---

### Option 4: Require Explicit Flag (--local-only)

**Behavior:**
```bash
# Default: Error if targets are mixed or remote
unicornscan -mA+T 8.8.8.0/24
ERROR: ARP phase requires local targets. Use --force-remote to proceed anyway.

# With flag: Proceed with warning
unicornscan -mA+T 8.8.8.0/24 --force-remote
WARNING: ARP phase will not discover remote targets (8.8.8.0/24)
WARNING: Phase 2 (TCP) will scan ALL targets regardless of ARP results
Continue? [y/N]
```

**Implementation:**
```c
// CLI flag in getconfig.c
--force-remote    Force compound ARP mode even for remote targets

// Validation in scanopts.c
if (compound_mode && first_phase_is_arp && !is_local_network(targets)) {
    if (!s->force_remote) {
        ERROR("ARP phase requires local targets. Use --force-remote to override.");
        exit(1);
    }
    MSG(M_WARN, "Running ARP phase on remote targets (likely to yield no results)");
}
```

**Pros:**
- ✓ Explicit user control
- ✓ Fail-safe default (error on misuse)
- ✓ Opt-in for advanced users who know what they're doing
- ✓ Matches Jack's philosophy perfectly

**Cons:**
- Adds new CLI flag
- Slightly more user burden (must acknowledge the issue)

**Verdict**: Second-best option. Good if we want to allow the behavior but require acknowledgment.

---

## Recommended Solution: **Option 1 (Fail Early)** + Refinement

### Final Design Decision

**Default Behavior:**
1. Parse target specification early (before workunit generation)
2. Detect if targets are on local network or remote
3. If compound mode starts with ARP AND targets are remote:
   - **Print clear error message** with explanation
   - **Exit with status 1** (failure)
   - **Suggest alternatives** (use -mT, scan local network, add --force-remote)

**Optional Enhancement:**
4. Add `--force-remote` flag for advanced users who understand the limitation

### Rationale

This approach aligns perfectly with **Jack Louis's design philosophy**:

1. **Explicit, not auto-magical**
   - User explicitly specified `-mA+T` expecting ARP to work
   - Silently changing behavior (Option 2) violates this principle
   - Better to fail loudly than succeed unexpectedly

2. **Educate the user**
   - Error message explains WHY it won't work (L2 vs L3)
   - Provides actionable alternatives
   - User learns about network scanning fundamentals

3. **Prevent footguns**
   - ARP scanning remote networks is meaningless
   - Wasting time on phase 1 that yields nothing is poor UX
   - Better to prevent the mistake upfront

4. **Consistency with existing behavior**
   - Unicornscan already errors on invalid mode combinations
   - This is just another invalid combination worth catching early

### Comparison to Nmap vs Masscan

| Tool | Approach | Philosophy |
|------|----------|------------|
| **Nmap** | Auto-detect, auto-adjust | Convenience (GUI-friendly) |
| **Masscan** | Require `--router-mac` | Explicit (expert tool) |
| **Unicornscan** | Fail early with explanation | **Explicit + Educational** |

Unicornscan strikes a balance: more helpful than masscan's terse requirement, but more explicit than nmap's auto-magic.

---

## Implementation Plan

### Phase 1: Target Detection Function

**File:** `src/scan_progs/target_utils.c` (new file)

```c
#include <dnet.h>
#include "settings.h"

/**
 * Check if target IP is on the local network (same L2 broadcast domain)
 *
 * @param target_ip Target IP address (network byte order)
 * @param iface Interface configuration
 * @return 1 if local, 0 if remote
 */
int is_local_target(uint32_t target_ip, const struct intf_entry *iface) {
    uint32_t net_addr, bcast_addr;

    if (iface == NULL) return 0;

    // Calculate network address: interface_ip & netmask
    net_addr = iface->intf_addr.addr_ip & iface->intf_addr.addr_bits;

    // Calculate broadcast address
    bcast_addr = net_addr | (~iface->intf_addr.addr_bits);

    // Check if target is in [net_addr, bcast_addr] range
    return (target_ip >= net_addr && target_ip <= bcast_addr);
}

/**
 * Validate target range for compound mode with ARP phase
 *
 * @param target_spec User-provided target specification (CIDR, range, etc)
 * @return 0 if valid, -1 if invalid (with error printed)
 */
int validate_arp_targets(const char *target_spec) {
    // TODO: Parse target_spec into IP range
    // TODO: Check if ANY target is remote
    // TODO: Print error if remote targets detected

    return 0; // Success for now
}
```

### Phase 2: Early Validation Hook

**File:** `src/scan_progs/scanopts.c`

```c
int scan_parsemode_compound(const char *optarg, scan_phase_t *phases, int *phase_count) {
    // ... existing parsing logic ...

    // Validate if first phase is ARP
    if (phases[0].mode == MODE_ARPSCAN) {
        if (!s->force_remote && validate_arp_targets(s->target_spec) < 0) {
            // Error already printed by validate_arp_targets()
            return -1;
        }
    }

    return 0;
}
```

### Phase 3: CLI Flag (Optional)

**File:** `src/getconfig.c`

```c
static struct option long_options[] = {
    // ... existing options ...
    {"force-remote", no_argument, NULL, OPTION_FORCE_REMOTE},
    {NULL, 0, NULL, 0}
};

// In getoptions():
case OPTION_FORCE_REMOTE:
    scan_setforceremote(1);
    break;
```

### Phase 4: Error Message Template

```c
void print_remote_target_error(const char *target_spec, const char *iface_spec) {
    fprintf(stderr,
        "ERROR: Compound mode with ARP phase requires local targets.\n\n"

        "Target specification: %s\n"
        "Interface: %s\n\n"

        "ARP scanning only works on the local Layer 2 broadcast domain.\n"
        "Remote targets (1+ router hops away) will not respond to ARP requests.\n\n"

        "Suggested alternatives:\n"
        "  1. Use TCP/UDP scan directly: -mT or -mU (skip ARP phase)\n"
        "  2. Scan local network: -mA+T <local_network>/24\n"
        "  3. Force scan anyway: add --force-remote (ARP phase will yield no results)\n\n"

        "Example:\n"
        "  unicornscan -mT %s     # Direct TCP scan\n"
        "  unicornscan -mA+T 192.168.1.0/24  # ARP+TCP on local network\n",
        target_spec, iface_spec, target_spec
    );
}
```

---

## Testing Plan

### Test Case 1: Local Network (Should Work)
```bash
unicornscan -mA+T 192.168.1.0/24 -r1000
# Expected: ARP scan runs, TCP scan runs on responders
# Actual: [TEST RESULT]
```

### Test Case 2: Remote Network (Should Error)
```bash
unicornscan -mA+T 8.8.8.0/24 -r1000
# Expected: Error message, exit 1
# Actual: [TEST RESULT]
```

### Test Case 3: Remote with --force-remote (Should Warn)
```bash
unicornscan -mA+T 8.8.8.0/24 -r1000 --force-remote
# Expected: Warning, continues, ARP phase finds nothing
# Actual: [TEST RESULT]
```

### Test Case 4: Single-phase Mode (Should Work)
```bash
unicornscan -mT 8.8.8.0/24 -r1000
# Expected: TCP scan runs normally (no ARP validation)
# Actual: [TEST RESULT]
```

### Test Case 5: Mixed Local/Remote (Should Error by Default)
```bash
unicornscan -mA+T 192.168.1.0/24,8.8.8.0/24
# Expected: Error (contains remote targets)
# Actual: [TEST RESULT]
```

---

## Future Enhancements

### Smart Gateway Filtering (Future Work)

If user is scanning remote network AND uses compound mode:
1. Detect gateway IP from routing table
2. Run ARP for gateway only
3. Use gateway MAC for all Layer 2 sends to remote targets

This would combine:
- Compound mode benefits (phased execution)
- Layer 2 sending performance (eth_send bypass)
- Remote network support

**But:** This is Option 1 + eth_send enhancement, separate from this ADR.

---

## Decision Summary

**Chosen Approach**: **Option 1 - Fail Early with Clear Error Message**

**Justification:**
1. Aligns with Jack Louis's explicit design philosophy
2. Educates users about L2/L3 networking
3. Prevents wasted time on impossible scans
4. Simple implementation with clear error handling
5. Optional `--force-remote` flag for advanced users

**Alternative Rejected:** Option 2 (auto-skip) - Too magical, violates explicit principle

**Alternative Considered:** Option 4 (require flag) - Good but more restrictive than needed

---

## References

- [Nmap Manual - Host Discovery](https://nmap.org/book/man-host-discovery.html)
- [Masscan README - Router MAC](https://github.com/robertdavidgraham/masscan#router-mac)
- `docs/research/masscan-high-performance-techniques-analysis.md`
- `docs/jack-louis-coding-style-guide.md` (if exists)
- PRD: Compound Modes (ARP-Filtered Multi-Phase Scanning)

---

**Architect**: System Architecture Designer (Claude Sonnet 4.5)
**Review Status**: Awaiting approval
**Implementation Priority**: P1 (should implement before compound mode release)
