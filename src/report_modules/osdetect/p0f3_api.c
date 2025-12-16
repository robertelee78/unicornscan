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

#include <config.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/stat.h>
#include <fcntl.h>

#include "p0f3_api.h"

/* Timeout for socket operations (seconds) */
#define P0F3_TIMEOUT_SEC  2

/*
 * Check if p0f v3 daemon socket exists and is accessible
 */
int p0f3_available(const char *socket_path) {
	struct stat st;
	const char *path = socket_path ? socket_path : P0F3_SOCKET_PATH;

	if (stat(path, &st) != 0) {
		return 0;
	}

	/* Check if it's a socket */
	if (!S_ISSOCK(st.st_mode)) {
		return 0;
	}

	return 1;
}

/*
 * Connect to p0f v3 daemon via Unix socket
 */
int p0f3_connect(const char *socket_path) {
	int fd;
	struct sockaddr_un addr;
	struct timeval tv;
	const char *path = socket_path ? socket_path : P0F3_SOCKET_PATH;

	/* Check socket exists first */
	if (!p0f3_available(path)) {
		return -1;
	}

	fd = socket(AF_UNIX, SOCK_STREAM, 0);
	if (fd < 0) {
		return -1;
	}

	/* Set socket timeout */
	tv.tv_sec = P0F3_TIMEOUT_SEC;
	tv.tv_usec = 0;
	setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
	setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

	memset(&addr, 0, sizeof(addr));
	addr.sun_family = AF_UNIX;
	strncpy(addr.sun_path, path, sizeof(addr.sun_path) - 1);

	if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
		close(fd);
		return -1;
	}

	return fd;
}

/*
 * Disconnect from p0f v3 daemon
 */
void p0f3_disconnect(int fd) {
	if (fd >= 0) {
		close(fd);
	}
}

/*
 * Internal: Send query and receive response
 */
static int p0f3_query_internal(int fd, uint8_t addr_type, const uint8_t *addr,
                               p0f3_result_t *result) {
	struct p0f_api_query query;
	struct p0f_api_response resp;
	ssize_t ret;

	if (fd < 0 || result == NULL) {
		return -1;
	}

	/* Initialize result */
	memset(result, 0, sizeof(*result));
	result->valid = 0;
	result->distance = -1;

	/* Build query */
	memset(&query, 0, sizeof(query));
	query.magic = P0F_QUERY_MAGIC;
	query.addr_type = addr_type;

	if (addr_type == P0F_ADDR_IPV4) {
		memcpy(query.addr, addr, 4);
	} else if (addr_type == P0F_ADDR_IPV6) {
		memcpy(query.addr, addr, 16);
	} else {
		return -1;
	}

	/* Send query */
	ret = write(fd, &query, sizeof(query));
	if (ret != sizeof(query)) {
		return -1;
	}

	/* Read response */
	ret = read(fd, &resp, sizeof(resp));
	if (ret != sizeof(resp)) {
		return -1;
	}

	/* Validate response magic */
	if (resp.magic != P0F_RESP_MAGIC) {
		return -1;
	}

	/* Check status */
	switch (resp.status) {
		case P0F_STATUS_BADQUERY:
			return -1;

		case P0F_STATUS_NOMATCH:
			return 1;  /* No match, but not an error */

		case P0F_STATUS_OK:
			break;

		default:
			return -1;
	}

	/* Parse successful response */
	result->valid = 1;

	/* Copy OS info */
	if (resp.os_name[0]) {
		snprintf(result->os_name, sizeof(result->os_name), "%s",
		         (char *)resp.os_name);
	}
	if (resp.os_flavor[0]) {
		snprintf(result->os_flavor, sizeof(result->os_flavor), "%s",
		         (char *)resp.os_flavor);
	}

	/* Copy HTTP info */
	if (resp.http_name[0]) {
		snprintf(result->http_name, sizeof(result->http_name), "%s",
		         (char *)resp.http_name);
	}
	if (resp.http_flavor[0]) {
		snprintf(result->http_flavor, sizeof(result->http_flavor), "%s",
		         (char *)resp.http_flavor);
	}

	/* Copy link type */
	if (resp.link_type[0]) {
		snprintf(result->link_type, sizeof(result->link_type), "%s",
		         (char *)resp.link_type);
	}

	/* Copy numeric values */
	result->distance = resp.distance;
	result->uptime_min = resp.uptime_min;
	result->bad_sw = resp.bad_sw;
	result->match_quality = resp.os_match_q;

	/* NAT detection: non-zero last_nat means NAT was detected */
	result->nat_detected = (resp.last_nat != 0) ? 1 : 0;

	return 0;
}

