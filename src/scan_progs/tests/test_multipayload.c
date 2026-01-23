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
 * Unit tests for multi-payload TCP support.
 * Tests count_payloads() and payload chain functionality.
 */
#include <config.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#include <scan_progs/scan_export.h>
#include <scan_progs/portfunc.h>
#include <settings.h>
#include <unilib/xmalloc.h>
#include <unilib/output.h>

/* Test counters */
static int tests_run = 0;
static int tests_passed = 0;

#define TEST(name, cond) do { \
	tests_run++; \
	if (cond) { \
		printf("  %-50s [PASS]\n", name); \
		tests_passed++; \
	} else { \
		printf("  %-50s [FAIL]\n", name); \
	} \
} while(0)

/* External functions we're testing */
extern uint16_t count_payloads(uint16_t proto, uint16_t port, uint16_t payload_group);
extern int get_payload(uint16_t indx, uint16_t proto, uint16_t port,
                       uint8_t **data, uint32_t *payload_s, int32_t *local_port,
                       int (**payload_init)(uint8_t **, uint32_t *, void *),
                       uint16_t payload_group);
extern int parse_pstr(const char *, uint32_t *);
extern void reset_getnextport(void);
extern int get_nextport(int32_t *);

/* Need to initialize settings for payload functions */
extern void settings_init(void);
extern int init_payload_modules(const char *conffile);

/*
 * Test PORT_* macros from portfunc.h
 * These macros encode payload count in upper 16 bits of port value.
 */
static void test_port_encoding_macros(void) {
	int32_t encoded;

	printf("\nPORT_* macro tests:\n");

	/* Test basic encoding/decoding */
	encoded = PORT_ENCODE(443, 3);
	TEST("PORT_ENCODE(443, 3) encodes correctly", encoded == ((3 << 16) | 443));
	TEST("PORT_VALUE extracts port 443", PORT_VALUE(encoded) == 443);
	TEST("PORT_COUNT extracts count 3", PORT_COUNT(encoded) == 3);

	/* Test default count of 1 */
	encoded = PORT_ENCODE(80, 1);
	TEST("PORT_ENCODE(80, 1) with default count", PORT_VALUE(encoded) == 80);
	TEST("PORT_COUNT with count=1", PORT_COUNT(encoded) == 1);

	/* Test edge cases */
	encoded = PORT_ENCODE(0, 1);
	TEST("PORT_VALUE(0) works", PORT_VALUE(encoded) == 0);

	encoded = PORT_ENCODE(65535, 15);
	TEST("PORT_VALUE(65535) max port", PORT_VALUE(encoded) == 65535);
	TEST("PORT_COUNT(15) high count", PORT_COUNT(encoded) == 15);

	/* Test that uint16_t cast truncates correctly (simulates old behavior) */
	encoded = PORT_ENCODE(443, 5);
	TEST("(uint16_t)encoded equals PORT_VALUE", (uint16_t)encoded == PORT_VALUE(encoded));
}

/*
 * Test parse_pstr() with :count suffix format
 * Format: "port:count" where count is stored in upper 16 bits
 */
static void test_parse_pstr_with_counts(void) {
	int32_t port;

	printf("\nparse_pstr() with :count suffix tests:\n");

	/* Test single port with count */
	parse_pstr("443:3", NULL);
	reset_getnextport();
	if (get_nextport(&port) == 1) {
		TEST("parse_pstr(\"443:3\") port value", PORT_VALUE(port) == 443);
		TEST("parse_pstr(\"443:3\") count value", PORT_COUNT(port) == 3);
	} else {
		TEST("parse_pstr(\"443:3\") returns port", 0);
	}

	/* Test single port without count (default=1) */
	parse_pstr("80", NULL);
	reset_getnextport();
	if (get_nextport(&port) == 1) {
		TEST("parse_pstr(\"80\") port value", PORT_VALUE(port) == 80);
		TEST("parse_pstr(\"80\") default count=1", PORT_COUNT(port) == 1);
	} else {
		TEST("parse_pstr(\"80\") returns port", 0);
	}

	/* Test range with count */
	parse_pstr("100-102:2", NULL);
	reset_getnextport();
	if (get_nextport(&port) == 1) {
		TEST("parse_pstr(\"100-102:2\") first port", PORT_VALUE(port) == 100);
		TEST("parse_pstr(\"100-102:2\") count=2", PORT_COUNT(port) == 2);
	} else {
		TEST("parse_pstr(\"100-102:2\") returns port", 0);
	}

	/* Test multiple ports with different counts */
	parse_pstr("22:1,443:3,8080:2", NULL);
	reset_getnextport();
	if (get_nextport(&port) == 1) {
		TEST("First port is 22", PORT_VALUE(port) == 22);
		TEST("First port count=1", PORT_COUNT(port) == 1);
	}
	if (get_nextport(&port) == 1) {
		TEST("Second port is 443", PORT_VALUE(port) == 443);
		TEST("Second port count=3", PORT_COUNT(port) == 3);
	}
	if (get_nextport(&port) == 1) {
		TEST("Third port is 8080", PORT_VALUE(port) == 8080);
		TEST("Third port count=2", PORT_COUNT(port) == 2);
	}
}

