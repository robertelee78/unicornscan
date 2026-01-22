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
 * IP2Location GeoIP Provider Implementation
 *
 * Supports:
 * - IP2LOCATION-LITE-DB11.BIN (free city database)
 * - IP2PROXY-LITE-PX11.BIN (free proxy database)
 * - Commercial IP2Location databases (DB1-DB26)
 *
 * Database search paths:
 * 1. Explicit path from configuration
 * 2. IP2LOCATION_DATABASE environment variable
 * 3. Standard system paths: /usr/share/IP2Location, /var/lib/IP2Location
 *
 * Reference: https://www.ip2location.com/development-libraries/ip2location/c
 */

#include <config.h>

#ifdef HAVE_IP2LOCATION

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <math.h>
#include <limits.h>
#include <IP2Location.h>

#include "geoip_provider.h"

/* Database handles */
static IP2Location *ip2l_city = NULL;
static IP2Location *ip2l_proxy = NULL;

/* Database version string */
static char db_version[256] = "unknown";

/* Database filenames to search for (in order of preference) */
static const char *city_filenames[] = {
	"IP2LOCATION-LITE-DB11.BIN",
	"IP2LOCATION-LITE-DB5.BIN",
	"IP2LOCATION-LITE-DB3.BIN",
	"IP2LOCATION-LITE-DB1.BIN",
	"IP2LOCATION-DB26.BIN",
	"IP2LOCATION-DB24.BIN",
	"IP2LOCATION-DB11.BIN",
	NULL
};

static const char *proxy_filenames[] = {
	"IP2PROXY-LITE-PX11.BIN",
	"IP2PROXY-PX11.BIN",
	"IP2PROXY-LITE-PX10.BIN",
	NULL
};

/* Search paths for .BIN files */
static const char *search_paths[] = {
	"/usr/share/IP2Location",
	"/var/lib/IP2Location",
	"/usr/local/share/IP2Location",
	"/opt/IP2Location",
	"/usr/share/GeoIP",
	"/var/lib/GeoIP",
	NULL
};

/*
 * Try to open an IP2Location database from explicit path or search paths
 * Returns: pointer on success, NULL on failure
 */
static IP2Location *open_ip2l(const char *explicit_path, const char **filenames, const char *db_name) {
	char path[PATH_MAX];
	const char **dir, **file;
	IP2Location *db;

	/* Try explicit path first */
	if (explicit_path != NULL && access(explicit_path, R_OK) == 0) {
		db = IP2Location_open(explicit_path);
		if (db != NULL) {
			return db;
		}
	}

	/* Try environment variable for city database */
	if (strcmp(db_name, "city") == 0) {
		const char *env_path = getenv("IP2LOCATION_DATABASE");
		if (env_path != NULL && access(env_path, R_OK) == 0) {
			db = IP2Location_open(env_path);
			if (db != NULL) {
				return db;
			}
		}
	}

	/* Search standard paths */
	for (dir = search_paths; *dir != NULL; dir++) {
		for (file = filenames; *file != NULL; file++) {
			snprintf(path, sizeof(path), "%s/%s", *dir, *file);
			if (access(path, R_OK) == 0) {
				db = IP2Location_open(path);
				if (db != NULL) {
					return db;
				}
			}
		}
	}

	return NULL;
}

/*
 * Safely copy string with NULL check
 */
static void safe_strncpy(char *dest, const char *src, size_t dest_size) {
	if (src != NULL && src[0] != '\0' && strcmp(src, "-") != 0 && strcmp(src, "N/A") != 0) {
		strncpy(dest, src, dest_size - 1);
		dest[dest_size - 1] = '\0';
	} else {
		dest[0] = '\0';
	}
}

/*
 * Initialize IP2Location provider
 */
static int ip2location_init(const geoip_config_t *config) {
	/* Open city/location database (primary) */
	ip2l_city = open_ip2l(config ? config->city_db : NULL, city_filenames, "city");

	if (ip2l_city != NULL) {
		/* Build version string */
		snprintf(db_version, sizeof(db_version) - 1, "IP2Location DB%d",
			IP2Location_DB_get_database_type(ip2l_city));
	}

	/* Open proxy database (optional) */
	ip2l_proxy = open_ip2l(config ? config->anonymous_db : NULL, proxy_filenames, "proxy");

	/* Success if at least city database is open */
	return (ip2l_city != NULL) ? 0 : -1;
}

/*
 * Perform lookup against IP2Location databases
 */
