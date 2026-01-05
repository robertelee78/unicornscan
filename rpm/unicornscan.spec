%global debug_package %{nil}

Name:           unicornscan
Version:        0.4.38
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
Recommends:     libmaxminddb

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
echo "Unicornscan installed successfully!"
echo ""
echo "OPTIONAL: Enable GeoIP city, region, and ASN lookups:"
echo "  sudo unicornscan-geoip-update"
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
%{_libdir}/unicornscan/
%{_libexecdir}/unicornscan/
%config(noreplace) %{_sysconfdir}/unicornscan/
%{_mandir}/man1/*
%dir %{_localstatedir}/unicornscan

%changelog
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
- unicornscan-web generates random password on first start
- Auto-configure modules.conf so -epgsqldb just works
- Add 'unicornscan-web password' command to show password

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
