# Story 1.2: BPF Device Exhaustion Diagnostics

Status: ready-for-dev

## Story

As a user who encounters "eth_open fails",
I want a clear error message explaining what happened and how to fix it,
so that I can resolve the issue without searching online.

## Acceptance Criteria

1. **Given** `eth_open()` returns NULL on macOS **When** the error is logged in `send_packet.c` **Then** the message includes "all /dev/bpf* devices may be busy" **And** suggests `lsof /dev/bpf*` to identify holders **And** the process still calls `terminate()` (fatal for link-layer mode)

2. **Given** `eth_open()` returns NULL on Linux **When** the error is logged **Then** the existing error message is unchanged **And** no macOS-specific text appears

## Tasks / Subtasks

- [ ] Read existing error handling in `send_packet.c` (AC: #1, #2)
  - [ ] Read `send_packet.c:1258-1282` (`open_link()`) in full
  - [ ] Read `fantaip.c` error handling for consistency reference
  - [ ] Confirm `terminate()` call is present and must be preserved
- [ ] Add macOS-specific `ERR()` message for `eth_open()` NULL return (AC: #1)
  - [ ] Wrap new message in `#ifdef __APPLE__`
  - [ ] Message must include "all /dev/bpf* devices may be busy"
  - [ ] Message must suggest `lsof /dev/bpf*` as the diagnostic command
  - [ ] Use `ERR()` macro, not `fprintf`, per Jack Louis style guide Section 3
  - [ ] Keep `terminate()` call intact after the message
- [ ] Confirm Linux path is unchanged (AC: #2)
  - [ ] Build on Linux or inspect preprocessor output to confirm no macOS text bleeds through
- [ ] Verify message is immediately actionable (AC: #1)
  - [ ] Trigger the failure path manually and confirm the full message reads clearly on first view

## Dev Notes

### Mandatory Standards

All code MUST follow `docs/jack-louis-coding-style-guide.md`.

> **Mantra:** DO NOT BE LAZY. We have plenty of time to do it right. No shortcuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Measure 3x, cut once. No fallback. No stub code. Just pure excellence.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history.

### Implementation Guidance

- Read `send_packet.c:1258-1282` (`open_link()`) fully before modifying
- Read how `fantaip.c` handles the same error for consistency
- Use `ERR()` macro (not fprintf), per Jack Louis style guide Section 3
- The diagnostic must be macOS-only (`#ifdef __APPLE__`) — Linux messages unchanged
- Chesterton's fence: the current `terminate()` call is intentional — a link-layer failure is fatal for ARP mode. Keep it fatal, just make the message better.

**Mantra:** No stubs. The error message must be immediately actionable on first read.

### Project Structure Notes

- `src/scan_progs/send_packet.c:1268-1274` — `open_link()` error handling path where the improved message must be inserted

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