static int ip2location_lookup(const char *ip, geoip_result_t *result) {
	IP2LocationRecord *record;

	if (ip2l_city == NULL || ip == NULL || result == NULL) {
		return -1;
	}

	/* Clear result */
	geoip_result_clear(result);
	strncpy(result->provider, "ip2location", sizeof(result->provider) - 1);
	strncpy(result->db_version, db_version, sizeof(result->db_version) - 1);

	/* Lookup in city database */
	record = IP2Location_get_all(ip2l_city, (char *)ip);
	if (record == NULL) {
		return -1;
	}

	/* Extract geographic data */
	safe_strncpy(result->country_code, record->country_short, sizeof(result->country_code));
	safe_strncpy(result->country_name, record->country_long, sizeof(result->country_name));
	safe_strncpy(result->region_name, record->region, sizeof(result->region_name));
	safe_strncpy(result->city, record->city, sizeof(result->city));
	safe_strncpy(result->postal_code, record->zipcode, sizeof(result->postal_code));
	safe_strncpy(result->timezone, record->timezone, sizeof(result->timezone));
	safe_strncpy(result->isp, record->isp, sizeof(result->isp));

	/* Latitude/longitude */
	if (record->latitude != 0.0 || record->longitude != 0.0) {
		result->latitude = record->latitude;
		result->longitude = record->longitude;
	}

	/* ASN (if available in database type) */
	if (record->asn != NULL && record->asn[0] != '\0' && strcmp(record->asn, "-") != 0) {
		/* ASN is returned as string like "AS15169", extract number */
		if (strncmp(record->asn, "AS", 2) == 0) {
			result->asn = (uint32_t)strtoul(record->asn + 2, NULL, 10);
		}
	}
	safe_strncpy(result->as_org, record->as_, sizeof(result->as_org));

	/* Free record */
	IP2Location_free_record(record);

	/* Lookup in proxy database if available */
	if (ip2l_proxy != NULL) {
		IP2ProxyRecord *proxy_record = IP2Proxy_get_all(ip2l_proxy, (char *)ip);
		if (proxy_record != NULL) {
			/* Determine IP type from proxy detection */
			if (proxy_record->is_proxy >= 0) {
				switch (proxy_record->is_proxy) {
				case 0:
					/* Not a proxy */
					break;
				case 1:
					strncpy(result->ip_type, GEOIP_TYPE_PROXY, sizeof(result->ip_type) - 1);
					break;
				case 2:
					/* VPN */
					strncpy(result->ip_type, GEOIP_TYPE_VPN, sizeof(result->ip_type) - 1);
					break;
				default:
					break;
				}
			}

			/* Check specific proxy types */
			if (proxy_record->proxy_type != NULL) {
				if (strcasecmp(proxy_record->proxy_type, "TOR") == 0) {
					strncpy(result->ip_type, GEOIP_TYPE_TOR, sizeof(result->ip_type) - 1);
				} else if (strcasecmp(proxy_record->proxy_type, "DCH") == 0) {
					strncpy(result->ip_type, GEOIP_TYPE_DATACENTER, sizeof(result->ip_type) - 1);
				} else if (strcasecmp(proxy_record->proxy_type, "SES") == 0) {
					strncpy(result->ip_type, GEOIP_TYPE_DATACENTER, sizeof(result->ip_type) - 1);
				}
			}

			IP2Proxy_free_record(proxy_record);
		}
	}

	/* Check if we got any useful data */
	if (result->country_code[0] == '\0') {
		return 1; /* Not found */
	}

	return 0;
}

/*
 * Get database version string
 */
static const char *ip2location_get_db_version(void) {
	return db_version;
}

/*
 * Check if provider is ready
 */
static int ip2location_is_ready(void) {
	return (ip2l_city != NULL) ? 1 : 0;
}

/*
 * Cleanup IP2Location provider
 */
static void ip2location_cleanup(void) {
	if (ip2l_city != NULL) {
		IP2Location_close(ip2l_city);
		ip2l_city = NULL;
	}
	if (ip2l_proxy != NULL) {
		IP2Proxy_close(ip2l_proxy);
		ip2l_proxy = NULL;
	}
	db_version[0] = '\0';
}

/*
 * IP2Location provider interface
 */
geoip_provider_t geoip_ip2location_provider = {
	.name = "ip2location",
	.description = "IP2Location BIN databases",
	.init = ip2location_init,
	.lookup = ip2location_lookup,
	.get_db_version = ip2location_get_db_version,
	.is_ready = ip2location_is_ready,
	.cleanup = ip2location_cleanup,
};

#endif /* HAVE_IP2LOCATION */
