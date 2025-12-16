/**********************************************************************
 * Copyright (C) 2025 Unicornscan Modernization Project               *
 *                                                                    *
 * P0F v3 API wrapper for enhanced OS fingerprinting                 *
 *                                                                    *
 * This program is free software; you can redistribute it and/or      *
 * modify it under the terms of the GNU General Public License        *
 * as published by the Free Software Foundation; either               *
 * version 2 of the License, or (at your option) any later            *
 * version.                                                           *
 **********************************************************************/
#ifndef _P0F3_API_H
#define _P0F3_API_H

#include <stdint.h>
#include <arpa/inet.h>

/* P0F v3 API magic numbers */
#define P0F_QUERY_MAGIC      0x50304601
#define P0F_RESP_MAGIC       0x50304602

/* P0F v3 status codes */
#define P0F_STATUS_BADQUERY  0x00
#define P0F_STATUS_OK        0x10
#define P0F_STATUS_NOMATCH   0x20

/* Address types */
#define P0F_ADDR_IPV4        0x04
#define P0F_ADDR_IPV6        0x06

/* String buffer size */
#define P0F_STR_MAX          31

/* Match quality flags */
#define P0F_MATCH_FUZZY      0x01
#define P0F_MATCH_GENERIC    0x02

/* Default socket path */
#ifndef P0F3_SOCKET_PATH
#define P0F3_SOCKET_PATH     "/var/run/p0f.sock"
#endif

/* Query structure - 21 bytes, packed */
struct p0f_api_query {
	uint32_t magic;                         /* Must be P0F_QUERY_MAGIC            */
	uint8_t  addr_type;                     /* P0F_ADDR_*                         */
	uint8_t  addr[16];                      /* IP address (big endian left align) */
} __attribute__((packed));

/* Response structure - 232 bytes, packed */
struct p0f_api_response {
	uint32_t magic;                         /* Must be P0F_RESP_MAGIC             */
	uint32_t status;                        /* P0F_STATUS_*                       */

	uint32_t first_seen;                    /* First seen (unix time)             */
	uint32_t last_seen;                     /* Last seen (unix time)              */
	uint32_t total_conn;                    /* Total connections seen             */

	uint32_t uptime_min;                    /* Last uptime (minutes)              */
	uint32_t up_mod_days;                   /* Uptime modulo (days)               */

	uint32_t last_nat;                      /* NAT / LB last detected (unix time) */
	uint32_t last_chg;                      /* OS chg last detected (unix time)   */

	int16_t  distance;                      /* System distance                    */

	uint8_t  bad_sw;                        /* Host is lying about U-A / Server   */
	uint8_t  os_match_q;                    /* Match quality                      */

	uint8_t  os_name[P0F_STR_MAX + 1];      /* Name of detected OS                */
	uint8_t  os_flavor[P0F_STR_MAX + 1];    /* Flavor of detected OS              */

	uint8_t  http_name[P0F_STR_MAX + 1];    /* Name of detected HTTP app          */
	uint8_t  http_flavor[P0F_STR_MAX + 1];  /* Flavor of detected HTTP app        */

	uint8_t  link_type[P0F_STR_MAX + 1];    /* Link type                          */

	uint8_t  language[P0F_STR_MAX + 1];     /* Language                           */
} __attribute__((packed));

/* Simplified result structure for unicornscan integration */
typedef struct p0f3_result {
	int      valid;                         /* 1 if result is valid               */
	char     os_name[64];                   /* OS name (e.g., "Linux")            */
	char     os_flavor[64];                 /* OS flavor (e.g., "3.11 and newer") */
	char     http_name[64];                 /* HTTP app name                      */
	char     http_flavor[64];               /* HTTP app flavor                    */
	char     link_type[64];                 /* Link type                          */
	int      distance;                      /* Network distance (-1 if unknown)   */
	uint32_t uptime_min;                    /* Uptime in minutes                  */
	int      nat_detected;                  /* NAT/LB detected flag               */
	int      bad_sw;                        /* Software mismatch flag             */
	int      match_quality;                 /* Match quality flags                */
} p0f3_result_t;

/*
 * Initialize connection to p0f v3 daemon
 * Returns: file descriptor on success, -1 on error
 */
int p0f3_connect(const char *socket_path);

/*
 * Close connection to p0f v3 daemon
 */
void p0f3_disconnect(int fd);

/*
 * Query p0f v3 for information about an IPv4 address
 * fd:      Socket fd from p0f3_connect()
 * addr:    IPv4 address in network byte order
 * result:  Output structure for results
 * Returns: 0 on success, -1 on error, 1 on no match
 */
int p0f3_query_ipv4(int fd, uint32_t addr, p0f3_result_t *result);

/*
 * Query p0f v3 for information about an IPv6 address
 * fd:      Socket fd from p0f3_connect()
 * addr:    IPv6 address (16 bytes)
 * result:  Output structure for results
 * Returns: 0 on success, -1 on error, 1 on no match
 */
int p0f3_query_ipv6(int fd, const uint8_t *addr, p0f3_result_t *result);

/*
 * Check if p0f v3 daemon is available
 * socket_path: Path to p0f socket (NULL for default)
 * Returns: 1 if available, 0 if not
 */
int p0f3_available(const char *socket_path);

/*
 * Format p0f3 result as a human-readable string
 * result:  Input result structure
 * buf:     Output buffer
 * buflen:  Size of output buffer
 * Returns: pointer to buf
 */
char *p0f3_format_result(const p0f3_result_t *result, char *buf, size_t buflen);

#endif /* _P0F3_API_H */
