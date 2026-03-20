# Story 6.2: Security Audit of macOS Code Paths

Status: ready-for-dev

## Story

As a security engineer,
I want all macOS-specific code reviewed for vulnerabilities,
so that the macOS port does not introduce security regressions compared to the Linux baseline.

## Acceptance Criteria

1. **Given** all macOS `#ifdef` paths reviewed **When** audit complete **Then** `children_dead` is `volatile sig_atomic_t` **And** `setgroups(1, &mygid)` called before UID/GID drop in `drop_privs()` **And** no unvalidated buffer operations **And** signal handlers only use async-signal-safe functions **And** each finding documented: severity, location, fix, rationale

## Tasks / Subtasks

- [ ] Enumerate every macOS-specific code block before auditing (AC: #1)
  - [ ] Search for all `#ifdef __APPLE__`, `#ifdef HAVE_SANDBOX_H`, `#ifdef AF_LINK`, and `#ifdef HAVE_KQUEUE` blocks across the entire codebase
  - [ ] Build a list of every affected file and line range
- [ ] Audit `src/unilib/arch.c` — `apply_sandbox()` and `drop_privs()` (AC: #1)
  - [ ] Read `drop_privs()` in full — confirm `setgroups(1, &mygid)` is called before `setuid()`/`setgid()`
  - [ ] If missing: add `setgroups(1, &mygid)` in the correct position
  - [ ] Verify no unvalidated buffer operations in `apply_sandbox()` or surrounding code
- [ ] Audit `src/usignals.c` — SIGCHLD handler and `children_dead` (AC: #1)
  - [ ] Confirm `children_dead` is `volatile sig_atomic_t` (see also Story 2.3)
  - [ ] Confirm all signal handlers use only async-signal-safe functions
  - [ ] Document any non-compliant function calls found
- [ ] Audit `src/unilib/xpoll.c` — kqueue fd CLOEXEC handling (AC: #1)
  - [ ] Confirm kqueue fd is created with `CLOEXEC` or has it set immediately after creation
  - [ ] Assess whether the non-fatal fallback for CLOEXEC is acceptable; document rationale
- [ ] Audit `src/unilib/intf.c` — `AF_LINK` code paths (AC: #1)
  - [ ] Read all `AF_LINK` branches for buffer safety (fixed-size arrays, `strncpy` vs `strlcpy`, etc.)
  - [ ] Document any unsafe buffer operation found
- [ ] Audit `src/unilib/route.c` — macOS routing code paths (AC: #1)
  - [ ] Read all macOS-specific routing code for similar issues
- [ ] Produce findings document (AC: #1)
  - [ ] For each finding: severity (low/medium/high), exact file:line, description of the problem, proposed fix, Chesterton's fence rationale
  - [ ] Apply all fixes that are within scope; flag any that require a separate story

## Dev Notes

### Mandatory Standards

All code MUST follow `docs/jack-louis-coding-style-guide.md`.

> **Mantra:** DO NOT BE LAZY. We have plenty of time to do it right. No shortcuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Measure 3x, cut once. No fallback. No stub code. Just pure excellence.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history.

### Implementation Guidance

- Audit all code behind `#ifdef __APPLE__`, `HAVE_SANDBOX_H`, `AF_LINK`, `HAVE_KQUEUE`
- CFA Agent #7 found 10 findings, 3 medium: `children_dead` not sig_atomic_t, `setgroups()` missing, kqueue fd CLOEXEC non-fatal
- Follow Jack Louis style for all fixes
- Chesterton's fence for each finding: understand why the code was written that way

**Mantra:** Security audit means reading every line, not skimming. Every `#ifdef __APPLE__` block. No assumptions.

### Project Structure Notes

- `src/unilib/arch.c` — contains `apply_sandbox()` and `drop_privs()`; `setgroups()` call must be added before UID/GID drop
- `src/unilib/xpoll.c` — kqueue fd CLOEXEC handling to be audited
- `src/unilib/intf.c` — `AF_LINK` code paths to be audited for buffer safety
- `src/unilib/route.c` — macOS routing code paths to be audited
- `src/usignals.c` — `children_dead` must be changed to `volatile sig_atomic_t`; all signal handlers must use only async-signal-safe functions

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
