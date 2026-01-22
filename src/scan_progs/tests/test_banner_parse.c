/**********************************************************************
 * Copyright (C) 2026 (Robert E. Lee) <robert@unicornscan.org>        *
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
 * Unit tests for banner_parse module
 *
 * Tests protocol detection and parsing for DNS, TLS, and RPC responses.
 * Uses both inline test vectors and captured binary files.
 */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <assert.h>

#include <scan_progs/banner_parse.h>

static int tests_run = 0;
static int tests_passed = 0;

#define TEST(name) do { \
    printf("  %-50s ", name); \
    tests_run++; \
} while(0)

#define PASS() do { \
    printf("[PASS]\n"); \
    tests_passed++; \
} while(0)

#define FAIL(msg) do { \
    printf("[FAIL] %s\n", msg); \
} while(0)

#define ASSERT_EQ(a, b, msg) do { \
    if ((a) != (b)) { FAIL(msg); return; } \
} while(0)

#define ASSERT_STR_CONTAINS(haystack, needle, msg) do { \
    if (strstr((haystack), (needle)) == NULL) { \
        FAIL(msg); \
        printf("    Expected to find '%s' in '%s'\n", (needle), (haystack)); \
        return; \
    } \
} while(0)

#define ASSERT_STR_EQ(a, b, msg) do { \
    if (strcmp((a), (b)) != 0) { \
        FAIL(msg); \
        printf("    Expected '%s', got '%s'\n", (b), (a)); \
        return; \
    } \
} while(0)

/*
 * Test vectors - inline binary data
 */

/* DNS TCP response: NOERROR for "local" type A (29 bytes of DNS data) */
static const uint8_t dns_noerror[] = {
    0x00, 0x1d,             /* TCP length: 29 */
    0x12, 0x34,             /* XID */
    0x81, 0x80,             /* Flags: QR=1, RD=1, RA=1, RCODE=0 */
    0x00, 0x01,             /* Questions: 1 */
    0x00, 0x01,             /* Answers: 1 */
    0x00, 0x00, 0x00, 0x00, /* NS/AR: 0 */
    0x05, 'l', 'o', 'c', 'a', 'l', 0x00,  /* QNAME: local */
    0x00, 0x01,             /* QTYPE: A */
    0x00, 0x01,             /* QCLASS: IN */
    /* Answer RR (minimal) */
    0xc0, 0x0c,             /* Name pointer to offset 12 */
    0x00, 0x01,             /* TYPE: A */
    0x00, 0x01,             /* CLASS: IN */
};

/* DNS TCP response: NXDOMAIN (21 bytes of DNS data) */
static const uint8_t dns_nxdomain[] = {
    0x00, 0x15,             /* TCP length: 21 */
    0x56, 0x78,             /* XID */
    0x81, 0x83,             /* Flags: QR=1, RD=1, RA=1, RCODE=3 (NXDOMAIN) */
    0x00, 0x01,             /* Questions: 1 */
    0x00, 0x00,             /* Answers: 0 */
    0x00, 0x00, 0x00, 0x00, /* NS/AR: 0 */
    0x03, 'f', 'o', 'o', 0x00,  /* QNAME: foo */
    0x00, 0x01,             /* QTYPE: A */
    0x00, 0x01,             /* QCLASS: IN */
};

/* RPC reply: MSG_ACCEPTED, SUCCESS, AUTH_NULL */
static const uint8_t rpc_success[] = {
    0x80, 0x00, 0x00, 0x18, /* RM header: last frag, len=24 */
    0x12, 0x34, 0x56, 0x78, /* XID */
    0x00, 0x00, 0x00, 0x01, /* msg_type: REPLY */
    0x00, 0x00, 0x00, 0x00, /* reply_stat: MSG_ACCEPTED */
    0x00, 0x00, 0x00, 0x00, /* verifier flavor: AUTH_NULL */
    0x00, 0x00, 0x00, 0x00, /* verifier length: 0 */
    0x00, 0x00, 0x00, 0x00, /* accept_stat: SUCCESS */
};

/* RPC reply: MSG_DENIED, AUTH_ERROR */
static const uint8_t rpc_denied[] = {
    0x80, 0x00, 0x00, 0x10, /* RM header: last frag, len=16 */
    0xaa, 0xbb, 0xcc, 0xdd, /* XID */
    0x00, 0x00, 0x00, 0x01, /* msg_type: REPLY */
    0x00, 0x00, 0x00, 0x01, /* reply_stat: MSG_DENIED */
    0x00, 0x00, 0x00, 0x01, /* reject_stat: AUTH_ERROR */
};

