# Update unicornscan to 0.4.42

## Summary

Major update to unicornscan from v0.4.7 to v0.4.42 (35 version jump).

This release introduces the **Alicorn Web UI** - a modern React-based interface for visualizing scan results, along with significant improvements to the core scanner.

## Changes

### New Features in 0.4.42
- **Alicorn Web UI** - React/TypeScript interface for scan visualization
- **ASN/CIDR hierarchical grouping** - Network topology view with AS organization labels
- **Multi-scan comparison** - Diff exports in JSON, CSV, and Markdown formats
- **Compound scan modes** - `-mA+T`, `-mA+U` for ARP-filtered TCP/UDP scanning
- **MAC address capture** - For local network target identification
- **GeoIP API service** - Live IP lookups using DB-IP Lite databases
- **PostgreSQL cloud support** - Full schema with PostgREST REST API

### Docker Services (4 containers)
- **alicorn-postgres** (port 5432) - PostgreSQL 16 for scan data
- **alicorn-postgrest** (port 3000) - REST API to database
- **alicorn-geoip** (port 3001) - GeoIP lookup service
- **alicorn-web** (port 31337) - Nginx serving React frontend

### Packaging Changes
- Added `docker.io` and `docker-compose-v2` as dependencies
- Added `libmaxminddb-dev` and `libpq-dev` to build dependencies
- Added `autoconf`, `automake`, `libtool` for autoreconf
- Added post-install capability setting for non-root operation
- Added `unicornscan-web` management script
- Added `unicornscan-geoip-update` for DB-IP database downloads
- Updated homepage to unicornscan.org
- Full Alicorn stack installed to `/opt/unicornscan-web/`

## Testing

- [x] Builds successfully with sbuild
- [x] Passes lintian with no errors
- [x] CLI scanner works: `unicornscan -mT localhost:22,80,443`
- [x] Capabilities set properly (non-root scanning works)
- [x] Docker services start: `unicornscan-web start`
- [x] Web UI accessible at http://localhost:31337
- [x] GeoIP update works: `sudo unicornscan-geoip-update`
- [x] Scan results appear in Alicorn web UI

## Upstream

- Repository: https://github.com/robertelee78/unicornscan
- Release: https://github.com/robertelee78/unicornscan/releases/tag/v0.4.42
- Homepage: http://www.unicornscan.org/

## Checklist

- [x] Follows Kali packaging standards
- [x] Standards-Version 4.6.2
- [x] debhelper-compat (= 13)
- [x] Proper Vcs-Git and Vcs-Browser
- [x] Copyright file updated
- [x] Watch file for upstream tracking