int main(int argc, char **argv) {
	uint16_t count=0;
	uint8_t *data=NULL;
	uint32_t payload_size=0;
	int32_t local_port=0;
	int (*payload_init)(uint8_t **, uint32_t *, void *)=NULL;
	const char *conffile="/opt/unicornscan/etc/payloads.conf";

	printf("\n=== Multi-Payload Unit Tests ===\n\n");

	/* Test PORT_* macros (no initialization needed) */
	test_port_encoding_macros();

	/* Test parse_pstr with :count suffix (no initialization needed) */
	test_parse_pstr_with_counts();

	/* Initialize settings and payloads */
	printf("Initializing settings...\n");
	settings_init();

	printf("Loading payloads from %s...\n", conffile);
	if (init_payload_modules(conffile) < 0) {
		printf("ERROR: Failed to load payloads\n");
		return 1;
	}

	printf("\ncount_payloads() tests:\n");

	/* Test port 443 - should have 2 payloads (TLS 1.3 + SSL 3.0) */
	count = count_payloads(IPPROTO_TCP, 443, 1);
	TEST("Port 443 TCP group 1 has 2 payloads", count == 2);

	/* Test port 465 - should have 2 payloads */
	count = count_payloads(IPPROTO_TCP, 465, 1);
	TEST("Port 465 TCP group 1 has 2 payloads", count == 2);

	/* Test port 80 - should have 1 payload (HTTP only) */
	count = count_payloads(IPPROTO_TCP, 80, 1);
	TEST("Port 80 TCP group 1 has payloads", count >= 1);

	/* Test port with no payloads */
	count = count_payloads(IPPROTO_TCP, 12345, 1);
	TEST("Port 12345 TCP group 1 has 0 payloads", count == 0);

	/* Test UDP port */
	count = count_payloads(IPPROTO_UDP, 53, 1);
	TEST("Port 53 UDP group 1 has payloads", count >= 1);

	printf("\nget_payload() chain tests:\n");

	/* Test getting first payload for port 443 */
	if (get_payload(0, IPPROTO_TCP, 443, &data, &payload_size, &local_port, &payload_init, 1) == 1) {
		TEST("get_payload(0) for port 443 succeeds", 1);
		TEST("First payload has data", data != NULL && payload_size > 0);
		printf("    Payload 0 size: %u bytes\n", payload_size);
	} else {
		TEST("get_payload(0) for port 443 succeeds", 0);
	}

	/* Test getting second payload for port 443 */
	data = NULL;
	payload_size = 0;
	if (get_payload(1, IPPROTO_TCP, 443, &data, &payload_size, &local_port, &payload_init, 1) == 1) {
		TEST("get_payload(1) for port 443 succeeds", 1);
		TEST("Second payload has data", data != NULL && payload_size > 0);
		printf("    Payload 1 size: %u bytes\n", payload_size);
	} else {
		TEST("get_payload(1) for port 443 succeeds", 0);
	}

	/* Test getting third payload for port 443 - should fail */
	data = NULL;
	payload_size = 0;
	if (get_payload(2, IPPROTO_TCP, 443, &data, &payload_size, &local_port, &payload_init, 1) == 1) {
		TEST("get_payload(2) for port 443 fails (only 2 payloads)", 0);
	} else {
		TEST("get_payload(2) for port 443 fails (only 2 payloads)", 1);
	}

	printf("\n=== Results: %d/%d tests passed ===\n\n", tests_passed, tests_run);

	return (tests_passed == tests_run) ? 0 : 1;
}
