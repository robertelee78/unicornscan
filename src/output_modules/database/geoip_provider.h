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
#ifndef _GEOIP_PROVIDER_H
#define _GEOIP_PROVIDER_H

#include <stdint.h>
#include <stddef.h>

/*
 * GeoIP Provider Abstraction Layer
 *
 * Provides a unified interface for geographic and network IP lookups
 * across multiple providers: MaxMind, IP2Location, IPinfo
 *
 * Features:
 * - Provider-agnostic API for lookups
 * - Support for multiple database files (City, ASN, Anonymous IP)
 * - Graceful degradation when databases unavailable
 * - Memory-efficient with optional caching
 *
 * Usage:
 *   geoip_config_t config = {
 *       .provider = "maxmind",
 *       .city_db = "/var/lib/GeoIP/GeoLite2-City.mmdb",
 *       .asn_db = "/var/lib/GeoIP/GeoLite2-ASN.mmdb",
 *       .cache_size = 10000,
 *   };
 *   geoip_init(&config);
 *   geoip_result_t result;
 *   if (geoip_lookup("8.8.8.8", &result) == 0) {
 *       // Use result.country_code, result.city, etc.
 *   }
 *   geoip_cleanup();
 */

/* ==========================================================================
 * Result structure - contains all possible GeoIP data fields
 * Fields may be empty strings or -1 when data unavailable
 * ========================================================================== */

typedef struct geoip_result {
	/* Geographic data */
	char country_code[3];		/* ISO 3166-1 alpha-2 (e.g., "US") */
	char country_name[101];		/* Full country name */
	char region_code[11];		/* State/province code (e.g., "CA") */
	char region_name[101];		/* Full region name */
	char city[101];			/* City name */
	char postal_code[21];		/* Postal/ZIP code */
	double latitude;		/* Latitude (-90 to 90, NAN if unavailable) */
	double longitude;		/* Longitude (-180 to 180, NAN if unavailable) */
	char timezone[65];		/* IANA timezone (e.g., "America/Los_Angeles") */

	/* Network data (may require paid databases) */
	char ip_type[21];		/* residential, datacenter, vpn, proxy, tor, mobile */
	char isp[201];			/* ISP name */
	char organization[201];		/* Organization name */
	uint32_t asn;			/* Autonomous System Number (0 if unavailable) */
	char as_org[201];		/* AS Organization name */

	/* Metadata */
	int confidence;			/* Accuracy confidence 0-100, -1 if unavailable */
	char provider[51];		/* Provider name (maxmind, ip2location, ipinfo) */
	char db_version[51];		/* Database version string */
} geoip_result_t;

/* ==========================================================================
 * Configuration structure
 * ========================================================================== */

typedef struct geoip_config {
	const char *provider;		/* Provider name: "maxmind", "ip2location", "ipinfo" */

	/* Database paths (provider-specific, NULL to auto-detect) */
	const char *city_db;		/* City/location database */
	const char *asn_db;		/* ASN database (MaxMind: GeoLite2-ASN.mmdb) */
	const char *anonymous_db;	/* Anonymous IP database (MaxMind: GeoIP2-Anonymous-IP.mmdb) */

	/* Optional settings */
	int cache_size;			/* Number of IPs to cache (0 = no cache) */
	int timeout_ms;			/* Lookup timeout in milliseconds (0 = no timeout) */
	int enabled;			/* Whether GeoIP is enabled */
	int store_in_db;		/* Whether to store results in database */
} geoip_config_t;

/* ==========================================================================
 * Provider interface - implemented by each provider
 * ========================================================================== */

typedef struct geoip_provider {
	const char *name;		/* Provider identifier */
	const char *description;	/* Human-readable description */

	/*
	 * Initialize provider with database paths
	 * Returns: 0 on success, -1 on failure
	 */
	int (*init)(const geoip_config_t *config);

	/*
	 * Perform IP lookup and populate result structure
	 * Returns: 0 on success (data found), 1 on not found, -1 on error
	 */
	int (*lookup)(const char *ip, geoip_result_t *result);

	/*
	 * Get database version string
	 * Returns: version string or NULL
	 */
	const char *(*get_db_version)(void);

	/*
	 * Check if provider is ready for lookups
	 * Returns: 1 if ready, 0 if not
	 */
	int (*is_ready)(void);

	/*
	 * Cleanup and free resources
	 */
	void (*cleanup)(void);
} geoip_provider_t;

/* ==========================================================================
 * Provider implementations (extern declarations)
 * ========================================================================== */

#ifdef HAVE_LIBMAXMINDDB
extern geoip_provider_t geoip_maxmind_provider;
/* IPinfo uses MMDB format, so it also requires libmaxminddb */
extern geoip_provider_t geoip_ipinfo_provider;
#endif

#ifdef HAVE_IP2LOCATION
extern geoip_provider_t geoip_ip2location_provider;
#endif

/* ==========================================================================
 * Global GeoIP API - wraps active provider
 * ========================================================================== */

/*
 * Initialize GeoIP subsystem with configuration
 * Selects and initializes the appropriate provider
 * Returns: 0 on success, -1 on failure
 */
int geoip_init(const geoip_config_t *config);

/*
 * Perform IP lookup using active provider
 * Clears result structure before populating
 * Returns: 0 on success, 1 on not found, -1 on error/not initialized
 */
int geoip_lookup(const char *ip, geoip_result_t *result);

/*
 * Get active provider's database version
 * Returns: version string or "unknown"
 */
const char *geoip_get_db_version(void);

/*
 * Check if GeoIP is initialized and ready
 * Returns: 1 if ready, 0 if not
 */
int geoip_is_ready(void);

/*
 * Cleanup GeoIP subsystem
 */
void geoip_cleanup(void);

/*
 * Get current provider name
 * Returns: provider name or "none"
 */
const char *geoip_get_provider_name(void);

/*
 * Get cache statistics
 * Any parameter can be NULL if not needed
 */
void geoip_cache_stats(unsigned long *hits, unsigned long *misses, size_t *size);

/* ==========================================================================
 * Utility functions
 * ========================================================================== */

/*
 * Clear/initialize a result structure
 */
void geoip_result_clear(geoip_result_t *result);

/*
 * Check if an IP string is valid (IPv4 or IPv6)
 * Returns: 4 for IPv4, 6 for IPv6, 0 for invalid
 */
int geoip_validate_ip(const char *ip);

/* ==========================================================================
 * IP Type constants
 * ========================================================================== */

#define GEOIP_TYPE_UNKNOWN	"unknown"
#define GEOIP_TYPE_RESIDENTIAL	"residential"
#define GEOIP_TYPE_DATACENTER	"datacenter"
#define GEOIP_TYPE_VPN		"vpn"
#define GEOIP_TYPE_PROXY	"proxy"
#define GEOIP_TYPE_TOR		"tor"
#define GEOIP_TYPE_MOBILE	"mobile"
#define GEOIP_TYPE_BUSINESS	"business"
#define GEOIP_TYPE_EDUCATION	"education"
#define GEOIP_TYPE_GOVERNMENT	"government"

#endif /* _GEOIP_PROVIDER_H */
