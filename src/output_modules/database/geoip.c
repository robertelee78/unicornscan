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
 * GeoIP Provider Abstraction Layer - Main Implementation
 *
 * Provides unified API for geographic/network IP lookups across providers.
 * Manages provider selection, initialization, cleanup, and caching.
 *
 * Caching:
 * - LRU cache for recent IP lookups
 * - Configurable size (default 10000 entries)
 * - Thread-safe for single-threaded use (no mutex needed for unicornscan)
 */

#include <config.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

#include "geoip_provider.h"

/* ==========================================================================
 * LRU Cache Implementation
 * ========================================================================== */

#define GEOIP_DEFAULT_CACHE_SIZE 10000
#define GEOIP_CACHE_IP_SIZE 46  /* Max IPv6 string length + NUL */

/* Cache entry */
typedef struct geoip_cache_entry {
	char ip[GEOIP_CACHE_IP_SIZE];
	geoip_result_t result;
	time_t timestamp;
	struct geoip_cache_entry *prev;
	struct geoip_cache_entry *next;
	struct geoip_cache_entry *hash_next;  /* Hash chain */
} geoip_cache_entry_t;

/* Cache structure */
typedef struct geoip_cache {
	geoip_cache_entry_t *head;	/* Most recently used */
	geoip_cache_entry_t *tail;	/* Least recently used */
	geoip_cache_entry_t **hash_table;
	geoip_cache_entry_t *entries;	/* Pre-allocated entries */
	size_t capacity;
	size_t size;
	size_t hash_size;
	unsigned long hits;
	unsigned long misses;
} geoip_cache_t;

static geoip_cache_t *cache = NULL;

/*
 * Simple hash function for IP strings (djb2)
 */
static unsigned long hash_ip(const char *ip, size_t hash_size) {
	unsigned long hash = 5381;
	int c;

	while ((c = *ip++)) {
		hash = ((hash << 5) + hash) + c;
	}

	return hash % hash_size;
}

/*
 * Initialize LRU cache
 */
static int cache_init(size_t capacity) {
	size_t i;

	if (capacity == 0) {
		return 0;  /* Caching disabled */
	}

	cache = calloc(1, sizeof(geoip_cache_t));
	if (cache == NULL) {
		return -1;
	}

	cache->capacity = capacity;
	cache->size = 0;
	cache->hash_size = capacity * 2;  /* Over-allocate for fewer collisions */

	/* Allocate hash table */
	cache->hash_table = calloc(cache->hash_size, sizeof(geoip_cache_entry_t *));
	if (cache->hash_table == NULL) {
		free(cache);
		cache = NULL;
		return -1;
	}

	/* Pre-allocate all entries */
	cache->entries = calloc(capacity, sizeof(geoip_cache_entry_t));
	if (cache->entries == NULL) {
		free(cache->hash_table);
		free(cache);
		cache = NULL;
		return -1;
	}

	/* Initialize entries as a free pool (linked via prev/next) */
	cache->head = NULL;
	cache->tail = NULL;

	/* Clear all entries */
	for (i = 0; i < capacity; i++) {
		cache->entries[i].ip[0] = '\0';
	}

	return 0;
}

/*
 * Find entry in cache
 */
static geoip_cache_entry_t *cache_find(const char *ip) {
	unsigned long h;
	geoip_cache_entry_t *entry;

	if (cache == NULL || ip == NULL) {
		return NULL;
	}

	h = hash_ip(ip, cache->hash_size);
	entry = cache->hash_table[h];

	while (entry != NULL) {
		if (strcmp(entry->ip, ip) == 0) {
			return entry;
		}
		entry = entry->hash_next;
	}

	return NULL;
}

/*
 * Move entry to head of LRU list (most recently used)
 */
static void cache_move_to_head(geoip_cache_entry_t *entry) {
	if (cache == NULL || entry == NULL || entry == cache->head) {
		return;
	}

	/* Remove from current position */
	if (entry->prev != NULL) {
		entry->prev->next = entry->next;
	}
	if (entry->next != NULL) {
		entry->next->prev = entry->prev;
	}
	if (entry == cache->tail) {
		cache->tail = entry->prev;
	}

	/* Insert at head */
	entry->prev = NULL;
	entry->next = cache->head;
	if (cache->head != NULL) {
		cache->head->prev = entry;
	}
	cache->head = entry;
	if (cache->tail == NULL) {
		cache->tail = entry;
	}
}

