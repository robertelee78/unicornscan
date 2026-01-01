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

#include <scan_progs/scanopts.h>
#include <scan_progs/scan_export.h>
#include <scan_progs/workunits.h>

#include <settings.h>
#include <unilib/qfifo.h>
#include <unilib/output.h>
#include <unilib/xmalloc.h>
#include <unilib/modules.h>
#include <unilib/cidr.h>

#include <arpa/inet.h>
#include <math.h>

#include <libpq-fe.h>

#include "pgsql_schema_embedded.h"
#include "geoip_provider.h"

static int pgsql_disable=0;
static int geoip_enabled=0; /* v6: GeoIP integration enabled */
static unsigned long long int pgscanid=0;

static mod_entry_t *_m=NULL;
static char *pgsql_escstr(const char *);
static int pgsql_exec_ddl(PGconn *conn, const char *ddl, const char *desc);

static PGconn *pgconn=NULL;
static PGresult *pgres=NULL;
static ExecStatusType pgret;
static const settings_t *s=NULL;
static char querybuf[1024 * 8];
static char db_os[4096], db_banner[4096];

/* v5: Additional query buffer for secondary inserts */
static char querybuf2[1024 * 4];

/*
 * Helper function to get mode character from mode flag
 * Returns: 'T' for TCP, 'U' for UDP, 'A' for ARP, 'I' for ICMP, 'P' for IP
 */
static char mode_to_char(uint8_t mode) {
	switch (mode) {
		case 1:  return 'T'; /* MODE_TCPSCAN */
		case 2:  return 'U'; /* MODE_UDPSCAN */
		case 4:  return 'A'; /* MODE_ARPSCAN */
		case 8:  return 'I'; /* MODE_ICMPSCAN */
		case 16: return 'P'; /* MODE_IPSCAN */
		default: return '?';
	}
}

/*
 * Build mode_str from phases array or single mode
 * Examples: "T" (TCP SYN), "Tsf" (TCP SYN+FIN), "A+T" (ARP then TCP), "A+T+U" (ARP, TCP, UDP)
 * Returns: pointer to static buffer containing mode string
 */
static const char *build_mode_str(const settings_t *settings) {
	static char mode_str[64];
	scan_phase_t *phases;
	int i;
	char *p = mode_str;
	size_t remaining = sizeof(mode_str) - 1;

	memset(mode_str, 0, sizeof(mode_str));

	if (settings->num_phases > 1 && settings->phases != NULL) {
		/* Compound mode: build from phases array */
		phases = (scan_phase_t *)settings->phases;
		for (i = 0; i < settings->num_phases && remaining > 2; i++) {
			if (i > 0) {
				*p++ = '+';
				remaining--;
			}

			/* Check for sf (connect) mode: TCP scan with L_DO_CONNECT in recv_opts */
			if (phases[i].mode == 1 && (phases[i].recv_opts & 4)) { /* MODE_TCPSCAN + L_DO_CONNECT */
				*p++ = 's';
				remaining--;
				if (remaining > 0) {
					*p++ = 'f';
					remaining--;
				}
			}
			else {
				*p++ = mode_to_char(phases[i].mode);
				remaining--;

				/* Add TCP flag suffixes for TCP mode */
				if (phases[i].mode == 1 && remaining > 0) { /* MODE_TCPSCAN */
					/* Check for common TCP flag combinations */
					uint16_t flags = phases[i].tcphdrflgs;
					if (flags & 0x02) { /* TH_SYN */ }
					if ((flags & 0x01) && remaining > 0) { *p++ = 'f'; remaining--; } /* TH_FIN */
					if ((flags & 0x04) && remaining > 0) { *p++ = 'r'; remaining--; } /* TH_RST */
					if ((flags & 0x08) && remaining > 0) { *p++ = 'p'; remaining--; } /* TH_PSH */
					if ((flags & 0x10) && remaining > 0) { *p++ = 'a'; remaining--; } /* TH_ACK */
					if ((flags & 0x20) && remaining > 0) { *p++ = 'u'; remaining--; } /* TH_URG */
				}
			}
		}
	}
	else if (settings->ss != NULL) {
		/* Check for sf (connect) mode: TCP scan with M_DO_CONNECT flag */
		if (settings->ss->mode == 1 && (settings->options & 32)) { /* MODE_TCPSCAN + M_DO_CONNECT */
			*p++ = 's';
			remaining--;
			if (remaining > 0) {
				*p++ = 'f';
				remaining--;
			}
		}
		else {
			/* Regular single mode: use ss->mode */
			*p++ = mode_to_char(settings->ss->mode);
		}

		/* Add TCP flag suffixes for TCP modes */
		if (settings->ss->mode == 1) { /* MODE_TCPSCAN */
			uint16_t flags = settings->ss->tcphdrflgs;
			if ((flags & 0x01) && remaining > 0) { *p++ = 'F'; remaining--; } /* TH_FIN */
			if ((flags & 0x04) && remaining > 0) { *p++ = 'R'; remaining--; } /* TH_RST */
			if ((flags & 0x08) && remaining > 0) { *p++ = 'P'; remaining--; } /* TH_PSH */
			if ((flags & 0x10) && remaining > 0) { *p++ = 'A'; remaining--; } /* TH_ACK */
			if ((flags & 0x20) && remaining > 0) { *p++ = 'U'; remaining--; } /* TH_URG */
		}
	}
	else {
		strcpy(mode_str, "?");
	}

	return mode_str;
}

/*
 * Compute mode_flags as OR of all phase modes
 * Returns: bitmask of all modes used in the scan
 */
static uint8_t compute_mode_flags(const settings_t *settings) {
	uint8_t flags = 0;
	scan_phase_t *phases;
	int i;

	if (settings->num_phases > 1 && settings->phases != NULL) {
		phases = (scan_phase_t *)settings->phases;
		for (i = 0; i < settings->num_phases; i++) {
			flags |= phases[i].mode;
		}
	}
	else if (settings->ss != NULL) {
		flags = settings->ss->mode;
	}

	return flags;
}

/*
 * Build target_str from settings->target_strs fifo
 * Concatenates all target specifications with space separator
 * Returns: pointer to static buffer containing target string, or NULL
 */
static char target_str_buf[4096];
static int target_str_offset;

static void append_target_str(void *ptr) {
	char *str = (char *)ptr;
	int len;

	if (str == NULL) return;
	len = strlen(str);

	if (target_str_offset + len + 2 < (int)sizeof(target_str_buf)) {
		if (target_str_offset > 0) {
			target_str_buf[target_str_offset++] = ' ';
		}
		memcpy(target_str_buf + target_str_offset, str, len);
		target_str_offset += len;
		target_str_buf[target_str_offset] = '\0';
	}
}

static const char *build_target_str(const settings_t *settings) {
	if (settings == NULL || settings->target_strs == NULL) {
		return NULL;
	}

	target_str_offset = 0;
	target_str_buf[0] = '\0';

	fifo_walk(settings->target_strs, append_target_str);

	if (target_str_offset == 0) {
		return NULL;
	}

	return target_str_buf;
}

/*
 * v5: Call fn_upsert_host() to insert/update host and return host_id
 * Parameters:
 *   host_addr: IP address string (e.g., "192.168.1.1")
 *   mac_addr: MAC address string or NULL (e.g., "00:11:22:33:44:55")
 * Returns: host_id on success, 0 on failure
 */
static unsigned long long int pgsql_upsert_host(const char *host_addr, const char *mac_addr) {
	PGresult *res;
	unsigned long long int host_id = 0;
	char *escaped_host = NULL;
	char *escaped_mac = NULL;

	if (host_addr == NULL || pgconn == NULL) {
		return 0;
	}

	escaped_host = pgsql_escstr(host_addr);
	if (escaped_host == NULL) {
		return 0;
	}

	if (mac_addr != NULL) {
		escaped_mac = pgsql_escstr(mac_addr);
		snprintf(querybuf2, sizeof(querybuf2) - 1,
			"SELECT fn_upsert_host('%s'::inet, '%s'::macaddr);",
			escaped_host, escaped_mac ? escaped_mac : "00:00:00:00:00:00"
		);
	}
	else {
		snprintf(querybuf2, sizeof(querybuf2) - 1,
			"SELECT fn_upsert_host('%s'::inet, NULL);",
			escaped_host
		);
	}

	res = PQexec(pgconn, querybuf2);
	if (PQresultStatus(res) == PGRES_TUPLES_OK && PQntuples(res) == 1) {
		const char *val = PQgetvalue(res, 0, 0);
		if (val != NULL) {
			sscanf(val, "%llu", &host_id);
		}
	}
	else {
		DBG(M_MOD, "fn_upsert_host failed: %s", PQerrorMessage(pgconn));
	}

	PQclear(res);
	return host_id;
}

/*
 * v5: Insert uni_host_scans junction record (host ↔ scan relationship)
 * Uses ON CONFLICT to handle duplicates gracefully
 */
static int pgsql_insert_host_scan(unsigned long long int host_id, unsigned long long int scans_id) {
	PGresult *res;
	int ret = 0;

	if (host_id == 0 || scans_id == 0 || pgconn == NULL) {
		return 0;
	}

	snprintf(querybuf2, sizeof(querybuf2) - 1,
		"INSERT INTO uni_host_scans (host_id, scans_id, first_response, response_count) "
		"VALUES (%llu, %llu, NOW(), 1) "
		"ON CONFLICT (host_id, scans_id) DO UPDATE SET response_count = uni_host_scans.response_count + 1;",
		host_id, scans_id
	);

	res = PQexec(pgconn, querybuf2);
	if (PQresultStatus(res) == PGRES_COMMAND_OK) {
		ret = 1;
	}
	else {
		DBG(M_MOD, "uni_host_scans insert failed: %s", PQerrorMessage(pgconn));
	}

	PQclear(res);
	return ret;
}

/*
 * v8: Record MAC<->IP association in uni_mac_ip_history
 * Tracks historical MAC<->IP pairings for temporal analysis
 */
static unsigned long long int pgsql_record_mac_ip(const char *host_addr, const char *mac_addr, unsigned long long int scans_id) {
	PGresult *res;
	unsigned long long int history_id = 0;
	char *escaped_host = NULL;
	char *escaped_mac = NULL;

	if (host_addr == NULL || mac_addr == NULL || pgconn == NULL) {
		return 0;
	}

	escaped_host = pgsql_escstr(host_addr);
	escaped_mac = pgsql_escstr(mac_addr);

	if (escaped_host == NULL || escaped_mac == NULL) {
		return 0;
	}

	snprintf(querybuf2, sizeof(querybuf2) - 1,
		"SELECT fn_record_mac_ip('%s'::inet, '%s'::macaddr, %llu);",
		escaped_host, escaped_mac, scans_id
	);

	res = PQexec(pgconn, querybuf2);
	if (PQresultStatus(res) == PGRES_TUPLES_OK && PQntuples(res) == 1) {
		const char *val = PQgetvalue(res, 0, 0);
		if (val != NULL) {
			sscanf(val, "%llu", &history_id);
		}
	}
	else {
		DBG(M_MOD, "fn_record_mac_ip failed: %s", PQerrorMessage(pgconn));
	}

	PQclear(res);
	return history_id;
}

