%global debug_package %{nil}

Name:           unicornscan
Version:        0.4.10
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
BuildRequires:  flex
BuildRequires:  bison
BuildRequires:  gcc
BuildRequires:  make

Requires:       libpcap
Requires:       libdnet
Requires:       libtool-ltdl
Requires:       libcap

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
 - PostgreSQL/Supabase database export
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

%post
# Set Linux capabilities to allow running without root
# Fails gracefully if capabilities aren't supported (SELinux, containers, etc.)
setcap 'cap_net_raw,cap_net_admin,cap_sys_chroot,cap_setuid,cap_setgid+ep' %{_bindir}/unicornscan 2>/dev/null || :
setcap 'cap_net_raw,cap_net_admin,cap_sys_chroot,cap_setuid,cap_setgid+ep' %{_bindir}/fantaip 2>/dev/null || :
setcap 'cap_net_raw,cap_net_admin,cap_sys_chroot,cap_setuid,cap_setgid+ep' %{_libexecdir}/unicornscan/unilisten 2>/dev/null || :
setcap 'cap_net_raw,cap_net_admin,cap_sys_chroot,cap_setuid,cap_setgid+ep' %{_libexecdir}/unicornscan/unisend 2>/dev/null || :

%files
%license LICENSE
%doc README
%{_bindir}/unicornscan
%{_bindir}/unibrow
%{_bindir}/fantaip
%{_bindir}/unicfgtst
%{_bindir}/us
%{_libdir}/unicornscan/
%{_libexecdir}/unicornscan/
%config(noreplace) %{_sysconfdir}/unicornscan/
%{_mandir}/man1/*
%dir %{_localstatedir}/unicornscan

%changelog
* Sat Dec 21 2024 Robert Lee <robert@loveathome.us> - 0.4.10-1
- Set Linux capabilities on install for non-root operation
- Only disable receive offloads (GRO/LRO), restore on exit

* Fri Dec 20 2024 Robert Lee <robert@loveathome.us> - 0.4.9-1
- Disable NIC offload (GRO/LRO/TSO/GSO) for accurate packet capture
- Add DLT_LINUX_SLL support for capturing on "any" interface
- Add verbosity-based logging for packet parsing issues

* Fri Dec 20 2024 Robert Lee <robert@loveathome.us> - 0.4.8-1
- Fix libdumbnet/libdnet support for cross-platform builds
- Add Supabase cloud database support
- Fix NULL pointer dereferences in pgsqldb module
