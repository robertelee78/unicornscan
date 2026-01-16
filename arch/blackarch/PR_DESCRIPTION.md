# Update unicornscan to 0.4.42

## Summary

Major update to unicornscan from v0.4.10 to v0.4.42 (32 version jump).

## Changes

### New Features in 0.4.42
- **Alicorn Web UI** - React-based interface for visualizing scan results
- **Compound scan modes** (-mA+T, -mA+U) for ARP-filtered scanning
- **MAC address capture** for local network targets
- **ASN/CIDR grouping** in topology view
- **Multi-scan comparison** with diff exports
- **GeoIP API service** for live IP lookups
- **PostgreSQL cloud support** via PostgREST

### PKGBUILD Improvements
- Added `autoreconf -fi` in prepare() - fixes build from git source
- Added Alicorn Web UI installation to /opt/unicornscan-alicorn/
- Added management scripts: `unicornscan-alicorn`, `unicornscan-geoip-update`
- Added install script with setcap for non-root operation
- Added aarch64 architecture support
- Added makedepends: autoconf, automake, libtool, postgresql
- Added optdepends: docker, docker-compose, geoip-database
- Added blackarch-recon group

### Files Changed
- `packages/unicornscan/PKGBUILD` - Complete rewrite
- `packages/unicornscan/unicornscan.install` - New file

## Testing

- [x] Builds successfully with makepkg -s
- [x] Passes namcap validation
- [x] Installs correctly
- [x] Capabilities set properly (non-root scanning works)
- [x] unicornscan-alicorn starts Docker containers
- [x] Scans work: TCP SYN, UDP, ARP modes

## Upstream

- Repository: https://github.com/robertelee78/unicornscan
- Release: https://github.com/robertelee78/unicornscan/releases/tag/v0.4.42

## Checklist

- [x] pkgcheck passed
- [x] Follows BlackArch PKGBUILD style
- [x] Two-space indentation
- [x] Proper groups assigned
- [x] License file installed
