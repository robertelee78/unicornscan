# Story 6.1: ICMP Scan Mode Status Assessment

Status: ready-for-dev

## Story

As a developer,
I want to determine whether ICMP scanning works, is partial, or is a dead stub,
so that we can validate it or document it as unsupported.

## Acceptance Criteria

1. **Given** the MODE_ICMPSCAN code paths are audited **When** the assessment is complete **Then** a clear determination: working / partial / dead stub **And** if dead stub: recommendation to implement or remove scaffolding **And** GETTING_STARTED.md updated to reflect actual ICMP status

## Tasks / Subtasks

- [ ] Read all ICMP-related source code before drawing any conclusions (AC: #1)
  - [ ] Read `src/scan_progs/scanopts.c:474-563` — `scan_parsemode()` — check for presence or absence of an `'I'` branch
  - [ ] Read `src/scan_progs/send_packet.c:527-562` — the workunit switch — check whether `ICMP_SEND_MAGIC` is handled
  - [ ] Read `src/scan_progs/workunits.c` — ICMP workunit definitions — assess completeness
  - [ ] Search for all references to `MODE_ICMPSCAN` (value 8) across the entire codebase
- [ ] Record findings with exact file and line references (AC: #1)
  - [ ] Confirm or deny: does `scan_parsemode()` have an `'I'` branch?
  - [ ] Confirm or deny: is `ICMP_SEND_MAGIC` handled in the send switch?
  - [ ] Classify the state: working / partial / dead stub — with evidence
- [ ] Formulate a recommendation (AC: #1)
  - [ ] If dead stub: recommend either implementing ICMP mode fully or removing the scaffolding
  - [ ] If partial: identify exactly which pieces are missing
  - [ ] If working: document which ICMP types are supported
- [ ] Update `GETTING_STARTED.md` to reflect the actual ICMP status (AC: #1)
  - [ ] If dead stub or partial: note ICMP as unsupported or experimental
  - [ ] If working: document the correct usage flag and any privilege requirements
  - [ ] Do NOT implement ICMP mode as part of this story — assessment and documentation only

## Dev Notes

### Mandatory Standards

All code MUST follow `docs/jack-louis-coding-style-guide.md`.

> **Mantra:** DO NOT BE LAZY. We have plenty of time to do it right. No shortcuts. Never make assumptions. Always dive deep and ensure you know the problem you're solving. Measure 3x, cut once. No fallback. No stub code. Just pure excellence.

> **Chesterton's Fence:** Always understand existing code fully before changing it. Read the function. Read its callers. Read the history.

### Implementation Guidance

- Read `src/scan_progs/scanopts.c:474-563` — does `scan_parsemode()` have an `'I'` branch?
- Read `src/scan_progs/send_packet.c:527-562` — does the workunit switch handle `ICMP_SEND_MAGIC`?
- CFA Agent #7 found: MODE_ICMPSCAN defined (value 8), magic numbers exist, but `scan_parsemode()` has NO `'I'` branch — dead stub
- Chesterton's fence: ICMP mode was likely planned but never finished in the original 0.4.7

**Mantra:** Do NOT implement ICMP mode in this story. This is ASSESSMENT ONLY. Determine exact state, document, recommend.

### Project Structure Notes

- `src/scan_progs/scanopts.c` — `scan_parsemode()` at lines 474-563; check whether an `'I'` branch exists
- `src/scan_progs/send_packet.c` — workunit switch at lines 527-562; check whether `ICMP_SEND_MAGIC` is handled
- `src/scan_progs/workunits.c` — ICMP workunit definitions to be assessed for completeness

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
