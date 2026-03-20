# Story 1.1: Patch Bundled libdnet BPF Device Iteration

Status: ready-for-dev

## Story

As a penetration tester running multiple tools,
I want `eth_open()` to find any available BPF device,
so that I never get "Resource busy" errors when `/dev/bpf0` is held by another process.

## Acceptance Criteria

1. **Given** `/dev/bpf0` is held by another process (e.g., Wireshark, pcap, unilisten) **When** unicornscan's sender calls `eth_open()` for ARP mode (`send_packet.c:1270`) **Then** libdnet iterates `/dev/bpf1` through `/dev/bpf255` until a free device is found **And** the BPF fd is bound to the correct interface via `BIOCSETIF` **And** `BIOCSHDRCMPLT` is set for header-complete mode

2. **Given** all 256 BPF devices are busy **When** `eth_open()` exhausts the iteration **Then** it returns NULL (same as current behavior) **And** the caller's error handling is triggered

3. **Given** unicornscan is built on Linux **When** the bundled libdnet is compiled **Then** the BPF iteration patch is not applied (guarded by `uname -s` check in `libs/Makefile.in`) **And** Linux behavior is completely unchanged

## Tasks / Subtasks

- [ ] Read and fully understand existing `eth-bsd.c` implementation (AC: #1, #2)
  - [ ] Read `libs/` bundled libdnet source in full
  - [ ] Trace exactly how `eth_open()` currently opens `/dev/bpf0`, calls `BIOCSETIF`, and sets `BIOCSHDRCMPLT`
  - [ ] Read libpcap `pcap-bpf.c` BPF iteration as reference implementation
- [ ] Patch `eth-bsd.c` to iterate `/dev/bpf0`–`/dev/bpf255` on macOS/BSD (AC: #1, #2)
  - [ ] Add loop from device index 0 to 255, trying each path until one opens without `EBUSY`
  - [ ] Preserve `BIOCSETIF` and `BIOCSHDRCMPLT` calls inside the loop
  - [ ] On exhaustion return NULL unchanged
  - [ ] Guard entire patch with `#ifdef __APPLE__` (or appropriate BSD macro)
- [ ] Update `libs/Makefile.in` Linux guard (AC: #3)
  - [ ] Add `uname -s` conditional so the patch file is only applied on macOS/BSD
  - [ ] Verify Linux build compiles cleanly without the patch
- [ ] Verify macOS build with `/dev/bpf0` held by another process (AC: #1)
  - [ ] Hold `/dev/bpf0` open in a second terminal and confirm unicornscan advances to `/dev/bpf1`
- [ ] Verify Linux build is completely unchanged (AC: #3)
  - [ ] Cross-compile or run on Linux, confirm no behavioral difference

## Dev Notes

### Mandatory Standards

All code MUST follow `docs/jack-louis-coding-style-guide.md`.

> **Mantra:** DO NOT BE LAZY. We have plenty of time to do it right. No shortcuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Measure 3x, cut once. No fallback. No stub code. Just pure excellence.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history.

### Implementation Guidance

- Read `libs/` bundled libdnet source fully — understand how `eth-bsd.c` works before touching it
- Study how libpcap iterates BPF devices in `pcap-bpf.c` for reference
- The patch must be conditional on `__APPLE__` or BSD — Linux uses `PF_PACKET`, not BPF
- Follow Jack Louis style: `/* */` comments, `return -1` on error, no `//` comments
- Reference: `docs/jack-louis-coding-style-guide.md`
- Chesterton's fence: understand why libdnet hardcoded `/dev/bpf0` (likely a simplification from 2004 when BSD systems had fewer BPF consumers)

**Mantra:** DO NOT BE LAZY. Read the entire `eth-bsd.c` before patching. Verify the patch compiles on macOS AND that Linux builds skip it entirely. Test with bpf0 held by another process. Measure 3x, cut once.

### Project Structure Notes

- `libs/` — bundled libdnet source, specifically `eth-bsd.c` which contains the `eth_open()` implementation to be patched
- `libs/Makefile.in` — controls conditional compilation; the Linux guard must live here

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
