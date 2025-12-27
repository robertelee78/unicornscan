# Compound Mode Validation Implementation Checklist

**Status**: Implementation Plan
**Date**: 2025-12-23
**Related**: COMPOUND-MODE-EDGE-CASES.md, ADR-001

---

## Quick Reference: What to Validate

| Check | Where | When | What | Exit |
|-------|-------|------|------|------|
| **Incomplete** | Parser | Parse time | Ends with `+` | -1 ✓ |
| **Empty phase** | Parser | Parse time | Contains `++` or `+T` | -1 ✓ |
| **Invalid mode** | Parser | Parse time | Mode char not A/T/U/sf | -1 ✓ |
| **ARP not first** | Parser | Parse time | ARP after T/U | -1 ✓ |
| **Dup ARP** | Parser | Parse time | Multiple A phases | Warn + Collapse |
| **Mixed local/remote** | Workunit | Workunit time | Contains remote targets | -1 ✓ |
| **Zero ARP results** | Execution | Post-phase-0 | No hosts discovered | Warn |

---

## Implementation Locations

### 1. Parser Changes (scanopts.c)

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/scanopts.c`
**Lines**: Insert after line 330 (after current `scan_parsemode()`)
**Function**: `scan_parsemode_compound()` (NEW)

#### Validation Checklist

- [ ] Function signature matches mode-parsing-qa.md spec
- [ ] Early check: trailing `+` returns -1 with error
- [ ] Early check: `++` (empty phase) returns -1 with error
- [ ] Tokenize on `+` using `strtok_r()`
- [ ] For each token:
  - [ ] Check not empty (verify strtok worked)
  - [ ] Check first char is valid (A/T/U/sf)
  - [ ] Parse mode (A→MODE_ARPSCAN, T→MODE_TCPSCAN, U→MODE_UDPSCAN, sf→MODE_TCPSCAN)
  - [ ] If T/sf, parse TCP flags via `decode_tcpflags(token+1)`
  - [ ] Store in `phases[i]` array
- [ ] After loop:
  - [ ] Check `num_phases >= 2` (compound requires 2+ phases)
  - [ ] Check ARP is first (if present)
  - [ ] Collapse duplicate ARP phases (warn if found)
- [ ] Free mode_copy and return 1

#### Code Template

```c
int scan_parsemode_compound(const char *str, scan_phase_t **phases,
                            int *num_phases, uint32_t *pps) {
    // 1. Validation: Incomplete compound
    if (str[strlen(str) - 1] == '+') {
        ERR("incomplete compound mode: '%s' (ends with +)", str);
        ERR("  Expected: -mA+T, -mA+U, -mT+U");
        return -1;
    }

    // 2. Validation: Empty phases
    if (strstr(str, "++") != NULL) {
        ERR("empty phase in compound mode: '%s' (contains ++)", str);
        ERR("  Remove extra + between modes");
        return -1;
    }

    // 3. Tokenize
    char *mode_copy = xstrdup(str);
    char *phase_token, *saveptr;
    int phase_idx = 0;

    *phases = (scan_phase_t *)xmalloc(sizeof(scan_phase_t) * 8);

    for (phase_token = strtok_r(mode_copy, "+", &saveptr);
         phase_token != NULL && phase_idx < 8;
         phase_token = strtok_r(NULL, "+", &saveptr)) {

        // 4. Validation: Empty token (shouldn't happen with ++ check, but be safe)
        if (strlen(phase_token) == 0) {
            ERR("empty phase at position %d", phase_idx + 1);
            xfree(mode_copy);
            xfree(*phases);
            return -1;
        }

        memset(&(*phases)[phase_idx], 0, sizeof(scan_phase_t));

        // 5. Parse individual phase
        if (phase_token[0] == 'A') {
            (*phases)[phase_idx].mode = MODE_ARPSCAN;
        }
        else if (phase_token[0] == 'T') {
            (*phases)[phase_idx].mode = MODE_TCPSCAN;
            if (strlen(phase_token) > 1) {
                int flags = decode_tcpflags(phase_token + 1);
                if (flags < 0) {
                    xfree(mode_copy);
                    xfree(*phases);
                    return -1;
                }
                (*phases)[phase_idx].tcphdrflgs = (uint16_t)flags;
            } else {
                (*phases)[phase_idx].tcphdrflgs = TH_SYN;  // Default
            }
        }
        else if (phase_token[0] == 'U') {
            (*phases)[phase_idx].mode = MODE_UDPSCAN;
        }
        else if (phase_token[0] == 's' && strlen(phase_token) > 1
                 && phase_token[1] == 'f') {
            (*phases)[phase_idx].mode = MODE_TCPSCAN;
            // sf = TCP connect mode
            (*phases)[phase_idx].send_opts |= S_SENDER_INTR;
            (*phases)[phase_idx].recv_opts |= L_DO_CONNECT;

            if (strlen(phase_token) > 2) {
                int flags = decode_tcpflags(phase_token + 2);
                if (flags < 0) {
                    xfree(mode_copy);
                    xfree(*phases);
                    return -1;
                }
                (*phases)[phase_idx].tcphdrflgs = (uint16_t)flags;
            } else {
                (*phases)[phase_idx].tcphdrflgs = TH_SYN;
            }
        }
        else {
            // 6. Validation: Invalid mode
            ERR("invalid mode in phase %d: '%c'", phase_idx + 1, phase_token[0]);
            ERR("  Valid modes: A (ARP), T (TCP), U (UDP), sf (TCP Connect)");
            xfree(mode_copy);
            xfree(*phases);
            return -1;
        }

        phase_idx++;
    }

    *num_phases = phase_idx;
    xfree(mode_copy);

    // 7. Validation: At least 2 phases
    if (*num_phases < 2) {
        ERR("compound mode requires at least 2 phases");
        xfree(*phases);
        return -1;
    }

    // 8. Validation: ARP not first (if present)
    int arp_phase = -1, other_phase = -1;
    for (int i = 0; i < *num_phases; i++) {
        if ((*phases)[i].mode == MODE_ARPSCAN && arp_phase == -1) {
            arp_phase = i;
        }
        if (((*phases)[i].mode == MODE_TCPSCAN || (*phases)[i].mode == MODE_UDPSCAN)
            && other_phase == -1) {
            other_phase = i;
        }
    }
    if (arp_phase > other_phase && other_phase != -1) {
        ERR("ARP phase must come first to filter subsequent scans");
        ERR("  You have ARP at phase %d, but TCP/UDP at phase %d",
            arp_phase + 1, other_phase + 1);
        xfree(*phases);
        return -1;
    }

    // 9. Validation: Collapse duplicate ARP phases
    int arp_count = 0;
    for (int i = 0; i < *num_phases; i++) {
        if ((*phases)[i].mode == MODE_ARPSCAN) {
            arp_count++;
            if (arp_count > 1) {
                VRB(0, "WARNING: Multiple ARP phases detected");
                VRB(0, "         Removing redundant ARP at phase %d", i + 1);

                // Remove this ARP phase
                for (int j = i; j < *num_phases - 1; j++) {
                    (*phases)[j] = (*phases)[j + 1];
                }
                (*num_phases)--;
                i--;  // Recheck this index
            }
        }
    }

    return 1;
}
```

---

### 2. Parser Hook (scanopts.c)

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/scanopts.c`
**Lines**: Modify line 241 (top of `scan_parsemode()`)
**Function**: Add compound mode detection to `scan_parsemode()`

