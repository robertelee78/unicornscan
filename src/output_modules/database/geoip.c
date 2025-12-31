/**********************************************************************
 * Copyright (C) 2025 Robert E. Lee <robert@unicornscan.org>          *
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
 * Manages provider selection, initialization, and cleanup.
 */

#include <config.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

#include "geoip_provider.h"

/* Active provider */
static geoip_provider_t *active_provider = NULL;

/* Available providers table */
static struct {
	const char *name;
	geoip_provider_t *provider;
} providers[] = {
#ifdef HAVE_LIBMAXMINDDB
	{ "maxmind", &geoip_maxmind_provider },
#endif
	/* Future providers:
	{ "ip2location", &geoip_ip2location_provider },
	{ "ipinfo", &geoip_ipinfo_provider },
	*/
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
	return 0;
}

/*
 * Perform IP lookup using active provider
 */
int geoip_lookup(const char *ip, geoip_result_t *result) {
	if (active_provider == NULL || !active_provider->is_ready()) {
		return -1;
	}

	if (ip == NULL || result == NULL) {
		return -1;
	}

	return active_provider->lookup(ip, result);
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
