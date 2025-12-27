# Compound Mode Edge Cases: Executive Summary

**Date**: 2025-12-23
**Audience**: Project maintainers, developers
**Documents**: COMPOUND-MODE-EDGE-CASES.md, COMPOUND-MODE-VALIDATION-CHECKLIST.md

---

## What Are Compound Modes?

Compound modes enable multi-phase scanning where ARP discovery filters targets for subsequent TCP/UDP phases:

```bash
unicornscan -mA+T 192.168.1.0/24     # Phase 1: ARP, Phase 2: TCP on discovered hosts
unicornscan -mA+U 192.168.1.0/24     # Phase 1: ARP, Phase 2: UDP
unicornscan -mA+T+U 192.168.1.0/24   # Phase 1: ARP, Phase 2: TCP, Phase 3: UDP
```

**Implementation Status**: Parsing planned (mode-parsing-qa.md), execution design in progress

---

## Six Edge Cases Identified

| # | Edge Case | Scenario | Recommendation | Cost |
|---|-----------|----------|---|---|
| 1 | **Mixed local/remote targets** | `-mA+T 192.168.1.0/24,8.8.8.0/24` | **HANDLE** - Error immediately | Low |
| 2 | **Zero ARP responses** | ARP finds nothing, TCP has empty target list | **HANDLE** - Warn user | Low |
| 3 | **ARP not first** | `-mT+A` (backward order) | **HANDLE** - Error in parser | Very Low |
| 4 | **Duplicate ARP phases** | `-mA+A` or `-mA+T+A` | **HANDLE** - Warn + collapse | Low |
| 5 | **Trailing plus** | `-mA+` (incomplete syntax) | **HANDLE** - Error cleanly | Very Low |
| 6 | **Empty/malformed phases** | `-m+T` or `-m123+T` | **HANDLE** - Error with guidance | Very Low |

**Recommendation**: Handle all six (6-8 hours effort, ~350 lines of code)

---

## Key Principles (Jack Louis Philosophy)

