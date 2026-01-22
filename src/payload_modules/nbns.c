/**********************************************************************
 * Copyright (C) 2004-2006 (Jack Louis) <jack@rapturesecurity.org>    *
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
 * NetBIOS Name Service (NBNS) Payload Module
 *
 * Generates NBNS wildcard queries with random transaction IDs for
 * discovering Windows hosts and their NetBIOS names on the network.
 *
 * RFC 1002 - NetBIOS Name Service
 */

#include <config.h>

#include <scan_progs/scanopts.h>
#include <scan_progs/scan_export.h>
#include <settings.h>

#include <unilib/prng.h>
#include <unilib/xmalloc.h>
#include <unilib/output.h>
#include <unilib/modules.h>

/* NBNS header structure */
typedef struct _PACKED_ nbns_header {
	uint16_t trans_id;        /* Transaction ID */
	uint16_t flags;           /* Flags and opcodes */
	uint16_t qdcount;         /* Questions count */
	uint16_t ancount;         /* Answer count */
	uint16_t nscount;         /* Authority count */
	uint16_t arcount;         /* Additional count */
} nbns_header_t;

/* NBNS NBSTAT query for wildcard "*" name */
/* The encoded name is 32 bytes of "CKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" */
/* followed by null terminator, then NBSTAT type (0x0021) and IN class (0x0001) */

#define NBNS_QUERY_FLAGS  0x0000  /* Standard query, no recursion */
#define NBNS_TYPE_NBSTAT  0x0021  /* NBSTAT query type */
#define NBNS_CLASS_IN     0x0001  /* Internet class */

int create_payload(uint8_t **, uint32_t *, void *);
int init_module(mod_entry_t *);
void delete_module(void);
static mod_entry_t *_m = NULL;
static const settings_t *s = NULL;

int init_module(mod_entry_t *m) {
	snprintf(m->license, sizeof(m->license) - 1, "GPLv2");
	snprintf(m->author, sizeof(m->author) - 1, "unicornscan-modernization");
	snprintf(m->desc, sizeof(m->desc) - 1, "NBNS wildcard query (NBSTAT)");
	m->iver = 0x0103;
	m->type = MI_TYPE_PAYLOAD;

	m->param_u.payload_s.sport = 137;  /* NBNS client port */
	m->param_u.payload_s.dport = 137;  /* NBNS server port */
	m->param_u.payload_s.proto = IPPROTO_UDP;
	m->param_u.payload_s.payload_group = 1;

	_m = m;
	s = _m->s;

	return 1;
}

void delete_module(void) {
	return;
}

int create_payload(uint8_t **data, uint32_t *dlen, void *ir) {
	nbns_header_t *hdr;
	uint8_t *query;
	size_t total_len;

	/*
	 * NBSTAT query structure:
	 * - 12 bytes header
	 * - 1 byte name length (0x20 = 32)
	 * - 32 bytes encoded name (wildcard "*" = "CKAAAAAA...")
	 * - 1 byte null terminator
	 * - 2 bytes type (NBSTAT = 0x0021)
	 * - 2 bytes class (IN = 0x0001)
	 * Total: 50 bytes
	 */
	total_len = sizeof(nbns_header_t) + 1 + 32 + 1 + 2 + 2;

	*data = (uint8_t *)xmalloc(total_len);
	memset(*data, 0, total_len);
	*dlen = total_len;

	hdr = (nbns_header_t *)*data;

	/* Build NBNS header */
	hdr->trans_id = (uint16_t)(prng_get32() & 0xFFFF);
	hdr->flags = htons(NBNS_QUERY_FLAGS);
	hdr->qdcount = htons(1);  /* One question */
	hdr->ancount = 0;
	hdr->nscount = 0;
	hdr->arcount = 0;

	/* Build query section */
	query = *data + sizeof(nbns_header_t);

	/* Name length prefix */
	query[0] = 0x20;  /* 32 bytes of encoded name */

	/* Encoded wildcard name "*" = "CKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	 * NetBIOS name encoding: each byte becomes two characters
	 * '*' (0x2A) + 15 spaces (0x20) padded = first-level encoding
	 * Then each nibble is added to 'A' (0x41)
	 * '*' = 0x2A -> 'C' (0x41+2=0x43) 'K' (0x41+10=0x4B)
	 * ' ' = 0x20 -> 'C' (0x41+2=0x43) 'A' (0x41+0=0x41)
	 * The 16th byte is the name type (0x00 for workstation)
	 * 0x00 -> 'A' 'A'
	 */
	query[1] = 'C'; query[2] = 'K';   /* '*' first nibble=2, second=10 */
	/* Fill with "CA" for space padding (0x20 -> nibbles 2,0) */
	query[3] = 'C'; query[4] = 'A';
	query[5] = 'C'; query[6] = 'A';
	query[7] = 'C'; query[8] = 'A';
	query[9] = 'C'; query[10] = 'A';
	query[11] = 'C'; query[12] = 'A';
	query[13] = 'C'; query[14] = 'A';
	query[15] = 'C'; query[16] = 'A';
	query[17] = 'C'; query[18] = 'A';
	query[19] = 'C'; query[20] = 'A';
	query[21] = 'C'; query[22] = 'A';
	query[23] = 'C'; query[24] = 'A';
	query[25] = 'C'; query[26] = 'A';
	query[27] = 'C'; query[28] = 'A';
	query[29] = 'C'; query[30] = 'A';
	query[31] = 'A'; query[32] = 'A';  /* Name type 0x00 */

	/* Null terminator */
	query[33] = 0x00;

	/* Query type: NBSTAT (0x0021) */
	query[34] = 0x00;
	query[35] = 0x21;

	/* Query class: IN (0x0001) */
	query[36] = 0x00;
	query[37] = 0x01;

	return 1;
}
