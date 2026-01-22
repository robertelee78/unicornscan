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
#include <config.h>
#include <string.h>
#include <stdio.h>
#include <ctype.h>

#include <scan_progs/banner_parse.h>

/*
 * Protocol detection signatures
 */

/* TLS record: content_type=0x16 (handshake), version 0x03 0x0X */
#define TLS_CONTENT_HANDSHAKE	0x16
#define TLS_VERSION_MAJOR	0x03

/* DNS response: QR bit (bit 7 of flags byte) after 2-byte TCP length */
#define DNS_QR_BIT		0x80
#define DNS_TCP_HDR_LEN		2

/* RPC: Record Marking last-fragment bit and reply message type */
#define RPC_RM_LAST_FRAG	0x80000000
#define RPC_MSG_TYPE_REPLY	1

/*
 * Protocol name strings
 */
static const char *proto_names[] = {
	"UNKNOWN",
	"DNS",
	"TLS",
	"RPC",
	"HEX"
};

/*
 * Forward declarations for protocol parsers
 */
static int parse_dns_response(const uint8_t *buf, size_t len,
                              char *out, size_t out_len);
static int parse_tls_response(const uint8_t *buf, size_t len,
                              char *out, size_t out_len);
static int parse_rpc_response(const uint8_t *buf, size_t len,
                              char *out, size_t out_len);
static int format_hex_fallback(const uint8_t *buf, size_t len,
                               char *out, size_t out_len);

/*
 * Detect protocol from binary signatures.
 */
banner_proto_t detect_banner_protocol(const uint8_t *buf, size_t len) {
	if (buf == NULL || len < 4) {
		return BANNER_PROTO_UNKNOWN;
	}

	/* TLS: content_type=0x16 (handshake), version 0x03 0x0X */
	if (len >= 5 &&
	    buf[0] == TLS_CONTENT_HANDSHAKE &&
	    buf[1] == TLS_VERSION_MAJOR &&
	    buf[2] <= 0x04) {
		return BANNER_PROTO_TLS;
	}

	/* RPC: Record Marking header with last-fragment bit and reply type */
	if (len >= 12) {
		uint32_t rm_header = ((uint32_t)buf[0] << 24) |
		                     ((uint32_t)buf[1] << 16) |
		                     ((uint32_t)buf[2] << 8) |
		                     (uint32_t)buf[3];
		uint32_t msg_type = ((uint32_t)buf[8] << 24) |
		                    ((uint32_t)buf[9] << 16) |
		                    ((uint32_t)buf[10] << 8) |
		                    (uint32_t)buf[11];

		if ((rm_header & RPC_RM_LAST_FRAG) && msg_type == RPC_MSG_TYPE_REPLY) {
			return BANNER_PROTO_RPC;
		}
	}

	/* DNS TCP: 2-byte length prefix, then QR bit set in flags */
	if (len >= 6) {
		uint16_t dns_len = ((uint16_t)buf[0] << 8) | buf[1];
		uint8_t flags_hi = buf[4];

		if (dns_len > 0 && dns_len <= (len - 2) && (flags_hi & DNS_QR_BIT)) {
			return BANNER_PROTO_DNS;
		}
	}

	return BANNER_PROTO_UNKNOWN;
}

/*
 * Get human-readable protocol name.
 */
const char *banner_proto_name(banner_proto_t proto) {
	if (proto > BANNER_PROTO_HEX_FALLBACK) {
		return proto_names[0];
	}
	return proto_names[proto];
}

/*
 * Main entry point: parse binary response into banner string.
 */
