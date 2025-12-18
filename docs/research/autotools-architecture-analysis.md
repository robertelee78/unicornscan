# Unicornscan Autotools Architecture Analysis

**Date:** 2025-12-18
**Objective:** Plan proper fix for config.h.in vs compile.h separation and Supabase region support

## Executive Summary

The unicornscan project has a **critical architectural issue** where `config.h.in` contains both:
1. Autoheader-managed `#undef` placeholders (proper autotools usage)
2. Manual code, macros, and includes (violates autotools conventions)

This mixture causes autoheader to fail when it tries to regenerate config.h.in, because it expects only `#undef` placeholders and special comments it manages.

## 1. config.h.in Analysis

### Current Structure (412 lines)

**Lines 1-19:** GPL header (OK)

**Lines 20-26:** MANUAL POSIX/GNU feature test macros
```c
#ifndef _POSIX_C_SOURCE
#define _POSIX_C_SOURCE 200809L
#endif
#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
```
**PROBLEM:** These should be in a separate header or set via CFLAGS

**Lines 28-70:** Manual configuration #undefs
```c
#undef WITH_SELINUX
#undef WITH_BACKTRACE
#undef WITH_LONGOPTS
#undef RANDOM_DEVICE
#undef HAVE_PROC_NET_ROUTE
#undef NOPRIV_USER
#undef HAVE___ATTRIBUTE__
#undef CPU_BIGENDIAN
#undef CPU_LITTLEENDIAN
#undef HAVE_LIBGEOIP
```
**PROBLEM:** Some of these ARE set by configure.ac (like CPU_*), others are manual. Mixed responsibility.

**Lines 72-163:** Autoheader-managed placeholders (CORRECT)
```c
#undef AC_APPLE_UNIVERSAL_BUILD
#undef DEBUG_SUPPORT
#undef HAVE_ALARM
... (90+ auto-generated placeholders)
```
**CORRECT:** These are managed by autoheader based on AC_DEFINE calls in configure.ac

**Lines 165-171:** Manual database flags and library extensions
```c
#undef WITH_MYSQL
#undef WITH_PGSQL
#undef SHLIB_EXT
#undef LTDL_SHLIB_EXT
```
**PROBLEM:** SHLIB_EXT and LTDL_SHLIB_EXT are set by configure.ac but WITH_MYSQL/WITH_PGSQL might be both

