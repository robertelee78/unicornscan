/**********************************************************************
 * Copyright (C) 2004-2006 (Jack Louis) <jack@rapturesecurity.org>    *
 *                                                                    *
 * This program is free software; you can redistribute it and/or      *
 * modify it under the terms of the GNU General Public License        *
 * as published by the Free Software Foundation; either               *
 * version 2 of the License, or (at your option) any later            *
 * version.                                                           *
 *                                                                    *
 * This program is distributed in the hope that it will be useful,    *
 * but WITHOUT ANY WARRANTY; without even the implied warranty of     *
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the      *
 * GNU General Public License for more details.                       *
 *                                                                    *
 * You should have received a copy of the GNU General Public License  *
 * along with this program; if not, write to the Free Software        *
 * Foundation, Inc., 675 Mass Ave, Cambridge, MA 02139, USA.          *
 **********************************************************************/
#include <config.h>

#include <errno.h>
#include <grp.h>
#include <pwd.h>

#ifdef HAVE_SANDBOX_H
#include <dlfcn.h>
#endif

#include <settings.h>

#include <unilib/xmalloc.h>
#include <unilib/output.h>
#include <unilib/arch.h>

#ifdef HAVE_SANDBOX_H
#include <sandbox.h>

/*
 * Private SPI types from libsandbox.1.dylib.
 * These structs are opaque -- we never dereference them directly;
 * all access goes through the SPI functions resolved at runtime.
 */
typedef struct _sandbox_profile sandbox_profile_t;
typedef struct _sandbox_params  sandbox_params_t;

typedef sandbox_params_t  *(*fn_create_params)(void);
typedef void               (*fn_free_params)(sandbox_params_t *);
typedef sandbox_profile_t *(*fn_compile_file)(const char *, sandbox_params_t *, char **);
typedef int                (*fn_apply)(sandbox_profile_t *);
typedef void               (*fn_free_profile)(sandbox_profile_t *);

#endif /* HAVE_SANDBOX_H */

#if 0
#define ROUTE_FILE "/proc/net/route"

#include <dnet.h>

#if defined(HAVE_PROC_NET_ROUTE)

int get_default_route_interface(char **dev_name, uint32_t low_ip, uint32_t high_ip) {
	FILE *route_file=NULL;
	char devname[32], fbuf[128];
	int ret=0, flags=0, refcnt=0, use=0, metric=0, mtu=0;
	uint32_t mask=0, gateway=0, dest=0;

	assert(dev_name != NULL);

	route_file=fopen(ROUTE_FILE, "r");
	if (route_file == NULL) {
		ERR("open route file fails: %s", strerror(errno));
		return -1;
	}

	if (fgets(fbuf, sizeof(fbuf) -1, route_file) == NULL) {
		ERR("cant read route file: %s", strerror(errno));
		return -1;
	}

	while (1) {
		if (fgets(fbuf, sizeof(fbuf) -1, route_file) == NULL) break;

		memset(devname, 0, sizeof(devname));
		if (strlen(fbuf) < 5) continue;
		/*                 If  DstGw Fl RC U  M  Mask Mtu Window IRTT */
		if (sscanf(fbuf, "%31s %x %x %d %d %d %d %x %d",
			devname, &dest, &gateway, &flags, &refcnt, &use, &metric, &mask, &mtu) >5) {
			uint32_t route_low=0, route_high=0;

			route_low=ntohl(dest);
			route_high=ntohl(dest) | ~(ntohl(mask));

			if (route_low <= low_ip && route_high >= high_ip) {

				*dev_name=xstrdup(devname);
				fclose(route_file);

				return 1;
			}

			DBG(M_RTE, "route for %s dest %08x gateway %08x flags %d refcnt %d use %d metric %d mask %08x and mtu %d", devname, ntohl(dest), ntohl(gateway), flags, refcnt, use, metric, ntohl(mask), mtu);
		}
	}
	fclose(route_file);

	return ret;
}

#else

#include <pcap.h>
/* heh, ok its crunch time, lets hear it for pcap everyone! */