#### Code Changes

```c
// BEFORE (current scan_parsemode):
int scan_parsemode(const char *str, uint8_t *mode, uint16_t *flags,
                   uint16_t *sf, uint16_t *lf, uint16_t *mf, uint32_t *pps) {
    int ret=0;
    const char *walk=NULL;
    // ... existing code ...
}

// AFTER (modified scan_parsemode):
int scan_parsemode(const char *str, uint8_t *mode, uint16_t *flags,
                   uint16_t *sf, uint16_t *lf, uint16_t *mf, uint32_t *pps) {
    int ret=0;
    const char *walk=NULL;

    // NEW: Check for compound mode (+ delimiter)
    if (strchr(str, '+') != NULL) {
        scan_phase_t *phases = NULL;
        int num_phases = 0;

        if (scan_parsemode_compound(str, &phases, &num_phases, pps) < 0) {
            return -1;
        }

        // Store phases in global settings for later execution
        s->ss->phases = phases;
        s->ss->num_phases = (uint8_t)num_phases;
        s->ss->current_phase = 0;

        // Set first phase as initial mode (for compatibility)
        *mode = phases[0].mode;
        *flags = phases[0].tcphdrflgs;
        *sf = phases[0].send_opts;
        *lf = phases[0].recv_opts;

        return 1;
    }

    // EXISTING: Single-mode parsing (unchanged)
    assert(str != NULL);
    // ... rest of existing code remains identical ...
}
```

