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
#include <pwd.h>

#include <settings.h>

#include <unilib/xmalloc.h>
#include <unilib/output.h>
#include <unilib/arch.h>

#ifdef HAVE_SANDBOX_H
#include <sandbox.h>
#endif

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
#else

#ifdef HAVE_SANDBOX_INIT
/*
 * apply_sandbox - Apply a macOS sandbox profile to the current process.
 *
 * Reads a sandbox profile from disk and passes it to sandbox_init()
 * with SANDBOX_NAMED. This replaces chroot() on macOS
 * because:
 *   1. chroot() on macOS requires root and is poorly supported
 *   2. sandbox profiles provide finer-grained control (network, IPC,
 *      sysctl, file reads) than a simple filesystem jail
 *   3. The sandbox persists for the lifetime of the process and cannot
 *      be escaped, unlike chroot on some systems
 *
 * The profile path is set at compile time via SANDBOX_PROFILE (from
 * configure --datadir). Falls back gracefully if the profile is missing
 * or sandbox_init() fails, since some macOS versions or configurations
 * may not support it.
 *
 * Returns: 1 on success, 0 if sandbox was not applied (non-fatal),
 *         -1 on hard failure.
 */
static int apply_sandbox(void) {

	/*
	 * sandbox_init() was deprecated in macOS 10.8 and the
	 * SANDBOX_NAMED flag only accepts Apple's built-in profile
	 * constants (kSBXProfileNoNetwork, etc.), not inline Scheme
	 * text or file paths. Our custom .sb profile cannot be loaded
	 * through this API on modern macOS (10.15+).
	 *
	 * XXX investigate sandbox_exec or App Sandbox entitlements
	 * as a replacement for process-level sandboxing on macOS.
	 * For now, rely on non-root BPF access via ChmodBPF and
	 * the existing privilege drop in drop_privs().
	 */
	DBG(M_CLD, "macOS sandbox_init() is deprecated, sandboxing skipped");
	VRB(2, "sandbox not available on this macOS version");

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
	 * cannot setreuid/setregid to NOPRIV_USER — only root can change
	 * to a different user. In this case, skip the UID/GID drop since
	 * we are already unprivileged.
	 */
	if (getuid() != 0) {
		VRB(1, "already running as non-root (uid %d), skipping privilege drop", getuid());
#ifdef HAVE_SANDBOX_INIT
		if (apply_sandbox() < 0) {
			ERR("sandbox apply returned hard failure");
			return -1;
		}
#endif
		return 1;
	}

	/* XXX audit open fd's */

#ifdef HAVE_SANDBOX_INIT
	/*
	 * On macOS, use sandbox_init() instead of chroot(). The sandbox
	 * profile restricts file access, prevents process spawning, and
	 * limits system calls -- providing stronger isolation than chroot.
	 *
	 * The sandbox is applied BEFORE dropping UID/GID because:
	 *   1. sandbox_init() itself does not require root
	 *   2. The sandbox cannot be removed once applied, regardless of
	 *      privilege level, so order does not matter for security
	 *   3. Applying it first means the UID drop also happens inside
	 *      the sandbox, adding defense in depth
	 *
	 * We chdir to CHROOT_DIR for consistency with the Linux path --
	 * the working directory will be the state directory either way.
	 */
	if (chdir(CHROOT_DIR) < 0) {
		/* Non-fatal on macOS: the directory may not exist if installed
		 * via Homebrew without running the full install target */
		DBG(M_CLD, "chdir to `%s' fails: %s (continuing)", CHROOT_DIR,
			strerror(errno));
	}

	if (apply_sandbox() < 0) {
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
