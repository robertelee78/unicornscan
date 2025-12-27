# Mode Parsing Q&A - Quick Reference

**Analysis Date**: 2025-12-23
**For**: Compound Mode Extension (`-mA+Tsf`)

---

## Question 1: How is the mode string currently parsed?

### Answer:
Mode strings are parsed by **`scan_parsemode()`** in `/opt/unicornscan-0.4.7/src/scan_progs/scanopts.c` (lines 241-330).

**Parsing Flow**:
```
User types: -mTsf300
    ↓
getconfig.c:276 → scan_setoptmode("Tsf300")
    ↓
scanopts.c:238 → scan_parsemode("Tsf300", &mode, &flags, ...)
    ↓
1. Read first char: 'T' → set mode=MODE_TCPSCAN (line 259)
2. Call decode_tcpflags("sf300") → returns 0x00 (clears SYN/FIN) (line 264)
3. Skip flag chars until digit found (line 271)
4. Parse PPS: sscanf("300", "%u", &pps) (line 320)
    ↓
Returns: mode=1 (TCP), flags=0x00, pps=300
```

**Key Code Snippet** (scanopts.c:257-274):
```c
if (*walk == 'T') {
    *mode=MODE_TCPSCAN;
    walk++;
    if (strlen(walk) > 0) {
        ret=decode_tcpflags(walk);  // Parse "sf" part
        if (ret < 0) {
            ERR("bad tcp flags `%s'", str);
            return -1;
        }
        *flags=(uint16_t)ret;
        // Skip to PPS number
        for (;*walk != '\0' && ! isdigit(*walk); walk++) {
            ;
        }
    }
}
```

**Limitation**: Only parses **one mode** then exits. Cannot handle `A+Tsf`.

---

## Question 2: What data structure stores the parsed mode?

### Answer:
**Primary Structure**: `scan_settings_t` in `/opt/unicornscan-0.4.7/src/scan_progs/scanopts.h` (lines 24-62)

```c
typedef struct scan_settings_t {
    // Mode storage
    uint8_t mode;              // Line 55: MODE_TCPSCAN (1), MODE_ARPSCAN (4), etc

    // TCP flag storage
    uint16_t tcphdrflgs;       // Line 47: TH_SYN | TH_FIN | ... (bitfield)

    // Supporting fields
    uint8_t tcpoptions[64];    // TCP options during handshake
    uint8_t tcpoptions_len;
    uint32_t window_size;      // TCP window size
    uint32_t syn_key;          // XOR key for sequence numbers

    // Other scan parameters
    uint8_t tos;               // IP Type of Service
    uint8_t minttl;            // IP TTL range
    uint8_t maxttl;
    int32_t src_port;          // Source port (-1 = random)
} scan_settings_t;
```

**Global Instance**: `s->ss` (pointer to scan_settings_t)

**Mode Constants** (scan_export.h:50-54):
```c
#define MODE_TCPSCAN    1   // 0x01
#define MODE_UDPSCAN    2   // 0x02
#define MODE_ARPSCAN    4   // 0x04
#define MODE_ICMPSCAN   8   // 0x08
#define MODE_IPSCAN     16  // 0x10
```

**Problem for Compound Modes**:
- Only **one** `mode` value stored
- Only **one** `tcphdrflgs` value
- Cannot represent multiple phases like `A+Tsf` (ARP mode=4, TCP mode=1)

---

## Question 3: How are TCP flags extracted from the mode string?

### Answer:
**Function**: `decode_tcpflags()` in `/opt/unicornscan-0.4.7/src/scan_progs/scanopts.c` (lines 332-392)

**Flag Constants** (scan_export.h:22-48):
```c
#define TH_FIN    1     // 0x01
#define TH_SYN    2     // 0x02
#define TH_RST    4     // 0x04
#define TH_PUSH   8     // 0x08
#define TH_ACK    16    // 0x10
#define TH_URG    32    // 0x20
#define TH_ECE    64    // 0x40
#define TH_CWR    128   // 0x80
```

**Extraction Algorithm** (lines 335-389):
```c
int decode_tcpflags(const char *str) {
    int ret=0;  // Start with no flags

    for (; *str != '\0' && (! isdigit(*str)); str++) {
        switch (*str) {
            // UPPERCASE = SET flag (OR operation)
            case 'S':  ret |= TH_SYN;   break;
            case 'F':  ret |= TH_FIN;   break;
            case 'A':  ret |= TH_ACK;   break;
            case 'P':  ret |= TH_PSH;   break;
            case 'R':  ret |= TH_RST;   break;
            case 'U':  ret |= TH_URG;   break;
            case 'E':  ret |= TH_ECE;   break;
            case 'C':  ret |= TH_CWR;   break;

            // lowercase = CLEAR flag (AND NOT operation)
            case 's':  ret &= ~(TH_SYN); break;
            case 'f':  ret &= ~(TH_FIN); break;
            case 'a':  ret &= ~(TH_ACK); break;
            case 'p':  ret &= ~(TH_PSH); break;
            case 'r':  ret &= ~(TH_RST); break;
            case 'u':  ret &= ~(TH_URG); break;
            case 'e':  ret &= ~(TH_ECE); break;
            case 'c':  ret &= ~(TH_CWR); break;

            default:
                ERR("unknown TCP flag `%c'", *str);
                return -1;
        }
    }

    return ret;  // Returns bitfield (0x00 to 0xFF)
}
```

**Examples**:
```
Input       → decode_tcpflags() → Binary → Hex   → Meaning
"S"         → TH_SYN            → 0000010 → 0x02 → SYN flag set
"SF"        → TH_SYN | TH_FIN   → 0000011 → 0x03 → SYN+FIN set
"sf"        → ~(TH_SYN|TH_FIN)  → 0000000 → 0x00 → Both cleared
"SsF"       → TH_FIN            → 0000001 → 0x01 → Set SYN, clear SYN, set FIN
"SFRPA"     → All 5 flags       → 0011111 → 0x1F → SYN+FIN+RST+PSH+ACK
```

**Stop Condition**: Parsing stops at **first digit** (for PPS extraction)

**Integration**: Called from `scan_parsemode()` at lines 264 and 299:
```c
ret=decode_tcpflags(walk);      // Parse flags after 'T' or 'sf'
*flags=(uint16_t)ret;           // Store in output parameter
```

---

## Question 4: Where would we add support for `+` as a phase delimiter?

### Answer: **Three locations** need modification:

### Location 1: Main Parser (scanopts.c:241)
**Function**: `scan_parsemode()`
**Change**: Add multi-phase detection and loop

```c
// CURRENT (lines 241-330):
int scan_parsemode(const char *str, uint8_t *mode, ...) {
    const char *walk=str;

    if (*walk == 'T') {         // Single mode only
        *mode=MODE_TCPSCAN;
        // ...
    }
    // ...
}