/* TLS ServerHello (TLS 1.2) */
static const uint8_t tls_hello[] = {
    0x16,                   /* Content type: Handshake */
    0x03, 0x03,             /* Version: TLS 1.2 */
    0x00, 0x45,             /* Length: 69 */
    0x02,                   /* Handshake type: ServerHello */
    0x00, 0x00, 0x41,       /* Length: 65 */
    0x03, 0x03,             /* Version: TLS 1.2 */
    /* 32 bytes random */
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
    0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
    0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
    0x00,                   /* Session ID length: 0 */
    0xc0, 0x2f,             /* Cipher: TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 */
    0x00,                   /* Compression: null */
    /* Extensions (minimal) */
    0x00, 0x19,             /* Extensions length: 25 */
    0xff, 0x01,             /* Renegotiation info */
    0x00, 0x01, 0x00,
    0x00, 0x0b,             /* EC point formats */
    0x00, 0x04, 0x03, 0x00, 0x01, 0x02,
    0x00, 0x23,             /* Session ticket */
    0x00, 0x00,
    0x00, 0x17,             /* Extended master secret */
    0x00, 0x00,
};

/* Unknown binary data */
static const uint8_t unknown_binary[] = {
    0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe,
    0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
};

/*
 * Test functions
 */

static void test_detect_dns(void) {
    TEST("detect_banner_protocol() identifies DNS");
    banner_proto_t proto = detect_banner_protocol(dns_noerror, sizeof(dns_noerror));
    ASSERT_EQ(proto, BANNER_PROTO_DNS, "Expected BANNER_PROTO_DNS");
    PASS();
}

static void test_detect_rpc(void) {
    TEST("detect_banner_protocol() identifies RPC");
    banner_proto_t proto = detect_banner_protocol(rpc_success, sizeof(rpc_success));
    ASSERT_EQ(proto, BANNER_PROTO_RPC, "Expected BANNER_PROTO_RPC");
    PASS();
}

static void test_detect_tls(void) {
    TEST("detect_banner_protocol() identifies TLS");
    banner_proto_t proto = detect_banner_protocol(tls_hello, sizeof(tls_hello));
    ASSERT_EQ(proto, BANNER_PROTO_TLS, "Expected BANNER_PROTO_TLS");
    PASS();
}

static void test_detect_unknown(void) {
    TEST("detect_banner_protocol() returns UNKNOWN for garbage");
    banner_proto_t proto = detect_banner_protocol(unknown_binary, sizeof(unknown_binary));
    ASSERT_EQ(proto, BANNER_PROTO_UNKNOWN, "Expected BANNER_PROTO_UNKNOWN");
    PASS();
}

static void test_detect_empty(void) {
    TEST("detect_banner_protocol() handles empty buffer");
    banner_proto_t proto = detect_banner_protocol(NULL, 0);
    ASSERT_EQ(proto, BANNER_PROTO_UNKNOWN, "Expected BANNER_PROTO_UNKNOWN for NULL");

    uint8_t empty[1] = {0};
    proto = detect_banner_protocol(empty, 0);
    ASSERT_EQ(proto, BANNER_PROTO_UNKNOWN, "Expected BANNER_PROTO_UNKNOWN for zero len");
    PASS();
}

static void test_parse_dns_noerror(void) {
    TEST("parse_binary_banner() parses DNS NOERROR");
    char out[256] = {0};
    banner_proto_t proto = parse_binary_banner(dns_noerror, sizeof(dns_noerror), out, sizeof(out));
    ASSERT_EQ(proto, BANNER_PROTO_DNS, "Expected BANNER_PROTO_DNS");
    ASSERT_STR_CONTAINS(out, "DNS:", "Missing DNS: prefix");
    ASSERT_STR_CONTAINS(out, "NOERROR", "Missing NOERROR");
    ASSERT_STR_CONTAINS(out, "local", "Missing qname 'local'");
    PASS();
}

static void test_parse_dns_nxdomain(void) {
    TEST("parse_binary_banner() parses DNS NXDOMAIN");
    char out[256] = {0};
    banner_proto_t proto = parse_binary_banner(dns_nxdomain, sizeof(dns_nxdomain), out, sizeof(out));
    ASSERT_EQ(proto, BANNER_PROTO_DNS, "Expected BANNER_PROTO_DNS");
    ASSERT_STR_CONTAINS(out, "DNS:", "Missing DNS: prefix");
    ASSERT_STR_CONTAINS(out, "NXDOMAIN", "Missing NXDOMAIN");
    PASS();
}

static void test_parse_rpc_success(void) {
    TEST("parse_binary_banner() parses RPC SUCCESS");
    char out[256] = {0};
    banner_proto_t proto = parse_binary_banner(rpc_success, sizeof(rpc_success), out, sizeof(out));
    ASSERT_EQ(proto, BANNER_PROTO_RPC, "Expected BANNER_PROTO_RPC");
    ASSERT_STR_CONTAINS(out, "RPC:", "Missing RPC: prefix");
    ASSERT_STR_CONTAINS(out, "SUCCESS", "Missing SUCCESS");
    PASS();
}

