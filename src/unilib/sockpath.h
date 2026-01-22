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
 * sockpath.h - Runtime socket path determination for non-root operation
 *
 * This module provides functions to determine socket paths at runtime,
 * supporting both root and non-root operation. For non-root users, it
 * uses XDG_RUNTIME_DIR (typically /run/user/$UID) or falls back to
 * /tmp/unicornscan-$UID for socket storage.
 */
#ifndef _SOCKPATH_H
#define _SOCKPATH_H

/*
 * Get the runtime socket directory path.
 * Creates the directory with 0700 permissions if it doesn't exist.
 *
 * Returns: Pointer to static buffer containing the directory path,
 *          or NULL on error.
 *
 * Priority:
 *   1. If running as root: LOCALSTATEDIR/TARGETNAME (/var/unicornscan)
 *   2. XDG_RUNTIME_DIR/unicornscan (e.g., /run/user/1000/unicornscan)
 *   3. /tmp/unicornscan-$UID (fallback)
 */
const char *sockpath_get_dir(void);

/*
 * Get the sender socket URI.
 * Creates the socket directory if it doesn't exist.
 *
 * Returns: Pointer to static buffer containing the URI (e.g., "unix:/path/send"),
 *          or NULL on error.
 */
const char *sockpath_get_sender(void);

/*
 * Get the listener socket URI.
 * Creates the socket directory if it doesn't exist.
 *
 * Returns: Pointer to static buffer containing the URI (e.g., "unix:/path/listen"),
 *          or NULL on error.
 */
const char *sockpath_get_listener(void);

/*
 * Clean up stale socket files from the socket directory.
 * This is called at startup to remove any leftover sockets from previous runs.
 *
 * Returns: 0 on success, -1 on error.
 */
int sockpath_cleanup(void);

#endif /* _SOCKPATH_H */
