---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - docs/PRD-v051-macos-hardening.md
---

# unicornscan - Epic Breakdown (v0.5.1 macOS Hardening)

## Overview

This document provides the complete epic and story breakdown for unicornscan v0.5.1, decomposing the requirements from the PRD-v051-macos-hardening into implementable stories with acceptance criteria.

## Mandatory Standards (Apply to EVERY Story)

### Coding Style: Jack Louis Style Guide

All code MUST follow `docs/jack-louis-coding-style-guide.md`. Key rules:

- `/* */` comments only, never `//`
- Return `1` for success, `-1` for error (NOT 0/1)
- `ERR()` for recoverable errors, `PANIC()` only for impossible conditions
- `xmalloc`/`xfree` wrappers, never raw malloc
- No spaces around `=` in assignments: `bob.e=eth_open(bob.device)` not `bob.e = eth_open(bob.device)`
- `XXX` prefix for warnings/notes/todos
- Static function prototypes at top of file
- `memset` after allocation
- Explicit `return;` at end of void functions
- `_u` suffix for union variables
- `_t` suffix for typedefs
- Magic numbers use consistent `0xNaNbNcNd` pattern
- `CLEAR()` macro for buffer zeroing
- Validate early, fail fast, `ERR()` + `return -1` on errors

### Project Mantra (Non-Negotiable)

> **DO NOT BE LAZY.** We have plenty of time to do it right. No short cuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Make use of search as needed. Measure 3x, cut once. No fallback. No stub (todo later) code. Just pure excellence, done the right way the entire time.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history. Understand WHY it was written that way before modifying it.

These standards are **blocking acceptance criteria** for every story. Code that violates the style guide or takes shortcuts will be rejected.

## Requirements Inventory

### Functional Requirements

FR1: Listener process must run inside a Seatbelt sandbox on macOS using `sandbox_compile_file()` + `sandbox_apply()` SPI via dlopen/dlsym
FR2: `apply_sandbox()` must degrade gracefully if libsandbox SPI symbols are unavailable
FR3: `eth_open()` must iterate `/dev/bpf0` through `/dev/bpf255` instead of hardcoding `/dev/bpf0`
FR4: fantaip and unicornscan must run simultaneously without BPF contention
FR5: Multiple unicornscan instances must run concurrently on different interfaces
FR6: Child PIDs (unisend, unilisten) must be tracked explicitly for cleanup
FR7: `chld_killall()` must send SIGTERM then SIGKILL after 500ms to all children
FR8: Master loop must exit if no progress for `recv_timeout * 3` seconds (watchdog)
FR9: SIGCHLD handler must reap all children via `waitpid(-1, WNOHANG)` loop
FR10: All 4 scan modes (TCP SYN, UDP, ARP, ICMP) must be validated on macOS
FR11: `brew install unicornscan` must succeed end-to-end on Apple Silicon
FR12: `brew test unicornscan` must pass
FR13: DMG installer must produce working installation on clean macOS
FR14: Permission error messages must include macOS-specific remediation steps
FR15: Runtime BPF access check at startup before forking children
FR16: Privilege model documented with testable assertions per scan mode

### NonFunctional Requirements

NFR1: Zero high/critical findings in macOS security audit
NFR2: `volatile sig_atomic_t` used for signal-handler-shared counters
NFR3: No regression in Linux functionality
NFR4: Homebrew formula passes `brew audit --strict`
NFR5: All macOS error messages include actionable remediation steps
NFR6: No stale unisend/unilisten after any exit path (normal, SIGTERM, SIGKILL, crash)
NFR7: Sandbox degradation is non-fatal (log and continue)
NFR8: All code follows Jack Louis coding style guide

### Additional Requirements

