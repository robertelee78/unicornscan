# Story 5.1: Complete Homebrew Formula

Status: ready-for-dev

## Story

As a macOS user,
I want `brew install unicornscan` to just work,
so that I get a properly configured scanner with all dependencies.

## Acceptance Criteria

1. **Given** the formula with correct sha256 **When** `brew install robertelee78/unicornscan/unicornscan` runs **Then** all dependencies installed, build completes, all binaries present **And** `brew test unicornscan` passes **And** `brew audit --strict unicornscan` produces zero errors **And** `brew uninstall unicornscan` cleanly removes all files

## Tasks / Subtasks

- [ ] Read `macos/unicornscan.rb` in full (all 243 lines) (AC: #1)
  - [ ] Identify the PLACEHOLDER sha256 and note where it appears
  - [ ] Identify missing `flex` and `bison` dependencies
  - [ ] Identify missing `PKG_CONFIG_PATH` for keg-only libpcap
  - [ ] Understand the DESTDIR staging approach and confirm it is correct Homebrew practice
- [ ] Fix sha256 in the formula (AC: #1)
  - [ ] Compute the actual sha256 of the source tarball
  - [ ] Replace the PLACEHOLDER value
- [ ] Add missing `flex` and `bison` build dependencies (AC: #1)
  - [ ] Insert `depends_on "flex" => :build` and `depends_on "bison" => :build` in the correct position
- [ ] Set `PKG_CONFIG_PATH` for keg-only libpcap (AC: #1)
  - [ ] In the `install` block, prepend the Homebrew libpcap `pkgconfig` path to `PKG_CONFIG_PATH`
  - [ ] Confirm `configure` finds the correct libpcap headers and libraries
- [ ] Test on a clean macOS system (AC: #1)
  - [ ] `brew uninstall unicornscan` any prior version if present
  - [ ] Run `brew install --build-from-source robertelee78/unicornscan/unicornscan`
  - [ ] Confirm all binaries present
  - [ ] Run `brew test unicornscan` — must pass
  - [ ] Run `brew audit --strict unicornscan` — must produce zero errors
  - [ ] Run `brew uninstall unicornscan` — must cleanly remove all files

## Dev Notes

### Mandatory Standards

All code MUST follow `docs/jack-louis-coding-style-guide.md`.

> **Mantra:** DO NOT BE LAZY. We have plenty of time to do it right. No shortcuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Measure 3x, cut once. No fallback. No stub code. Just pure excellence.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history.

### Implementation Guidance

- Read `macos/unicornscan.rb` (243 lines) fully
- CFA Agent #6 found: sha256 PLACEHOLDER, missing flex/bison deps, no PKG_CONFIG_PATH for keg-only libpcap
- Chesterton's fence: the formula uses DESTDIR staging because Homebrew's standard install relies on `--prefix` being the Cellar path. This is valid Homebrew practice.

**Mantra:** Test on a CLEAN system. Not your dev machine. A fresh macOS VM or `brew install --build-from-source` after `brew uninstall` of any prior version.

### Project Structure Notes

- `macos/unicornscan.rb` — the 243-line Homebrew formula; sha256 must be corrected, flex/bison deps added, PKG_CONFIG_PATH set for keg-only libpcap

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
