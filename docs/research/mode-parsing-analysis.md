# Mode Parsing Analysis for Compound Mode Support

**Date**: 2025-12-23
**Purpose**: Understand current mode parsing to extend for compound modes like `-mA+Tsf`

---

## Executive Summary

Unicornscan's mode parsing is handled by `scan_parsemode()` in `/opt/unicornscan-0.4.7/src/scan_progs/scanopts.c`. The current implementation:
- Processes a **single mode** character (T/U/A/sf)
- Extracts TCP flags using `decode_tcpflags()` for TCP modes
- Parses optional PPS suffix
- Stores results in multiple output parameters

**Key Finding**: The parser does **not** currently support compound modes. Extension will require:
1. Multi-mode phase parsing
2. Phase state management
3. Enhanced TCP flag handling per phase

---

## 1. How the Mode String is Currently Parsed

### Entry Point
**File**: `/opt/unicornscan-0.4.7/src/getconfig.c`
**Line**: 276-279

```c
case 'm': /* scan mode, tcp udp, etc */
    if (scan_setoptmode(optarg) < 0) {
        usage();
    }
    break;
```

### Main Parsing Function
**File**: `/opt/unicornscan-0.4.7/src/scan_progs/scanopts.c`
**Function**: `scan_parsemode()` (Lines 241-330)
**Called by**: `scan_setoptmode()` (Line 238)

```c
int scan_setoptmode(const char *str) {
    return scan_parsemode(str, &s->ss->mode, &s->ss->tcphdrflgs,
                          &s->send_opts, &s->recv_opts, &s->options, &s->pps);
}
```

### Parsing Logic Flow (Lines 241-330)