/*
 * v5: Insert uni_hops record when trace_addr != host_addr (intermediate hop detected)
 */
static int pgsql_insert_hop(unsigned long long int ipreport_id, unsigned long long int scans_id,
                            const char *target_addr, const char *hop_addr, int ttl) {
	PGresult *res;
	int ret = 0;
	char *escaped_target = NULL;
	char *escaped_hop = NULL;

	if (target_addr == NULL || hop_addr == NULL || pgconn == NULL) {
		return 0;
	}

	escaped_target = pgsql_escstr(target_addr);
	escaped_hop = pgsql_escstr(hop_addr);

	if (escaped_target == NULL || escaped_hop == NULL) {
		return 0;
	}

	snprintf(querybuf2, sizeof(querybuf2) - 1,
		"INSERT INTO uni_hops (ipreport_id, scans_id, target_addr, hop_addr, ttl_observed) "
		"VALUES (%llu, %llu, '%s', '%s', %d);",
		ipreport_id, scans_id, escaped_target, escaped_hop, ttl
	);

	res = PQexec(pgconn, querybuf2);
	if (PQresultStatus(res) == PGRES_COMMAND_OK) {
		ret = 1;
	}
	else {
		DBG(M_MOD, "uni_hops insert failed: %s", PQerrorMessage(pgconn));
	}

	PQclear(res);
	return ret;
}

/*
 * v5: Parse banner string and extract service identification fields
 * Common banner patterns:
 *   HTTP/1.1 200 OK\r\nServer: Apache/2.4.41\r\n...
 *   SSH-2.0-OpenSSH_8.2p1 Ubuntu-4ubuntu0.1
 *   220 smtp.example.com ESMTP Postfix
 *   FTP 220 ProFTPD 1.3.5 Server
 *
 * Returns 1 if service identified, 0 otherwise
 * Output parameters are filled with parsed data (caller owns buffers)
 */
static int pgsql_parse_banner(const char *banner, int port, int proto,
                              char *service_name, size_t sn_len,
                              char *product, size_t prod_len,
                              char *version, size_t ver_len) {
	const char *p;

	if (banner == NULL || strlen(banner) < 3) {
		return 0;
	}

	/* Initialize output buffers */
	service_name[0] = '\0';
	product[0] = '\0';
	version[0] = '\0';

	/* HTTP detection */
	if (strncmp(banner, "HTTP/", 5) == 0) {
		strncpy(service_name, "http", sn_len - 1);
		/* Look for Server: header */
		p = strstr(banner, "Server:");
		if (p == NULL) p = strstr(banner, "server:");
		if (p != NULL) {
			p += 7; /* Skip "Server:" */
			while (*p == ' ') p++; /* Skip whitespace */
			/* Extract product name (up to / or space or newline) */
			size_t i = 0;
			while (p[i] && p[i] != '/' && p[i] != ' ' && p[i] != '\r' && p[i] != '\n' && i < prod_len - 1) {
				product[i] = p[i];
				i++;
			}
			product[i] = '\0';
			/* Extract version if present */
			if (p[i] == '/') {
				p += i + 1;
				i = 0;
				while (p[i] && p[i] != ' ' && p[i] != '\r' && p[i] != '\n' && i < ver_len - 1) {
					version[i] = p[i];
					i++;
				}
				version[i] = '\0';
			}
		}
		return 1;
	}

	/* SSH detection */
	if (strncmp(banner, "SSH-", 4) == 0) {
		strncpy(service_name, "ssh", sn_len - 1);
		/* SSH-2.0-OpenSSH_8.2p1 format */
		p = strchr(banner, '-');
		if (p) p = strchr(p + 1, '-'); /* Skip to product name */
		if (p) {
			p++; /* Skip the '-' */
			size_t i = 0;
			while (p[i] && p[i] != '_' && p[i] != ' ' && p[i] != '\r' && p[i] != '\n' && i < prod_len - 1) {
				product[i] = p[i];
				i++;
			}
			product[i] = '\0';
			/* Version after underscore */
			if (p[i] == '_') {
				p += i + 1;
				i = 0;
				while (p[i] && p[i] != ' ' && p[i] != '\r' && p[i] != '\n' && i < ver_len - 1) {
					version[i] = p[i];
					i++;
				}
				version[i] = '\0';
			}
		}
		return 1;
	}

	/* FTP detection (220 response) */
	if (strncmp(banner, "220", 3) == 0 && (proto == 6 || port == 21)) {
		strncpy(service_name, "ftp", sn_len - 1);
		/* Try to extract server name from 220 response */
		p = banner + 4; /* Skip "220 " */
		if (*p) {
			/* Look for common FTP server names */
			if (strstr(p, "ProFTPD")) {
				strncpy(product, "ProFTPD", prod_len - 1);
			}
			else if (strstr(p, "vsftpd")) {
				strncpy(product, "vsftpd", prod_len - 1);
			}
			else if (strstr(p, "FileZilla")) {
				strncpy(product, "FileZilla", prod_len - 1);
			}
			else if (strstr(p, "Pure-FTPd")) {
				strncpy(product, "Pure-FTPd", prod_len - 1);
			}
		}
		return 1;
	}

	/* SMTP detection (220 response with SMTP/ESMTP) */
	if (strncmp(banner, "220", 3) == 0 && (strstr(banner, "SMTP") || strstr(banner, "smtp") || port == 25 || port == 587)) {
		strncpy(service_name, "smtp", sn_len - 1);
		if (strstr(banner, "Postfix")) {
			strncpy(product, "Postfix", prod_len - 1);
		}
		else if (strstr(banner, "Exim")) {
			strncpy(product, "Exim", prod_len - 1);
		}
		else if (strstr(banner, "Sendmail")) {
			strncpy(product, "Sendmail", prod_len - 1);
		}
		return 1;
	}

	/* MySQL detection */
	if (port == 3306 && banner[0] >= 0x30 && banner[0] <= 0x39) {
		strncpy(service_name, "mysql", sn_len - 1);
		strncpy(product, "MySQL", prod_len - 1);
		return 1;
	}

	/* Port-based fallback identification */
	switch (port) {
		case 22:  strncpy(service_name, "ssh", sn_len - 1); break;
		case 23:  strncpy(service_name, "telnet", sn_len - 1); break;
		case 25:
		case 587: strncpy(service_name, "smtp", sn_len - 1); break;
		case 53:  strncpy(service_name, "domain", sn_len - 1); break;
		case 80:
		case 8080: strncpy(service_name, "http", sn_len - 1); break;
		case 110: strncpy(service_name, "pop3", sn_len - 1); break;
		case 143: strncpy(service_name, "imap", sn_len - 1); break;
		case 443:
		case 8443: strncpy(service_name, "https", sn_len - 1); break;
		case 993: strncpy(service_name, "imaps", sn_len - 1); break;
		case 995: strncpy(service_name, "pop3s", sn_len - 1); break;
		case 3306: strncpy(service_name, "mysql", sn_len - 1); break;
		case 5432: strncpy(service_name, "postgresql", sn_len - 1); break;
		case 6379: strncpy(service_name, "redis", sn_len - 1); break;
		default:
			/* Unknown service - no identification */
			return 0;
	}

	return (service_name[0] != '\0') ? 1 : 0;
}

/*
 * v5: Insert uni_services record with parsed banner data
 */
static int pgsql_insert_service(unsigned long long int ipreport_id, unsigned long long int scans_id,
                                const char *host_addr, int port, int proto, const char *banner) {
	PGresult *res;
	int ret = 0;
	char service_name[64], product[128], version[64];
	char *escaped_host = NULL;
	char *escaped_banner = NULL;
	char *escaped_svc = NULL;
	char *escaped_prod = NULL;
	char *escaped_ver = NULL;

	if (host_addr == NULL || banner == NULL || pgconn == NULL) {
		return 0;
	}

	/* Parse the banner to extract service identification */
	if (!pgsql_parse_banner(banner, port, proto, service_name, sizeof(service_name),
	                        product, sizeof(product), version, sizeof(version))) {
		/* Could not identify service from banner - store raw banner only */
		service_name[0] = '\0';
		product[0] = '\0';
		version[0] = '\0';
	}

	escaped_host = pgsql_escstr(host_addr);
	escaped_banner = pgsql_escstr(banner);
	escaped_svc = pgsql_escstr(service_name);
	escaped_prod = pgsql_escstr(product);
	escaped_ver = pgsql_escstr(version);

	snprintf(querybuf2, sizeof(querybuf2) - 1,
		"INSERT INTO uni_services (host_addr, port, proto, scans_id, ipreport_id, "
		"service_name, product, version, banner_raw, detected_at) "
		"VALUES ('%s', %d, %d, %llu, %llu, "
		"NULLIF('%s',''), NULLIF('%s',''), NULLIF('%s',''), '%s', NOW()) "
		"ON CONFLICT (host_addr, port, proto, scans_id) DO UPDATE SET "
		"service_name = COALESCE(NULLIF(EXCLUDED.service_name,''), uni_services.service_name), "
		"product = COALESCE(NULLIF(EXCLUDED.product,''), uni_services.product), "
		"version = COALESCE(NULLIF(EXCLUDED.version,''), uni_services.version), "
		"banner_raw = EXCLUDED.banner_raw;",
		escaped_host ? escaped_host : "",
		port, proto, scans_id, ipreport_id,
		escaped_svc ? escaped_svc : "",
		escaped_prod ? escaped_prod : "",
		escaped_ver ? escaped_ver : "",
		escaped_banner ? escaped_banner : ""
	);

	res = PQexec(pgconn, querybuf2);
	if (PQresultStatus(res) == PGRES_COMMAND_OK) {
		ret = 1;
	}
	else {
		DBG(M_MOD, "uni_services insert failed: %s", PQerrorMessage(pgconn));
	}

	PQclear(res);
	return ret;
}

/*
 * v5: Parse OS fingerprint string and extract identification fields
 * Unicornscan OS strings are typically derived from TTL/window size analysis
 * Format varies but often: "Linux 2.6.x" or "Windows XP" or specific signatures
 *
 * Returns 1 if OS identified, 0 otherwise
 */