- `configure.ac` must set `SANDBOX_PROFILE` to `${datadir}/unicornscan/unicornscan-listener.sb`
- `configure.ac` must support `--with-system-libdnet` option
- Bundled libdnet BPF patch must be conditional on `__APPLE__`
- Homebrew formula sha256 must match published release tarball
- Release workflow must produce Homebrew bottle for arm64_sonoma
- DMG build script must be exercised in CI
- `children_dead` counter in usignals.c must be `volatile sig_atomic_t`
- Empty child environment after execve must be verified compatible with sandbox SPI
- `atexit()` handler registered before `chld_fork()` for child cleanup
- `setgroups(1, &mygid)` must be called before UID/GID drop in `drop_privs()`

### UX Design Requirements

N/A — CLI tool, no UI components.

### FR Coverage Map

| FR | Epic | Story |
|----|------|-------|
| FR3 | E1 | 1.1 |
| FR4 | E1 | 1.1 |
| FR5 | E1 | 1.1 |
| FR6 | E2 | 2.1 |
| FR7 | E2 | 2.1 |
| FR8 | E2 | 2.2 |
| FR9 | E2 | 2.3 |
| FR1 | E3 | 3.1 |
| FR2 | E3 | 3.1 |
| FR14 | E4 | 4.2 |
| FR15 | E4 | 4.3 |
| FR16 | E4 | 4.1 |
| FR11 | E5 | 5.1 |
| FR12 | E5 | 5.1 |
| FR13 | E5 | 5.3 |
| FR10 | E6 | 6.1 |

## Epic List

1. **Epic 1: Reliable Scanning Under Concurrent BPF Access** — Fix libdnet /dev/bpf0 hardcoding
2. **Epic 2: No More Stale Processes** — Prevent orphaned child processes
3. **Epic 3: Process Sandboxing (Defense in Depth)** — Replace non-functional sandbox_init() with libsandbox SPI
4. **Epic 4: Clear Permission Guidance** — Document and improve permission handling
5. **Epic 5: Validated Distribution** — Test Homebrew and DMG end-to-end
6. **Epic 6: Complete Scan Coverage & Security Audit** — Validate ICMP mode, audit macOS code

---

## Epic 1: Reliable Scanning Under Concurrent BPF Access

Eliminate the libdnet `/dev/bpf0` hardcoding so that `eth_open()` iterates BPF devices like libpcap does. Users can run fantaip + unicornscan simultaneously, run ARP scans reliably, and never encounter "Resource busy" errors.

### Story 1.1: Patch Bundled libdnet BPF Device Iteration

As a penetration tester running multiple tools,
I want `eth_open()` to find any available BPF device,
So that I never get "Resource busy" errors when `/dev/bpf0` is held by another process.

**Implementation Guidance:**
- Read `libs/` bundled libdnet source fully — understand how `eth-bsd.c` works before touching it
- Study how libpcap iterates BPF devices in `pcap-bpf.c` for reference
- The patch must be conditional on `__APPLE__` or BSD — Linux uses `PF_PACKET`, not BPF
- Follow Jack Louis style: `/* */` comments, `return -1` on error, no `//` comments
- Reference: `docs/jack-louis-coding-style-guide.md`
- Chesterton's fence: understand why libdnet hardcoded `/dev/bpf0` (likely a simplification from 2004 when BSD systems had fewer BPF consumers)

**Mantra:** DO NOT BE LAZY. Read the entire `eth-bsd.c` before patching. Verify the patch compiles on macOS AND that Linux builds skip it entirely. Test with bpf0 held by another process. Measure 3x, cut once.

**Acceptance Criteria:**

**Given** `/dev/bpf0` is held by another process (e.g., Wireshark, pcap, unilisten)
**When** unicornscan's sender calls `eth_open()` for ARP mode (`send_packet.c:1270`)
**Then** libdnet iterates `/dev/bpf1` through `/dev/bpf255` until a free device is found
**And** the BPF fd is bound to the correct interface via `BIOCSETIF`
**And** `BIOCSHDRCMPLT` is set for header-complete mode

