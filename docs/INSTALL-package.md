# Installing Unicornscan from Packages

## 1.1 Introduction

Unicornscan is an asynchronous stateless network stimulus delivery/response recording tool designed for scalable, high-speed network reconnaissance. This guide describes how to install unicornscan from pre-built packages (`.deb` or `.rpm`) on Linux distributions.

**Supported distributions:**

- Debian 11+ (Bullseye and later)
- Ubuntu 22.04+ (Jammy and later)
- Fedora 39+
- RHEL/Rocky/AlmaLinux 9+

If you prefer to compile from source, see the [INSTALL-source.md](INSTALL-source.md) file.

## 1.2 Quick Install

[VERSION_BADGE]

Download the appropriate package from the GitHub Releases page:

<https://github.com/robertelee78/unicornscan/releases>

Then install with a single command:

| Distribution   | Command                                              |
|----------------|------------------------------------------------------|
| Debian/Ubuntu  | `sudo apt install ./unicornscan_VERSION_amd64.deb`   |
| Fedora/RHEL    | `sudo dnf install ./unicornscan-VERSION.x86_64.rpm`  |

That's it! The package manager handles all dependencies, and Linux capabilities are set automatically so you can scan without root privileges.

## 1.3 Package Installation

### 1.3.1 Debian/Ubuntu

1. Download the `.deb` package from GitHub Releases:

   ```install-wget-deb
   ```

2. Install the package (`apt` automatically resolves dependencies):

   ```install-apt
   ```

   Runtime dependencies are installed automatically via the package manager. Key libraries include **libpcap**, **libdumbnet**, and **libltdl**.

   **Recommended packages** (installed if available):

   - `docker.io` - For the Alicorn web interface
   - `docker-compose-v2` - Docker Compose for web stack
   - `libmaxminddb0` - GeoIP database support

3. Verify the installation:

   ```bash
   unicornscan -V
   unicornscan -h
   ```

### 1.3.2 Fedora/RHEL/Rocky Linux

1. On RHEL/Rocky/AlmaLinux 9, enable EPEL first (provides libdnet):

   ```bash
   sudo dnf install epel-release
   ```

2. Download the `.rpm` package from GitHub Releases:

   ```install-wget-rpm
   ```

3. Install the package (`dnf` automatically resolves dependencies):

   ```install-dnf
   ```

   Runtime dependencies are installed automatically via the package manager. Key libraries include **libpcap**, **libdnet**, **libtool-ltdl**, and **libcap**.

   **Recommended packages** (install manually for full functionality):

   - `libmaxminddb` - GeoIP database support
   - `postgresql-libs` - Required if using the pgsqldb module for database export

4. Verify the installation:

   ```bash
   unicornscan -V
   unicornscan -h
   ```

### 1.3.3 Verifying Non-Root Scanning

The package automatically sets Linux capabilities on the binaries, allowing you to scan without root privileges. Test this with:

```bash
unicornscan 127.0.0.1:22
```

If this works without `sudo`, capabilities are properly configured. If you see a permission error, you may need to:

- Log out and back in (group membership changes require re-login)
- Run with `sudo` as a fallback
- Check if you're in a container or restricted environment

**Note:** File capabilities require a real filesystem (ext4, btrfs, xfs). They do not work on tmpfs or in some container environments.

## 1.4 Post-Installation Setup

The package installation automatically performs these actions:

- Creates a `unicornscan` system group for shared configuration access
- Sets `/etc/unicornscan/modules.conf` permissions to 660 (root:unicornscan)
- Adds the installing user to the unicornscan group (re-login required)
- Sets Linux capabilities on binaries for non-root operation

### 1.4.1 Adding Users to the Configuration Group

To allow additional users to modify unicornscan configuration:

```bash
sudo usermod -aG unicornscan USERNAME
```

The user must log out and back in for the group membership to take effect.

### 1.4.2 Enabling GeoIP Lookups (Optional)

For geographic information in scan results (country, city, ASN), download the free DB-IP Lite databases:

```bash
sudo unicornscan-geoip-update
```

