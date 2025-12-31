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
 * IPinfo GeoIP Provider Implementation
 *
 * IPinfo uses MMDB format (same library as MaxMind) but with different
 * field structure. This provider handles IPinfo's specific database schema.
 *
 * Supported databases:
 * - ipinfo_country.mmdb (free tier)
 * - ipinfo_asn.mmdb (free tier)
 * - ipinfo_city.mmdb (requires API token)
 * - ipinfo_privacy.mmdb (privacy detection, requires token)
 *
 * Database search paths:
 * 1. Explicit path from configuration
 * 2. IPINFO_DATABASE environment variable
 * 3. Standard system paths: /usr/share/IPinfo, /var/lib/GeoIP
 *
 * Reference: https://ipinfo.io/developers/data-downloads
 */

#include <config.h>

/* IPinfo uses MMDB format, so we need libmaxminddb */
#ifdef HAVE_LIBMAXMINDDB

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <math.h>
#include <limits.h>
#include <maxminddb.h>

#include "geoip_provider.h"

/* Database handles */
static MMDB_s ipinfo_country;
static MMDB_s ipinfo_asn;
static MMDB_s ipinfo_privacy;
static int country_open = 0;
static int asn_open = 0;
static int privacy_open = 0;

/* Database version string */
static char db_version[256] = "unknown";

/* Database filenames to search for (in order of preference) */
static const char *country_filenames[] = {
	"ipinfo_country.mmdb",
	"ipinfo_city.mmdb",
	"country.mmdb",
	NULL
};

static const char *asn_filenames[] = {
	"ipinfo_asn.mmdb",
	"asn.mmdb",
	NULL
};

static const char *privacy_filenames[] = {
	"ipinfo_privacy.mmdb",
	"privacy.mmdb",
	NULL
};

/* Search paths for .mmdb files */
static const char *search_paths[] = {
	"/usr/share/IPinfo",
	"/var/lib/IPinfo",
	"/usr/local/share/IPinfo",
	"/opt/IPinfo",
	"/usr/share/GeoIP",
	"/var/lib/GeoIP",
	NULL
};

/*
 * Try to open an MMDB file from explicit path or search paths
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
	if (strcmp(db_name, "country") == 0) {
		const char *env_path = getenv("IPINFO_DATABASE");
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
 * IPinfo uses simpler field paths than MaxMind
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
	/* IPinfo sometimes uses float */
	if (status == MMDB_SUCCESS && data.has_data && data.type == MMDB_DATA_TYPE_FLOAT) {
		return (double)data.float_value;
	}
	return NAN;
}

/*
 * Extract an unsigned 32-bit integer from MMDB entry
 * IPinfo stores ASN as string "AS15169" - we need to parse it
 */
