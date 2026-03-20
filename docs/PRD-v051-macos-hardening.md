# PRD: macOS Port Hardening (v0.5.1)

**Version:** 1.0
**Date:** 2026-03-20
**Status:** Draft
**Author:** CFA Swarm (Agents #1-#7)
**Predecessor:** PRD-macos-support.md (v0.5.0)
**Target Release:** v0.5.1

---

## 1. Overview

### 1.1 Purpose

The v0.5.0 release delivered macOS Apple Silicon as a first-class platform with 19 of 20 stories completed (95%). This PRD addresses the items that were deferred, discovered as limitations, or identified as needing hardening during the v0.5.0 implementation. It is the authoritative plan for v0.5.1.

### 1.2 What v0.5.0 Deferred or Left Incomplete

| Item | v0.5.0 Status | Impact |
|------|---------------|--------|
| macOS sandbox profile (`sandbox_init()`) | Deferred -- API deprecated, rejects custom profiles | Listener process has no process-level sandboxing on macOS |
| libdnet `/dev/bpf0` hardcoding | Documented limitation, workaround applied | Only one libdnet-using process at a time; fragile under concurrent BPF consumers |
| Stale process potential on abnormal exit | Not addressed | Orphaned `unisend`/`unilisten` processes may persist after crash or SIGKILL |
| Privilege model documentation | Partial (ChmodBPF exists) | Users unclear on which operations need sudo vs ChmodBPF vs no privilege |
| ICMP scan validation | Not tested on macOS | `MODE_ICMPSCAN` untested; may silently fail or produce incorrect results |
| Distribution validation (Homebrew/DMG) | Formula written but sha256 is `PLACEHOLDER` | No end-to-end install/uninstall testing documented |
| Security audit of macOS-specific code | Not performed | Zero high/critical finding claim unvalidated |

### 1.3 Objective

Harden the macOS port so that:
1. Process isolation exists beyond "running as non-root"
2. BPF device management is robust under concurrent access
3. Child processes never orphan under any exit condition
4. The privilege model is documented and testable
5. All scan modes (including ICMP) are validated on macOS
6. Distribution channels are tested end-to-end
7. macOS-specific code passes a focused security review

---

## 2. Scope

### 2.1 In Scope

- Process sandboxing via `sandbox_compile_file()` + `sandbox_apply()` SPI in `src/unilib/arch.c`
- libdnet BPF device iteration fix or native BPF replacement layer
- Robust child process lifecycle management (`chld_reapall()` hardening, PID tracking)
- Privilege model documentation with testable assertions
- Homebrew formula validation (sha256, `brew test`, `brew audit`)
- DMG installer end-to-end testing
- ICMP scan mode validation on macOS
- Security audit of macOS-specific code paths

### 2.2 Out of Scope

- Windows / WSL support
- Intel Mac (x86_64-apple-darwin) support
- macOS code signing and notarization (Phase 2, per v0.5.0 PRD)
- kqueue performance optimization (already implemented in v0.5.0)
- Alicorn .app launcher enhancements
- New scan modes or protocol support

---

## 3. Epic 1: Process Sandboxing

**Goal:** Replace the non-functional `sandbox_init()` with a working process isolation mechanism for the listener and sender child processes on macOS.

### 3.1 Background

The v0.5.0 PRD (Story 3.2) discovered that `sandbox_init(SANDBOX_NAMED)` is deprecated since macOS 10.8 and rejects custom `.sb` profile text on modern macOS (10.15+). The current implementation in `src/unilib/arch.c:197-215` logs a message and returns 0, meaning no sandbox is applied.

The `.sb` profile at `macos/unicornscan-listener.sb` (188 lines) is well-crafted with deny-default policy, network/sysctl/mach-lookup allowances, and restricted filesystem access. It is ready for use but has no delivery mechanism.

### 3.2 Recommended Approach: `sandbox_compile_file()` + `sandbox_apply()` SPI

The deprecated `sandbox_init()` was a thin wrapper around private SPI functions in `libsandbox.1.dylib`. These underlying functions remain functional and are used by all Apple system daemons. They were **tested and confirmed working on macOS 26.3.1** during v0.5.0 research.

The approach uses `dlopen`/`dlsym` to load the SPI at runtime, avoiding a hard ABI dependency. If the symbols are unavailable on a future macOS version, the code falls through gracefully (same behavior as today).

**Why this is preferred over `sandbox-exec` wrapping:**
- No changes to `chld.c` — sandbox applied from within `apply_sandbox()` in `arch.c`, exactly where the current stub lives
- No extra process in the chain — no argv complications, no `ps` output changes
- The SPI symbols (`sandbox_compile_file`, `sandbox_apply`, etc.) are present in macOS SDK TBD stubs from 10.6 through 26.2, and in the runtime `libsandbox.1.dylib`
- Architecturally identical to the original `sandbox_init()` design intent

#### Story 3.2.1: Implement `apply_sandbox()` via libsandbox SPI

**Priority:** P1
**File:** `src/unilib/arch.c:197-215`

**Current code** (stub):
```c
static int apply_sandbox(void) {
    DBG(M_CLD, "macOS sandbox_init() is deprecated, sandboxing skipped");
    VRB(2, "sandbox not available on this macOS version");
    return 0;
}
```

**Proposed change:**
```c
#include <dlfcn.h>

/* Private SPI types from libsandbox.1.dylib (not in public sandbox.h) */
typedef struct _sandbox_profile sandbox_profile_t;
typedef struct _sandbox_params  sandbox_params_t;

typedef sandbox_params_t  *(*fn_create_params)(void);
typedef void               (*fn_free_params)(sandbox_params_t *);
typedef sandbox_profile_t *(*fn_compile_file)(const char *, sandbox_params_t *, char **);
typedef int                (*fn_apply)(sandbox_profile_t *);
typedef void               (*fn_free_profile)(sandbox_profile_t *);

static int apply_sandbox(void) {
    void *libsb=NULL;
    fn_create_params  sb_create_params =NULL;
    fn_free_params    sb_free_params   =NULL;
    fn_compile_file   sb_compile_file  =NULL;
    fn_apply          sb_apply         =NULL;
    fn_free_profile   sb_free_profile  =NULL;
    sandbox_params_t  *params=NULL;
    sandbox_profile_t *profile=NULL;
    char *error=NULL;
    int rc=0;

#ifndef SANDBOX_PROFILE
    DBG(M_CLD, "SANDBOX_PROFILE not defined, sandbox skipped");
    return 0;
#else
    /*
     * Resolve SPI symbols at runtime via dlopen/dlsym so the binary
     * degrades gracefully on any future macOS that removes them.
     */
    libsb=dlopen("/usr/lib/libsandbox.1.dylib", RTLD_LAZY | RTLD_LOCAL);
    if (libsb == NULL) {
        VRB(1, "libsandbox not available, sandbox skipped: %s", dlerror());
        return 0;
    }

    sb_create_params=dlsym(libsb, "sandbox_create_params");
    sb_free_params  =dlsym(libsb, "sandbox_free_params");
    sb_compile_file =dlsym(libsb, "sandbox_compile_file");
    sb_apply        =dlsym(libsb, "sandbox_apply");
    sb_free_profile =dlsym(libsb, "sandbox_free_profile");

    if (sb_create_params == NULL || sb_compile_file == NULL || sb_apply == NULL) {
        VRB(1, "sandbox SPI symbols not found, sandbox skipped");
        dlclose(libsb);
        return 0;
    }

    params=sb_create_params();
    profile=sb_compile_file(SANDBOX_PROFILE, params, &error);
    if (sb_free_params != NULL) sb_free_params(params);

    if (profile == NULL) {
        VRB(1, "sandbox_compile_file(%s) failed: %s", SANDBOX_PROFILE,
            error ? error : "(null)");
        dlclose(libsb);
        return 0;
    }

    rc=sb_apply(profile);
    if (sb_free_profile != NULL) sb_free_profile(profile);
    dlclose(libsb);

    if (rc != 0) {
        ERR("sandbox_apply failed (rc=%d)", rc);
        return -1;
    }

    VRB(1, "macOS sandbox applied from `%s'", SANDBOX_PROFILE);
    return 1;
#endif /* SANDBOX_PROFILE */
}
```

**Acceptance Criteria:**
- [x] `sandbox_compile_file` + `sandbox_apply` confirmed working on macOS 26.3.1 (tested during v0.5.0 research)
- [ ] `configure.ac` sets `SANDBOX_PROFILE` to `${datadir}/unicornscan/unicornscan-listener.sb`
- [ ] `dlopen`/`dlsym` gracefully degrades if `libsandbox.1.dylib` is missing or symbols removed
- [ ] Listener process runs inside sandbox on macOS
- [ ] Linux behavior completely unchanged (`#ifdef HAVE_SANDBOX_H` guard)
- [ ] Scan results identical with and without sandbox

