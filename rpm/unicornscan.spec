%global debug_package %{nil}

Name:           unicornscan
Version:        0.4.8
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
export CFLAGS="${CFLAGS} -Wno-error"
%configure --with-pgsql
make %{?_smp_mflags}

%install
rm -rf %{buildroot}
make install DESTDIR=%{buildroot}

# Create var directory
mkdir -p %{buildroot}%{_localstatedir}/unicornscan

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
* Fri Dec 20 2024 Robert Lee <robert@loveathome.us> - 0.4.8-1
- Fix libdumbnet/libdnet support for cross-platform builds
- Add Supabase cloud database support
- Fix NULL pointer dereferences in pgsqldb module
