# ADR-002: v0.4.52 Release Preparation Decisions

**Status**: Accepted (Revised)
**Date**: 2026-03-24 (revised 2026-03-26)
**Deciders**: Robert (Project Maintainer), CFA Swarm Review Panel
**Related**: PRD-macos-support.md, PRD-v051-macos-hardening.md

---

## Context and Problem Statement

Unicornscan v0.4.52 is the first release to add macOS (Apple Silicon) as a first-class platform. A comprehensive 5-agent swarm review identified 8 blockers and 6 should-fix items across the build system, packaging, source code, and release hygiene. This ADR documents the decisions made for each finding during the product manager-led triage session.

**Key question**: What must be fixed, what is acceptable, and what is the correct execution sequence to ship a clean v0.4.52 release?

---

## Decision Drivers

1. **Release quality**: No runtime failures on the primary new platform (macOS/Apple Silicon)
2. **Security parity**: macOS processes should have equivalent privilege restriction to Linux
3. **Repository hygiene**: No binary blobs, no stale version references, clean git history
4. **Simplicity**: Minimum changes needed to ship; no scope creep
5. **Jack Louis's philosophy**: Explicit behavior, platform-appropriate implementations

---

## Decisions

### D1: Install sender sandbox profile (`unicornscan-sender.sb`)

**Finding**: `make install` copies `unicornscan-listener.sb` but not `unicornscan-sender.sb`. The sender process calls `apply_sandbox_profile(SANDBOX_PROFILE_SENDER)` at `src/scan_progs/send_packet.c:565`, which fails silently when the file is missing — the sender runs unsandboxed.

**Decision**: Fix. Add the sender sandbox profile to the install target in `Makefile.in`.

**Rationale**: The macOS sandbox is the equivalent of the Linux `chroot()` jail in `src/unilib/arch.c:383`. The listener sandbox works; the sender sandbox was simply missed in the install target. Without it, the sender process runs with broader filesystem and network access than intended — a security regression compared to the Linux code path.

**Verified**: Both sandbox profiles (`unicornscan-sender.sb` and `unicornscan-listener.sb`) were tested on macOS arm64 (2026-03-26). The SPI functions (`sandbox_compile_file`, `sandbox_apply`) resolve via dlopen and both profiles compile and apply successfully. Enforcement testing in forked child processes confirmed: file writes to unauthorized paths are denied, fork/exec are denied, and only explicitly allowed paths are readable. The sender profile correctly denies all file writes; the listener profile correctly allows `/tmp` writes for pcap dump.

**Note**: This fix is separate from the deferred "sender sandbox hard-failure continues" item. D1 addresses the missing *file* (compile returns 0, sandbox skipped entirely). The deferred item addresses what happens if `sandbox_apply()` itself fails at the kernel level after successful compilation (returns -1, sender logs warning and continues). These are distinct failure modes — D1 ensures the sandbox is *attempted*; the deferred item concerns what happens when the attempt *fails*.

**Implementation**:
```makefile
$(INSTALL) -m 644 macos/unicornscan-sender.sb $(DESTDIR)$(datadir)/unicornscan/unicornscan-sender.sb
```

---

### D2: Guard sandbox installation to Darwin only

**Finding**: The sandbox `.sb` file install runs unconditionally on all platforms, including Linux where the files are irrelevant.

**Decision**: Wrap sandbox profile installation in a `uname -s` Darwin check.

**Rationale**: macOS sandbox profiles have no meaning on Linux. Installing platform-specific files unconditionally is incorrect and could break if the `macos/` directory is excluded from a Linux-only source tarball.

**Implementation**:
```makefile
@if [ "$$(uname -s)" = "Darwin" ]; then \
    mkdir -p $(DESTDIR)$(datadir)/unicornscan; \
    $(INSTALL) -m 644 macos/unicornscan-listener.sb $(DESTDIR)$(datadir)/unicornscan/unicornscan-listener.sb; \
    $(INSTALL) -m 644 macos/unicornscan-sender.sb $(DESTDIR)$(datadir)/unicornscan/unicornscan-sender.sb; \
fi
```

---

### D3: Commit uncommitted v0.4.52 working tree changes

**Finding**: Two files have substantive unstaged modifications:
- `debian/unicornscan-alicorn` — macOS path detection fix (verifies Homebrew path contains unicornscan before using it; falls back to `/usr/local/` for DMG installs)
- `macos/dmg/postinstall` — adds config file permissions (chmod 644), database password generation, GeoIP database download

**Decision**: Commit both as part of the v0.4.52 release.

**Rationale**: Both contain intentional v0.4.52 hardening work. The maintainer tested the DMG postinstall script end-to-end on a clean macOS arm64 system — the happy path (fresh install with no prior unicornscan installation) works correctly. The Alicorn script was tested in the same environment.

**Known gap**: The postinstall script does not handle upgrade scenarios cleanly. If a user has a prior Homebrew installation and then installs via DMG, the script can get confused by preexisting running instances and conflicting paths. Prior-install detection is deferred to a future release.

---

### D4: Purge binary blobs from git history

