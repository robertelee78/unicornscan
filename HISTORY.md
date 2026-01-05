# Unicornscan Project History

## Origin (2004-2007)

**Unicornscan** was created by **Jack Louis** while working at Rapture Security (later acquired by Outpost24). It represented a novel approach to network scanning:

- **Asynchronous Architecture**: Separate sender and receiver processes communicating via IPC
- **Stimulus-Based Design**: Send packets, record responses independently
- **High Performance**: Capable of millions of packets per second on appropriate hardware
- **OS Fingerprinting**: Integrated p0f v2 for passive OS detection
- **Modular Design**: Plugin architecture for payloads, output, and reporting

### Key Innovations

1. **Userland TCP/IP Stack**: Built packets from scratch using libdnet, bypassing kernel limitations
2. **Stateless Scanning**: No connection tracking overhead
3. **Flexible Targeting**: Rich syntax for port ranges, CIDR notation, host lists
4. **ARP Spoofing Integration**: fantaip tool for IP aliasing via ARP responses

### Final Original Release

**Version 0.4.7** was released in December 2007. This was Jack Louis's last official release before the project went dormant.

---

## Dormancy (2008-2024)

For over 15 years, unicornscan remained unchanged. During this time:

- Compilers evolved (GCC 4.x → 14/15)
- Linux distributions updated default configurations
- Security practices changed (non-root scanning, capabilities)
- Dependencies evolved (libdnet → libdumbnet packaging)

The code still worked on older systems but required increasingly complex workarounds on modern distributions.

---

## Modernization (December 2025)

The modernization effort began with a simple goal: **make unicornscan build and run on modern Linux systems while preserving all original functionality**.

### Phase 1: Build System Fixes

- Fixed GCC 14/15 strict prototype requirements
- Updated autotools configuration for modern libtool
- Added libdumbnet compatibility (Debian/Ubuntu package name)
- Fixed implicit function declarations

### Phase 2: Runtime Compatibility

- Added NIC offload handling (GRO/LRO disable/restore)
- Fixed pcap capture issues with modern network drivers
- Added Linux capabilities support for non-root operation
- Created .deb and .rpm packages with proper setcap

### Phase 3: Documentation

- Comprehensive README with build instructions
- Dependencies documentation for multiple distributions
- Research documentation on codebase architecture

### Ongoing Development

The project is now actively maintained with goals including:

- p0f v3 fingerprint database integration
- IPv6 support enhancements
- Modern output formats (JSON)
- Enhanced UDP service detection
- Proxy/SOCKS support for stealth scanning

---

## In Memoriam

This modernization effort honors **Jack C. Louis** and his innovative work on unicornscan. The asynchronous, stimulus-based architecture he designed remains elegant and effective nearly two decades later.

*For Jack.*

---

## Version History

| Version | Date | Notes |
|---------|------|-------|
| 0.4.7 | December 2007 | Final release by Jack Louis |
| 0.4.8 | December 2025 | GCC 14/15 compatibility, build fixes |
| 0.4.9 | December 2025 | NIC offload handling, pcap fixes |
| 0.4.10 | December 2025 | Package setcap, documentation |

---

## Contributing

Unicornscan is now a living project welcoming contributions. See the repository for current development activity and open issues.

**Repository**: https://github.com/robertelee78/unicornscan