banner_proto_t parse_binary_banner(const uint8_t *buf, size_t len,
                                   char *out, size_t out_len) {
	banner_proto_t proto;
	int ret = 0;

	if (buf == NULL || len == 0 || out == NULL || out_len == 0) {
		return BANNER_PROTO_UNKNOWN;
	}

	out[0] = '\0';

	proto = detect_banner_protocol(buf, len);

	switch (proto) {
	case BANNER_PROTO_DNS:
		ret = parse_dns_response(buf, len, out, out_len);
		break;
	case BANNER_PROTO_TLS:
		ret = parse_tls_response(buf, len, out, out_len);
		break;
	case BANNER_PROTO_RPC:
		ret = parse_rpc_response(buf, len, out, out_len);
		break;
	default:
		break;
	}

	/* Fallback to hex if parser failed or unknown protocol */
	if (ret <= 0 || out[0] == '\0') {
		format_hex_fallback(buf, len, out, out_len);
		return BANNER_PROTO_HEX_FALLBACK;
	}

	return proto;
}

/*
 * DNS RCODE names (RFC 1035 + updates)
 */
static const char *dns_rcode_str[] = {
	"NOERROR",   /* 0 */
	"FORMERR",   /* 1 */
	"SERVFAIL",  /* 2 */
	"NXDOMAIN",  /* 3 */
	"NOTIMP",    /* 4 */
	"REFUSED",   /* 5 */
	"YXDOMAIN",  /* 6 */
	"YXRRSET",   /* 7 */
	"NXRRSET",   /* 8 */
	"NOTAUTH",   /* 9 */
	"NOTZONE",   /* 10 */
};
#define DNS_RCODE_MAX	10

/*
 * DNS record type names (common ones)
 */
static const char *dns_type_name(uint16_t qtype) {
	switch (qtype) {
	case 1:   return "A";
	case 2:   return "NS";
	case 5:   return "CNAME";
	case 6:   return "SOA";
	case 12:  return "PTR";
	case 15:  return "MX";
	case 16:  return "TXT";
	case 28:  return "AAAA";
	case 33:  return "SRV";
	case 255: return "ANY";
	default:  return NULL;
	}
}

/*
 * Parse DNS domain name from wire format.
 * Handles labels and compression pointers.
 * Returns number of bytes consumed from buf, or 0 on error.
 */
static size_t parse_dns_name(const uint8_t *pkt, size_t pkt_len,
                             size_t offset, char *name, size_t name_len) {
	size_t start_offset = offset;
	size_t name_pos = 0;
	size_t jumps = 0;
	size_t consumed = 0;
	int first_label = 1;

	while (offset < pkt_len && jumps < 16) {
		uint8_t label_len = pkt[offset];

		if (label_len == 0) {
			/* End of name */
			if (consumed == 0) {
				consumed = offset - start_offset + 1;
			}
			break;
		}

		if ((label_len & 0xc0) == 0xc0) {
			/* Compression pointer */
			if (offset + 1 >= pkt_len) {
				return 0;
			}
			if (consumed == 0) {
				consumed = offset - start_offset + 2;
			}
			offset = ((label_len & 0x3f) << 8) | pkt[offset + 1];
			jumps++;
			continue;
		}

		if (label_len > 63 || offset + 1 + label_len > pkt_len) {
			return 0;
		}

		/* Add dot separator (except before first label) */
		if (!first_label && name_pos < name_len - 1) {
			name[name_pos++] = '.';
		}
		first_label = 0;

		/* Copy label characters */
		for (size_t i = 0; i < label_len && name_pos < name_len - 1; i++) {
			char c = (char)pkt[offset + 1 + i];
			name[name_pos++] = isprint(c) ? c : '?';
		}

		offset += 1 + label_len;
	}

	name[name_pos] = '\0';
	return consumed > 0 ? consumed : offset - start_offset;
}

/*
 * DNS response parser.
 * Format: "DNS: RCODE q=name [type]" or "DNS: RCODE q=name ans=value"
 */
