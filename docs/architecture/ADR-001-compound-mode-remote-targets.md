# ADR-001: Handling Remote Targets in Compound ARP Mode

**Status**: Proposed
**Date**: 2025-12-23
**Deciders**: System Architecture Designer, Project Maintainers
**Related**: PRD: Compound Modes (ARP-Filtered Multi-Phase Scanning)

---

## Context and Problem Statement

Compound mode syntax (`-mA+T`, `-mA+U`) enables multi-phase scanning where ARP discovery (phase 1) filters targets for subsequent TCP/UDP phases. However, **ARP only functions on the local Layer 2 broadcast domain**. When targets are remote (1+ router hops away), the ARP phase cannot discover them, resulting in an empty ARP cache and skipped workunits in phase 2+.

**Key question**: How should unicornscan handle compound modes when targets are demonstrably remote?

---

## Decision Drivers

1. **Jack Louis's Philosophy**: Explicit behavior over auto-magical adjustments
2. **User Experience**: Clear feedback when operations won't work as expected
3. **Code Simplicity**: Prefer simple, maintainable solutions
4. **Educational Value**: Help users understand network fundamentals
5. **Performance**: Don't waste time on operations destined to fail
6. **Flexibility**: Advanced users may have edge cases we haven't considered

---

## Considered Options

### Option A: Fail Early with Educational Error Message ✓ RECOMMENDED

**Behavior**: Detect remote targets at startup, error with explanation and suggestions.

**Pros:**
- Explicit - user gets immediate, clear feedback
- Educational - explains L2/L3 distinction
- Prevents wasted scan time
- Matches Jack's design philosophy
- Simple implementation

**Cons:**
- Requires early target parsing
- Might frustrate users in rare edge cases

### Option B: Auto-Skip ARP Phase with Warning

**Behavior**: Detect remote targets, automatically skip ARP, run TCP/UDP only.

**Pros:**
- Graceful degradation
- Scan still completes
- No user intervention needed

**Cons:**
- **Violates explicit philosophy** - auto-magical behavior
- User specified `-mA+T` but gets `-mT` silently
- Confusing: "Why no ARP output?"
- Behavior varies by target (inconsistent)

### Option C: Mixed Local/Remote Filtering

**Behavior**: ARP local targets only, TCP/UDP all targets (filtered locally, unfiltered remote).

**Pros:**
- Handles mixed target lists
- Maximum flexibility

**Cons:**
- **Complex implementation**
- Inconsistent filtering logic
- Hard to explain behavior
- Over-engineered for rare use case

### Option D: Require --force-remote Flag

**Behavior**: Error by default, allow with explicit flag and confirmation.

**Pros:**
- Explicit user acknowledgment
- Fail-safe default
- Opt-in for advanced users

**Cons:**
- Adds CLI flag
- Slightly more user burden
- Still allows meaningless operation

---

## Decision Outcome

**Chosen Option**: **Option A (Fail Early) + Optional --force-remote Flag**

### Implementation Strategy

1. **Parse targets early** before workunit generation
2. **Detect locality** by comparing target subnet to interface subnet
3. **Validate compound modes** that start with ARP phase
4. **Error gracefully** with helpful message and alternatives
5. **Support override** via `--force-remote` for edge cases

### Error Message Template

```
ERROR: Compound mode -mA+T requires targets on local network

Target:    8.8.8.0/24 (remote, 1+ hops away)
Interface: eth0 (192.168.1.5/24)

ARP scanning only works on Layer 2 broadcast domain (local network).
Remote hosts will not respond to ARP requests.

Alternatives:
  1. Use -mT to skip ARP phase entirely
  2. Scan local network: -mA+T 192.168.1.0/24
  3. Force anyway: add --force-remote (ARP will find nothing)

Example:
  unicornscan -mT 8.8.8.0/24 -r1000
```

### Rationale

This approach:
- **Respects Jack's philosophy**: Explicit, not auto-magical
- **Educates users**: Explains networking fundamentals
- **Prevents footguns**: Stops impossible operations early
- **Maintains flexibility**: `--force-remote` for unforeseen cases
- **Keeps code simple**: Straightforward validation logic

---

## Comparison to Ecosystem Tools

| Tool | Approach | Philosophy |
|------|----------|------------|
| **Nmap** | Auto-detect, auto-skip ARP for remote | Convenience first |
| **Masscan** | Require `--router-mac`, fail without | Expert tool, minimal hand-holding |
| **Unicornscan** | Fail early, explain why, suggest fix | **Explicit + Educational** |

Unicornscan's approach balances explicitness (like masscan) with helpfulness (better than masscan's terse errors), without sacrificing explicitness (unlike nmap's auto-magic).

---

## Consequences

### Positive

- Users learn why ARP won't work for remote targets
- No time wasted on impossible scans
- Behavior is predictable and documented
- Error messages guide users to correct usage
- Simple codebase without special-case logic

### Negative

- Requires target parsing before workunit generation (earlier than current flow)
- Users must explicitly acknowledge remote scanning (via flag)
- May frustrate users expecting nmap-like auto-adjustment

### Neutral

- Adds one CLI flag (`--force-remote`)
- Requires subnet/routing table access for detection

---

## Implementation Notes

### Target Locality Detection

```c
/**
 * Check if target is on local Layer 2 network
 * Returns: 1 if local, 0 if remote, -1 on error
 */
int is_local_target(uint32_t target_ip, const struct intf_entry *iface) {
    uint32_t net_addr = iface->intf_addr.addr_ip & iface->intf_addr.addr_bits;
    uint32_t bcast_addr = net_addr | (~iface->intf_addr.addr_bits);

    return (target_ip >= net_addr && target_ip <= bcast_addr);
}
```

### Validation Hook

```c
// In scan_parsemode_compound()
if (phases[0].mode == MODE_ARPSCAN) {
    if (!settings->force_remote && has_remote_targets(settings->target_spec)) {
        print_remote_target_error(settings->target_spec, settings->interface);
        return -1; // Fail parse
    }
}
```

### New CLI Flag

```c
--force-remote    Allow compound ARP mode for remote targets (ARP phase will yield no results)
```

---

## Testing Strategy

| Test Case | Target | Expected Behavior |
|-----------|--------|-------------------|
| Local network | `192.168.1.0/24` | ARP runs, TCP runs on responders |
| Remote network | `8.8.8.0/24` | Error message, exit 1 |
| Remote + flag | `8.8.8.0/24 --force-remote` | Warning, ARP runs (finds nothing), TCP runs all |
| Single-phase | `-mT 8.8.8.0/24` | No validation (ARP not involved) |
| Mixed targets | `192.168.1.0/24,8.8.8.0/24` | Error (contains remote) |

---

## Related Decisions

- **ADR-002** (future): Layer 2 vs Layer 3 sending strategy for TCP/UDP
- **PRD**: Compound Modes (ARP-Filtered Multi-Phase Scanning)
- **PRD**: Layer 2 Packet Sending (ARP Bypass)

---

## References

1. [Nmap Host Discovery Documentation](https://nmap.org/book/man-host-discovery.html)
2. [Masscan README - Router MAC Configuration](https://github.com/robertdavidgraham/masscan#router-mac-address)
3. `docs/research/masscan-high-performance-techniques-analysis.md`
4. `docs/research/compound-mode-remote-target-design.md` (full analysis)
5. [RFC 826 - Ethernet Address Resolution Protocol](https://www.rfc-editor.org/rfc/rfc826)

---

**Author**: System Architecture Designer (Claude Sonnet 4.5)
**Reviewers**: [TBD]
**Supersedes**: N/A
**Superseded by**: N/A
