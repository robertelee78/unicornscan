# Installing Unicornscan

## 1.1 Introduction

Unicornscan is an asynchronous stateless network stimulus delivery/response
recording tool designed for scalable, high-speed network reconnaissance. This
guide describes how to compile and install unicornscan from source code on
POSIX platforms. Use the table of contents to skip directly to sections that
seem relevant to you.

If you prefer pre-built packages (.deb or .rpm), see the [INSTALL-package.md](INSTALL-package.md) file.

### 1.1.1 Requirements

Unicornscan requires the following libraries to be installed on your system:

- **libpcap** - Packet capture library
- **libdnet** - Low-level networking (called libdumbnet on Debian/Ubuntu)
- **libltdl** - Dynamic library loading (part of libtool)
- **flex/bison** - Parser generators (build-time only)

Optional dependencies for additional features:

- **libpq** - PostgreSQL client library (for database export)
- **libmaxminddb** - MaxMind GeoIP database library (for country/city lookup)

## 1.2 Installing the Prerequisites

Use your distribution's package manager to install the required build
dependencies. Modern distributions provide all necessary libraries.

### 1.2.1 Debian/Ubuntu

```bash
sudo apt install build-essential autoconf automake libtool pkg-config \
    libpcap-dev libdumbnet-dev libltdl-dev flex bison
```

Optional for PostgreSQL support (recommended for the Web UI):

```bash
sudo apt install libpq-dev
```

Optional for GeoIP country/city lookups:

```bash
sudo apt install libmaxminddb-dev
```

### 1.2.2 Fedora/RHEL/Rocky

On Rocky/RHEL 9, you may need to enable EPEL and CRB first:

```bash
sudo dnf install epel-release
sudo dnf config-manager --set-enabled crb
```

Then install the build dependencies:

```bash
sudo dnf install gcc make autoconf automake libtool pkg-config \
    libpcap-devel libdnet-devel libtool-ltdl-devel flex bison
```

Optional for PostgreSQL support (recommended for the Web UI):

```bash
sudo dnf install postgresql-devel
```

Optional for GeoIP country/city lookups:

```bash
sudo dnf install libmaxminddb-devel
```

### 1.2.3 Arch Linux

```bash
sudo pacman -S base-devel autoconf automake libtool pkgconf \
    libpcap libdnet flex bison
```

Optional for PostgreSQL support:

```bash
sudo pacman -S postgresql-libs
```

Optional for GeoIP lookups:

```bash
sudo pacman -S libmaxminddb
```

### 1.2.4 Library Name Differences

Note that the low-level networking library has different package names:

| Distribution   | Build Package     | Runtime Package |
|----------------|-------------------|-----------------|
| Debian/Ubuntu  | libdumbnet-dev    | libdumbnet1     |
| Fedora/RHEL    | libdnet-devel     | libdnet         |
| Arch Linux     | libdnet           | libdnet         |

Both refer to the same library (libdnet by Dug Song). The Debian name change
was made to avoid confusion with the DECnet library.

## 1.3 Installing Unicornscan

### 1.3.1 Downloading Unicornscan

Source code and releases are available on GitHub:

<https://github.com/robertelee78/unicornscan>

To download the latest release tarball, visit the Releases page:

<https://github.com/robertelee78/unicornscan/releases>

Or clone the Git repository for the development version:

```bash
git clone https://github.com/robertelee78/unicornscan.git
```

### 1.3.2 Compiling from Source

Source installation is designed to be a painless process. The build system
auto-detects most configuration options. Here are the steps for a default
install:

1. **Extract the downloaded tarball** (skip if using git clone):

   ```bash
   tar jxvf unicornscan-VERSION.tar.bz2
   cd unicornscan-VERSION
   ```

2. **If building from a git clone**, generate the configure script:

   ```bash
   autoreconf -fi
   ```

3. **Configure the build system**:

   ```bash
   ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var
   ```

   This configures unicornscan to install in standard system locations:
   - Binaries in `/usr/bin/`
   - Libraries in `/usr/lib/unicornscan/`
   - Configuration in `/etc/unicornscan/`
   - Runtime state in `/var/unicornscan/`

   Run `./configure --help` to see all available options (described below).

4. **Build unicornscan**:

   ```bash
   make
   ```

   > **Note:** GNU Make is required. On BSD-derived systems, this is often
   > installed as `gmake`. If `make` returns errors like "Need an operator", try
   > running `gmake` instead.

5. **As a privileged user, install unicornscan**:

   ```bash
   sudo make install
   ```

6. **Enable non-root scanning** by setting Linux capabilities:

   ```bash
   sudo make setcap
   ```

   This sets the following capabilities on the binaries:
   - **cap_net_raw** - Create raw sockets for packet capture/injection
   - **cap_net_admin** - Network interface configuration
   - **cap_sys_chroot** - Chroot for privilege dropping
   - **cap_setuid/gid** - UID/GID operations for privilege separation

   > **Note:** File capabilities require a real filesystem (ext4, btrfs, xfs).
   > They do not work on tmpfs or in some container environments.