**Given** all 256 BPF devices are busy
**When** `eth_open()` exhausts the iteration
**Then** it returns NULL (same as current behavior)
**And** the caller's error handling is triggered

**Given** unicornscan is built on Linux
**When** the bundled libdnet is compiled
**Then** the BPF iteration patch is not applied (guarded by `uname -s` check in `libs/Makefile.in`)
**And** Linux behavior is completely unchanged

**Key files:** `libs/` (bundled libdnet `eth-bsd.c`), `libs/Makefile.in`

### Story 1.2: BPF Device Exhaustion Diagnostics

As a user who encounters "eth_open fails",
I want a clear error message explaining what happened and how to fix it,
So that I can resolve the issue without searching online.

**Implementation Guidance:**
- Read `send_packet.c:1258-1282` (`open_link()`) fully before modifying
- Read how `fantaip.c` handles the same error for consistency
- Use `ERR()` macro (not fprintf), per Jack Louis style guide Section 3
- The diagnostic must be macOS-only (`#ifdef __APPLE__`) — Linux messages unchanged
- Chesterton's fence: the current `terminate()` call is intentional — a link-layer failure is fatal for ARP mode. Keep it fatal, just make the message better.

**Mantra:** No stubs. The error message must be immediately actionable on first read.

**Acceptance Criteria:**

**Given** `eth_open()` returns NULL on macOS
**When** the error is logged in `send_packet.c`
**Then** the message includes "all /dev/bpf* devices may be busy"
**And** suggests `lsof /dev/bpf*` to identify holders
**And** the process still calls `terminate()` (fatal for link-layer mode)

**Given** `eth_open()` returns NULL on Linux
**When** the error is logged
**Then** the existing error message is unchanged
**And** no macOS-specific text appears

**Key files:** `src/scan_progs/send_packet.c:1268-1274`

---

## Epic 2: No More Stale Processes

Ensure unisend and unilisten never orphan under any exit condition including crash, SIGKILL, and abnormal termination. The confirmed root cause (XPOLL_DEAD without XPOLL_READABLE causing infinite loop in master.c:338-344) must be fixed.

### Story 2.1: Track Child PIDs and Implement chld_killall()

As a user,
I want unicornscan to always clean up its child processes,
So that stale unisend/unilisten never persist after a scan ends or crashes.

**Implementation Guidance:**
- Read `src/chld.c` fully — understand the fork/exec lifecycle, `child_forked` counter, and how `chld_reapall()` works today
- Read `src/chld.h` for the public API surface
- Read `src/main.c` to see where `chld_reapall()` is called (line 748, after `run_scan()`)
- Read `src/usignals.c:81-91` to understand the SIGCHLD handler interaction
- Chesterton's fence: `child_forked` is an int, not a PID array, because Jack's original design relied on IPC-based lifecycle (not PID tracking). The IPC approach breaks when children die without sending MSG_WORKDONE — that's the bug we're fixing.
- Use `MAX_CHILDREN` (already defined as 16 in `chld.c:36`) for array size
- Follow Jack Louis style: static module-level array, `/* */` comments, explicit `return;` on void functions

**Mantra:** Read `chld.c`, `usignals.c`, `main.c`, and `master.c` before writing a single line. Understand ALL the ways children are created, tracked, and reaped. Measure 3x, cut once.

**Acceptance Criteria:**

**Given** `chld_fork()` successfully forks a child (sender or listener)
**When** the child PID is returned by `fork()`
**Then** it is stored in a static `child_pids[MAX_CHILDREN]` array at index `child_forked`
**And** the existing `child_forked++` counter still increments

**Given** the master process exits (normal, error, or SIGTERM)
**When** cleanup runs
**Then** `chld_killall()` sends `SIGTERM` to every tracked PID where `child_pids[j] > 0`
**And** waits 500ms via `usleep(500000)`
**And** sends `SIGKILL` to any child still alive (checked via `kill(pid, 0) == 0`)
**And** `kill()` errors with `ESRCH` are silently ignored (child already dead)