static int pgsql_parse_os_fingerprint(const char *os_str, int ttl, int window_size,
                                      char *os_family, size_t fam_len,
                                      char *os_name, size_t name_len,
                                      char *os_version, size_t ver_len,
                                      char *device_type, size_t dev_len) {
	if (os_str == NULL || strlen(os_str) < 2) {
		return 0;
	}

	/* Initialize output buffers */
	os_family[0] = '\0';
	os_name[0] = '\0';
	os_version[0] = '\0';
	device_type[0] = '\0';

	/* Linux detection */
	if (strstr(os_str, "Linux") || strstr(os_str, "linux")) {
		strncpy(os_family, "Linux", fam_len - 1);
		strncpy(os_name, os_str, name_len - 1);
		strncpy(device_type, "general purpose", dev_len - 1);
		/* Try to extract version like "2.6.x" or "5.x" */
		const char *p = strstr(os_str, "Linux");
		if (p == NULL) p = strstr(os_str, "linux");
		if (p) {
			p += 5; /* Skip "Linux" */
			while (*p == ' ') p++;
			if (*p >= '0' && *p <= '9') {
				size_t i = 0;
				while (p[i] && p[i] != ' ' && i < ver_len - 1) {
					os_version[i] = p[i];
					i++;
				}
				os_version[i] = '\0';
			}
		}
		return 1;
	}

	/* Windows detection */
	if (strstr(os_str, "Windows") || strstr(os_str, "windows") || strstr(os_str, "Win")) {
		strncpy(os_family, "Windows", fam_len - 1);
		strncpy(os_name, os_str, name_len - 1);
		strncpy(device_type, "general purpose", dev_len - 1);
		return 1;
	}

	/* BSD detection */
	if (strstr(os_str, "BSD") || strstr(os_str, "FreeBSD") || strstr(os_str, "OpenBSD") || strstr(os_str, "NetBSD")) {
		strncpy(os_family, "BSD", fam_len - 1);
		strncpy(os_name, os_str, name_len - 1);
		strncpy(device_type, "general purpose", dev_len - 1);
		return 1;
	}

	/* macOS/Darwin detection */
	if (strstr(os_str, "macOS") || strstr(os_str, "Mac OS") || strstr(os_str, "Darwin")) {
		strncpy(os_family, "macOS", fam_len - 1);
		strncpy(os_name, os_str, name_len - 1);
		strncpy(device_type, "general purpose", dev_len - 1);
		return 1;
	}

	/* Cisco IOS detection */
	if (strstr(os_str, "Cisco") || strstr(os_str, "IOS")) {
		strncpy(os_family, "Cisco IOS", fam_len - 1);
		strncpy(os_name, os_str, name_len - 1);
		strncpy(device_type, "router", dev_len - 1);
		return 1;
	}

	/* TTL-based inference as fallback */
	if (os_family[0] == '\0' && ttl > 0) {
		if (ttl <= 64) {
			strncpy(os_family, "Linux/Unix", fam_len - 1);
			strncpy(device_type, "general purpose", dev_len - 1);
		}
		else if (ttl <= 128) {
			strncpy(os_family, "Windows", fam_len - 1);
			strncpy(device_type, "general purpose", dev_len - 1);
		}
		else if (ttl <= 255) {
			strncpy(os_family, "Network Device", fam_len - 1);
			strncpy(device_type, "router/switch", dev_len - 1);
		}
		/* Store original string as os_name even for TTL-inferred */
		strncpy(os_name, os_str, name_len - 1);
		return 1;
	}

	/* Generic fallback - store as-is */
	strncpy(os_name, os_str, name_len - 1);
	return (os_name[0] != '\0') ? 1 : 0;
}

/*
 * v5: Insert uni_os_fingerprints record with parsed OS data
 */
static int pgsql_insert_os_fingerprint(unsigned long long int ipreport_id, unsigned long long int scans_id,
                                       const char *host_addr, const char *os_str, int ttl, int window_size) {
	PGresult *res;
	int ret = 0;
	char os_family[64], os_name[128], os_version[64], device_type[64];
	char *escaped_host = NULL;
	char *escaped_os_str = NULL;
	char *escaped_family = NULL;
	char *escaped_name = NULL;
	char *escaped_version = NULL;
	char *escaped_device = NULL;

	if (host_addr == NULL || os_str == NULL || pgconn == NULL) {
		return 0;
	}

	/* Parse the OS string to extract identification */
	if (!pgsql_parse_os_fingerprint(os_str, ttl, window_size,
	                                os_family, sizeof(os_family),
	                                os_name, sizeof(os_name),
	                                os_version, sizeof(os_version),
	                                device_type, sizeof(device_type))) {
		/* Could not identify OS - store raw string only */
		os_family[0] = '\0';
		os_name[0] = '\0';
		os_version[0] = '\0';
		device_type[0] = '\0';
	}

	escaped_host = pgsql_escstr(host_addr);
	escaped_os_str = pgsql_escstr(os_str);
	escaped_family = pgsql_escstr(os_family);
	escaped_name = pgsql_escstr(os_name);
	escaped_version = pgsql_escstr(os_version);
	escaped_device = pgsql_escstr(device_type);

	snprintf(querybuf2, sizeof(querybuf2) - 1,
		"INSERT INTO uni_os_fingerprints (host_addr, scans_id, ipreport_id, "
		"os_family, os_name, os_version, os_full, device_type, "
		"ttl_observed, window_size, detected_at) "
		"VALUES ('%s', %llu, %llu, "
		"NULLIF('%s',''), NULLIF('%s',''), NULLIF('%s',''), '%s', NULLIF('%s',''), "
		"%d, %d, NOW());",
		escaped_host ? escaped_host : "",
		scans_id, ipreport_id,
		escaped_family ? escaped_family : "",
		escaped_name ? escaped_name : "",
		escaped_version ? escaped_version : "",
		escaped_os_str ? escaped_os_str : "",
		escaped_device ? escaped_device : "",
		ttl, window_size
	);

	res = PQexec(pgconn, querybuf2);
	if (PQresultStatus(res) == PGRES_COMMAND_OK) {
		ret = 1;
	}
	else {
		DBG(M_MOD, "uni_os_fingerprints insert failed: %s", PQerrorMessage(pgconn));
	}

	PQclear(res);
	return ret;
}

/*
 * Insert phase data into uni_scan_phases table
 * Called after scan is created, only for compound mode scans
 */
static int pgsql_insert_phases(unsigned long long int scanid, const settings_t *settings) {
	scan_phase_t *phases;
	int i;

	if (settings->num_phases <= 1 || settings->phases == NULL) {
		return 1; /* Nothing to insert for single-phase scans */
	}

	phases = (scan_phase_t *)settings->phases;

	for (i = 0; i < settings->num_phases; i++) {
		snprintf(querybuf, sizeof(querybuf) - 1,
			"INSERT INTO uni_scan_phases ("
			"    scans_id, phase_idx, mode, mode_char, tcphdrflgs, "
			"    send_opts, recv_opts, pps, repeats, recv_timeout"
			") VALUES ("
			"    %llu, %d, %d, '%c', %u, "
			"    %u, %u, %u, %u, %u"
			");",
			scanid, i, phases[i].mode, mode_to_char(phases[i].mode), phases[i].tcphdrflgs,
			phases[i].send_opts, phases[i].recv_opts, phases[i].pps, phases[i].repeats, phases[i].recv_timeout
		);

		pgres = PQexec(pgconn, querybuf);
		pgret = PQresultStatus(pgres);
		if (pgret != PGRES_COMMAND_OK) {
			ERR("PostgreSQL phase insert failed: %s: %s", PQresStatus(pgret), PQresultErrorMessage(pgres));
			PQclear(pgres);
			return 0;
		}
		PQclear(pgres);
	}

	return 1;
}

/*
 * v6: Insert uni_geoip record with GeoIP lookup data
 */
static int pgsql_insert_geoip(unsigned long long int scans_id, const char *host_addr) {
	PGresult *res;
	int ret = 0;
	geoip_result_t geoip;
	char *escaped_host = NULL;
	char *escaped_country = NULL;
	char *escaped_country_name = NULL;
	char *escaped_region = NULL;
	char *escaped_region_name = NULL;
	char *escaped_city = NULL;
	char *escaped_postal = NULL;
	char *escaped_timezone = NULL;
	char *escaped_ip_type = NULL;
	char *escaped_isp = NULL;
	char *escaped_org = NULL;
	char *escaped_as_org = NULL;
	char *escaped_provider = NULL;
	char *escaped_db_version = NULL;
	char lat_str[32], lon_str[32], asn_str[32], conf_str[16];

	if (!geoip_enabled || host_addr == NULL || pgconn == NULL) {
		return 0;
	}

	/* Perform GeoIP lookup */
	if (geoip_lookup(host_addr, &geoip) != 0) {
		return 0; /* Lookup failed or not found - not an error */
	}

	/* Escape all strings for SQL */
	escaped_host = pgsql_escstr(host_addr);
	escaped_country = pgsql_escstr(geoip.country_code);
	escaped_country_name = pgsql_escstr(geoip.country_name);
	escaped_region = pgsql_escstr(geoip.region_code);
	escaped_region_name = pgsql_escstr(geoip.region_name);
	escaped_city = pgsql_escstr(geoip.city);
	escaped_postal = pgsql_escstr(geoip.postal_code);
	escaped_timezone = pgsql_escstr(geoip.timezone);
	escaped_ip_type = pgsql_escstr(geoip.ip_type);
	escaped_isp = pgsql_escstr(geoip.isp);
	escaped_org = pgsql_escstr(geoip.organization);
	escaped_as_org = pgsql_escstr(geoip.as_org);
	escaped_provider = pgsql_escstr(geoip.provider);
	escaped_db_version = pgsql_escstr(geoip.db_version);

	/* Format lat/long (handle NAN) */
	if (isnan(geoip.latitude)) {
		strncpy(lat_str, "NULL", sizeof(lat_str));
	} else {
		snprintf(lat_str, sizeof(lat_str), "%.6f", geoip.latitude);
	}
	if (isnan(geoip.longitude)) {
		strncpy(lon_str, "NULL", sizeof(lon_str));
	} else {
		snprintf(lon_str, sizeof(lon_str), "%.6f", geoip.longitude);
	}

	/* Format ASN and confidence */
	if (geoip.asn > 0) {
		snprintf(asn_str, sizeof(asn_str), "%u", geoip.asn);
	} else {
		strncpy(asn_str, "NULL", sizeof(asn_str));
	}
	if (geoip.confidence >= 0) {
		snprintf(conf_str, sizeof(conf_str), "%d", geoip.confidence);
	} else {
		strncpy(conf_str, "NULL", sizeof(conf_str));
	}

	snprintf(querybuf2, sizeof(querybuf2) - 1,
		"INSERT INTO uni_geoip ("
		"  host_ip, scans_id, "
		"  country_code, country_name, region_code, region_name, city, postal_code, "
		"  latitude, longitude, timezone, "
		"  ip_type, isp, organization, asn, as_org, "
		"  provider, database_version, confidence"
		") VALUES ("
		"  '%s', %llu, "
		"  NULLIF('%s',''), NULLIF('%s',''), NULLIF('%s',''), NULLIF('%s',''), NULLIF('%s',''), NULLIF('%s',''), "
		"  %s, %s, NULLIF('%s',''), "
		"  NULLIF('%s',''), NULLIF('%s',''), NULLIF('%s',''), %s, NULLIF('%s',''), "
		"  '%s', NULLIF('%s',''), %s"
		") ON CONFLICT (host_ip, scans_id) DO NOTHING;",
		escaped_host ? escaped_host : "",
		scans_id,
		escaped_country ? escaped_country : "",
		escaped_country_name ? escaped_country_name : "",
		escaped_region ? escaped_region : "",
		escaped_region_name ? escaped_region_name : "",
		escaped_city ? escaped_city : "",
		escaped_postal ? escaped_postal : "",
		lat_str, lon_str,
		escaped_timezone ? escaped_timezone : "",
		escaped_ip_type ? escaped_ip_type : "",
		escaped_isp ? escaped_isp : "",
		escaped_org ? escaped_org : "",
		asn_str,
		escaped_as_org ? escaped_as_org : "",
		escaped_provider ? escaped_provider : "unknown",
		escaped_db_version ? escaped_db_version : "",
		conf_str
	);

	res = PQexec(pgconn, querybuf2);
	if (PQresultStatus(res) == PGRES_COMMAND_OK) {
		ret = 1;
	}
	else {
		DBG(M_MOD, "uni_geoip insert failed: %s", PQerrorMessage(pgconn));
	}

	PQclear(res);
	return ret;
}

