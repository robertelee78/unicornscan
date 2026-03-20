# Story 5.3: DMG Installer Validation

Status: ready-for-dev

## Story

As a user who doesn't use Homebrew,
I want a working DMG installer,
so that I can install unicornscan without a package manager.

## Acceptance Criteria

1. **Given** `build-dmg.sh` produces a DMG **When** installed on a clean macOS **Then** all binaries present and linked correctly (`otool -L` shows no /opt/homebrew paths) **And** modules load, config files installed, ChmodBPF LaunchDaemon loadable **And** uninstall removes all files

## Tasks / Subtasks

- [ ] Read `macos/dmg/build-dmg.sh` in full (all 594 lines) (AC: #1)
  - [ ] Identify the invalid `background.png` reference and what is required
  - [ ] Identify the missing `unicornscan-alicorn` binary reference
  - [ ] Identify the deprecated `launchctl load` call and what the modern replacement is
  - [ ] Understand the full build and staging sequence end-to-end
- [ ] Fix the invalid `background.png` reference (AC: #1)
  - [ ] Determine whether a background image is required; if so, create or source a valid one
  - [ ] Update `build-dmg.sh` to reference the correct path
- [ ] Fix or remove the missing `unicornscan-alicorn` reference (AC: #1)
  - [ ] Determine whether this binary should exist or whether the reference is stale
  - [ ] Update the script to match the actual installed binary set
- [ ] Replace deprecated `launchctl load` with the modern equivalent (AC: #1)
  - [ ] Use `launchctl bootstrap` or `launchctl enable` as appropriate for the macOS target versions
  - [ ] Update `macos/dmg/postinstall` accordingly
- [ ] Read `macos/dmg/postinstall` in full and verify all steps are correct (AC: #1)
- [ ] Build the DMG on macOS and perform full end-to-end validation (AC: #1)
  - [ ] Mount the DMG and install on a clean macOS system
  - [ ] Run `otool -L` on all binaries — confirm no `/opt/homebrew` paths present
  - [ ] Load modules and confirm they initialise correctly
  - [ ] Confirm config files are installed to the expected paths
  - [ ] Attempt to load the ChmodBPF LaunchDaemon; confirm it loads cleanly
  - [ ] Run the uninstaller; confirm zero files remain

## Dev Notes

### Mandatory Standards

All code MUST follow `docs/jack-louis-coding-style-guide.md`.

> **Mantra:** DO NOT BE LAZY. We have plenty of time to do it right. No shortcuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Measure 3x, cut once. No fallback. No stub code. Just pure excellence.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history.

### Implementation Guidance

- Read `macos/dmg/build-dmg.sh` (594 lines) fully
- CFA Agent #6 found: invalid background.png, missing unicornscan-alicorn, deprecated `launchctl load`
- Chesterton's fence: the DMG script was written during v0.5.0 but never tested end-to-end. Treat as unvalidated.

**Mantra:** Build the DMG. Mount it. Install on a clean system. Run a scan. Uninstall. Verify zero files remain.

### Project Structure Notes

- `macos/dmg/build-dmg.sh` — the 594-line DMG build script; invalid background.png, missing unicornscan-alicorn, and deprecated `launchctl load` must all be fixed
- `macos/dmg/postinstall` — the post-install script; must be verified end-to-end on a clean system

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