/*
 * Query p0f v3 for IPv4 address information
 */
int p0f3_query_ipv4(int fd, uint32_t addr, p0f3_result_t *result) {
	uint8_t addr_bytes[4];

	/* addr is already in network byte order */
	memcpy(addr_bytes, &addr, 4);

	return p0f3_query_internal(fd, P0F_ADDR_IPV4, addr_bytes, result);
}

/*
 * Query p0f v3 for IPv6 address information
 */
int p0f3_query_ipv6(int fd, const uint8_t *addr, p0f3_result_t *result) {
	if (addr == NULL) {
		return -1;
	}
	return p0f3_query_internal(fd, P0F_ADDR_IPV6, addr, result);
}

/*
 * Format p0f3 result as human-readable string
 */
char *p0f3_format_result(const p0f3_result_t *result, char *buf, size_t buflen) {
	int offset = 0;
	int ret;

	if (buf == NULL || buflen == 0) {
		return NULL;
	}

	buf[0] = '\0';

	if (result == NULL || !result->valid) {
		snprintf(buf, buflen, "Unknown");
		return buf;
	}

	/* OS identification */
	if (result->os_name[0]) {
		ret = snprintf(buf + offset, buflen - offset, "%s", result->os_name);
		if (ret > 0) offset += ret;

		if (result->os_flavor[0]) {
			ret = snprintf(buf + offset, buflen - offset, " %s",
			               result->os_flavor);
			if (ret > 0) offset += ret;
		}
	}

	/* HTTP application */
	if (result->http_name[0]) {
		ret = snprintf(buf + offset, buflen - offset, " [%s", result->http_name);
		if (ret > 0) offset += ret;

		if (result->http_flavor[0]) {
			ret = snprintf(buf + offset, buflen - offset, " %s",
			               result->http_flavor);
			if (ret > 0) offset += ret;
		}

		ret = snprintf(buf + offset, buflen - offset, "]");
		if (ret > 0) offset += ret;
	}

	/* Distance */
	if (result->distance >= 0) {
		ret = snprintf(buf + offset, buflen - offset, " (dist:%d)",
		               result->distance);
		if (ret > 0) offset += ret;
	}

	/* Link type */
	if (result->link_type[0]) {
		ret = snprintf(buf + offset, buflen - offset, " via %s",
		               result->link_type);
		if (ret > 0) offset += ret;
	}

	/* NAT detection */
	if (result->nat_detected) {
		ret = snprintf(buf + offset, buflen - offset, " [NAT]");
		if (ret > 0) offset += ret;
	}

	/* Bad software detection */
	if (result->bad_sw) {
		ret = snprintf(buf + offset, buflen - offset, " [SPOOFED]");
		if (ret > 0) offset += ret;
	}

	/* Uptime */
	if (result->uptime_min > 0) {
		uint32_t days = result->uptime_min / (60 * 24);
		uint32_t hours = (result->uptime_min % (60 * 24)) / 60;
		uint32_t mins = result->uptime_min % 60;

		if (days > 0) {
			ret = snprintf(buf + offset, buflen - offset,
			               " (up:%ud%uh%um)", days, hours, mins);
		} else if (hours > 0) {
			ret = snprintf(buf + offset, buflen - offset,
			               " (up:%uh%um)", hours, mins);
		} else {
			ret = snprintf(buf + offset, buflen - offset,
			               " (up:%um)", mins);
		}
		if (ret > 0) offset += ret;
	}

	/* Match quality indicators */
	if (result->match_quality & P0F_MATCH_GENERIC) {
		ret = snprintf(buf + offset, buflen - offset, " [generic]");
		if (ret > 0) offset += ret;
	}
	if (result->match_quality & P0F_MATCH_FUZZY) {
		ret = snprintf(buf + offset, buflen - offset, " [fuzzy]");
		if (ret > 0) offset += ret;
	}

	return buf;
}