**Lines 172-411:** LARGE BLOCK OF MANUAL CODE
- Signal definitions (UNI_SYNC_SIGNAL)
- Constant definitions (MAX_ERRORS, DEF_SOCK_TIMEOUT, BINDPORT_START, etc.)
- Path macros (DEF_SENDER, DEF_LISTENER, CONF_DIR, MODULE_DIR, etc.)
- Compiler attribute macros (_PACKED_, _PRINTF45_, etc.)
- System header includes (stdio.h, sys/types.h, etc.)
- Platform detection (#if HAVE_SYS_STAT_H, etc.)
- Type definitions (u_int, u_short, u_char)
- Byte order handling
- Custom assert() macro
- Utility macros (MAX, MIN, SWAP, CLEAR)
- Structure definitions (struct f_s)
- Format specifiers (SSTFMT, STFMT)
- #include <globalheaders.h>

**PROBLEM:** This is 240 lines of manual code that has NO PLACE in config.h.in

## 2. What Belongs Where

### config.h.in (Autoheader-managed ONLY)
```c
/* GPL header */
#undef AC_APPLE_UNIVERSAL_BUILD
#undef DEBUG_SUPPORT
#undef HAVE_ALARM
#undef HAVE_ARPA_INET_H
... (all AC_DEFINE placeholders from configure.ac)
#undef WITH_MYSQL
#undef WITH_PGSQL
#undef WITH_BACKTRACE
#undef WITH_LONGOPTS
#undef CPU_BIGENDIAN
#undef CPU_LITTLEENDIAN
... (anything set by AC_DEFINE in configure.ac)
```

### unicorn_defs.h (NEW FILE - Manual definitions)
```c
/* GPL header */

/* Enable POSIX features (nanosleep, etc) */
#ifndef _POSIX_C_SOURCE
#define _POSIX_C_SOURCE 200809L
#endif
#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif

/* Project-specific constants */
#define UNI_SYNC_SIGNAL	SIGUSR1
#define MAX_ERRORS 32
#define DEF_SOCK_TIMEOUT 8
#define BINDPORT_START	8000
#define DEF_LISTEN_ADDR	"localhost:1234"
#define DEF_SENDER	"unix:" LOCALSTATEDIR "/" TARGETNAME "/send"
#define DEF_LISTENER	"unix:" LOCALSTATEDIR "/" TARGETNAME "/listen"
#define DEF_SCANTIMEOUT 7
#define CONF_DIR	SYSCONFDIR "/" TARGETNAME
#define CONF_FILE	CONF_DIR "/%s.conf"
#define DEF_PROFILE	"unicorn"
#define PORT_NUMBERS	CONF_DIR "/ports.txt"
#define OUI_CONF	CONF_DIR "/oui.txt"
#define MODULE_DIR	LIBDIR "/" TARGETNAME "/modules"
#define SENDER_PATH	LIBEXECDIR "/" TARGETNAME "/" SENDERNAME
#define LISTENER_PATH	LIBEXECDIR "/" TARGETNAME "/" LISTENERNAME
#define CHROOT_DIR LOCALSTATEDIR "/" TARGETNAME
#define MAX_CONNS	32
#define IPC_DSIZE	65536

/* Compiler attributes (based on autoconf detection) */
#ifdef HAVE___ATTRIBUTE__
# define _PACKED_ __attribute__((packed))
# define _PRINTF45_ __attribute__((format(printf, 4, 5)))
# define _PRINTF45NR_ __attribute__((format(printf, 4, 5), noreturn))
# define _PRINTF12NR_ __attribute__((format(printf, 1, 2), noreturn))
# define _NORETURN_ __attribute__((noreturn))
#else
# define _PACKED_
# define _PRINTF45_
# define _PRINTF45NR_
# define _PRINTF12NR_
# define _NORETURN_
#endif

/* Standard includes (with autoconf guards) */
#include <stdio.h>
#include <sys/types.h>

#ifdef HAVE_SYS_STAT_H
# include <sys/stat.h>
#endif

#ifdef STDC_HEADERS
# include <stdlib.h>
# include <stddef.h>
#else
# ifdef HAVE_STDLIB_H
#  include <stdlib.h>
# endif
#endif

... (rest of system includes and platform detection)

/* Type compatibility */
#ifndef u_int
# define u_int unsigned int
#endif
#ifndef u_short
# define u_short unsigned short
#endif
#ifndef u_char
# define u_char unsigned char
#endif

/* Byte order handling */
#ifndef BYTE_ORDER
# ifndef LITTLE_ENDIAN
#  define LITTLE_ENDIAN 1234
# endif
# ifndef BIG_ENDIAN
#  define BIG_ENDIAN 4321
# endif
# if defined(CPU_BIGENDIAN)
#  define BYTE_ORDER BIG_ENDIAN
# elif defined(CPU_LITTLEENDIAN)
#  define BYTE_ORDER LITTLE_ENDIAN
# else
#  error PDP bad, weirdo
# endif
#endif

/* Path limits */
#ifndef PATH_MAX
#define PATH_MAX 512
#endif
#ifndef INT_MAX
# define INT_MAX 0x7fffffff
#endif

/* Include project headers */
#include <globalheaders.h>

/* Type definitions */
#ifndef suseconds_t
#define suseconds_t long
#endif

/* Custom assert */
#define assert(x) \
	if (!(x)) { \
		PANIC("Assertion `%s' fails", # x); \
	}

#define THE_ONLY_SUPPORTED_HWADDR_LEN 6

/* Utility macros */
#ifdef MAX
# undef MAX
#endif
#ifdef MIN
# undef MIN
#endif
#ifdef SWAP
# undef SWAP
#endif

#define MAX(x, y) ((x) > (y) ? (x) : (y))
#define MIN(x, y) ((x) < (y) ? (x) : (y))
#define SWAP(x, y)	\
	(x) ^= (y);	\
	(y) ^= (x);	\
	(x) ^= (y)
#define CLEAR(m) memset((m), 0, sizeof(m))

/* Socket address structure */
#ifdef HAVE_STRUCT_SOCKADDR_LEN
struct f_s {
	uint8_t len;
	uint8_t family;
};
#else
struct f_s {
	uint16_t family;
};
#endif

/* Format specifiers */
#define SSTFMT	"%zd"
#define STFMT	"%zu"
```

## 3. Files That Include config.h

### Total: 87 files including config.h

All these files currently get the MASSIVE config.h.in with all manual code.

**Critical files:**
- `/opt/unicornscan-0.4.7/src/getconfig.c` - Command-line parsing
- `/opt/unicornscan-0.4.7/src/supabase_setup.c` - Supabase config
- `/opt/unicornscan-0.4.7/src/output_modules/database/pgsqldb.c` - Database output
- `/opt/unicornscan-0.4.7/src/main.c` - Main program
- All unilib/*.c files
- All scan_progs/*.c files
- All payload_modules/*.c files
- All output_modules/*.c files

**The pattern in all files:**
```c
#include <config.h>  /* FIRST include */
... then other includes
```

## 4. Supabase Configuration Architecture

### Current Implementation

**settings.h** (lines 223-227):
```c
typedef struct settings_s {
    ...
    /* Supabase cloud database integration */
    char *supabase_url;           /* e.g., https://xxxxx.supabase.co */
    char *supabase_key;           /* Service role or anon key */
    char *supabase_db_password;   /* PostgreSQL password */
} settings_t;
```

**supabase_setup.c** saves to `~/.unicornscan/supabase.conf`:
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_DB_PASSWORD=secret123
```

**pgsqldb.c** builds connection string (lines 117-155):
```c
static char *supabase_build_connstring(const settings_t *settings) {
    const char *project_ref = supabase_extract_project_ref(settings->supabase_url);
    const char *pooler_host = "aws-0-us-west-2.pooler.supabase.com";  /* HARDCODED REGION */
    const char *pooler_port = "6543";

    snprintf(connstr, len - 1,
        "host=%s port=%s dbname=postgres user=postgres.%s password=%s sslmode=require",
        pooler_host, pooler_port, project_ref, settings->supabase_db_password);
}
```

**PROBLEM:** Region is hardcoded to `us-west-2`

### Supabase Pooler Architecture

Supabase provides different pooler endpoints per region:
- `aws-0-us-west-1.pooler.supabase.com` (US West 1 - California)
- `aws-0-us-west-2.pooler.supabase.com` (US West 2 - Oregon) ← currently hardcoded
- `aws-0-us-east-1.pooler.supabase.com` (US East 1 - Virginia)
- `aws-0-eu-west-1.pooler.supabase.com` (EU West 1 - Ireland)
- `aws-0-eu-central-1.pooler.supabase.com` (EU Central 1 - Frankfurt)
- `aws-0-ap-southeast-1.pooler.supabase.com` (Asia Pacific - Singapore)
- `aws-0-ap-northeast-1.pooler.supabase.com` (Asia Pacific - Tokyo)
- etc.

### Region Detection Options

**Option 1: Parse from Supabase URL** (NOT RELIABLE)
The URL `https://xxxxx.supabase.co` doesn't contain region info.

**Option 2: Add region field to settings_t**
```c
typedef struct settings_s {
    ...
    char *supabase_url;
    char *supabase_key;
    char *supabase_db_password;
    char *supabase_region;  /* NEW: e.g., "us-west-2", "eu-west-1" */
} settings_t;
```

**Option 3: Query Supabase API** (COMPLEX)
Could use supabase_url to query for region, but adds complexity.

**RECOMMENDED:** Option 2 - explicit region field

## 5. Required Changes for Proper Architecture

### Step 1: Create unicorn_defs.h
**File:** `/opt/unicornscan-0.4.7/src/unicorn_defs.h`
- Move all manual code from config.h.in (lines 20-26, 172-411)
- Keep organized with clear sections
- Include config.h FIRST, then add manual definitions

### Step 2: Clean config.h.in
**File:** `/opt/unicornscan-0.4.7/src/config.h.in`
- Remove ALL manual code
- Keep ONLY GPL header and autoheader placeholders
- Add comment block at top:
```c
/* This file is managed by autoheader. DO NOT ADD MANUAL CODE HERE.
 * For project-specific definitions, see unicorn_defs.h */
```

### Step 3: Update all source files
**Pattern for all 87 .c files:**
```c
/* OLD: */
#include <config.h>

/* NEW: */
#include <config.h>
#include <unicorn_defs.h>
```

**OR** simpler approach - update config.h.in to include unicorn_defs.h at the end:
```c
/* At END of config.h after all #undef placeholders: */
#include <unicorn_defs.h>
```

This way source files don't need changes, but it's slightly less clean.

### Step 4: Add Supabase region support

**4a. Update settings.h:**
```c
typedef struct settings_s {
    ...
    char *supabase_url;
    char *supabase_key;
    char *supabase_db_password;
    char *supabase_region;  /* NEW: AWS region for pooler */
} settings_t;
```

**4b. Update supabase_setup.c:**
- Add region field to config file format
- Add region selection to wizard (with region list/auto-detect)
- Parse region from config file

**4c. Update getconfig.c:**
- Add `--supabase-region` long option
- Add `OPT_SUPABASE_REGION` constant
- Parse SUPABASE_REGION environment variable
- Add command-line parsing for region option

**4d. Update pgsqldb.c:**
```c
static char *supabase_build_connstring(const settings_t *settings) {
    const char *project_ref = supabase_extract_project_ref(settings->supabase_url);
    char pooler_host[256];
    const char *region = settings->supabase_region ? settings->supabase_region : "us-west-2";

    /* Build region-specific pooler hostname */
    snprintf(pooler_host, sizeof(pooler_host),
             "aws-0-%s.pooler.supabase.com", region);

    snprintf(connstr, len - 1,
        "host=%s port=%s dbname=postgres user=postgres.%s password=%s sslmode=require",
        pooler_host, pooler_port, project_ref, settings->supabase_db_password);
}
```

### Step 5: Update compile.h generation
**File:** `/opt/unicornscan-0.4.7/src/Makefile.am` (or similar)

compile.h is auto-generated with build info. Ensure it includes:
```c
#define COMPILE_STR "Compiled by user on system at date with compiler"
```

This is fine as-is, but verify it doesn't conflict with new structure.

## 6. Migration Strategy

### Phase 1: Create unicorn_defs.h (NO CHANGES to existing files)
1. Create `/opt/unicornscan-0.4.7/src/unicorn_defs.h`
2. Copy manual code from config.h.in lines 20-26, 172-411
3. Test compilation - nothing should break yet

### Phase 2: Update config.h.in to include unicorn_defs.h
1. Edit `/opt/unicornscan-0.4.7/src/config.h.in`
2. Remove lines 20-26, 172-411
3. Add at end (after all #undef placeholders):
```c
/* Include project-specific definitions */
#ifndef UNICORN_DEFS_H_INCLUDED
#include <unicorn_defs.h>
#endif
```
4. Run autoheader - should succeed now
5. Test compilation

### Phase 3: Add Supabase region support
1. Update settings.h - add supabase_region field
2. Update supabase_setup.c - add region to wizard and config file
3. Update getconfig.c - add --supabase-region option and env var parsing
4. Update pgsqldb.c - use region for pooler hostname
5. Test Supabase functionality

### Phase 4: Cleanup and verification
1. Run full autotools cycle: autoreconf -fi
2. Run ./configure
3. Run make clean && make
4. Run test suite
5. Test Supabase integration with different regions

## 7. Files That Need Modification

### Critical Path (Minimum changes):
1. `/opt/unicornscan-0.4.7/src/unicorn_defs.h` - CREATE NEW
2. `/opt/unicornscan-0.4.7/src/config.h.in` - MAJOR EDIT (remove manual code)
3. `/opt/unicornscan-0.4.7/src/settings.h` - Add supabase_region field
4. `/opt/unicornscan-0.4.7/src/supabase_setup.c` - Add region to config
5. `/opt/unicornscan-0.4.7/src/getconfig.c` - Add region option parsing
6. `/opt/unicornscan-0.4.7/src/output_modules/database/pgsqldb.c` - Use region

### Optional (for cleaner architecture):
7. All 87 source files - Change `#include <config.h>` to include unicorn_defs.h explicitly

### Build system:
8. `/opt/unicornscan-0.4.7/src/Makefile.am` - Add unicorn_defs.h to dist/install

## 8. Testing Plan

### Unit Tests:
1. Test autoheader regeneration (should not fail)
2. Test compilation of all modules
3. Test Supabase connection with different regions
4. Test region auto-detection and manual override

### Integration Tests:
1. Full scan with PostgreSQL output to each region
2. Test --supabase-setup wizard with region selection
3. Test config file parsing with region field
4. Test command-line override: --supabase-region eu-west-1

### Regression Tests:
1. Ensure existing functionality unchanged
2. Test backwards compatibility (old config files without region)
3. Test default behavior (should use us-west-2 if no region specified)

## 9. Additional Issues Found

### compile.h
Currently:
```c
#define COMPILE_STR "Compiled by robert on Linux tadpole 6.17.0-8-generic x86_64 at Thu Dec 18 10:07:04 PST 2025 with gcc version 15.2.015.2.044"
```

This is fine - it's auto-generated by build system, not managed by autotools.

### globalheaders.h
Included at end of config.h.in (line 367). Need to verify this doesn't have circular dependencies with unicorn_defs.h.

## 10. Recommended Implementation Order

### Immediate (Critical fix for autotools):
1. Create unicorn_defs.h with all manual content from config.h.in
2. Strip config.h.in to only autoheader-managed content
3. Add `#include <unicorn_defs.h>` at end of config.h.in
4. Test autoheader regeneration

### Short-term (Supabase region support):
5. Add supabase_region to settings_t
6. Update supabase_setup.c to handle region in config file
7. Update getconfig.c to parse --supabase-region option
8. Update pgsqldb.c to build region-specific pooler hostname

### Long-term (Architecture cleanup):
9. Consider moving unicorn_defs.h include to each source file explicitly
10. Review globalheaders.h for circular dependencies
11. Document the new structure in docs/

## 11. Risk Assessment

### Low Risk:
- Creating unicorn_defs.h (doesn't affect existing code)
- Adding region field to settings_t (new optional field)

### Medium Risk:
- Stripping config.h.in (could break compilation if done wrong)
- Changing 87 source files to include unicorn_defs.h (tedious, error-prone)

### Mitigation:
- Use git to track changes at each step
- Test compilation after each phase
- Keep config.h.in including unicorn_defs.h (source files unchanged)

## 12. Success Criteria

### Must Have:
1. autoheader runs without errors
2. All source files compile without warnings
3. Supabase works with configurable region
4. Existing functionality unaffected

### Should Have:
5. Clean separation of autotools-managed vs manual code
6. Documentation of new architecture
7. Backwards compatibility with old configs

### Nice to Have:
8. Explicit unicorn_defs.h includes in source files
9. Automated tests for region detection
10. Migration guide for users

---

## Conclusion

The root cause of the autotools issue is **mixing manual code with autoheader-managed placeholders in config.h.in**. The fix is straightforward:

1. **Create unicorn_defs.h** with all manual definitions
2. **Clean config.h.in** to only contain autoheader placeholders
3. **Include unicorn_defs.h** from config.h (or from each source file)

The Supabase region issue is **orthogonal but related**:

1. **Add supabase_region** field to settings_t
2. **Update config parsing** to handle region
3. **Build pooler hostname** dynamically based on region

Both fixes can be implemented independently, but should be done together for a coherent release.

**Estimated Effort:**
- Autotools fix: 2-4 hours
- Supabase region: 2-3 hours
- Testing: 1-2 hours
- Total: 5-9 hours

**Risk Level:** Medium (structural change to build system)

**Recommended Approach:** Incremental, with testing at each phase