This downloads approximately 130 MB of GeoIP data and enables location lookups in scan output and the web interface. The databases are updated monthly; re-run the command periodically for fresh data.

## 1.5 Installed File Locations

The package installs files in standard system locations:

### Binaries

| Path                                | Description                          |
|-------------------------------------|--------------------------------------|
| `/usr/bin/unicornscan`              | Main scanner                         |
| `/usr/bin/fantaip`                  | ARP proxy for source spoofing        |
| `/usr/bin/unibrow`                  | Packet browser utility               |
| `/usr/bin/unicfgtst`                | Configuration test utility           |
| `/usr/bin/us`                       | Shortcut symlink to unicornscan      |
| `/usr/bin/unicornscan-alicorn`          | Web UI management script (Debian)    |
| `/usr/bin/unicornscan-geoip-update` | GeoIP database updater               |

### Helper Executables

| Path                                  | Description      |
|---------------------------------------|------------------|
| `/usr/libexec/unicornscan/unisend`    | Sender daemon    |
| `/usr/libexec/unicornscan/unilisten`  | Listener daemon  |

### Configuration

| Path                              | Description                          |
|-----------------------------------|--------------------------------------|
| `/etc/unicornscan/unicorn.conf`   | Main configuration                   |
| `/etc/unicornscan/modules.conf`   | Module settings (including database) |
| `/etc/unicornscan/payloads.conf`  | Protocol payloads                    |
| `/etc/unicornscan/ports.txt`      | Port/service mappings                |
| `/etc/unicornscan/oui.txt`        | MAC vendor database                  |

### Libraries and Modules

| Path                              | Description                                   |
|-----------------------------------|-----------------------------------------------|
| `/usr/lib/unicornscan/modules/`   | Loadable modules (osdetect, pgsqldb, etc.)    |

### Runtime State

| Path                  | Description               |
|-----------------------|---------------------------|
| `/var/unicornscan/`   | Runtime data (root only)  |

### Man Pages

| Path                                  |
|---------------------------------------|
| `/usr/share/man/man1/unicornscan.1`   |
| `/usr/share/man/man1/fantaip.1`       |
| `/usr/share/man/man1/unibrow.1`       |

### Documentation

| Path                          | Description                    |
|-------------------------------|--------------------------------|
| `/usr/share/doc/unicornscan/` | README and other documentation |

### Web Interface

| Path                                | Description                                            |
|-------------------------------------|--------------------------------------------------------|
| `/usr/share/unicornscan/alicorn/`   | Docker Compose and static files (installed by package) |
| `/var/lib/unicornscan/alicorn/`     | Runtime data and credentials (created on first start)  |

## 1.6 Getting the Web UI Working

Unicornscan includes a modern web interface called **Alicorn** for viewing and analyzing scan results. It requires Docker and PostgreSQL for data storage.

### 1.6.1 Prerequisites

Install Docker on your system:

**Debian/Ubuntu (from distribution packages):**

```bash
sudo apt install docker.io docker-compose-v2
sudo usermod -aG docker $USER
```

**Or use Docker's official installation script:**

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

**Fedora/RHEL/Rocky:**

```bash
sudo dnf install docker docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Log out and back in for the Docker group change to take effect.

### 1.6.2 Starting the Web UI

Start the web interface with:

```bash
sudo unicornscan-alicorn start
```

This will:

- Generate a secure random 32-character database password
- Save credentials to `/var/lib/unicornscan/alicorn/.env` (for Docker)
- Update `/etc/unicornscan/modules.conf` with the password (for unicornscan)
- Start PostgreSQL in a Docker container
- Initialize the database schema
- Start the PostgREST API and Alicorn web server

The password is stored in three places:

| Location                                  | Purpose                            |
|-------------------------------------------|------------------------------------|
| `/var/lib/unicornscan/alicorn/.env`       | Docker Compose environment         |
| `/var/lib/unicornscan/alicorn/.db_password` | Plain text for easy retrieval    |
| `/etc/unicornscan/modules.conf`           | Unicornscan pgsqldb module config  |

Because `modules.conf` is auto-configured, you can run scans with database export immediately without specifying connection parameters:

```bash
unicornscan -epgsqldb 192.168.1.0/24
```

To retrieve the password later:

```bash
unicornscan-alicorn password
```

### 1.6.3 Accessing the Web UI

Open your browser to: <http://localhost:31337>

The web interface shows:

- Scan history and results
- Host and port statistics
- OS fingerprinting results
- Network topology visualization

### 1.6.4 Storing Scan Results

For remote databases or manual configuration, override the `modules.conf` settings with command-line parameters:

```bash
unicornscan -epgsqldb,host=dbserver.example.com,user=alicorn,pass=SECRET,db=unicornscan \
    192.168.1.0/24