static int parse_dns_response(const uint8_t *buf, size_t len,
                              char *out, size_t out_len) {
	uint16_t tcp_len, flags, qdcount, ancount;
	uint8_t rcode;
	const uint8_t *dns;
	size_t dns_len, pos;
	char qname[128];
	uint16_t qtype;
	const char *rcode_name;
	const char *type_name;
	int written;

	if (len < 14) {
		return 0;
	}

	/* Parse TCP length prefix */
	tcp_len = ((uint16_t)buf[0] << 8) | buf[1];
	if (tcp_len < 12 || tcp_len > len - 2) {
		return 0;
	}

	dns = buf + 2;
	dns_len = tcp_len;

	/* Parse header */
	flags = ((uint16_t)dns[2] << 8) | dns[3];
	rcode = flags & 0x0f;
	qdcount = ((uint16_t)dns[4] << 8) | dns[5];
	ancount = ((uint16_t)dns[6] << 8) | dns[7];

	/* Get RCODE name */
	rcode_name = (rcode <= DNS_RCODE_MAX) ? dns_rcode_str[rcode] : "UNKNOWN";

	/* Parse first question if present */
	qname[0] = '\0';
	qtype = 0;
	if (qdcount > 0 && dns_len > 12) {
		pos = parse_dns_name(dns, dns_len, 12, qname, sizeof(qname));
		if (pos > 0 && 12 + pos + 4 <= dns_len) {
			qtype = ((uint16_t)dns[12 + pos] << 8) | dns[12 + pos + 1];
		}
	}

	/* Format output */
	type_name = dns_type_name(qtype);
	if (qname[0] && type_name) {
		written = snprintf(out, out_len, "DNS: %s q=%s %s",
		                   rcode_name, qname, type_name);
	} else if (qname[0]) {
		written = snprintf(out, out_len, "DNS: %s q=%s",
		                   rcode_name, qname);
	} else {
		written = snprintf(out, out_len, "DNS: %s qd=%u an=%u",
		                   rcode_name, qdcount, ancount);
	}

	(void)ancount; /* May use later for answer parsing */

	return (written > 0 && (size_t)written < out_len) ? written : 0;
}

/*
 * ASN.1 DER tag definitions
 */
#define ASN1_SEQUENCE		0x30
#define ASN1_SET		0x31
#define ASN1_INTEGER		0x02
#define ASN1_BITSTRING		0x03
#define ASN1_OCTETSTRING	0x04
#define ASN1_NULL		0x05
#define ASN1_OID		0x06
#define ASN1_UTF8STRING		0x0C
#define ASN1_PRINTSTRING	0x13
#define ASN1_T61STRING		0x14
#define ASN1_IA5STRING		0x16
#define ASN1_UTCTIME		0x17
#define ASN1_GENTIME		0x18
#define ASN1_CONTEXT_0		0xA0
#define ASN1_CONTEXT_3		0xA3

/*
 * Common OIDs for X.509 certificates (DER encoded)
 */
/* CN: 2.5.4.3 -> 55 04 03 */
static const uint8_t OID_CN[] = { 0x55, 0x04, 0x03 };
/* O: 2.5.4.10 -> 55 04 0A */
static const uint8_t OID_O[] = { 0x55, 0x04, 0x0A };
/* SAN: 2.5.29.17 -> 55 1D 11 */
static const uint8_t OID_SAN[] = { 0x55, 0x1D, 0x11 };

/*
 * Read ASN.1 DER length field.
 * Returns the length value and advances *pos past the length field.
 * Returns 0 on error (sets *pos to end).
 */
static size_t asn1_read_length(const uint8_t *buf, size_t buf_len, size_t *pos) {
	size_t p = *pos;
	size_t length;

	if (p >= buf_len) {
		*pos = buf_len;
		return 0;
	}

	if (buf[p] < 0x80) {
		/* Short form: length in single byte */
		length = buf[p];
		*pos = p + 1;
		return length;
	}

	if (buf[p] == 0x80) {
		/* Indefinite length - not valid in DER */
		*pos = buf_len;
		return 0;
	}

	/* Long form: first byte is 0x80 | num_octets */
	size_t num_octets = buf[p] & 0x7f;
	p++;

	if (num_octets > 4 || p + num_octets > buf_len) {
		*pos = buf_len;
		return 0;
	}

	length = 0;
	for (size_t i = 0; i < num_octets; i++) {
		length = (length << 8) | buf[p + i];
	}

	*pos = p + num_octets;
	return length;
}