void pgsql_database_init(void);
void pgsql_database_fini(void);

static int pgsql_dealwith_sworkunit(uint32_t, const send_workunit_t *);
static int pgsql_dealwith_rworkunit(uint32_t, const recv_workunit_t *);
static int pgsql_dealwith_ipreport(const ip_report_t *);
static int pgsql_dealwith_arpreport(const arp_report_t *);
static int pgsql_dealwith_wkstats(uint32_t /* magic */, const workunit_stats_t *);
static void database_walk_func(void *);

/*
 * Get current schema version from database
 * Returns: version number (>= 0), or -1 on error/no version table
 */
static int pgsql_get_schema_version(PGconn *conn) {
	PGresult *res;
	int version = -1;

	res = PQexec(conn,
		"SELECT COALESCE(MAX(version), 0) FROM uni_schema_version;"
	);

	if (PQresultStatus(res) == PGRES_TUPLES_OK && PQntuples(res) == 1) {
		const char *val = PQgetvalue(res, 0, 0);
		if (val != NULL) {
			version = atoi(val);
		}
	}

	PQclear(res);
	return version;
}

/*
 * Migrate schema from old version to current version
 * Returns: 1 on success, 0 on failure
 */
static int pgsql_migrate_schema(PGconn *conn, int from_version) {
	char version_sql[256];

	/* Migration from v1 to v2: add JSONB columns, indexes, and views */
	if (from_version < 2) {
		VRB(0, "PostgreSQL: migrating schema from v%d to v2...", from_version);

		if (!pgsql_exec_ddl(conn, pgsql_schema_migration_v2_ddl, "migrate to v2 (add JSONB columns and indexes)")) {
			return 0;
		}

		/* Create/update convenience views (CREATE OR REPLACE is idempotent) */
		if (!pgsql_exec_ddl(conn, pgsql_schema_views_ddl, "create views")) {
			return 0;
		}

		/* Record new version */
		snprintf(version_sql, sizeof(version_sql) - 1, pgsql_schema_record_version_fmt, 2);
		if (!pgsql_exec_ddl(conn, version_sql, "record schema version 2")) {
			return 0;
		}

		VRB(0, "PostgreSQL: schema migration to v2 complete");
		from_version = 2;
	}

	/* Migration from v2 to v3: add RLS (Row Level Security) and security invoker views */
	if (from_version < 3) {
		VRB(0, "PostgreSQL: migrating schema from v%d to v3 (adding RLS)...", from_version);

		if (!pgsql_exec_ddl(conn, pgsql_schema_migration_v3_ddl, "migrate to v3 (enable RLS and security invoker views)")) {
			return 0;
		}

		/* Record new version */
		snprintf(version_sql, sizeof(version_sql) - 1, pgsql_schema_record_version_fmt, 3);
		if (!pgsql_exec_ddl(conn, version_sql, "record schema version 3")) {
			return 0;
		}

		VRB(0, "PostgreSQL: schema migration to v3 complete (RLS enabled)");
		from_version = 3;
	}

	/* Migration from v3 to v4: add compound mode support and scan notes */
	if (from_version < 4) {
		VRB(0, "PostgreSQL: migrating schema from v%d to v4 (adding compound mode support)...", from_version);

		if (!pgsql_exec_ddl(conn, pgsql_schema_migration_v4_ddl, "migrate to v4 (compound mode and scan notes)")) {
			return 0;
		}

		/* Record new version */
		snprintf(version_sql, sizeof(version_sql) - 1, pgsql_schema_record_version_fmt, 4);
		if (!pgsql_exec_ddl(conn, version_sql, "record schema version 4")) {
			return 0;
		}

		VRB(0, "PostgreSQL: schema migration to v4 complete (compound mode support added)");
		from_version = 4;
	}

	/* Migration from v4 to v5: add frontend support tables */
	if (from_version < 5) {
		VRB(0, "PostgreSQL: migrating schema from v%d to v5 (adding frontend support tables)...", from_version);

		/* Create v5 sequences first (already in sequences_ddl but need to ensure they exist) */
		if (!pgsql_exec_ddl(conn,
			"CREATE SEQUENCE IF NOT EXISTS uni_hosts_id_seq;\n"
			"CREATE SEQUENCE IF NOT EXISTS uni_hops_id_seq;\n"
			"CREATE SEQUENCE IF NOT EXISTS uni_services_id_seq;\n"
			"CREATE SEQUENCE IF NOT EXISTS uni_osfingerprints_id_seq;\n"
			"CREATE SEQUENCE IF NOT EXISTS uni_networks_id_seq;\n"
			"CREATE SEQUENCE IF NOT EXISTS uni_notes_id_seq;\n"
			"CREATE SEQUENCE IF NOT EXISTS uni_saved_filters_id_seq;\n",
			"create v5 sequences")) {
			return 0;
		}

		/* Create v5 tables */
		if (!pgsql_exec_ddl(conn, pgsql_schema_migration_v5_ddl, "create v5 tables and indexes")) {
			return 0;
		}

		/* Add v5 foreign key constraints */
		if (!pgsql_exec_ddl(conn, pgsql_schema_v5_constraints_ddl, "create v5 foreign key constraints")) {
			return 0;
		}

		/* Enable RLS and create policies for v5 tables */
		if (!pgsql_exec_ddl(conn, pgsql_schema_v5_rls_ddl, "enable v5 RLS and policies")) {
			return 0;
		}

		/* Create fn_upsert_host function */
		if (!pgsql_exec_ddl(conn, pgsql_schema_v5_functions_ddl, "create fn_upsert_host function")) {
			return 0;
		}

		/* Create v5 views */
		if (!pgsql_exec_ddl(conn, pgsql_schema_v5_views_ddl, "create v5 views")) {
			return 0;
		}

		/* Record new version */
		snprintf(version_sql, sizeof(version_sql) - 1, pgsql_schema_record_version_fmt, 5);
		if (!pgsql_exec_ddl(conn, version_sql, "record schema version 5")) {
			return 0;
		}

		VRB(0, "PostgreSQL: schema migration to v5 complete (frontend support tables added)");
	}

	/* Migration from v5 to v6: add GeoIP integration */
	if (from_version < 6) {
		VRB(0, "PostgreSQL: migrating schema from v%d to v6 (adding GeoIP integration)...", from_version);

		/* Create uni_geoip_id_seq sequence */
		if (!pgsql_exec_ddl(conn, pgsql_schema_geoip_seq_ddl, "create uni_geoip_id_seq")) {
			return 0;
		}

		/* Create uni_geoip table and indexes */
		if (!pgsql_exec_ddl(conn, pgsql_schema_migration_v6_ddl, "create uni_geoip table")) {
			return 0;
		}

		/* Add v6 foreign key constraints */
		if (!pgsql_exec_ddl(conn, pgsql_schema_v6_constraints_ddl, "create v6 foreign key constraints")) {
			return 0;
		}

		/* Enable RLS and create policies for v6 tables */
		if (!pgsql_exec_ddl(conn, pgsql_schema_v6_rls_ddl, "enable v6 RLS and policies")) {
			return 0;
		}

		/* Create v6 views */
		if (!pgsql_exec_ddl(conn, pgsql_schema_v6_views_ddl, "create v6 views")) {
			return 0;
		}

		/* Record new version */
		snprintf(version_sql, sizeof(version_sql) - 1, pgsql_schema_record_version_fmt, 6);
		if (!pgsql_exec_ddl(conn, version_sql, "record schema version 6")) {
			return 0;
		}

		VRB(0, "PostgreSQL: schema migration to v6 complete (GeoIP integration added)");
	}

	/* Upgrade to v7: add target_str column */
	if (from_version < 7) {
		if (!pgsql_exec_ddl(conn, pgsql_schema_migration_v7_ddl, "add target_str column")) {
			return 0;
		}
		snprintf(version_sql, sizeof(version_sql) - 1, pgsql_schema_record_version_fmt, 7);
		if (!pgsql_exec_ddl(conn, version_sql, "record schema version 7")) {
			return 0;
		}
		VRB(0, "PostgreSQL: schema migration to v7 complete (target_str added)");
	}

	/* Upgrade to v8: add MAC<->IP history tracking */
	if (from_version < 8) {
		/* Create sequence first */
		if (!pgsql_exec_ddl(conn, "CREATE SEQUENCE IF NOT EXISTS uni_mac_ip_history_id_seq;", "create mac_ip_history sequence")) {
			return 0;
		}
		/* Create table and indexes */
		if (!pgsql_exec_ddl(conn, pgsql_schema_migration_v8_ddl, "create mac_ip_history table")) {
			return 0;
		}
		/* Create function */
		if (!pgsql_exec_ddl(conn, pgsql_schema_v8_functions_ddl, "create fn_record_mac_ip function")) {
			return 0;
		}
		/* Create views */
		if (!pgsql_exec_ddl(conn, pgsql_schema_v8_views_ddl, "create v8 views")) {
			return 0;
		}
		/* Update v_hosts view */
		if (!pgsql_exec_ddl(conn, pgsql_schema_v8_update_v_hosts_ddl, "update v_hosts view")) {
			return 0;
		}
		/* Record new version */
		snprintf(version_sql, sizeof(version_sql) - 1, pgsql_schema_record_version_fmt, 8);
		if (!pgsql_exec_ddl(conn, version_sql, "record schema version 8")) {
			return 0;
		}
		VRB(0, "PostgreSQL: schema migration to v8 complete (MAC<->IP history added)");
	}

	/* Upgrade to v9: add eth_hwaddr column for local network MAC capture */
	if (from_version < 9) {
		if (!pgsql_exec_ddl(conn, pgsql_schema_v9_add_eth_hwaddr_ddl, "add eth_hwaddr column")) {
			return 0;
		}
		snprintf(version_sql, sizeof(version_sql) - 1, pgsql_schema_record_version_fmt, 9);
		if (!pgsql_exec_ddl(conn, version_sql, "record schema version 9")) {
			return 0;
		}
		VRB(0, "PostgreSQL: schema migration to v9 complete (eth_hwaddr column added)");
	}

	return 1;
}

