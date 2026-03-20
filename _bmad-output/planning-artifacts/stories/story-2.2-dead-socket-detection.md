# Story 2.2: Dead Socket Detection in Post-Scan Loop

Status: ready-for-dev

## Story

As a developer,
I want the post-scan listener stats loop to detect dead sockets,
so that the master never hangs waiting for MSG_WORKDONE from a dead listener.

## Acceptance Criteria

1. **Given** a listener dies without sending MSG_WORKDONE **When** `drone_poll()` returns with `XPOLL_DEAD` set but `XPOLL_READABLE` not set **Then** `master_read_drones()` detects the `XPOLL_DEAD`-only state **And** calls `drone_updatestate(c, DRONE_STATUS_DEAD)` on the dead drone **And** `s->listeners` is decremented **And** the do-while loop at line 338-344 exits when `s->listeners == listener_stats`

2. **Given** the post-scan loop has a hard timeout **When** `recv_timeout + 5` seconds elapse without the loop exiting **Then** an `ERR()` message is logged **And** the loop breaks (last-resort guard)

## Tasks / Subtasks

- [ ] Read all relevant source before any modification (AC: #1, #2)
  - [ ] Read `src/scan_progs/master.c:330-365` — the post-scan sequence
  - [ ] Read `src/scan_progs/master.c:366-498` — `master_read_drones()` and its `XPOLL_READABLE`-only check at line 377
  - [ ] Read `src/unilib/drone.c:239-272` — `drone_poll()` and how it reports `XPOLL_DEAD` from kqueue `EV_EOF`
  - [ ] Confirm this is the root cause of the 48-minute stale process observed in v0.5.0 testing
- [ ] Add `XPOLL_DEAD`-only branch in `master_read_drones()` (AC: #1)
  - [ ] After the `XPOLL_READABLE` block, add `else if (status & XPOLL_DEAD)` (or equivalent flag check)
  - [ ] Call `drone_updatestate(c, DRONE_STATUS_DEAD)` in that branch
  - [ ] Decrement `s->listeners`
  - [ ] Confirm the do-while exit condition at line 338-344 now fires correctly
- [ ] Add hard timeout guard to the post-scan do-while loop (AC: #2)
  - [ ] Record loop start time before the do-while
  - [ ] At the top or bottom of each iteration, check elapsed time against `recv_timeout + 5`
  - [ ] On timeout: call `ERR()` with a descriptive message and `break`
- [ ] Verify the fix eliminates the hang on macOS (AC: #1)
  - [ ] Reproduce the condition (kill listener without MSG_WORKDONE) and confirm master exits cleanly
- [ ] Verify Linux behavior is unchanged (AC: #1, #2)

## Dev Notes

### Mandatory Standards

All code MUST follow `docs/jack-louis-coding-style-guide.md`.

> **Mantra:** DO NOT BE LAZY. We have plenty of time to do it right. No shortcuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Measure 3x, cut once. No fallback. No stub code. Just pure excellence.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history.

### Implementation Guidance

- Read `src/scan_progs/master.c:330-365` — the post-scan sequence
- Read `src/scan_progs/master.c:366-498` — `master_read_drones()` which only acts on `XPOLL_READABLE` (line 377), ignoring `XPOLL_DEAD`
- Read `src/unilib/drone.c:239-272` — `drone_poll()` which correctly reports `XPOLL_DEAD` from kqueue's `EV_EOF`
- Chesterton's fence: `master_read_drones()` only checks `XPOLL_READABLE` because the original design assumed children always send MSG_WORKDONE before dying. On macOS kqueue, `EV_EOF` with `data=0` means dead-with-no-data — a case that didn't exist in the original Linux codebase.
- This is the **confirmed root cause** of the 48-minute stale process observed during v0.5.0 testing.

**Mantra:** This is the single most impactful reliability fix in v0.5.1. Get it right. Test every failure mode. No shortcuts.

### Project Structure Notes

- `src/scan_progs/master.c:338-344` — the do-while post-scan loop that hangs when `XPOLL_DEAD` is not handled
- `src/scan_progs/master.c:366-498` — `master_read_drones()` where the `XPOLL_DEAD` detection must be added

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
