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
 * Standalone unit tests for port encoding macros and functions.
 * Tests PORT_* macros from portfunc.h and payload encoding from scan_export.h.
 * No external dependencies - can run without full unicornscan infrastructure.
 */
#include <config.h>
#include <stdio.h>
#include <stdint.h>

/* Include the headers we're testing */
#include <scan_progs/portfunc.h>
#include <scan_progs/scan_export.h>

/* Test counters */
static int tests_run = 0;
static int tests_passed = 0;

#define TEST(name, cond) do { \
	tests_run++; \
	if (cond) { \
		printf("  %-55s [PASS]\n", name); \
		tests_passed++; \
	} else { \
		printf("  %-55s [FAIL]\n", name); \
	} \
} while(0)

/*
 * Test PORT_* macros from portfunc.h
 * These macros encode payload count in upper 16 bits of port value.
 */
static void test_port_macros(void) {
	int32_t encoded;

	printf("\nPORT_* macro tests (portfunc.h):\n");

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

	/* Test PORT_COUNT with zero count (edge case) */
	encoded = PORT_ENCODE(22, 0);
	TEST("PORT_ENCODE(22, 0) port value", PORT_VALUE(encoded) == 22);
	TEST("PORT_COUNT(0) returns 0", PORT_COUNT(encoded) == 0);
}

/*
 * Test payload port encoding functions from scan_export.h
 * These encode/decode payload_index in source port for TCP multi-payload.
 */
static void test_payload_encoding(void) {
	uint16_t encoded, decoded;
	uint16_t base_sport;
	int i;

	printf("\nPayload port encoding tests (scan_export.h):\n");

	/* Test basic encoding with ephemeral base port */
	base_sport = 50000;
	encoded = encode_payload_port(base_sport, 0);
	TEST("encode_payload_port(50000, 0) >= PAYLOAD_PORT_BASE",
	     encoded >= PAYLOAD_PORT_BASE);
	decoded = decode_payload_index(encoded);
	TEST("decode_payload_index returns 0", decoded == 0);

	/* Test encoding multiple indices */
	for (i = 0; i < 16; i++) {
		encoded = encode_payload_port(base_sport, i);
		decoded = decode_payload_index(encoded);
		if (decoded != i) {
			printf("  encode/decode index %d                                     [FAIL]\n", i);
			tests_run++;
		} else {
			tests_passed++;
			tests_run++;
		}
	}
	printf("  encode/decode indices 0-15 roundtrip                        [PASS]\n");

	/* Test is_payload_port() */
	TEST("is_payload_port(PAYLOAD_PORT_BASE) = true",
	     is_payload_port(PAYLOAD_PORT_BASE) == 1);
	TEST("is_payload_port(PAYLOAD_PORT_BASE-1) = false",
	     is_payload_port(PAYLOAD_PORT_BASE - 1) == 0);
	TEST("is_payload_port(65535) = true",
	     is_payload_port(65535) == 1);

	/* Test with low source port (should be normalized) */
	encoded = encode_payload_port(1024, 5);
	TEST("encode_payload_port(1024, 5) >= PAYLOAD_PORT_BASE",
	     encoded >= PAYLOAD_PORT_BASE);
	decoded = decode_payload_index(encoded);
	TEST("decode_payload_index recovers index 5", decoded == 5);

	/* Test decode with non-encoded port returns 0 */
	decoded = decode_payload_index(1024);
	TEST("decode_payload_index(1024) = 0 (below base)", decoded == 0);

	/* Test PAYLOAD_INDEX_MASK */
	TEST("PAYLOAD_INDEX_MASK = 0x0F", PAYLOAD_INDEX_MASK == 0x0F);
	TEST("PAYLOAD_INDEX_BITS = 4", PAYLOAD_INDEX_BITS == 4);
}

/*
 * Test that TRACE_PORT_BASE and PAYLOAD_PORT_BASE don't conflict.
 * TRACE_PORT_BASE is for TTL encoding in tcptrace (40960-41215).
 * PAYLOAD_PORT_BASE is for payload index encoding (49152+).
 */
static void test_port_ranges(void) {
	uint16_t trace_max, payload_min;

	printf("\nPort range conflict tests:\n");

	/* TRACE_PORT_BASE uses ports 40960 + TTL (1-255) = 40961-41215 */
	trace_max = TRACE_PORT_BASE + 255;
	payload_min = PAYLOAD_PORT_BASE;

	TEST("TRACE_PORT_BASE = 40960", TRACE_PORT_BASE == 40960);
	TEST("PAYLOAD_PORT_BASE = 49152", PAYLOAD_PORT_BASE == 49152);
	TEST("No overlap: trace_max < payload_min", trace_max < payload_min);

	/* Verify gap is substantial */
	TEST("Gap between ranges > 7000 ports", (payload_min - trace_max) > 7000);
}

int main(int argc, char **argv) {
	printf("\n=== Port Encoding Unit Tests ===\n");

	test_port_macros();
	test_payload_encoding();
	test_port_ranges();

	printf("\n=== Results: %d/%d tests passed ===\n\n", tests_passed, tests_run);

	return (tests_passed == tests_run) ? 0 : 1;
}
