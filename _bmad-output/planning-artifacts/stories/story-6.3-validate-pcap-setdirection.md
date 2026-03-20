# Story 6.3: Validate pcap_setdirection Behavior

Status: ready-for-dev

## Story

As a developer,
I want to confirm scan accuracy without direction filtering,
so that we know whether `pcap_setdirection` failure silently degrades result quality.

## Acceptance Criteria

1. **Given** `pcap_setdirection(PCAP_D_IN)` succeeds **When** TCP SYN scan runs against known target **Then** results match expected

2. **Given** `pcap_setdirection` fails (non-fatal) **When** same scan runs **Then** results identical — no duplicates from outbound reflection

## Tasks / Subtasks

- [ ] Read the relevant source code before testing (AC: #1, #2)
  - [ ] Read `src/scan_progs/recv_packet.c:284-289` — the `pcap_setdirection(PCAP_D_IN)` call and non-fatal fallback
  - [ ] Read the BPF filter strings `TCP_EFILTER` and `UDP_EFILTER` — determine whether they already exclude outbound packets
  - [ ] Understand the original rationale for adding direction filtering (defense against counting outbound packets as results)
- [ ] Test the success path: `pcap_setdirection(PCAP_D_IN)` succeeds (AC: #1)
  - [ ] Run a TCP SYN scan against a known target where expected open/closed ports are known
  - [ ] Record the results and confirm they match expectations with no spurious entries
- [ ] Test the failure path: force `pcap_setdirection` to fail (AC: #2)
  - [ ] Modify or stub `pcap_setdirection` to return an error, or use an interface where direction filtering is unsupported
  - [ ] Run the same TCP SYN scan and record results
  - [ ] Confirm results are identical to the success path — no duplicates from outbound reflection
- [ ] Analyse whether BPF filters already provide sufficient protection (AC: #2)
  - [ ] If `TCP_EFILTER`/`UDP_EFILTER` already exclude outbound, document this as the safety net
  - [ ] If not, document the risk and recommend a follow-up story to harden the filter
- [ ] Record findings as validation evidence (AC: #1, #2)
  - [ ] Document both test results with exact scan commands and output
  - [ ] Note any discrepancy or risk found

## Dev Notes

### Mandatory Standards

All code MUST follow `docs/jack-louis-coding-style-guide.md`.

> **Mantra:** DO NOT BE LAZY. We have plenty of time to do it right. No shortcuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Measure 3x, cut once. No fallback. No stub code. Just pure excellence.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history.

### Implementation Guidance

- Read `src/scan_progs/recv_packet.c:284-289` — the `pcap_setdirection(PCAP_D_IN)` non-fatal fallback
- Read BPF filter strings (TCP_EFILTER, UDP_EFILTER) — may already exclude own outbound
- Chesterton's fence: direction filtering was added as defense against counting outbound packets as results

### Project Structure Notes

- `src/scan_progs/recv_packet.c:284-289` — the `pcap_setdirection(PCAP_D_IN)` call and its non-fatal fallback; both the success and failure paths must be tested to confirm scan result accuracy

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