**Key files:** `src/chld.c`, `src/chld.h`

### Story 2.2: Dead Socket Detection in Post-Scan Loop

As a developer,
I want the post-scan listener stats loop to detect dead sockets,
So that the master never hangs waiting for MSG_WORKDONE from a dead listener.

**Implementation Guidance:**
- Read `src/scan_progs/master.c:330-365` — the post-scan sequence
- Read `src/scan_progs/master.c:366-498` — `master_read_drones()` which only acts on `XPOLL_READABLE` (line 377), ignoring `XPOLL_DEAD`
- Read `src/unilib/drone.c:239-272` — `drone_poll()` which correctly reports `XPOLL_DEAD` from kqueue's `EV_EOF`
- Chesterton's fence: `master_read_drones()` only checks `XPOLL_READABLE` because the original design assumed children always send MSG_WORKDONE before dying. On macOS kqueue, `EV_EOF` with `data=0` means dead-with-no-data — a case that didn't exist in the original Linux codebase.
- This is the **confirmed root cause** of the 48-minute stale process observed during v0.5.0 testing.

**Mantra:** This is the single most impactful reliability fix in v0.5.1. Get it right. Test every failure mode. No shortcuts.

**Acceptance Criteria:**

**Given** a listener dies without sending MSG_WORKDONE
**When** `drone_poll()` returns with `XPOLL_DEAD` set but `XPOLL_READABLE` not set
**Then** `master_read_drones()` detects the `XPOLL_DEAD`-only state
**And** calls `drone_updatestate(c, DRONE_STATUS_DEAD)` on the dead drone
**And** `s->listeners` is decremented
**And** the do-while loop at line 338-344 exits when `s->listeners == listener_stats`

**Given** the post-scan loop has a hard timeout
**When** `recv_timeout + 5` seconds elapse without the loop exiting
**Then** an `ERR()` message is logged
**And** the loop breaks (last-resort guard)

**Key files:** `src/scan_progs/master.c:338-344`, `src/scan_progs/master.c:366-498`

### Story 2.3: Harden SIGCHLD Handler with waitpid Loop

As a developer,
I want all children reaped atomically even when multiple die simultaneously,
So that zombie processes are impossible.

**Implementation Guidance:**
- Read `src/usignals.c:81-91` fully — the `signals_chlddead()` handler
- Read `src/usignals.c:29` — `children_dead` is `static int`, not `volatile sig_atomic_t`
- Chesterton's fence: `wait(&status)` was used because the original code only ever had 2 children. On macOS, signal coalescing is more aggressive.
- `wait()` and `waitpid()` are both async-signal-safe per POSIX. `DBG()` is NOT — do NOT add debug output inside the signal handler.

**Mantra:** Signal handlers are the most dangerous code in any C program. Only async-signal-safe functions allowed.

**Acceptance Criteria:**

**Given** the SIGCHLD handler
**When** two children die simultaneously
**Then** `waitpid(-1, &status, WNOHANG)` loop reaps both
**And** `children_dead` is `volatile sig_atomic_t`
**And** no non-async-signal-safe functions in the handler

**Key files:** `src/usignals.c:29`, `src/usignals.c:81-91`

### Story 2.4: Register atexit() Handler for Child Cleanup

As a developer,
I want child cleanup even when main() exits normally without going through scan lifecycle,
So that edge-case exits don't leak processes.

**Implementation Guidance:**
- Read `src/main.c` — understand all exit paths
- Read `src/unilib/terminate.c` — `exit()` runs atexit; `_exit()` does not
- Chesterton's fence: no atexit handler exists because the original design relied on explicit `chld_reapall()` after `run_scan()`. But if `run_scan()` never returns, children leak.

**Mantra:** Understand every exit path in main.c before adding the handler.