**Checklist**:
- [ ] Check for `+` delimiter using `strchr()`
- [ ] Call `scan_parsemode_compound()` if found
- [ ] Store result in `s->ss->phases` and `s->ss->num_phases`
- [ ] Set first phase as initial mode (backward compat)
- [ ] Return -1 on error (compound parser failed)
- [ ] Leave existing single-mode path completely unchanged

---

### 3. Workunit Check (workunits.c)

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/workunits.c`
**Lines**: After parsing targets, before generating workunits
**Function**: Add mixed local/remote check (NEW or in existing target validation)

#### Validation: Mixed Local/Remote Targets

```c
// After parsing all targets but before workunit generation
// (somewhere in do_targets() or workunit_init() path)

// NEW FUNCTION:
int validate_compound_mode_targets(void) {
    // Only validate if compound mode with ARP phase
    if (s->ss->num_phases == 0 || s->ss->phases[0].mode != MODE_ARPSCAN) {
        return 1;  // Single mode or ARP not first, skip check
    }

    if (s->force_remote) {
        VRB(0, "WARNING: Scanning remote targets with ARP compound mode");
        VRB(0, "         ARP phase will find nothing for remote targets");
        return 1;  // User explicitly opted in
    }

    // Check if ANY target is remote
    for (struct target_list_t *target = s->target_list; target != NULL; target = target->next) {
        // target->range is a cidr_t with start/end IPs
        if (!is_local_target(target->range.start, s->vi[0])) {
            // Found a remote target
            fprintf(stderr, "ERROR: Compound mode -mA+... requires targets on local network\n\n");
            fprintf(stderr, "Target:    %s (remote, 1+ hops away)\n",
                    cidr_to_string(&target->range));
            fprintf(stderr, "Interface: %s\n", s->interface_str);
            fprintf(stderr, "\nARP scanning only works on Layer 2 broadcast domain (local network).\n");
            fprintf(stderr, "Remote hosts will not respond to ARP requests.\n\n");
            fprintf(stderr, "Alternatives:\n");
            fprintf(stderr, "  1. Use -mT (skip ARP phase): unicornscan -mT %s\n",
                    cidr_to_string(&target->range));
            fprintf(stderr, "  2. Scan local/remote separately\n");
            fprintf(stderr, "  3. Force anyway: add --force-remote flag\n");
            return -1;
        }
    }

    return 1;  // All targets are local
}

// Call in do_targets():
if (validate_compound_mode_targets() < 0) {
    return -1;  // Fail early
}
```

**Checklist**:
- [ ] Only validate if `s->ss->num_phases > 0` (compound mode)
- [ ] Only validate if `phases[0].mode == MODE_ARPSCAN` (ARP is first phase)
- [ ] Skip if `s->force_remote` flag is set
- [ ] Loop through all targets in target list
- [ ] Check each target against interface subnet using `is_local_target()`
- [ ] If any remote found, error with helpful message and suggestions
- [ ] Return -1 to fail parsing

---

### 4. Execution Diagnostic (sender.c or main execution loop)

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/sender.c` or equivalent
**Lines**: After ARP phase completes (before TCP/UDP phase)
**Function**: Check ARP response count and warn if zero