#### Story 3.2.2: Create Sender Sandbox Profile

**Priority:** P2
**New file:** `macos/unicornscan-sender.sb`

The sender process (`unisend`) has different needs than the listener: it requires write access to BPF devices for packet injection but does not need pcap capture. A separate `.sb` profile should be created.

**Acceptance Criteria:**
- [ ] Sender `.sb` profile denies file creation, process spawning, and fork
- [ ] Allows BPF device write, IPC socket communication, sysctl read
- [ ] TCP SYN, UDP, and ARP scans work with sender sandboxed

#### Story 3.2.3: Validate SPI Availability Across macOS Versions

**Priority:** P1
**Type:** Research/Validation

The SPI symbols are present in SDK TBD stubs from macOS 10.6 through 26.2. Validate runtime behavior on:
- macOS 13 Ventura
- macOS 14 Sonoma
- macOS 15 Sequoia
- macOS 26 Tahoe (confirmed working)

**Acceptance Criteria:**
- [ ] `sandbox-exec -f profile.sb /usr/bin/true` works on all target versions
- [ ] SIP (System Integrity Protection) does not block `sandbox-exec` on user binaries
- [ ] Document fallback plan if Apple removes `sandbox-exec`

#### Story 3.2.4: Alternative Investigation -- App Sandbox Entitlements

**Priority:** P3 (research only)
**Type:** Spike

Investigate whether code-signed binaries with App Sandbox entitlements can provide equivalent isolation without `sandbox-exec`. This requires code signing infrastructure (deferred to Phase 2 in v0.5.0 PRD).

**Acceptance Criteria:**
- [ ] Document whether App Sandbox entitlements can restrict a command-line tool
- [ ] Document impact on BPF device access when App Sandbox is enabled
- [ ] Recommendation: proceed or defer to Phase 2

---

## 4. Epic 2: BPF Device Management