/*
 * Read ASN.1 element at position.
 * Returns tag, sets *content_pos to start of content, *content_len to length.
 * Advances *pos past the entire element.
 * Returns 0 on error.
 */
static uint8_t asn1_read_element(const uint8_t *buf, size_t buf_len, size_t *pos,
                                 size_t *content_pos, size_t *content_len) {
	size_t p = *pos;
	uint8_t tag;
	size_t length;

	if (p >= buf_len) {
		return 0;
	}

	tag = buf[p];
	p++;

	length = asn1_read_length(buf, buf_len, &p);
	if (p + length > buf_len) {
		*pos = buf_len;
		return 0;
	}

	*content_pos = p;
	*content_len = length;
	*pos = p + length;

	return tag;
}

/*
 * Check if content matches an OID.
 */
static int asn1_match_oid(const uint8_t *content, size_t content_len,
                          const uint8_t *oid, size_t oid_len) {
	if (content_len != oid_len) {
		return 0;
	}
	return memcmp(content, oid, oid_len) == 0;
}

/*
 * Extract string content from ASN.1 string types.
 * Handles UTF8String, PrintableString, IA5String, T61String.
 * Copies up to max_len-1 characters to out, null-terminates.
 * Returns number of characters copied.
 */
static size_t asn1_extract_string(const uint8_t *content, size_t content_len,
                                  char *out, size_t max_len) {
	size_t copy_len = content_len;
	if (copy_len > max_len - 1) {
		copy_len = max_len - 1;
	}

	for (size_t i = 0; i < copy_len; i++) {
		uint8_t c = content[i];
		out[i] = (c >= 0x20 && c < 0x7f) ? (char)c : '?';
	}
	out[copy_len] = '\0';

	return copy_len;
}

/*
 * Find CN (Common Name) in X.509 certificate Subject or Issuer field.
 * The name_seq points to the start of a Name SEQUENCE.
 * Returns 1 if found (copies to out), 0 if not found.
 */
static int asn1_find_cn(const uint8_t *name_seq, size_t name_len,
                        char *out, size_t max_len) {
	size_t pos = 0;
	size_t content_pos, content_len;
	uint8_t tag;

	/* Name is SEQUENCE of RelativeDistinguishedName SETs */
	while (pos < name_len) {
		size_t set_start = pos;
		tag = asn1_read_element(name_seq, name_len, &pos, &content_pos, &content_len);
		if (tag != ASN1_SET) {
			continue;
		}

		/* RDN SET contains one or more AttributeTypeAndValue SEQUENCEs */
		size_t set_pos = content_pos;
		size_t set_end = content_pos + content_len;

		while (set_pos < set_end) {
			size_t seq_content_pos, seq_content_len;
			tag = asn1_read_element(name_seq, name_len, &set_pos,
			                        &seq_content_pos, &seq_content_len);
			if (tag != ASN1_SEQUENCE) {
				continue;
			}

			/* AttributeTypeAndValue: OID + value */
			size_t attr_pos = seq_content_pos;
			size_t oid_content_pos, oid_content_len;
			tag = asn1_read_element(name_seq, name_len, &attr_pos,
			                        &oid_content_pos, &oid_content_len);
			if (tag != ASN1_OID) {
				continue;
			}

			/* Check if this is CN OID */
			if (asn1_match_oid(name_seq + oid_content_pos, oid_content_len,
			                   OID_CN, sizeof(OID_CN))) {
				/* Next element is the value */
				size_t val_content_pos, val_content_len;
				tag = asn1_read_element(name_seq, name_len, &attr_pos,
				                        &val_content_pos, &val_content_len);
				if (tag == ASN1_UTF8STRING || tag == ASN1_PRINTSTRING ||
				    tag == ASN1_IA5STRING || tag == ASN1_T61STRING) {
					asn1_extract_string(name_seq + val_content_pos,
					                    val_content_len, out, max_len);
					return 1;
				}
			}
		}
		(void)set_start;
	}

	return 0;
}

