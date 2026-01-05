# Unicornscan Living Project Improvement Plan

**Date**: 2025-12-22
**Status**: Approved for Implementation
**Related Issue**: GitHub #3 (Claim 1 - Version/Folder Naming)

---

## Executive Summary

This plan transforms unicornscan from a versioned archive (`unicornscan-0.4.7`) into a living, actively maintained project (`unicornscan`). The goal is to remove version numbers from the folder structure while preserving historical context about Jack Louis's original 0.4.7 release.

**Key Insight**: The build system already supports any folder name - `BUILD_DIR` is dynamically set from `@abs_top_srcdir@` at configure time. No code changes are needed.

---

## Current State Analysis

### What's Correct Already

| Component | Current Value | Status |
|-----------|---------------|--------|
| configure.ac | 0.4.10 | ✓ Correct |
| src/packageinfo.h | 0.4.10 | ✓ Correct |
| rpm/unicornscan.spec | 0.4.10 | ✓ Correct |
| GitHub repo name | `unicornscan` | ✓ Correct |
| Build system | Dynamic paths | ✓ Correct |

### What Needs Attention

| Component | Current State | Issue |
|-----------|---------------|-------|
| Folder name | `/opt/unicornscan-0.4.7` | Version embedded |
| Documentation paths | `src/...` | Absolute, versioned |
| Man pages | 0.4.6b | Outdated |
| CONTRIBUTING.md | Missing | No contribution guide |

---

## The Problem With Versioned Folder Names

1. **Confusion**: Folder says "0.4.7" but software is actually 0.4.10+
2. **Archive Perception**: Suggests the code is frozen/historical
3. **Documentation Drift**: Paths become stale with each version
4. **Git Disconnect**: GitHub repo is `unicornscan`, not `unicornscan-0.4.7`

---

## Improvement Plan

### Phase 1: Folder Rename (User Action)

**Priority**: High
**Effort**: 5 minutes
**Risk**: None (build system handles it automatically)

```bash
# 1. Rename the folder
mv /opt/unicornscan-0.4.7 /opt/unicornscan

# 2. Reconfigure (BUILD_DIR updates automatically)
cd /opt/unicornscan
autoreconf -fi
./configure --prefix=/usr --sysconfdir=/etc --with-pgsql

# 3. Verify build works
make clean && make -j$(nproc)
```

**Why This Works**:
- `Makefile.inc.in` uses `BUILD_DIR=@abs_top_srcdir@`
- `configure.ac` sets this from `pwd`
- No hardcoded paths in source code

### Phase 2: Documentation Path Cleanup

**Priority**: Medium
**Effort**: 30-60 minutes
**Files Affected**: 15 files, 79+ path references

#### Transform Pattern
```
BEFORE: src/scan_progs/init_packet.c
AFTER:  src/scan_progs/init_packet.c
```

#### Files to Update

**Main Documentation (5 files)**:
- `docs/FINGERPRINT_PACKET_STRUCTURES.md`
- `docs/MODERNIZATION.md`
- `docs/BUILD_VERIFICATION_REPORT.md`
- `docs/p0f-v3-research-analysis.md`
- `docs/p0f-v3-vs-v2-quick-reference.md`

**Cluster Documentation (2 files)**:
- `docs/cluster/CLUSTER_SCALABILITY_ANALYSIS.md`
- `docs/cluster/CLUSTER_MODE_GUIDE.md`

**Research Documentation (11+ files)**:
- `docs/research/autotools-architecture-analysis.md`
- `docs/research/fingerprint-7-*.md` (multiple)
- `docs/research/pcap-sll-header-investigation.md`
- `docs/research/myiphdr-bitfield-alignment-analysis.md`
- `docs/research/udp-*.md` (multiple)
- `docs/research/version-0.4.7-references-audit.md`

#### Bulk Update Command
```bash
# Preview changes
grep -rl "" docs/ | xargs -I{} grep -l "unicornscan-0.4.7" {}

# Apply transformation
find docs/ -name "*.md" -exec sed -i 's|||g' {} \;

# Verify
grep -r "unicornscan-0.4.7" docs/ | wc -l  # Should be 0 or minimal
```

### Phase 3: Historical Context Preservation

**Priority**: High
**Effort**: 15 minutes

#### Update README.md Project History

Current:
```markdown
## Project History

- **Original Author**: Jack Louis (Rapture Security / Outpost24)
- **Initial Release**: ~2004-2006
- **Final Original Release**: 0.4.7 (December 2007)
- **Modernization**: 2025 (GCC 15 compatibility, p0f v3 integration)
```

Proposed:
```markdown
## Project History

Unicornscan was created by Jack Louis at Rapture Security (later Outpost24) as a high-performance asynchronous network scanner.

| Milestone | Date | Details |
|-----------|------|---------|
| Initial Development | 2004-2006 | Original implementation |
| Final Original Release | December 2007 | Version 0.4.7 by Jack Louis |
| Modernization Begins | December 2025 | GCC 14/15 compatibility |
| Active Maintenance | 2025-present | Ongoing development |

**Current Version**: See `configure.ac` for the authoritative version number.

The modernization effort aims to preserve all original functionality while enabling the tool to build and run on current Linux distributions.
```

### Phase 4: Man Page Updates

**Priority**: Medium
**Effort**: 20 minutes

**Files**:
- `docs/man/unicornscan.1` - Currently shows 0.4.6b
- `docs/unicornscan_man.tex` - LaTeX source

**Update**:
```nroff
.TH UNICORNSCAN 1 "December 2025" "unicornscan 0.4.10" "User Commands"
```

### Phase 5: Project Governance

**Priority**: Medium
**Effort**: 45 minutes

Create `CONTRIBUTING.md` with:
1. Welcome message acknowledging Jack Louis
2. Development environment setup
3. Code style guidelines (match existing C style)
4. Pull request process
5. Areas needing contributions

---

## Archon Tasks Created

| Task ID | Title | Priority | Assignee |
|---------|-------|----------|----------|
| 5bf63e32-... | Project Modernization: Rename folder and establish living project structure | 95 | User |
| f58b11a3-... | Documentation: Convert absolute paths to relative paths | 85 | Claude |
| c5d69875-... | Documentation: Update man pages to current version | 80 | Claude |
| b273027a-... | Project Governance: Create CONTRIBUTING.md | 75 | User |
| 3b579713-... | Fix parallel build race condition (GitHub #3) | 90 | User |

---

## What NOT to Change

1. **README.md historical reference**: Keep "Final Original Release: 0.4.7"
2. **CHANGELOG**: Historical log from original project
3. **Research docs context**: They were analyzing 0.4.7, that's accurate
4. **Jack Louis credit**: Always acknowledge original author

---

## Verification Checklist

After completing all phases:

- [ ] Folder is `/opt/unicornscan` (no version)
- [ ] `grep -r "unicornscan-0.4.7" .` returns only this plan and historical context
- [ ] `./configure && make -j$(nproc)` builds successfully
- [ ] `./src/unicornscan --version` shows 0.4.10
- [ ] Man page shows current version
- [ ] CONTRIBUTING.md exists
- [ ] README.md has updated Project History

---

## Conclusion

Unicornscan is transitioning from a preserved archive to a living project:

- **Before**: `unicornscan-0.4.7` - frozen historical snapshot
- **After**: `unicornscan` - actively maintained, version in source files

The version number belongs in `configure.ac`, `packageinfo.h`, and release tags - not in the folder name.

**Jack Louis's 0.4.7 remains the foundation**, but the project is now alive and growing.
