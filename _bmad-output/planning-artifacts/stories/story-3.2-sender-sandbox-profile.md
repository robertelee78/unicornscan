# Story 3.2: Create Sender Sandbox Profile

Status: ready-for-dev

## Story

As a security engineer,
I want the sender process (unisend) also sandboxed,
so that both child processes have defense-in-depth isolation.

## Acceptance Criteria

1. **Given** a new `macos/unicornscan-sender.sb` profile **When** the sender process starts with sandbox applied **Then** BPF device write is allowed, IPC sockets allowed, sysctl read allowed **And** file creation denied, process spawning denied, fork denied **And** TCP SYN, UDP, and ARP scans produce correct results

## Tasks / Subtasks

- [ ] Read all source that reveals sender syscall requirements (AC: #1)
  - [ ] Read `macos/unicornscan-listener.sb` — understand the profile structure and syntax used
  - [ ] Read `src/scan_progs/send_packet.c` in full — identify every syscall the sender makes: BPF write, IPC socket operations, sysctl reads, any module loading
- [ ] Draft `macos/unicornscan-sender.sb` profile (AC: #1)
  - [ ] Start from deny-default base matching listener profile structure
  - [ ] Add explicit allow rules for: BPF device write, IPC sockets, sysctl read
  - [ ] Confirm file creation, process spawning, and fork are denied by the default
- [ ] Test profile interactively using `sandbox-exec` (AC: #1)
  - [ ] Run `sandbox-exec -f macos/unicornscan-sender.sb -- /path/to/unisend` and confirm no denials on allowed operations
  - [ ] Confirm denied operations are rejected as expected
- [ ] Update `apply_sandbox()` in `src/unilib/arch.c` to select the correct profile (AC: #1)
  - [ ] Add a mechanism (e.g., a parameter or process-role flag) to distinguish listener vs sender
  - [ ] Read existing `apply_sandbox()` implementation from Story 3.1 before modifying
- [ ] Run TCP SYN, UDP, and ARP scans with sandbox active and verify correct results (AC: #1)

## Dev Notes

### Mandatory Standards

All code MUST follow `docs/jack-louis-coding-style-guide.md`.

> **Mantra:** DO NOT BE LAZY. We have plenty of time to do it right. No shortcuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Measure 3x, cut once. No fallback. No stub code. Just pure excellence.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history.

### Implementation Guidance

- Read `macos/unicornscan-listener.sb` to understand the profile structure
- Read `src/scan_progs/send_packet.c` to understand what the sender needs: BPF write, IPC socket, sysctl read, module loading
- Chesterton's fence: no sender profile exists because the original plan only sandboxed the listener (which processes untrusted network data). Sandboxing the sender is defense-in-depth.

**Mantra:** Write the profile by reading every syscall the sender makes, not by guessing. Use `sandbox-exec -f profile.sb -- /path/to/unisend` to test interactively.

### Project Structure Notes

- `macos/unicornscan-sender.sb` (new) — the Seatbelt profile for the sender process; must be derived by reading every syscall in `send_packet.c`
- `src/unilib/arch.c` — `apply_sandbox()` will need a way to select the correct profile (listener vs sender)

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