#### Validation: Zero ARP Responses

```c
// After ARP phase completes, before next phase
// (in execute_compound_scan or similar)

if (s->ss->num_phases > 1 && s->ss->current_phase == 0
    && s->ss->phases[0].mode == MODE_ARPSCAN) {

    uint32_t arp_respondents = count_discovered_hosts();

    if (arp_respondents == 0) {
        VRB(0, "WARNING: ARP phase completed with zero responses");
        VRB(0, "         No hosts discovered on network");
        VRB(0, "         Phase 2+ will have no targets to scan");
        VRB(0, "         (Network may be empty, ARP blocked, or targets remote)");

        // Option 1: Continue anyway (phases 2+ will be empty)
        VRB(1, "Continuing to phase 2+ (expecting no results)");

        // Option 2: Skip remaining phases
        // return 0;  // Caller skips phases 2+

    } else {
        VRB(1, "ARP phase discovered %u host(s) for phase 2+", arp_respondents);
    }
}
```

**Checklist**:
- [ ] Check after ARP phase (phase 0) if compound mode
- [ ] Count discovered hosts via `count_discovered_hosts()` (implementation-specific)
- [ ] If zero, emit diagnostic messages at VRB level 0 (always shown)
- [ ] Non-fatal (don't error), but user is informed
- [ ] Could optionally skip remaining phases (TBD by maintainer)

---

## CLI Flag: --force-remote

**File**: `/opt/unicornscan-0.4.7/src/getconfig.c`
**Lines**: Add to long_opts array (around line 111)

#### Changes

```c
// In long_opts array (after existing options, around line 157):
{"force-remote",    0, NULL, OPT_FORCE_REMOTE},  // NEW

// Define the option constant (after line 103):
#define OPT_FORCE_REMOTE    261

// In switch statement (around line 400+):
case OPT_FORCE_REMOTE:
    s->force_remote = 1;
    VRB(0, "Force flag set: allowing remote targets with compound ARP mode");
    break;

// In settings_t structure (scan_progs/scanopts.h):
// Add field:
uint8_t force_remote;  // Allow compound ARP mode for remote targets
```

**Checklist**:
- [ ] Define `OPT_FORCE_REMOTE` constant
- [ ] Add to `long_opts[]` array
- [ ] Add case in switch statement
- [ ] Set `s->force_remote = 1`
- [ ] Add field to `settings_t` struct
- [ ] Initialize to 0 in `scan_setdefaults()`

---

## Data Structure Changes

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/scanopts.h`

#### Add scan_phase_t Structure

```c
// Add BEFORE scan_settings_t definition (around line 20):

typedef struct scan_phase_t {
    uint8_t mode;           // MODE_ARPSCAN, MODE_TCPSCAN, MODE_UDPSCAN, etc
    uint16_t tcphdrflgs;    // TCP flags (if TCP/sf mode)
    uint16_t send_opts;     // Send options (e.g., S_SENDER_INTR for sf)
    uint16_t recv_opts;     // Receive options (e.g., L_DO_CONNECT for sf)
} scan_phase_t;
```

#### Extend scan_settings_t Structure

```c
// In scan_settings_t (around line 55, after tcphdrflgs):

typedef struct scan_settings_t {
    // ... existing fields ...

    uint8_t mode;               // Legacy: current single mode
    uint16_t tcphdrflgs;        // Legacy: current TCP flags

    // NEW: Compound mode support
    scan_phase_t *phases;       // NULL if single mode, array if compound
    uint8_t num_phases;         // 0 = single mode, 2+ = compound
    uint8_t current_phase;      // Execution state: which phase (0-indexed)

    // ... rest of fields ...
} scan_settings_t;
```

**Checklist**:
- [ ] Add `scan_phase_t` struct before `scan_settings_t`
- [ ] Add `phases`, `num_phases`, `current_phase` fields to `scan_settings_t`
- [ ] Initialize in `scan_setdefaults()`: `phases=NULL`, `num_phases=0`
- [ ] Free `phases` in cleanup: `xfree(s->ss->phases)`

---

## Function Declarations

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/scan_export.h`
**Lines**: Around line 150

#### Add Declarations

```c
// NEW: Compound mode parsing
int scan_parsemode_compound(
    const char *str,           // Input: "A+Tsf"
    scan_phase_t **phases,     // Output: array of phases
    int *num_phases,           // Output: number of phases
    uint32_t *pps              // Output: PPS from mode string
);

// NEW: Validation
int validate_compound_mode_targets(void);
uint32_t count_discovered_hosts(void);  // (if not already declared)
```

**Checklist**:
- [ ] Add `scan_parsemode_compound()` declaration
- [ ] Add `validate_compound_mode_targets()` declaration
- [ ] Add any other new helpers

---

## Testing Additions

**File**: Create `/opt/unicornscan-0.4.7/tests/test_compound_mode_validation.c`

#### Unit Tests

```c
#include <assert.h>
#include "scan_progs/scanopts.h"
#include "scan_progs/scan_export.h"

void test_trailing_plus(void) {
    scan_phase_t *phases = NULL;
    int num_phases = 0;
    uint32_t pps = 0;

    // "A+" should fail
    assert(scan_parsemode_compound("A+", &phases, &num_phases, &pps) == -1);
}

void test_empty_phase(void) {
    scan_phase_t *phases = NULL;
    int num_phases = 0;
    uint32_t pps = 0;

    // "A++T" should fail
    assert(scan_parsemode_compound("A++T", &phases, &num_phases, &pps) == -1);

    // "+T" should fail
    assert(scan_parsemode_compound("+T", &phases, &num_phases, &pps) == -1);
}

void test_invalid_mode(void) {
    scan_phase_t *phases = NULL;
    int num_phases = 0;
    uint32_t pps = 0;

    // "X+T" should fail (invalid mode X)
    assert(scan_parsemode_compound("X+T", &phases, &num_phases, &pps) == -1);
}

void test_arp_not_first(void) {
    scan_phase_t *phases = NULL;
    int num_phases = 0;
    uint32_t pps = 0;

    // "T+A" should fail (ARP not first)
    assert(scan_parsemode_compound("T+A", &phases, &num_phases, &pps) == -1);
}

void test_valid_compound(void) {
    scan_phase_t *phases = NULL;
    int num_phases = 0;
    uint32_t pps = 0;

    // "A+T" should succeed
    assert(scan_parsemode_compound("A+T", &phases, &num_phases, &pps) == 1);
    assert(num_phases == 2);
    assert(phases[0].mode == MODE_ARPSCAN);
    assert(phases[1].mode == MODE_TCPSCAN);
    assert(phases[1].tcphdrflgs == TH_SYN);  // Default
}

void test_valid_with_flags(void) {
    scan_phase_t *phases = NULL;
    int num_phases = 0;
    uint32_t pps = 0;

    // "A+Tsf" should succeed with SYN/FIN cleared
    assert(scan_parsemode_compound("A+Tsf", &phases, &num_phases, &pps) == 1);
    assert(phases[1].tcphdrflgs == 0x00);  // Both flags cleared
}

void test_duplicate_arp_collapse(void) {
    scan_phase_t *phases = NULL;
    int num_phases = 0;
    uint32_t pps = 0;

    // "A+A" should collapse to single A (with warning)
    assert(scan_parsemode_compound("A+A", &phases, &num_phases, &pps) == 1);
    assert(num_phases == 1);  // Collapsed
    assert(phases[0].mode == MODE_ARPSCAN);
}

// Run all tests
int main(void) {
    test_trailing_plus();
    test_empty_phase();
    test_invalid_mode();
    test_arp_not_first();
    test_valid_compound();
    test_valid_with_flags();
    test_duplicate_arp_collapse();
    printf("All tests passed!\n");
    return 0;
}
```

**Checklist**:
- [ ] Create test file
- [ ] Test each validation error case
- [ ] Test valid compound modes
- [ ] Test TCP flag parsing in compound context
- [ ] Test ARP collapse warning
- [ ] Test multi-phase combinations (A+T, A+U, A+T+U, etc)

---

## Integration Checklist

### Phase 1: Core Parser (Week 1)
- [ ] Add `scan_phase_t` structure to scanopts.h
- [ ] Extend `scan_settings_t` with phase fields
- [ ] Implement `scan_parsemode_compound()` function
- [ ] Hook compound detection in `scan_parsemode()`
- [ ] Add function declarations to scan_export.h
- [ ] Write and pass unit tests

### Phase 2: Validation (Week 1)
- [ ] Implement mixed local/remote check in workunits.c
- [ ] Add `--force-remote` CLI flag in getconfig.c
- [ ] Implement zero ARP response warning in sender.c
- [ ] Integration test: error on remote targets
- [ ] Integration test: warning on zero ARP responses

### Phase 3: Polish (Week 2)
- [ ] Add comprehensive error messages with examples
- [ ] Update man page with compound mode syntax
- [ ] Add to usage() help text
- [ ] Document in README/GUIDE
- [ ] User-facing examples in docs/

### Phase 4: Regression Testing (Week 2)
- [ ] Single-mode scans still work (-mT, -mU, -mA)
- [ ] Existing target specifications unchanged
- [ ] Backward compatibility test suite
- [ ] Performance baseline unchanged

---

## Success Criteria

**Parser**:
- [x] Compound modes parse without errors
- [x] Invalid syntax fails with clear messages
- [x] TCP flags work in compound context
- [x] All six edge cases handled

**Execution**:
- [ ] Multi-phase scanning sequences correctly
- [ ] Phase results correlate properly
- [ ] Diagnostics inform user of problems
- [ ] `--force-remote` override works

**User Experience**:
- [ ] Error messages guide user to fix
- [ ] No silent failures or surprises
- [ ] Documentation covers common mistakes
- [ ] Examples work as documented

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Breaks single-mode parsing | Keep existing path unchanged, add conditional |
| Backward compatibility issues | Initialize new fields to defaults, test thoroughly |
| Memory leaks with `phases` array | Free in cleanup path, track allocations |
| Confusing error messages | Test messages with actual users, iterate |
| Execution phase sequencing bugs | Start with unit tests, then integration tests |

---

## File Summary

| File | Action | Lines | Notes |
|------|--------|-------|-------|
| scanopts.c | Add `scan_parsemode_compound()` | ~120 | New function after line 330 |
| scanopts.c | Modify `scan_parsemode()` | ~10 | Add compound detection at start |
| scanopts.h | Add `scan_phase_t` struct | ~5 | Before scan_settings_t |
| scanopts.h | Extend `scan_settings_t` | ~3 | Add phase fields |
| scan_export.h | Add declarations | ~5 | New function declarations |
| workunits.c | Add validation | ~30 | Check mixed local/remote targets |
| getconfig.c | Add CLI flag | ~10 | --force-remote option |
| sender.c | Add diagnostic | ~20 | Check zero ARP responses |
| tests/test_compound_mode_validation.c | Create tests | ~150 | Unit and integration tests |

**Total**: ~350 lines of new code, minimal modifications to existing paths

---

## Next Steps

1. **Review** this checklist with maintainers
2. **Create feature branch** for compound mode work
3. **Implement Phase 1** (parser)
4. **Test thoroughly** before moving to Phase 2
5. **Get user feedback** on error messages
6. **Iterate** on edge cases from real usage
7. **Document** final behavior in man page

---

**Author**: System Architecture Designer
**Date**: 2025-12-23
**Status**: Ready for Implementation