static uint32_t extract_asn_from_string(MMDB_entry_s *entry, const char *field) {
	MMDB_entry_data_s data;
	int status;
	uint32_t asn = 0;

	status = MMDB_get_value(entry, &data, field, NULL);

	if (status == MMDB_SUCCESS && data.has_data && data.type == MMDB_DATA_TYPE_UTF8_STRING) {
		/* Parse "AS15169" format */
		if (data.data_size > 2 && strncmp(data.utf8_string, "AS", 2) == 0) {
			asn = (uint32_t)strtoul(data.utf8_string + 2, NULL, 10);
		}
	}

	return asn;
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
 * Initialize IPinfo provider
 */
static int ipinfo_init(const geoip_config_t *config) {
	/* Open Country/City database (primary) */
	if (open_mmdb(config ? config->city_db : NULL, country_filenames, &ipinfo_country, "country") == 0) {
		country_open = 1;

		/* Build version string from metadata */
		snprintf(db_version, sizeof(db_version) - 1, "IPinfo %s (%llu)",
			ipinfo_country.metadata.database_type,
			(unsigned long long)ipinfo_country.metadata.build_epoch);
	}

	/* Open ASN database (optional) */
	if (open_mmdb(config ? config->asn_db : NULL, asn_filenames, &ipinfo_asn, "asn") == 0) {
		asn_open = 1;
	}

	/* Open Privacy database (optional) */
	if (open_mmdb(config ? config->anonymous_db : NULL, privacy_filenames, &ipinfo_privacy, "privacy") == 0) {
		privacy_open = 1;
	}

	/* Success if at least country database is open */
	return country_open ? 0 : -1;
}

/*
 * Perform lookup against IPinfo databases
 *
 * IPinfo MMDB field structure (differs from MaxMind):
 * Country DB:
 *   - country: "US"
 *   - country_name: "United States"
 *   - continent: "NA"
 *   - continent_name: "North America"
 *
 * City DB (extended):
 *   - city: "Mountain View"
 *   - region: "California"
 *   - country: "US"
 *   - loc: "37.3860,-122.0838" (latitude,longitude as string)
 *   - postal: "94040"
 *   - timezone: "America/Los_Angeles"
 *
 * ASN DB:
 *   - asn: "AS15169"
 *   - name: "Google LLC"
 *   - domain: "google.com"
 *   - type: "isp" / "hosting" / "business" / "education"
 *
 * Privacy DB:
 *   - vpn: true/false
 *   - proxy: true/false
 *   - tor: true/false
 *   - relay: true/false
 *   - hosting: true/false
 *   - service: "Provider Name"
 */
static int ipinfo_lookup(const char *ip, geoip_result_t *result) {
	int gai_error, mmdb_error;
	MMDB_lookup_result_s lookup_result;
	char loc_buf[64];

	if (!country_open || ip == NULL || result == NULL) {
		return -1;
	}

	/* Clear result */
	geoip_result_clear(result);
	strncpy(result->provider, "ipinfo", sizeof(result->provider) - 1);
	strncpy(result->db_version, db_version, sizeof(result->db_version) - 1);

	/* Lookup in Country/City database */
	lookup_result = MMDB_lookup_string(&ipinfo_country, ip, &gai_error, &mmdb_error);

	if (gai_error != 0 || mmdb_error != MMDB_SUCCESS) {
		return -1;
	}

	if (!lookup_result.found_entry) {
		return 1; /* Not found */
	}

	/* Extract geographic data - IPinfo uses simpler flat structure */
	MMDB_entry_s *entry = &lookup_result.entry;

	extract_string(entry, result->country_code, sizeof(result->country_code), "country", NULL);
	extract_string(entry, result->country_name, sizeof(result->country_name), "country_name", NULL);
	extract_string(entry, result->region_name, sizeof(result->region_name), "region", NULL);
	extract_string(entry, result->city, sizeof(result->city), "city", NULL);
	extract_string(entry, result->postal_code, sizeof(result->postal_code), "postal", NULL);
	extract_string(entry, result->timezone, sizeof(result->timezone), "timezone", NULL);

	/* IPinfo stores lat/long as "lat,lng" string in "loc" field */
	extract_string(entry, loc_buf, sizeof(loc_buf), "loc", NULL);
	if (loc_buf[0] != '\0') {
		char *comma = strchr(loc_buf, ',');
		if (comma != NULL) {
			*comma = '\0';
			result->latitude = strtod(loc_buf, NULL);
			result->longitude = strtod(comma + 1, NULL);
		}
	}

	/* If country_name not in DB, try to fill from country code */
	if (result->country_name[0] == '\0' && result->country_code[0] != '\0') {
		/* Simple fallback - just use code */
		strncpy(result->country_name, result->country_code, sizeof(result->country_name) - 1);
	}

	/* Lookup in ASN database if available */
	if (asn_open) {
		lookup_result = MMDB_lookup_string(&ipinfo_asn, ip, &gai_error, &mmdb_error);
		if (gai_error == 0 && mmdb_error == MMDB_SUCCESS && lookup_result.found_entry) {
			entry = &lookup_result.entry;

			result->asn = extract_asn_from_string(entry, "asn");
			extract_string(entry, result->as_org, sizeof(result->as_org), "name", NULL);

			/* IPinfo ASN DB has "type" field: isp, hosting, business, education */
			char type_buf[32];
			extract_string(entry, type_buf, sizeof(type_buf), "type", NULL);
			if (type_buf[0] != '\0') {
				if (strcmp(type_buf, "hosting") == 0) {
					strncpy(result->ip_type, GEOIP_TYPE_DATACENTER, sizeof(result->ip_type) - 1);
				} else if (strcmp(type_buf, "business") == 0) {
					strncpy(result->ip_type, GEOIP_TYPE_BUSINESS, sizeof(result->ip_type) - 1);
				} else if (strcmp(type_buf, "education") == 0) {
					strncpy(result->ip_type, GEOIP_TYPE_EDUCATION, sizeof(result->ip_type) - 1);
				} else if (strcmp(type_buf, "isp") == 0) {
					strncpy(result->ip_type, GEOIP_TYPE_RESIDENTIAL, sizeof(result->ip_type) - 1);
				}
			}

			/* ISP is same as AS org for IPinfo */
			if (result->isp[0] == '\0' && result->as_org[0] != '\0') {
				strncpy(result->isp, result->as_org, sizeof(result->isp) - 1);
			}
		}
	}

	/* Lookup in Privacy database if available */
	if (privacy_open) {
		lookup_result = MMDB_lookup_string(&ipinfo_privacy, ip, &gai_error, &mmdb_error);
		if (gai_error == 0 && mmdb_error == MMDB_SUCCESS && lookup_result.found_entry) {
			entry = &lookup_result.entry;

			/* Determine IP type from privacy flags - most specific first */
			if (extract_bool(entry, "tor", NULL)) {
				strncpy(result->ip_type, GEOIP_TYPE_TOR, sizeof(result->ip_type) - 1);
			} else if (extract_bool(entry, "vpn", NULL)) {
				strncpy(result->ip_type, GEOIP_TYPE_VPN, sizeof(result->ip_type) - 1);
			} else if (extract_bool(entry, "proxy", NULL)) {
				strncpy(result->ip_type, GEOIP_TYPE_PROXY, sizeof(result->ip_type) - 1);
			} else if (extract_bool(entry, "hosting", NULL)) {
				strncpy(result->ip_type, GEOIP_TYPE_DATACENTER, sizeof(result->ip_type) - 1);
			} else if (extract_bool(entry, "relay", NULL)) {
				/* Apple iCloud Private Relay */
				strncpy(result->ip_type, GEOIP_TYPE_VPN, sizeof(result->ip_type) - 1);
			}
		}
	}

	return 0;
}

/*
 * Get database version string
 */
static const char *ipinfo_get_db_version(void) {
	return db_version;
}

/*
 * Check if provider is ready
 */
static int ipinfo_is_ready(void) {
	return country_open;
}

/*
 * Cleanup IPinfo provider
 */
static void ipinfo_cleanup(void) {
	if (country_open) {
		MMDB_close(&ipinfo_country);
		country_open = 0;
	}
	if (asn_open) {
		MMDB_close(&ipinfo_asn);
		asn_open = 0;
	}
	if (privacy_open) {
		MMDB_close(&ipinfo_privacy);
		privacy_open = 0;
	}
	db_version[0] = '\0';
}

/*
 * IPinfo provider interface
 */
geoip_provider_t geoip_ipinfo_provider = {
	.name = "ipinfo",
	.description = "IPinfo MMDB databases",
	.init = ipinfo_init,
	.lookup = ipinfo_lookup,
	.get_db_version = ipinfo_get_db_version,
	.is_ready = ipinfo_is_ready,
	.cleanup = ipinfo_cleanup,
};

#endif /* HAVE_LIBMAXMINDDB */
