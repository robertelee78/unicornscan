# Kali Linux Package for Unicornscan

This directory contains the Debian packaging files for submitting to Kali Linux.

## Version

- **Target version:** 0.4.42-0kali1
- **Current Kali version:** 0.4.7-1kali7 (35 versions behind)
- **Kali GitLab:** https://gitlab.com/kalilinux/packages/unicornscan

## What's New in 0.4.42

### Major Features
- **Alicorn Web UI** - React-based interface for visualizing scan results
- **ASN/CIDR grouping** - Hierarchical network topology view
- **Multi-scan comparison** - Diff exports in JSON/CSV/Markdown
- **Compound scan modes** - `-mA+T`, `-mA+U` for ARP-filtered scanning
- **GeoIP integration** - Live IP geolocation via DB-IP Lite databases
- **PostgreSQL support** - Full schema with PostgREST REST API

### Docker Services (4 containers)
1. **alicorn-postgres** - PostgreSQL 16 for scan data storage
2. **alicorn-postgrest** - REST API to PostgreSQL
3. **alicorn-geoip** - GeoIP lookup service (port 3001)
4. **alicorn-web** - Nginx serving React frontend (port 31337)

## Submission Process

### 1. Fork the Kali Repository

```bash
# Fork on GitLab first, then clone
git clone git@gitlab.com:YOUR_USERNAME/unicornscan.git
cd unicornscan
git remote add upstream https://gitlab.com/kalilinux/packages/unicornscan.git
```

### 2. Import New Upstream

```bash
# Create new branch
git checkout -b update-0.4.42 kali/master

# Import upstream release
gbp import-orig --uscan
# Or manually if needed:
# wget https://github.com/robertelee78/unicornscan/archive/refs/tags/v0.4.42.tar.gz
# gbp import-orig ../unicornscan_0.4.42.orig.tar.gz
```

### 3. Replace debian/ Directory

```bash
# Remove old debian files
rm -rf debian/*

# Copy new packaging files
cp -r /path/to/unicornscan/kali/debian/* debian/
```

### 4. Build and Test

```bash
# Build package
gbp buildpackage --git-builder=sbuild --git-export=WC

# Run lintian
lintian -i ../unicornscan_0.4.42-0kali1_*.changes

# Test installation
sudo dpkg -i ../unicornscan_0.4.42-0kali1_*.deb
sudo apt -f install

# Test functionality
unicornscan -mT localhost:22,80,443
sudo unicornscan-geoip-update
unicornscan-web start
# Open http://localhost:31337
```

### 5. Submit Merge Request

```bash
git add debian/
git commit -m "New upstream version 0.4.42"
git push origin update-0.4.42
```

Then create MR at: https://gitlab.com/kalilinux/packages/unicornscan/-/merge_requests/new

Use the template in `MR_DESCRIPTION.md`.

## Requesting Default Inclusion

After the MR is merged, file a bug at https://bugs.kali.org to request inclusion in `kali-linux-default` metapackage.

Use the template in `BUG_REPORT.md`.

## Files

| File | Purpose |
|------|---------|
| `debian/control` | Package metadata and dependencies |
| `debian/rules` | Build instructions |
| `debian/changelog` | Version history |
| `debian/copyright` | License information |
| `debian/postinst` | Post-install script (setcap, groups) |
| `debian/unicornscan-web` | Docker management script |
| `debian/conffiles` | Protected configuration files |
| `debian/watch` | Upstream version tracking |
| `MR_DESCRIPTION.md` | GitLab merge request template |
| `BUG_REPORT.md` | bugs.kali.org request template |

## Maintainer

Robert E. Lee <robert@unicornscan.org>