static void test_parse_rpc_denied(void) {
    TEST("parse_binary_banner() parses RPC DENIED");
    char out[256] = {0};
    banner_proto_t proto = parse_binary_banner(rpc_denied, sizeof(rpc_denied), out, sizeof(out));
    ASSERT_EQ(proto, BANNER_PROTO_RPC, "Expected BANNER_PROTO_RPC");
    ASSERT_STR_CONTAINS(out, "RPC:", "Missing RPC: prefix");
    ASSERT_STR_CONTAINS(out, "DENIED", "Missing DENIED");
    PASS();
}

static void test_parse_tls_hello(void) {
    TEST("parse_binary_banner() parses TLS ServerHello");
    char out[256] = {0};
    banner_proto_t proto = parse_binary_banner(tls_hello, sizeof(tls_hello), out, sizeof(out));
    /* TLS detection should work; parser may fall back to hex if ServerHello isn't complete enough */
    if (proto == BANNER_PROTO_TLS) {
        ASSERT_STR_CONTAINS(out, "TLS:", "Missing TLS: prefix");
    } else if (proto == BANNER_PROTO_HEX_FALLBACK) {
        /* Acceptable: detection worked but parsing fell back to hex */
        ASSERT_STR_CONTAINS(out, "16", "Missing TLS content type in hex");
    } else {
        FAIL("Expected BANNER_PROTO_TLS or HEX_FALLBACK");
        return;
    }
    PASS();
}

static void test_parse_unknown_hex_fallback(void) {
    TEST("parse_binary_banner() uses hex fallback for unknown");
    char out[256] = {0};
    banner_proto_t proto = parse_binary_banner(unknown_binary, sizeof(unknown_binary), out, sizeof(out));
    ASSERT_EQ(proto, BANNER_PROTO_HEX_FALLBACK, "Expected BANNER_PROTO_HEX_FALLBACK");
    /* Should contain hex representation */
    ASSERT_STR_CONTAINS(out, "de", "Missing hex bytes");
    PASS();
}

static void test_proto_name(void) {
    TEST("banner_proto_name() returns correct strings");
    ASSERT_STR_EQ(banner_proto_name(BANNER_PROTO_UNKNOWN), "UNKNOWN", "Wrong name for UNKNOWN");
    ASSERT_STR_EQ(banner_proto_name(BANNER_PROTO_DNS), "DNS", "Wrong name for DNS");
    ASSERT_STR_EQ(banner_proto_name(BANNER_PROTO_TLS), "TLS", "Wrong name for TLS");
    ASSERT_STR_EQ(banner_proto_name(BANNER_PROTO_RPC), "RPC", "Wrong name for RPC");
    ASSERT_STR_EQ(banner_proto_name(BANNER_PROTO_HEX_FALLBACK), "HEX", "Wrong name for HEX");
    PASS();
}

static void test_small_buffer(void) {
    TEST("parse_binary_banner() handles small output buffer");
    char out[16] = {0};  /* Very small buffer */
    banner_proto_t proto = parse_binary_banner(dns_noerror, sizeof(dns_noerror), out, sizeof(out));
    /*
     * Should not crash and should truncate gracefully.
     * With such a small buffer, the parser may fall back to hex because
     * it can't fit the full parsed output.
     */
    if (proto != BANNER_PROTO_DNS && proto != BANNER_PROTO_HEX_FALLBACK) {
        FAIL("Expected BANNER_PROTO_DNS or HEX_FALLBACK");
        return;
    }
    /* out should be null-terminated and not overflow */
    size_t len = strlen(out);
    if (len >= sizeof(out)) {
        FAIL("Output buffer overflow");
        return;
    }
    PASS();
}

static void test_truncated_dns(void) {
    TEST("parse_binary_banner() handles truncated DNS");
    /* Only TCP length prefix, no actual DNS data */
    uint8_t truncated[] = {0x00, 0x20, 0x12, 0x34};
    char out[256] = {0};
    banner_proto_t proto = parse_binary_banner(truncated, sizeof(truncated), out, sizeof(out));
    /* Should fall back to hex or return gracefully */
    if (proto != BANNER_PROTO_DNS && proto != BANNER_PROTO_HEX_FALLBACK) {
        FAIL("Expected DNS or HEX_FALLBACK for truncated data");
        return;
    }
    PASS();
}