**Goal:** Eliminate the libdnet `/dev/bpf0` hardcoding limitation so that unicornscan reliably opens BPF devices even when other BPF consumers are active.

### 4.1 Background

Homebrew's libdnet 1.18.2 hardcodes `/dev/bpf0` in its `eth_open()` implementation (confirmed via `strings libdnet.1.dylib` during v0.5.0). If any other process holds `/dev/bpf0`, `eth_open()` fails with `EBUSY`.

The v0.5.0 workaround reordered `eth_open()` before `pcap_open_live()` in `src/tools/fantaip.c` so libdnet grabs `/dev/bpf0` first. But in `src/scan_progs/send_packet.c:1268-1274`, `eth_open()` is called via `open_link(SOCK_LL, ...)` and may fail if `/dev/bpf0` is already held by the listener's pcap session.

### 4.2 Option Analysis

| Option | Effort | Risk | Maintenance |
|--------|--------|------|-------------|
| A. Patch libdnet to iterate `/dev/bpf0`-`/dev/bpf255` | Medium | Low (well-understood fix) | Must maintain fork or upstream patch |
| B. Replace libdnet `eth_open` with native BPF wrapper | High | Medium (new code) | Self-maintained but no external dependency |
| C. Use Homebrew libdnet `--HEAD` with fix | Low | High (upstream may not accept) | Depends on upstream |
| D. Open ordering guarantee (current workaround) | Done | Medium (fragile) | Already in place |

**Recommended approach:** Option A (patch libdnet) with Option D as fallback.

#### Story 4.2.1: Patch Bundled libdnet BPF Device Iteration

**Priority:** P1
**File:** `libs/` (bundled libdnet source)

The bundled libdnet in `libs/` should be patched so that `eth_open()` iterates `/dev/bpf0` through `/dev/bpf255` (the same algorithm that libpcap uses). This is a ~20-line change to `src/bpf.c` within the libdnet source tree.

**Implementation sketch** (Jack Louis style):
```c
/* iterate BPF devices like libpcap does */
static int bpf_open_device(void) {
    int fd=-1;
    int j=0;
    char bpf_path[16];

    for (j=0; j < 256; j++) {
        snprintf(bpf_path, sizeof(bpf_path) - 1, "/dev/bpf%d", j);
        fd=open(bpf_path, O_RDWR);
        if (fd >= 0) {
            return fd;
        }
        if (errno != EBUSY) {
            break;
        }
    }

    return -1;
}
```

**Acceptance Criteria:**
- [ ] `eth_open()` succeeds even when `/dev/bpf0` is held by another process
- [ ] fantaip and unicornscan can run simultaneously without BPF contention
- [ ] Multiple unicornscan instances can run concurrently on different interfaces
- [ ] Linux build uses system libdnet unchanged

#### Story 4.2.2: Prefer System libdnet When Patched

**Priority:** P2
**File:** `configure.ac`

Add a `--with-system-libdnet` option that prefers the Homebrew-installed libdnet if it is version >= 1.19 (assuming upstream fixes the issue). Fall back to the bundled patched copy otherwise.

**Acceptance Criteria:**
- [ ] `./configure --with-system-libdnet` uses Homebrew's libdnet
- [ ] `./configure` (default) uses bundled patched libdnet on macOS
- [ ] Version detection logged in configure output

#### Story 4.2.3: BPF Device Exhaustion Handling

**Priority:** P2
**File:** `src/scan_progs/send_packet.c:1258-1282`

When `eth_open()` fails (all BPF devices busy), the current code calls `terminate()`. Instead, provide a diagnostic message explaining how to free BPF devices.

**Current code** (`send_packet.c:1271-1273`):
```c
if (sl.s_u.llsock == NULL) {
    terminate("dnet eth_open `%s' fails", s->interface_str);
}
```

**Proposed change:**
```c
if (sl.s_u.llsock == NULL) {
    ERR("eth_open `%s' fails: all /dev/bpf* devices may be busy", s->interface_str);
    ERR("check: lsof /dev/bpf* | grep -v unicornscan");
    terminate("cannot open link-layer socket");
}
```

**Acceptance Criteria:**
- [ ] User sees actionable diagnostic when BPF devices are exhausted
- [ ] Message includes `lsof` command to identify BPF holders
- [ ] No change to Linux behavior

---

## 5. Epic 3: Process Lifecycle Robustness

**Goal:** Ensure that `unisend` and `unilisten` child processes never orphan under any exit condition, including crash, SIGKILL, and abnormal termination.

### 5.1 Background

The master process in `src/scan_progs/master.c` spawns children via `fork()`/`execve()` in `src/chld.c:78-189`. Child cleanup relies on:

1. **Normal exit:** `terminate_listeners()` sends `MSG_TERMINATE` over IPC (master.c:643-662), then `chld_reapall()` waits for SIGCHLD signals (chld.c:47-60).
2. **SIGCHLD handler:** `signals_chlddead()` in `src/usignals.c:81-91` calls `wait(&status)` and increments `children_dead`.
3. **Reap loop:** `chld_reapall()` spins for up to 1 second (100 iterations x 10ms) comparing `child_forked` to `signals_deadcount()`, then gives up with `"am i missing children?, oh well"`.

**Failure modes on macOS:**

- **Master SIGKILL'd:** Children become orphaned. No SIGTERM is sent. Children continue running as `init` (PID 1) adoptees. On macOS, `launchd` (PID 1) does not automatically kill adopted children.
- **IPC socket broken:** If the Unix domain socket is deleted or the master crashes mid-write, the child may block in `recv_messages()` indefinitely.
- **`chld_reapall()` timeout:** The 1-second timeout is too short if a child is stuck in a blocking syscall. The "oh well" error message provides no remediation.

### 5.2 Concern: Master Loop Hang at Line 276-330

The master loop in `master.c:276-330` has the termination condition `(s->senders + s->listeners) > 0`. If a child crashes without decrementing these counters, the master loops forever. The `drone_poll()` call at line 294 uses `s->master_tickrate` as timeout but there is no overall watchdog.

#### Story 5.3.1: Track Child PIDs Explicitly

**Priority:** P1
**Files:** `src/chld.c`, `src/chld.h`

Store the PIDs returned by `fork()` so they can be explicitly killed during cleanup.

**Current state:** `chld_sender` and `chld_listener` are local variables in `chld_fork()` (chld.c:79). After fork, the PIDs are discarded.

**Proposed change:**
```c
/* in chld.c, module-level static */
static pid_t child_pids[MAX_CHILDREN];
static int child_forked=0;