**Acceptance Criteria:**

**Given** `atexit(chld_cleanup)` registered before `chld_fork()`
**When** `main()` exits via `exit()` (including `uexit()` for non-forked main)
**Then** `chld_killall()` runs
**And** the handler is idempotent

**Key files:** `src/main.c`, `src/chld.c`

---

## Epic 3: Process Sandboxing (Defense in Depth)

Replace the non-functional `sandbox_init()` with working process isolation using `sandbox_compile_file()` + `sandbox_apply()` SPI from `libsandbox.1.dylib`, loaded via `dlopen`/`dlsym`. Confirmed working on macOS 26.3.1. Falls back gracefully if unavailable.

### Story 3.1: Implement apply_sandbox() via libsandbox SPI

As a security engineer,
I want the listener process sandboxed on macOS,
So that a crafted packet exploiting a parser bug cannot access the full filesystem or spawn processes.

**Implementation Guidance:**
- Read `src/unilib/arch.c` fully — understand `apply_sandbox()` (lines 197-215, current stub), `drop_privs()` (lines 218-355), and how they interact
- Read `macos/unicornscan-listener.sb` — the 188-line deny-default Seatbelt profile ready to use
- Read `configure.ac` — the `HAVE_SANDBOX_INIT` detection and `SANDBOX_PROFILE` define
- The SPI was **tested and confirmed working on macOS 26.3.1** during CFA research
- Use `dlopen("/usr/lib/libsandbox.1.dylib", RTLD_LAZY | RTLD_LOCAL)` + `dlsym()` for each symbol
- The code sketch in PRD Section 3.2.1 is the reference implementation
- Chesterton's fence: `sandbox_init()` was the original intent. It failed because `SANDBOX_NAMED` only accepts Apple's built-in profile constants. The SPI bypasses this by going directly to the underlying implementation.

**Mantra:** This code touches security boundaries. Test sandbox enforcement by verifying a sandboxed listener CANNOT write to `/tmp/test_sandbox_escape`. Test graceful degradation with libsandbox removed. No shortcuts.

**Acceptance Criteria:**

**Given** unicornscan is running on macOS with the `.sb` profile installed
**When** the listener calls `apply_sandbox()` during `drop_privs()`
**Then** `dlopen` loads `libsandbox.1.dylib`, `dlsym` resolves all SPI symbols
**And** `sandbox_compile_file(SANDBOX_PROFILE, params, &error)` compiles the profile
**And** `sandbox_apply(profile)` enforces the deny-default policy
**And** scan results are identical with and without sandbox

**Given** `libsandbox.1.dylib` is missing or SPI symbols not found
**When** `dlopen` or `dlsym` fails
**Then** VRB(1) logs the reason and returns 0 (non-fatal)
**And** the scan proceeds without sandbox

**Given** unicornscan is built on Linux
**When** compiled
**Then** `#ifdef HAVE_SANDBOX_H` excludes all macOS sandbox code

**Key files:** `src/unilib/arch.c:197-215`, `configure.ac`, `macos/unicornscan-listener.sb`

### Story 3.2: Create Sender Sandbox Profile

As a security engineer,
I want the sender process (unisend) also sandboxed,
So that both child processes have defense-in-depth isolation.

**Implementation Guidance:**
- Read `macos/unicornscan-listener.sb` to understand the profile structure
- Read `src/scan_progs/send_packet.c` to understand what the sender needs: BPF write, IPC socket, sysctl read, module loading
- Chesterton's fence: no sender profile exists because the original plan only sandboxed the listener (which processes untrusted network data). Sandboxing the sender is defense-in-depth.

**Mantra:** Write the profile by reading every syscall the sender makes, not by guessing. Use `sandbox-exec -f profile.sb -- /path/to/unisend` to test interactively.

**Acceptance Criteria:**