/*
 * TLS handshake types
 */
#define TLS_HS_SERVER_HELLO	0x02
#define TLS_HS_CERTIFICATE	0x0b

/*
 * Common TLS cipher suite names (abbreviated)
 */
static const char *tls_cipher_name(uint16_t cipher) {
	switch (cipher) {
	case 0x1301: return "AES_128_GCM_SHA256";
	case 0x1302: return "AES_256_GCM_SHA384";
	case 0x1303: return "CHACHA20_POLY1305_SHA256";
	case 0xc02f: return "ECDHE_RSA_AES128_GCM";
	case 0xc030: return "ECDHE_RSA_AES256_GCM";
	case 0xc02b: return "ECDHE_ECDSA_AES128_GCM";
	case 0xc02c: return "ECDHE_ECDSA_AES256_GCM";
	case 0x002f: return "RSA_AES128_SHA";
	case 0x0035: return "RSA_AES256_SHA";
	default: return NULL;
	}
}

/*
 * TLS version string
 */
static const char *tls_version_name(uint16_t version) {
	switch (version) {
	case 0x0300: return "SSL3.0";
	case 0x0301: return "TLS1.0";
	case 0x0302: return "TLS1.1";
	case 0x0303: return "TLS1.2";
	case 0x0304: return "TLS1.3";
	default: return NULL;
	}
}

/*
 * Find Certificate message in TLS record(s) and extract CN.
 * Searches through handshake messages for Certificate (0x0b).
 */
static int tls_find_cert_cn(const uint8_t *buf, size_t len, char *cn, size_t cn_len) {
	size_t pos = 0;

	/* Iterate through TLS records */
	while (pos + 5 < len) {
		uint8_t content_type = buf[pos];
		uint16_t record_len = ((uint16_t)buf[pos + 3] << 8) | buf[pos + 4];

		if (content_type != 0x16) {
			/* Not handshake, skip */
			pos += 5 + record_len;
			continue;
		}

		if (pos + 5 + record_len > len) {
			break;
		}

		/* Parse handshake messages in this record */
		size_t hs_pos = pos + 5;
		size_t hs_end = hs_pos + record_len;

		while (hs_pos + 4 < hs_end) {
			uint8_t hs_type = buf[hs_pos];
			uint32_t hs_len = ((uint32_t)buf[hs_pos + 1] << 16) |
			                  ((uint32_t)buf[hs_pos + 2] << 8) |
			                  (uint32_t)buf[hs_pos + 3];

			if (hs_pos + 4 + hs_len > hs_end) {
				break;
			}

			if (hs_type == TLS_HS_CERTIFICATE) {
				/* Certificate message found */
				const uint8_t *cert_msg = buf + hs_pos + 4;
				size_t cert_msg_len = hs_len;

				if (cert_msg_len < 3) {
					goto next_hs;
				}

				/* Certificates length (3 bytes) */
				uint32_t certs_len = ((uint32_t)cert_msg[0] << 16) |
				                     ((uint32_t)cert_msg[1] << 8) |
				                     (uint32_t)cert_msg[2];

				if (certs_len + 3 > cert_msg_len || certs_len < 3) {
					goto next_hs;
				}

				/* First certificate length (3 bytes) */
				const uint8_t *first_cert_ptr = cert_msg + 3;
				uint32_t first_cert_len = ((uint32_t)first_cert_ptr[0] << 16) |
				                          ((uint32_t)first_cert_ptr[1] << 8) |
				                          (uint32_t)first_cert_ptr[2];

				if (first_cert_len + 6 > cert_msg_len) {
					goto next_hs;
				}

				/* Parse X.509 certificate to find Subject CN */
				const uint8_t *cert = first_cert_ptr + 3;
				size_t cert_len = first_cert_len;

				/* Certificate is SEQUENCE { tbsCertificate, signatureAlgorithm, signature } */
				size_t cert_pos = 0;
				size_t tbs_content_pos, tbs_content_len;
				uint8_t tag = asn1_read_element(cert, cert_len, &cert_pos,
				                                &tbs_content_pos, &tbs_content_len);
				if (tag != ASN1_SEQUENCE) {
					goto next_hs;
				}

				/* Reset to parse inside the outer SEQUENCE */
				cert_pos = tbs_content_pos;
				tag = asn1_read_element(cert, tbs_content_pos + tbs_content_len, &cert_pos,
				                        &tbs_content_pos, &tbs_content_len);
				if (tag != ASN1_SEQUENCE) {
					goto next_hs;
				}

				/* tbsCertificate: version, serialNumber, signature, issuer, validity, subject, ... */
				const uint8_t *tbs = cert + tbs_content_pos;
				size_t tbs_len = tbs_content_len;
				size_t tbs_pos = 0;
				size_t elem_content_pos, elem_content_len;
				int field_num = 0;

				/*
				 * TBSCertificate fields (after optional version):
				 * 0: serialNumber
				 * 1: signature
				 * 2: issuer
				 * 3: validity
				 * 4: subject <- we want this
				 * 5: subjectPublicKeyInfo
				 */
				while (tbs_pos < tbs_len && field_num < 6) {
					tag = asn1_read_element(tbs, tbs_len, &tbs_pos,
					                        &elem_content_pos, &elem_content_len);
					if (tag == 0) {
						break;
					}

					/* version is optional, tagged [0] - skip without incrementing */
					if (tag == ASN1_CONTEXT_0 && field_num == 0) {
						continue;
					}

					if (field_num == 4) {
						/* This is subject - it's a Name (SEQUENCE of RDNs) */
						if (asn1_find_cn(tbs + elem_content_pos, elem_content_len,
						                 cn, cn_len)) {
							return 1;
						}
					}

					field_num++;
				}
			}

next_hs:
			hs_pos += 4 + hs_len;
		}

		pos += 5 + record_len;
	}

	return 0;
}