/* in chld_fork(), after successful fork: */
child_pids[child_forked]=chld_sender;  /* or chld_listener */
child_forked++;
```

Add `chld_killall()`:
```c
void chld_killall(void) {
    int j=0;

    for (j=0; j < child_forked; j++) {
        if (child_pids[j] > 0) {
            if (kill(child_pids[j], SIGTERM) < 0 && errno != ESRCH) {
                ERR("kill(%d, SIGTERM) fails: %s", child_pids[j], strerror(errno));
            }
        }
    }

    /* give children 500ms to exit, then SIGKILL */
    usleep(500000);

    for (j=0; j < child_forked; j++) {
        if (child_pids[j] > 0) {
            if (kill(child_pids[j], 0) == 0) {
                DBG(M_CLD, "child %d still alive, sending SIGKILL", child_pids[j]);
                kill(child_pids[j], SIGKILL);
            }
        }
    }

    return;
}
```

**Acceptance Criteria:**
- [ ] Child PIDs stored in module-level array
- [ ] `chld_killall()` sends SIGTERM then SIGKILL after 500ms
- [ ] `chld_killall()` called from `terminate()` handler
- [ ] No stale `unisend`/`unilisten` processes after `kill -9 <master_pid>`

#### Story 5.3.2: Master Loop Watchdog Timer

**Priority:** P1
**File:** `src/scan_progs/master.c:276-330`

Add a watchdog that terminates the master loop if no progress is made within `recv_timeout * 3` seconds.

**Implementation sketch:**
```c
time_t last_progress;
time(&last_progress);