7. **Congratulations!** Unicornscan is now installed. Run it with `-h` for help:

   ```bash
   unicornscan -h
   ```

   You can now scan without sudo:

   ```bash
   unicornscan target.com
   ```

8. **To uninstall**:

   ```bash
   sudo make uninstall
   ```

### 1.3.3 Configure Options

Common configuration options:

| Option                        | Description                                      |
|-------------------------------|--------------------------------------------------|
| `--prefix=DIR`                | Installation prefix (default: `/usr/local`)      |
| `--sysconfdir=DIR`            | System config directory (default: `$prefix/etc`) |
| `--localstatedir=DIR`         | Variable state directory (default: `$prefix/var`)|
| `--with-pgsql`                | Enable PostgreSQL database output support        |
| `--with-pgsql=DIR`            | Specify PostgreSQL installation directory        |
| `--with-listen-user=USER`     | User for unprivileged listener (default: nobody) |
| `--enable-debug-support`      | Enable debugging functions (not for production)  |

Example for a local user installation:

```bash
./configure --prefix=$HOME/.local/unicornscan
make && make install
```

## 1.4 Compilation Problems

If you run into trouble compiling, you can:

- Check the GitHub Issues: <https://github.com/robertelee78/unicornscan/issues>
- Open a new issue with your error message and system details

**Common issues:**

| Error Message             | Solution                                              |
|---------------------------|-------------------------------------------------------|
| "libdnet not found"       | On Debian/Ubuntu, the package is called `libdumbnet-dev` |
| "libltdl not found"       | Install `libltdl-dev` (Debian) or `libtool-ltdl-devel` (Fedora) |
| "Need an operator"        | Use `gmake` instead of `make` on BSD systems          |

## 1.5 Getting the Web UI Working

Unicornscan includes a modern web interface called **Alicorn** for viewing and
analyzing scan results. It requires Docker and PostgreSQL for data storage.

### 1.5.1 Prerequisites

Install Docker on your system. The easiest method is the convenience script:

```bash
curl -fsSL https://get.docker.com | sh
```

Ensure your user can run docker commands:

```bash
sudo usermod -aG docker $USER
```

Log out and back in for the group change to take effect.

### 1.5.2 Starting the Web UI

If you installed unicornscan with `--with-pgsql` and the binaries have been
installed, use the web management command:

```bash
sudo unicornscan-web start
```

This will:
- Generate a secure random 32-character password
- Save credentials to `/opt/unicornscan-web/.env` (for Docker)
- Update `/etc/unicornscan/modules.conf` with the password (for unicornscan)
- Start PostgreSQL in a Docker container
- Initialize the database schema
- Start the PostgREST API and Alicorn web server

The password is stored in three places:
- `/opt/unicornscan-web/.env` - Docker Compose environment
- `/opt/unicornscan-web/.db_password` - Plain text for easy retrieval
- `/etc/unicornscan/modules.conf` - Unicornscan pgsqldb module config

Because `modules.conf` is auto-configured, you can run scans with database
export immediately without specifying connection parameters:

```bash
unicornscan -epgsqldb 192.168.1.0/24
```

To retrieve the password later:

```bash
unicornscan-web password
```

### 1.5.3 Accessing the Web UI

Open your browser to: <http://localhost:31337>

The web interface shows:
- Scan history and results
- Host and port statistics
- OS fingerprinting results
- Network topology visualization

### 1.5.4 Storing Scan Results

For remote databases or manual configuration, override the `modules.conf`
settings with command-line parameters:

```bash
unicornscan -epgsqldb,host=dbserver.example.com,user=alicorn,pass=SECRET,db=unicornscan \
    192.168.1.0/24
```

You can combine `pgsqldb` with other modules like OS detection:

```bash
unicornscan -epgsqldb,osdetect 192.168.1.0/24
```

### 1.5.5 Managing the Web UI

Common `unicornscan-web` commands:

| Command                    | Description            |
|----------------------------|------------------------|
| `unicornscan-web start`    | Start containers       |
| `unicornscan-web stop`     | Stop containers        |
| `unicornscan-web status`   | Show container status  |
| `unicornscan-web password` | Display database password |
| `unicornscan-web logs`     | View container logs    |

### 1.5.6 GeoIP Location Data

For geographic information in scan results (country, city, ASN), download
free GeoIP databases:

```bash
sudo unicornscan-geoip-update
```

This downloads DB-IP Lite databases (~130 MB) which provide:
- City and region names
- Country information
- Latitude/longitude coordinates
- ASN and ISP data

The databases are updated monthly. Re-run the command periodically to get
fresh data.

## 1.6 Getting Help

For usage examples and detailed documentation:

| Resource      | Location                |
|---------------|-------------------------|
| Quick help    | `unicornscan -h`        |
| Man page      | `man unicornscan`       |
| README        | [README.md](README.md)  |

For support and bug reports:

- **Website:** <http://www.unicornscan.org/>
- **GitHub Issues:** <https://github.com/robertelee78/unicornscan/issues>
