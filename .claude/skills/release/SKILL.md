---
name: release
version: 1.0.0
description: Create unicornscan releases with proper version bumping across all files
category: project
tags: [release, versioning, unicornscan]
author: Robert E. Lee
---

# Unicornscan Release Skill

Create releases for unicornscan with proper version management.

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
# Update configure.ac
sed -i 's/\[0\.4\.33\]/[0.4.34]/' configure.ac

# Update rpm spec
sed -i 's/Version:.*0\.4\.33/Version:        0.4.34/' rpm/unicornscan.spec

# Prepend to debian/changelog (use editor or script)
```

### Step 3: Commit Version Bump
```bash
git add configure.ac rpm/unicornscan.spec debian/changelog
git commit -m "Bump package versions to X.Y.Z"
```

### Step 4: Create Tag and Release
```bash
git tag vX.Y.Z
git push && git push --tags

gh release create vX.Y.Z \
  --title "vX.Y.Z - Release Title" \
  --generate-notes
```

## Common Mistakes to Avoid

1. **Forgetting configure.ac** - This is the PRIMARY version source
2. **Wrong email in configure.ac** - Must be `robert@unicornscan.org`
3. **Creating tag before version bump commit** - Tag points to wrong commit
4. **Not pushing before tagging** - Tag and release out of sync

## Quick Release Command

For a complete release, run these in order:

```bash
VERSION="0.4.34"
PREV_VERSION="0.4.33"

# 1. Update all version files
sed -i "s/\[$PREV_VERSION\]/[$VERSION]/" configure.ac
sed -i "s/Version:.*$PREV_VERSION/Version:        $VERSION/" rpm/unicornscan.spec
# (manually update debian/changelog)

# 2. Commit
git add configure.ac rpm/unicornscan.spec debian/changelog
git commit -m "Bump package versions to $VERSION"

# 3. Push, tag, release
git push
git tag v$VERSION
git push --tags
gh release create v$VERSION --generate-notes
```