for (master_state=MASTER_START; (s->senders + s->listeners) > 0 ;) {
    /* existing loop body ... */

    /* watchdog: if no state change for too long, break */
    if (master_state != prev_state) {
        time(&last_progress);
        prev_state=master_state;
    }
    else {
        time_t now;
        time(&now);
        if ((now - last_progress) > (s->ss->recv_timeout * 3)) {
            ERR("master loop watchdog: no progress for %ld seconds, forcing exit",
                (long)(now - last_progress));
            break;
        }
    }
}
```

**Acceptance Criteria:**
- [ ] Master loop exits if stuck for `recv_timeout * 3` seconds
- [ ] Watchdog timer resets on every state transition
- [ ] ERR message logged before forced exit
- [ ] Child processes cleaned up via `chld_killall()` on forced exit

#### Story 5.3.3: Harden `chld_reapall()` with `waitpid()`

**Priority:** P2
**File:** `src/chld.c:47-60`, `src/usignals.c:81-91`

The current SIGCHLD handler calls `wait(&status)` which only reaps one child per signal delivery. If two children die simultaneously, one may be missed. Replace with `waitpid(-1, &status, WNOHANG)` loop.

**Current code** (`usignals.c:85`):
```c
if (wait(&status) > 0) {
    ++children_dead;
}
```

**Proposed change:**
```c
{
    pid_t wpid;
    while ((wpid=waitpid(-1, &status, WNOHANG)) > 0) {
        ++children_dead;
        DBG(M_CLD, "reaped child %d, status %d", (int)wpid, status);
    }
}
```

**Acceptance Criteria:**
- [ ] All children reaped even when multiple die simultaneously
- [ ] No zombie processes left after scan completion
- [ ] `chld_reapall()` timeout reduced to 500ms (50 iterations) with explicit PID-based wait as fallback

#### Story 5.3.4: Register `atexit()` Handler for Child Cleanup

**Priority:** P2
**File:** `src/main.c`

Register an `atexit()` handler early in `main()` that calls `chld_killall()`. This covers the case where `main()` returns normally but children are still running.

**Acceptance Criteria:**
- [ ] `atexit(chld_cleanup)` registered before `chld_fork()`
- [ ] Cleanup handler is safe to call multiple times (idempotent)
- [ ] Works on both Linux and macOS

---

## 6. Epic 4: Privilege Model Documentation

**Goal:** Clearly document which operations require root/sudo, which require ChmodBPF group membership, and which work as a normal user.

### 6.1 Background

The v0.5.0 port introduced ChmodBPF for non-root BPF access, but the privilege model has multiple layers that interact:

1. **BPF device access** (`/dev/bpf*`): Requires ChmodBPF group or root
2. **Privilege drop** (`arch.c:218-355`): `drop_privs()` uses `setreuid()`/`setregid()` to drop to `NOPRIV_USER`, but only when running as root (line 236)
3. **Raw socket** (`ip_open()` in libdnet): Uses `SOCK_RAW` which requires root on macOS unless SIP is disabled
4. **Link-layer socket** (`eth_open()` in libdnet): Uses BPF, covered by ChmodBPF

#### Story 6.4.1: Create Privilege Model Reference

**Priority:** P1
**New file:** `docs/PRIVILEGES-macos.md`

Document the complete privilege matrix:

| Operation | Root | ChmodBPF Group | Normal User | Notes |
|-----------|------|----------------|-------------|-------|
| TCP SYN scan (`-mT`) | Yes | Yes (uses `ip_open()` via BPF) | No | `ip_open()` on macOS uses BPF, not `SOCK_RAW` |
| UDP scan (`-mU`) | Yes | Yes | No | Same as TCP SYN |
| ARP scan (`-mA`) | Yes | Yes (link-layer) | No | Requires `eth_open()` |
| ICMP scan (`-mI`) | Yes | Needs testing | No | Uses `ip_open()` |
| Connect scan (`-mTsf -econnect`) | Yes | Yes | Possibly (no raw sockets) | Investigate |
| fantaip | Yes | Yes | No | Requires both `eth_open()` and `pcap_open_live()` |
| `unilisten` (pcap capture) | Yes | Yes | No | `pcap_open_live()` on BPF |
| ChmodBPF install | Yes (sudo) | N/A | N/A | One-time setup |
| Homebrew install | No | N/A | N/A | Homebrew runs as user |
| DMG install | Yes (sudo for LaunchDaemon) | N/A | N/A | Installer package |

**Acceptance Criteria:**
- [ ] Every scan mode documented with privilege requirements
- [ ] ChmodBPF setup instructions included
- [ ] Troubleshooting section for permission errors
- [ ] Tested on fresh macOS install with only ChmodBPF (no sudo)

#### Story 6.4.2: Improve Permission Error Messages

**Priority:** P1
**Files:** `src/scan_progs/send_packet.c:1258-1282`, `src/scan_progs/recv_packet.c`

When BPF access fails due to permissions, provide macOS-specific guidance.

**Current error** (send_packet.c:1263):
```c
terminate("dnet ip_open fails");
```

**Proposed change:**
```c
if (sl.s_u.ipsock == NULL) {
#ifdef __APPLE__
    ERR("ip_open fails: BPF device permission denied?");
    ERR("fix: run `sudo install-chmodbpf.sh` and add your user to the 'unicornscan' group");
    ERR("then: sudo dseditgroup -o edit -a $(whoami) -t user unicornscan");
#endif
    terminate("dnet ip_open fails");
}
```

**Acceptance Criteria:**
- [ ] macOS-specific help text on BPF permission failure
- [ ] Instructions reference the actual ChmodBPF install script
- [ ] Linux error messages unchanged

#### Story 6.4.3: Runtime Privilege Check at Startup

**Priority:** P2
**File:** `src/main.c`

Before forking children, check that the current user has BPF access. Fail early with a clear message rather than letting the child process fail opaquely.

**Implementation sketch:**
```c
#ifdef __APPLE__
static int check_bpf_access(void) {
    int fd=-1;

    fd=open("/dev/bpf0", O_RDWR);
    if (fd < 0) {
        if (errno == EACCES) {
            ERR("cannot open /dev/bpf0: permission denied");
            ERR("run: sudo %s/install-chmodbpf.sh", DATADIR);
            ERR("then: sudo dseditgroup -o edit -a $(whoami) -t user unicornscan");
            return -1;
        }
        /* EBUSY is ok -- someone else has bpf0 but we might get bpf1 */
        if (errno != EBUSY) {
            ERR("cannot open /dev/bpf0: %s", strerror(errno));
            return -1;
        }
    }
    else {
        close(fd);
    }

    return 1;
}
#endif
```

**Acceptance Criteria:**
- [ ] BPF access checked before `chld_fork()`
- [ ] EBUSY treated as non-error (another process holds bpf0)
- [ ] EACCES produces actionable error with fix instructions
- [ ] Check skipped when running as root

---

## 7. Epic 5: Distribution Validation

**Goal:** Validate that both Homebrew and DMG distribution channels produce working installations through end-to-end testing.

### 7.1 Background

The Homebrew formula (`macos/unicornscan.rb`) has `sha256 "PLACEHOLDER"` (line 19) and has not been tested through a full `brew install` cycle. The DMG build script (`macos/dmg/build-dmg.sh`, 594 lines) has not been validated on a clean macOS system.

#### Story 7.5.1: Complete Homebrew Formula

**Priority:** P0
**File:** `macos/unicornscan.rb`

**Tasks:**
1. Generate correct sha256 from the v0.5.0 release tarball
2. Add `test` block that validates scanner functionality
3. Add `caveats` block explaining ChmodBPF setup
4. Run `brew audit --strict unicornscan` and fix all warnings
5. Run `brew install --build-from-source unicornscan` on clean system

**Proposed test block:**
```ruby
test do
  # Verify the binary runs and reports version
  assert_match "unicornscan #{version}", shell_output("#{bin}/unicornscan -V 2>&1", 1)

  # Verify modules directory exists and has .dylib files
  assert_predicate lib/"unicornscan/modules", :directory?

  # Verify config files installed
  assert_predicate etc/"unicornscan/unicorn.conf", :exist?
