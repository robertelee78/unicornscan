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
 * MaxMind GeoIP Provider Implementation
 *
 * Supports:
 * - GeoLite2-City.mmdb / GeoIP2-City.mmdb (free/paid city database)
 * - GeoLite2-ASN.mmdb / GeoIP2-ASN.mmdb (ASN database)
 * - GeoIP2-Anonymous-IP.mmdb (paid - IP type detection)
 *
 * Database search paths:
 * 1. Explicit path from configuration
 * 2. GEOIP_DATABASE environment variable
 * 3. Standard system paths: /usr/share/GeoIP, /var/lib/GeoIP, /usr/local/share/GeoIP
 */

#include <config.h>

#ifdef HAVE_LIBMAXMINDDB

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <math.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <maxminddb.h>

#include "geoip_provider.h"

/* Database handles */
static MMDB_s mmdb_city;
static MMDB_s mmdb_asn;
static MMDB_s mmdb_anonymous;
static int city_open = 0;
static int asn_open = 0;
static int anonymous_open = 0;

/* Database version string */
static char db_version[256] = "unknown";

/* Database filenames to search for (in order of preference) */
static const char *city_filenames[] = {
	"GeoLite2-City.mmdb",
	"GeoIP2-City.mmdb",
	"dbip-city-lite.mmdb",
	NULL
};

static const char *asn_filenames[] = {
	"GeoLite2-ASN.mmdb",
	"GeoIP2-ISP.mmdb",
	"dbip-asn-lite.mmdb",
	NULL
};

static const char *anonymous_filenames[] = {
	"GeoIP2-Anonymous-IP.mmdb",
	NULL
};

/* Search paths for .mmdb files */
static const char *search_paths[] = {
	"/usr/share/GeoIP",
	"/var/lib/GeoIP",
	"/usr/local/share/GeoIP",
	"/opt/GeoIP",
	NULL
};

/*
 * Try to open a MMDB file from explicit path or search paths
 * Returns: 0 on success, -1 on failure
 */
static int open_mmdb(const char *explicit_path, const char **filenames, MMDB_s *mmdb, const char *db_name) {
	char path[PATH_MAX];
	const char **dir, **file;
	int status;

	/* Try explicit path first */
	if (explicit_path != NULL && access(explicit_path, R_OK) == 0) {
		status = MMDB_open(explicit_path, MMDB_MODE_MMAP, mmdb);
		if (status == MMDB_SUCCESS) {
			return 0;
		}
	}

	/* Try environment variable */
	if (strcmp(db_name, "city") == 0) {
		const char *env_path = getenv("GEOIP_DATABASE");
		if (env_path != NULL && access(env_path, R_OK) == 0) {
			status = MMDB_open(env_path, MMDB_MODE_MMAP, mmdb);
			if (status == MMDB_SUCCESS) {
				return 0;
			}
		}
	}

	/* Search standard paths */
	for (dir = search_paths; *dir != NULL; dir++) {
		for (file = filenames; *file != NULL; file++) {
			snprintf(path, sizeof(path), "%s/%s", *dir, *file);
			if (access(path, R_OK) == 0) {
				status = MMDB_open(path, MMDB_MODE_MMAP, mmdb);
				if (status == MMDB_SUCCESS) {
					return 0;
				}
			}
		}
	}

	return -1;
}

/*
 * Extract a UTF-8 string field from MMDB entry
 */
static void extract_string(MMDB_entry_s *entry, char *dest, size_t dest_size, ...) {
	MMDB_entry_data_s data;
	va_list path;
	int status;

	dest[0] = '\0';

	va_start(path, dest_size);
	status = MMDB_vget_value(entry, &data, path);
	va_end(path);

	if (status == MMDB_SUCCESS && data.has_data && data.type == MMDB_DATA_TYPE_UTF8_STRING) {
		size_t len = data.data_size < dest_size - 1 ? data.data_size : dest_size - 1;
		memcpy(dest, data.utf8_string, len);
		dest[len] = '\0';
	}
}

/*
 * Extract a double field from MMDB entry
 */
