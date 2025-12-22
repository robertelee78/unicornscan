# GeoIP Database Handling Research Findings (2025)
## Research conducted: 2025-12-22

## Executive Summary

MaxMind **retired GeoIP Legacy (.dat format) databases in May 2022**. All modern implementations should migrate to **GeoIP2 (.mmdb format)** using **libmaxminddb** instead of legacy libGeoIP. Current unicornscan implementation uses deprecated API that requires immediate migration.

---

## 1. GeoIP vs GeoIP2: Current State & Migration Timeline

### Deprecation Timeline

| Date | Event |
|------|-------|
| **April 1, 2018** | GeoLite Legacy database updates discontinued |
| **January 2, 2019** | Last GeoLite Legacy downloads removed |
| **May 31, 2022** | GeoIP Legacy (commercial) databases retired |
| **2025 (current)** | Legacy .dat format completely obsolete |

**Sources:**
- [MaxMind Legacy Retirement Announcement (2020)](https://blog.maxmind.com/2020/06/retirement-of-geoip-legacy-downloadable-databases-in-may-2022/)
- [GeoIP Legacy Databases Retired (2022)](https://blog.maxmind.com/2022/06/geoip-legacy-databases-have-been-retired/)

### Migration Path

```
Legacy Stack (DEPRECATED)          →    Modern Stack (CURRENT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━         ━━━━━━━━━━━━━━━━━━━━━━━━━
Database: GeoIP.dat                     Database: GeoLite2-City.mmdb
          GeoIPCity.dat                           GeoLite2-Country.mmdb
          GeoLiteCity.dat                         GeoLite2-ASN.mmdb

Library:  libGeoIP (libgeoip)           Library:  libmaxminddb
API:      geoip-api-c (deprecated)      API:      MaxMind DB C API

Format:   Binary .dat (IPv4 only)       Format:   MMDB (IPv6 support)
```

**Why Migration Required:**
- Legacy format built for IPv4 (~4.2 billion addresses)
- IPv6 requires support for 340 trillion trillion trillion addresses
- Legacy API lacks: IPv6 support, localized data, additional data points
- Security/bug fixes ended May 2022

---

## 2. Standard Locations Across Distributions

### Fedora/RHEL/CentOS

**Database Location:** `/usr/share/GeoIP/`

**Packages:**
```bash
# Legacy (deprecated, may still be available in older repos)
sudo yum install GeoIP GeoIP-data
sudo yum install GeoIP-GeoLite-data        # Free version
sudo yum install GeoIP-GeoLite-data-extra  # Additional databases

# Modern (recommended)
sudo dnf install libmaxminddb
sudo dnf install geoipupdate              # Automatic updater
```

**Installed Files:**
- `GeoLiteCountry.dat` (with symlink `GeoIP.dat`)
- `GeoLiteCity.dat` (with symlink `GeoIPCity.dat`)
- `GeoIPv6.dat`, `GeoLiteCityv6.dat`
- `GeoLiteASNum.dat`, `GeoIPASNumv6.dat`
- **Modern:** `GeoLite2-City.mmdb`, `GeoLite2-Country.mmdb`, `GeoLite2-ASN.mmdb`

**Sources:**
- [Fedora GeoIP Package](https://packages.fedoraproject.org/pkgs/GeoIP/GeoIP/)
- [Fedora GeoIP-GeoLite-data](https://packages.fedoraproject.org/pkgs/GeoIP-GeoLite-data/GeoIP-GeoLite-data/)

---

### Debian/Ubuntu

**Database Locations:**
- **Default (geoipupdate):** `/var/lib/GeoIP/`
- **Legacy location:** `/usr/share/GeoIP/`

**Configuration:**
- Default config: `/etc/GeoIP.conf`

**Packages:**
```bash
# Legacy libraries
sudo apt-get install libgeoip1t64    # Legacy C library
sudo apt-get install libgeoip-dev    # Development headers
sudo apt-get install geoip-bin       # Command-line tools
sudo apt-get install geoip-database  # Free country database

# Modern libraries  
sudo apt-get install libmaxminddb0   # MaxMind DB library
sudo apt-get install libmaxminddb-dev
sudo apt-get install geoipupdate     # Automatic updater

# Package versions (2025)
# Ubuntu 22.04 (Jammy): geoipupdate 4.6.0-1
# Ubuntu 24.04 (Noble): geoipupdate 6.1.0-1ubuntu0.3
# Ubuntu 24.10 (Oracular): geoipupdate 7.0.1-1ubuntu0.1
# Ubuntu 25.04 (Plummy): geoipupdate 7.1.0-1
```

**Sources:**
- [Ubuntu geoipupdate Manual](https://manpages.ubuntu.com/manpages/jammy/man1/geoipupdate.1.html)
- [GitHub maxmind/geoipupdate](https://github.com/maxmind/geoipupdate)

---

### Arch Linux

**Database Location:** `/usr/share/GeoIP/`

**Packages:**
```bash
# Official repositories
sudo pacman -S geoip              # Legacy library (v1.6.12-3)
sudo pacman -S geoip-database     # Free databases (20250129-1)
sudo pacman -S geoip-database-extra  # Additional databases

# For MMDB format
sudo pacman -S libmaxminddb       # Modern library
```

**Database Files:**
- Package `geoip-database` (3 files, 5 directories)
- Package `geoip-database-extra` (5 files, 5 directories)
- Modern MMDB files also in `/usr/share/GeoIP/`

**Command-line usage:**
```bash
geoiplookup 1.1.1.1  # Uses /usr/share/GeoIP by default

# For MMDB format
mmdblookup --file /usr/share/GeoIP/GeoLite2-City.mmdb --ip 1.1.1.1
```

**Sources:**
- [Arch Linux geoip Package](https://archlinux.org/packages/extra/x86_64/geoip/)
- [Arch Linux geoip-database](https://archlinux.org/packages/extra/any/geoip-database/)
- [Arch Linux geoip-database File List](https://archlinux.org/packages/extra/any/geoip-database/files/)

---

## 3. How Other Network Security Tools Handle GeoIP

### nmap

**Approach:** Lua-based NSE (Nmap Scripting Engine) with fallback paths

**Implementation:**
```lua
-- From /usr/share/nmap/scripts/ip-geolocation-maxmind.nse
local function get_db_file()
  return (stdnse.get_script_args(SCRIPT_NAME .. ".maxmind_db") or
    nmap.fetchfile("nselib/data/GeoLiteCity.dat"))
end
```

**Database Lookup:**
1. Check script argument: `--script-args ip-geolocation-maxmind.maxmind_db=<path>`
2. Fallback to: `nselib/data/GeoLiteCity.dat`

**Format Support:**
- Legacy .dat support via embedded Lua parser
- Modern .mmdb support (GeoIP2 databases)

**NSE Library:** `/usr/share/nmap/nselib/geoip.lua` provides:
- `add(ip, lat, lon)` - Add location to registry
- `get_all_by_ip()` - Retrieve coordinates by IP
- `get_all_by_gps()` - Retrieve IPs by coordinate
- Location object with XML output support

**Key Pattern:** User-configurable path with sensible fallback

**Sources:**
- [Nmap geoip NSE Library](https://nmap.org/nsedoc/lib/geoip.html)
- [Nmap GitHub configure.ac](https://github.com/nmap/nmap/blob/master/configure.ac)

---

### Wireshark

**Approach:** Compile-time detection with runtime configuration

**Configure Detection:**
```bash
./configure --with-geoip=yes
# Attempts communication with C GeoIP library during configure
```

**Version Support:**
- **v1.1.2 - v2.5:** "Compiled with GeoIP" (legacy libGeoIP)
- **v2.6+:** "with MaxMind DB resolver" (libmaxminddb)

**Database Configuration:**
- User sets database directory in preferences
- Searches for .dat (legacy) or .mmdb (modern) files

**Verification:**
Help → About Wireshark → Check "Compiled with" section for:
- "GeoIP" (legacy, v2.5 and earlier)
- "MaxMind DB resolver" (modern, v2.6+)

**Key Pattern:** Clear version migration path with user-visible indication

**Sources:**
- [Wireshark GeoIP Setup](https://blog.packet-foo.com/2018/05/wireshark-geoip-resolution-setup-v2-0/)
- [Wireshark HowToUseGeoIP Wiki](https://wiki.wireshark.org/HowToUseGeoIP)

---

### p0f (Passive OS Fingerprinting)

**Current Status:** p0f v3 does NOT have built-in GeoIP integration

**Unicornscan Integration:** 
Unicornscan has p0f v3 socket integration but NOT GeoIP in p0f itself.

From unicornscan configure.ac:
```bash
AC_ARG_WITH(p0f3-socket,
    [  --with-p0f3-socket=PATH path to p0f v3 daemon socket],
    [ p0f3_socket="$withval" ],
    [ p0f3_socket="/var/run/p0f.sock" ])
AC_DEFINE_UNQUOTED([P0F3_SOCKET_PATH], ["$p0f3_socket"], [Path to p0f v3 socket])
```

**Key Pattern:** p0f focuses on OS fingerprinting; GeoIP is separate concern

**Sources:**
- `/opt/unicornscan-0.4.7/configure.ac` (lines 378-384)

---

### Autoconf Detection Patterns

**Common Pattern:**
```m4
AC_CHECK_LIB([GeoIP], [GeoIP_open], [], [], [])
```

From unicornscan's `configure.ac` (line 375):
```bash
AC_CHECK_LIB([GeoIP], [GeoIP_open], [], [], [])
echo "GeoIP support: $ac_cv_lib_GeoIP_GeoIP_open"
```

**Better Modern Pattern (recommended):**
```m4
# Check for libmaxminddb using pkg-config
PKG_CHECK_MODULES([LIBMAXMINDDB], [libmaxminddb >= 1.0.0], [
    AC_DEFINE([HAVE_LIBMAXMINDDB], [1], [Define if libmaxminddb is available])
    have_maxminddb=yes
], [
    have_maxminddb=no
])
```

**Alternative without pkg-config:**
```m4
AC_CHECK_HEADER([maxminddb.h], [
    AC_CHECK_LIB([maxminddb], [MMDB_open], [
        AC_DEFINE([HAVE_LIBMAXMINDDB], [1], [Define if libmaxminddb is available])
        MAXMINDDB_LIBS="-lmaxminddb"
        have_maxminddb=yes
    ])
])
AC_SUBST([MAXMINDDB_LIBS])
```

---

## 4. libgeoip vs libmaxminddb: API Differences

### Library Comparison

| Feature | libGeoIP (DEPRECATED) | libmaxminddb (CURRENT) |
|---------|----------------------|------------------------|
| **Status** | Retired May 2022 | Active development |
| **Database Format** | .dat (binary) | .mmdb (MaxMind DB) |
| **IPv6 Support** | Limited/none | Full support |
| **Compiler Requirements** | C89 | C99 + POSIX.1-2001 |
| **pkg-config Support** | Limited | Yes |
| **Open Format Spec** | Proprietary | Open spec available |
| **Thread Safety** | Limited | Thread-safe |

**Sources:**
- [GitHub maxmind/geoip-api-c (Deprecated)](https://github.com/maxmind/geoip-api-c)
- [GitHub maxmind/libmaxminddb](https://github.com/maxmind/libmaxminddb)

---

### API Migration Examples

#### Legacy libGeoIP Code (CURRENT unicornscan):

```c
#include <GeoIP.h>

GeoIP *gi = NULL;

// Initialize
gi = GeoIP_open("/usr/share/GeoIP/GeoIP.dat", GEOIP_MEMORY_CACHE);
if (gi == NULL) {
    fprintf(stderr, "Error opening GeoIP database\n");
}

// Lookup
char geoip_addr[INET_ADDRSTRLEN];
inet_ntop(AF_INET, &ia, geoip_addr, sizeof(geoip_addr));
const char *country = GeoIP_country_code_by_addr(gi, geoip_addr);

// Cleanup
GeoIP_delete(gi);
```

---

#### Modern libmaxminddb Code (RECOMMENDED):

```c
#include <maxminddb.h>

MMDB_s mmdb;
int status;

// Initialize
status = MMDB_open("/usr/share/GeoIP/GeoLite2-Country.mmdb", MMDB_MODE_MMAP, &mmdb);
if (status != MMDB_SUCCESS) {
    fprintf(stderr, "Error opening MaxMind DB: %s\n", MMDB_strerror(status));
}

// Lookup
int gai_error, mmdb_error;
MMDB_lookup_result_s result = MMDB_lookup_string(&mmdb, ip_address, &gai_error, &mmdb_error);

if (gai_error == 0 && mmdb_error == MMDB_SUCCESS && result.found_entry) {
    MMDB_entry_data_s entry_data;
    status = MMDB_get_value(&result.entry, &entry_data, "country", "iso_code", NULL);
    
    if (status == MMDB_SUCCESS && entry_data.has_data) {
        if (entry_data.type == MMDB_DATA_TYPE_UTF8_STRING) {
            printf("Country: %.*s\n", entry_data.data_size, entry_data.utf8_string);
        }
    }
}

// Cleanup
MMDB_close(&mmdb);
```

---

### Key API Differences

1. **Opening Database:**
   - Legacy: `GeoIP_open(path, flags)` → `GeoIP*`
   - Modern: `MMDB_open(path, flags, &mmdb)` → status code

2. **Memory Options:**
   - Legacy: `GEOIP_MEMORY_CACHE`, `GEOIP_MMAP_CACHE`, etc.
   - Modern: `MMDB_MODE_MMAP` (recommended), `MMDB_MODE_STANDARD`

3. **Lookup:**
   - Legacy: `GeoIP_country_code_by_addr(gi, ip_string)` → direct string
   - Modern: `MMDB_lookup_string(mmdb, ip, ...)` → result struct
   - Modern requires traversing result tree with `MMDB_get_value()`

4. **Error Handling:**
   - Legacy: NULL pointers and errno
   - Modern: Explicit status codes with `MMDB_strerror()`

5. **Data Access:**
   - Legacy: Simple function calls return strings
   - Modern: Hierarchical data structure navigation

6. **Cleanup:**
   - Legacy: `GeoIP_delete(gi)`
   - Modern: `MMDB_close(&mmdb)`

---

## 5. Best Practices for Fallback Path Searching in C

### Multi-Directory Search Pattern

```c
#ifdef HAVE_LIBMAXMINDDB
#include <maxminddb.h>
#include <sys/stat.h>

static const char *geoip_search_paths[] = {
    "/usr/local/share/GeoIP/GeoLite2-Country.mmdb",  // Local install
    "/usr/share/GeoIP/GeoLite2-Country.mmdb",        // System (Debian/Ubuntu/Fedora/Arch)
    "/var/lib/GeoIP/GeoLite2-Country.mmdb",          // geoipupdate default (Debian/Ubuntu)
    "/opt/GeoIP/GeoLite2-Country.mmdb",              // Alternative location
    CONF_DIR "/GeoLite2-Country.mmdb",               // Configure-time prefix
    NULL  // Terminator
};

static MMDB_s mmdb;
static int mmdb_initialized = 0;

static int file_exists(const char *path) {
    struct stat st;
    return (stat(path, &st) == 0 && S_ISREG(st.st_mode));
}

int geoip_init(void) {
    const char **path_ptr;
    int status;
    
    for (path_ptr = geoip_search_paths; *path_ptr != NULL; path_ptr++) {
        if (!file_exists(*path_ptr)) {
            continue;
        }
        
        status = MMDB_open(*path_ptr, MMDB_MODE_MMAP, &mmdb);
        if (status == MMDB_SUCCESS) {
            fprintf(stderr, "Loaded GeoIP database: %s\n", *path_ptr);
            mmdb_initialized = 1;
            return 0;
        } else {
            fprintf(stderr, "Failed to open %s: %s\n", 
                    *path_ptr, MMDB_strerror(status));
        }
    }
    
    fprintf(stderr, "No GeoIP database found in standard locations\n");
    return -1;
}

const char *geoip_lookup_country(const char *ip_address) {
    static char country_code[3] = "??";
    
    if (!mmdb_initialized) {
        return country_code;
    }
    
    int gai_error, mmdb_error;
    MMDB_lookup_result_s result = MMDB_lookup_string(&mmdb, ip_address, 
                                                      &gai_error, &mmdb_error);
    
    if (gai_error != 0 || mmdb_error != MMDB_SUCCESS || !result.found_entry) {
        return country_code;
    }
    
    MMDB_entry_data_s entry_data;
    int status = MMDB_get_value(&result.entry, &entry_data, 
                                 "country", "iso_code", NULL);
    
    if (status == MMDB_SUCCESS && entry_data.has_data &&
        entry_data.type == MMDB_DATA_TYPE_UTF8_STRING &&
        entry_data.data_size >= 2) {
        memcpy(country_code, entry_data.utf8_string, 2);
        country_code[2] = '\0';
    }
    
    return country_code;
}

void geoip_cleanup(void) {
    if (mmdb_initialized) {
        MMDB_close(&mmdb);
        mmdb_initialized = 0;
    }
}

#endif /* HAVE_LIBMAXMINDDB */
```

---

### Search Path Priority Rationale

1. **`/usr/local/share/GeoIP/`** - Local administrator override
2. **`/usr/share/GeoIP/`** - System package manager (all major distros)
3. **`/var/lib/GeoIP/`** - geoipupdate default (Debian/Ubuntu)
4. **`/opt/GeoIP/`** - Alternative third-party installs
5. **`CONF_DIR/`** - Configure-time customization

**Environment Variable Override:**
```c
const char *env_path = getenv("GEOIP_DATABASE");
if (env_path && file_exists(env_path)) {
    // Try environment variable first
}
```

---

### Configure.ac Integration

**Modern recommended pattern:**
```m4
dnl Check for MaxMind DB library (GeoIP2)
AC_ARG_WITH([geoip],
    [AS_HELP_STRING([--with-geoip@<:@=DIR@:>@],
        [enable GeoIP2 support using libmaxminddb])],
    [],
    [with_geoip=check])

AS_IF([test "x$with_geoip" != "xno"], [
    PKG_CHECK_MODULES([LIBMAXMINDDB], [libmaxminddb >= 1.0.0], [
        AC_DEFINE([HAVE_LIBMAXMINDDB], [1], [Define if libmaxminddb is available])
        have_geoip=yes
    ], [
        dnl Fallback without pkg-config
        AC_CHECK_HEADER([maxminddb.h], [
            AC_CHECK_LIB([maxminddb], [MMDB_open], [
                AC_DEFINE([HAVE_LIBMAXMINDDB], [1], [Define if libmaxminddb is available])
                LIBMAXMINDDB_LIBS="-lmaxminddb"
                have_geoip=yes
            ], [
                have_geoip=no
            ])
        ], [
            have_geoip=no
        ])
    ])
    
    AS_IF([test "x$have_geoip" = "xno" && test "x$with_geoip" = "xyes"], [
        AC_MSG_ERROR([GeoIP2 support requested but libmaxminddb not found. Install libmaxminddb-dev or use --without-geoip])
    ])
])

AC_SUBST([LIBMAXMINDDB_CFLAGS])
AC_SUBST([LIBMAXMINDDB_LIBS])
```

---

## 6. Current Unicornscan Implementation Analysis

### Existing Code (src/scan_progs/report.c)

```c
#ifdef HAVE_LIBGEOIP
#include <GeoIP.h>
static GeoIP *gi=NULL;

void report_init(void) {
    gi=GeoIP_open(CONF_DIR "/GeoIP.dat", GEOIP_MEMORY_CACHE);
    if (gi == NULL) {
        ERR("error opening geoip database `%s/%s': %s", 
            CONF_DIR, "/GeoIP.dat", strerror(errno));
    }
}

// In format string processing:
#ifdef HAVE_LIBGEOIP
    inet_ntop(AF_INET, &ia, geoip_addr, sizeof(geoip_addr));
    tptr=GeoIP_country_code_by_addr(gi, geoip_addr);
    snprintf(tmp, sizeof(tmp) -1, ofmt, tptr != NULL ? tptr : "??");
#else
    ERR("no GeoIP support compiled in!");
#endif

void report_fini(void) {
#ifdef HAVE_LIBGEOIP
    if (gi != NULL) {
        GeoIP_delete(gi);
    }
#endif
}
```

### Current Configure Detection (configure.ac line 375)

```bash
AC_CHECK_LIB([GeoIP], [GeoIP_open], [], [], [])
echo "GeoIP support: $ac_cv_lib_GeoIP_GeoIP_open"
```

---

### Issues with Current Implementation

1. ❌ **Uses deprecated libGeoIP** (retired May 2022)
2. ❌ **Hardcoded single path** - no fallback search
3. ❌ **No .mmdb support** - only legacy .dat
4. ❌ **No IPv6 support** in GeoIP lookups
5. ❌ **No environment variable override**
6. ❌ **Silent failure** - only logs error, continues without GeoIP
7. ❌ **No pkg-config detection**

---

## 7. Recommended Migration Strategy

### Phase 1: Update Configure Detection

**Replace in configure.ac:**
```m4
dnl Legacy GeoIP (deprecated)
dnl AC_CHECK_LIB([GeoIP], [GeoIP_open], [], [], [])

dnl Modern GeoIP2 with MaxMind DB
PKG_CHECK_MODULES([LIBMAXMINDDB], [libmaxminddb >= 1.0.0], [
    AC_DEFINE([HAVE_LIBMAXMINDDB], [1], [Define if libmaxminddb is available])
    have_geoip=yes
], [
    AC_CHECK_HEADER([maxminddb.h], [
        AC_CHECK_LIB([maxminddb], [MMDB_open], [
            AC_DEFINE([HAVE_LIBMAXMINDDB], [1], [Define if libmaxminddb is available])
            LIBMAXMINDDB_LIBS="-lmaxminddb"
            have_geoip=yes
        ], [have_geoip=no])
    ], [have_geoip=no])
])
```

---

### Phase 2: Update Source Code

**Create new file: src/scan_progs/geoip.c**

Implement functions:
- `geoip_init()` - Search fallback paths
- `geoip_lookup_country()` - IPv4/IPv6 lookup
- `geoip_cleanup()` - Resource cleanup

**Update src/scan_progs/report.c:**
- Replace `#ifdef HAVE_LIBGEOIP` with `#ifdef HAVE_LIBMAXMINDDB`
- Replace `GeoIP_*` calls with `geoip_*` wrapper functions
- Update format string processing to use new API

---

### Phase 3: Update Build System

**Update src/scan_progs/Makefile.am:**
```makefile
AM_CFLAGS += @LIBMAXMINDDB_CFLAGS@
LIBS += @LIBMAXMINDDB_LIBS@
```

---

### Phase 4: Update Documentation

**Update README.geoip:**
```
GeoIP2 Support
==============

Unicornscan supports MaxMind GeoIP2 databases via libmaxminddb.

Installation:
  Debian/Ubuntu:  apt-get install libmaxminddb-dev geoipupdate
  Fedora/RHEL:    dnf install libmaxminddb-devel geoipupdate
  Arch Linux:     pacman -S libmaxminddb

Database Setup:
  1. Install geoipupdate
  2. Configure /etc/GeoIP.conf with your MaxMind account
  3. Run: geoipupdate
  
  Databases will be installed to /var/lib/GeoIP/ or /usr/share/GeoIP/
  
  Free accounts: https://www.maxmind.com/en/geolite2/signup

Search Paths (in order):
  - $GEOIP_DATABASE environment variable
  - /usr/local/share/GeoIP/GeoLite2-Country.mmdb
  - /usr/share/GeoIP/GeoLite2-Country.mmdb
  - /var/lib/GeoIP/GeoLite2-Country.mmdb
```

---

### Phase 5: Package Dependencies

**Update debian/control:**
```
Build-Depends: ..., libmaxminddb-dev
Suggests: geoipupdate, geoip-database
```

**Update RPM spec:**
```
BuildRequires: libmaxminddb-devel
Recommends: geoipupdate
```

---

## 8. Testing Checklist

- [ ] Verify compile with `--enable-geoip` and `--disable-geoip`
- [ ] Test with database in each search path location
- [ ] Test with `GEOIP_DATABASE` environment variable
- [ ] Test with missing database (graceful degradation)
- [ ] Test IPv4 address lookups
- [ ] Test IPv6 address lookups
- [ ] Test on Debian/Ubuntu with `libmaxminddb0`
- [ ] Test on Fedora/RHEL with `libmaxminddb`
- [ ] Test on Arch Linux with `libmaxminddb`
- [ ] Verify no memory leaks with valgrind
- [ ] Test format string output with `%C` (country code)

---

## 9. Summary of Findings

### Distribution-Specific Paths

| Distribution | Database Location | Package Name | Modern Library |
|-------------|------------------|--------------|----------------|
| **Fedora/RHEL** | `/usr/share/GeoIP/` | `GeoIP-GeoLite-data` | `libmaxminddb` |
| **Debian/Ubuntu** | `/var/lib/GeoIP/` (primary)<br>`/usr/share/GeoIP/` (alt) | `geoip-database`<br>`geoipupdate` | `libmaxminddb0` |
| **Arch Linux** | `/usr/share/GeoIP/` | `geoip-database` | `libmaxminddb` |

### Critical Action Items

1. **IMMEDIATE:** Migrate from libGeoIP to libmaxminddb
2. **HIGH:** Implement fallback path search
3. **HIGH:** Add IPv6 support
4. **MEDIUM:** Add environment variable override
5. **MEDIUM:** Update package dependencies
6. **LOW:** Add user documentation for database setup

### Resources & Documentation

**Official MaxMind Documentation:**
- [GeoIP2 Databases](https://dev.maxmind.com/geoip/docs/databases/)
- [libmaxminddb C API](https://github.com/maxmind/libmaxminddb)
- [MaxMind DB Format Spec](https://maxmind.github.io/MaxMind-DB/)
- [GeoIP Update Tool](https://github.com/maxmind/geoipupdate)

**Distribution-Specific:**
- [Fedora GeoIP Packages](https://packages.fedoraproject.org/search?query=geoip)
- [Debian GeoIP Tracker](https://tracker.debian.org/pkg/geoipupdate)
- [Arch Linux GeoIP](https://archlinux.org/packages/extra/any/geoip-database/)

---

## 10. Code Examples from Other Projects

### Example: Modern Fallback Pattern (Pseudocode)

```c
// Priority order for database search
1. Environment variable: $GEOIP_DATABASE
2. Compile-time path: CONF_DIR/GeoLite2-Country.mmdb
3. /usr/local/share/GeoIP/GeoLite2-Country.mmdb
4. /usr/share/GeoIP/GeoLite2-Country.mmdb (Fedora/RHEL/Arch)
5. /var/lib/GeoIP/GeoLite2-Country.mmdb (Debian/Ubuntu geoipupdate)

// For each path:
//   - Check file exists with stat()
//   - Attempt MMDB_open()
//   - On success: break and use this database
//   - On failure: log warning and try next path
//   - If all fail: log error, continue without GeoIP
```

### Thread Safety Considerations

```c
// libmaxminddb is thread-safe for lookups after initialization
// Multiple threads can call MMDB_lookup_string() concurrently
// on the same MMDB_s structure without locking

// However, initialization and cleanup should be protected:
static pthread_mutex_t geoip_init_lock = PTHREAD_MUTEX_INITIALIZER;
static int geoip_refcount = 0;

void geoip_init_safe(void) {
    pthread_mutex_lock(&geoip_init_lock);
    if (geoip_refcount++ == 0) {
        geoip_init();
    }
    pthread_mutex_unlock(&geoip_init_lock);
}

void geoip_cleanup_safe(void) {
    pthread_mutex_lock(&geoip_init_lock);
    if (--geoip_refcount == 0) {
        geoip_cleanup();
    }
    pthread_mutex_unlock(&geoip_init_lock);
}
```

---

## Appendices

### A. Relevant File Paths in Unicornscan

- `/opt/unicornscan-0.4.7/README.geoip` - Current documentation
- `/opt/unicornscan-0.4.7/configure.ac` - Build configuration (line 375)
- `/opt/unicornscan-0.4.7/src/scan_progs/report.c` - GeoIP implementation
- `/opt/unicornscan-0.4.7/src/config.h.in` - Generated configuration header

### B. Package Installation Commands

**Debian/Ubuntu:**
```bash
sudo apt-get update
sudo apt-get install libmaxminddb0 libmaxminddb-dev geoipupdate
```

**Fedora/RHEL:**
```bash
sudo dnf install libmaxminddb libmaxminddb-devel geoipupdate
```

**Arch Linux:**
```bash
sudo pacman -S libmaxminddb geoip-database
```

### C. geoipupdate Configuration

**File:** `/etc/GeoIP.conf`
```ini
# MaxMind Account ID (required for downloads)
AccountID YOUR_ACCOUNT_ID

# License key from your MaxMind account
LicenseKey YOUR_LICENSE_KEY

# Edition IDs for databases to download
EditionIDs GeoLite2-Country GeoLite2-City GeoLite2-ASN

# Database directory
DatabaseDirectory /var/lib/GeoIP
```

**Free Account:** https://www.maxmind.com/en/geolite2/signup

---

**Research Completed:** 2025-12-22
**Researcher:** Claude (Sonnet 4.5)
**Project:** Unicornscan 0.4.10
**Priority:** HIGH - Legacy API deprecated, migration required