/*
 * Check if the unicornscan schema exists in the database
 * Returns: 1 if schema exists, 0 if not, -1 on error
 */
static int pgsql_check_schema(PGconn *conn) {
	PGresult *res;
	int schema_exists = 0;

	/* Check if uni_scans table exists - it's the primary table */
	res = PQexec(conn,
		"SELECT EXISTS ("
		"    SELECT FROM information_schema.tables "
		"    WHERE table_schema = 'public' "
		"    AND table_name = 'uni_scans'"
		");"
	);

	if (PQresultStatus(res) != PGRES_TUPLES_OK) {
		ERR("PostgreSQL: failed to check schema existence: %s", PQerrorMessage(conn));
		PQclear(res);
		return -1;
	}

	if (PQntuples(res) == 1) {
		const char *val = PQgetvalue(res, 0, 0);
		if (val != NULL && (val[0] == 't' || val[0] == 'T' || val[0] == '1')) {
			schema_exists = 1;
		}
	}

	PQclear(res);
	return schema_exists;
}

/*
 * Execute a DDL statement and check for success
 * Returns: 1 on success, 0 on failure
 */
static int pgsql_exec_ddl(PGconn *conn, const char *ddl, const char *desc) {
	PGresult *res;
	ExecStatusType status;

	res = PQexec(conn, ddl);
	status = PQresultStatus(res);

	if (status != PGRES_COMMAND_OK && status != PGRES_TUPLES_OK) {
		ERR("PostgreSQL: failed to %s: %s", desc, PQerrorMessage(conn));
		PQclear(res);
		return 0;
	}

	PQclear(res);
	return 1;
}

/*
 * Create the unicornscan database schema
 * Returns: 1 on success, 0 on failure
 */
static int pgsql_create_schema(PGconn *conn) {
	char version_sql[256];

	VRB(0, "PostgreSQL: creating unicornscan database schema (version %d)...", PGSQL_SCHEMA_VERSION);

	/* Create schema version tracking table first */
	if (!pgsql_exec_ddl(conn, pgsql_schema_version_ddl, "create schema version table")) {
		return 0;
	}

	/* Create sequences */
	if (!pgsql_exec_ddl(conn, pgsql_schema_sequences_ddl, "create sequences")) {
		return 0;
	}

	/* Create main tables */
	if (!pgsql_exec_ddl(conn, pgsql_schema_scans_ddl, "create uni_scans table")) {
		return 0;
	}

	if (!pgsql_exec_ddl(conn, pgsql_schema_sworkunits_ddl, "create uni_sworkunits table")) {
		return 0;
	}

	if (!pgsql_exec_ddl(conn, pgsql_schema_lworkunits_ddl, "create uni_lworkunits table")) {
		return 0;
	}

	if (!pgsql_exec_ddl(conn, pgsql_schema_scan_phases_ddl, "create uni_scan_phases table")) {
		return 0;
	}

	if (!pgsql_exec_ddl(conn, pgsql_schema_stats_ddl, "create stats tables")) {
		return 0;
	}

	if (!pgsql_exec_ddl(conn, pgsql_schema_ipreport_ddl, "create uni_ipreport table")) {
		return 0;
	}

	if (!pgsql_exec_ddl(conn, pgsql_schema_arpreport_ddl, "create uni_arpreport table")) {
		return 0;
	}

	if (!pgsql_exec_ddl(conn, pgsql_schema_ipreportdata_ddl, "create report data tables")) {
		return 0;
	}

	if (!pgsql_exec_ddl(conn, pgsql_schema_arppackets_ddl, "create uni_arppackets table")) {
		return 0;
	}

	/* Create indexes */
	if (!pgsql_exec_ddl(conn, pgsql_schema_indexes_ddl, "create indexes")) {
		return 0;
	}

	/* Add foreign key constraints */
	if (!pgsql_exec_ddl(conn, pgsql_schema_constraints_ddl, "create foreign key constraints")) {
		return 0;
	}

	/* Enable Row Level Security on all tables */
	if (!pgsql_exec_ddl(conn, pgsql_schema_rls_ddl, "enable row level security")) {
		return 0;
	}

	/* Create RLS policies for full access */
	if (!pgsql_exec_ddl(conn, pgsql_schema_rls_policies_ddl, "create RLS policies")) {
		return 0;
	}

	/* Create convenience views (with security_invoker=true) */
	if (!pgsql_exec_ddl(conn, pgsql_schema_views_ddl, "create views")) {
		return 0;
	}

	/* Create v5 frontend support tables (uni_hosts, uni_host_scans, uni_hops, uni_services, uni_os_fingerprints) */
	if (!pgsql_exec_ddl(conn, pgsql_schema_migration_v5_ddl, "create v5 frontend support tables")) {
		return 0;
	}

	/* Add v5 foreign key constraints */
	if (!pgsql_exec_ddl(conn, pgsql_schema_v5_constraints_ddl, "create v5 foreign key constraints")) {
		return 0;
	}

	/* Enable RLS on v5 tables */
	if (!pgsql_exec_ddl(conn, pgsql_schema_v5_rls_ddl, "enable v5 row level security")) {
		return 0;
	}

	/* Create v5 helper functions (fn_upsert_host, fn_parse_banner, etc.) */
	if (!pgsql_exec_ddl(conn, pgsql_schema_v5_functions_ddl, "create v5 helper functions")) {
		return 0;
	}

	/* Create v5 frontend views */
	if (!pgsql_exec_ddl(conn, pgsql_schema_v5_views_ddl, "create v5 frontend views")) {
		return 0;
	}

	/* Record schema version */
	snprintf(version_sql, sizeof(version_sql) - 1, pgsql_schema_record_version_fmt, PGSQL_SCHEMA_VERSION);
	if (!pgsql_exec_ddl(conn, version_sql, "record schema version")) {
		return 0;
	}

	VRB(0, "PostgreSQL: schema created successfully (v%d with RLS enabled)", PGSQL_SCHEMA_VERSION);
	return 1;
}

int init_module(mod_entry_t *m) {
	snprintf(m->license, sizeof(m->license) -1, "GPLv2");
	snprintf(m->author, sizeof(m->author) -1, "jack");
	snprintf(m->desc, sizeof(m->desc) -1, "Output to PostgreSQL Database");
	snprintf(m->name, sizeof(m->name) -1, "pgsqldb");
	snprintf(m->errstr, sizeof(m->errstr) -1, "No Error");

	m->iver=0x0103; /* 1.0 */
	m->type=MI_TYPE_OUTPUT;

	m->param_u.output_s.init_output=&pgsql_database_init;
	m->param_u.output_s.fini_output=&pgsql_database_fini;

	s=m->s;
	_m=m;
	return 1;
}

int delete_module(void) {

	return 1;
}

