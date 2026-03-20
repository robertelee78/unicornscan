# Story 2.3: Harden SIGCHLD Handler with waitpid Loop

Status: ready-for-dev

## Story

As a developer,
I want all children reaped atomically even when multiple die simultaneously,
so that zombie processes are impossible.

## Acceptance Criteria

1. **Given** the SIGCHLD handler **When** two children die simultaneously **Then** `waitpid(-1, &status, WNOHANG)` loop reaps both **And** `children_dead` is `volatile sig_atomic_t` **And** no non-async-signal-safe functions in the handler

## Tasks / Subtasks

- [ ] Read existing SIGCHLD handler and related declarations (AC: #1)
  - [ ] Read `src/usignals.c:81-91` — `signals_chlddead()` handler in full
  - [ ] Read `src/usignals.c:29` — `children_dead` declaration
  - [ ] Confirm `DBG()` is not async-signal-safe (must not be added or left in the handler)
- [ ] Change `children_dead` declaration to `volatile sig_atomic_t` (AC: #1)
  - [ ] Update declaration at `src/usignals.c:29`
  - [ ] Verify no other translation unit redeclares or takes the address of `children_dead` incompatibly
- [ ] Replace single `wait()` call with `waitpid(-1, &status, WNOHANG)` loop (AC: #1)
  - [ ] Loop while `waitpid` returns > 0, incrementing `children_dead` each iteration
  - [ ] Stop loop when `waitpid` returns 0 or -1
  - [ ] Remove original `wait(&status)` call
- [ ] Audit the full handler for any non-async-signal-safe calls (AC: #1)
  - [ ] Confirm no `DBG()`, `printf`, `malloc`, or similar calls remain
- [ ] Build and verify no regressions on Linux or macOS (AC: #1)

## Dev Notes

### Mandatory Standards

All code MUST follow `docs/jack-louis-coding-style-guide.md`.

> **Mantra:** DO NOT BE LAZY. We have plenty of time to do it right. No shortcuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Measure 3x, cut once. No fallback. No stub code. Just pure excellence.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history.

### Implementation Guidance

- Read `src/usignals.c:81-91` fully — the `signals_chlddead()` handler
- Read `src/usignals.c:29` — `children_dead` is `static int`, not `volatile sig_atomic_t`
- Chesterton's fence: `wait(&status)` was used because the original code only ever had 2 children. On macOS, signal coalescing is more aggressive.
- `wait()` and `waitpid()` are both async-signal-safe per POSIX. `DBG()` is NOT — do NOT add debug output inside the signal handler.

**Mantra:** Signal handlers are the most dangerous code in any C program. Only async-signal-safe functions allowed.

### Project Structure Notes

- `src/usignals.c:29` — `children_dead` declaration that must be changed to `volatile sig_atomic_t`
- `src/usignals.c:81-91` — the `signals_chlddead()` SIGCHLD handler to be hardened with a `waitpid` loop

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