/*
 * TLS response parser.
 * Format: "TLS: v1.X cipher=NAME CN=common_name"
 */
static int parse_tls_response(const uint8_t *buf, size_t len,
                              char *out, size_t out_len) {
	uint16_t version = 0;
	uint16_t cipher = 0;
	char cn[128];
	const char *version_name;
	const char *cipher_name;
	int written;

	cn[0] = '\0';

	if (len < 5 || buf[0] != TLS_CONTENT_HANDSHAKE) {
		return 0;
	}

	/* Parse first record */
	uint16_t record_len = ((uint16_t)buf[3] << 8) | buf[4];
	if ((size_t)(5 + record_len) > len) {
		return 0;
	}

	/* Check for ServerHello handshake */
	if (record_len < 4 || buf[5] != TLS_HS_SERVER_HELLO) {
		return 0;
	}

	/* Parse ServerHello */
	uint32_t hs_len = ((uint32_t)buf[6] << 16) |
	                  ((uint32_t)buf[7] << 8) |
	                  (uint32_t)buf[8];

	if (hs_len < 38 || 9 + hs_len > len) {
		return 0;
	}

	/* ServerHello: version (2) + random (32) + session_id_len (1) + session_id + cipher (2) + ... */
	version = ((uint16_t)buf[9] << 8) | buf[10];

	/* Skip random (32 bytes) */
	size_t sh_pos = 9 + 2 + 32;

	/* Session ID length */
	uint8_t session_id_len = buf[sh_pos];
	sh_pos += 1 + session_id_len;

	if (sh_pos + 2 > 9 + hs_len) {
		return 0;
	}

	/* Cipher suite */
	cipher = ((uint16_t)buf[sh_pos] << 8) | buf[sh_pos + 1];

	/* Try to find certificate CN */
	tls_find_cert_cn(buf, len, cn, sizeof(cn));

	/* Format output */
	version_name = tls_version_name(version);
	cipher_name = tls_cipher_name(cipher);

	if (cn[0] && cipher_name && version_name) {
		written = snprintf(out, out_len, "TLS: %s %s CN=%s",
		                   version_name, cipher_name, cn);
	} else if (cn[0] && version_name) {
		written = snprintf(out, out_len, "TLS: %s cipher=0x%04x CN=%s",
		                   version_name, cipher, cn);
	} else if (cipher_name && version_name) {
		written = snprintf(out, out_len, "TLS: %s %s",
		                   version_name, cipher_name);
	} else if (version_name) {
		written = snprintf(out, out_len, "TLS: %s cipher=0x%04x",
		                   version_name, cipher);
	} else {
		written = snprintf(out, out_len, "TLS: v=0x%04x cipher=0x%04x",
		                   version, cipher);
	}

	return (written > 0 && (size_t)written < out_len) ? written : 0;
}

