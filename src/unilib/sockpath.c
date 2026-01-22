/**********************************************************************
 * Copyright (C) 2026 Robert E. Lee <robert@unicornscan.org>          *
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
/*
 * sockpath.c - Runtime socket path determination for non-root operation
 *
 * This module determines socket paths at runtime to support non-root
 * operation with Linux capabilities. Instead of using a system-wide
 * directory (/var/unicornscan) that requires special permissions, we
 * use XDG_RUNTIME_DIR for per-user, per-session socket storage.
 */
#include <config.h>

#include <errno.h>
#include <pwd.h>

#include <settings.h>

#include <unilib/output.h>
#include <unilib/sockpath.h>

/* Static buffers for path storage */
static char sockdir_buf[PATH_MAX];
static char sender_uri_buf[PATH_MAX + 16];
static char listener_uri_buf[PATH_MAX + 16];
static int sockdir_initialized = 0;

/*
 * Create directory with specified permissions.
 * Returns 0 on success (dir exists or created), -1 on error.
 */
static int ensure_dir(const char *path, mode_t mode) {
	struct stat sb;

	if (stat(path, &sb) == 0) {
		if (S_ISDIR(sb.st_mode)) {
			/* Directory exists - verify it's ours */
			if (sb.st_uid == getuid()) {
				return 0;
			}
			/* Directory exists but owned by someone else */
			ERR("socket directory %s exists but is owned by uid %d, not us (%d)",
			    path, sb.st_uid, getuid());
			return -1;
		}
		/* Exists but not a directory */
		ERR("path %s exists but is not a directory", path);
		return -1;
	}

	/* Directory doesn't exist, create it */
	if (mkdir(path, mode) < 0) {
		if (errno == EEXIST) {
			/* Race condition - someone else created it */
			return 0;
		}
		ERR("failed to create socket directory %s: %s", path, strerror(errno));
		return -1;
	}

	return 0;
}

const char *sockpath_get_dir(void) {
	const char *xdg_runtime;
	uid_t uid;

	/* Return cached value if already initialized */
	if (sockdir_initialized) {
		return sockdir_buf;
	}

	uid = getuid();

	/*
	 * If running as root, use the traditional /var/unicornscan directory.
	 * Root has full access and may want to use chroot functionality.
	 */
	if (uid == 0) {
		snprintf(sockdir_buf, sizeof(sockdir_buf), "%s/%s",
		         LOCALSTATEDIR, TARGETNAME);

		if (ensure_dir(sockdir_buf, 0755) < 0) {
			return NULL;
		}

		sockdir_initialized = 1;
		DBG(M_SCK, "using root socket directory: %s", sockdir_buf);
		return sockdir_buf;
	}

	/*
	 * For non-root users, prefer XDG_RUNTIME_DIR which is:
	 * - Per-user and per-session
	 * - Automatically cleaned up on logout
	 * - Properly secured (mode 0700, owned by user)
	 * - Standard location on modern Linux (/run/user/$UID)
	 */
	xdg_runtime = getenv("XDG_RUNTIME_DIR");
	if (xdg_runtime != NULL && strlen(xdg_runtime) > 0) {
		struct stat sb;

		/* Verify XDG_RUNTIME_DIR exists and is accessible */
		if (stat(xdg_runtime, &sb) == 0 && S_ISDIR(sb.st_mode)) {
			snprintf(sockdir_buf, sizeof(sockdir_buf), "%s/unicornscan",
			         xdg_runtime);

			if (ensure_dir(sockdir_buf, 0700) == 0) {
				sockdir_initialized = 1;
				DBG(M_SCK, "using XDG_RUNTIME_DIR socket directory: %s", sockdir_buf);
				return sockdir_buf;
			}
		}
	}

	/*
	 * Fallback: Use /tmp/unicornscan-$UID
	 * This is less ideal but works on older systems without XDG support.
	 * The UID suffix ensures no conflicts between users.
	 */
	snprintf(sockdir_buf, sizeof(sockdir_buf), "/tmp/unicornscan-%d", uid);

	if (ensure_dir(sockdir_buf, 0700) < 0) {
		return NULL;
	}

	sockdir_initialized = 1;
	DBG(M_SCK, "using fallback socket directory: %s", sockdir_buf);
	return sockdir_buf;
}

const char *sockpath_get_sender(void) {
	const char *dir;

	dir = sockpath_get_dir();
	if (dir == NULL) {
		return NULL;
	}

	snprintf(sender_uri_buf, sizeof(sender_uri_buf), "unix:%s/send", dir);
	return sender_uri_buf;
}

const char *sockpath_get_listener(void) {
	const char *dir;

	dir = sockpath_get_dir();
	if (dir == NULL) {
		return NULL;
	}

	snprintf(listener_uri_buf, sizeof(listener_uri_buf), "unix:%s/listen", dir);
	return listener_uri_buf;
}

int sockpath_cleanup(void) {
	const char *dir;
	char path[PATH_MAX];
	struct stat sb;

	dir = sockpath_get_dir();
	if (dir == NULL) {
		return -1;
	}

	/* Remove stale send socket */
	snprintf(path, sizeof(path), "%s/send", dir);
	if (stat(path, &sb) == 0) {
		if (S_ISSOCK(sb.st_mode)) {
			DBG(M_SCK, "removing stale socket: %s", path);
			unlink(path);
		}
	}

	/* Remove stale listen socket */
	snprintf(path, sizeof(path), "%s/listen", dir);
	if (stat(path, &sb) == 0) {
		if (S_ISSOCK(sb.st_mode)) {
			DBG(M_SCK, "removing stale socket: %s", path);
			unlink(path);
		}
	}

	return 0;
}