int get_default_route_interface(char **dev_name, uint32_t low_ip, uint32_t high_ip) {
	char errbuf[PCAP_ERRBUF_SIZE];

	memset(errbuf, 0, sizeof(errbuf));
	*dev_name=pcap_lookupdev(errbuf);
	if (*dev_name == NULL) {
		ERR("pcap_lookupdev fails: `%s'", errbuf);
		return -1;
	}
	return 1;
}
#endif

int get_interface_info(const char *iname, interface_info_t *ii) {
	char buf[1024];
	union {
		struct intf_entry *e;
		char *buf;
	} e_u;
	uint32_t ipaddr=0;
	uint8_t ethaddr[THE_ONLY_SUPPORTED_HWADDR_LEN];
	struct in_addr ia;
	intf_t *intf=NULL;

	assert(iname != NULL && strlen(iname) && ii != NULL);

	memset(buf, 0, sizeof(buf));
	memset(ethaddr, 0, sizeof(ethaddr));

	e_u.buf=buf;

	e_u.e->intf_len=sizeof(buf);
	intf=intf_open();
	if (intf == NULL) {
		ERR("cant open interface: %s", strerror(errno));
		return -1;
	}

	memcpy(e_u.e->intf_name, iname, MIN(sizeof(e_u.e->intf_name) -1, strlen(iname)));

	if (intf_get(intf, e_u.e) < 0) {
		ERR("cant get interface information: %s", strerror(errno));
		return -1;
	}

	if (e_u.e->intf_addr.addr_type == ADDR_TYPE_IP) {
		ipaddr=e_u.e->intf_addr.addr_ip;
	}

	if (e_u.e->intf_link_addr.addr_type == ADDR_TYPE_ETH) {
		memcpy(ethaddr, e_u.e->intf_link_addr.addr_data8, THE_ONLY_SUPPORTED_HWADDR_LEN);
	}

	ii->mtu=e_u.e->intf_mtu;
	memcpy(ii->hwaddr, ethaddr, THE_ONLY_SUPPORTED_HWADDR_LEN);

	sprintf(ii->hwaddr_s, "%02x:%02x:%02x:%02x:%02x:%02x",
		ethaddr[0], ethaddr[1], ethaddr[2],
		ethaddr[3], ethaddr[4], ethaddr[5]
	);

	ii->myaddr.sin_addr.s_addr=ipaddr;
	ia.s_addr=ipaddr;
	sprintf(ii->myaddr_s, "%s", inet_ntoa(ia));

	DBG(M_RTE, "intf %s mtu %u addr %08x ethaddr %02x:%02x:%02x:%02x:%02x:%02x",
		e_u.e->intf_name, e_u.e->intf_mtu,
		ipaddr,
		ethaddr[0], ethaddr[1], ethaddr[2], ethaddr[3], ethaddr[4], ethaddr[5]
	);

	return 1;
}

#endif

#ifdef WITH_SELINUX
int drop_privs(void) {
	return 1;
}
int apply_sandbox_profile(const char *profile_path) {
	return 0;
}
#else

#ifdef HAVE_SANDBOX_INIT
/*
 * apply_sandbox - Apply a macOS sandbox profile to the current process.
 *
 * Loads libsandbox.1.dylib at runtime via dlopen/dlsym and resolves the
 * private SPI functions sandbox_compile_file() and sandbox_apply().
 * These are the underlying implementation functions that sandbox_init()
 * wrapped before it was deprecated in macOS 10.8.
 *
 * sandbox_init() itself only accepts Apple's built-in profile constants
 * (kSBXProfileNoNetwork, etc.) via SANDBOX_NAMED -- it rejects custom
 * .sb file paths on macOS 10.15+. The SPI functions have no such
 * restriction and were confirmed working on macOS 26.3.1.
 *
 * Using dlopen/dlsym means the binary degrades gracefully on any future
 * macOS that removes the SPI: if symbols are absent, the function logs
 * a VRB(1) message and returns 0 (non-fatal), identical to today's
 * behaviour.
 *
 * The profile path is passed as a parameter.  For the listener, this is
 * SANDBOX_PROFILE (@datadir@/unicornscan/unicornscan-listener.sb).
 * For the sender, this is SANDBOX_PROFILE_SENDER
 * (@datadir@/unicornscan/unicornscan-sender.sb).
 *
 * Returns: 1 on success (sandbox applied),
 *          0 if sandbox was not applied (non-fatal -- scan proceeds),
 *         -1 on hard failure (sandbox_apply() returned non-zero).
 */