// PROPOSED:
int scan_parsemode(const char *str, uint8_t *mode, ...) {
    // Detect compound mode
    if (strchr(str, '+') != NULL) {
        return scan_parsemode_compound(str, ...);  // NEW FUNCTION
    }

    // Existing single-mode logic (unchanged)
    const char *walk=str;
    if (*walk == 'T') {
        *mode=MODE_TCPSCAN;
        // ...
    }
    // ...
}

// NEW FUNCTION (add after line 330):
int scan_parsemode_compound(const char *str, scan_phase_t **phases,
                            int *num_phases, uint32_t *pps) {
    char *mode_copy = xstrdup(str);
    char *phase_token, *saveptr;
    int phase_idx = 0;

    // Tokenize on '+' delimiter
    for (phase_token = strtok_r(mode_copy, "+", &saveptr);
         phase_token != NULL;
         phase_token = strtok_r(NULL, "+", &saveptr)) {

        // Parse each phase using existing logic
        phases[phase_idx].mode = 0;
        phases[phase_idx].flags = 0;

        if (phase_token[0] == 'A') {
            phases[phase_idx].mode = MODE_ARPSCAN;
        }
        else if (phase_token[0] == 'T') {
            phases[phase_idx].mode = MODE_TCPSCAN;
            phases[phase_idx].flags = decode_tcpflags(phase_token + 1);
        }
        // ... etc for U, sf

        phase_idx++;
    }

    *num_phases = phase_idx;
    xfree(mode_copy);
    return 1;
}
```

**Add at**: Line 331 (after existing `scan_parsemode()`)

---

### Location 2: Data Structure (scanopts.h:24)
**Structure**: `scan_settings_t`
**Change**: Add phase storage

```c
// CURRENT (lines 24-62):
typedef struct scan_settings_t {
    uint8_t mode;              // Single mode
    uint16_t tcphdrflgs;       // Single flag set
    // ...
} scan_settings_t;

// PROPOSED (add after line 54):
typedef struct scan_phase_t {
    uint8_t mode;              // MODE_ARPSCAN, MODE_TCPSCAN, etc
    uint16_t tcphdrflgs;       // TCP flags for this phase
    uint16_t send_opts;        // Send options
    uint16_t recv_opts;        // Receive options
} scan_phase_t;