**Finding**: Multiple binary files are tracked in git, bloating every clone:
- `unicornscan-0.4.44.tar.gz` (11MB) — stale release tarball
- `unicornscan-0.4.45.tar.gz` (11MB) — stale release tarball
- `data/geoip/dbip-asn-lite.mmdb` (9MB) — orphaned GeoIP database
- `data/geoip/dbip-country-lite.mmdb` (7MB) — orphaned GeoIP database

Total: ~38MB of dead weight. The GeoIP databases under `data/geoip/` are never referenced by any code, Makefile, or install target — the application searches system paths (`/usr/share/GeoIP/`, `/var/lib/GeoIP/`, Homebrew prefix) on both Linux and macOS, and the `unicornscan-geoip-update` script downloads fresh databases to those system paths at install time.

**Note**: `docs/unicornscan_intro.mp4` (49MB) remains in the repo intentionally — it has sentimental value. The `libs/*.tar.gz` files (~1MB total) remain because the build system extracts and compiles them as fallback dependencies when system libraries are not available.

**Decision**: Full history purge using `git filter-repo`, followed by force push.

**Rationale**: `git rm` alone only removes from the working tree — the blobs remain in history forever. Since the project is pre-release and the maintainer does not consider existing clones or forks (5 exist) a constraint, a clean history rewrite is the better long-term choice. This must be done *before* the v0.4.52 tag is created. Branch protection is off; force push will not be blocked.

**Risk**: Rewrites commit SHAs. Anyone with existing clones must re-clone. Accepted by maintainer.

**Implementation**:
```bash
git filter-repo \
    --path unicornscan-0.4.44.tar.gz \
    --path unicornscan-0.4.45.tar.gz \
    --path data/geoip/dbip-asn-lite.mmdb \
    --path data/geoip/dbip-country-lite.mmdb \
    --invert-paths
git push --force
```

No separate `git rm` step is needed — `filter-repo` erases the files from all commits, including the current HEAD.

---

### D5: Fix support URL in DMG README.txt

**Finding**: `macos/dmg/README.txt:112` contains `https://github.com/unicornscan/unicornscan` which returns 404.

**Decision**: Update to `https://github.com/robertelee78/unicornscan`.

**Rationale**: The canonical repository URL used in `configure.ac`, the Homebrew formula, and all packaging is `robertelee78/unicornscan`. Shipping a 404 support link in the DMG installer is unacceptable.

---

### D6: DMG is intentionally Apple Silicon (arm64) only

**Finding**: `build-dmg.sh:631` hardcodes `hostArchitectures="arm64"` and `preinstall:19` sets `REQUIRED_ARCH="arm64"`. Intel Macs cannot install the DMG.

**Decision**: Accepted as intentional. Document in release notes.

**Rationale**: Unicornscan on macOS is arm64 only. Intel Macs are not a supported platform.

**Rejected alternative**: Universal DMG supporting both arm64 and x86_64. Rejected because Intel Macs are not a target platform.

---

### D7: Fix Alicorn status message port (5433 → 5432)

**Finding**: `debian/unicornscan-alicorn:535` displays `postgresql://localhost:${ALICORN_PG_PORT:-5433}/unicornscan` but the Docker Compose maps PostgreSQL to port 5432. The `ALICORN_PG_PORT` variable is never set anywhere.

**Decision**: Change the default from 5433 to 5432.

**Rationale**: The incorrect port in the status message would cause users to fail when attempting manual PostgreSQL connections using the displayed URL. The port 5433 appears to be a leftover from earlier conflict-avoidance logic that was subsequently reverted to standard port 5432 (commit `2baa44a`).

---

### D8: Delete stale v0.5.0 git tag

**Finding**: The project was renumbered from v0.5.0 to v0.4.52 (commit `29cfc0c`), but the `v0.5.0` tag still exists locally and on the remote.

**Decision**: Delete the tag from both local and remote.

**Rationale**: The version number v0.5.0 was incorrect — this release adds macOS platform support without new features, warranting a patch-level bump from v0.4.51 to v0.4.52, not a minor version bump. The stale tag creates confusion for anyone browsing tags or releases. v0.5.0 will be used for a future release that includes actual new features.

**Implementation**:
```bash
git tag -d v0.5.0
git push origin :refs/tags/v0.5.0
```

---

### D9: Gitignore cleanup and stale artifact removal

**Finding**: Several directories and patterns are not in `.gitignore`:
- `_bmad/` and `_bmad-output/` (local development tooling)
- `packages/` (contains stale `unicornscan-0.5.0-macos-arm64.dmg`)
- `data/geoip/` (orphaned GeoIP databases — never referenced by code)
- `libs/fake/` and `libs/libltdl/` (build artifacts created by `make`, cleaned by `make clean`)
- `*.tar.gz`, `*.dmg`, and `*.mmdb` patterns (binary artifacts)

**Decision**: Bundle into one cleanup commit:
1. Add `_bmad/`, `_bmad-output/`, `packages/`, `data/geoip/`, `libs/fake/`, `*.tar.gz`, `*.dmg`, `*.mmdb` to `.gitignore`
2. Delete `packages/unicornscan-0.5.0-macos-arm64.dmg`