static double extract_double(MMDB_entry_s *entry, ...) {
	MMDB_entry_data_s data;
	va_list path;
	int status;

	va_start(path, entry);
	status = MMDB_vget_value(entry, &data, path);
	va_end(path);

	if (status == MMDB_SUCCESS && data.has_data && data.type == MMDB_DATA_TYPE_DOUBLE) {
		return data.double_value;
	}
	return NAN;
}

/*
 * Extract an unsigned 32-bit integer from MMDB entry
 */
static uint32_t extract_uint32(MMDB_entry_s *entry, ...) {
	MMDB_entry_data_s data;
	va_list path;
	int status;

	va_start(path, entry);
	status = MMDB_vget_value(entry, &data, path);
	va_end(path);

	if (status == MMDB_SUCCESS && data.has_data && data.type == MMDB_DATA_TYPE_UINT32) {
		return data.uint32;
	}
	return 0;
}

/*
 * Extract an unsigned 16-bit integer from MMDB entry
 */
static int extract_uint16(MMDB_entry_s *entry, ...) {
	MMDB_entry_data_s data;
	va_list path;
	int status;

	va_start(path, entry);
	status = MMDB_vget_value(entry, &data, path);
	va_end(path);

	if (status == MMDB_SUCCESS && data.has_data && data.type == MMDB_DATA_TYPE_UINT16) {
		return (int)data.uint16;
	}
	return -1;
}

/*
 * Check if a boolean field is true in MMDB entry
 */
static int extract_bool(MMDB_entry_s *entry, ...) {
	MMDB_entry_data_s data;
	va_list path;
	int status;

	va_start(path, entry);
	status = MMDB_vget_value(entry, &data, path);
	va_end(path);

	if (status == MMDB_SUCCESS && data.has_data && data.type == MMDB_DATA_TYPE_BOOLEAN) {
		return data.boolean ? 1 : 0;
	}
	return 0;
}

/*
 * Initialize MaxMind provider
 */
static int maxmind_init(const geoip_config_t *config) {
	/* Open City database (primary) */
	if (open_mmdb(config ? config->city_db : NULL, city_filenames, &mmdb_city, "city") == 0) {
		city_open = 1;

		/* Build version string from metadata */
		snprintf(db_version, sizeof(db_version) - 1, "%s (%llu)",
			mmdb_city.metadata.database_type,
			(unsigned long long)mmdb_city.metadata.build_epoch);
	}

	/* Open ASN database (optional) */
	if (open_mmdb(config ? config->asn_db : NULL, asn_filenames, &mmdb_asn, "asn") == 0) {
		asn_open = 1;
	}

	/* Open Anonymous IP database (optional, paid only) */
	if (open_mmdb(config ? config->anonymous_db : NULL, anonymous_filenames, &mmdb_anonymous, "anonymous") == 0) {
		anonymous_open = 1;
	}

	/* Success if at least city database is open */
	return city_open ? 0 : -1;
}

/*
 * Perform lookup against all available MaxMind databases
 */