typedef struct scan_settings_t {
    // Legacy single-mode fields (for compatibility)
    uint8_t mode;
    uint16_t tcphdrflgs;

    // NEW: Multi-phase support
    scan_phase_t *phases;      // Array of phases (NULL if single-mode)
    uint8_t num_phases;        // 0 = single mode, 2+ = compound
    uint8_t current_phase;     // Current execution phase (0-indexed)

    // ... rest of existing fields ...
} scan_settings_t;
```

**Add at**: Line 23 (before `scan_settings_t` definition)

---

### Location 3: Workunit Handler (workunits.c:188)
**Function**: `workunit_add()`
**Change**: Detect and create phase-linked workunits

```c
// CURRENT (lines 186-205):
if (*ptr == 'm') {
    if (sscanf(ptr, "m%63s", modestr) == 1) {
        if (scan_parsemode(modestr, &mode, ...) < 0) {
            return -1;
        }
        // ... creates single workunit
    }
}

// PROPOSED (replace lines 186-208):
if (*ptr == 'm') {
    if (strchr(ptr, '+') != NULL) {
        // Compound mode detected: "mA+Tsf"
        scan_phase_t phases[8];  // Max 8 phases
        int num_phases = 0;

        if (scan_parsemode_compound(modestr, &phases, &num_phases, &pps) < 0) {
            return -1;
        }

        // Create linked workunits for each phase
        for (int i = 0; i < num_phases; i++) {
            create_phase_workunit(&phases[i], i, target, ports);
        }

        return 1;  // Multi-phase path complete
    }
    else {
        // Single mode: existing code unchanged
        if (sscanf(ptr, "m%63s", modestr) == 1) {
            if (scan_parsemode(modestr, &mode, ...) < 0) {
                return -1;
            }
            // ...
        }
    }
}
```

**Add at**: Line 186 (replace existing mode parsing block)

---

### Supporting Changes Needed:

**File**: `scan_progs/scan_export.h`
**Add** (after line 149):
```c
// NEW: Compound mode support
int scan_parsemode_compound(
    const char *str,           // Input: "A+Tsf"
    scan_phase_t **phases,     // Output: array of phases
    int *num_phases,           // Output: number of phases
    uint32_t *pps              // Output: PPS (from last phase)
);
```

---

## Question 5: What changes needed to support `-mA+Tsf` syntax?

### Answer: **Summary of Required Changes**

### Change Set 1: Parser Extension
**Files**: `scanopts.c`, `scanopts.h`, `scan_export.h`

**scanopts.h** (add after line 23):
```c
typedef struct scan_phase_t {
    uint8_t mode;           // MODE_ARPSCAN, MODE_TCPSCAN, etc
    uint16_t tcphdrflgs;    // TCP flags (if TCP mode)
    uint16_t send_opts;     // Phase-specific send options
    uint16_t recv_opts;     // Phase-specific receive options
} scan_phase_t;
```

**scanopts.c** (add after line 330):
```c
int scan_parsemode_compound(const char *str, scan_phase_t **phases,
                            int *num_phases, uint32_t *pps) {
    char *mode_copy = xstrdup(str);
    char *phase_token, *saveptr;
    int phase_idx = 0, ret = 0;

    *phases = (scan_phase_t *)xmalloc(sizeof(scan_phase_t) * 8);  // Max 8 phases

    // Split on '+' delimiter
    for (phase_token = strtok_r(mode_copy, "+", &saveptr);
         phase_token != NULL && phase_idx < 8;
         phase_token = strtok_r(NULL, "+", &saveptr)) {

        memset(&(*phases)[phase_idx], 0, sizeof(scan_phase_t));

        // Parse mode character
        if (phase_token[0] == 'A') {
            (*phases)[phase_idx].mode = MODE_ARPSCAN;
        }
        else if (phase_token[0] == 'T') {
            (*phases)[phase_idx].mode = MODE_TCPSCAN;

            // Parse TCP flags (e.g., "Tsf" -> decode "sf")
            if (strlen(phase_token) > 1) {
                ret = decode_tcpflags(phase_token + 1);
                if (ret < 0) {
                    xfree(mode_copy);
                    xfree(*phases);
                    return -1;
                }
                (*phases)[phase_idx].tcphdrflgs = (uint16_t)ret;
            }
            else {
                (*phases)[phase_idx].tcphdrflgs = TH_SYN;  // Default
            }
        }
        else if (phase_token[0] == 'U') {
            (*phases)[phase_idx].mode = MODE_UDPSCAN;
        }
        else if (phase_token[0] == 's' && phase_token[1] == 'f') {
            (*phases)[phase_idx].mode = MODE_TCPSCAN;
            (*phases)[phase_idx].send_opts |= S_SENDER_INTR;
            (*phases)[phase_idx].recv_opts |= L_DO_CONNECT;

            // Parse flags after "sf"
            if (strlen(phase_token) > 2) {
                ret = decode_tcpflags(phase_token + 2);
                if (ret < 0) {
                    xfree(mode_copy);
                    xfree(*phases);
                    return -1;
                }
                (*phases)[phase_idx].tcphdrflgs = (uint16_t)ret;
            }
        }
        else {
            ERR("unknown mode in compound mode: '%c'", phase_token[0]);
            xfree(mode_copy);
            xfree(*phases);
            return -1;
        }

        phase_idx++;
    }

    *num_phases = phase_idx;
    xfree(mode_copy);

    if (*num_phases < 2) {
        ERR("compound mode requires at least 2 phases");
        xfree(*phases);
        return -1;
    }

    return 1;
}
```

**scanopts.c** (modify line 241 - `scan_parsemode()` start):
```c
int scan_parsemode(const char *str, uint8_t *mode, uint16_t *flags,
                   uint16_t *sf, uint16_t *lf, uint16_t *mf, uint32_t *pps) {
    // NEW: Check for compound mode first
    if (strchr(str, '+') != NULL) {
        scan_phase_t *phases = NULL;
        int num_phases = 0;

        if (scan_parsemode_compound(str, &phases, &num_phases, pps) < 0) {
            return -1;
        }

        // Store in global settings
        s->ss->phases = phases;
        s->ss->num_phases = num_phases;

        // Set first phase as "current" mode (for compatibility)
        *mode = phases[0].mode;
        *flags = phases[0].tcphdrflgs;
        *sf = phases[0].send_opts;
        *lf = phases[0].recv_opts;

        return 1;
    }

    // EXISTING: Single mode parsing (unchanged)
    int ret=0;
    const char *walk=NULL;
    // ... rest of existing code ...
}
```

---

### Change Set 2: Settings Structure
**File**: `scanopts.h`

**Add to `scan_settings_t`** (after line 54):
```c
typedef struct scan_settings_t {
    // ... existing fields ...

    uint8_t mode;              // Legacy: single mode
    uint16_t tcphdrflgs;       // Legacy: single flag set

    // NEW: Compound mode support
    scan_phase_t *phases;      // NULL if single mode, array if compound
    uint8_t num_phases;        // 0 = single mode, 2+ = compound
    uint8_t current_phase;     // Execution state (0-indexed)

    // ... rest of fields ...
} scan_settings_t;
```

---

### Change Set 3: Workunit Generation
**File**: `workunits.c`

**Modify `workunit_add()`** (lines 182-208):
```c
// After parsing ":m" in target string
if (*ptr == 'm') {
    if (strchr(ptr + 1, '+') != NULL) {
        // Compound mode: ":mA+Tsf"
        scan_phase_t *phases = NULL;
        int num_phases = 0;

        if (sscanf(ptr, "m%63[^,],", modestr) == 1) {
            if (scan_parsemode_compound(modestr, &phases, &num_phases, &pps) < 0) {
                snprintf(emsg, sizeof(emsg) - 1, "bad compound mode '%s'", modestr);
                return -1;
            }

            // Create phase-sequenced workunits
            for (int i = 0; i < num_phases; i++) {
                // Create workunit with phase dependency
                workunit_create_phase(
                    &phases[i],        // Phase config
                    i,                 // Phase index
                    &netid,            // Target network
                    &mask,             // Network mask
                    port_str,          // Port string
                    i > 0 ? phases[i-1].mode : 0  // Previous phase (for linking)
                );
            }

            xfree(phases);
            ptr += strlen(modestr) + 2;
        }
    }
    else {
        // Single mode: existing code unchanged
        // ...
    }
}
```

---

### Change Set 4: Execution Engine
**File**: `sender.c` (new logic needed)

**Add phase sequencing**:
```c
void execute_compound_scan(void) {
    if (s->ss->num_phases == 0) {
        // Single mode: existing path
        execute_single_mode();
        return;
    }

    // Compound mode execution
    for (int phase = 0; phase < s->ss->num_phases; phase++) {
        s->ss->current_phase = phase;

        // Set phase-specific settings
        s->ss->mode = s->ss->phases[phase].mode;
        s->ss->tcphdrflgs = s->ss->phases[phase].tcphdrflgs;
        s->send_opts = s->ss->phases[phase].send_opts;
        s->recv_opts = s->ss->phases[phase].recv_opts;

        VRB(0, "Executing phase %d/%d: %s",
            phase + 1,
            s->ss->num_phases,
            strscanmode(s->ss->phases[phase].mode)
        );

        // Execute phase
        execute_single_mode();

        // Wait for phase completion
        if (phase < s->ss->num_phases - 1) {
            sleep(s->ss->recv_timeout);  // Wait before next phase
        }
    }
}
```

---

### Example Execution Flow for `-mA+Tsf 192.168.1.0/24:80`

```
User command:
  unicornscan -mA+Tsf 192.168.1.0/24:80

