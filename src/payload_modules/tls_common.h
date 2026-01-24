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
 * TLS 1.2/1.3 ClientHello common definitions
 *
 * Shared between tls.c (port 443) and tls_default.c (default TCP payload).
 * Contains TLS constants, cipher suites, and the create_payload() function.
 *
 * Reference: RFC 5246 (TLS 1.2), RFC 8446 (TLS 1.3)
 */
#ifndef TLS_COMMON_H
#define TLS_COMMON_H

#include <config.h>

#include <scan_progs/scanopts.h>
#include <scan_progs/scan_export.h>
#include <settings.h>

#include <unilib/xmalloc.h>
#include <unilib/output.h>
#include <unilib/modules.h>

#include <arpa/inet.h>
#include <string.h>

/*
 * TLS constants
 */
#define TLS_CONTENT_HANDSHAKE		0x16
#define TLS_VERSION_10			0x0301	/* record layer version	*/
#define TLS_VERSION_12			0x0303	/* handshake version	*/
#define TLS_VERSION_13			0x0304	/* for supported_versions */
#define TLS_HANDSHAKE_CLIENT_HELLO	0x01

/*
 * Extension types (RFC 6066, RFC 8446)
 */
#define EXT_SERVER_NAME			0x0000
#define EXT_SUPPORTED_GROUPS		0x000a
#define EXT_SIGNATURE_ALGORITHMS	0x000d
#define EXT_SUPPORTED_VERSIONS		0x002b

/*
 * Cipher suites (modern AEAD ciphers)
 */
static const uint8_t tls_cipher_suites[] = {
	/* TLS 1.3 cipher suites */
	0x13, 0x01,	/* TLS_AES_128_GCM_SHA256		*/
	0x13, 0x02,	/* TLS_AES_256_GCM_SHA384		*/
	0x13, 0x03,	/* TLS_CHACHA20_POLY1305_SHA256		*/
	/* TLS 1.2 ECDHE cipher suites */
	0xc0, 0x2b,	/* TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256 */
	0xc0, 0x2f,	/* TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256   */
	0xc0, 0x2c,	/* TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384 */
	0xc0, 0x30,	/* TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384   */
	0xcc, 0xa9,	/* TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305  */
	0xcc, 0xa8,	/* TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305    */
	/* TLS 1.2 DHE cipher suites */
	0x00, 0x9e,	/* TLS_DHE_RSA_WITH_AES_128_GCM_SHA256	   */
	0x00, 0x9f,	/* TLS_DHE_RSA_WITH_AES_256_GCM_SHA384	   */
	/* TLS 1.2 RSA cipher suites (fallback) */
	0x00, 0x9c,	/* TLS_RSA_WITH_AES_128_GCM_SHA256	   */
	0x00, 0x9d,	/* TLS_RSA_WITH_AES_256_GCM_SHA384	   */
	0x00, 0x2f,	/* TLS_RSA_WITH_AES_128_CBC_SHA		   */
	0x00, 0x35,	/* TLS_RSA_WITH_AES_256_CBC_SHA		   */
	/* Legacy (for old servers) */
	0x00, 0x0a,	/* TLS_RSA_WITH_3DES_EDE_CBC_SHA	   */
};
#define TLS_CIPHER_SUITES_LEN	sizeof(tls_cipher_suites)

/*
 * Supported groups (elliptic curves for ECDHE)
 */
static const uint8_t tls_supported_groups[] = {
	0x00, 0x1d,	/* x25519			*/
	0x00, 0x17,	/* secp256r1 (P-256)		*/
	0x00, 0x18,	/* secp384r1 (P-384)		*/
	0x00, 0x19,	/* secp521r1 (P-521)		*/
	0x01, 0x00,	/* ffdhe2048			*/
	0x01, 0x01,	/* ffdhe3072			*/
};
#define TLS_SUPPORTED_GROUPS_LEN	sizeof(tls_supported_groups)

/*
 * Signature algorithms (required by many TLS 1.2+ servers)
 */
static const uint8_t tls_signature_algorithms[] = {
	0x04, 0x03,	/* ecdsa_secp256r1_sha256	*/
	0x05, 0x03,	/* ecdsa_secp384r1_sha384	*/
	0x06, 0x03,	/* ecdsa_secp521r1_sha512	*/
	0x08, 0x07,	/* ed25519			*/
	0x08, 0x08,	/* ed448			*/
	0x08, 0x04,	/* rsa_pss_rsae_sha256		*/
	0x08, 0x05,	/* rsa_pss_rsae_sha384		*/
	0x08, 0x06,	/* rsa_pss_rsae_sha512		*/
	0x04, 0x01,	/* rsa_pkcs1_sha256		*/
	0x05, 0x01,	/* rsa_pkcs1_sha384		*/
	0x06, 0x01,	/* rsa_pkcs1_sha512		*/
	0x02, 0x01,	/* rsa_pkcs1_sha1 (legacy)	*/
};
#define TLS_SIGNATURE_ALGORITHMS_LEN	sizeof(tls_signature_algorithms)

/*
 * Supported TLS versions for supported_versions extension
 */
