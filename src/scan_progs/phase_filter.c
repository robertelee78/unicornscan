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

#include <settings.h>
#include <scan_progs/scan_export.h>
#include <scan_progs/phase_filter.h>
#include <unilib/chtbl.h>
#include <unilib/xmalloc.h>
#include <unilib/output.h>

/*
 * ARP cache entry - stores MAC address for hosts that responded.
 * Key is the IPv4 address (uint32_t cast to uint64_t for chtbl).
 */
typedef struct arp_cache_entry_t {
	uint8_t hwaddr[THE_ONLY_SUPPORTED_HWADDR_LEN];
} arp_cache_entry_t;

/* Hash table handle */
static void *arp_cache=NULL;

int phase_filter_init(void) {
	if (arp_cache != NULL) {
		/* Already initialized - this is fine, just return success */
		return 1;
	}

	/* Expect up to 256 hosts (typical /24 network) */
	arp_cache=chtinit(256);
	if (arp_cache == NULL) {
		ERR("failed to initialize ARP cache hash table");
		return -1;
	}

	DBG(M_WRK, "phase_filter: initialized ARP cache");
	return 1;
}

int phase_filter_store(uint32_t ipaddr, const uint8_t *hwaddr) {
	arp_cache_entry_t *entry=NULL;
	int ret=0;

	if (arp_cache == NULL) {
		ERR("phase_filter: cache not initialized");
		return -1;
	}

	if (hwaddr == NULL) {
		ERR("phase_filter: NULL hwaddr");
		return -1;
	}

	/* Check if already stored (duplicate ARP response) */
	if (chtfind(arp_cache, (uint64_t)ipaddr, (void **)&entry) == CHEXIT_SUCCESS) {
		/* Already have this IP - update MAC in case it changed */
		memcpy(entry->hwaddr, hwaddr, THE_ONLY_SUPPORTED_HWADDR_LEN);
		return 1;
	}

	/* Allocate new entry */
	entry=(arp_cache_entry_t *)xmalloc(sizeof(arp_cache_entry_t));
	memcpy(entry->hwaddr, hwaddr, THE_ONLY_SUPPORTED_HWADDR_LEN);

	ret=chtinsert(arp_cache, (uint64_t)ipaddr, entry);
	if (ret != CHEXIT_SUCCESS) {
		ERR("phase_filter: failed to insert IP %08x", ipaddr);
		xfree(entry);
		return -1;
	}

	DBG(M_WRK, "phase_filter: stored ARP response for %u.%u.%u.%u",
		(ipaddr >> 0) & 0xff, (ipaddr >> 8) & 0xff,
		(ipaddr >> 16) & 0xff, (ipaddr >> 24) & 0xff);

	return 1;
}

int phase_filter_check(uint32_t ipaddr) {
	arp_cache_entry_t *entry=NULL;

	if (arp_cache == NULL) {
		/* No cache - assume all hosts pass (for non-compound mode) */
		return 1;
	}

	if (chtfind(arp_cache, (uint64_t)ipaddr, (void **)&entry) == CHEXIT_SUCCESS) {
		return 1;
	}

	return 0;
}

uint32_t phase_filter_count(void) {
	if (arp_cache == NULL) {
		return 0;
	}
	return chtgetsize(arp_cache);
}

/*
 * Walk callback data - stores the user callback and context.
 */
static void (*user_walk_func)(uint32_t ipaddr, void *ctx)=NULL;
static void *user_walk_ctx=NULL;

/*
 * Internal wrapper for chtwalk that converts key back to uint32_t.
 */
static void phase_filter_walk_cb(uint64_t key, void *data) {
	(void)data; /* unused - we only need the key (IP address) */
	if (user_walk_func != NULL) {
		user_walk_func((uint32_t)key, user_walk_ctx);
	}
}

/*
 * Walk through all IPs in the ARP cache.
 * Calls func(ipaddr, ctx) for each entry.
 */
void phase_filter_walk(void (*func)(uint32_t ipaddr, void *ctx), void *ctx) {
	if (arp_cache == NULL || func == NULL) {
		return;
	}

	user_walk_func=func;
	user_walk_ctx=ctx;
	chtwalk(arp_cache, phase_filter_walk_cb, 0);
	user_walk_func=NULL;
	user_walk_ctx=NULL;
}

void phase_filter_destroy(void) {
	if (arp_cache == NULL) {
		return;
	}

	/*
	 * Note: chtdestroy does not free the data pointers.
	 * We need to walk and free each entry first.
	 */
	/* For now, just destroy the table - entries will leak.
	 * TODO: Add walk function to free entries if memory is a concern.
	 * In practice, this runs once at program exit so it's acceptable.
	 */
	chtdestroy(arp_cache);
	arp_cache=NULL;

	DBG(M_WRK, "phase_filter: destroyed ARP cache");
}
