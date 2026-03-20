# Story 5.4: Validate Build-from-Source Path

Status: ready-for-dev

## Story

As a developer contributing to unicornscan,
I want the source build to work on a clean macOS,
so that contributors can build and test without a package manager.

## Acceptance Criteria

1. **Given** a clean macOS **When** `autoreconf -fiv && ./configure && make && sudo make install` runs **Then** build succeeds with zero errors, scanner runs, modules load

## Tasks / Subtasks

- [ ] Prepare a clean macOS build environment (AC: #1)
  - [ ] Start from a system with only Xcode Command Line Tools and Homebrew installed
  - [ ] Install only the documented prerequisites — do not add unlisted tools
- [ ] Execute the documented build steps exactly as written (AC: #1)
  - [ ] Run `autoreconf -fiv`
  - [ ] Run `./configure` — record full output; note any missing headers or library errors
  - [ ] Run `make` — confirm zero errors and zero unexpected warnings
  - [ ] Run `sudo make install` — confirm all files land in expected paths
- [ ] Verify the installed scanner works (AC: #1)
  - [ ] Run a basic TCP SYN scan against a known host; confirm results appear
  - [ ] Confirm modules load without errors
- [ ] Update `docs/INSTALL-source.md` to match the tested steps exactly (AC: #1)
  - [ ] If any undocumented prerequisite was needed, add it
  - [ ] If any documented step failed or required adjustment, update it
  - [ ] Every step in the document must correspond to a step that was actually run and verified

## Dev Notes

### Mandatory Standards

All code MUST follow `docs/jack-louis-coding-style-guide.md`.

> **Mantra:** DO NOT BE LAZY. We have plenty of time to do it right. No shortcuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Measure 3x, cut once. No fallback. No stub code. Just pure excellence.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history.

### Implementation Guidance

- Test the documented build steps on a clean system with only Xcode CLT + Homebrew

### Project Structure Notes

- `docs/INSTALL-source.md` — the source build instructions document; must reflect the tested build steps exactly as they were verified on a clean system

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
