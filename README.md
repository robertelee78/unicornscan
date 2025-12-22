# Unicornscan

**Unicorns are fast.**

[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg)](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html)

Unicornscan is an asynchronous stateless network stimulus delivery/response recording tool designed for scalable, high-speed network reconnaissance and security auditing.

## Features

- **Asynchronous Architecture**: Separate sender/listener processes enable packet rates of 25,000+ PPS
- **Multiple Scan Modes**: TCP (SYN, ACK, FIN, NULL, custom flags), UDP, ARP, ICMP, etc
- **OS Fingerprinting**: Integrated p0f v3 signatures with 50+ embedded OS fingerprints
- **Source Spoofing**: Full phantom IP support with ARP proxy tool (`fantaip`)
- **Protocol Payloads**: HTTP, DNS, SIP, UPnP/SSDP, NTALK for service-specific probing
- **Distributed Scanning**: Cluster mode with remote sender/listener drones
- **Modular Design**: Pluggable payload, output, and report modules
- **OS Personality Emulation**: Emulate 12 different OS TCP/IP stacks when scanning
- **Linux Capabilities**: Run without root using file capabilities

## Dependencies

### Build Dependencies

These are only needed when compiling from source:

**Debian/Ubuntu:**
```bash
sudo apt install build-essential autoconf automake libtool pkg-config \
    libpcap-dev libdumbnet-dev libltdl-dev flex bison
```

**Fedora/RHEL/Rocky:**
```bash
# Rocky/RHEL 9 requires EPEL and CRB:
# sudo dnf install epel-release && sudo dnf config-manager --set-enabled crb

sudo dnf install gcc make autoconf automake libtool pkg-config \
    libpcap-devel libdnet-devel libtool-ltdl-devel flex bison
```

**Arch Linux:**
```bash
sudo pacman -S base-devel autoconf automake libtool pkgconf \
    libpcap libdnet flex bison
```

**Optional build dependencies:**

| Feature | Debian/Ubuntu | Fedora/RHEL | Arch | Configure Flag |
|---------|---------------|-------------|------|----------------|
| GeoIP (country lookup) | `libmaxminddb-dev` | `libmaxminddb-devel` | `libmaxminddb` | auto-detected |
| PostgreSQL/Supabase | `libpq-dev` | `postgresql-devel` | `postgresql-libs` | `--with-pgsql` |
| MySQL | `libmysqlclient-dev` | `mysql-devel` | `mariadb-libs` | `--with-mysql` |

### Runtime Dependencies

These are needed to run the compiled binaries:

**Debian/Ubuntu:**
```bash
sudo apt install libpcap0.8 libdumbnet1 libltdl7 libcap2-bin
# Optional for GeoIP country lookup:
sudo apt install libmaxminddb0
# Optional for database export:
sudo apt install libpq5
```

**Fedora/RHEL/Rocky:**
```bash
sudo dnf install libpcap libdnet libtool-ltdl libcap
# Optional for GeoIP country lookup:
sudo dnf install libmaxminddb
# Optional for database export:
sudo dnf install postgresql-libs
```

**Arch Linux:**
```bash
sudo pacman -S libpcap libdnet libtool libcap
# Optional for GeoIP country lookup:
sudo pacman -S libmaxminddb
# Optional for database export:
sudo pacman -S postgresql-libs
```

**Note:** When installing from .deb or .rpm packages, runtime dependencies are installed automatically.

### Library Name Differences

The low-level networking library has different names across distributions:
- **Debian/Ubuntu**: `libdumbnet-dev` (build) / `libdumbnet1` (runtime)
- **Fedora/RHEL/Arch**: `libdnet-devel` (build) / `libdnet` (runtime)

Both refer to the same library (libdnet by Dug Song).

## Quick Start

### Installation from Source

```bash
# Install build dependencies (see Dependencies section above)

# Build
./configure --prefix=/usr --sysconfdir=/etc
make
sudo make install

# Enable non-root scanning (Linux)
sudo make setcap
```

### Installation from Packages

Pre-built packages are available for Debian, Ubuntu, Fedora, and Rocky Linux:

```bash
# Download from GitHub Releases
# https://github.com/robertelee78/unicornscan/releases

# Debian/Ubuntu
sudo dpkg -i unicornscan_*.deb

# Fedora/RHEL/Rocky
sudo rpm -i unicornscan-*.rpm
```

Packages automatically set Linux capabilities for non-root operation.

### Basic Usage

```bash
# TCP SYN scan (default)
unicornscan 192.168.1.0/24

# Fast scan with immediate output
unicornscan -r 1000 -I 10.0.0.0/24:22,80,443

# UDP scan with DNS payloads
unicornscan -mU 192.168.1.0/24:53

# Enable OS detection
unicornscan -e osdetect -I 192.168.1.1:1-1024

# Scan with specific OS fingerprint emulation
unicornscan -W 9 target.com:80   # Emulate Linux 5/6
```

