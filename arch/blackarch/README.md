# BlackArch PKGBUILD for Unicornscan

This directory contains the Arch Linux PKGBUILD for submitting to BlackArch.

## Files

- `PKGBUILD` - Package build script
- `unicornscan.install` - Post-install/upgrade/remove hooks

## Version

- **Package version:** 0.4.42
- **Previous BlackArch version:** 0.4.10 (32 versions behind)

## Changes from BlackArch's Current PKGBUILD

1. **Added `autoreconf -fi`** in prepare() - Required for building from git
2. **Added Alicorn Web UI** - Full web interface for visualizing scan results
3. **Added management scripts** - `unicornscan-alicorn`, `unicornscan-geoip-update`
4. **Added capabilities** - Post-install setcap for non-root operation
5. **Added aarch64 support** - ARM64 build configuration
6. **Added makedepends** - `autoconf`, `automake`, `libtool`, `postgresql`
7. **Added optdepends** - Docker, geoip-database
8. **Added install script** - Post-install user guidance

## Building Locally

```bash
# Clone this repo
git clone https://github.com/robertelee78/unicornscan.git
cd unicornscan/arch/blackarch

# Build package
makepkg -si

# Or in clean chroot (recommended)
extra-x86_64-build
```

## Submitting to BlackArch

1. Fork https://github.com/BlackArch/blackarch
2. Replace `packages/unicornscan/PKGBUILD` with this version
3. Add `packages/unicornscan/unicornscan.install`
4. Run pkgcheck: `pkgcheck PKGBUILD`
5. Submit PR

## Testing

```bash
# Verify PKGBUILD syntax
namcap PKGBUILD

# Build and check package
makepkg -s
namcap unicornscan-*.pkg.tar.zst

# Test installation
sudo pacman -U unicornscan-*.pkg.tar.zst

# Verify capabilities
getcap /usr/bin/unicornscan
# Expected: cap_net_raw,cap_net_admin,cap_sys_chroot,cap_setuid,cap_setgid=ep

# Test scan
unicornscan -mT localhost:22,80,443
```

## Maintainer

Robert E. Lee <robert@unicornscan.org>