**Given** a new `macos/unicornscan-sender.sb` profile
**When** the sender process starts with sandbox applied
**Then** BPF device write is allowed, IPC sockets allowed, sysctl read allowed
**And** file creation denied, process spawning denied, fork denied
**And** TCP SYN, UDP, and ARP scans produce correct results

**Key files:** `macos/unicornscan-sender.sb` (new), `src/unilib/arch.c`

### Story 3.3: Validate SPI Across macOS Versions

As a developer,
I want confirmation the libsandbox SPI works on macOS 13-26,
So that we don't ship sandbox support that breaks on older systems.

**Implementation Guidance:**
- This is validation/research, not code
- Test on CI runners or VMs for each macOS version
- The SPI symbols are in SDK TBD stubs from macOS 10.6 through 26.2 — but runtime behavior must be verified

**Mantra:** Do not assume SDK presence equals runtime availability. Test on real systems.

**Acceptance Criteria:**

**Given** the SPI-based `apply_sandbox()` implementation
**When** tested on macOS 13, 14, 15, and 26
**Then** `sandbox_compile_file` + `sandbox_apply` succeeds on all versions
**And** fallback works when symbols are artificially removed

---

## Epic 4: Clear Permission Guidance

Document which operations require root/sudo, which require ChmodBPF, and improve permission error messages so users never see cryptic failures.

### Story 4.1: Create Privilege Model Reference Documentation

As a macOS user,
I want to know exactly which scan modes need sudo,
So that I can configure my system correctly once and not guess.

**Implementation Guidance:**
- Read `src/scan_progs/send_packet.c:1233-1282` — `open_link()` to understand SOCK_IP vs SOCK_LL paths
- Read CFA Agent #5 research — confirmed `ip_open()` → `SOCK_RAW` → root required, `eth_open()` → BPF → ChmodBPF sufficient
- Chesterton's fence: no privilege doc exists because the Linux version assumed root. The macOS port created a new privilege tier that needs documentation.

**Mantra:** Verify every cell in the privilege matrix by actually testing it. Don't copy from the PRD without confirming.

**Acceptance Criteria:**

**Given** a new `docs/PRIVILEGES-macos.md`
**When** a user reads it
**Then** every scan mode has a clear row: mode flag, sender path, privilege requirement
**And** ChmodBPF setup instructions included with exact commands
**And** troubleshooting section covers "ip_open fails", "eth_open fails", "pcap permission denied"

**Key files:** `docs/PRIVILEGES-macos.md` (new)

### Story 4.2: Improve Permission Error Messages

As a user who gets "dnet ip_open fails",
I want a clear message telling me what to do,
So that I can fix the problem in one step.

**Implementation Guidance:**
- Read `src/scan_progs/send_packet.c:1258-1282` — both `SOCK_IP` and `SOCK_LL` error paths
- Use `ERR()` macro per Jack Louis style guide Section 3
- macOS-specific messages must be `#ifdef __APPLE__` guarded
- Chesterton's fence: the current `terminate()` is intentionally terse — Jack's style was minimal. We add platform-specific context without changing the fatal behavior.

**Mantra:** The error message must be actionable on first read. A user should be able to copy-paste the fix command.

**Acceptance Criteria:**

**Given** `ip_open()` returns NULL on macOS
**When** the error is logged
**Then** `ERR()` prints "raw socket access requires root on macOS" and suggests `sudo`
**And** `terminate()` is still called (fatal)

**Given** either failure occurs on Linux
**When** the error is logged
**Then** existing error messages unchanged

**Key files:** `src/scan_progs/send_packet.c:1258-1282`

### Story 4.3: Runtime BPF Access Check at Startup

As a user,
I want permission problems detected before children are forked,
So that I get a clear error immediately instead of a delayed child crash.

