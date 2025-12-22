dnl Unicornscan custom m4 macros (modernized for autoconf 2.69+)

AC_DEFUN([AC_UNI_SELINUX], [
shlibs=".la"

AC_MSG_CHECKING(for selinux)
default_selinux_directories="/usr /usr/local /usr/local/selinux"
AC_ARG_WITH(selinux,
[  --with-selinux=PREFIX   find selinux headers and libs in this PREFIX],
[lookin="$withval"],
[lookin="$default_selinux_directories"])

if test "$lookin" = "yes"; then
	lookin="$default_selinux_directories"
fi

good=no
for g in $lookin; do
	if test -r "$g/include/selinux/selinux.h"; then
		SELINUXINC=$g
		AC_MSG_RESULT(yes, found inside $g)
		good=yes
		break
	fi
done
if test $good = "yes"; then
	dnl now check its accually enabled, due to the large number of systems with it only installed
	dnl obviously this doesnt work for cross compile XXX
	AC_MSG_CHECKING(checking that selinux is enforcing)
	enforce=0
	if test -r /selinux/enforce; then
		enforce=`cat /selinux/enforce`
	fi
	if test $enforce = 1; then
		CHCON=chcon
		SP_MODE=4511
		UNILDADD="${UNILDADD} -lselinux"
		shlibs=".so"
		AC_DEFINE([WITH_SELINUX], [1], [Define if SELinux support is enabled])
		AC_MSG_RESULT([yes, sender and listener will be setuid root])
	else
		CHCON=true
		SP_MODE=755
		AC_MSG_RESULT(no, selinux is not enforcing, ignoring it)
	fi
else
	CHCON=true
	SP_MODE=755
	AC_MSG_RESULT(no)
fi

AC_SUBST(CHCON)
AC_SUBST(SP_MODE)
AC_DEFINE_UNQUOTED([SHLIB_EXT], ["$shlibs"], [Shared library extension])
])

AC_DEFUN([AC_UNI_PRNG], [
AC_MSG_CHECKING(for a readable prng device)
default_prng_paths="/dev/urandom /etc/random /dev/egd-pool"
AC_ARG_WITH(prng,
[  --with-prng=PATH        Use random number generator specificed by PATH],
[lookat="$withval"],
[lookat="$default_prng_paths"])

if test "$lookat" = "yes"; then
        lookat="$default_prng_paths"
fi

good=no
for g in $lookat; do
	if test -c "$g"
	then
		AC_DEFINE_UNQUOTED([RANDOM_DEVICE], ["$g"], [Path to random device])
		AC_MSG_RESULT([yes found at $g])
		good=yes
		break
	elif test -S "$g"
	then
		AC_DEFINE_UNQUOTED([RANDOM_DEVICE], ["$g"], [Path to random device])
		AC_MSG_RESULT([yes found at $g])
		good=yes
		break
	fi
done

if test $good = "no"; then
	AC_MSG_WARN([cannot find a working random number generator, will try and make due])
	AC_DEFINE([RANDOM_DEVICE], [""], [Path to random device])
fi
AC_SUBST(RANDOM_DEVICE)
])

AC_DEFUN([AC_UNI_LIBDNET], [
AC_MSG_CHECKING(for libdnet/libdumbnet)
default_libdnet_directories="/usr /usr/local"
lookin=$default_libdnet_directories
AC_ARG_WITH(libdnet,
[  --with-libdnet=PREFIX   use already installed libdnet in PREFIX
],
[
case "$dnet_pfx" in
no)
	lookin=""
	;;
yes)
	lookin=$default_libdnet_directories
	;;
*)
	lookin=$dnet_pfx
	;;
esac
])
good=no
if test "$lookin"; then
 	for g in $lookin; do
		if test -x "$g/bin/dnet-config"; then
			DNETLIBS=`$g/bin/dnet-config --libs`
			DNETCFLG=`$g/bin/dnet-config --cflags`
			AC_MSG_RESULT(yes, found dnet-config inside $g)
			good=yes
			break
		elif test -x "$g/bin/dumbnet-config"; then
			DNETLIBS=`$g/bin/dumbnet-config --libs`
			DNETCFLG=`$g/bin/dumbnet-config --cflags`
			AC_MSG_RESULT(yes, found dumbnet-config inside $g)
			good=yes
			break
		fi
	done
fi
dnl Try pkg-config as fallback (Debian/Ubuntu use libdumbnet)
if test $good = "no"; then
	PKG_CHECK_MODULES([DNET], [libdumbnet], [
		DNETLIBS="$DNET_LIBS"
		DNETCFLG="$DNET_CFLAGS"
		AC_MSG_RESULT(yes, via pkg-config libdumbnet)
		good=yes
	], [
		PKG_CHECK_MODULES([DNET], [libdnet], [
			DNETLIBS="$DNET_LIBS"
			DNETCFLG="$DNET_CFLAGS"
			AC_MSG_RESULT(yes, via pkg-config libdnet)
			good=yes
		], [good=no])
	])
fi
dnl Final fallback: try linking directly
if test $good = "no"; then
	AC_CHECK_LIB([dumbnet], [eth_open], [
		DNETLIBS="-ldumbnet"
		DNETCFLG=""
		AC_MSG_RESULT(yes, libdumbnet found)
		good=yes
	], [
		AC_CHECK_LIB([dnet], [eth_open], [
			DNETLIBS="-ldnet"
			DNETCFLG=""
			AC_MSG_RESULT(yes, libdnet found)
			good=yes
		], [good=no])
	])
