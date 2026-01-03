---
name: gh-release
description: Create or redo a GitHub release for unicornscan. GitHub Actions builds all deb/rpm packages automatically.
user_invocable: true
---

# GitHub Release for Unicornscan

## CRITICAL: DO NOT BUILD PACKAGES LOCALLY

GitHub Actions (`.github/workflows/release.yml`) builds all packages automatically when a release is created. Never waste time building deb/rpm locally.

## Version Files (ALL THREE MUST BE UPDATED)

1. **`configure.ac`** - Line 6: `AC_INIT([unicornscan], [X.Y.Z], ...)`
2. **`debian/changelog`** - Add new entry at top with version
3. **`rpm/unicornscan.spec`** - `Version:` field and `%changelog` entry

## Workflow

### To create a new version release:

```bash
# 1. Update version in ALL THREE files:
#    - configure.ac: AC_INIT([unicornscan], [X.Y.Z], ...)
#    - debian/changelog: Add new entry at top
#    - rpm/unicornscan.spec: Version field + %changelog entry

# 2. Commit and push
git add configure.ac debian/changelog rpm/unicornscan.spec
git commit -m "Update packaging for X.Y.Z release"
git push origin main

# 3. Create release (GitHub Actions builds packages)
gh release create vX.Y.Z --title "vX.Y.Z" --notes "Release notes"

# 4. Verify build started
gh run list --limit 1

# 5. When complete, verify all assets have correct version
gh release view vX.Y.Z
```

### To redo an existing release (e.g., v0.4.25):

```bash
# 1. Delete existing release and tag
gh release delete v0.4.25 --yes
git push origin --delete v0.4.25
git tag -d v0.4.25

# 2. Push any pending commits
git push origin main

# 3. Create new release (GitHub Actions builds packages)
gh release create v0.4.25 --title "v0.4.25" --notes "Release notes here"

# 4. Check build status
gh run list --limit 1

# 5. Verify assets when complete
gh release view v0.4.25
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

1. **DON'T** forget to update `configure.ac` - DEBs get version from here!
2. **DON'T** run `dpkg-buildpackage` locally for releases
3. **DON'T** create v0.4.25-2, v0.4.25-3 releases - just redo v0.4.25
4. **DO** update ALL THREE version files before creating release
5. **DO** delete the old release/tag first when redoing
6. **DO** let GitHub Actions do the building