```c
int scan_parsemode(const char *str, uint8_t *mode, uint16_t *flags,
                   uint16_t *sf, uint16_t *lf, uint16_t *mf, uint32_t *pps) {
    int ret=0;
    const char *walk=NULL;

    walk=str;

    // 1. Parse single mode character
    if (*walk == 'T') {
        *mode=MODE_TCPSCAN;          // Line 259
        walk++;

        // 2. Extract TCP flags if present
        if (strlen(walk) > 0) {
            ret=decode_tcpflags(walk);  // Line 264
            if (ret < 0) {
                ERR("bad tcp flags `%s'", str);
                return -1;
            }
            *flags=(uint16_t)ret;       // Line 269

            // 3. Skip to PPS number
            for (;*walk != '\0' && ! isdigit(*walk); walk++) {
                ;
            }
        }
    }
    else if (*walk == 'U') {
        *mode=MODE_UDPSCAN;             // Line 277
        walk++;
    }
    else if (*walk == 'A') {
        *mode=MODE_ARPSCAN;             // Line 281
        walk++;
    }
    else if (*walk == 's' && *(walk + 1) == 'f') {  // Line 284
        *mode=MODE_TCPSCAN;
        *mf |= M_DO_CONNECT;
        *lf |= L_DO_CONNECT;
        *sf |= S_SENDER_INTR;
        scan_setretlayers(0xff);
        walk += 2;

        // TCP flags after 'sf'
        if (strlen(walk) > 0) {
            ret=decode_tcpflags(walk);  // Line 299
            *flags=(uint16_t)ret;
            for (;*walk != '\0' && ! isdigit(*walk); walk++) {
                ;
            }
        }
    }

    // 4. Parse optional PPS suffix
    if (*walk != '\0') {
        if (sscanf(walk, "%u", pps) == 1) {  // Line 320
            return 1;
        }
    }

    return 1;
}
```

**Current Limitation**: Parser **stops** after first mode. Cannot handle `A+Tsf`.

---

## 2. Data Structure Storing Parsed Mode

### Primary Structure
**File**: `/opt/unicornscan-0.4.7/src/scan_progs/scanopts.h`
**Lines**: 24-62

```c
typedef struct scan_settings_t {
    /* ip options */
    uint8_t tos;
    uint8_t minttl;
    uint8_t maxttl;
    uint16_t ip_off;

    /* tcp options */
    uint16_t tcphdrflgs;        // TH_SYN, TH_FIN, etc (Line 47)
    uint8_t tcpoptions[64];     // options during handshake
    uint8_t tcpoptions_len;
    uint32_t window_size;
    uint32_t syn_key;

    uint8_t mode;               // MODE_TCPSCAN, MODE_ARPSCAN, etc (Line 55)
    uint8_t recv_timeout;
    uint8_t ret_layers;

    int32_t src_port;           // -1 for random
} scan_settings_t;
```

### Mode Constants
**File**: `/opt/unicornscan-0.4.7/src/scan_progs/scan_export.h`
**Lines**: 50-54

```c
#define MODE_TCPSCAN    1
#define MODE_UDPSCAN    2
#define MODE_ARPSCAN    4
#define MODE_ICMPSCAN   8
#define MODE_IPSCAN     16
```

**Current Storage**: Only **one mode** stored in `s->ss->mode`.
**Limitation**: Cannot represent multiple phases.

---

## 3. TCP Flag Extraction

### TCP Flag Constants
**File**: `/opt/unicornscan-0.4.7/src/scan_progs/scan_export.h`
**Lines**: 22-48

```c
#define TH_FIN    1       // 0x01
#define TH_SYN    2       // 0x02
#define TH_RST    4       // 0x04
#define TH_PUSH   8       // 0x08 (also TH_PSH)
#define TH_ACK    16      // 0x10
#define TH_URG    32      // 0x20
#define TH_ECE    64      // 0x40
#define TH_CWR    128     // 0x80
```

### Flag Decoding Function
**File**: `/opt/unicornscan-0.4.7/src/scan_progs/scanopts.c`
**Function**: `decode_tcpflags()` (Lines 332-392)

```c
int decode_tcpflags(const char *str) {
    int ret=0;  // Accumulator for OR'd flags

    for (; *str != '\0' && (! isdigit(*str)); str++) {
        switch (*str) {
            case 'F':  ret |= TH_FIN;   break;  // Set flag
            case 'f':  ret &= ~(TH_FIN); break; // Clear flag
            case 'S':  ret |= TH_SYN;   break;
            case 's':  ret &= ~(TH_SYN); break;
            case 'R':  ret |= TH_RST;   break;
            case 'r':  ret &= ~(TH_RST); break;
            case 'P':  ret |= TH_PSH;   break;
            case 'p':  ret &= ~(TH_PSH); break;
            case 'A':  ret |= TH_ACK;   break;
            case 'a':  ret &= ~(TH_ACK); break;
            case 'U':  ret |= TH_URG;   break;
            case 'u':  ret &= ~(TH_URG); break;
            case 'E':  ret |= TH_ECE;   break;
            case 'e':  ret &= ~(TH_ECE); break;
            case 'C':  ret |= TH_CWR;   break;
            case 'c':  ret &= ~(TH_CWR); break;
            default:
                ERR("unknown TCP flag `%c' (FfSsRrPpAaUuEeCc are valid)", *str);
                return -1;
        }
    }

    return ret;  // Returns integer bitmask
}
```

**Key Behaviors**:
- **Uppercase**: Set flag (`ret |= flag`)
- **Lowercase**: Clear flag (`ret &= ~flag`)
- **Returns**: Integer with OR'd flags (e.g., `TH_SYN | TH_FIN` = `0x03`)
- **Stops**: At first digit (for PPS parsing)

**Example**:
```
"Tsf" -> decode_tcpflags("sf") -> TH_SYN cleared, TH_FIN cleared -> 0x00
"TSF" -> TH_SYN | TH_FIN -> 0x03
```

---

## 4. Per-Target Mode Syntax (`:mT`, `:mU`)

### Where Per-Target Modes Are Parsed
**File**: `/opt/unicornscan-0.4.7/src/scan_progs/workunits.c`
**Function**: `workunit_add()` (Lines 137-443)
**Specific Logic**: Lines 182-208

```c
int workunit_add(const char *targets, char **estr) {
    char *start=NULL, *ptr=NULL, *port_str=NULL;
    char modestr[64];
    uint8_t mode=0;
    uint16_t send_opts=0, recv_opts=0, options=0, tcphdrflgs=0;
    uint32_t pps=0;

    // Start with global settings
    pps=s->pps;
    send_opts=s->send_opts;
    recv_opts=s->recv_opts;
    options=s->options;

    // Parse target string: "192.168.1.0/24:mTsf,80-443"
    for (; *ptr != '\0'; ptr++) {
        if (*ptr == ':') {
            *ptr='\0'; ptr++;
            if (*ptr == 'm') {
                // Case 1: :mT,80-443 (mode + port list)
                if (strchr(ptr, ',') != NULL &&
                    sscanf(ptr, "m%63[^,],", modestr) == 1) {

                    if (scan_parsemode((const char *)modestr, &mode, &tcphdrflgs,
                                       &send_opts, &recv_opts, &options, &pps) < 0) {
                        // Error handling
                        return -1;
                    }
                    ptr += strlen(modestr) + 2;  // Skip "mTsf,"
                }
                // Case 2: :mT (mode only, use global ports)
                else if (sscanf(ptr, "m%63s", modestr) == 1) {
                    if (scan_parsemode((const char *)modestr, &mode, &tcphdrflgs,
                                       &send_opts, &recv_opts, &options, &pps) < 0) {
                        return -1;
                    }
                    ptr += strlen(modestr) + 1;  // Skip "mT"
                }
            }
            break;
        }
    }

    // If no per-target mode, use global mode
    if (mode == 0) {
        mode=scan_getmode();  // Line 228
    }

    // Continue with port parsing...
}
```

**Key Points**:
- Per-target modes **override** global `-m` flag
- Same `scan_parsemode()` used for both global and per-target
- Supports: `:mT`, `:mU`, `:mA`, `:mTsf,80-443`
- **Does not support**: `:mA+Tsf` (compound modes)

---

## 5. Where to Add `+` Phase Delimiter Support

### Required Changes

#### A. Extend `scan_parsemode()` for Multi-Phase Parsing

**Current**: Single mode stored in `s->ss->mode`
**Needed**: Array or list of phase configurations

**Pseudocode for Enhanced Parser**:
```c
int scan_parsemode_compound(const char *str,
                            scan_phase_t **phases,  // Output: array of phases
                            int *num_phases,        // Output: phase count
                            uint32_t *pps) {
    char *phase_token;
    char *mode_copy = strdup(str);
    char *saveptr;
    int phase_idx = 0;

    // Split on '+' delimiter
    for (phase_token = strtok_r(mode_copy, "+", &saveptr);
         phase_token != NULL;
         phase_token = strtok_r(NULL, "+", &saveptr)) {

        // Allocate phase structure
        phases[phase_idx].mode = 0;
        phases[phase_idx].flags = 0;

        // Parse individual phase (reuse existing logic)
        if (phase_token[0] == 'T') {
            phases[phase_idx].mode = MODE_TCPSCAN;
            // Extract TCP flags from phase_token+1
            phases[phase_idx].flags = decode_tcpflags(phase_token + 1);
        }
        else if (phase_token[0] == 'U') {
            phases[phase_idx].mode = MODE_UDPSCAN;
        }
        else if (phase_token[0] == 'A') {
            phases[phase_idx].mode = MODE_ARPSCAN;
        }

        phase_idx++;
    }

    *num_phases = phase_idx;
    free(mode_copy);
    return 1;
}
```

#### B. New Data Structure for Phases

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/scanopts.h`
**Add**:

```c
typedef struct scan_phase_t {
    uint8_t mode;           // MODE_ARPSCAN, MODE_TCPSCAN, etc
    uint16_t tcphdrflgs;    // TCP flags for this phase (if TCP)
    uint16_t send_opts;     // Send options for this phase
    uint16_t recv_opts;     // Receive options for this phase
} scan_phase_t;

typedef struct scan_settings_t {
    // Existing fields...

    // NEW: Multi-phase support
    scan_phase_t *phases;   // Array of scan phases
    uint8_t num_phases;     // Number of phases in compound mode
    uint8_t current_phase;  // Current execution phase (0-indexed)

    // Legacy single-mode fields (for compatibility)
    uint8_t mode;
    uint16_t tcphdrflgs;
} scan_settings_t;
```

#### C. Workunit Phase Execution

**File**: `/opt/unicornscan-0.4.7/src/scan_progs/workunits.c`
**Changes Needed**:

1. **Parse compound mode** in `workunit_add()` (Line 188):
```c
if (strchr(ptr, '+') != NULL) {
    // Multi-phase mode detected
    if (scan_parsemode_compound(modestr, &phases, &num_phases, &pps) < 0) {
        return -1;
    }
    // Create separate workunits for each phase
    for (int i = 0; i < num_phases; i++) {
        create_workunit_for_phase(&phases[i], target, ports);
    }
}
```

2. **Phase ordering**: Ensure ARP phase executes before TCP phase
3. **Result correlation**: Link TCP results to ARP-discovered MACs

---

## 6. Implementation Roadmap for `-mA+Tsf` Support

### Phase 1: Parser Extension
**Files**: `scanopts.c`, `scanopts.h`

1. Create `scan_phase_t` structure
2. Implement `scan_parsemode_compound()` function
3. Add `+` delimiter tokenization with `strtok_r()`
4. Validate phase combinations (e.g., `A+T` valid, `U+U` invalid)

### Phase 2: Data Structure Updates
**Files**: `scanopts.h`, `settings.h`

1. Add `phases[]`, `num_phases`, `current_phase` to `scan_settings_t`
2. Maintain backward compatibility with single `mode` field
3. Add phase state tracking

### Phase 3: Workunit Management
**Files**: `workunits.c`

1. Detect compound modes in `workunit_add()`
2. Generate phase-specific workunits
3. Link phase dependencies (ARP → TCP)
4. Implement phase sequencing logic

### Phase 4: Execution Engine
**Files**: `scan_progs/sender.c`, `scan_progs/listener.c`

1. Execute phases in sequence
2. Pass ARP results to TCP phase
3. Coordinate sender/listener for multi-phase
4. Handle timeouts between phases