Step 1: Parse mode string
  scan_parsemode("A+Tsf", ...)
    → Detect '+' delimiter
    → Call scan_parsemode_compound()
    → Token 1: "A" → phases[0].mode = MODE_ARPSCAN
    → Token 2: "Tsf" → phases[1].mode = MODE_TCPSCAN
                      → decode_tcpflags("sf") → 0x00 (clear SYN/FIN)
                      → phases[1].tcphdrflgs = 0x00
    → num_phases = 2

Step 2: Create workunits
  workunit_add("192.168.1.0/24:80", ...)
    → Create ARP workunit for 192.168.1.0/24
    → Create TCP workunit for 192.168.1.0/24:80
    → Link TCP workunit to depend on ARP results

Step 3: Execute phase 0 (ARP)
  s->ss->current_phase = 0
  s->ss->mode = MODE_ARPSCAN
  Send ARP requests to 192.168.1.0/24
  Collect responses → build MAC table

Step 4: Wait (recv_timeout seconds)

Step 5: Execute phase 1 (TCP)
  s->ss->current_phase = 1
  s->ss->mode = MODE_TCPSCAN
  s->ss->tcphdrflgs = 0x00
  Send TCP packets to discovered hosts on port 80
  Use MAC addresses from phase 0 results

Step 6: Report combined results
```

---

### Testing Commands

```bash
# Basic compound mode
unicornscan -mA+T 192.168.1.1