/*
 * RPC reply status names
 */
static const char *rpc_reply_stat_str[] = {
	"MSG_ACCEPTED",  /* 0 */
	"MSG_DENIED"     /* 1 */
};

/*
 * RPC accept status names
 */
static const char *rpc_accept_str[] = {
	"SUCCESS",       /* 0 */
	"PROG_UNAVAIL",  /* 1 */
	"PROG_MISMATCH", /* 2 */
	"PROC_UNAVAIL",  /* 3 */
	"GARBAGE_ARGS",  /* 4 */
	"SYSTEM_ERR"     /* 5 */
};
#define RPC_ACCEPT_MAX 5

/*
 * RPC reject status names
 */
static const char *rpc_reject_str[] = {
	"RPC_MISMATCH",  /* 0 */
	"AUTH_ERROR"     /* 1 */
};
#define RPC_REJECT_MAX 1

/*
 * RPC auth flavor names
 */
static const char *rpc_auth_str[] = {
	"AUTH_NULL",     /* 0 */
	"AUTH_UNIX",     /* 1 */
	"AUTH_SHORT",    /* 2 */
	"AUTH_DES"       /* 3 */
};
#define RPC_AUTH_MAX 3

/*
 * RPC response parser.
 * Format: "RPC: STATUS [auth=FLAVOR]" or "RPC: DENIED reason"
 */