fi
if test $good = "no"; then
	NEED_AUX_LIBS="${NEED_AUX_LIBS} libdnet"
	DNETLIBS=""
	DNETCFLG=""
	AC_MSG_RESULT(no, using supplied version)
fi
dnl Check for dumbnet.h vs dnet.h header
AC_CHECK_HEADERS([dumbnet.h], [
	AC_DEFINE([HAVE_DUMBNET_H], [1], [Define if dumbnet.h is available])
], [
	AC_CHECK_HEADERS([dnet.h], [], [
		AC_MSG_WARN([Neither dnet.h nor dumbnet.h found])
	])
])
AC_SUBST(DNETCFLG)
AC_SUBST(DNETLIBS)
])

dnl GeoIP/MaxMindDB detection with multiple path search
dnl Uses libmaxminddb for modern .mmdb format (GeoLite2, DB-IP, IPLocate.io, etc.)
AC_DEFUN([AC_UNI_GEOIP], [
AC_MSG_CHECKING([for GeoIP support (libmaxminddb)])

dnl Allow user to specify custom database path
AC_ARG_WITH(geoip-db,
[  --with-geoip-db=PATH    Path to GeoIP database file (.mmdb) or directory],
[geoip_db_path="$withval"],
[geoip_db_path=""])

dnl Check for libmaxminddb (modern, actively maintained)
geoip_found=no
PKG_CHECK_MODULES([MAXMINDDB], [libmaxminddb >= 1.0.0], [
    AC_DEFINE([HAVE_LIBMAXMINDDB], [1], [Define if libmaxminddb is available])
    GEOIP_LIBS="$MAXMINDDB_LIBS"
    GEOIP_CFLAGS="$MAXMINDDB_CFLAGS"
    geoip_found=yes
    AC_MSG_RESULT([yes])
], [
    GEOIP_LIBS=""
    GEOIP_CFLAGS=""
    AC_MSG_RESULT([no (install libmaxminddb-dev)])
])

dnl If user specified a path, validate and use it
if test -n "$geoip_db_path" && test "$geoip_db_path" != "no"; then
    if test -f "$geoip_db_path"; then
        AC_DEFINE_UNQUOTED([GEOIP_DB_PATH], ["$geoip_db_path"], [User-specified GeoIP database path])
        AC_MSG_NOTICE([Using user-specified GeoIP database: $geoip_db_path])
    elif test -d "$geoip_db_path"; then
        AC_DEFINE_UNQUOTED([GEOIP_DB_DIR], ["$geoip_db_path"], [User-specified GeoIP database directory])
        AC_MSG_NOTICE([Using user-specified GeoIP directory: $geoip_db_path])
    else
        AC_MSG_WARN([Specified GeoIP path does not exist: $geoip_db_path])
    fi
fi

AC_SUBST(GEOIP_LIBS)
AC_SUBST(GEOIP_CFLAGS)
])

dnl find /proc/net/route or just give up and cry
AC_DEFUN([AC_UNI_PROCNETROUTE], [
AC_MSG_CHECKING([for a readable /proc/net/route file])
if test -r /proc/net/route; then
	AC_DEFINE([HAVE_PROC_NET_ROUTE], [1], [Define if /proc/net/route is available])
	AC_MSG_RESULT([yes])
else
	AC_MSG_RESULT([no])
fi
])

dnl find pcap, or just make it
AC_DEFUN([AC_UNI_LIBPCAP], [
AC_MSG_CHECKING([for libpcap (http://www.tcpdump.org)])
AC_CHECK_LIB([pcap], [pcap_open_live],[
 AC_MSG_CHECKING([for pcap_lib_version])
 AC_CHECK_LIB([pcap], [pcap_lib_version], [AC_DEFINE([HAVE_PCAP_LIB_VERSION], [1], [Define if pcap_lib_version is available])], [])
 AC_MSG_CHECKING([for pcap_setnonblock])
 AC_CHECK_LIB([pcap], [pcap_setnonblock], [AC_DEFINE([HAVE_PCAP_SET_NONBLOCK], [1], [Define if pcap_setnonblock is available])], [])
 AC_CHECK_LIB([pcap], [pcap_get_selectable_fd], [],
[
  AC_DEFINE([HAVE_PCAP_LIB_VERSION], [1], [Define if pcap_lib_version is available])
  AC_DEFINE([HAVE_PCAP_SET_NONBLOCK], [1], [Define if pcap_setnonblock is available])
  NEED_AUX_LIBS="${NEED_AUX_LIBS} pcap"
]
 )
],
[NEED_AUX_LIBS="${NEED_AUX_LIBS} pcap"
AC_DEFINE([HAVE_PCAP_LIB_VERSION], [1], [Define if pcap_lib_version is available])
AC_DEFINE([HAVE_PCAP_SET_NONBLOCK], [1], [Define if pcap_setnonblock is available])])
])

AC_DEFUN([AC_UNI_LIBLTDL], [
AC_MSG_CHECKING([for libltdl])
AC_CHECK_LIB([ltdl], [lt_dlopen], [], [
NEED_AUX_LIBS="${NEED_AUX_LIBS} libltdl"
])
])