void pgsql_database_init(void) {
	keyval_t *kv=NULL;
	char *connstr=NULL, *escres=NULL;
	char profile[200], dronestr[200], modules[200], user[200], pcap_dumpfile[200], pcap_readfile[200];
	char mode_str_buf[64], interface_str[64], port_str_buf[4096], target_str_esc[4096], src_addr_str[128];
	const char *mode_str_ptr, *target_str_ptr;
	uint8_t mode_flags;
	long long int est_e_time=0;
	int schema_exists, current_version;

	grab_keyvals(_m);

	if (_m == NULL || _m->mp == NULL) {
		return;
	}

	/* Ensure settings pointer is valid */
	if (s == NULL || s->ss == NULL) {
		ERR("PostgreSQL module: settings not initialized");
		pgsql_disable=1;
		return;
	}

	DBG(M_MOD, "PostgreSQL module is enabled");

	/* Get connection string from modules.conf dbconf key */
	for (kv=_m->mp->kv ; kv != NULL ; kv=kv->next) {
		if (strcmp(kv->key, "dbconf") == 0) {
			connstr=kv->value;
		}
		if (strcmp(kv->key, "logpacket") == 0) {
			if (strcmp(kv->value, "true") == 0) {
				if (scan_setretlayers(0xff) < 0) {
					ERR("cant request whole packet transfer, ignoring log packet option");
				}
			}
		}
	}

	if (connstr == NULL) {
		ERR("no configuration for PostgreSQL, need an entry in /etc/unicornscan/modules.conf for `dbconf' with a valid PostgreSQL connection string");
		pgsql_disable=1;
		return;
	}

	pgconn=PQconnectdb(connstr);
	if (pgconn == NULL || PQstatus(pgconn) != CONNECTION_OK) {
		ERR("PostgreSQL connection fails: %s",
			pgconn == NULL ? "unknown" : PQerrorMessage(pgconn)
		);
		pgsql_disable=1;
		return;
	}

	VRB(0, "PostgreSQL: connected to host %s, database %s, as user %s, with protocol version %d",
		PQhost((const PGconn *)pgconn),
		PQdb((const PGconn *)pgconn),
		PQuser((const PGconn *)pgconn),
		PQprotocolVersion((const PGconn *)pgconn)
	);

	/*
	 * Auto-create schema if needed
	 * This enables zero-config database setup - the schema is created automatically
	 */
	schema_exists = pgsql_check_schema(pgconn);
	if (schema_exists < 0) {
		/* Error checking schema - disable module */
		pgsql_disable = 1;
		PQfinish(pgconn);
		return;
	}
	else if (schema_exists == 0) {
		/* Schema doesn't exist - create it */
		if (!pgsql_create_schema(pgconn)) {
			ERR("PostgreSQL: failed to create database schema");
			pgsql_disable = 1;
			PQfinish(pgconn);
			return;
		}
	}
	else {
		VRB(0, "PostgreSQL: schema already exists, checking version...");

		/* Check schema version and migrate if needed */
		current_version = pgsql_get_schema_version(pgconn);
		if (current_version < 0) {
			/* Version table doesn't exist - legacy schema, treat as v1 */
			VRB(0, "PostgreSQL: legacy schema detected (no version table), treating as v1");
			current_version = 1;
		}

		if (current_version < PGSQL_SCHEMA_VERSION) {
			VRB(0, "PostgreSQL: schema v%d found, current is v%d - migrating...",
				current_version, PGSQL_SCHEMA_VERSION);
			if (!pgsql_migrate_schema(pgconn, current_version)) {
				ERR("PostgreSQL: failed to migrate database schema");
				pgsql_disable = 1;
				PQfinish(pgconn);
				return;
			}
		}
		else {
			VRB(0, "PostgreSQL: schema is up to date (v%d)", current_version);
		}
	}

	/*
	 * v6: Initialize GeoIP provider if configured
	 * GeoIP lookups will be performed for each discovered host
	 */
	if (s->geoip_enabled) {
		geoip_config_t geoip_cfg;
		memset(&geoip_cfg, 0, sizeof(geoip_cfg));
		geoip_cfg.enabled = 1;
		geoip_cfg.provider = s->geoip_provider;
		geoip_cfg.city_db = s->geoip_city_db;
		geoip_cfg.asn_db = s->geoip_asn_db;
		geoip_cfg.anonymous_db = s->geoip_anonymous_db;
		geoip_cfg.store_in_db = 1;

		if (geoip_init(&geoip_cfg) == 0) {
			geoip_enabled = 1;
			VRB(0, "GeoIP: initialized provider '%s' (db version: %s)",
				geoip_get_provider_name(), geoip_get_db_version());
		}
		else {
			VRB(0, "GeoIP: provider initialization failed - GeoIP lookups disabled");
		}
	}

	profile[0]='\0';
	if (s->profile != NULL) {
		escres=pgsql_escstr(s->profile);
		if (escres != NULL) {
			strncpy(profile, escres, sizeof(profile) -1);
		}
	}

	dronestr[0]='\0';
	if (s->drone_str != NULL) {
		escres=pgsql_escstr(s->drone_str);
		strncpy(dronestr, escres, sizeof(dronestr) -1);
	}

	modules[0]='\0';
	if (s->module_enable != NULL) {
		escres=pgsql_escstr(s->module_enable);
		strncpy(modules, escres, sizeof(modules) -1);
	}

	user[0]='\0';
	if (s->user != NULL) {
		escres=pgsql_escstr(s->user);
		strncpy(user, escres, sizeof(user) -1);
	}

	pcap_dumpfile[0]='\0';
	if (s->pcap_dumpfile != NULL) {
		escres=pgsql_escstr(s->pcap_dumpfile);
		strncpy(pcap_dumpfile, escres, sizeof(pcap_dumpfile) -1);
	}

	pcap_readfile[0]='\0';
	if (s->pcap_readfile != NULL) {
		escres=pgsql_escstr(s->pcap_readfile);
		strncpy(pcap_readfile, escres, sizeof(pcap_readfile) -1);
	}

	/* Build mode string and compute mode flags for compound mode support */
	mode_str_ptr = build_mode_str(s);
	mode_str_buf[0] = '\0';
	if (mode_str_ptr != NULL) {
		escres = pgsql_escstr(mode_str_ptr);
		if (escres != NULL) {
			strncpy(mode_str_buf, escres, sizeof(mode_str_buf) - 1);
		}
	}
	mode_flags = compute_mode_flags(s);

	/* Get interface string */
	interface_str[0] = '\0';
	if (s->interface_str != NULL) {
		escres = pgsql_escstr(s->interface_str);
		if (escres != NULL) {
			strncpy(interface_str, escres, sizeof(interface_str) - 1);
		}
	}

	/* Get port string */
	port_str_buf[0] = '\0';
	if (s->ss != NULL && s->ss->port_str != NULL) {
		escres = pgsql_escstr(s->ss->port_str);
		if (escres != NULL) {
			strncpy(port_str_buf, escres, sizeof(port_str_buf) - 1);
		}
	}

	/* Get target string from command line targets */
	target_str_esc[0] = '\0';
	target_str_ptr = build_target_str(s);
	if (target_str_ptr != NULL) {
		escres = pgsql_escstr(target_str_ptr);
		if (escres != NULL) {
			strncpy(target_str_esc, escres, sizeof(target_str_esc) - 1);
		}
	}

	/* Get source address (-s option / phantom IP) - format for SQL */
	src_addr_str[0] = '\0';
	if (s->vi != NULL && s->vi[0] != NULL && strlen(s->vi[0]->myaddr_s) > 0 &&
	    strcmp(s->vi[0]->myaddr_s, "0.0.0.0") != 0) {
		snprintf(src_addr_str, sizeof(src_addr_str) - 1, "'%s'", s->vi[0]->myaddr_s);
	} else {
		strcpy(src_addr_str, "NULL");
	}

	est_e_time=(long long int )s->s_time + (long long int )s->ss->recv_timeout + (long long int )s->num_secs;

	snprintf(querybuf, sizeof(querybuf) -1,
	"insert into uni_scans (									"
		"\"s_time\",		\"e_time\",		\"est_e_time\",		\"senders\",	"
		"\"listeners\",		\"scan_iter\",		\"profile\",		\"options\",	"
		"\"payload_group\",	\"dronestr\",		\"covertness\",		\"modules\",	"
		"\"user\",		\"pcap_dumpfile\",	\"pcap_readfile\",	\"tickrate\",	"
		"\"num_hosts\",		\"num_packets\",	\"mode_str\",		\"mode_flags\",	"
		"\"num_phases\",	\"port_str\",		\"interface\",		\"tcpflags\",	"
		"\"send_opts\",		\"recv_opts\",		\"pps\",		\"recv_timeout\","
		"\"repeats\",		\"target_str\",		\"src_addr\"				"
	") 												"
	"values(											"
		"%lld,			%lld,			%lld,			%d,		"
		"%d,			%d,			'%s',			%hu,		"
		"%hu,			'%s',			%hu,			'%s',		"
		"'%s',			'%s',			'%s',			%hu,		"
		"%f,			%f,			'%s',			%hu,		"
		"%hu,			'%s',			'%s',			%u,		"
		"%hu,			%hu,			%u,			%hu,		"
		"%u,			'%s',			%s				"
	");												"
	"select currval('uni_scans_id_seq') as scanid;							",
	(long long int )s->s_time,	(long long int )0,	est_e_time,		s->senders,
	s->listeners,			s->scan_iter,		profile,		s->options,
	s->payload_group,		dronestr,		s->covertness,		modules,
	user,				pcap_dumpfile,		pcap_readfile,		s->master_tickrate,
	s->num_hosts,			s->num_packets,		mode_str_buf,		mode_flags,
	s->num_phases,			port_str_buf,		interface_str,		s->ss->tcphdrflgs,
	s->send_opts,			s->recv_opts,		s->pps,			s->ss->recv_timeout,
	s->repeats,			target_str_esc,		src_addr_str
	);

	pgres=PQexec(pgconn, querybuf);
	pgret=PQresultStatus(pgres);
	if (pgret != PGRES_TUPLES_OK) {
		ERR("PostgreSQL scan insert id returned a strange return code %s: %s", PQresStatus(pgret), PQresultErrorMessage(pgres));
		pgsql_disable=1;
		return;
	}

	if (PQntuples(pgres) != 1) {
		ERR("PostgreSQL returned a row count other than 1, disable");
		pgsql_disable=1;
		return;
	}
	else {
		char *res_ptr=NULL;

		res_ptr=PQgetvalue(pgres, 0, 0);

		if (res_ptr == NULL) {
			ERR("database returned NULL result pointer, disable");
			pgsql_disable=1;
			return;
		}

		if (sscanf(res_ptr, "%llu", &pgscanid) != 1) {
			ERR("malformed pgscanid from database");
			pgsql_disable=1;
			return;
		}
	}
	PQclear(pgres);

	/* Insert phase data for compound mode scans */
	if (s->num_phases > 1 && s->phases != NULL) {
		if (!pgsql_insert_phases(pgscanid, s)) {
			ERR("Failed to insert scan phases, continuing anyway");
			/* Don't disable - phases are supplementary info */
		}
		else {
			VRB(1, "PostgreSQL: inserted %d phases for scan %llu", s->num_phases, pgscanid);
		}
	}

	return;
}

int send_output(const void *p) {
	union {
		const uint32_t *magic;
		const void *p;
		const struct wk_s *wrk;
		const ip_report_t *ir;
		const arp_report_t *arrrrr; /* pirate report */
		const struct workunit_stats_t *wks;
	} d_u;

	d_u.p=p;

	if (p == NULL) {
		return -1;
	}

	switch (*d_u.magic) {
		case WK_MAGIC:
			if (d_u.wrk->s != NULL) {
				return pgsql_dealwith_sworkunit(d_u.wrk->wid, d_u.wrk->s);
			}
			else if (d_u.wrk->r != NULL) {
				return pgsql_dealwith_rworkunit(d_u.wrk->wid, d_u.wrk->r);
			}
			else {
				ERR("unknown workunit type");
			}
			break;

		case WKS_SEND_MAGIC:
		case WKS_RECV_MAGIC:
			return pgsql_dealwith_wkstats(*d_u.magic, d_u.wks);
			break;

		case IP_REPORT_MAGIC:
			return pgsql_dealwith_ipreport(d_u.ir);
			break;

		case ARP_REPORT_MAGIC:
			return pgsql_dealwith_arpreport(d_u.arrrrr);
			break;

		default:
			ERR("unknown output magic type %08x", *d_u.magic);
			break;
	}

	return 1;
}

