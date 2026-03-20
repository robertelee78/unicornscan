# Story 3.1: Implement apply_sandbox() via libsandbox SPI

Status: ready-for-dev

## Story

As a security engineer,
I want the listener process sandboxed on macOS,
so that a crafted packet exploiting a parser bug cannot access the full filesystem or spawn processes.

## Acceptance Criteria

1. **Given** unicornscan is running on macOS with the `.sb` profile installed **When** the listener calls `apply_sandbox()` during `drop_privs()` **Then** `dlopen` loads `libsandbox.1.dylib`, `dlsym` resolves all SPI symbols **And** `sandbox_compile_file(SANDBOX_PROFILE, params, &error)` compiles the profile **And** `sandbox_apply(profile)` enforces the deny-default policy **And** scan results are identical with and without sandbox

2. **Given** `libsandbox.1.dylib` is missing or SPI symbols not found **When** `dlopen` or `dlsym` fails **Then** VRB(1) logs the reason and returns 0 (non-fatal) **And** the scan proceeds without sandbox

3. **Given** unicornscan is built on Linux **When** compiled **Then** `#ifdef HAVE_SANDBOX_H` excludes all macOS sandbox code

## Tasks / Subtasks

- [ ] Read all relevant source files before implementing (AC: #1, #2, #3)
  - [ ] Read `src/unilib/arch.c:197-215` — `apply_sandbox()` current stub
  - [ ] Read `src/unilib/arch.c:218-355` — `drop_privs()` and its interaction with `apply_sandbox()`
  - [ ] Read `macos/unicornscan-listener.sb` — the 188-line deny-default Seatbelt profile
  - [ ] Read `configure.ac` — `HAVE_SANDBOX_INIT` detection and `SANDBOX_PROFILE` path define
- [ ] Implement SPI-based `apply_sandbox()` in `src/unilib/arch.c` (AC: #1, #2)
  - [ ] Use `dlopen("/usr/lib/libsandbox.1.dylib", RTLD_LAZY | RTLD_LOCAL)`
  - [ ] Use `dlsym()` to resolve `sandbox_compile_file`, `sandbox_apply`, and any other required symbols
  - [ ] On `dlopen` or `dlsym` failure: call `VRB(1, ...)` and return 0 (non-fatal)
  - [ ] Call `sandbox_compile_file(SANDBOX_PROFILE, params, &error)` to compile the profile
  - [ ] Call `sandbox_apply(profile)` to enforce it
  - [ ] Follow the PRD Section 3.2.1 code sketch as the reference implementation
- [ ] Guard all new code with `#ifdef HAVE_SANDBOX_H` (AC: #3)
  - [ ] Confirm Linux build compiles without any sandbox symbols present
- [ ] Test sandbox enforcement (AC: #1)
  - [ ] Verify sandboxed listener CANNOT write to `/tmp/test_sandbox_escape`
  - [ ] Confirm scan results match a non-sandboxed run
- [ ] Test graceful degradation (AC: #2)
  - [ ] Remove or rename `libsandbox.1.dylib` temporarily; confirm scan proceeds with VRB(1) log

## Dev Notes

### Mandatory Standards

All code MUST follow `docs/jack-louis-coding-style-guide.md`.

> **Mantra:** DO NOT BE LAZY. We have plenty of time to do it right. No shortcuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Measure 3x, cut once. No fallback. No stub code. Just pure excellence.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history.

### Implementation Guidance

- Read `src/unilib/arch.c` fully — understand `apply_sandbox()` (lines 197-215, current stub), `drop_privs()` (lines 218-355), and how they interact
- Read `macos/unicornscan-listener.sb` — the 188-line deny-default Seatbelt profile ready to use
- Read `configure.ac` — the `HAVE_SANDBOX_INIT` detection and `SANDBOX_PROFILE` define
- The SPI was **tested and confirmed working on macOS 26.3.1** during CFA research
- Use `dlopen("/usr/lib/libsandbox.1.dylib", RTLD_LAZY | RTLD_LOCAL)` + `dlsym()` for each symbol
- The code sketch in PRD Section 3.2.1 is the reference implementation
- Chesterton's fence: `sandbox_init()` was the original intent. It failed because `SANDBOX_NAMED` only accepts Apple's built-in profile constants. The SPI bypasses this by going directly to the underlying implementation.

**Mantra:** This code touches security boundaries. Test sandbox enforcement by verifying a sandboxed listener CANNOT write to `/tmp/test_sandbox_escape`. Test graceful degradation with libsandbox removed. No shortcuts.

### Project Structure Notes

- `src/unilib/arch.c:197-215` — `apply_sandbox()` current stub to be replaced with the SPI-based implementation
- `configure.ac` — `HAVE_SANDBOX_INIT` detection and `SANDBOX_PROFILE` path definition
- `macos/unicornscan-listener.sb` — the 188-line deny-default Seatbelt profile to be applied

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