/*
 * Remove entry from hash table
 */
static void cache_hash_remove(geoip_cache_entry_t *entry) {
	unsigned long h;
	geoip_cache_entry_t *curr, *prev;

	if (cache == NULL || entry == NULL || entry->ip[0] == '\0') {
		return;
	}

	h = hash_ip(entry->ip, cache->hash_size);
	curr = cache->hash_table[h];
	prev = NULL;

	while (curr != NULL) {
		if (curr == entry) {
			if (prev == NULL) {
				cache->hash_table[h] = curr->hash_next;
			} else {
				prev->hash_next = curr->hash_next;
			}
			entry->hash_next = NULL;
			return;
		}
		prev = curr;
		curr = curr->hash_next;
	}
}

/*
 * Add entry to hash table
 */
static void cache_hash_add(geoip_cache_entry_t *entry) {
	unsigned long h;

	if (cache == NULL || entry == NULL) {
		return;
	}

	h = hash_ip(entry->ip, cache->hash_size);
	entry->hash_next = cache->hash_table[h];
	cache->hash_table[h] = entry;
}

/*
 * Store result in cache
 */
static void cache_store(const char *ip, const geoip_result_t *result) {
	geoip_cache_entry_t *entry;
	size_t i;

	if (cache == NULL || ip == NULL || result == NULL) {
		return;
	}

	/* Check if already in cache */
	entry = cache_find(ip);
	if (entry != NULL) {
		/* Update existing entry */
		memcpy(&entry->result, result, sizeof(geoip_result_t));
		entry->timestamp = time(NULL);
		cache_move_to_head(entry);
		return;
	}

	/* Find a free entry or evict LRU */
	if (cache->size < cache->capacity) {
		/* Find first unused entry */
		for (i = 0; i < cache->capacity; i++) {
			if (cache->entries[i].ip[0] == '\0') {
				entry = &cache->entries[i];
				cache->size++;
				break;
			}
		}
	} else {
		/* Evict LRU (tail) */
		entry = cache->tail;
		if (entry != NULL) {
			/* Remove from hash table */
			cache_hash_remove(entry);

			/* Remove from LRU list */
			if (entry->prev != NULL) {
				entry->prev->next = NULL;
			}
			cache->tail = entry->prev;
			if (cache->head == entry) {
				cache->head = NULL;
			}
		}
	}

	if (entry == NULL) {
		return;  /* Should not happen */
	}

	/* Populate entry */
	strncpy(entry->ip, ip, sizeof(entry->ip) - 1);
	entry->ip[sizeof(entry->ip) - 1] = '\0';
	memcpy(&entry->result, result, sizeof(geoip_result_t));
	entry->timestamp = time(NULL);
	entry->prev = NULL;
	entry->next = NULL;
	entry->hash_next = NULL;

	/* Add to hash table */
	cache_hash_add(entry);

	/* Add to head of LRU list */
	entry->next = cache->head;
	if (cache->head != NULL) {
		cache->head->prev = entry;
	}
	cache->head = entry;
	if (cache->tail == NULL) {
		cache->tail = entry;
	}
}

/*
 * Lookup in cache
 * Returns: 0 on hit (result populated), -1 on miss
 */
static int cache_lookup(const char *ip, geoip_result_t *result) {
	geoip_cache_entry_t *entry;

	if (cache == NULL) {
		return -1;
	}

	entry = cache_find(ip);
	if (entry != NULL) {
		memcpy(result, &entry->result, sizeof(geoip_result_t));
		cache_move_to_head(entry);
		cache->hits++;
		return 0;
	}

	cache->misses++;
	return -1;
}

/*
 * Clear and free cache
 */
static void cache_cleanup(void) {
	if (cache == NULL) {
		return;
	}

	if (cache->entries != NULL) {
		free(cache->entries);
	}
	if (cache->hash_table != NULL) {
		free(cache->hash_table);
	}
	free(cache);
	cache = NULL;
}

/*
 * Get cache statistics
 */
void geoip_cache_stats(unsigned long *hits, unsigned long *misses, size_t *size) {
	if (cache == NULL) {
		if (hits) *hits = 0;
		if (misses) *misses = 0;
		if (size) *size = 0;
		return;
	}

	if (hits) *hits = cache->hits;
	if (misses) *misses = cache->misses;
	if (size) *size = cache->size;
}