end
```

**Proposed caveats block:**
```ruby
def caveats
  <<~EOS
    To scan without sudo, enable non-root BPF access:
      sudo #{opt_share}/unicornscan/macos/install-chmodbpf.sh
      sudo dseditgroup -o edit -a $(whoami) -t user unicornscan

    Then log out and back in for group membership to take effect.

    For the Alicorn web UI (requires Docker):
      unicornscan-alicorn start
      open http://localhost:31337
  EOS
end
```

**Acceptance Criteria:**
- [ ] `brew install unicornscan` succeeds from source on Apple Silicon
- [ ] `brew test unicornscan` passes
- [ ] `brew audit --strict unicornscan` produces zero errors
- [ ] `brew uninstall unicornscan` cleanly removes all files
- [ ] sha256 matches the v0.5.1 release tarball

#### Story 7.5.2: Homebrew Bottle Generation

**Priority:** P1
**File:** `.github/workflows/release.yml`

The release workflow should produce a Homebrew bottle (pre-compiled binary) for `arm64_sonoma` to eliminate build-from-source time for users.

**Acceptance Criteria:**
- [ ] `build-macos` CI job produces a `.bottle.tar.gz` artifact
- [ ] Bottle uploaded to GitHub Release assets
- [ ] Formula includes `bottle do` block with correct sha256

#### Story 7.5.3: DMG Installer Validation

**Priority:** P1
**File:** `macos/dmg/build-dmg.sh`

**Test matrix:**

| Test | Command | Expected |
|------|---------|----------|
| Build DMG | `./build-dmg.sh` | Produces `unicornscan-0.5.1-arm64.dmg` |
| Mount | `hdiutil attach *.dmg` | Mounts without error |
| Install | Run preinstall, copy files, run postinstall | All files in correct locations per DMG path reference |
| Scanner runs | `/usr/local/bin/unicornscan -V` | Prints version |
| ChmodBPF | `sudo install-chmodbpf.sh` | BPF devices accessible |
| Scan test | `unicornscan -mT 127.0.0.1:22` | Returns results |
| Uninstall | Follow uninstall instructions | All files removed |

**Acceptance Criteria:**
- [ ] DMG builds successfully from release CI
- [ ] All files installed to correct paths (per v0.5.0 PRD Appendix C)
- [ ] Scanner functional after DMG install on clean macOS
- [ ] Uninstall removes all files including LaunchDaemon

#### Story 7.5.4: Validate `build-from-source` Path

**Priority:** P1
**Type:** Validation

Test the developer build path on a clean macOS system:

```bash
xcode-select --install
brew install autoconf automake libtool libpcap libdnet flex bison
git clone https://github.com/robertelee78/unicornscan.git
cd unicornscan
autoreconf -fiv
./configure --prefix=/opt/homebrew --with-pgsql
make -j$(sysctl -n hw.ncpu)
sudo make install
```

**Acceptance Criteria:**
- [ ] Build succeeds with zero warnings on Apple Silicon
- [ ] `make install` places files in correct locations
- [ ] Scanner runs after manual install
- [ ] Module `.dylib` files load correctly

---

## 8. Epic 6: Scan Mode Validation and Security

**Goal:** Validate all scan modes on macOS (especially ICMP which was not tested in v0.5.0) and perform a focused security audit of macOS-specific code.

### 8.1 Background

The v0.5.0 PRD marked ICMP scan as "not yet tested" (Section 9.1). The `MODE_ICMPSCAN` code path exists in `src/scan_progs/workunits.c:500-502` with magic numbers `ICMP_SEND_MAGIC` (0x4a4b4c4d) and `ICMP_RECV_MAGIC` (0xa4b4c4d4), and the packet structures are defined in `src/scan_progs/packets.h:103-132`. The security audit checkbox (Section 9.2) is also unchecked.

#### Story 8.6.1: ICMP Scan Validation on macOS

**Priority:** P1
**Files:** `src/scan_progs/send_packet.c`, `src/scan_progs/recv_packet.c`

**Test plan:**

| Test | Command | Expected |
|------|---------|----------|
| ICMP echo scan | `sudo unicornscan -mI 192.168.1.1` | Host up/down reported |
| ICMP to localhost | `sudo unicornscan -mI 127.0.0.1` | Responds |
| ICMP to subnet | `sudo unicornscan -mI 192.168.1.0/24` | Multiple hosts discovered |
| ICMP with ChmodBPF only | `unicornscan -mI 192.168.1.1` (no sudo) | Works or fails gracefully |
| ICMP + verbose | `unicornscan -mI -v 192.168.1.1` | Shows packet counts |

**Key validation points:**
- ICMP uses `ip_open()` (SOCK_IP mode) not `eth_open()` -- verify this on macOS
- macOS may require different IP header byte order for ICMP (check `IP_HDRINCL` behavior)
- Verify the recv filter includes ICMP responses (`recv_packet.c:49`: `#define UDP_EFILTER "or icmp"`)

**Acceptance Criteria:**
- [ ] ICMP scan produces correct results on macOS
- [ ] No false positives from own outbound ICMP packets
- [ ] Clean process exit after ICMP scan (no stale children)
- [ ] Works with ChmodBPF (non-root) or document if root required

#### Story 8.6.2: Security Audit -- macOS-Specific Code Paths

**Priority:** P1
**Type:** Audit

