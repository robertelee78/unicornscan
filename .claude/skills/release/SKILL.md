---
name: release
version: 1.1.0
description: Create unicornscan releases with proper version bumping across all files
category: project
tags: [release, versioning, unicornscan, github]
author: Robert E. Lee
user_invocable: true
---

# Unicornscan Release Skill

Create releases for unicornscan with proper version management.

## CRITICAL: DO NOT BUILD PACKAGES LOCALLY

GitHub Actions (`.github/workflows/release.yml`) builds all packages automatically when a release is created. Never waste time building deb/rpm locally.

## Version Files Checklist

**ALL of these files MUST be updated when creating a release:**

1. **configure.ac** (line 6) - Primary source of truth
   ```
   AC_INIT([unicornscan], [X.Y.Z], [robert@unicornscan.org])
   ```

2. **rpm/unicornscan.spec** (line 4)
   ```
   Version:        X.Y.Z
   ```

3. **debian/changelog** (prepend new entry at top)
   ```
   unicornscan (X.Y.Z-1) unstable; urgency=medium

     * Release notes here

    -- Robert E. Lee <robert@unicornscan.org>  Day, DD Mon YYYY HH:MM:SS +TZTZ
   ```

## Release Process

### Step 1: Determine New Version
```bash
# Get current version
grep "AC_INIT" configure.ac
git tag --sort=-v:refname | head -1
```

### Step 2: Update ALL Version Files
```bash
VERSION="X.Y.Z"
PREV_VERSION="X.Y.W"

# Update configure.ac
sed -i "s/\[$PREV_VERSION\]/[$VERSION]/" configure.ac

# Update rpm spec
sed -i "s/Version:.*$PREV_VERSION/Version:        $VERSION/" rpm/unicornscan.spec

# Prepend to debian/changelog (manually or script)
```

### Step 3: Commit Version Bump
```bash
git add configure.ac rpm/unicornscan.spec debian/changelog
git commit -m "Bump package versions to $VERSION"
git push origin main
```

### Step 4: Create Release (GitHub Actions builds packages)
```bash
gh release create v$VERSION --title "v$VERSION" --generate-notes

# Verify build started
gh run list --limit 1

# When complete, verify assets
gh release view v$VERSION
```

## Redo an Existing Release

If you need to re-release the same version:

```bash
VERSION="X.Y.Z"

# 1. Delete existing release and tag
gh release delete v$VERSION --yes
git push origin --delete v$VERSION
git tag -d v$VERSION

# 2. Push any pending commits
git push origin main

# 3. Create new release
gh release create v$VERSION --title "v$VERSION" --generate-notes

# 4. Verify
gh run list --limit 1
gh release view v$VERSION
```

## Packages Built Automatically

- Rocky 9 RPM
- Fedora 40 RPM
- Fedora 41 RPM
- Debian Bookworm deb
- Debian Bullseye deb
- Ubuntu 22.04 deb
- Ubuntu 24.04 deb

## Common Mistakes to Avoid

1. **Forgetting configure.ac** - This is the PRIMARY version source, DEBs get version from here
2. **Wrong email in configure.ac** - Must be `robert@unicornscan.org`
3. **Creating tag before version bump commit** - Tag points to wrong commit
4. **Not pushing before tagging** - Tag and release out of sync
5. **Building packages locally** - Let GitHub Actions do it
6. **Creating v0.4.25-2, v0.4.25-3** - Just redo v0.4.25 instead
