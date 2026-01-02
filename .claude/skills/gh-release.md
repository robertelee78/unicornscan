---
name: gh-release
description: Create or redo a GitHub release for unicornscan. GitHub Actions builds all deb/rpm packages automatically.
user_invocable: true
---

# GitHub Release for Unicornscan

## CRITICAL: DO NOT BUILD PACKAGES LOCALLY

GitHub Actions (`.github/workflows/release.yml`) builds all packages automatically when a release is created. Never waste time building deb/rpm locally.

## Workflow

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

### To create a new version release:

```bash
# 1. Update version in debian/changelog and rpm/unicornscan.spec
# 2. Commit and push
git add debian/changelog rpm/unicornscan.spec
git commit -m "Update packaging for X.Y.Z release"
git push origin main

# 3. Create release
gh release create vX.Y.Z --title "vX.Y.Z" --notes "Release notes"

# 4. Verify
gh run list --limit 1
gh release view vX.Y.Z
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

1. **DON'T** run `dpkg-buildpackage` locally for releases
2. **DON'T** create v0.4.25-2, v0.4.25-3 releases - just redo v0.4.25
3. **DO** delete the old release/tag first when redoing
4. **DO** let GitHub Actions do the building