Review all code behind `#ifdef __APPLE__`, `#ifdef HAVE_SANDBOX_INIT`, `#ifdef AF_LINK`, and `#ifdef HAVE_KQUEUE` for:

| Check | Files | Risk |
|-------|-------|------|
| Buffer overflow in sandbox path handling | `arch.c` | Medium |
| TOCTOU in BPF device open | `send_packet.c`, `fantaip.c` | Low |
| Race condition in child PID tracking | `chld.c`, `usignals.c` | Medium |
| Signal handler async-safety | `usignals.c:81-91` | Medium (`wait()` is async-safe but `DBG()` is not) |
| Privilege escalation after `drop_privs()` | `arch.c:218-355` | High |
| IPC socket permissions | `unilib/sockpath.c` | Medium |
| kqueue fd leak | `unilib/xpoll.c` | Low |

**Specific concerns identified during research:**

1. **`usignals.c:85` -- `wait()` in signal handler:** The `wait()` call is async-signal-safe, but incrementing `children_dead` (a non-atomic `int`) could race with `chld_reapall()` reading it. On macOS ARM64, this is likely safe due to strong memory ordering, but should use `sig_atomic_t`.

2. **`arch.c:236` -- non-root check:** `if (getuid() != 0)` skips privilege drop entirely. If the process has elevated capabilities (e.g., via ChmodBPF) but is not root, it retains those capabilities. This is acceptable for BPF but should be documented.

3. **`chld.c:113` -- `envz[0]='\0'`:** The child processes are `execve()`'d with an empty environment. This is intentional security hardening but means children cannot inherit `PATH`, `HOME`, etc. Verify this does not cause issues with `sandbox-exec` (which may need `PATH`).

**Acceptance Criteria:**
- [ ] All macOS `#ifdef` paths reviewed for memory safety
- [ ] `children_dead` counter changed to `volatile sig_atomic_t`
- [ ] No unvalidated buffer operations in macOS code paths
- [ ] Signal handlers contain only async-signal-safe functions
- [ ] Document any accepted risks with rationale

#### Story 8.6.3: Validate `pcap_setdirection` Behavior

**Priority:** P2
**File:** `src/scan_progs/recv_packet.c:284-289`

The v0.5.0 fix made `pcap_setdirection(PCAP_D_IN)` failure non-fatal. Validate that scan results are correct without direction filtering (i.e., the listener does not count its own outbound packets as results).

**Acceptance Criteria:**
- [ ] TCP SYN scan against known-state target produces identical results with and without `pcap_setdirection`
- [ ] No duplicate results from outbound packet reflection
- [ ] BPF filter in `recv_packet.c` already excludes own packets (verify)

---

## 9. Implementation Order

### Phase 1: Critical Fixes (Week 1-2)

**Goal:** Fix the most impactful issues that affect correctness and reliability.

| # | Story | Epic | Priority | Effort |
|---|-------|------|----------|--------|
| 1 | 5.3.1 Track child PIDs explicitly | E3 | P1 | 2h |
| 2 | 5.3.3 Harden `chld_reapall()` with `waitpid()` | E3 | P2 | 1h |
| 3 | 5.3.2 Master loop watchdog timer | E3 | P1 | 2h |
| 4 | 8.6.1 ICMP scan validation on macOS | E6 | P1 | 4h |
| 5 | 8.6.2 Security audit -- signal handler fix | E6 | P1 | 2h |

**Validation:** All scan modes pass on macOS. No stale processes after any exit path.

### Phase 2: Sandbox and BPF (Week 3-4)

**Goal:** Establish process isolation and fix BPF contention.

| # | Story | Epic | Priority | Effort |
|---|-------|------|----------|--------|
| 6 | 3.2.1 Wrap listener `execve()` with `sandbox-exec` | E1 | P1 | 4h |
| 7 | 3.2.3 Validate `sandbox-exec` across macOS versions | E1 | P1 | 4h |
| 8 | 4.2.1 Patch bundled libdnet BPF iteration | E2 | P1 | 4h |
| 9 | 4.2.3 BPF device exhaustion handling | E2 | P2 | 1h |
| 10 | 6.4.2 Improve permission error messages | E4 | P1 | 2h |

**Validation:** Listener runs inside sandbox. BPF contention eliminated.

### Phase 3: Distribution and Documentation (Week 5-6)

**Goal:** Ship validated distribution packages with complete documentation.

| # | Story | Epic | Priority | Effort |
|---|-------|------|----------|--------|
| 11 | 7.5.1 Complete Homebrew formula | E5 | P0 | 4h |
| 12 | 7.5.2 Homebrew bottle generation | E5 | P1 | 2h |
| 13 | 7.5.3 DMG installer validation | E5 | P1 | 4h |
| 14 | 7.5.4 Validate build-from-source path | E5 | P1 | 2h |
| 15 | 6.4.1 Create privilege model reference | E4 | P1 | 4h |
| 16 | 6.4.3 Runtime privilege check at startup | E4 | P2 | 2h |

**Validation:** `brew install unicornscan` and DMG install both produce working scanner.

### Phase 4: Polish (Week 7+)

| # | Story | Epic | Priority | Effort |
|---|-------|------|----------|--------|
| 17 | 3.2.2 Create sender sandbox profile | E1 | P2 | 4h |
| 18 | 3.2.4 App Sandbox entitlements investigation | E1 | P3 | 8h |
| 19 | 4.2.2 Prefer system libdnet when patched | E2 | P2 | 2h |
| 20 | 5.3.4 Register `atexit()` handler | E3 | P2 | 1h |
| 21 | 8.6.3 Validate `pcap_setdirection` behavior | E6 | P2 | 2h |

