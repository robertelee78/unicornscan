# Mode Parsing Code Snippets - With Line Numbers

**Purpose**: Complete code reference for mode parsing analysis
**Date**: 2025-12-23

---

## Key Parsing Logic with Exact Line Numbers

### 1. Main Mode Parser - `scan_parsemode()`
**File**: `/opt/unicornscan-0.4.7/src/scan_progs/scanopts.c`
**Lines**: 241-330

```c
241  int scan_parsemode(const char *str, uint8_t *mode, uint16_t *flags,
242                     uint16_t *sf, uint16_t *lf, uint16_t *mf, uint32_t *pps) {
243      int ret=0;
244      const char *walk=NULL;
245
246      assert(str != NULL);
247      assert(mode != NULL); assert(flags != NULL); assert(sf != NULL);
248      assert(lf != NULL); assert(mf != NULL); assert(pps != NULL);
249
250      if (strlen(str) < 1) {
251          return -1;
252      }
253
254      *pps=s->pps;
255
256      walk=str;
257
258      if (*walk == 'T') {
259          *mode=MODE_TCPSCAN;                    // Set TCP mode
260
261          walk++;
262          /* check to see if the user specified TCP flags with TCP mode */
263          if (strlen(walk) > 0) {
264              ret=decode_tcpflags(walk);         // Parse "sf" or "SF" etc
265              if (ret < 0) {
266                  ERR("bad tcp flags `%s'", str);
267                  return -1;
268              }
269              *flags=(uint16_t)ret;              // Store flags in output
270
271              for (;*walk != '\0' && ! isdigit(*walk); walk++) {
272                  ;                              // Skip to PPS number
273              }
274          }
275      }
276      else if (*walk == 'U') {
277          *mode=MODE_UDPSCAN;                    // UDP mode
278          walk++;
279      }
280      else if (*walk == 'A') {
281          *mode=MODE_ARPSCAN;                    // ARP mode
282          walk++;
283      }
284      else if (*walk == 's' && *(walk + 1) == 'f') {  // 'sf' = connect scan
285          *mode=MODE_TCPSCAN;
286          /* XXX */
287          *mf |= M_DO_CONNECT;                   // Set connect mode flags
288          *lf |= L_DO_CONNECT;
289          *sf |= S_SENDER_INTR;
290          /* XXX */
291          if (scan_setretlayers(0xff) < 0) {
292              ERR("unable to request packet transfer though IPC, exiting");
293              return -1;
294          }
295          walk += 2;                             // Skip "sf"
296
297          /* check to see if the user specified TCP flags with TCP mode */
298          if (strlen(walk) > 0) {
299              ret=decode_tcpflags(walk);         // Parse flags after "sf"
300              if (ret < 0) {
301                  ERR("bad tcp flags `%s'", str);
302                  return -1;
303              }
304              *flags=(uint16_t)ret;
305
306              for (;*walk != '\0' && ! isdigit(*walk); walk++) {
307                  ;                              // Skip to PPS
308              }
309          }
310      }
311      else {
312          ERR("unknown scanning mode `%c'", str[1]);
313          return -1;
314      }
315
316      if (*walk == '\0') {
317          return 1;                              // No PPS specified
318      }
319
320      if (sscanf(walk, "%u", pps) == 1) {        // Parse PPS number
321          return 1;
322      }
323
324      /* this isnt likely possible */
325      ERR("bad pps `%s', using default %u", walk, s->pps);
326
327      *pps=s->pps;
328
329      return 1;
330  }
```

**Key Extension Point**: Add after line 256:
```c
256      walk=str;
257+
258+     // NEW: Detect compound mode
259+     if (strchr(str, '+') != NULL) {
260+         return scan_parsemode_compound(str, mode, flags, sf, lf, mf, pps);
261+     }
262+
263      if (*walk == 'T') {
```

---

### 2. TCP Flag Decoder - `decode_tcpflags()`
**File**: `/opt/unicornscan-0.4.7/src/scan_progs/scanopts.c`
**Lines**: 332-392

```c
332  int decode_tcpflags(const char *str) {
333      int ret=0;
334
335      for (; *str != '\0' && (! isdigit(*str)); str++) {
336          switch (*str) {
337              case 'F':
338                  ret |= TH_FIN;          // Set FIN flag (0x01)
339                  break;
340              case 'f':
341                  ret &= ~(TH_FIN);       // Clear FIN flag
342                  break;
343              case 'S':
344                  ret |= TH_SYN;          // Set SYN flag (0x02)
345                  break;
346              case 's':
347                  ret &= ~(TH_SYN);       // Clear SYN flag
348                  break;
349              case 'R':
350                  ret |= TH_RST;          // Set RST flag (0x04)
351                  break;
352              case 'r':
353                  ret &= ~(TH_RST);       // Clear RST flag
354                  break;
355              case 'P':
356                  ret |= TH_PSH;          // Set PUSH flag (0x08)
357                  break;
358              case 'p':
359                  ret &= ~(TH_PSH);       // Clear PUSH flag
360                  break;
361              case 'A':
362                  ret |= TH_ACK;          // Set ACK flag (0x10)
363                  break;
364              case 'a':
365                  ret &= ~(TH_ACK);       // Clear ACK flag
366                  break;
367              case 'U':
368                  ret |= TH_URG;          // Set URG flag (0x20)
369                  break;
370              case 'u':
371                  ret &= ~(TH_URG);       // Clear URG flag
372                  break;
373              case 'E':
374                  ret |= TH_ECE;          // Set ECE flag (0x40)
375                  break;
376              case 'e':
377                  ret &= ~(TH_ECE);       // Clear ECE flag
378                  break;
379              case 'C':
380                  ret |= TH_CWR;          // Set CWR flag (0x80)
381                  break;
382              case 'c':
383                  ret &= ~(TH_CWR);       // Clear CWR flag
384                  break;
385              default:
386                  ERR("unknown TCP flag `%c' (FfSsRrPpAaUuEeCc are valid)", *str);
387                  return -1;
388          } /* switch *str */
389      } /* for strlen(str) */
390
391      return ret;
392  }
```

**Examples with Binary Output**:
```
Input: "S"    → ret = 0x02 (00000010) → SYN only
Input: "SF"   → ret = 0x03 (00000011) → SYN + FIN
Input: "sf"   → ret = 0x00 (00000000) → Clear SYN and FIN
Input: "SsF"  → ret = 0x01 (00000001) → Set SYN, clear SYN, set FIN = FIN only
Input: "SFRPA"→ ret = 0x1F (00011111) → SYN+FIN+RST+PUSH+ACK
```

---

### 3. CLI Entry Point - `-m` Flag Handler
**File**: `/opt/unicornscan-0.4.7/src/getconfig.c`
**Lines**: 276-280

```c
276          case 'm': /* scan mode, tcp udp, etc */
277              if (scan_setoptmode(optarg) < 0) {
278                  usage();
279              }
280              break;
```

**Call chain**:
```
User: -mA+Tsf
  ↓
getconfig.c:277 → scan_setoptmode("A+Tsf")
  ↓
scanopts.c:238 → scan_parsemode("A+Tsf", &mode, &flags, ...)
  ↓
[Currently stops at 'A', ignores "+Tsf"]
```

---

### 4. Mode Dispatcher - `scan_setoptmode()`
**File**: `/opt/unicornscan-0.4.7/src/scan_progs/scanopts.c`
**Lines**: 237-239

```c
237  int scan_setoptmode(const char *str) {
238      return scan_parsemode(str, &s->ss->mode, &s->ss->tcphdrflgs,
239                            &s->send_opts, &s->recv_opts, &s->options, &s->pps);
240  }
```

**Parameters Passed**:
- `&s->ss->mode` → uint8_t* (1=TCP, 2=UDP, 4=ARP)
- `&s->ss->tcphdrflgs` → uint16_t* (TCP flags bitfield)
- `&s->send_opts` → uint16_t* (sender options)
- `&s->recv_opts` → uint16_t* (receiver options)
- `&s->options` → uint16_t* (master flags)
- `&s->pps` → uint32_t* (packets per second)

---

### 5. Per-Target Mode Parsing - `:mT` Syntax
**File**: `/opt/unicornscan-0.4.7/src/scan_progs/workunits.c`
**Lines**: 182-208

```c
182      for (; *ptr != '\0'; ptr++) {
183          if (*ptr == ':') {
184              *ptr='\0'; ptr++;
185              if (*ptr == 'm') {
186                  /* the first case will match mode,portlist */
187                  if (strchr(ptr, ',') != NULL && sscanf(ptr, "m%63[^,],", modestr) == 1) {
188                      if (scan_parsemode((const char *)modestr, &mode, &tcphdrflgs,
189                                         &send_opts, &recv_opts, &options, &pps) < 0) {
190                          snprintf(emsg, sizeof(emsg) - 1, "cant parse target `%s'", start);
191                          xfree(start);
192
193                          return -1;
194                      }
195                      ptr += strlen(modestr) + 2;
196                  } /* this case will match just mode string with global ports */
197                  else if (sscanf(ptr, "m%63s", modestr) == 1) {
198                      if (scan_parsemode((const char *)modestr, &mode, &tcphdrflgs,
199                                         &send_opts, &recv_opts, &options, &pps) < 0) {
200                          snprintf(emsg, sizeof(emsg) - 1, "cant parse target `%s'", start);
201                          xfree(start);
202
203                          return -1;
204                      }
205                      ptr += strlen(modestr) + 1;
206                  }
207              }
208              break;
209          }
210      }
```

**Supported Syntax**:
```
192.168.1.1:mT              → TCP mode, global ports
192.168.1.1:mU,53           → UDP mode, port 53
192.168.1.1:mTsf,80-443     → TCP connect, ports 80-443
192.168.1.1:mA              → ARP mode
```

**Extension Point** (line 185):
```c
185              if (*ptr == 'm') {
186+                 // NEW: Check for compound mode
187+                 if (strchr(ptr + 1, '+') != NULL) {
188+                     // Handle ":mA+Tsf" syntax
189+                     // ...
190+                 }
191+                 else {
192                  /* the first case will match mode,portlist */
193                  if (strchr(ptr, ',') != NULL && sscanf(ptr, "m%63[^,],", modestr) == 1) {
```

---

## Data Structures

### 6. Scan Settings Structure
**File**: `/opt/unicornscan-0.4.7/src/scan_progs/scanopts.h`
**Lines**: 24-62

```c
 24  typedef struct scan_settings_t {
 25      char *port_str;
 26
 27      struct sockaddr_storage target;
 28      struct sockaddr_storage targetmask;
 29
 30      /* OS fingerprint to emulate */
 31      uint16_t fingerprint;
 32
 33      /* ip options */
 34      uint8_t tos;
 35      uint8_t minttl;
 36      uint8_t maxttl;
 37      uint16_t ip_off;
 38
 39      uint32_t ip6flow;
 40
 41      uint16_t mtu;
 42
 43      uint8_t ipoptions[64];
 44      uint8_t ipoptions_len;
 45
 46      /* tcp options */
 47      uint16_t tcphdrflgs;        /* TH_SYN etc */
 48      uint8_t tcpoptions[64];     /* options used during handshake */
 49      uint8_t tcpoptions_len;
 50      uint8_t posttcpoptions[64]; /* non-handshake options */
 51      uint8_t posttcpoptions_len;
 52      uint32_t window_size;
 53      uint32_t syn_key;           /* used to xor things against */
 54
 55      uint8_t mode;               /* MODE_TCPSCAN, etc */
 56      uint8_t recv_timeout;       /* in secs to wait for responses */
 57      uint8_t ret_layers;         /* how many layers of packet to return */
 58      int header_type;            /* type of link layer in use */
 59      uint16_t header_len;        /* length of the 'link layer' header */
 60
 61      int32_t src_port;           /* -1 for random, otherwise uint16_t */
 62  } scan_settings_t;
```

**Critical Fields for Compound Modes**:
- Line 47: `tcphdrflgs` → Stores **single** set of TCP flags
- Line 55: `mode` → Stores **single** mode value
- **Missing**: Array to store multiple phases

**Proposed Addition** (after line 53):
```c
 53      uint32_t syn_key;           /* used to xor things against */
 54+
 55+     /* NEW: Compound mode support */
 56+     scan_phase_t *phases;       /* Array of phases (NULL if single mode) */
 57+     uint8_t num_phases;         /* 0 = single mode, 2+ = compound */
 58+     uint8_t current_phase;      /* Current execution phase (0-indexed) */
 59+
 60      uint8_t mode;               /* MODE_TCPSCAN, etc (legacy) */
```

---

### 7. Mode Constants
**File**: `/opt/unicornscan-0.4.7/src/scan_progs/scan_export.h`
**Lines**: 50-54

```c
 50  #define MODE_TCPSCAN    1
 51  #define MODE_UDPSCAN    2
 52  #define MODE_ARPSCAN    4
 53  #define MODE_ICMPSCAN   8
 54  #define MODE_IPSCAN     16
```

**Binary Representation**:
```
MODE_TCPSCAN   = 0x01 = 00001
MODE_UDPSCAN   = 0x02 = 00010
MODE_ARPSCAN   = 0x04 = 00100
MODE_ICMPSCAN  = 0x08 = 01000
MODE_IPSCAN    = 0x10 = 10000
```

**Note**: These are **not** flags (cannot be OR'd together). Compound mode requires phase array.

---

### 8. TCP Flag Constants
**File**: `/opt/unicornscan-0.4.7/src/scan_progs/scan_export.h`
**Lines**: 22-48

```c
 22  #ifndef TH_FIN
 23  # define TH_FIN    1
 24  #endif
 25  #ifndef TH_SYN
 26  # define TH_SYN    2
 27  #endif
 28  #ifndef TH_RST
 29  # define TH_RST    4
 30  #endif
 31  #ifndef TH_PUSH
 32  # define TH_PUSH   8
 33  #endif
 34  #ifndef TH_PSH
 35  # define TH_PSH    8
 36  #endif
 37  #ifndef TH_ACK
 38  # define TH_ACK    16
 39  #endif
 40  #ifndef TH_URG
 41  # define TH_URG    32
 42  #endif
 43  #ifndef TH_ECE
 44  # define TH_ECE    64
 45  #endif
 46  #ifndef TH_CWR
 47  # define TH_CWR    128
 48  #endif
```

**Binary Representation**:
```
TH_FIN  = 0x01 = 00000001
TH_SYN  = 0x02 = 00000010
TH_RST  = 0x04 = 00000100
TH_PSH  = 0x08 = 00001000
TH_ACK  = 0x10 = 00010000
TH_URG  = 0x20 = 00100000
TH_ECE  = 0x40 = 01000000
TH_CWR  = 0x80 = 10000000
```

**These ARE flags** (can be OR'd): `TH_SYN | TH_ACK = 0x12`

---

## Visual Parsing Flow

### Current Single-Mode Parsing

```
User Input: -mTsf300

    ↓
getconfig.c:276
    case 'm': scan_setoptmode("Tsf300")
    ↓
scanopts.c:238
    scan_parsemode("Tsf300", &mode, &flags, ...)
    ↓
scanopts.c:258
    if (*walk == 'T') {
        mode = MODE_TCPSCAN (1)
        walk++ → "sf300"
    ↓
scanopts.c:264
    ret = decode_tcpflags("sf300")
        ↓
    scanopts.c:335-389 (loop through "sf")
        's': ret &= ~TH_SYN  → ret = 0xFFFD (clear bit 1)
        'f': ret &= ~TH_FIN  → ret = 0xFFFE (clear bit 0)
        → stops at '3' (digit)
        ← returns ret = 0x00
    ↓
scanopts.c:269
    flags = 0x00
    ↓
scanopts.c:271
    Skip "sf" → walk = "300"
    ↓
scanopts.c:320
    sscanf("300", "%u", &pps) → pps = 300
    ↓
    ← Returns: mode=1, flags=0x00, pps=300
```

---

### Proposed Compound-Mode Parsing

```
User Input: -mA+Tsf

    ↓
getconfig.c:276
    case 'm': scan_setoptmode("A+Tsf")
    ↓
scanopts.c:238
    scan_parsemode("A+Tsf", &mode, &flags, ...)
    ↓
scanopts.c:257+ (NEW)
    if (strchr("A+Tsf", '+') != NULL) {
        → '+' found!
        ↓
        scan_parsemode_compound("A+Tsf", &phases, &num_phases, &pps)
        ↓
        (NEW FUNCTION)
        mode_copy = strdup("A+Tsf")
        ↓
        Token 1: strtok_r("A+Tsf", "+", ...) → "A"
            phases[0].mode = MODE_ARPSCAN (4)
            phases[0].flags = 0x00
            phase_idx++
        ↓
        Token 2: strtok_r(NULL, "+", ...) → "Tsf"
            phases[1].mode = MODE_TCPSCAN (1)
            decode_tcpflags("sf") → 0x00
            phases[1].flags = 0x00
            phase_idx++
        ↓
        Token 3: strtok_r(NULL, "+", ...) → NULL (done)
        ↓
        num_phases = 2
        ← Returns: phases[] array, num_phases=2
    }
    ↓
    Store in s->ss:
        s->ss->phases = phases (malloc'd array)
        s->ss->num_phases = 2
        s->ss->current_phase = 0
        s->ss->mode = phases[0].mode (4, for compatibility)
```

---

## Workunit Creation Example

### Current Single-Mode Workunit

```c
// workunits.c:137-443
workunit_add("192.168.1.0/24:mT,80", ...)

    Parse target: "192.168.1.0/24"
    ↓
    Parse mode: ":mT" → mode = MODE_TCPSCAN
    ↓
    Parse ports: "80"
    ↓
    Create single workunit:
        sw_u.s->magic = TCP_SEND_MAGIC
        sw_u.s->mode = MODE_TCPSCAN
        sw_u.s->target = 192.168.1.0
        sw_u.s->targetmask = 255.255.255.0
        sw_u.s->port_str = "80"
    ↓
    fifo_push(s->swu, workunit)
```

---

### Proposed Compound-Mode Workunit

```c
// workunits.c:137-443 (MODIFIED)
workunit_add("192.168.1.0/24:mA+Tsf,80", ...)

    Parse target: "192.168.1.0/24"
    ↓
    Parse mode: ":mA+Tsf" → Detect '+' delimiter
    ↓
    scan_parsemode_compound("A+Tsf", &phases, &num_phases, ...)
        phases[0] = {mode: MODE_ARPSCAN, flags: 0x00}
        phases[1] = {mode: MODE_TCPSCAN, flags: 0x00}
        num_phases = 2
    ↓
    Parse ports: "80" (applies to all phases)
    ↓
    Create phase 0 workunit (ARP):
        sw_u0.s->magic = ARP_SEND_MAGIC
        sw_u0.s->mode = MODE_ARPSCAN
        sw_u0.s->target = 192.168.1.0
        sw_u0.s->phase_id = 0
        sw_u0.s->next_phase_id = 1 (NEW: link to next phase)
    ↓
    Create phase 1 workunit (TCP):
        sw_u1.s->magic = TCP_SEND_MAGIC
        sw_u1.s->mode = MODE_TCPSCAN
        sw_u1.s->tcphdrflgs = 0x00 (clear SYN/FIN)
        sw_u1.s->target = 192.168.1.0
        sw_u1.s->port_str = "80"
        sw_u1.s->phase_id = 1
        sw_u1.s->prev_phase_id = 0 (NEW: link to previous phase)
    ↓
    fifo_push(s->swu, workunit0)
    fifo_push(s->swu, workunit1)
```

---

## Testing Scenarios

### Test Case 1: Basic Compound Mode
```bash
unicornscan -mA+T 192.168.1.1

Expected:
  Phase 0: ARP request to 192.168.1.1
  Phase 1: TCP SYN scan to 192.168.1.1 (default ports)

Parser Output:
  phases[0] = {mode: MODE_ARPSCAN (4), flags: 0x00}
  phases[1] = {mode: MODE_TCPSCAN (1), flags: TH_SYN (0x02)}
  num_phases = 2
```

---

### Test Case 2: Compound with TCP Flags
```bash
unicornscan -mA+Tsf 192.168.1.1:80

Expected:
  Phase 0: ARP request to 192.168.1.1
  Phase 1: TCP connect scan to 192.168.1.1:80 (SYN/FIN cleared)

Parser Output:
  phases[0] = {mode: MODE_ARPSCAN (4), flags: 0x00}
  phases[1] = {mode: MODE_TCPSCAN (1), flags: 0x00 (sf cleared)}
  num_phases = 2
```

---

### Test Case 3: Compound with Complex Flags
```bash
unicornscan -mA+TSFRPA 192.168.1.1:22

Expected:
  Phase 0: ARP request
  Phase 1: TCP with SYN+FIN+RST+PUSH+ACK flags

Parser Output:
  phases[0] = {mode: MODE_ARPSCAN (4), flags: 0x00}
  phases[1] = {mode: MODE_TCPSCAN (1), flags: 0x1F (00011111)}
  num_phases = 2

Binary Breakdown:
  TH_SYN (S) = 0x02 = 00000010
  TH_FIN (F) = 0x01 = 00000001
  TH_RST (R) = 0x04 = 00000100
  TH_PSH (P) = 0x08 = 00001000
  TH_ACK (A) = 0x10 = 00010000
  ---------------------------------
  OR'd result = 0x1F = 00011111
```

---

### Test Case 4: Per-Target Compound Mode
```bash
unicornscan 192.168.1.1:mA+T,80-443 192.168.1.2:mU

Expected:
  Target 1: Compound mode (ARP + TCP) on ports 80-443
  Target 2: Single mode (UDP) on default ports

Parser Output:
  Target 1:
    phases[0] = {mode: MODE_ARPSCAN (4), flags: 0x00}
    phases[1] = {mode: MODE_TCPSCAN (1), flags: TH_SYN (0x02)}
    num_phases = 2
    ports = "80-443"

  Target 2:
    mode = MODE_UDPSCAN (2)
    flags = 0x00
    num_phases = 0 (single mode)
    ports = global_ports
```

---

## Summary Table

| Component | File | Function | Lines | Purpose |
|-----------|------|----------|-------|---------|
| **CLI Handler** | getconfig.c | (switch case) | 276-280 | Process `-m` flag |
| **Mode Dispatcher** | scanopts.c | scan_setoptmode() | 237-239 | Call parser with globals |
| **Main Parser** | scanopts.c | scan_parsemode() | 241-330 | Parse mode string |
| **TCP Flag Parser** | scanopts.c | decode_tcpflags() | 332-392 | Extract TCP flags |
| **Per-Target Parser** | workunits.c | workunit_add() | 182-208 | Parse `:mT` syntax |
| **Settings Struct** | scanopts.h | scan_settings_t | 24-62 | Store parsed config |
| **Mode Constants** | scan_export.h | #define MODE_* | 50-54 | Mode identifiers |
| **Flag Constants** | scan_export.h | #define TH_* | 22-48 | TCP flag bits |

---

## Extension Checklist

- [ ] Add `scan_parsemode_compound()` function (scanopts.c:331+)
- [ ] Add `scan_phase_t` structure (scanopts.h:23+)
- [ ] Add phase fields to `scan_settings_t` (scanopts.h:54+)
- [ ] Modify `scan_parsemode()` to detect `+` (scanopts.c:257+)
- [ ] Modify `workunit_add()` to handle compound modes (workunits.c:186+)
- [ ] Add phase sequencing logic (sender.c - new file changes)
- [ ] Add result correlation for multi-phase (listener.c - new changes)
- [ ] Update function declarations (scan_export.h:150+)
- [ ] Add unit tests for tokenization
- [ ] Add integration tests for compound scans

---

## Code Reuse Opportunities

**High Reuse** (no changes needed):
- `decode_tcpflags()` → Use as-is for each phase
- Mode constants → No new constants needed
- TCP flag constants → Existing flags sufficient

**Medium Reuse** (minor wrapper needed):
- Single-mode parsing logic → Reuse inside compound parser loop
- Workunit creation → Adapt for phase linking

**New Code Required**:
- Tokenization on `+` delimiter
- Phase array management
- Phase sequencing execution
- Result correlation across phases

---

## Memory Management Notes

**Compound Mode Allocations**:
```c
// In scan_parsemode_compound()
scan_phase_t *phases = (scan_phase_t *)xmalloc(sizeof(scan_phase_t) * 8);
// ... populate phases ...
s->ss->phases = phases;  // Store in global settings

// In cleanup (add to scan_setdefaults() or similar):
if (s->ss->phases != NULL) {
    xfree(s->ss->phases);
    s->ss->phases = NULL;
}
```

**Per-Workunit Storage**:
```c
// Each workunit gets copy of phase config (not pointer)
sw_u.s->phase_id = i;
sw_u.s->mode = phases[i].mode;
sw_u.s->tcphdrflgs = phases[i].tcphdrflgs;
// No need to free phases in workunit cleanup
```

---

**End of Code Snippets Reference**