/* ==========================================================================
 * Provider Management
 * ========================================================================== */

/* Active provider */
static geoip_provider_t *active_provider = NULL;

/* Available providers table (order = priority for auto-detection) */
static struct {
	const char *name;
	geoip_provider_t *provider;
} providers[] = {
#ifdef HAVE_LIBMAXMINDDB
	{ "maxmind", &geoip_maxmind_provider },
	{ "ipinfo", &geoip_ipinfo_provider },
#endif
#ifdef HAVE_IP2LOCATION
	{ "ip2location", &geoip_ip2location_provider },
#endif
	{ NULL, NULL }
};

/*
 * Find provider by name
 */
static geoip_provider_t *find_provider(const char *name) {
	int i;

	if (name == NULL || name[0] == '\0') {
		/* Return first available provider as default */
		return providers[0].provider;
	}

	for (i = 0; providers[i].name != NULL; i++) {
		if (strcasecmp(providers[i].name, name) == 0) {
			return providers[i].provider;
		}
	}

	return NULL;
}

/*
 * Initialize GeoIP subsystem with configuration
 */
int geoip_init(const geoip_config_t *config) {
	geoip_provider_t *provider;
	const char *provider_name;
	size_t cache_size;

	/* Cleanup any existing provider */
	if (active_provider != NULL) {
		geoip_cleanup();
	}

	/* Check if enabled */
	if (config != NULL && !config->enabled) {
		return 0; /* Successfully disabled */
	}

	/* Find requested provider */
	provider_name = config ? config->provider : NULL;
	provider = find_provider(provider_name);

	if (provider == NULL) {
		return -1; /* No provider available */
	}

	/* Initialize provider */
	if (provider->init(config) != 0) {
		return -1;
	}

	active_provider = provider;

	/* Initialize cache */
	cache_size = (config && config->cache_size > 0) ? (size_t)config->cache_size : GEOIP_DEFAULT_CACHE_SIZE;
	cache_init(cache_size);

	return 0;
}

/*
 * Perform IP lookup using active provider
 * Uses cache for performance; cache misses trigger provider lookup
 */
int geoip_lookup(const char *ip, geoip_result_t *result) {
	int ret;

	if (active_provider == NULL || !active_provider->is_ready()) {
		return -1;
	}

	if (ip == NULL || result == NULL) {
		return -1;
	}

	/* Check cache first */
	if (cache_lookup(ip, result) == 0) {
		return 0;  /* Cache hit */
	}

	/* Cache miss - perform actual lookup */
	ret = active_provider->lookup(ip, result);

	/* Store successful lookups in cache */
	if (ret == 0) {
		cache_store(ip, result);
	}

	return ret;
}

/*
 * Get active provider's database version
 */
const char *geoip_get_db_version(void) {
	if (active_provider == NULL || active_provider->get_db_version == NULL) {
		return "unknown";
	}
	return active_provider->get_db_version();
}

/*
 * Check if GeoIP is initialized and ready
 */
int geoip_is_ready(void) {
	if (active_provider == NULL) {
		return 0;
	}
	return active_provider->is_ready();
}

/*
 * Cleanup GeoIP subsystem
 */
void geoip_cleanup(void) {
	/* Cleanup cache first */
	cache_cleanup();

	/* Then cleanup provider */
	if (active_provider != NULL) {
		active_provider->cleanup();
		active_provider = NULL;
	}
}

/*
 * Get current provider name
 */
const char *geoip_get_provider_name(void) {
	if (active_provider == NULL) {
		return "none";
	}
	return active_provider->name;
}

/*
 * Clear/initialize a result structure
 */
void geoip_result_clear(geoip_result_t *result) {
	if (result == NULL) {
		return;
	}

	memset(result, 0, sizeof(geoip_result_t));
	result->latitude = NAN;
	result->longitude = NAN;
	result->asn = 0;
	result->confidence = -1;
}

/*
 * Validate IP address string
 * Returns: 4 for IPv4, 6 for IPv6, 0 for invalid
 */
int geoip_validate_ip(const char *ip) {
	struct in_addr addr4;
	struct in6_addr addr6;

	if (ip == NULL || ip[0] == '\0') {
		return 0;
	}

	if (inet_pton(AF_INET, ip, &addr4) == 1) {
		return 4;
	}

	if (inet_pton(AF_INET6, ip, &addr6) == 1) {
		return 6;
	}

	return 0;
}