int apply_sandbox_profile(const char *profile_path) {
	void *libsb=NULL;
	fn_create_params  sb_create_params=NULL;
	fn_free_params    sb_free_params=NULL;
	fn_compile_file   sb_compile_file=NULL;
	fn_apply          sb_apply=NULL;
	fn_free_profile   sb_free_profile=NULL;
	sandbox_params_t  *params=NULL;
	sandbox_profile_t *profile=NULL;
	char *error=NULL;
	int rc=0;

	if (profile_path == NULL || profile_path[0] == '\0') {
		DBG(M_CLD, "no sandbox profile path provided, sandbox skipped");
		return 0;
	}

	/*
	 * Resolve SPI symbols at runtime so the binary works on any macOS
	 * that has the library present.  RTLD_LOCAL prevents the handle
	 * from polluting the global symbol namespace.
	 */
	libsb=dlopen("/usr/lib/libsandbox.1.dylib", RTLD_LAZY | RTLD_LOCAL);
	if (libsb == NULL) {
		VRB(1, "libsandbox not available, sandbox skipped: %s", dlerror());
		return 0;
	}

	sb_create_params=(fn_create_params) dlsym(libsb, "sandbox_create_params");
	sb_free_params  =(fn_free_params)   dlsym(libsb, "sandbox_free_params");
	sb_compile_file =(fn_compile_file)  dlsym(libsb, "sandbox_compile_file");
	sb_apply        =(fn_apply)         dlsym(libsb, "sandbox_apply");
	sb_free_profile =(fn_free_profile)  dlsym(libsb, "sandbox_free_profile");

	/* compile_file and apply are the two non-negotiable symbols */
	if (sb_compile_file == NULL || sb_apply == NULL) {
		VRB(1, "sandbox SPI symbols not found, sandbox skipped");
		dlclose(libsb);
		return 0;
	}

	/* create_params is optional; pass NULL if missing */
	if (sb_create_params != NULL) {
		params=sb_create_params();
	}

	profile=sb_compile_file(profile_path, params, &error);

	if (sb_free_params != NULL && params != NULL) {
		sb_free_params(params);
	}

	if (profile == NULL) {
		VRB(1, "sandbox_compile_file(`%s') failed: %s", profile_path,
			error ? error : "(null)");
		dlclose(libsb);
		return 0;
	}

	rc=sb_apply(profile);

	if (sb_free_profile != NULL) {
		sb_free_profile(profile);
	}

	dlclose(libsb);

	if (rc != 0) {
		ERR("sandbox_apply failed (rc=%d)", rc);
		return -1;
	}

	VRB(1, "macOS sandbox applied from `%s'", profile_path);
	return 1;
}
#else
/* non-macOS stub: sandbox not available */
int apply_sandbox_profile(const char *profile_path) {
	return 0;
}
#endif /* HAVE_SANDBOX_INIT */

