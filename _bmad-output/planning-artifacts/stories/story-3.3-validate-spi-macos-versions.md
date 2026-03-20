# Story 3.3: Validate SPI Across macOS Versions

Status: ready-for-dev

## Story

As a developer,
I want confirmation the libsandbox SPI works on macOS 13-26,
so that we don't ship sandbox support that breaks on older systems.

## Acceptance Criteria

1. **Given** the SPI-based `apply_sandbox()` implementation **When** tested on macOS 13, 14, 15, and 26 **Then** `sandbox_compile_file` + `sandbox_apply` succeeds on all versions **And** fallback works when symbols are artificially removed

## Tasks / Subtasks

- [ ] Set up test environments for each macOS version (AC: #1)
  - [ ] Identify CI runners or VMs available for macOS 13 (Ventura), 14 (Sonoma), 15 (Sequoia), and 26
  - [ ] Confirm the SPI-based `apply_sandbox()` from Story 3.1 is built and installed on each
- [ ] Run sandbox enforcement test on each macOS version (AC: #1)
  - [ ] Call `sandbox_compile_file` with the listener profile; confirm no error returned
  - [ ] Call `sandbox_apply`; confirm policy is active (verify listener CANNOT write `/tmp/test_sandbox_escape`)
  - [ ] Record pass/fail per version in a validation evidence document
- [ ] Test fallback path on each version (AC: #1)
  - [ ] Artificially remove or rename `libsandbox.1.dylib` (or force `dlopen` to fail)
  - [ ] Confirm scanner proceeds with VRB(1) log and no crash
  - [ ] Record pass/fail per version
- [ ] Document findings and update implementation stories if gaps are found (AC: #1)
  - [ ] If any version fails, open a defect or update Story 3.1/3.2 with required workarounds
  - [ ] Record all results as validation evidence (no source files are changed by this story)

## Dev Notes

### Mandatory Standards

All code MUST follow `docs/jack-louis-coding-style-guide.md`.

> **Mantra:** DO NOT BE LAZY. We have plenty of time to do it right. No shortcuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Measure 3x, cut once. No fallback. No stub code. Just pure excellence.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history.

### Implementation Guidance

- This is validation/research, not code
- Test on CI runners or VMs for each macOS version
- The SPI symbols are in SDK TBD stubs from macOS 10.6 through 26.2 — but runtime behavior must be verified

**Mantra:** Do not assume SDK presence equals runtime availability. Test on real systems.

### Project Structure Notes

No source files are changed by this story. Results are recorded as validation evidence. If gaps are found, implementation stories are updated accordingly.

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