static int pgsql_dealwith_sworkunit(uint32_t wid, const send_workunit_t *w) {
	char myaddr[128], mymask[128], macaddr[64], target[128], targetmask[128], port_str[1024 * 4];
	char *ipopts=NULL, *tcpopts=NULL, *pstr=NULL, *escret=NULL;
	char blank[1];
	size_t ipopts_len=0, tcpopts_len=0;

	blank[0]='\0';

	if (w->tcpoptions_len > 0) {
		tcpopts=(char *)PQescapeBytea(w->tcpoptions, w->tcpoptions_len, &tcpopts_len);
	}
	else {
		tcpopts=blank;
	}

	if (w->ipoptions_len > 0) {
		ipopts=(char *)PQescapeBytea(w->ipoptions, w->ipoptions_len, &ipopts_len);
	}
	else {
		ipopts=blank;
	}

	/*
	 * Copy sockaddr_storage members to aligned local buffer before passing
	 * to cidr_saddrstr(). The send_workunit_t struct is packed for IPC, so
	 * embedded sockaddr_storage fields may be unaligned. Direct pointer
	 * access would cause bus errors on strict-alignment architectures (ARM).
	 */
	{
		struct sockaddr_storage aligned_ss;

		myaddr[0]='\0';
		memcpy(&aligned_ss, &w->myaddr, sizeof(aligned_ss));
		escret=pgsql_escstr(cidr_saddrstr((const struct sockaddr *)&aligned_ss));
		if (escret != NULL) {
			strncpy(myaddr, escret, sizeof(myaddr) -1);
		}

		mymask[0]='\0';
		memcpy(&aligned_ss, &w->mymask, sizeof(aligned_ss));
		escret=pgsql_escstr(cidr_saddrstr((const struct sockaddr *)&aligned_ss));
		if (escret != NULL) {
			strncpy(mymask, escret, sizeof(mymask) -1);
		}

		target[0]='\0';
		memcpy(&aligned_ss, &w->target, sizeof(aligned_ss));
		escret=pgsql_escstr(cidr_saddrstr((const struct sockaddr *)&aligned_ss));
		if (escret != NULL) {
			strncpy(target, escret, sizeof(target) -1);
		}

		targetmask[0]='\0';
		memcpy(&aligned_ss, &w->targetmask, sizeof(aligned_ss));
		escret=pgsql_escstr(cidr_saddrstr((const struct sockaddr *)&aligned_ss));
		if (escret != NULL) {
			strncpy(targetmask, escret, sizeof(targetmask) -1);
		}
	}

	pstr=workunit_pstr_get(w);

	port_str[0]='\0';
	if (pstr != NULL) {
		escret=pgsql_escstr(pstr);
		strncpy(port_str, escret, sizeof(port_str) -1);
	}

	snprintf(macaddr, sizeof(macaddr) -1, "%02x:%02x:%02x:%02x:%02x:%02x",
		w->hwaddr[0], w->hwaddr[1], w->hwaddr[2],
		w->hwaddr[3], w->hwaddr[4], w->hwaddr[5]
	);

	snprintf(querybuf, sizeof(querybuf) -1,
	"insert into uni_sworkunits (									"
		"\"magic\",		\"scans_id\",		\"repeats\",	\"send_opts\",		"
		"\"pps\",		\"delay_type\",		\"myaddr\",	\"mymask\",		"
		"\"macaddr\",		\"mtu\",		\"target\",	\"targetmask\",		"
		"\"tos\",		\"minttl\",		\"maxttl\",	\"fingerprint\",	"
		"\"src_port\",		\"ip_off\",		\"ipoptions\",	\"tcpflags\",		"
		"\"tcpoptions\",	\"window_size\",	\"syn_key\",	\"port_str\",		"
		"\"wid\",		\"status\"							"
	")												"
	"values(											"
		"%u,			%llu,			%hu,		%hu,			"
		"%u,			%hu,			'%s',		'%s',			"
		"'%s',			%hu,			'%s',		'%s',			"
		"%hu,			%hu,			%hu,		%hu,			"
		"%hu,			%u,			'%s',		%u,			"
		"'%s',			%hu,			%u,		'%s',			"
		"%u,			%d								"
	");												",
		w->magic,		pgscanid,		w->repeats,	w->send_opts,
		w->pps,			w->delay_type,		myaddr,		mymask,
		macaddr,		w->mtu,			target,		targetmask,
		w->tos,			w->minttl,		w->maxttl,	w->fingerprint,
		w->src_port,		w->ip_off,		ipopts,		w->tcphdrflgs,
		tcpopts,		w->window_size,		w->syn_key,	port_str,
		wid,			0
	);

	pgres=PQexec(pgconn, querybuf);
	pgret=PQresultStatus(pgres);
	if (pgret != PGRES_COMMAND_OK) {
		ERR("PostgreSQL scan insert id returned a strange return code %s: %s", PQresStatus(pgret), PQresultErrorMessage(pgres));
		pgsql_disable=1;
		return -1;
	}
	PQclear(pgres);

	if (ipopts != blank) {
		free(ipopts); /* not allocated with xmalloc, so dont use xfree */
	}
	if (tcpopts != blank) {
		free(tcpopts);
	}

	return 1;
}

static int pgsql_dealwith_wkstats(uint32_t magic, const workunit_stats_t *w) {
	char msg[2048], *escret=NULL;

	if (w->msg == NULL) {
		return -1;
	}
	escret=pgsql_escstr(w->msg);
	strncpy(msg, escret, sizeof(msg) -1);

	snprintf(querybuf, sizeof(querybuf) -1,
	"insert into uni_workunitstats (\"wid\", \"scans_id\", \"msg\") "
	" values(%u, %llu, '%s');					"
	"update %s set status=1 where wid=%u and scans_id=%llu;		",
		w->wid,	pgscanid, msg,
		magic == WKS_SEND_MAGIC ? "uni_sworkunits" : "uni_lworkunits",
		w->wid, pgscanid
	);

	pgres=PQexec(pgconn, querybuf);
	pgret=PQresultStatus(pgres);
	if (pgret != PGRES_COMMAND_OK) {
		ERR("PostgreSQL scan insert id returned a strange return code %s: %s", PQresStatus(pgret), PQresultErrorMessage(pgres));
		pgsql_disable=1;
		return -1;
	}
	PQclear(pgres);

	return 1;
}

static int pgsql_dealwith_rworkunit(uint32_t wid, const recv_workunit_t *w) {
	char pcap_str[1024], *fstr=NULL, *escret=NULL;

	pcap_str[0]='\0';

	fstr=workunit_fstr_get(w);
	if (fstr != NULL) {
		escret=pgsql_escstr(fstr);
		strncpy(pcap_str, escret, sizeof(pcap_str) -1);
	}

	snprintf(querybuf, sizeof(querybuf) -1,
	"insert into uni_lworkunits (									"
	"	\"magic\",	\"scans_id\",		\"recv_timeout\",	\"ret_layers\",		"
	"	\"recv_opts\",	\"window_size\",	\"syn_key\",		\"pcap_str\",		"
	"	\"wid\",	\"status\"								"
	")												"
	"values(											"
	"	%u,		%llu,			%hu,			%hu,			"
	"	%hu,		%u,			%u,			'%s',			"
	"	%u,		%d									"
	");												",
		w->magic,	pgscanid,		w->recv_timeout,	w->ret_layers,
		w->recv_opts,	w->window_size,		w->syn_key,		pcap_str,
		wid,		0
	);

	pgres=PQexec(pgconn, querybuf);
	pgret=PQresultStatus(pgres);
	if (pgret != PGRES_COMMAND_OK) {
		ERR("PostgreSQL scan insert id returned a strange return code %s: %s", PQresStatus(pgret), PQresultErrorMessage(pgres));
		pgsql_disable=1;
		return -1;
	}
	PQclear(pgres);

	return 1;
}

/*
 * XXX we have to trust other code to not lie about the length here
 */