**Validation:** Full security audit complete. Both child processes sandboxed.

---

## 10. Success Criteria

### 10.1 Functional Requirements

- [ ] All 4 scan modes (TCP SYN, UDP, ARP, ICMP) validated on macOS
- [ ] Listener process runs inside `sandbox-exec` sandbox on macOS
- [ ] No stale `unisend`/`unilisten` processes after any exit path (normal, SIGTERM, SIGKILL, crash)
- [ ] `brew install unicornscan` succeeds end-to-end on Apple Silicon
- [ ] `brew test unicornscan` passes
- [ ] DMG installer produces working installation on clean macOS
- [ ] BPF device contention eliminated (libdnet iterates `/dev/bpf0`-`/dev/bpf255`)
- [ ] Privilege model documented with testable assertions

### 10.2 Non-Functional Requirements

- [ ] Zero high/critical findings in macOS security audit
- [ ] `volatile sig_atomic_t` used for signal-handler-shared counters
- [ ] All macOS error messages include actionable remediation steps
- [ ] No regression in Linux functionality
- [ ] Homebrew formula passes `brew audit --strict`

### 10.3 Measurable Outcomes

| Metric | v0.5.0 Baseline | v0.5.1 Target |
|--------|-----------------|---------------|
| Scan modes validated on macOS | 3 of 4 (75%) | 4 of 4 (100%) |
| Process sandboxing | None | Listener sandboxed |
| Stale process after SIGKILL | Possible | Impossible (PID tracking + atexit) |
| Distribution channels tested | 0 of 2 | 2 of 2 |
| Security audit findings addressed | Unknown | All high/critical resolved |
| Homebrew formula sha256 | PLACEHOLDER | Correct hash |

---

## 11. Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Apple removes `sandbox-exec` in future macOS | High | Low | Fallback to unsandboxed exec; investigate App Sandbox entitlements (Story 3.2.4) |
| libdnet patch breaks Linux build | High | Low | Patch conditional on `__APPLE__`; keep system libdnet option |
| ICMP scan requires root even with ChmodBPF | Medium | Medium | Document in privilege model; test and confirm |
| Homebrew formula rejected by `brew audit` | Medium | Low | Run `brew audit --strict` early in development |
| `sandbox-exec` performance overhead | Low | Low | Benchmark scan speed with and without sandbox |
| `waitpid()` behavior difference on macOS | Low | Low | Use POSIX-compliant `waitpid(-1, &status, WNOHANG)` |
| Child environment empty after `execve()` | Medium | Medium | Verify `sandbox-exec` works with empty environment; add minimal env if needed |

---

## 12. Appendix

### A. Files Modified in v0.5.1

| File | Epic | Change |
|------|------|--------|
| `src/chld.c` | E3 | PID tracking, `chld_killall()` |
| `src/chld.h` | E3 | `chld_killall()` prototype |
| `src/usignals.c` | E3, E6 | `waitpid()` loop, `sig_atomic_t` |
| `src/scan_progs/master.c` | E3 | Watchdog timer |
| `src/main.c` | E3, E4 | `atexit()` handler, BPF access check |
| `src/unilib/arch.c` | E1 | `sandbox-exec` notes (minor) |
| `src/scan_progs/send_packet.c` | E2, E4 | BPF exhaustion message, permission help |
| `src/scan_progs/recv_packet.c` | E4 | Permission error message |
| `configure.ac` | E1, E2 | `HAVE_SANDBOX_EXEC`, `--with-system-libdnet` |
| `libs/` (libdnet source) | E2 | BPF iteration patch |
| `macos/unicornscan.rb` | E5 | sha256, test block, caveats |
| `.github/workflows/release.yml` | E5 | Bottle generation |
| `macos/dmg/build-dmg.sh` | E5 | Validation fixes |

### B. New Files in v0.5.1

| File | Epic | Purpose |
|------|------|---------|
| `macos/unicornscan-sender.sb` | E1 | Sender sandbox profile |
| `docs/PRIVILEGES-macos.md` | E4 | Privilege model reference |

### C. Key Source Locations Reference

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Sandbox apply | `src/unilib/arch.c` | 197-215 | `apply_sandbox()` -- currently no-op |
| Privilege drop | `src/unilib/arch.c` | 218-355 | `drop_privs()` |
| Child fork | `src/chld.c` | 78-189 | `chld_fork()` -- `execve()` callsite |
| Child reap | `src/chld.c` | 47-60 | `chld_reapall()` |
| Signal handler | `src/usignals.c` | 81-91 | `signals_chlddead()` |
| Master loop | `src/scan_progs/master.c` | 276-330 | Main scan state machine |
| Terminate listeners | `src/scan_progs/master.c` | 643-662 | IPC-based shutdown |
| Socket mode switch | `src/scan_progs/send_packet.c` | 1233-1282 | `open_link()` |
| BPF eth_open | `src/scan_progs/send_packet.c` | 1268-1274 | Link-layer socket open |
| Listener sandbox profile | `macos/unicornscan-listener.sb` | 1-188 | Deny-default `.sb` profile |
| Homebrew formula | `macos/unicornscan.rb` | 1-243 | Homebrew install recipe |
| ChmodBPF script | `macos/ChmodBPF` | 1-148 | BPF device permission script |