static const uint8_t tls_supported_versions[] = {
	0x03, 0x04,	/* TLS 1.3	*/
	0x03, 0x03,	/* TLS 1.2	*/
	0x03, 0x02,	/* TLS 1.1	*/
	0x03, 0x01,	/* TLS 1.0	*/
};
#define TLS_SUPPORTED_VERSIONS_LEN	sizeof(tls_supported_versions)

/*
 * Build TLS ClientHello with SNI extension
 *
 * Structure:
 * [Record Header 5 bytes]
 *   Content-Type: Handshake (0x16)
 *   Version: TLS 1.0 (0x0301) - for compatibility
 *   Length: 2 bytes
 * [Handshake Header 4 bytes]
 *   Type: ClientHello (0x01)
 *   Length: 3 bytes (24-bit)
 * [ClientHello Body]
 *   Version: TLS 1.2 (0x0303)
 *   Random: 32 bytes
 *   Session ID: 1 byte length + data
 *   Cipher Suites: 2 byte length + data
 *   Compression: 1 byte length + data
 *   Extensions: 2 byte length + data
 */
static int tls_create_payload(uint8_t **data, uint32_t *dlen, void *i) {
	union {
		void *p;
		ip_report_t *ir;
	} i_u;
	struct in_addr ia;
	char host_addr[INET_ADDRSTRLEN];
	size_t sni_len=0;
	size_t ext_len=0;
	size_t client_hello_len=0;
	size_t handshake_len=0;
	size_t record_len=0;
	uint8_t *pkt=NULL;
	uint8_t *p=NULL;

	i_u.p=i;

	assert(i != NULL && i_u.ir->magic == IP_REPORT_MAGIC);

	/* Convert target IP to string for SNI */
	ia.s_addr=i_u.ir->host_addr;
	inet_ntop(AF_INET, &ia, host_addr, sizeof(host_addr));
	sni_len=strlen(host_addr);

	/*
	 * Calculate extension lengths
	 *
	 * SNI extension:
	 *   Type(2) + Length(2) + ListLength(2) + NameType(1) + NameLength(2) + Name
	 *   = 9 + sni_len
	 *
	 * supported_groups extension:
	 *   Type(2) + Length(2) + ListLength(2) + Groups
	 *   = 6 + TLS_SUPPORTED_GROUPS_LEN
	 *
	 * signature_algorithms extension:
	 *   Type(2) + Length(2) + ListLength(2) + Algorithms
	 *   = 6 + TLS_SIGNATURE_ALGORITHMS_LEN
	 *
	 * supported_versions extension:
	 *   Type(2) + Length(2) + ListLength(1) + Versions
	 *   = 5 + TLS_SUPPORTED_VERSIONS_LEN
	 */
	ext_len=(9 + sni_len) +
		(6 + TLS_SUPPORTED_GROUPS_LEN) +
		(6 + TLS_SIGNATURE_ALGORITHMS_LEN) +
		(5 + TLS_SUPPORTED_VERSIONS_LEN);

	/*
	 * ClientHello body length:
	 *   Version(2) + Random(32) + SessionIDLen(1) + CipherSuitesLen(2) +
	 *   CipherSuites + CompressionLen(1) + Compression(1) + ExtensionsLen(2) +
	 *   Extensions
	 */
	client_hello_len=2 + 32 + 1 + 2 + TLS_CIPHER_SUITES_LEN + 1 + 1 + 2 + ext_len;

	/* Handshake header adds 4 bytes (type + 3-byte length) */
	handshake_len=4 + client_hello_len;

	/* Record header adds 5 bytes (type + version + 2-byte length) */
	record_len=5 + handshake_len;

	/* Allocate packet buffer */
	pkt=(uint8_t *)xmalloc(record_len);
	memset(pkt, 0, record_len);
	p=pkt;

	/*
	 * TLS Record Header
	 */
	*p++=TLS_CONTENT_HANDSHAKE;		/* Content Type: Handshake */
	*p++=(TLS_VERSION_10 >> 8) & 0xff;	/* Version major */
	*p++=TLS_VERSION_10 & 0xff;		/* Version minor */
	*p++=(handshake_len >> 8) & 0xff;	/* Length high byte */
	*p++=handshake_len & 0xff;		/* Length low byte */

	/*
	 * Handshake Header
	 */
	*p++=TLS_HANDSHAKE_CLIENT_HELLO;	/* Handshake Type */
	*p++=0x00;				/* Length high byte (24-bit) */
	*p++=(client_hello_len >> 8) & 0xff;	/* Length mid byte */
	*p++=client_hello_len & 0xff;		/* Length low byte */

	/*
	 * ClientHello Body
	 */
	/* Client Version: TLS 1.2 */
	*p++=(TLS_VERSION_12 >> 8) & 0xff;
	*p++=TLS_VERSION_12 & 0xff;

	/* Random: 32 bytes (use semi-random values based on target) */
	/* Byte 0-3: "UNIS" signature for debugging */
	*p++=0x55;	/* 'U' */
	*p++=0x4e;	/* 'N' */
	*p++=0x49;	/* 'I' */
	*p++=0x53;	/* 'S' */
	/* Bytes 4-7: target IP for uniqueness */
	*p++=(i_u.ir->host_addr >> 0) & 0xff;
	*p++=(i_u.ir->host_addr >> 8) & 0xff;
	*p++=(i_u.ir->host_addr >> 16) & 0xff;
	*p++=(i_u.ir->host_addr >> 24) & 0xff;
	/* Bytes 8-31: fixed pattern (servers don't validate randomness) */
	memset(p, 0x50, 24);
	p += 24;

	/* Session ID Length: 0 (no session resumption) */
	*p++=0x00;

	/* Cipher Suites Length */
	*p++=(TLS_CIPHER_SUITES_LEN >> 8) & 0xff;
	*p++=TLS_CIPHER_SUITES_LEN & 0xff;

	/* Cipher Suites */
	memcpy(p, tls_cipher_suites, TLS_CIPHER_SUITES_LEN);
	p += TLS_CIPHER_SUITES_LEN;

	/* Compression Methods Length: 1 */
	*p++=0x01;
	/* Compression Methods: null only */
	*p++=0x00;

	/* Extensions Length */
	*p++=(ext_len >> 8) & 0xff;
	*p++=ext_len & 0xff;

	/*
	 * Extension: Server Name (SNI)
	 */
	/* Extension Type: server_name (0x0000) */
	*p++=(EXT_SERVER_NAME >> 8) & 0xff;
	*p++=EXT_SERVER_NAME & 0xff;
	/* Extension Length */
	*p++=((5 + sni_len) >> 8) & 0xff;
	*p++=(5 + sni_len) & 0xff;
	/* Server Name List Length */
	*p++=((3 + sni_len) >> 8) & 0xff;
	*p++=(3 + sni_len) & 0xff;
	/* Server Name Type: hostname (0x00) */
	*p++=0x00;
	/* Server Name Length */
	*p++=(sni_len >> 8) & 0xff;
	*p++=sni_len & 0xff;
	/* Server Name (IP address as fallback) */
	memcpy(p, host_addr, sni_len);
	p += sni_len;

	/*
	 * Extension: Supported Groups (for ECDHE)
	 */
	/* Extension Type: supported_groups (0x000a) */
	*p++=(EXT_SUPPORTED_GROUPS >> 8) & 0xff;
	*p++=EXT_SUPPORTED_GROUPS & 0xff;
	/* Extension Length */
	*p++=((2 + TLS_SUPPORTED_GROUPS_LEN) >> 8) & 0xff;
	*p++=(2 + TLS_SUPPORTED_GROUPS_LEN) & 0xff;
	/* Supported Groups List Length */
	*p++=(TLS_SUPPORTED_GROUPS_LEN >> 8) & 0xff;
	*p++=TLS_SUPPORTED_GROUPS_LEN & 0xff;
	/* Supported Groups */
	memcpy(p, tls_supported_groups, TLS_SUPPORTED_GROUPS_LEN);
	p += TLS_SUPPORTED_GROUPS_LEN;

	/*
	 * Extension: Signature Algorithms
	 */
	/* Extension Type: signature_algorithms (0x000d) */
	*p++=(EXT_SIGNATURE_ALGORITHMS >> 8) & 0xff;
	*p++=EXT_SIGNATURE_ALGORITHMS & 0xff;
	/* Extension Length */
	*p++=((2 + TLS_SIGNATURE_ALGORITHMS_LEN) >> 8) & 0xff;
	*p++=(2 + TLS_SIGNATURE_ALGORITHMS_LEN) & 0xff;
	/* Signature Algorithms List Length */
	*p++=(TLS_SIGNATURE_ALGORITHMS_LEN >> 8) & 0xff;
	*p++=TLS_SIGNATURE_ALGORITHMS_LEN & 0xff;
	/* Signature Algorithms */
	memcpy(p, tls_signature_algorithms, TLS_SIGNATURE_ALGORITHMS_LEN);
	p += TLS_SIGNATURE_ALGORITHMS_LEN;

	/*
	 * Extension: Supported Versions (for TLS 1.3 negotiation)
	 */
	/* Extension Type: supported_versions (0x002b) */
	*p++=(EXT_SUPPORTED_VERSIONS >> 8) & 0xff;
	*p++=EXT_SUPPORTED_VERSIONS & 0xff;
	/* Extension Length */
	*p++=((1 + TLS_SUPPORTED_VERSIONS_LEN) >> 8) & 0xff;
	*p++=(1 + TLS_SUPPORTED_VERSIONS_LEN) & 0xff;
	/* Supported Versions List Length */
	*p++=TLS_SUPPORTED_VERSIONS_LEN & 0xff;
	/* Supported Versions */
	memcpy(p, tls_supported_versions, TLS_SUPPORTED_VERSIONS_LEN);
	p += TLS_SUPPORTED_VERSIONS_LEN;

	/* Verify we wrote the expected length */
	assert((size_t)(p - pkt) == record_len);

	*data=pkt;
	*dlen=(uint32_t)record_len;

	return 1;
}

#endif /* TLS_COMMON_H */
