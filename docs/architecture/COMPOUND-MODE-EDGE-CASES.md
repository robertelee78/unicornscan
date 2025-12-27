# Compound Mode Edge Cases Analysis

**Analysis Date**: 2025-12-23
**Analyzer**: System Architecture Designer
**Status**: Research & Recommendations
**Related**: ADR-001, PRD: Compound Modes, mode-parsing-qa.md

---

## Executive Summary

This document analyzes six edge case scenarios for compound mode syntax (`-mA+T`, `-mA+U`, `-mA+T+U`). For each, we recommend whether to **Handle** (add validation/logic), **Ignore** (not worth complexity), or **Document only** (user's responsibility).

**Philosophy**: Jack Louis's principle of "simple and explicit" — avoid over-engineering rare cases, but fail cleanly when users make mistakes.

---

## Edge Case 1: Mixed Local/Remote Targets

**Scenario**: User specifies targets where some are local and some are remote:
```bash
unicornscan -mA+T 192.168.1.0/24,8.8.8.0/24
```

**Problem**: ARP phase only works for local network (192.168.1.0/24). Remote targets (8.8.8.0/24) won't respond to ARP, resulting in:
- Phase 1 (ARP): Discovers 192.168.1.0/24, nothing from 8.8.8.0/24
- Phase 2 (TCP): Only scans discovered IPs (missing 8.8.8.0/24 entirely)

**Current Behavior** (if implemented): ADR-001 detects "contains remote" and errors with explanation

**Recommendation**: **HANDLE**

**Rationale**:
- This violates ADR-001's remote target detection logic
- User likely made a mistake (copy-paste error, mixed target lists)
- Silent behavior would be confusing: "Why wasn't 8.8.8.0/24 scanned?"
- Cost to detect: Minimal (reuse existing locality check, apply to any target in list)

**Implementation**:

```c
// In scan_parsemode() after detecting compound mode with ARP phase
if (phases[0].mode == MODE_ARPSCAN && !settings->force_remote) {
    // Check if ANY target is remote
    if (has_any_remote_targets(settings->target_spec, settings->interface)) {
        print_mixed_target_error(settings->target_spec);
        return -1;  // Fail parsing
    }
}

// Error message (similar to ADR-001):
/*
ERROR: Compound mode -mA+T detected mixed local/remote targets

Targets: 192.168.1.0/24,8.8.8.0/24
Interface: eth0 (192.168.1.5/24)

ARP scanning only works on Layer 2 broadcast domain (local network).
Remote targets (8.8.8.0/24) will be skipped in phase 2+.

Recommended fixes:
  1. Scan local and remote separately:
     unicornscan -mA+T 192.168.1.0/24       # Local ARP+TCP
     unicornscan -mT 8.8.8.0/24              # Remote TCP only

  2. Use separate modes per target:
     unicornscan 192.168.1.0/24:mA+T 8.8.8.0/24:mT

  3. Force anyway (ARP finds nothing for remote):
     unicornscan -mA+T 192.168.1.0/24,8.8.8.0/24 --force-remote
*/
```

**Testing**:
- `unicornscan -mA+T 192.168.1.0/24,8.8.8.0/24` → Error message + exit
- `unicornscan -mA+T 192.168.1.0/24,8.8.8.0/24 --force-remote` → Warning, runs (but ARP finds nothing for 8.8.8.0/24)

---

## Edge Case 2: Zero ARP Responses

**Scenario**: ARP phase completes but nobody on the network responds:
```bash
unicornscan -mA+T 192.168.1.0/24
# No devices reply to ARP requests
```

**Problem**: Phase 1 (ARP) discovers nothing → Phase 2 (TCP) has no targets to scan → Scan completes silently with zero results

**Current Behavior**: Silent filtering (no warning)

**Recommendation**: **HANDLE** (add informational message)

**Rationale**:
- Not an error (valid scenario: network truly empty, or ARP blocked)
- User should know why scan produced zero results
- Low cost: Check result count after ARP phase, emit diagnostic
- Helps distinguish: "No hosts found" vs. "Found hosts but no open ports"

**Implementation**:

```c
// After phase 1 (ARP) completion in execute_compound_scan()
if (s->ss->current_phase == 0 && s->ss->num_phases > 1) {
    // Phase 0 = ARP (if compound starts with A)
    uint32_t arp_respondents = count_discovered_targets();

    if (arp_respondents == 0) {
        VRB(0, "WARNING: ARP phase completed with zero responses");
        VRB(0, "         No hosts discovered on network %s", target_spec);
        VRB(0, "         Skipping phase 2+ (no targets)");

        // Could exit early or proceed to empty phase 2
        if (!settings->continue_on_empty) {
            return 1;  // Skip remaining phases
        }
    } else {
        VRB(1, "ARP phase discovered %u host(s) for phase 2+", arp_respondents);
    }
}
```

**Behavior**:
- Normal case: `ARP phase discovered 50 host(s) for phase 2+`
- Zero case: `WARNING: ARP phase completed with zero responses`
- User sees clear reason for empty results

**Testing**:
- Empty LAN: `unicornscan -mA+T 192.168.1.0/24` → Warning message, exit or skip
- Full LAN: `unicornscan -mA+T 192.168.1.0/24` → "Discovered 50 host(s)"

---

## Edge Case 3: ARP Not First Phase

**Scenario**: User specifies ARP after another protocol:
```bash
unicornscan -mT+A 192.168.1.1:80
unicornscan -mT+A+U 192.168.1.1:80
```

**Problem**: ARP discovers hosts *after* TCP scanning them — useless filtering:
- Phase 1 (TCP): Scans with default L3 packets (wastes time)
- Phase 2 (ARP): Discovers MACs (too late for phase 1)
- Phase 3 (UDP): Uses MACs from phase 2 (ok, but phase 1 didn't benefit)

**Current Behavior** (if implemented): No validation, allows it

**Recommendation**: **HANDLE** (add warning or reject)

**Rationale**:
- User likely made a mistake (intended `-mA+T`)
- ARP benefit only applies to phases *after* it
- Simple validation with zero cost
- Two options:
  - **Strict**: Reject with error (Jack's "explicit" philosophy)
  - **Lenient**: Warn but allow (user might have edge case)

**Implementation (Strict)**:

```c
// In scan_parsemode_compound() after parsing all phases
// Check if ARP appears before it's needed
int arp_phase = -1, first_tcp_udp = -1;

for (int i = 0; i < num_phases; i++) {
    if (phases[i].mode == MODE_ARPSCAN && arp_phase == -1) {
        arp_phase = i;
    }
    if ((phases[i].mode == MODE_TCPSCAN || phases[i].mode == MODE_UDPSCAN)
        && first_tcp_udp == -1) {
        first_tcp_udp = i;
    }
}

if (arp_phase > first_tcp_udp && first_tcp_udp != -1) {
    ERR("ARP phase should come first to filter subsequent scans");
    ERR("  Specified: -m%s", str);
    ERR("  Consider:  -mA+T+U (ARP first filters both TCP and UDP)", str);
    return -1;
}
```

**Behavior**:
- `unicornscan -mT+A` → Error: "ARP phase should come first"
- `unicornscan -mA+T` → OK, proceeds

**Testing**:
- Wrong order: `unicornscan -mT+A 192.168.1.1` → Error
- Right order: `unicornscan -mA+T 192.168.1.1` → OK

---

## Edge Case 4: Multiple ARP Phases

**Scenario**: User redundantly specifies ARP twice:
```bash
unicornscan -mA+A 192.168.1.0/24
unicornscan -mA+T+A 192.168.1.0/24
```

**Problem**: Duplicate ARP scans waste time and add nothing:
- Phase 0 (ARP): Discovers 50 hosts, builds MAC cache
- Phase 1 (ARP): Rescans same network, builds same MAC cache
- Phase 2 (TCP): Uses MAC cache (could use phase 0's result)

**Current Behavior**: No validation, allows redundant phases

**Recommendation**: **HANDLE** (warn, collapse phases)

**Rationale**:
- Simple to detect and collapse
- Saves user time (no redundant ARP scan)
- Graceful handling: warn but don't error
- Follows Jack's principle: "Don't waste time"

**Implementation**:

```c
// In scan_parsemode_compound() after parsing all phases
// Detect and warn about redundant ARP
int arp_count = 0;
for (int i = 0; i < num_phases; i++) {
    if (phases[i].mode == MODE_ARPSCAN) {
        arp_count++;
        if (arp_count > 1) {
            VRB(0, "WARNING: Multiple ARP phases detected (phases %d and %d)",
                arp_idx[0] + 1, i + 1);
            VRB(0, "         Collapsing to single ARP phase");
            VRB(0, "         To scan separately, use two commands");

            // Collapse: remove this duplicate ARP phase
            for (int j = i; j < num_phases - 1; j++) {
                phases[j] = phases[j + 1];
            }
            num_phases--;
            i--;  // Re-check this index
        }
    }
}
```

**Behavior**:
- `unicornscan -mA+A` → Warn: "Collapsing to single ARP", runs single ARP
- `unicornscan -mA+T+A` → Warn: "Removing redundant ARP phase 3", runs A+T only

**Testing**:
- Redundant: `unicornscan -mA+A 192.168.1.0/24` → Warning, collapses to `-mA`
- Multiple: `unicornscan -mA+T+A 192.168.1.0/24` → Warning, collapses to `-mA+T`

---

## Edge Case 5: Single-Mode Compound Syntax (Trailing Plus)

**Scenario**: User accidentally types trailing `+`:
```bash
unicornscan -mA+ 192.168.1.0/24
unicornscan -mT+ 192.168.1.1:80
```

**Problem**: Parser edge case — is this valid single-mode with plus, or incomplete compound?

**Current Behavior** (if not handled): Undefined (likely parse error or silent acceptance)

**Recommendation**: **HANDLE** (error cleanly)

**Rationale**:
- User almost certainly made a typo
- Trailing `+` with no second phase is invalid syntax
- Clean error helps user fix mistake
- Cost: One regex check

**Implementation**:

```c
// In scan_parsemode() at start
if (strchr(str, '+') != NULL) {
    // It's compound mode (or malformed single with trailing +)

    // Check for trailing + (incomplete compound)
    if (str[strlen(str) - 1] == '+') {
        ERR("incomplete compound mode: '%s' (ends with +)", str);
        ERR("  Expected: -mA+T, -mA+U, -mT+U, etc");
        ERR("  You typed: -m%s", str);
        return -1;
    }

    // Check for double ++ (empty phase)
    if (strstr(str, "++") != NULL) {
        ERR("empty phase in compound mode: '%s' (contains ++)", str);
        ERR("  Expected: -mA+T (no empty phases)", str);
        return -1;
    }

    return scan_parsemode_compound(str, ...);
}
```

**Behavior**:
- `unicornscan -mA+ ...` → Error: "Incomplete compound mode"
- `unicornscan -mA++ ...` → Error: "Empty phase"
- `unicornscan -mA+T ...` → OK

**Testing**:
- Trailing plus: `unicornscan -mA+` → Error
- Double plus: `unicornscan -mA++T` → Error
- Valid: `unicornscan -mA+T` → OK

---

## Edge Case 6: Empty/Malformed Phases

**Scenario**: User types phases with no mode character:
```bash
unicornscan -mA+ 192.168.1.0/24       # No second mode
unicornscan -m123+T 192.168.1.0/24    # First "phase" is just digits
unicornscan -m+T 192.168.1.0/24       # Empty first phase
```

**Problem**: Parser doesn't know what mode to run

**Current Behavior** (if not handled): Undefined behavior

**Recommendation**: **HANDLE** (error with guidance)

**Rationale**:
- Same as Edge Case 5 — user made typo
- Failing cleanly prevents confusion
- Cost: Straightforward validation in tokenizer

**Implementation**:

```c
// In scan_parsemode_compound() after tokenizing on '+'
for (int i = 0; i < num_phases; i++) {
    const char *phase_token = phases_list[i];

    if (phase_token == NULL || strlen(phase_token) == 0) {
        ERR("empty phase at position %d", i + 1);
        return -1;
    }

    // Check first character is valid mode
    char first_char = phase_token[0];
    if (first_char != 'A' && first_char != 'T' && first_char != 'U'
        && !(first_char == 's' && strlen(phase_token) > 1 && phase_token[1] == 'f')) {
        ERR("invalid mode in phase %d: '%c' (expected A, T, U, or sf)",
            i + 1, first_char);
        ERR("  Expected modes: A (ARP), T (TCP), U (UDP), sf (TCP Connect)");
        return -1;
    }
}
```

**Behavior**:
- `unicornscan -mA+` → Error: "Empty phase at position 2"
- `unicornscan -m+T` → Error: "Empty phase at position 1"
- `unicornscan -m123+T` → Error: "Invalid mode '1' (expected A,T,U,sf)"

**Testing**:
- No second mode: `unicornscan -mA+` → Error
- Leading plus: `unicornscan -m+T` → Error
- Non-mode chars: `unicornscan -m123+T` → Error

---

## Summary Table: Decision Matrix

| Edge Case | Scenario | Recommendation | Cost | Risk | Impact |
|-----------|----------|---|---|---|---|
| 1. Mixed local/remote | `-mA+T 192.168.1.0/24,8.8.8.0/24` | **HANDLE** | Low | Low | User clarity |
| 2. Zero ARP responses | ARP phase empty → TCP has no targets | **HANDLE** | Low | None | Diagnostic info |
| 3. ARP not first | `-mT+A` (backward order) | **HANDLE** | Very Low | None | User correctness |
| 4. Multiple ARP phases | `-mA+A` or `-mA+T+A` | **HANDLE** | Low | Low | Performance |
| 5. Trailing plus | `-mA+` (incomplete) | **HANDLE** | Very Low | None | Parser clarity |
| 6. Empty/malformed phases | `-m+T` or `-m123+T` | **HANDLE** | Very Low | None | Parser clarity |

**Total Effort**: ~6-8 hours for all six validations (mostly parser improvements)

---

## Implementation Priority

**Phase 1 (Must-Have)**: Edges 1, 3, 5, 6
- These are parser responsibilities
- Prevent user mistakes early
- Cost: ~4 hours

**Phase 2 (Should-Have)**: Edge 2
- User diagnostic info
- Cost: ~1 hour
- Defer if time-constrained

**Phase 3 (Nice-to-Have)**: Edge 4
- Performance optimization (non-critical)
- Cost: ~1 hour
- Lowest priority

---

## Integration with Existing Code

All validations fit cleanly into `scan_parsemode_compound()` (new function from mode-parsing-qa.md):

```c
int scan_parsemode_compound(const char *str, scan_phase_t **phases,
                            int *num_phases, uint32_t *pps) {
    // 1. Check for incomplete compound (Edge 5)
    if (str[strlen(str) - 1] == '+') {
        ERR("incomplete compound mode: %s", str);
        return -1;
    }

    // 2. Check for empty phases (Edge 6)
    if (strstr(str, "++") != NULL) {
        ERR("empty phase in mode: %s", str);
        return -1;
    }

    // 3. Tokenize on '+'
    char *mode_copy = xstrdup(str);
    char *phase_token, *saveptr;
    int phase_idx = 0;

    for (phase_token = strtok_r(mode_copy, "+", &saveptr);
         phase_token != NULL && phase_idx < 8;
         phase_token = strtok_r(NULL, "+", &saveptr)) {

        // 4. Validate phase token (Edge 6)
        if (strlen(phase_token) == 0 || !is_valid_mode_token(phase_token)) {
            ERR("invalid phase '%s'", phase_token);
            return -1;
        }

        // 5. Parse phase
        parse_single_phase(phase_token, &(*phases)[phase_idx]);
        phase_idx++;
    }

    *num_phases = phase_idx;

    // 6. Check if ARP is not first (Edge 3)
    if ((*phases)[0].mode != MODE_ARPSCAN && has_arp_phase(*phases, phase_idx)) {
        ERR("ARP phase must come first");
        return -1;
    }

    // 7. Check for duplicate ARP (Edge 4)
    check_and_collapse_duplicate_arp(*phases, num_phases);

    // 8. Check for mixed local/remote (Edge 1) — done in caller
    // (handled at workunit level, not here)

    xfree(mode_copy);
    return 1;
}
```

---

## Testing Strategy

**Unit Tests** (in test_compound_modes.c):

```c
void test_mixed_local_remote(void) {
    // Should error on mixed targets
    assert(scan_parsemode_compound("A+T", ...) == 1);  // Valid
    assert(settings->has_remote == true);              // Flag set
    assert(workunit_add(...) == -1);                   // Later rejects
}

void test_zero_arp_responses(void) {
    // ARP completes with 0 responses, logs warning
    execute_compound_scan();
    assert(log_contains("WARNING: ARP phase completed with zero responses"));
}

void test_arp_not_first(void) {
    // Should error on T+A
    assert(scan_parsemode_compound("T+A", ...) == -1);
}

void test_multiple_arp_phases(void) {
    // Should warn and collapse A+A
    assert(scan_parsemode_compound("A+A", ...) == 1);
    assert(num_phases == 1);
    assert(log_contains("Collapsing to single ARP"));
}

void test_trailing_plus(void) {
    // Should error on A+
    assert(scan_parsemode_compound("A+", ...) == -1);
}

void test_empty_phases(void) {
    // Should error on A++T or +T
    assert(scan_parsemode_compound("A++T", ...) == -1);
    assert(scan_parsemode_compound("+T", ...) == -1);
}
```

**Integration Tests**:

```bash
# Edge 1: Mixed targets
unicornscan -mA+T 192.168.1.0/24,8.8.8.0/24  # Should error
unicornscan -mA+T 192.168.1.0/24,8.8.8.0/24 --force-remote  # Should warn

# Edge 2: Zero ARP
# (network truly empty — manual test)

# Edge 3: Wrong order
unicornscan -mT+A 192.168.1.1  # Should error

# Edge 4: Redundant ARP
unicornscan -mA+A 192.168.1.0/24  # Should warn, collapse

# Edge 5: Trailing plus
unicornscan -mA+ 192.168.1.1  # Should error

# Edge 6: Malformed
unicornscan -m+T 192.168.1.1  # Should error
```

---

## Relationship to Existing ADRs

**ADR-001** (Remote Target Handling):
- Edge 1 extends ADR-001 to handle mixed targets
- Implementation uses same `is_local_target()` function
- Complements "fail early" philosophy

**ADR-002** (Planned — Layer 2 vs Layer 3):
- Edges 3, 4 relate to phase ordering (which determines L2/L3 sending)
- These edge cases validate the ordering constraints

---

## Jack Louis Philosophy Alignment

**Simplicity**:
- All validations are straightforward checks
- No special-case logic or magical adjustments
- Parser explicitly rejects invalid inputs

**Explicitness**:
- Clear error messages guide user to correct syntax
- No silent adjustments (except collapsing duplicate ARP with warning)
- User always knows why operation was rejected

**Performance**:
- Edge 1: Fails early, saves time on impossible scans
- Edge 2: Warns when ARP yields nothing, helps debug
- Edge 4: Collapses redundant ARP, saves scan time

**Maintainability**:
- All logic in parser (single place)
- No new execution-time complexity
- Tests validate each edge independently

---

## Conclusion

**All six edge cases should be handled**, with recommendations:

1. **Mixed local/remote**: Error immediately ✓
2. **Zero ARP responses**: Log warning during execution ✓
3. **ARP not first**: Error in parser ✓
4. **Multiple ARP phases**: Warn and collapse ✓
5. **Trailing plus**: Error in parser ✓
6. **Empty phases**: Error in parser ✓

**Total Implementation**: 6-8 hours for all validations
**Code Footprint**: ~150 lines in scanopts.c + ~50 lines tests
**Risk Level**: Low (isolated parser changes, no execution changes)
**User Impact**: High (prevents confusion, saves time, educational errors)

This approach respects Jack's design philosophy while keeping compound mode syntax robust and user-friendly.

---

**Author**: System Architecture Designer
**Date**: 2025-12-23
**Status**: Recommended Implementation Plan