# With TCP flags
unicornscan -mA+Tsf 192.168.1.1:80

# Per-target compound mode
unicornscan 192.168.1.1:mA+TSF,80-443 192.168.1.2:mU

# With PPS
unicornscan -mA+T300 192.168.1.0/24

# Complex flags
unicornscan -mA+TSFRPA 192.168.1.1:22,80,443
```

---

### File Summary

| File | Lines | Change Type | Description |
|------|-------|-------------|-------------|
| `scanopts.h` | 23 | Add | `scan_phase_t` structure |
| `scanopts.h` | 55-57 | Add | Phase fields in `scan_settings_t` |
| `scanopts.c` | 241-245 | Modify | Detect `+` in `scan_parsemode()` |
| `scanopts.c` | 331+ | Add | `scan_parsemode_compound()` function |
| `scan_export.h` | 150+ | Add | Function declaration |
| `workunits.c` | 186-208 | Modify | Detect compound mode in targets |
| `sender.c` | New | Add | `execute_compound_scan()` logic |

---

### Estimated Effort

- **Parser changes**: 2-3 hours (straightforward tokenization)
- **Data structure**: 1 hour (add fields, maintain compatibility)
- **Workunit logic**: 4-6 hours (phase linking, dependencies)
- **Execution engine**: 6-8 hours (coordinate multi-phase sender/listener)
- **Testing**: 4-6 hours (validate all mode combinations)

**Total**: 17-24 hours development + testing

---

### Risk Assessment

**Low Risk**:
- Parser is cleanly separable (single-mode path unchanged)
- Data structure additive (backward compatible)
- Flag parsing reuses existing `decode_tcpflags()`

**Medium Risk**:
- Workunit phase linking (new dependency tracking)
- Execution sequencing (timing between phases)

**High Risk**:
- Result correlation (linking ARP MACs to TCP results)
- Error handling (what if phase 1 fails?)

---

## Conclusion

Supporting `-mA+Tsf` requires:
1. **Tokenize** on `+` in `scan_parsemode()`
2. **Store** phases in array (`scan_phase_t[]`)
3. **Generate** phase-linked workunits
4. **Execute** phases sequentially
5. **Correlate** results across phases

**Backward Compatibility**: Fully maintained via conditional path (`strchr(str, '+')`)

**Code Reuse**: High (existing flag parser, mode logic unchanged)

**Complexity**: Medium (multi-phase coordination is new)
