# Story 5.2: Homebrew Bottle Generation in CI

Status: ready-for-dev

## Story

As a user,
I want pre-compiled bottles so install takes seconds not minutes,
so that the Homebrew install experience is fast.

## Acceptance Criteria

1. **Given** a new version tag is pushed **When** the `build-macos` CI job runs **Then** it produces a `.bottle.tar.gz` artifact uploaded to GitHub Release **And** formula includes `bottle do` block with correct sha256

## Tasks / Subtasks

- [ ] Read `.github/workflows/release.yml` fully — understand the existing `build-macos` job (AC: #1)
  - [ ] Identify current build steps and artifact upload logic
  - [ ] Identify where the bottle build step and sha256 computation must be inserted
- [ ] Add bottle build step to the `build-macos` CI job (AC: #1)
  - [ ] Use `brew bottle --json unicornscan` to produce the `.bottle.tar.gz`
  - [ ] Capture the json output to extract the sha256
  - [ ] Name the artifact correctly for `arm64_sonoma` (Apple Silicon)
- [ ] Upload the bottle artifact to the GitHub Release (AC: #1)
  - [ ] Add an upload step using `gh release upload` or the equivalent GitHub Actions upload action
  - [ ] Confirm the artifact appears under the correct release tag
- [ ] Update the formula with the `bottle do` block (AC: #1)
  - [ ] Use the sha256 extracted from the bottle json output
  - [ ] Ensure the `bottle do` block in `macos/unicornscan.rb` is correct and parseable by `brew audit`
- [ ] Verify end-to-end on a tag push to a test branch (AC: #1)
  - [ ] Push a test tag, confirm CI produces the bottle, confirm formula references it correctly

## Dev Notes

### Mandatory Standards

All code MUST follow `docs/jack-louis-coding-style-guide.md`.

> **Mantra:** DO NOT BE LAZY. We have plenty of time to do it right. No shortcuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Measure 3x, cut once. No fallback. No stub code. Just pure excellence.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history.

### Implementation Guidance

- Read `.github/workflows/release.yml` — the `build-macos` job
- Bottles are platform-specific: `arm64_sonoma` for Apple Silicon

### Project Structure Notes

- `.github/workflows/release.yml` — the `build-macos` CI job that must be updated to produce and upload the `.bottle.tar.gz` artifact
- `macos/unicornscan.rb` — must include a `bottle do` block with correct sha256 after bottle generation

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