**Note**: `libs/libltdl/` is already cleaned by `make clean` (`rm -rf libltdl`) but should be in `.gitignore` to prevent accidental commits of build output. The `libs/*.tar.gz` files (`libdnet-1.10.tar.gz`, `libltdl.tar.gz`, `libpcap-0.9.4.tar.gz`) must NOT be gitignored — they are checked-in build dependencies extracted by `libs/Makefile.in` when system libraries are unavailable.

**Rationale**: Binary artifacts and local tooling outputs should never be committed. The stale v0.5.0 DMG has the wrong version and should not ship.

---

### D10: Add v0.4.52 entry to HISTORY.md

**Finding**: `HISTORY.md` last entry covers "Modernization (December 2025)" with no mention of macOS support, Apple Silicon, Homebrew formula, DMG installer, sandbox profiles, or any v0.4.52 work.

**Decision**: Add a v0.4.52 section documenting macOS Apple Silicon platform support.

**Rationale**: HISTORY.md is the user-facing changelog. A release that adds an entirely new platform deserves a clear entry so users understand what changed.

---

## Execution Sequence

The ordering matters due to the git history rewrite (D4):

```
Phase 1: Code Fixes (before any commits)
  1. D1 + D2: Fix Makefile.in sandbox install (Darwin-only + sender.sb)
  2. D5: Fix README.txt support URL
  3. D7: Fix port 5433 → 5432
  4. D10: Add HISTORY.md v0.4.52 entry

Phase 2: Commit All Changes
  5. D3: Stage and commit the two previously-modified files
  6. Commit all Phase 1 fixes
  7. D9: Gitignore cleanup + stale artifact removal commit

Phase 3: History Rewrite
  8. D4: git filter-repo to purge tarballs and GeoIP databases from history
  9. Force push to origin/main

Phase 4: Tag and Release
  10. D8: Delete stale v0.5.0 tag (local + remote)
  11. Create v0.4.52 tag
  12. Push tag
  13. Download tarball from GitHub, compute sha256
  14. Update macos/unicornscan.rb with real sha256
  15. Commit sha256 update, push

Phase 5: Homebrew Tap Update
  16. Copy updated macos/unicornscan.rb to robertelee78/homebrew-unicornscan
  17. Push tap update (replaces stale v0.5.0 formula)
```

**Note on Phase 3**: No separate `git rm` step is needed before `filter-repo`. The filter-repo command erases the specified files from all commits in history, including HEAD. The gitignore additions in step 7 prevent re-addition after the rewrite.

**Note on Phase 5**: The `homebrew-unicornscan` tap currently points to the stale v0.5.0 tag. Since no users are currently aware of the Homebrew install method, timing is not critical, but the tap must be updated before v0.4.52 is announced.

---

## Items Explicitly Not Addressed (Deferred)

These were flagged by the swarm review as low-severity warnings, not requiring action for v0.4.52:

| Item | Reason for Deferral |
|------|-------------------|
| `echo -e` in `src/Makefile.in:63` | Only affects test output formatting, not build |
| `-export-dynamic` linker flag portability | Libtool 2.4+ handles translation; confirmed working |
| `launchctl load/unload` deprecation | Still functional through macOS 15; migrate in future release |
| `error` string leak in `arch.c:280` | One-time leak on sandbox compile failure; process exits soon after |
| Sender sandbox hard-failure continues | Intentional graceful degradation per code comment. This is separate from D1: D1 fixes the missing file (sandbox never attempted); this item concerns `sandbox_apply()` returning -1 after successful compilation. The sender logs a warning and continues scanning unsandboxed. |
| Sandbox `(allow network*)` breadth | Required for BPF operations; macOS sandbox language limitation |
| Sandbox resolv.conf symlink rules | Both profiles include `(literal "/etc/resolv.conf")` but the real file is at `/private/var/run/resolv.conf` (symlink chain). The sandbox denies the read. Not blocking: DNS resolution runs in the unsandboxed master process, not in the sender or listener. The rules are dead code — cleanup only. |
| `alicorn/package.json` version `0.0.0` | Private package, never published; cosmetic only |
| Bundled libpcap 0.9.4 age | Only used as fallback when system libpcap not found |
| DMG postinstall prior-install detection | Postinstall script does not detect or handle prior Homebrew installations. Can cause confusion with conflicting running instances and paths. Happy path (clean install) tested and working. |

---

## Consequences

### Positive
- macOS sender sandbox will actually function, achieving security parity with Linux chroot
- Repository shrinks by ~38MB for all future clones (tarballs + orphaned GeoIP databases)
- Clean version history with no stale tags or version references
- Users get correct support URL and connection strings

### Negative
- Force push after history rewrite requires existing clones (and 5 forks) to re-clone
- sha256 update requires a post-tag commit (formula sha256 can only be computed after the tag exists)
- `homebrew-unicornscan` tap must be updated separately after tagging

### Neutral
- Intel Macs are not a supported platform (arm64 only, intentional scope decision)
- Several low-severity warnings deferred to future releases