int drop_privs(void) {
	struct passwd *pw_ent=NULL;
	uid_t myuid;
	gid_t mygid;

	pw_ent=getpwnam(NOPRIV_USER);
	assert(pw_ent != NULL);

	myuid=pw_ent->pw_uid;
	mygid=pw_ent->pw_gid;

	/*
	 * If we are already running as a non-root user (e.g., via macOS
	 * ChmodBPF group access or similar non-setuid setup), then we
	 * cannot setreuid/setregid to NOPRIV_USER -- only root can change
	 * to a different user. In this case, skip the UID/GID drop since
	 * we are already unprivileged.
	 */
	if (getuid() != 0) {
		VRB(1, "already running as non-root (uid %d), skipping privilege drop", getuid());
#ifdef HAVE_SANDBOX_INIT
		if (apply_sandbox_profile(SANDBOX_PROFILE) < 0) {
			ERR("sandbox apply returned hard failure");
			return -1;
		}
#endif
		return 1;
	}

	/* XXX audit open fd's */

#ifdef HAVE_SANDBOX_INIT
	/*
	 * On macOS, apply the sandbox profile before dropping UID/GID.
	 * The profile restricts file access, prevents process spawning,
	 * and limits system calls -- stronger isolation than chroot.
	 *
	 * Applied BEFORE the UID drop because:
	 *   1. sandbox_compile_file() does not require root
	 *   2. once applied the sandbox cannot be removed regardless of
	 *      privilege level, so ordering does not matter for security
	 *   3. the UID drop then happens inside the sandbox (defence in depth)
	 *
	 * chdir to CHROOT_DIR for consistency with the Linux path -- the
	 * working directory will be the state directory either way.
	 */
	if (chdir(CHROOT_DIR) < 0) {
		/* non-fatal on macOS: directory may not exist under Homebrew */
		DBG(M_CLD, "chdir to `%s' fails: %s (continuing)", CHROOT_DIR,
			strerror(errno));
	}

	if (apply_sandbox_profile(SANDBOX_PROFILE) < 0) {
		ERR("sandbox apply returned hard failure");
		return -1;
	}
#else
	/*
	 * On Linux and other systems, use traditional chroot() to jail
	 * the listener process into CHROOT_DIR (LOCALSTATEDIR/TARGETNAME,
	 * typically /usr/local/var/unicornscan). This limits filesystem
	 * access to that subtree after the call.
	 *
	 * Note: chroot() was removed from POSIX.1-2001 and may not be
	 * declared when _POSIX_C_SOURCE >= 200112L. We provide our own
	 * declaration for portability.
	 */
	{
	extern int chroot(const char *);
	if (chdir(CHROOT_DIR) < 0) {
		ERR("chdir to `%s' fails", CHROOT_DIR);
		return -1;
	}

	if (chroot(CHROOT_DIR) < 0) {
		ERR("chroot to `%s' fails", CHROOT_DIR);
		return -1;
	}

	if (chdir("/") < 0) {
		ERR("chdir to / fails");
		return -1;
	}
	} /* end chroot block scope */
#endif /* HAVE_SANDBOX_INIT */

	/*
	 * Clear supplementary groups before dropping GID/UID.
	 * setresgid/setregid/setgid alone do not remove supplementary
	 * groups inherited from the root session (e.g., wheel, admin on
	 * macOS). A process that retains root supplementary groups after
	 * the UID drop can still access group-restricted resources.
	 * setgroups(1, &mygid) replaces the entire supplementary group
	 * list with exactly one entry: the target GID.
	 */
	if (setgroups(1, &mygid) != 0) {
		ERR("setgroups fails: %s", strerror(errno));
		return -1;
	}

#if defined(USE_SETRES)
	if (setresgid(mygid, mygid, mygid) != 0) {
		ERR("setresgid fails: %s", strerror(errno));
		return -1;
	}
	if (setresuid(myuid, myuid, myuid) != 0) {
		ERR("setresuid fails: %s", strerror(errno));
		return -1;
	}

#elif defined(USE_SETRE)
	if (setregid(mygid, mygid) != 0) {
		ERR("setregid fails: %s", strerror(errno));
		return -1;
	}
	if (setreuid(myuid, myuid) != 0) {
		ERR("setreuid fails: %s", strerror(errno));
		return -1;
	}
#else
	if (setgid(mygid) != 0) {
		ERR("setgid fails: %s", strerror(errno));
		return -1;
	}
	if (setegid(mygid) != 0) {
		ERR("setegid fails: %s", strerror(errno));
		return -1;
	}
	if (setuid(myuid) != 0) {
		ERR("setuid fails: %s", strerror(errno));
		return -1;
	}
	if (seteuid(myuid) != 0) {
		ERR("seteuid fails: %s", strerror(errno));
		return -1;
	}
#endif

	/* better check? */
	if (getuid() != myuid || geteuid() != myuid) {
		ERR("drop privs failed for uid");
		return -1;
	}
	if (getgid() != mygid || getegid() != mygid) {
		ERR("drop privs failed for gid");
		return -1;
	}

	return 1;
}
#endif