1. **Simple & Explicit**: No magical adjustments, fail clearly when user makes mistakes
2. **Performance-First**: Fail early (don't waste time), collapse redundant operations
3. **Maintainability**: All logic in parser, reuse existing code, no special cases
4. **Educational**: Error messages guide users to correct syntax

---

## What To Do

### For Each Edge Case:

| Case | Action | Where | When |
|------|--------|-------|------|
| 1. Mixed targets | Error with helpful message | workunits.c | Parse time |
| 2. Zero ARP results | Warn user | sender.c | After ARP phase |
| 3. ARP not first | Error in parser | scanopts.c | Parse time |
| 4. Duplicate ARP | Warn + collapse | scanopts.c | Parse time |
| 5. Trailing plus | Error in parser | scanopts.c | Parse time |
| 6. Malformed phases | Error in parser | scanopts.c | Parse time |

### Error Handling Strategy:

**Parser Errors** (5 cases - scanopts.c):
```
Fail immediately with:
- What you typed
- What's wrong
- How to fix it
- Working examples
```

**Execution Warnings** (1 case - sender.c):
```
Inform user during scan:
- What happened (ARP found 0 hosts)
- Why it matters (TCP has nothing to scan)
- What comes next (continue or skip)
```

**Mixed Targets Special Case** (1 case - workunits.c):
```
Integrate with ADR-001 (remote target handling):
- Add --force-remote override flag
- Fail by default with educational message
- Allow user to proceed at their own risk
```

---

## Implementation: Three Categories

### Category A: Parser Validation (4-5 hours)
Files: `scanopts.c`, `scanopts.h`, `scan_export.h`

**Handles**: Edges 3, 4, 5, 6

**What to add**:
1. New function: `scan_parsemode_compound()` (~120 lines)
2. Modify: `scan_parsemode()` to detect `+` delimiter (~10 lines)
3. New structure: `scan_phase_t` (~5 lines)
4. Extend structure: `scan_settings_t` with phase fields (~3 lines)

**Result**: Parser rejects all invalid syntax with clear messages

### Category B: Workunit Validation (1-2 hours)
Files: `workunits.c`, `getconfig.c`

**Handles**: Edge 1 (mixed local/remote)

**What to add**:
1. New function: `validate_compound_mode_targets()` (~30 lines)
2. New CLI flag: `--force-remote` (~10 lines)
3. Call validation after target parsing

**Result**: Fails early for mixed local/remote, explains why

### Category C: Execution Diagnostic (1 hour)
Files: `sender.c`

**Handles**: Edge 2 (zero ARP responses)

**What to add**:
1. Check after ARP phase: count discovered hosts (~20 lines)
2. If zero: warn user with diagnostic info

**Result**: User informed why scan yielded no results

---

## Example Implementations

### Error Message for Mixed Targets (Edge 1)

```
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
```

### Error Message for ARP Not First (Edge 3)

```
ERROR: ARP phase must come first to filter subsequent scans

You specified: -mT+A
  Phase 1: TCP (no MAC filtering yet)
  Phase 2: ARP (too late to help phase 1)

Consider: -mA+T
  Phase 1: ARP (discovers hosts)
  Phase 2: TCP (uses MACs from phase 1)
```

### Warning for Zero ARP Responses (Edge 2)

```
WARNING: ARP phase completed with zero responses
         No hosts discovered on network 192.168.1.0/24
         Phase 2+ will have no targets to scan

(Network may be empty, ARP blocked, or targets remote)

Continuing to phase 2+ (expecting no results)
```

---

## Testing Approach

**Unit Tests** (10 test cases in test_compound_mode_validation.c):
- Trailing plus: `-mA+` → Error
- Empty phase: `-mA++T` → Error
- Invalid mode: `-mX+T` → Error
- ARP not first: `-mT+A` → Error
- Valid compound: `-mA+T` → OK
- Valid with flags: `-mA+Tsf` → OK
- Duplicate collapse: `-mA+A` → Collapse with warning

**Integration Tests**:
- Error on mixed targets
- Warning on zero ARP responses
- `--force-remote` override works
- Single-mode scans still work (regression)

---

## Timeline

**If implementing in 2 weeks**:

| Week | Phase | Deliverables |
|------|-------|---|
| 1 | Parser | All parser validations (Edges 3,4,5,6) + unit tests |
| 1 | Targets | Mixed local/remote check (Edge 1) + integration tests |
| 2 | Execution | Zero ARP warning (Edge 2) |
| 2 | Documentation | Man page, examples, error message review |

**Total Effort**: 6-8 hours development, 4-6 hours testing, 2-3 hours documentation

---

## Risk Assessment

**Low Risk**:
- Parser changes are isolated (conditional path)
- Existing single-mode parsing unchanged
- Uses existing utility functions (`decode_tcpflags`, etc.)
- New structures backward compatible

**Medium Risk**:
- Workunit phase linking (new dependency tracking)
- Execution sequencing (multi-phase coordination)

**Mitigation**:
- Comprehensive unit tests
- Conservative approach (fail fast on uncertainty)
- Thorough integration testing before release
- User documentation of limitations

---

## Design Philosophy Alignment

| Principle | How This Addresses It |
|-----------|---|
| **Simple** | Validation logic in parser, reuses existing code |
| **Explicit** | No silent adjustments; errors with guidance |
| **Performance** | Fail early (don't waste time), collapse redundant ops |
| **Maintainable** | Isolated parser changes, clear structure |
| **Educational** | Error messages explain why and how to fix |

---

## Files to Create/Modify

**Create**:
- `/docs/architecture/COMPOUND-MODE-EDGE-CASES.md` ✓
- `/docs/architecture/COMPOUND-MODE-VALIDATION-CHECKLIST.md` ✓
- `/tests/test_compound_mode_validation.c` (new)

**Modify**:
- `src/scan_progs/scanopts.c` (add `scan_parsemode_compound()`, hook in `scan_parsemode()`)
- `src/scan_progs/scanopts.h` (add `scan_phase_t`, extend `scan_settings_t`)
- `src/scan_progs/scan_export.h` (add declarations)
- `src/scan_progs/workunits.c` (add mixed target validation)
- `src/getconfig.c` (add `--force-remote` flag)
- `src/scan_progs/sender.c` (add zero ARP warning)

---

## Next Steps

1. **Review** this summary with project maintainers
2. **Approve** recommendations (all six edge cases handled)
3. **Assign** developer time (6-8 hours estimated)
4. **Create feature branch** `compound-mode-validation`
5. **Implement Phase 1** (parser) with unit tests
6. **Test** thoroughly before Phase 2
7. **Get feedback** from real usage (if applicable)
8. **Document** final behavior in user-facing materials

---

## Related Documents

- **COMPOUND-MODE-EDGE-CASES.md** - Detailed analysis of each edge case
- **COMPOUND-MODE-VALIDATION-CHECKLIST.md** - Implementation step-by-step
- **ADR-001** - Remote target handling (foundation)
- **mode-parsing-qa.md** - Mode parsing architecture (foundation)

---

## Quick Reference: What to Handle

```c
// Edge 1: Mixed local/remote
unicornscan -mA+T 192.168.1.0/24,8.8.8.0/24
→ ERROR: Mixed local/remote targets with ARP phase

// Edge 2: Zero ARP responses
unicornscan -mA+T 192.168.1.0/24  # Network empty
→ WARNING: ARP phase found zero hosts

// Edge 3: ARP not first
unicornscan -mT+A 192.168.1.0/24
→ ERROR: ARP phase must come first

// Edge 4: Duplicate ARP
unicornscan -mA+A 192.168.1.0/24
→ WARNING: Collapsing duplicate ARP phase

// Edge 5: Trailing plus
unicornscan -mA+ 192.168.1.0/24
→ ERROR: Incomplete compound mode

// Edge 6: Malformed
unicornscan -m+T 192.168.1.0/24
→ ERROR: Empty phase at position 1
```

---

**Status**: Analysis Complete, Ready for Implementation
**Confidence**: High (all cases have clear solutions, low implementation risk)
**Impact**: Improves user experience, prevents silent failures, educates users