static int maxmind_lookup(const char *ip, geoip_result_t *result) {
	int gai_error, mmdb_error;
	MMDB_lookup_result_s lookup_result;

	if (!city_open || ip == NULL || result == NULL) {
		return -1;
	}

	/* Clear result */
	geoip_result_clear(result);
	strncpy(result->provider, "maxmind", sizeof(result->provider) - 1);
	strncpy(result->db_version, db_version, sizeof(result->db_version) - 1);

	/* Lookup in City database */
	lookup_result = MMDB_lookup_string(&mmdb_city, ip, &gai_error, &mmdb_error);

	if (gai_error != 0 || mmdb_error != MMDB_SUCCESS) {
		return -1;
	}

	if (!lookup_result.found_entry) {
		return 1; /* Not found */
	}

	/* Extract geographic data from City database */
	MMDB_entry_s *entry = &lookup_result.entry;

	extract_string(entry, result->country_code, sizeof(result->country_code),
		"country", "iso_code", NULL);
	extract_string(entry, result->country_name, sizeof(result->country_name),
		"country", "names", "en", NULL);
	extract_string(entry, result->region_code, sizeof(result->region_code),
		"subdivisions", "0", "iso_code", NULL);
	extract_string(entry, result->region_name, sizeof(result->region_name),
		"subdivisions", "0", "names", "en", NULL);
	extract_string(entry, result->city, sizeof(result->city),
		"city", "names", "en", NULL);
	extract_string(entry, result->postal_code, sizeof(result->postal_code),
		"postal", "code", NULL);
	extract_string(entry, result->timezone, sizeof(result->timezone),
		"location", "time_zone", NULL);

	result->latitude = extract_double(entry, "location", "latitude", NULL);
	result->longitude = extract_double(entry, "location", "longitude", NULL);
	result->confidence = extract_uint16(entry, "location", "accuracy_radius", NULL);

	/* Lookup in ASN database if available */
	if (asn_open) {
		lookup_result = MMDB_lookup_string(&mmdb_asn, ip, &gai_error, &mmdb_error);
		if (gai_error == 0 && mmdb_error == MMDB_SUCCESS && lookup_result.found_entry) {
			entry = &lookup_result.entry;
			result->asn = extract_uint32(entry, "autonomous_system_number", NULL);
			extract_string(entry, result->as_org, sizeof(result->as_org),
				"autonomous_system_organization", NULL);

			/* ISP is often the same as AS org in GeoLite2 */
			if (result->isp[0] == '\0' && result->as_org[0] != '\0') {
				strncpy(result->isp, result->as_org, sizeof(result->isp) - 1);
			}
		}
	}

	/* Lookup in Anonymous IP database if available (paid) */
	if (anonymous_open) {
		lookup_result = MMDB_lookup_string(&mmdb_anonymous, ip, &gai_error, &mmdb_error);
		if (gai_error == 0 && mmdb_error == MMDB_SUCCESS && lookup_result.found_entry) {
			entry = &lookup_result.entry;

			/* Determine IP type from anonymous IP flags */
			if (extract_bool(entry, "is_tor_exit_node", NULL)) {
				strncpy(result->ip_type, GEOIP_TYPE_TOR, sizeof(result->ip_type) - 1);
			}
			else if (extract_bool(entry, "is_anonymous_vpn", NULL)) {
				strncpy(result->ip_type, GEOIP_TYPE_VPN, sizeof(result->ip_type) - 1);
			}
			else if (extract_bool(entry, "is_public_proxy", NULL) ||
			         extract_bool(entry, "is_residential_proxy", NULL)) {
				strncpy(result->ip_type, GEOIP_TYPE_PROXY, sizeof(result->ip_type) - 1);
			}
			else if (extract_bool(entry, "is_hosting_provider", NULL)) {
				strncpy(result->ip_type, GEOIP_TYPE_DATACENTER, sizeof(result->ip_type) - 1);
			}
			else if (extract_bool(entry, "is_anonymous", NULL)) {
				strncpy(result->ip_type, GEOIP_TYPE_VPN, sizeof(result->ip_type) - 1);
			}
		}
	}

	return 0;
}

/*
 * Get database version string
 */
static const char *maxmind_get_db_version(void) {
	return db_version;
}

/*
 * Check if provider is ready
 */
static int maxmind_is_ready(void) {
	return city_open;
}

/*
 * Cleanup MaxMind provider
 */
static void maxmind_cleanup(void) {
	if (city_open) {
		MMDB_close(&mmdb_city);
		city_open = 0;
	}
	if (asn_open) {
		MMDB_close(&mmdb_asn);
		asn_open = 0;
	}
	if (anonymous_open) {
		MMDB_close(&mmdb_anonymous);
		anonymous_open = 0;
	}
	db_version[0] = '\0';
}

/*
 * MaxMind provider interface
 */
geoip_provider_t geoip_maxmind_provider = {
	.name = "maxmind",
	.description = "MaxMind GeoIP2/GeoLite2 databases",
	.init = maxmind_init,
	.lookup = maxmind_lookup,
	.get_db_version = maxmind_get_db_version,
	.is_ready = maxmind_is_ready,
	.cleanup = maxmind_cleanup,
};

#endif /* HAVE_LIBMAXMINDDB */