```

You can combine `pgsqldb` with other modules like OS detection:

```bash
unicornscan -epgsqldb,osdetect 192.168.1.0/24
```

### 1.6.5 Managing the Web UI

Common `unicornscan-alicorn` commands:

| Command                      | Description              |
|------------------------------|--------------------------|
| `unicornscan-alicorn start`      | Start containers         |
| `unicornscan-alicorn stop`       | Stop containers          |
| `unicornscan-alicorn status`     | Show container status    |
| `unicornscan-alicorn password`   | Display database password|
| `unicornscan-alicorn logs`       | View container logs      |

## 1.7 Upgrading

To upgrade unicornscan when a new package version is released:

**Debian/Ubuntu:**

```bash
wget https://github.com/.../unicornscan_NEWVERSION_amd64.deb
sudo apt install ./unicornscan_NEWVERSION_amd64.deb
```

**Fedora/RHEL:**

```bash
wget https://github.com/.../unicornscan-NEWVERSION.x86_64.rpm
sudo dnf upgrade ./unicornscan-NEWVERSION.x86_64.rpm
```

The package upgrade preserves your configuration files and restores Linux capabilities on the new binaries.

## 1.8 Uninstalling

To remove unicornscan:

**Debian/Ubuntu:**

```bash
sudo apt remove unicornscan          # Keep configuration files
sudo apt purge unicornscan           # Remove everything
```

**Fedora/RHEL:**

```bash
sudo dnf remove unicornscan
```

To also remove the web UI data:

```bash
sudo unicornscan-alicorn stop
sudo rm -rf /var/lib/unicornscan/alicorn
```

## 1.9 Troubleshooting

### 1.9.1 "Permission denied" when scanning

If you see permission errors when running unicornscan as a non-root user:

1. Verify you're in the unicornscan group:

   ```bash
   groups | grep unicornscan
   ```

2. If not, add yourself and re-login:

   ```bash
   sudo usermod -aG unicornscan $USER
   logout
   ```

3. Check if capabilities are set:

   ```bash
   getcap /usr/bin/unicornscan
   ```

4. If capabilities are missing (common in containers), use `sudo`:

   ```bash
   sudo unicornscan target
   ```

### 1.9.2 "libdnet not found" on RHEL/Rocky

On RHEL-based systems, libdnet is in EPEL. Enable it first:

```bash
sudo dnf install epel-release
sudo dnf install libdnet
```

### 1.9.3 Web UI won't start

1. Verify Docker is running:

   ```bash
   sudo systemctl status docker
   ```

2. Check if ports are in use:

   ```bash
   ss -tlnp | grep -E '31337|5432'
   ```

3. View container logs:

   ```bash
   unicornscan-alicorn logs
   ```

## 1.10 Getting Help

For usage examples and detailed documentation:

| Resource      | Location                              |
|---------------|---------------------------------------|
| Quick help    | `unicornscan -h`                      |
| Man page      | `man unicornscan`                     |
| README        | `/usr/share/doc/unicornscan/README.md`|

For support and bug reports:

| Resource       | URL                                                      |
|----------------|----------------------------------------------------------|
| Website        | <http://www.unicornscan.org/>                            |
| GitHub Issues  | <https://github.com/robertelee78/unicornscan/issues>     |
