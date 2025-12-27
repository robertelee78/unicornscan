# Unicornscan Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) documenting significant architectural choices in the unicornscan modernization project.

## What is an ADR?

An Architecture Decision Record captures important architectural decisions along with their context and consequences. ADRs help:
- Document the reasoning behind design choices
- Provide historical context for future maintainers
- Enable informed discussion of alternatives
- Track evolution of system design over time

## Format

Each ADR follows the standard template:
- **Status**: Proposed, Accepted, Deprecated, Superseded
- **Context**: What is the issue we're facing?
- **Decision**: What did we decide?
- **Consequences**: What are the results (positive, negative, neutral)?

## Index of ADRs

### ADR-001: Handling Remote Targets in Compound ARP Mode
**Status**: Proposed
**Date**: 2025-12-23

**Problem**: Compound modes like `-mA+T` expect ARP to filter targets, but ARP only works on local networks (Layer 2). How should we handle remote targets?

**Decision**: Fail early with educational error message. Detect remote targets at startup, error with clear explanation and suggested alternatives. Provide optional `--force-remote` flag for advanced users.

**Rationale**: Aligns with Jack Louis's explicit design philosophy. Prevents wasted time on impossible scans while educating users about networking fundamentals.

**Related Documents**:
- `docs/research/compound-mode-remote-target-design.md` (full analysis)
- PRD: Compound Modes (ARP-Filtered Multi-Phase Scanning)

---

## Related Documentation

- **PRDs** (Product Requirements Documents): `docs/project-docs/*.md`
- **Research**: `docs/research/*.md`
- **Implementation Guides**: `docs/*.md`

## Contributing

When making significant architectural decisions:
1. Create a new ADR in this directory
2. Number sequentially (ADR-NNN)
3. Follow the standard template
4. Update this README index
5. Link to related PRDs, research docs, and code
