# Bug Report Template for bugs.kali.org

**Category:** Tool Upgrade / New Tool Requests

---

## Tool Information

**Name:** unicornscan
**Current Version in Kali:** 0.4.7-1kali7
**Requested Version:** 0.4.42
**Homepage:** http://www.unicornscan.org/
**Download:** https://github.com/robertelee78/unicornscan/releases/tag/v0.4.42
**Author:** Robert E. Lee (maintainer), Jack Louis (original author)
**License:** GPL-2.0-or-later

---

## Request: Include unicornscan in kali-linux-default metapackage

### Summary

Unicornscan 0.4.42 is a major update that transforms it from a command-line-only scanner into a full reconnaissance platform with the **Alicorn Web UI** for visualizing results.

### Why unicornscan should be in kali-linux-default

1. **Unique Capabilities**
   - Only asynchronous stateless scanner with built-in web visualization
   - ASN/CIDR hierarchical grouping shows network ownership at a glance
   - Multi-scan comparison helps track network changes over time

2. **Complementary to Existing Tools**
   - Fills gap between nmap (feature-rich but slower) and masscan (fast but minimal output)
   - Web UI provides visualization that other scanners lack
   - PostgreSQL integration enables complex queries on scan data

3. **Modern Architecture**
   - React/TypeScript frontend with responsive design
   - Docker-based services for easy deployment
   - REST API via PostgREST for automation/integration
   - GeoIP integration for geographic context

4. **Active Maintenance**
   - Regular updates (35 versions since last Kali update)
   - Responsive maintainer (robert@unicornscan.org)
   - Modern build system with GitHub Actions CI

### Quick Demo

```bash
# Install (if MR merged)
sudo apt install unicornscan

# Start web UI
unicornscan-web start

# Run scan with database output
unicornscan -mT 192.168.1.0/24:1-1000 -epgsqldb

# View results
firefox http://localhost:31337
```

### Comparison with Similar Tools

| Tool | Speed | Output Formats | Web UI | ASN/GeoIP |
|------|-------|----------------|--------|-----------|
| unicornscan 0.4.42 | Fast | DB, PCAP, XML | Yes | Yes |
| nmap | Medium | XML, JSON | No | Plugin |
| masscan | Very Fast | JSON, XML | No | No |
| zmap | Very Fast | CSV | No | No |

### Resource Requirements

- **Disk:** ~50 MB installed + ~150 MB GeoIP databases (optional)
- **Memory:** Base scanner uses minimal RAM; web UI needs Docker
- **Docker:** Required for Alicorn web UI (4 containers)

### Activity

- **Original release:** 2004 (Jack Louis)
- **Revived/maintained:** 2024-present (Robert E. Lee)
- **Last release:** January 2026 (v0.4.42)
- **Commit frequency:** Weekly updates

### How to Use

```bash
# Basic TCP SYN scan
unicornscan -mT 192.168.1.1:1-65535

# UDP scan
unicornscan -mU 192.168.1.1:53,161,500

# ARP discovery
unicornscan -mA 192.168.1.0/24

# Compound ARP+TCP scan
unicornscan -mA+T 192.168.1.0/24:22,80,443

# With PostgreSQL output (for web UI)
unicornscan -mT 10.0.0.0/8:22,80,443 -epgsqldb
```

### Packaging Status

- **GitLab MR:** https://gitlab.com/kalilinux/packages/unicornscan/-/merge_requests/1
- **Package builds successfully:** Yes
- **All tests pass:** Yes

---

**Submitted by:** Robert E. Lee <robert@unicornscan.org>