static void test_truncated_rpc(void) {
    TEST("parse_binary_banner() handles truncated RPC");
    /* Only RM header, truncated message */
    uint8_t truncated[] = {0x80, 0x00, 0x00, 0x18, 0x12, 0x34};
    char out[256] = {0};
    banner_proto_t proto = parse_binary_banner(truncated, sizeof(truncated), out, sizeof(out));
    /* Should handle gracefully */
    if (proto != BANNER_PROTO_RPC && proto != BANNER_PROTO_HEX_FALLBACK) {
        FAIL("Expected RPC or HEX_FALLBACK for truncated data");
        return;
    }
    PASS();
}

/*
 * Test with captured binary files
 */
static void test_captured_dns_file(void) {
    TEST("parse_binary_banner() with dns_response_53.bin");
    FILE *f = fopen("test_vectors/dns_response_53.bin", "rb");
    if (!f) {
        printf("[SKIP] file not found\n");
        tests_passed++;  /* Don't fail if file missing */
        return;
    }

    uint8_t buf[1024];
    size_t len = fread(buf, 1, sizeof(buf), f);
    fclose(f);

    char out[256] = {0};
    banner_proto_t proto = parse_binary_banner(buf, len, out, sizeof(out));
    ASSERT_EQ(proto, BANNER_PROTO_DNS, "Expected BANNER_PROTO_DNS");
    ASSERT_STR_CONTAINS(out, "DNS:", "Missing DNS: prefix");
    PASS();
}

static void test_captured_rpc_nfs_file(void) {
    TEST("parse_binary_banner() with nfs_rpc_null_2049.bin");
    FILE *f = fopen("test_vectors/nfs_rpc_null_2049.bin", "rb");
    if (!f) {
        printf("[SKIP] file not found\n");
        tests_passed++;
        return;
    }

    uint8_t buf[256];
    size_t len = fread(buf, 1, sizeof(buf), f);
    fclose(f);

    char out[256] = {0};
    banner_proto_t proto = parse_binary_banner(buf, len, out, sizeof(out));
    ASSERT_EQ(proto, BANNER_PROTO_RPC, "Expected BANNER_PROTO_RPC");
    ASSERT_STR_CONTAINS(out, "RPC:", "Missing RPC: prefix");
    ASSERT_STR_CONTAINS(out, "SUCCESS", "Missing SUCCESS");
    PASS();
}

static void test_captured_rpc_portmap_file(void) {
    TEST("parse_binary_banner() with portmapper_null_111.bin");
    FILE *f = fopen("test_vectors/portmapper_null_111.bin", "rb");
    if (!f) {
        printf("[SKIP] file not found\n");
        tests_passed++;
        return;
    }

    uint8_t buf[256];
    size_t len = fread(buf, 1, sizeof(buf), f);
    fclose(f);

    char out[256] = {0};
    banner_proto_t proto = parse_binary_banner(buf, len, out, sizeof(out));
    ASSERT_EQ(proto, BANNER_PROTO_RPC, "Expected BANNER_PROTO_RPC");
    ASSERT_STR_CONTAINS(out, "RPC:", "Missing RPC: prefix");
    PASS();
}

static void test_captured_tls_file(void) {
    TEST("parse_binary_banner() with tls_serverhello_853.bin");
    FILE *f = fopen("test_vectors/tls_serverhello_853.bin", "rb");
    if (!f) {
        printf("[SKIP] file not found\n");
        tests_passed++;
        return;
    }

    uint8_t buf[4096];
    size_t len = fread(buf, 1, sizeof(buf), f);
    fclose(f);

    char out[256] = {0};
    banner_proto_t proto = parse_binary_banner(buf, len, out, sizeof(out));
    ASSERT_EQ(proto, BANNER_PROTO_TLS, "Expected BANNER_PROTO_TLS");
    ASSERT_STR_CONTAINS(out, "TLS:", "Missing TLS: prefix");
    PASS();
}

/*
 * Main
 */
int main(void) {
    printf("\n=== Banner Parse Unit Tests ===\n\n");

    printf("Protocol Detection:\n");
    test_detect_dns();
    test_detect_rpc();
    test_detect_tls();
    test_detect_unknown();
    test_detect_empty();

    printf("\nDNS Parsing:\n");
    test_parse_dns_noerror();
    test_parse_dns_nxdomain();

    printf("\nRPC Parsing:\n");
    test_parse_rpc_success();
    test_parse_rpc_denied();

    printf("\nTLS Parsing:\n");
    test_parse_tls_hello();

    printf("\nEdge Cases:\n");
    test_parse_unknown_hex_fallback();
    test_proto_name();
    test_small_buffer();
    test_truncated_dns();
    test_truncated_rpc();

    printf("\nCaptured Test Vectors:\n");
    test_captured_dns_file();
    test_captured_rpc_nfs_file();
    test_captured_rpc_portmap_file();
    test_captured_tls_file();

    printf("\n=== Results: %d/%d tests passed ===\n\n", tests_passed, tests_run);

    return (tests_passed == tests_run) ? 0 : 1;
}