static int parse_rpc_response(const uint8_t *buf, size_t len,
                              char *out, size_t out_len) {
	uint32_t rm_header, xid, msg_type, reply_stat;
	uint32_t verifier_flavor, verifier_len;
	uint32_t accept_stat, reject_stat;
	const char *status_name;
	const char *auth_name;
	int written;
	size_t pos;

	/* Minimum RPC reply: RM(4) + XID(4) + msg_type(4) + reply_stat(4) = 16 bytes */
	if (len < 16) {
		return 0;
	}

	/* Parse Record Marking header */
	rm_header = ((uint32_t)buf[0] << 24) | ((uint32_t)buf[1] << 16) |
	            ((uint32_t)buf[2] << 8) | (uint32_t)buf[3];

	/* Verify last fragment bit and reasonable length */
	if (!(rm_header & RPC_RM_LAST_FRAG)) {
		return 0;
	}
	uint32_t frag_len = rm_header & 0x7fffffff;
	if (frag_len + 4 > len || frag_len < 12) {
		return 0;
	}

	/* Parse RPC header */
	xid = ((uint32_t)buf[4] << 24) | ((uint32_t)buf[5] << 16) |
	      ((uint32_t)buf[6] << 8) | (uint32_t)buf[7];
	msg_type = ((uint32_t)buf[8] << 24) | ((uint32_t)buf[9] << 16) |
	           ((uint32_t)buf[10] << 8) | (uint32_t)buf[11];
	reply_stat = ((uint32_t)buf[12] << 24) | ((uint32_t)buf[13] << 16) |
	             ((uint32_t)buf[14] << 8) | (uint32_t)buf[15];

	/* Verify it's a reply */
	if (msg_type != RPC_MSG_TYPE_REPLY) {
		return 0;
	}

	(void)xid; /* Could be used for correlation */

	if (reply_stat == 0) {
		/* MSG_ACCEPTED */
		if (len < 24) {
			/* Truncated, just show accepted */
			written = snprintf(out, out_len, "RPC: ACCEPTED");
			return (written > 0 && (size_t)written < out_len) ? written : 0;
		}

		verifier_flavor = ((uint32_t)buf[16] << 24) | ((uint32_t)buf[17] << 16) |
		                  ((uint32_t)buf[18] << 8) | (uint32_t)buf[19];
		verifier_len = ((uint32_t)buf[20] << 24) | ((uint32_t)buf[21] << 16) |
		               ((uint32_t)buf[22] << 8) | (uint32_t)buf[23];

		pos = 24 + verifier_len;
		if (pos + 4 > len) {
			/* Can't read accept_stat, show what we have */
			auth_name = (verifier_flavor <= RPC_AUTH_MAX) ?
			            rpc_auth_str[verifier_flavor] : "AUTH_UNKNOWN";
			written = snprintf(out, out_len, "RPC: ACCEPTED auth=%s",
			                   auth_name);
			return (written > 0 && (size_t)written < out_len) ? written : 0;
		}

		accept_stat = ((uint32_t)buf[pos] << 24) | ((uint32_t)buf[pos + 1] << 16) |
		              ((uint32_t)buf[pos + 2] << 8) | (uint32_t)buf[pos + 3];

		status_name = (accept_stat <= RPC_ACCEPT_MAX) ?
		              rpc_accept_str[accept_stat] : "UNKNOWN";
		auth_name = (verifier_flavor <= RPC_AUTH_MAX) ?
		            rpc_auth_str[verifier_flavor] : "AUTH_UNKNOWN";

		if (verifier_flavor == 0 && accept_stat == 0) {
			/* Simple success with null auth */
			written = snprintf(out, out_len, "RPC: SUCCESS");
		} else if (accept_stat == 0) {
			/* Success with non-null auth */
			written = snprintf(out, out_len, "RPC: SUCCESS auth=%s", auth_name);
		} else {
			/* Error status */
			written = snprintf(out, out_len, "RPC: %s", status_name);
		}
	} else if (reply_stat == 1) {
		/* MSG_DENIED */
		if (len < 20) {
			written = snprintf(out, out_len, "RPC: DENIED");
			return (written > 0 && (size_t)written < out_len) ? written : 0;
		}

		reject_stat = ((uint32_t)buf[16] << 24) | ((uint32_t)buf[17] << 16) |
		              ((uint32_t)buf[18] << 8) | (uint32_t)buf[19];

		status_name = (reject_stat <= RPC_REJECT_MAX) ?
		              rpc_reject_str[reject_stat] : "UNKNOWN";
		written = snprintf(out, out_len, "RPC: DENIED %s", status_name);
	} else {
		/* Unknown reply status */
		written = snprintf(out, out_len, "RPC: reply_stat=%u", reply_stat);
	}

	return (written > 0 && (size_t)written < out_len) ? written : 0;
}

/*
 * Hex fallback: format first N bytes as hex string.
 */
static int format_hex_fallback(const uint8_t *buf, size_t len,
                               char *out, size_t out_len) {
	static const char hex_chars[] = "0123456789abcdef";
	size_t i, max_bytes, pos;

	if (out_len < 8) {
		return -1;
	}

	/* Reserve space for "HEX: " prefix and null terminator */
	memcpy(out, "HEX: ", 5);
	pos = 5;

	/* Calculate max bytes we can display (2 hex chars + space per byte) */
	max_bytes = (out_len - pos - 1) / 3;
	if (max_bytes > len) {
		max_bytes = len;
	}
	if (max_bytes > 32) {
		max_bytes = 32;
	}

	for (i = 0; i < max_bytes; i++) {
		out[pos++] = hex_chars[(buf[i] >> 4) & 0x0f];
		out[pos++] = hex_chars[buf[i] & 0x0f];
		if (i < max_bytes - 1) {
			out[pos++] = ' ';
		}
	}

	out[pos] = '\0';
	return (int)pos;
}
