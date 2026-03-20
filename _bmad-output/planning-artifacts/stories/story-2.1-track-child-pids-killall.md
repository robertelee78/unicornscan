# Story 2.1: Track Child PIDs and Implement chld_killall()

Status: ready-for-dev

## Story

As a user,
I want unicornscan to always clean up its child processes,
so that stale unisend/unilisten never persist after a scan ends or crashes.

## Acceptance Criteria

1. **Given** `chld_fork()` successfully forks a child (sender or listener) **When** the child PID is returned by `fork()` **Then** it is stored in a static `child_pids[MAX_CHILDREN]` array at index `child_forked` **And** the existing `child_forked++` counter still increments

2. **Given** the master process exits (normal, error, or SIGTERM) **When** cleanup runs **Then** `chld_killall()` sends `SIGTERM` to every tracked PID where `child_pids[j] > 0` **And** waits 500ms via `usleep(500000)` **And** sends `SIGKILL` to any child still alive (checked via `kill(pid, 0) == 0`) **And** `kill()` errors with `ESRCH` are silently ignored (child already dead)

## Tasks / Subtasks

- [ ] Read all relevant source files before writing a single line (AC: #1, #2)
  - [ ] Read `src/chld.c` in full — fork/exec lifecycle, `child_forked` counter, `chld_reapall()`
  - [ ] Read `src/chld.h` — public API surface
  - [ ] Read `src/main.c` line 748 — where `chld_reapall()` is called after `run_scan()`
  - [ ] Read `src/usignals.c:81-91` — SIGCHLD handler interaction
  - [ ] Read `src/scan_progs/master.c` — all ways children are created and tracked
- [ ] Add `child_pids[MAX_CHILDREN]` static array to `chld.c` and populate in `chld_fork()` (AC: #1)
  - [ ] Declare `static pid_t child_pids[MAX_CHILDREN]` at module level (initialised to zero)
  - [ ] In `chld_fork()`, after `fork()` returns the child PID, store it at `child_pids[child_forked]`
  - [ ] Confirm `child_forked++` still follows on the same path
- [ ] Implement `chld_killall()` in `chld.c` (AC: #2)
  - [ ] Iterate `child_pids[]`; skip entries where value is 0
  - [ ] Send `SIGTERM` to each live PID
  - [ ] Call `usleep(500000)` once after all SIGTERMs
  - [ ] Loop again; send `SIGKILL` to any PID where `kill(pid, 0) == 0`
  - [ ] Silently ignore `ESRCH` errno from `kill()`
  - [ ] Follow Jack Louis style: `/* */` comments, `return;` on void
- [ ] Declare `chld_killall()` in `src/chld.h` (AC: #2)
- [ ] Verify existing tests and build pass after changes (AC: #1, #2)

## Dev Notes

### Mandatory Standards

All code MUST follow `docs/jack-louis-coding-style-guide.md`.

> **Mantra:** DO NOT BE LAZY. We have plenty of time to do it right. No shortcuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Measure 3x, cut once. No fallback. No stub code. Just pure excellence.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history.

### Implementation Guidance

- Read `src/chld.c` fully — understand the fork/exec lifecycle, `child_forked` counter, and how `chld_reapall()` works today
- Read `src/chld.h` for the public API surface
- Read `src/main.c` to see where `chld_reapall()` is called (line 748, after `run_scan()`)
- Read `src/usignals.c:81-91` to understand the SIGCHLD handler interaction
- Chesterton's fence: `child_forked` is an int, not a PID array, because Jack's original design relied on IPC-based lifecycle (not PID tracking). The IPC approach breaks when children die without sending MSG_WORKDONE — that's the bug we're fixing.
- Use `MAX_CHILDREN` (already defined as 16 in `chld.c:36`) for array size
- Follow Jack Louis style: static module-level array, `/* */` comments, explicit `return;` on void functions

**Mantra:** Read `chld.c`, `usignals.c`, `main.c`, and `master.c` before writing a single line. Understand ALL the ways children are created, tracked, and reaped. Measure 3x, cut once.

### Project Structure Notes

- `src/chld.c` — contains the fork/exec lifecycle, `child_forked` counter, and `chld_reapall()`; the `child_pids[]` array and `chld_killall()` go here
- `src/chld.h` — public API surface; `chld_killall()` declaration goes here

### References

- PRD: `docs/PRD-v051-macos-hardening.md`
- Style Guide: `docs/jack-louis-coding-style-guide.md`
- Epics: `_bmad-output/planning-artifacts/epics.md`

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### Change Log

### File List