## Scan Modes

| Flag | Mode | Description |
|------|------|-------------|
| `-mT` | TCP SYN | Default. Send SYN packets, detect SYN+ACK |
| `-mTsf` | TCP Connect | Full 3-way handshake |
| `-mTSFPUA` | Custom TCP | Any combination of flags |
| `-mU` | UDP | Protocol-aware UDP scanning |
| `-mA` | ARP | Layer 2 host discovery |

### TCP Flag Modifiers

Use with `-mT`: `S`=SYN, `A`=ACK, `F`=FIN, `R`=RST, `P`=PSH, `U`=URG, `E`=ECE, `C`=CWR

Lowercase clears the flag. Examples:
- `-mTSF` = SYN+FIN (XMAS-like)
- `-mTsA` = ACK only (no SYN)
- `-mTsFPU` = FIN+PSH+URG (XMAS scan)

## OS Fingerprinting

### Passive Detection (Response Analysis)

Enable the osdetect module to analyze TCP/IP stack characteristics of responding hosts:

```bash
unicornscan -e osdetect -I target.com:80
```

Uses embedded p0f v3 signatures to identify:
- Linux (2.x, 3.x, 4.x, 5.x, 6.x)
- Windows (XP, 7, 8, 10, 11, Server variants)
- macOS / iOS
- FreeBSD, OpenBSD, NetBSD
- Cisco IOS
- Android
- And 40+ more OS variants

### Active Emulation (Sending)

Emulate different OS TCP/IP stacks when sending probes:

```bash
unicornscan -W <id> target
```

| ID | OS Fingerprint |
|----|----------------|
| 0 | Cisco IOS (default) |
| 1 | OpenBSD |
| 2 | Windows XP |
| 3 | p0f SYN signature |
| 4 | FreeBSD |
| 5 | nmap signature |
| 6 | Linux 2.4/2.6 |
| 7 | Strange TCP |
| 8 | Windows 10/11 |
| 9 | Linux 5/6 |
| 10 | macOS |
| 11 | Android |

## Source Spoofing (Phantom IP)

Scan from a spoofed source address using the `fantaip` ARP proxy:

**Terminal 1** - Start ARP responder:
```bash
fantaip -i eth0 192.168.1.250
```

**Terminal 2** - Scan with spoofed source:
```bash
unicornscan -s 192.168.1.250 -I target.com:80
```

The `fantaip` tool responds to ARP requests for the phantom IP, allowing responses to be captured.

## Key Options

```
-r, --pps <rate>       Packets per second (default: 300)
-R, --repeats <n>      Repeat scan n times for accuracy
-I, --immediate        Display results as they arrive
-E, --proc-errors      Process ICMP errors and RST packets
-e, --enable-module    Enable modules (e.g., osdetect, pgsqldb)
-i, --interface        Specify network interface
-s, --source-addr      Source address ('r' for random)
-t, --ip-ttl           TTL value or range (e.g., 64 or 32-64)
-p, --ports            Port specification (e.g., 1-1024, 80,443, 'a' for all)
-w, --safefile         Save captured packets to PCAP file
-v, --verbose          Increase verbosity (-vv, -vvv for more)
-H, --do-dns           Resolve hostnames in output
-l, --logfile          Write output to file
```

## Configuration

Main configuration: `$PREFIX/etc/unicornscan/unicorn.conf`

```
global {
    pps:            300;
    repeats:        1;
    delaytype:      tsc;    # tsc, gtod, or sleep
    sourceport:     -1;     # -1 = random
    defaultpayload: true;
}
```

## Cloud Database (Supabase)

