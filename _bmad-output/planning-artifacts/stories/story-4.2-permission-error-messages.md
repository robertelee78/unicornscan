# Story 4.2: Improve Permission Error Messages

Status: ready-for-dev

## Story

As a user who gets "dnet ip_open fails",
I want a clear message telling me what to do,
so that I can fix the problem in one step.

## Acceptance Criteria

1. **Given** `ip_open()` returns NULL on macOS **When** the error is logged **Then** `ERR()` prints "raw socket access requires root on macOS" and suggests `sudo` **And** `terminate()` is still called (fatal)

2. **Given** either failure occurs on Linux **When** the error is logged **Then** existing error messages unchanged

## Tasks / Subtasks

- [ ] Read both error paths in full before modifying (AC: #1, #2)
  - [ ] Read `src/scan_progs/send_packet.c:1258-1282` — both the `SOCK_IP` and `SOCK_LL` error paths in `open_link()`
  - [ ] Confirm `terminate()` is present and must remain fatal on all platforms
  - [ ] Confirm current error message text that must remain unchanged on Linux
- [ ] Add macOS-specific `ERR()` message for `ip_open()` NULL return (AC: #1)
  - [ ] Wrap under `#ifdef __APPLE__`
  - [ ] Message must include "raw socket access requires root on macOS"
  - [ ] Message must suggest `sudo unicornscan ...` as the fix
  - [ ] Use `ERR()` macro, not `fprintf`, per Jack Louis style guide Section 3
  - [ ] `terminate()` call must follow immediately after
- [ ] Verify the `SOCK_LL` (`eth_open`) error path also has an appropriate macOS message (AC: #1)
  - [ ] If not covered by Story 1.2, add a complementary `#ifdef __APPLE__` message here
- [ ] Confirm Linux error messages are byte-for-byte unchanged (AC: #2)
  - [ ] Inspect preprocessor output or build on Linux to verify
- [ ] Trigger both failure paths manually on macOS and confirm messages are immediately actionable (AC: #1)

## Dev Notes

### Mandatory Standards

All code MUST follow `docs/jack-louis-coding-style-guide.md`.

> **Mantra:** DO NOT BE LAZY. We have plenty of time to do it right. No shortcuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Measure 3x, cut once. No fallback. No stub code. Just pure excellence.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history.

### Implementation Guidance

- Read `src/scan_progs/send_packet.c:1258-1282` — both `SOCK_IP` and `SOCK_LL` error paths
- Use `ERR()` macro per Jack Louis style guide Section 3
- macOS-specific messages must be `#ifdef __APPLE__` guarded
- Chesterton's fence: the current `terminate()` is intentionally terse — Jack's style was minimal. We add platform-specific context without changing the fatal behavior.

**Mantra:** The error message must be actionable on first read. A user should be able to copy-paste the fix command.

### Project Structure Notes

- `src/scan_progs/send_packet.c:1258-1282` — both `SOCK_IP` and `SOCK_LL` error paths where macOS-specific `ERR()` messages must be added under `#ifdef __APPLE__`

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
