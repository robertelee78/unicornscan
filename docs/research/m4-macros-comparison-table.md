# M4 Macros: Original vs Current - Quick Reference

## Macro Location Comparison

| Macro Name | Original Location | Current Location | Status | Used in configure.ac? |
|------------|------------------|------------------|--------|----------------------|
| **Unicornscan Custom Macros** |
| AC_UNI_SELINUX | aclocal.m4 | m4/unim4.m4 | ✅ Preserved | No (commented out) |
| AC_UNI_PRNG | aclocal.m4 | m4/unim4.m4 | ✅ Preserved | ✅ Yes |
| AC_UNI_LIBDNET | aclocal.m4 | m4/unim4.m4 | ✅ Preserved | ✅ Yes |
| AC_UNI_PROCNETROUTE | aclocal.m4 | m4/unim4.m4 | ✅ Preserved | ✅ Yes |
| AC_UNI_LIBPCAP | aclocal.m4 | m4/unim4.m4 | ✅ Preserved | ✅ Yes |
| AC_UNI_LIBLTDL | aclocal.m4 | m4/unim4.m4 | ✅ Preserved | ✅ Yes |
| **LBL (Lawrence Berkeley Lab) Macros** |
| AC_LBL_C_INIT | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | ✅ Yes |
| AC_LBL_C_INLINE | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_LBL_LIBPCAP | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_LBL_TYPE_SIGNAL | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_LBL_FIXINCLUDES | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_LBL_LEX_AND_YACC | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_LBL_UNION_WAIT | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_LBL_SOCKADDR_SA_LEN | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_LBL_HAVE_RUN_PATH | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_LBL_CHECK_TYPE | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_LBL_UNALIGNED_ACCESS | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_LBL_DEVEL | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_LBL_LIBRARY_NET | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | ✅ Yes |
| **WIDE Project IPv6 Macros** |
| AC_CHECK_AF_INET6 | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_CHECK_SA_LEN | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_CHECK_PORTABLE_PROTO | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_CHECK_BITTYPES | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_STRUCT_ADDRINFO | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_NI_MAXSERV | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_NI_NAMEREQD | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_STRUCT_SA_STORAGE | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_CHECK_ADDRSZ | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_CHECK_RES_USE_INET6 | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_CHECK_AAAA | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_STRUCT_RES_STATE_EXT | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_STRUCT_RES_STATE | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_VAR_H_ERRNO | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| AC_C___ATTRIBUTE__ | aclocal.m4 | m4/pcap.m4 | ✅ Preserved | No |
| **Compiler Attribute Detection** |
| AX_C___ATTRIBUTE__ | m4/ax_c___attribute__.m4 | m4/ax_c___attribute__.m4 | ✅ Unchanged | No |

## File Size Comparison

| File | Original (2006) | Current (2025) | Change | Reason |
|------|----------------|----------------|--------|---------|
| aclocal.m4 | 244 KB (7,397 lines) | 14 KB (366 lines) | -94% | Macros moved to m4/ (correct) |
| m4/pcap.m4 | ~30 KB | 33 KB | +10% | Modernized syntax |
| m4/unim4.m4 | ~4 KB | 4.5 KB | +12% | Added descriptions |
| m4/libtool.m4 | 212 KB (serial 47) | 311 KB (2.4.x) | +47% | Upgraded libtool version |

## Syntax Modernization Examples

### AC_DEFINE Updates (m4/unim4.m4)

**Original:**
```autoconf
AC_DEFINE(WITH_SELINUX)
AC_DEFINE(RANDOM_DEVICE, "$g")
AC_DEFINE(HAVE_PROC_NET_ROUTE)
```

**Current:**
```autoconf
AC_DEFINE([WITH_SELINUX], [1], [Define if SELinux support is enabled])
AC_DEFINE_UNQUOTED([RANDOM_DEVICE], ["$g"], [Path to random device])
AC_DEFINE([HAVE_PROC_NET_ROUTE], [1], [Define if /proc/net/route is available])
```

### Compilation Test Updates (m4/pcap.m4)

**Original:**
```autoconf
AC_TRY_COMPILE(
    [#include <sys/types.h>],
    [int frob(int, char *)],
    ac_cv_lbl_cc_ansi_prototypes=yes,
    ac_cv_lbl_cc_ansi_prototypes=no)
```

**Current:**
```autoconf
AC_COMPILE_IFELSE([AC_LANG_PROGRAM([[#include <sys/types.h>]],
    [[int frob(int, char *);]])],
    [ac_cv_lbl_cc_ansi_prototypes=yes],
    [ac_cv_lbl_cc_ansi_prototypes=no])
```

### Dependency Handling Updates

**Original:**
```autoconf
AC_BEFORE([$0], [AC_PROG_CC])
AC_PROG_CC
```

**Current:**
```autoconf
dnl Use AC_REQUIRE to ensure AC_PROG_CC is expanded only once
AC_REQUIRE([AC_PROG_CC])
```

## Libtool Version Comparison

| Aspect | Original (2006) | Current (2025) |
|--------|----------------|----------------|
| Version | 1.5.x (serial 47) | 2.4.7+ |
| Copyright | 1996-2004 | 1996-2024 |
| Structure | Single m4/libtool.m4 | Split into 5 files |
| Files | libtool.m4 | libtool.m4, ltoptions.m4, ltsugar.m4, ltversion.m4, lt~obsolete.m4 |
| Size | 212 KB | 311 KB total |

## Summary Statistics

### Macros by Category

| Category | Count | All Preserved? | Used in configure.ac? |
|----------|-------|----------------|----------------------|
| UNI Custom | 6 | ✅ Yes | 5 of 6 |
| LBL Core | 13 | ✅ Yes | 2 of 13 |
| WIDE IPv6 | 15 | ✅ Yes | 0 of 15 |
| Compiler | 1 | ✅ Yes | 0 of 1 |
| **Total** | **35** | **✅ All 35** | **7 of 35 (20%)** |

### Usage Analysis

- **7 macros** are actively used by configure.ac (CRITICAL)
- **28 macros** are available but unused (AVAILABLE FOR FUTURE USE)
- **0 macros** were lost (ZERO LOSS)

### Risk Assessment

| Risk Category | Status | Impact |
|--------------|--------|--------|
| Build system breakage | ✅ None | All used macros preserved |
| Platform portability | ✅ None | All platform detection macros available |
| Library detection | ✅ None | All library detection macros preserved |
| Future extensibility | ✅ Good | 28 additional macros available |

## Conclusion

**✅ All m4 macro functionality is preserved.**

The apparent "loss" from aclocal.m4 is actually a **reorganization** into proper m4/ files, which is:
- **Correct** for modern autotools
- **Better** for maintainability
- **Safe** for the build system

No restoration or recovery action is needed.
