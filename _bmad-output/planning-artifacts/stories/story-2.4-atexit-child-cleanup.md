# Story 2.4: Register atexit() Handler for Child Cleanup

Status: ready-for-dev

## Story

As a developer,
I want child cleanup even when main() exits normally without going through scan lifecycle,
so that edge-case exits don't leak processes.

## Acceptance Criteria

1. **Given** `atexit(chld_cleanup)` registered before `chld_fork()` **When** `main()` exits via `exit()` (including `uexit()` for non-forked main) **Then** `chld_killall()` runs **And** the handler is idempotent

## Tasks / Subtasks

- [ ] Read all exit paths in `main.c` and related files (AC: #1)
  - [ ] Read `src/main.c` in full — identify every call to `exit()`, `_exit()`, `uexit()`, and `return` from main
  - [ ] Read `src/unilib/terminate.c` — confirm `exit()` runs atexit handlers while `_exit()` does not
  - [ ] Identify the exact line where `chld_fork()` is first called (line 572)
- [ ] Implement `chld_cleanup()` wrapper in `src/chld.c` (AC: #1)
  - [ ] Declare a static guard flag (`static int cleanup_ran = 0`) for idempotency
  - [ ] On first call: set flag, call `chld_killall()`
  - [ ] On subsequent calls: return immediately without action
  - [ ] Follow Jack Louis style: `/* */` comments, explicit `return;`
- [ ] Register `atexit(chld_cleanup)` in `src/main.c` (AC: #1)
  - [ ] Insert the `atexit()` call before the first `chld_fork()` call at line 572
  - [ ] Confirm placement is early enough to cover all exit paths identified above
- [ ] Verify handler does not fire via `_exit()` paths (AC: #1)
  - [ ] Confirm any path that calls `_exit()` directly is intentional and does not need child cleanup
- [ ] Build and confirm no regressions (AC: #1)

## Dev Notes

### Mandatory Standards

All code MUST follow `docs/jack-louis-coding-style-guide.md`.

> **Mantra:** DO NOT BE LAZY. We have plenty of time to do it right. No shortcuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Measure 3x, cut once. No fallback. No stub code. Just pure excellence.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history.

### Implementation Guidance

- Read `src/main.c` — understand all exit paths
- Read `src/unilib/terminate.c` — `exit()` runs atexit; `_exit()` does not
- Chesterton's fence: no atexit handler exists because the original design relied on explicit `chld_reapall()` after `run_scan()`. But if `run_scan()` never returns, children leak.

**Mantra:** Understand every exit path in main.c before adding the handler.

### Project Structure Notes

- `src/main.c` — all exit paths must be understood; `atexit()` registration goes here before `chld_fork()` is called
- `src/chld.c` — `chld_cleanup` wrapper function (idempotent, calls `chld_killall()`) goes here

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