**Implementation Guidance:**
- Read `src/main.c` — understand where `chld_fork()` is called (line 572)
- Try `open("/dev/bpf0", O_RDWR)` — EACCES means no permission, EBUSY means busy (OK)
- Skip check when `getuid() == 0`
- Guard with `#ifdef __APPLE__`
- Chesterton's fence: no startup check exists because the original Linux version ran as root.

**Mantra:** Understand every exit path in main.c before adding the check.

**Acceptance Criteria:**

**Given** unicornscan starts on macOS as non-root without ChmodBPF group
**When** the BPF check runs before `chld_fork()`
**Then** EACCES produces actionable ChmodBPF setup instructions and exits

**Given** bpf0 is EBUSY (held by another process)
**When** the check runs
**Then** EBUSY is treated as success (we'll get bpf1+)

**Given** running as root
**When** startup runs
**Then** the BPF check is skipped entirely

**Key files:** `src/main.c`

---

## Epic 5: Validated Distribution

Validate that Homebrew and DMG distribution channels produce working installations through end-to-end testing.

### Story 5.1: Complete Homebrew Formula

As a macOS user,
I want `brew install unicornscan` to just work,
So that I get a properly configured scanner with all dependencies.

**Implementation Guidance:**
- Read `macos/unicornscan.rb` (243 lines) fully
- CFA Agent #6 found: sha256 PLACEHOLDER, missing flex/bison deps, no PKG_CONFIG_PATH for keg-only libpcap
- Chesterton's fence: the formula uses DESTDIR staging because Homebrew's standard install relies on `--prefix` being the Cellar path. This is valid Homebrew practice.

**Mantra:** Test on a CLEAN system. Not your dev machine. A fresh macOS VM or `brew install --build-from-source` after `brew uninstall` of any prior version.

**Acceptance Criteria:**

**Given** the formula with correct sha256
**When** `brew install robertelee78/unicornscan/unicornscan` runs
**Then** all dependencies installed, build completes, all binaries present
**And** `brew test unicornscan` passes
**And** `brew audit --strict unicornscan` produces zero errors
**And** `brew uninstall unicornscan` cleanly removes all files

**Key files:** `macos/unicornscan.rb`

### Story 5.2: Homebrew Bottle Generation in CI

As a user,
I want pre-compiled bottles so install takes seconds not minutes.

**Implementation Guidance:**
- Read `.github/workflows/release.yml` — the `build-macos` job
- Bottles are platform-specific: `arm64_sonoma` for Apple Silicon

**Acceptance Criteria:**

**Given** a new version tag is pushed
**When** the `build-macos` CI job runs
**Then** it produces a `.bottle.tar.gz` artifact uploaded to GitHub Release
**And** formula includes `bottle do` block with correct sha256

**Key files:** `.github/workflows/release.yml`, `macos/unicornscan.rb`

### Story 5.3: DMG Installer Validation

As a user who doesn't use Homebrew,
I want a working DMG installer.

**Implementation Guidance:**
- Read `macos/dmg/build-dmg.sh` (594 lines) fully
- CFA Agent #6 found: invalid background.png, missing unicornscan-alicorn, deprecated `launchctl load`
- Chesterton's fence: the DMG script was written during v0.5.0 but never tested end-to-end. Treat as unvalidated.

**Mantra:** Build the DMG. Mount it. Install on a clean system. Run a scan. Uninstall. Verify zero files remain.

**Acceptance Criteria:**

**Given** `build-dmg.sh` produces a DMG
**When** installed on a clean macOS
**Then** all binaries present and linked correctly (`otool -L` shows no /opt/homebrew paths)
**And** modules load, config files installed, ChmodBPF LaunchDaemon loadable
**And** uninstall removes all files

**Key files:** `macos/dmg/build-dmg.sh`, `macos/dmg/postinstall`

### Story 5.4: Validate Build-from-Source Path

As a developer contributing to unicornscan,
I want the source build to work on a clean macOS.

**Implementation Guidance:**
- Test the documented build steps on a clean system with only Xcode CLT + Homebrew

**Acceptance Criteria:**

**Given** a clean macOS
**When** `autoreconf -fiv && ./configure && make && sudo make install` runs
**Then** build succeeds with zero errors, scanner runs, modules load

**Key files:** `docs/INSTALL-source.md`

---

## Epic 6: Complete Scan Coverage & Security Audit

Validate all scan modes on macOS (especially ICMP) and perform a focused security audit of macOS-specific code.

### Story 6.1: ICMP Scan Mode Status Assessment

As a developer,
I want to determine whether ICMP scanning works, is partial, or is a dead stub,
So that we can validate it or document it as unsupported.

**Implementation Guidance:**
- Read `src/scan_progs/scanopts.c:474-563` — does `scan_parsemode()` have an `'I'` branch?
- Read `src/scan_progs/send_packet.c:527-562` — does the workunit switch handle `ICMP_SEND_MAGIC`?
- CFA Agent #7 found: MODE_ICMPSCAN defined (value 8), magic numbers exist, but `scan_parsemode()` has NO `'I'` branch — dead stub
- Chesterton's fence: ICMP mode was likely planned but never finished in the original 0.4.7

**Mantra:** Do NOT implement ICMP mode in this story. This is ASSESSMENT ONLY. Determine exact state, document, recommend.

**Acceptance Criteria:**

**Given** the MODE_ICMPSCAN code paths are audited
**When** the assessment is complete
**Then** a clear determination: working / partial / dead stub
**And** if dead stub: recommendation to implement or remove scaffolding
**And** GETTING_STARTED.md updated to reflect actual ICMP status

**Key files:** `src/scan_progs/scanopts.c`, `src/scan_progs/send_packet.c`, `src/scan_progs/workunits.c`

### Story 6.2: Security Audit of macOS Code Paths

As a security engineer,
I want all macOS-specific code reviewed for vulnerabilities.

**Implementation Guidance:**
- Audit all code behind `#ifdef __APPLE__`, `HAVE_SANDBOX_H`, `AF_LINK`, `HAVE_KQUEUE`
- CFA Agent #7 found 10 findings, 3 medium: `children_dead` not sig_atomic_t, `setgroups()` missing, kqueue fd CLOEXEC non-fatal
- Follow Jack Louis style for all fixes
- Chesterton's fence for each finding: understand why the code was written that way

**Mantra:** Security audit means reading every line, not skimming. Every `#ifdef __APPLE__` block. No assumptions.

**Acceptance Criteria:**

**Given** all macOS `#ifdef` paths reviewed
**When** audit complete
**Then** `children_dead` is `volatile sig_atomic_t`
**And** `setgroups(1, &mygid)` called before UID/GID drop in `drop_privs()`
**And** no unvalidated buffer operations
**And** signal handlers only use async-signal-safe functions
**And** each finding documented: severity, location, fix, rationale

**Key files:** `src/unilib/arch.c`, `src/unilib/xpoll.c`, `src/unilib/intf.c`, `src/unilib/route.c`, `src/usignals.c`

### Story 6.3: Validate pcap_setdirection Behavior

As a developer,
I want to confirm scan accuracy without direction filtering.

**Implementation Guidance:**
- Read `src/scan_progs/recv_packet.c:284-289` — the `pcap_setdirection(PCAP_D_IN)` non-fatal fallback
- Read BPF filter strings (TCP_EFILTER, UDP_EFILTER) — may already exclude own outbound
- Chesterton's fence: direction filtering was added as defense against counting outbound packets as results

**Acceptance Criteria:**

**Given** `pcap_setdirection(PCAP_D_IN)` succeeds
**When** TCP SYN scan runs against known target
**Then** results match expected

**Given** `pcap_setdirection` fails (non-fatal)
**When** same scan runs
**Then** results identical — no duplicates from outbound reflection

**Key files:** `src/scan_progs/recv_packet.c:284-289`