Store scan results in [Supabase](https://supabase.com) cloud PostgreSQL:

```bash
# Quick setup - schema auto-creates on first connection
unicornscan --supabase-url https://xxxxx.supabase.co \
            --supabase-db-password YOUR_DB_PASSWORD \
            -e pgsql -I 192.168.1.0/24

# Or use environment variables
export SUPABASE_URL="https://xxxxx.supabase.co"
export SUPABASE_DB_PASSWORD="your_database_password"
unicornscan -e pgsql 10.0.0.0/24
```

See [Supabase Integration Guide](docs/supabase-integration.md) for full documentation.

## Building with Optional Features

See the [Dependencies](#dependencies) section for required packages.

```bash
# With PostgreSQL output support (required for Supabase)
# Requires: libpq-dev (Debian) / postgresql-devel (Fedora) / postgresql-libs (Arch)
./configure --with-pgsql

# With MySQL output support
# Requires: libmysqlclient-dev (Debian) / mysql-devel (Fedora) / mariadb-libs (Arch)
./configure --with-mysql

# GeoIP support (libmaxminddb for .mmdb databases)
# Requires: libmaxminddb-dev (Debian) / libmaxminddb-devel (Fedora) / libmaxminddb (Arch)
# See README.geoip for database sources (GeoLite2, DB-IP, IPLocate.io)

# With SELinux policy
./configure --enable-selinux

# Local user installation
./configure --prefix=$HOME/.local/unicornscan
make && make install
sudo make setcap
```

## Running Without Root

On Linux, use file capabilities instead of running as root:

```bash
# After installation, run once:
sudo make setcap

# Now scan without sudo:
unicornscan target.com
```

This sets the following capabilities on the binaries:
- `cap_net_raw` - Create raw sockets
- `cap_net_admin` - Network interface configuration
- `cap_sys_chroot` - Chroot for privilege dropping
- `cap_setuid/cap_setgid` - UID/GID operations

**Note**: Capabilities require a real filesystem (ext4, btrfs, xfs), not tmpfs.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Master Process                           │
│  (coordination, workunit distribution, result aggregation)  │
└────────────────────┬───────────────────┬────────────────────┘
                     │                   │
         ┌───────────▼───────┐   ┌───────▼───────────┐
         │   Sender (unisend) │   │ Listener (unilisten)│
         │                    │   │                     │
         │ • Packet crafting  │   │ • libpcap capture   │
         │ • Rate control     │   │ • Response parsing  │
         │ • OS emulation     │   │ • OS fingerprinting │
         └────────────────────┘   └─────────────────────┘
```

## Payload Modules

Protocol-specific payloads for service detection:

| Module | Port | Protocol | Description |
|--------|------|----------|-------------|
| http | 80 | TCP | HTTP GET request |
| rdns | 53 | UDP | Reverse DNS query |
| sip | 5060 | UDP | SIP OPTIONS probe |
| upnp | 1900 | UDP | SSDP M-SEARCH discovery |
| ntalk | 518 | UDP | Talk protocol |

## Output Formats

Default output shows open ports:
```
TCP open 192.168.1.1:22  ttl 64
TCP open 192.168.1.1:80  ttl 64
```

Custom format with `-o`:
```bash
unicornscan -o "%h:%p %T ttl %t" target
```

Format specifiers: `%h`=host, `%p`=port, `%T`=type, `%t`=TTL, `%s`=service

## Examples

```bash
# Comprehensive LAN scan with OS detection
unicornscan -e osdetect -I -r 500 192.168.1.0/24:1-10000

# Stealth scan with low TTL
unicornscan -t 32 -r 100 target.com:80,443

# Save results to PCAP for analysis
unicornscan -w scan.pcap -I target.com:1-1024

# Scan from specific source port (DNS)
unicornscan -B 53 target.com:1-1024

# Process firewall responses
unicornscan -E -I target.com:1-65535
```

## Project History

Unicornscan was created by **Jack Louis** at Rapture Security (later Outpost24) as a high-performance asynchronous network scanner. It pioneered stimulus-based scanning with separate send/receive processes.

| Milestone | Date | Details |
|-----------|------|---------|
| Initial Development | 2004-2006 | Original implementation by Jack Louis |
| Final Original Release | December 2007 | Version 0.4.7 |
| Modernization Begins | December 2025 | GCC 14/15 compatibility, build fixes |
| Active Maintenance | 2025-present | Ongoing development and enhancements |

**Current Version**: See `configure.ac` for the authoritative version number.

The modernization effort preserves all original functionality while enabling the tool to build and run on current Linux distributions. See [HISTORY.md](HISTORY.md) for detailed project history.

- **License**: GNU General Public License v2+

## Files

```
$PREFIX/
├── bin/
│   ├── unicornscan      # Main scanner
│   ├── fantaip          # ARP proxy for spoofing
│   └── unibrow          # Packet browser utility
├── libexec/unicornscan/
│   ├── unisend          # Sender daemon
│   └── unilisten        # Listener daemon
├── lib/unicornscan/modules/
│   ├── osdetect.so      # OS fingerprinting
│   ├── http.so          # HTTP payload
│   └── ...              # Other modules
└── etc/unicornscan/
    ├── unicorn.conf     # Main configuration
    ├── payloads.conf    # Protocol payloads
    ├── ports.txt        # Port/service mappings
    └── oui.txt          # MAC vendor database
```

## See Also

- `man unicornscan` - Full manual page
- `docs/Unicornscan-Getting_Started.pdf` - Original getting started guide
- [Cluster Mode Guide](docs/cluster/CLUSTER_MODE_GUIDE.md) - Distributed scanning setup
- [Supabase Integration Guide](docs/supabase-integration.md) - Cloud database setup

## License

GNU General Public License v2.0 - see [COPYING](COPYING) for details.

---

*"Unicorns are fast! :)"*
