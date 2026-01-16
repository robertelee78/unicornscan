%global debug_package %{nil}

Name:           unicornscan
Version:        0.4.43
Release:        1%{?dist}
Summary:        Asynchronous stateless TCP/UDP network scanner

License:        GPL-2.0-or-later
URL:            https://github.com/robertelee78/unicornscan
Source0:        %{name}-%{version}.tar.gz

BuildRequires:  autoconf
BuildRequires:  automake
BuildRequires:  libtool
BuildRequires:  libtool-ltdl-devel
BuildRequires:  libpcap-devel
BuildRequires:  libdnet-devel
BuildRequires:  postgresql-devel
BuildRequires:  libmaxminddb-devel
BuildRequires:  flex
BuildRequires:  bison
BuildRequires:  gcc
BuildRequires:  make

Requires:       libpcap
Requires:       libdnet
Requires:       libtool-ltdl
Requires:       libcap
Requires:       postgresql-libs
Recommends:     libmaxminddb
Suggests:       docker
Suggests:       docker-compose
Suggests:       nodejs

%description
Unicornscan is an asynchronous network scanner designed for
scalable, accurate, and flexible port scanning. It separates
the sending and receiving of packets into separate processes
for maximum performance.

Features include:
 - Asynchronous stateless TCP scanning with full banner grabbing
 - Asynchronous UDP scanning with custom payloads
 - ARP scanning for local network discovery
 - OS fingerprinting via p0f v3 integration
 - PostgreSQL database export
 - Configurable packet rates up to millions of PPS

%prep
%setup -q

%build
autoreconf -fi
# Legacy C code has warnings that GCC 14+ treats as errors - disable all Werror
# Use optflags as base to ensure proper optimization flags on all distros
export CFLAGS="%{optflags} -Wno-error"
%configure --with-pgsql
# Disable parallel make due to dependency ordering issues in legacy Makefiles
make

%install
rm -rf %{buildroot}
make install DESTDIR=%{buildroot}

# Create var directory
mkdir -p %{buildroot}%{_localstatedir}/unicornscan

# Install GeoIP update script
install -m 755 scripts/unicornscan-geoip-update %{buildroot}%{_bindir}/

# Install unicornscan-alicorn management script
install -m 755 debian/unicornscan-alicorn %{buildroot}%{_bindir}/

# Install Alicorn Web UI to FHS paths
# Static files: /usr/share/unicornscan/alicorn
# Runtime data: /var/lib/unicornscan/alicorn (created by unicornscan-alicorn on first run)
mkdir -p %{buildroot}%{_datadir}/unicornscan/alicorn/sql
mkdir -p %{buildroot}%{_datadir}/unicornscan/alicorn/src
mkdir -p %{buildroot}%{_datadir}/unicornscan/alicorn/public
mkdir -p %{buildroot}%{_datadir}/unicornscan/alicorn/cli
mkdir -p %{buildroot}%{_sharedstatedir}/unicornscan/alicorn

# Docker configuration
install -m 644 alicorn/docker-compose.standalone.yml %{buildroot}%{_datadir}/unicornscan/alicorn/docker-compose.yml
install -m 644 alicorn/Dockerfile %{buildroot}%{_datadir}/unicornscan/alicorn/
install -m 644 alicorn/nginx.conf %{buildroot}%{_datadir}/unicornscan/alicorn/

# Build configuration
install -m 644 alicorn/package.json %{buildroot}%{_datadir}/unicornscan/alicorn/
install -m 644 alicorn/package-lock.json %{buildroot}%{_datadir}/unicornscan/alicorn/
install -m 644 alicorn/vite.config.ts %{buildroot}%{_datadir}/unicornscan/alicorn/
install -m 644 alicorn/tsconfig.json %{buildroot}%{_datadir}/unicornscan/alicorn/
install -m 644 alicorn/tsconfig.app.json %{buildroot}%{_datadir}/unicornscan/alicorn/
install -m 644 alicorn/tsconfig.node.json %{buildroot}%{_datadir}/unicornscan/alicorn/
install -m 644 alicorn/eslint.config.js %{buildroot}%{_datadir}/unicornscan/alicorn/ 2>/dev/null || :
install -m 644 alicorn/vitest.config.ts %{buildroot}%{_datadir}/unicornscan/alicorn/ 2>/dev/null || :
install -m 644 alicorn/index.html %{buildroot}%{_datadir}/unicornscan/alicorn/