static int pgsql_dealwith_ipreport(const ip_report_t *i) {
	uint32_t tv_sec=0, tv_usec=0;
	char send_addr[128], host_addr[128], trace_addr[128];
	char eth_hwaddr_sql[40]; /* v9: "NULL" or "'xx:xx:xx:xx:xx:xx'" for INSERT */
	char eth_hwaddr_str[32]; /* v9: "xx:xx:xx:xx:xx:xx" for helper functions */
	unsigned long long int ipreportid=0;
	unsigned long long int host_id=0; /* v5: for uni_hosts */
	struct in_addr ia;

	ia.s_addr=i->send_addr;
	inet_ntop(AF_INET, &ia, send_addr, sizeof(send_addr));
	ia.s_addr=i->host_addr;
	inet_ntop(AF_INET, &ia, host_addr, sizeof(host_addr));
	ia.s_addr=i->trace_addr;
	inet_ntop(AF_INET, &ia, trace_addr, sizeof(trace_addr));

	/* v9: Format Ethernet source MAC if available */
	eth_hwaddr_str[0] = '\0'; /* empty string means no MAC */
	if (i->eth_hwaddr_valid) {
		snprintf(eth_hwaddr_str, sizeof(eth_hwaddr_str),
			"%02x:%02x:%02x:%02x:%02x:%02x",
			i->eth_hwaddr[0], i->eth_hwaddr[1], i->eth_hwaddr[2],
			i->eth_hwaddr[3], i->eth_hwaddr[4], i->eth_hwaddr[5]);
		snprintf(eth_hwaddr_sql, sizeof(eth_hwaddr_sql), "'%s'", eth_hwaddr_str);
	} else {
		strcpy(eth_hwaddr_sql, "NULL");
	}

	tv_sec=(uint32_t )i->recv_time.tv_sec;
	tv_usec=(uint32_t )i->recv_time.tv_usec;

	snprintf(querybuf, sizeof(querybuf) -1,
	"insert into uni_ipreport (							\n"
	"	\"scans_id\",		\"magic\",	\"sport\",	\"dport\",	\n"
	"	\"proto\",		\"type\",	\"subtype\",	\"send_addr\",	\n"
	"	\"host_addr\",		\"trace_addr\",	\"ttl\",	\"tstamp\",	\n"
	"	\"utstamp\",		\"flags\",	\"mseq\",	\"tseq\",	\n"
	"	\"window_size\",	\"t_tstamp\",	\"m_tstamp\",	\"eth_hwaddr\"	\n"
	")										\n"
	"values(									\n"
	"	%llu,			%u,		%hu,		%hu,		\n"
	"	%hu,			%hu,		%hu,		'%s',		\n"
	"	'%s',			'%s',		%hu,		%u,		\n"
	"	%u,			%hu,		%u,		%u,		\n"
	"	%hu,			%u,		%u,		%s		\n"
	");										\n"
	"select currval('uni_ipreport_id_seq') as ipreportid;				\n",
		pgscanid,		i->magic,	i->sport,	i->dport,
		i->proto,		i->type,	i->subtype,	send_addr,
		host_addr,		trace_addr,	i->ttl,		tv_sec,
		tv_usec,		i->flags,	i->mseq,	i->tseq,
		i->window_size,		i->t_tstamp,	i->m_tstamp,	eth_hwaddr_sql
	);

	pgres=PQexec(pgconn, querybuf);
	pgret=PQresultStatus(pgres);
	if (pgret != PGRES_TUPLES_OK) {
		ERR("PostgreSQL scan insert id returned a strange return code %s: %s", PQresStatus(pgret), PQresultErrorMessage(pgres));
		pgsql_disable=1;
		return -1;
	}

	if (PQntuples(pgres) != 1) {
		ERR("PostgreSQL returned a row count other than 1, disable");
		pgsql_disable=1;
		return -1;
	}
	else {
		char *res_ptr=NULL;

		res_ptr=PQgetvalue(pgres, 0, 0);

		if (res_ptr == NULL) {
			ERR("database returned NULL result pointer, disable");
			pgsql_disable=1;
			return -1;
		}

		if (sscanf(res_ptr, "%llu", &ipreportid) != 1) {
			ERR("malformed pgscanid from database");
			pgsql_disable=1;
			return -1;
		}
	}
	PQclear(pgres);

	/*
	 * v5: Populate uni_hosts and uni_host_scans for frontend support
	 * Call fn_upsert_host() to insert/update host record
	 * v9: Pass MAC address if captured from local network response
	 */
	host_id = pgsql_upsert_host(host_addr, i->eth_hwaddr_valid ? eth_hwaddr_str : NULL);
	if (host_id > 0) {
		/* Link host to this scan */
		pgsql_insert_host_scan(host_id, pgscanid);

		/*
		 * v6: Perform GeoIP lookup and store results
		 * Only done once per host per scan due to UNIQUE constraint
		 */
		pgsql_insert_geoip(pgscanid, host_addr);

		/*
		 * v9: Record MAC<->IP association in history table if MAC is available
		 * This enables temporal tracking of address relationships for local network hosts
		 */
		if (i->eth_hwaddr_valid) {
			pgsql_record_mac_ip(host_addr, eth_hwaddr_str, pgscanid);
		}
	}

	/*
	 * v5: Detect intermediate hops when trace_addr != host_addr
	 * This indicates the response came from a router (ICMP Time Exceeded, etc)
	 */
	if (i->trace_addr != i->host_addr && i->trace_addr != 0) {
		pgsql_insert_hop(ipreportid, pgscanid, host_addr, trace_addr, i->ttl);
	}

	/*
	 * trust problem
	 */
	if (i->doff > 0) {
		const void *packet=NULL;
		size_t packet_len=i->doff, packet_strlen=0;
		union {
			const void *p;
			const ip_report_t *i;
		} d_u;
		char *packet_str=NULL;

		d_u.i=i;

		d_u.i++;
		packet=d_u.p;

		packet_str=(char *)PQescapeBytea(packet, packet_len, &packet_strlen);

		snprintf(querybuf, sizeof(querybuf) -1,
			"insert into uni_ippackets (\"ipreport_id\", \"packet\") values(%llu, '%s');",
			ipreportid, packet_str
		);

		pgres=PQexec(pgconn, querybuf);

		pgret=PQresultStatus(pgres);
		if (pgret != PGRES_COMMAND_OK) {
			ERR("PostgreSQL insert returned a strange return code %s: %s", PQresStatus(pgret), PQresultErrorMessage(pgres));
			pgsql_disable=1;
			return -1;
		}
		PQclear(pgres);

		free(packet_str); /* not from xfree */
	}

	CLEAR(db_banner);
	CLEAR(db_os);

	fifo_walk(i->od_q, database_walk_func);

	if (strlen(db_banner)) {
		snprintf(querybuf, sizeof(querybuf) -1,
			"insert into uni_ipreportdata (ipreport_id, type, data) values(%llu, 1, '%s');", ipreportid, pgsql_escstr(db_banner));
                pgres=PQexec(pgconn, querybuf);
                pgret=PQresultStatus(pgres);
                if (pgret != PGRES_COMMAND_OK) {
                        ERR("PostgreSQL banner insert returned a strange return code %s: %s", PQresStatus(pgret), PQresultErrorMessage(pgres));
                        pgsql_disable=1;
                        return -1;
                }
                PQclear(pgres);

		/*
		 * v5: Also insert into uni_services with parsed banner data
		 */
		pgsql_insert_service(ipreportid, pgscanid, host_addr, i->dport, i->proto, db_banner);
        }

        if (strlen(db_os)) {
                CLEAR(querybuf);
                snprintf(querybuf, sizeof(querybuf) -1, "insert into uni_ipreportdata (ipreport_id, type, data) values(%llu, 2, '%s');", ipreportid, pgsql_escstr(db_os));
                pgres=PQexec(pgconn, querybuf);
                pgret=PQresultStatus(pgres);
                if (pgret != PGRES_COMMAND_OK) {
                        ERR("PostgreSQL banner insert returned a strange return code %s: %s", PQresStatus(pgret), PQresultErrorMessage(pgres));
                        pgsql_disable=1;
                        return -1;
                }
                PQclear(pgres);

		/*
		 * v5: Also insert into uni_os_fingerprints with parsed OS data
		 */
		pgsql_insert_os_fingerprint(ipreportid, pgscanid, host_addr, db_os, i->ttl, i->window_size);
        }

	return 1;
}

/*
 * XXX we have to trust other code to not lie about the length here
 */
static int pgsql_dealwith_arpreport(const arp_report_t *a) {
	uint32_t tv_sec=0, tv_usec=0;
	char host_addr[128], hwaddr[32];
	struct in_addr ia;
	long long unsigned int arpreportid=0;
	unsigned long long int host_id=0; /* v5: for uni_hosts */

	ia.s_addr=a->ipaddr;

	memset(host_addr, 0, sizeof(host_addr));
	inet_ntop(AF_INET, &ia, host_addr, sizeof(host_addr));

	snprintf(hwaddr, sizeof(hwaddr) -1, "%02x:%02x:%02x:%02x:%02x:%02x",
		a->hwaddr[0], a->hwaddr[1], a->hwaddr[2],
		a->hwaddr[3], a->hwaddr[4], a->hwaddr[5]
	);

	tv_sec=(uint32_t )a->recv_time.tv_sec;
	tv_usec=(uint32_t )a->recv_time.tv_usec;

	snprintf(querybuf, sizeof(querybuf) -1,
	"insert into uni_arpreport (							\n"
	"	\"scans_id\",		\"magic\",	\"host_addr\",	\"hwaddr\",	\n"
	"	\"tstamp\",		\"utstamp\"					\n"
	")										\n"
	"values(									\n"
	"	%llu,			%u,		'%s',		'%s',		\n"
	"	%u,			%u						\n"
	");										\n"
	"select currval('uni_arpreport_id_seq') as arpreportid;				\n",
		pgscanid,		a->magic,	host_addr,	hwaddr,
		tv_sec,			tv_usec
	);

	pgres=PQexec(pgconn, querybuf);
	pgret=PQresultStatus(pgres);
	if (pgret != PGRES_TUPLES_OK) {
		ERR("PostgreSQL scan insert id returned a strange return code %s: %s", PQresStatus(pgret), PQresultErrorMessage(pgres));
		pgsql_disable=1;
		return -1;
	}

	if (PQntuples(pgres) != 1) {
		ERR("PostgreSQL returned a row count other than 1, disable");
		pgsql_disable=1;
		return -1;
	}
	else {
		char *res_ptr=NULL;

		res_ptr=PQgetvalue(pgres, 0, 0);

		if (res_ptr == NULL) {
			ERR("database returned NULL result pointer, disable");
			pgsql_disable=1;
			return -1;
		}

		if (sscanf(res_ptr, "%llu", &arpreportid) != 1) {
			ERR("malformed pgscanid from database");
			pgsql_disable=1;
			return -1;
		}
	}
	PQclear(pgres);

	/*
	 * v5: Populate uni_hosts and uni_host_scans for frontend support
	 * ARP reports have MAC addresses - use IP+MAC for host identity
	 */
	host_id = pgsql_upsert_host(host_addr, hwaddr);
	if (host_id > 0) {
		/* Link host to this scan */
		pgsql_insert_host_scan(host_id, pgscanid);
	}

	/*
	 * v8: Record MAC<->IP association in history table
	 * This enables temporal tracking of address relationships
	 */
	pgsql_record_mac_ip(host_addr, hwaddr, pgscanid);

	/*
	 * trust problem
	 */
	if (a->doff > 0) {
		const void *packet=NULL;
		size_t packet_len=a->doff, packet_strlen=0;
		union {
			const void *p;
			const arp_report_t *a;
		} d_u;
		char *packet_str=NULL;

		d_u.a=a;

		d_u.a++;
		packet=d_u.p;

		packet_str=(char *)PQescapeBytea(packet, packet_len, &packet_strlen);

		snprintf(querybuf, sizeof(querybuf) -1,
			"insert into uni_arppackets (\"arpreport_id\", \"packet\") values(%llu, '%s');",
			arpreportid, packet_str
		);

		pgres=PQexec(pgconn, querybuf);

		pgret=PQresultStatus(pgres);
		if (pgret != PGRES_COMMAND_OK) {
			ERR("PostgreSQL insert returned a strange return code %s: %s", PQresStatus(pgret), PQresultErrorMessage(pgres));
			pgsql_disable=1;
			return -1;
		}
		PQclear(pgres);

		free(packet_str); /* not from xfree */
	}

	return 1;
}

void pgsql_database_fini(void) {

	if (pgsql_disable) {
		return;
	}

	snprintf(querybuf, sizeof(querybuf) -1, "update uni_scans set e_time=%lld where scans_id=%llu;",
		(long long int )s->e_time,
		pgscanid
	);

	pgres=PQexec(pgconn, querybuf);

	pgret=PQresultStatus(pgres);
	if (pgret != PGRES_COMMAND_OK) {
		ERR("PostgreSQL finalize scan returned a strange return code %s: %s", PQresStatus(pgret), PQresultErrorMessage(pgres));
		pgsql_disable=1;
		return;
	}
	PQclear(pgres);

	/* v6: Cleanup GeoIP provider */
	if (geoip_enabled) {
		geoip_cleanup();
		geoip_enabled = 0;
	}

	PQfinish(pgconn);

	return;
}

static void database_walk_func(void *data) {
	union { 
		void *p;
		output_data_t *o;
	} d_u;

	d_u.p=data;

	switch (d_u.o->type) {

		case OD_TYPE_BANNER:
			CLEAR(db_banner);
			snprintf(db_banner, sizeof(db_banner) -1, "%s", pgsql_escstr(d_u.o->t_u.banner));
			break;

		case OD_TYPE_OS:
			CLEAR(db_os);
			snprintf(db_os, sizeof(db_os) -1, "%s", pgsql_escstr(d_u.o->t_u.os));
			break;

		default:
			ERR("unknown output format type %d in database push", d_u.o->type);
			break;
	}

        return;
}

static char *pgsql_escstr(const char *in) {
	static char *outstr=NULL;
	static size_t outstr_len=0;
	size_t inlen=0;

	if (in == NULL) {
		return NULL;
	}

	inlen=strlen(in) + 1;

	assert(inlen < 0xffff);

	if (outstr == NULL) {
		outstr_len=inlen * 2;
		outstr=xmalloc(outstr_len);
	}
	else if ((inlen * 2) > outstr_len) {

		outstr_len=inlen * 2;

		outstr=xrealloc(outstr, outstr_len);
	}

	memset(outstr, 0, outstr_len);

	PQescapeString(outstr, in, inlen - 1);

	return outstr;
}