### Phase 5: Testing
**Test cases**:
- `-mA+T` (ARP then TCP SYN)
- `-mA+Tsf` (ARP then TCP connect scan)
- `-mA+U` (ARP then UDP scan)
- Per-target: `192.168.1.1:mA+Tsf,80-443`

---

## 7. Code Locations Summary

| Component | File | Lines | Description |
|-----------|------|-------|-------------|
| **CLI Parsing** | `getconfig.c` | 276-279 | `-m` flag handler |
| **Mode Dispatcher** | `scanopts.c` | 237-239 | `scan_setoptmode()` |
| **Main Parser** | `scanopts.c` | 241-330 | `scan_parsemode()` |
| **TCP Flag Decoder** | `scanopts.c` | 332-392 | `decode_tcpflags()` |
| **Per-Target Mode** | `workunits.c` | 182-208 | `:mT` syntax parsing |
| **Mode Constants** | `scan_export.h` | 50-54 | MODE_TCPSCAN, etc |
| **TCP Flag Constants** | `scan_export.h` | 22-48 | TH_SYN, TH_FIN, etc |
| **Settings Structure** | `scanopts.h` | 24-62 | `scan_settings_t` |

---

## 8. Key Insights for Implementation

### Critical Observations

1. **Single-Mode Architecture**: Current code assumes **one mode per scan**
   - Global `s->ss->mode` stores only one mode
   - Workunits are mode-specific (TCP_SEND_MAGIC, ARP_SEND_MAGIC)
   - Sender/listener processes are specialized per mode

2. **TCP Flags are Mode-Specific**:
   - `decode_tcpflags()` returns bitfield, not stored with mode
   - Flags in `s->ss->tcphdrflgs` apply to **all** TCP packets
   - For compound modes, need per-phase flag storage

3. **Workunit System is Phase-Ready**:
   - Already supports multiple workunits per target
   - `iter` field (Line 349 in workunits.c) can track phases
   - Magic numbers distinguish workunit types
   - **Minor change needed**: Link phase workunits sequentially

4. **PPS Parsing is Mode-Global**:
   - Currently one PPS applies to entire scan
   - For compound modes, may want per-phase PPS
   - Example: `-mA+T300` (ARP at global PPS, TCP at 300 PPS)

5. **Per-Target Modes Already Use `scan_parsemode()`**:
   - Same function for global and per-target
   - Extending for `+` will automatically support `:mA+Tsf`

---

## 9. Example Mode Strings to Support

| Mode String | Meaning |
|-------------|---------|
| `-mA+T` | ARP discovery, then TCP SYN scan |
| `-mA+Tsf` | ARP discovery, then TCP connect (clear SYN/FIN) |
| `-mA+TSF` | ARP discovery, then TCP with SYN+FIN flags |
| `-mA+U` | ARP discovery, then UDP scan |
| `-mT+T200` | TCP SYN scan, then TCP SYN scan at 200 PPS (re-scan) |
| Per-target: `192.168.1.1:mA+Tsf,80-443` | ARP then TCP connect on ports 80-443 |

---

## 10. Backward Compatibility Considerations

### Must Preserve
1. **Single-mode behavior**: `-mT`, `-mU`, `-mA` must work unchanged
2. **TCP flag syntax**: `-mTsf`, `-mTSF` must parse identically
3. **Per-target modes**: `:mT`, `:mU` syntax unchanged
4. **PPS suffix**: `-mT300` still works

### Safe Extension Strategy
```c
// In scan_parsemode():
if (strchr(str, '+') != NULL) {
    // New: Compound mode path
    return scan_parsemode_compound(str, ...);
} else {
    // Existing: Single mode path (unchanged)
    // ... current code ...
}
```

---

## Questions for Design Decisions

1. **Phase Ordering**: Should parser enforce ARP-before-TCP, or allow any order?
2. **Per-Phase PPS**: Support `-mA100+T500` (different PPS per phase)?
3. **Flag Inheritance**: Should TCP flags apply to all phases, or per-phase only?
4. **Result Storage**: How to associate ARP MACs with subsequent TCP results?
5. **Error Handling**: What if phase 1 (ARP) finds no hosts? Skip phase 2?

---

## Conclusion

**Current State**: Unicornscan parses modes as single-character switches with optional TCP flags and PPS suffix.

**Extension Point**: The `+` delimiter can be added to `scan_parsemode()` with minimal disruption:
- Tokenize on `+`
- Parse each phase independently (reuse existing logic)
- Store phases in array
- Generate phase-linked workunits

**Complexity**: Medium
- Parser changes: **Low** (tokenization + loop)
- Data structure: **Medium** (add phase array)
- Workunit logic: **Medium** (phase sequencing)
- Execution engine: **High** (coordinate multi-phase sender/listener)

**Risk**: Low (backward compatible if implemented as separate code path)