# Source code (copy directories)
cp -r alicorn/src/* %{buildroot}%{_datadir}/unicornscan/alicorn/src/
cp -r alicorn/public/* %{buildroot}%{_datadir}/unicornscan/alicorn/public/

# CLI / Setup wizard
install -m 644 alicorn/cli/setup.ts %{buildroot}%{_datadir}/unicornscan/alicorn/cli/

# GeoIP API service
mkdir -p %{buildroot}%{_datadir}/unicornscan/alicorn/geoip-api
install -m 644 alicorn/geoip-api/Dockerfile %{buildroot}%{_datadir}/unicornscan/alicorn/geoip-api/
install -m 644 alicorn/geoip-api/package.json %{buildroot}%{_datadir}/unicornscan/alicorn/geoip-api/
install -m 644 alicorn/geoip-api/server.js %{buildroot}%{_datadir}/unicornscan/alicorn/geoip-api/

# PostgREST configuration
mkdir -p %{buildroot}%{_datadir}/unicornscan/alicorn/postgrest
install -m 644 alicorn/postgrest/Dockerfile %{buildroot}%{_datadir}/unicornscan/alicorn/postgrest/

# SQL schema
install -m 644 src/output_modules/database/sql/pgsql_schema.sql %{buildroot}%{_datadir}/unicornscan/alicorn/sql/

%post
# Create unicornscan group for shared config access
if ! getent group unicornscan >/dev/null 2>&1; then
    groupadd -r unicornscan 2>/dev/null && echo "Created 'unicornscan' group" || :
fi

# Set modules.conf ownership to root:unicornscan with 660 permissions
# This allows users in the unicornscan group to read/write the config
if [ -f %{_sysconfdir}/unicornscan/modules.conf ]; then
    chown root:unicornscan %{_sysconfdir}/unicornscan/modules.conf 2>/dev/null || :
    chmod 660 %{_sysconfdir}/unicornscan/modules.conf 2>/dev/null || :
fi

# Auto-add sudo user to unicornscan group
if [ -n "$SUDO_UID" ]; then
    SUDO_USER_NAME=$(getent passwd "$SUDO_UID" | cut -d: -f1)
    if [ -n "$SUDO_USER_NAME" ]; then
        if ! id -nG "$SUDO_USER_NAME" 2>/dev/null | grep -qw unicornscan; then
            usermod -aG unicornscan "$SUDO_USER_NAME" 2>/dev/null && \
            echo "Added '$SUDO_USER_NAME' to 'unicornscan' group (re-login to activate)" || :
        fi
    fi
else
    echo "Note: Run 'usermod -aG unicornscan <username>' to grant config access"
fi

# Set Linux capabilities to allow running without root
# Fails gracefully if capabilities aren't supported (SELinux, containers, etc.)
setcap 'cap_net_raw,cap_net_admin,cap_sys_chroot,cap_setuid,cap_setgid+ep' %{_bindir}/unicornscan 2>/dev/null || :
setcap 'cap_net_raw,cap_net_admin,cap_sys_chroot,cap_setuid,cap_setgid+ep' %{_bindir}/fantaip 2>/dev/null || :
setcap 'cap_net_raw,cap_net_admin,cap_sys_chroot,cap_setuid,cap_setgid+ep' %{_libexecdir}/unicornscan/unilisten 2>/dev/null || :
setcap 'cap_net_raw,cap_net_admin,cap_sys_chroot,cap_setuid,cap_setgid+ep' %{_libexecdir}/unicornscan/unisend 2>/dev/null || :
# Note: Non-root users use XDG_RUNTIME_DIR for sockets (e.g., /run/user/$UID/unicornscan/)
# The /var/unicornscan directory is only used when running as root

# Display post-install message
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              Unicornscan installed successfully!               ║"
echo "╠════════════════════════════════════════════════════════════════╣"
echo "║                                                                ║"
echo "║  RECOMMENDED: Enable GeoIP for location and network lookups:   ║"
echo "║                                                                ║"
echo "║    sudo unicornscan-geoip-update                               ║"
echo "║                                                                ║"
echo "╠════════════════════════════════════════════════════════════════╣"
echo "║                                                                ║"
echo "║  RECOMMENDED: Alicorn Web UI for visualizing scan results:     ║"
echo "║                                                                ║"
echo "║    unicornscan-alicorn start        # Start (requires Docker)  ║"
echo "║    http://localhost:31337           # Open in browser          ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

%files
%license LICENSE
%doc README
%{_bindir}/unicornscan
%{_bindir}/unibrow
%{_bindir}/fantaip
%{_bindir}/unicfgtst
%{_bindir}/us
%{_bindir}/unicornscan-geoip-update
%{_bindir}/unicornscan-alicorn
%{_libdir}/unicornscan/
%{_libexecdir}/unicornscan/
%config(noreplace) %{_sysconfdir}/unicornscan/
%{_mandir}/man1/*
%{_mandir}/man5/*
%dir %{_localstatedir}/unicornscan
%{_datadir}/unicornscan/alicorn/
%dir %{_sharedstatedir}/unicornscan/alicorn

%changelog
* Fri Jan 16 2026 Robert E. Lee <robert@unicornscan.org> - 0.4.43-1
- Packaging consistency and FHS compliance
- Standardize Alicorn paths: /usr/share/unicornscan/alicorn (static),
  /var/lib/unicornscan/alicorn (runtime)
- Fix docker-compose --env-file flag for credentials handling
- Add nodejs to RPM Suggests for development mode
- Sync Kali packaging with upstream FHS paths

* Thu Jan 16 2026 Robert E. Lee <robert@unicornscan.org> - 0.4.42-1
- Rename unicornscan-web to unicornscan-alicorn
- Standardize FHS-compliant paths across all package formats
- Add Kali Linux packaging for submission
- Fix Arch package build (zstd compression, heredoc issues)
- Add Arch Linux package support to release workflow

* Tue Jan 14 2026 Robert E. Lee <robert@unicornscan.org> - 0.4.41-1
- Enhance post-install message with GeoIP and Web UI recommendations
- Add unicornscan-geoip-update command prominently in both .deb and .rpm
- Sync RPM %post message to match debian/postinst (was missing Web UI)
- Mark both GeoIP and Alicorn Web UI as RECOMMENDED

* Mon Jan 13 2026 Robert E. Lee <robert@unicornscan.org> - 0.4.40-1
- Bump package versions

* Mon Jan 13 2026 Robert E. Lee <robert@unicornscan.org> - 0.4.39-1
- Fix RPM spec: include man5 directory for unicorn.conf.5
- The man page for unicorn.conf(5) is installed to man5/ but wasn't in %files

* Sun Jan 12 2026 Robert E. Lee <robert@unicornscan.org> - 0.4.38-1
- Bump package versions

* Sun Jan 12 2026 Robert E. Lee <robert@unicornscan.org> - 0.4.37-1
- Bump package versions

* Sat Jan 11 2026 Robert E. Lee <robert@unicornscan.org> - 0.4.36-1
- Bump package versions

* Sat Jan 11 2026 Robert E. Lee <robert@unicornscan.org> - 0.4.35-1
- Remove Claude Code/Flow files from repo (keep local)
- Added .claude/, claude-flow, CLAUDE.md to .gitignore

* Fri Jan 10 2026 Robert E. Lee <robert@unicornscan.org> - 0.4.34-1
- Add project-specific release skill with version file checklist

* Fri Jan 10 2026 Robert E. Lee <robert@unicornscan.org> - 0.4.33-1
- Update packaging for 0.4.33 release

* Thu Jan 02 2026 Robert E. Lee <robert@unicornscan.org> - 0.4.32-1
- Fix banner capture in compound mode (-mA+sf)
- S_DEFAULT_PAYLOAD flag now preserved across phase transitions
- Compound scans now properly capture SSH, FTP, and other banners

* Thu Jan 02 2026 Robert E. Lee <robert@unicornscan.org> - 0.4.31-1
- Fix banner capture in TCP connect mode (-msf)
- SYN cookie validation was incorrectly rejecting PSH+ACK packets
- Connect module's state_tbl now properly receives response data

* Thu Jan 02 2026 Robert E. Lee <robert@unicornscan.org> - 0.4.25-3
- Fix MAC capture for IP reports (remove broken subnet check)
- MAC now correctly captured from Ethernet header for all responses
- Fix TCP flags display in Alicorn frontend (use type field not flags)

* Thu Jan 02 2026 Robert E. Lee <robert@unicornscan.org> - 0.4.25-2
- Alicorn frontend fixes (16 broken windows resolved)
- Fix TCP flags using wrong IpReport field in 3 components
- Fix port history flags using wrong field (subtype->flags)
- Standardize on port_count field (deprecate open_port_count)
- Add IP-based host routing for consistency across views
- Fix N+1 query issues with optimized database methods
- Add accessible Radix tooltips replacing HTML title attributes
- Consolidate duplicate formatMac utility functions
- Fix MAC display in host tables and detail views
- Add proper null handling for optional host.ip_addr field

* Wed Jan 01 2026 Robert E. Lee <robert@unicornscan.org> - 0.4.25-1
- MAC address capture for local network targets (schema v9)
- Captures Ethernet source MAC from response packets for L2-local hosts
- New is_local_target() function detects hosts reachable without gateway
- MAC stored in uni_ipreport.eth_hwaddr column (MACADDR type)
- MAC<->IP history tracking for IP reports (like ARP scans)
- Alicorn UI displays MAC column in IP reports table
- Automatic v8->v9 migration adds eth_hwaddr column

* Wed Jan 01 2026 Robert E. Lee <robert@unicornscan.org> - 0.4.24-1
- Store target specification in database (schema v7)
- Add target_str column to uni_scans table for original command line targets
- Shows "192.168.1.0/24" or "scanme.nmap.org" in web UI
- Automatic migration from v6 schema adds column to existing databases
- Alicorn UI displays target in scan list and detail views

* Wed Dec 31 2025 Robert E. Lee <robert@unicornscan.org> - 0.4.22-1
- unicornscan-alicorn generates random password on first start
- Auto-configure modules.conf so -epgsqldb just works
- Add 'unicornscan-alicorn password' command to show password

* Wed Dec 31 2025 Robert E. Lee <robert@unicornscan.org> - 0.4.21-1
- Remove Supabase cloud service dependency - now uses pure PostgreSQL
- Add secure random password generation (no default passwords)
- Update Alicorn frontend to use @supabase/postgrest-js directly
- Add docker-init.sh script for secure Docker deployments

* Fri Dec 27 2025 Robert E. Lee <robert@unicornscan.org> - 0.4.18-1
- Fix sf mode in compound mode (-mA+sf) not sending SYN flag
- sf mode now defaults to TH_SYN like regular T mode
- Fixes 0% ports found when using -mA+sf with -s phantom IP

* Mon Dec 23 2025 Robert E. Lee <robert@unicornscan.org> - 0.4.13-1
- Add compound scan modes (-mA+T, -mA+U) for ARP-filtered TCP/UDP scanning
- ARP discovery phase filters subsequent scan phases to responding hosts only
- Eliminates kernel ARP blocking delays on sparse local networks
- 95% packet reduction on networks with few live hosts
- Clear error handling for remote targets in compound mode

* Mon Dec 22 2025 Robert E. Lee <robert@unicornscan.org> - 0.4.12-1
- Use XDG_RUNTIME_DIR for per-user socket paths (secure non-root operation)
- Replace deprecated libGeoIP with modern libmaxminddb
- Add multi-path GeoIP database search

* Sat Dec 21 2025 Robert E. Lee <robert@unicornscan.org> - 0.4.10-1
- Set Linux capabilities on install for non-root operation
- Only disable receive offloads (GRO/LRO), restore on exit

* Fri Dec 20 2025 Robert E. Lee <robert@unicornscan.org> - 0.4.9-1
- Disable NIC offload (GRO/LRO/TSO/GSO) for accurate packet capture
- Add DLT_LINUX_SLL support for capturing on "any" interface
- Add verbosity-based logging for packet parsing issues

* Fri Dec 20 2025 Robert E. Lee <robert@unicornscan.org> - 0.4.8-1
- Fix libdumbnet/libdnet support for cross-platform builds
- Add PostgreSQL cloud database support via PostgREST
- Fix NULL pointer dereferences in pgsqldb module
