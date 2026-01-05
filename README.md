# Unicornscan

**Unicorns are fast.**

[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg)](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html)

Asynchronous stateless network stimulus/response tool for scalable, high-speed reconnaissance.

[![Watch Introduction Video](https://img.youtube.com/vi/_h2_np0_bIg/maxresdefault.jpg)](https://www.youtube.com/watch?v=_h2_np0_bIg)

## Quick Start

```bash
# TCP SYN scan
unicornscan 192.168.1.0/24

# Fast scan with immediate output
unicornscan -r 1000 -I 10.0.0.0/24:22,80,443

# UDP with DNS payloads
unicornscan -mU 192.168.1.0/24:53

# OS detection
unicornscan -e osdetect -I 192.168.1.1:1-1024
```

## Install

**From packages** (recommended):
```bash
# Debian/Ubuntu
sudo apt install ./unicornscan_*.deb

# Fedora/RHEL/Rocky
sudo dnf install ./unicornscan-*.rpm
```
Download from [GitHub Releases](https://github.com/robertelee78/unicornscan/releases).

**From source**:
```bash
./configure --prefix=/usr --sysconfdir=/etc
make && sudo make install && sudo make setcap
```

See [docs/INSTALL-package.md](docs/INSTALL-package.md) or [docs/INSTALL-source.md](docs/INSTALL-source.md) for prerequisites and details.

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/GETTING_STARTED.md) | Modes, options, compound scans, fantaip, clusters |
| [Alicorn Web UI](docs/GETTING_STARTED_ALICORN.md) | Visualization, scan comparison, topology |
| [Install from Package](docs/INSTALL-package.md) | .deb/.rpm installation |
| [Install from Source](docs/INSTALL-source.md) | Build dependencies, compile, web UI setup |
| [Cluster Mode](docs/cluster/CLUSTER_MODE_GUIDE.md) | Distributed scanning with remote drones |
| `man unicornscan` | Full reference |

## Features

- **25,000+ PPS** - Separate sender/listener processes
- **TCP/UDP/ARP/ICMP** - SYN, ACK, FIN, custom flags, protocol payloads
- **OS Fingerprinting** - p0f v3 signatures, 50+ OS types
- **Source Spoofing** - Phantom IP via `fantaip` ARP proxy
- **Compound Modes** - ARP discovery → TCP/UDP (eliminates ARP delays)
- **Distributed** - Cluster mode with remote senders/listeners
- **Non-root** - Linux capabilities, no sudo required

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Master Process                           │
│  (coordination, workunit distribution, result aggregation)  │
└────────────────────┬───────────────────┬────────────────────┘
                     │                   │
         ┌───────────▼────────┐   ┌──────▼──────────────┐
         │   Sender (unisend) │   │ Listener (unilisten)│
         │                    │   │                     │
         │ • Packet crafting  │   │ • libpcap capture   │
         │ • Rate control     │   │ • Response parsing  │
         │ • OS emulation     │   │ • OS fingerprinting │
         └────────────────────┘   └─────────────────────┘
```

## Project History

Created by **Jack C. Louis** at Dyad Security (2004-2007). Modernized December 2025 for GCC 14/15 and current Linux distributions. See [HISTORY.md](HISTORY.md).

## License

GNU General Public License v2.0 - see [COPYING](COPYING).

---

*"Unicorns are fast! :)"*
