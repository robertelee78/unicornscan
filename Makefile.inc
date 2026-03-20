# Makefile.inc.  Generated from Makefile.inc.in by configure.

BUILD_DIR=/opt/unicornscan

prefix=/opt/homebrew
exec_prefix=${prefix}
bindir=${exec_prefix}/bin
libexecdir=${exec_prefix}/libexec
localstatedir=/opt/homebrew/var
libdir=${exec_prefix}/lib
sysconfdir=/opt/homebrew/etc
datadir=${prefix}/share
docdir=${prefix}/share/doc
mandir=${prefix}/share/man



MODDIR=${exec_prefix}/lib/unicornscan/modules
DESTDIR ?= 
TARGETNAME=unicornscan

COPTS=-I/opt/homebrew/opt/libdnet/include -I/opt/homebrew/opt/libtool/include -O
CDEFS=  $(DEFS) -DLIBDIR=\"${exec_prefix}/lib\" -DSYSCONFDIR=\"/opt/homebrew/etc\" -DLIBEXECDIR=\"${exec_prefix}/libexec\" -DLOCALSTATEDIR=\"/opt/homebrew/var\" -DPROGNAME=\"unicornscan\" -DSANDBOX_PROFILE=\"${prefix}/share/unicornscan/unicornscan-listener.sb\"
CINCS= -I/opt/homebrew/opt/libpcap/include -I/opt/homebrew/include   -I$(BUILD_DIR)/src -I$(BUILD_DIR)/libs/fake/include -I$(BUILD_DIR)/ext_src
LDFLAGS=-L/opt/homebrew/opt/libdnet/lib -L/opt/homebrew/opt/libtool/lib -L/opt/homebrew/opt/libpcap/lib -L/opt/homebrew/lib -L/opt/homebrew/opt/libdnet/lib -L/opt/homebrew/opt/libtool/lib    -luext -lltdl -lpcap  -L$(BUILD_DIR)/libs/fake/lib -L$(BUILD_DIR)/ext_src

CC=gcc
CFLAGS=$(COPTS) $(CDEFS) $(CINCS) $(CDEPS)
SHELL=/bin/sh

#LIBTOOL_DEPS=./autostuff//ltmain.sh
LIBTOOL=$(SHELL) $(BUILD_DIR)/libtool --quiet

USE_MAKE=/opt/homebrew/bin/gmake
AR=ar
ARFLAGS=cru
AWK=awk
LN=ln -s
RANLIB=ranlib
EGREP=/opt/homebrew/bin/ggrep -E
CHCON=true
BISON=bison -d
FLEX=flex -s -B
INSTALL=/opt/homebrew/bin/ginstall -c
INSTALL_PROGRAM=${INSTALL}

MODCLFLAGS=-module -export-dynamic -rpath $(MODDIR) -avoid-version

%.lo: %.c
	$(LIBTOOL) --mode=compile $(CC) $(CFLAGS) -c $<
