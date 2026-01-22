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
 * STUN Binding Request Payload Module
 *
 * Generates STUN Binding Request packets with random transaction IDs
 * for discovering STUN/TURN servers used in VoIP and WebRTC NAT traversal.
 *
 * RFC 5389 - Session Traversal Utilities for NAT (STUN)
 */

#include <config.h>

#include <scan_progs/scanopts.h>
#include <scan_progs/scan_export.h>
#include <settings.h>

#include <unilib/prng.h>
#include <unilib/xmalloc.h>
#include <unilib/output.h>
#include <unilib/modules.h>

/* STUN message header (RFC 5389) */
typedef struct _PACKED_ stun_header {
	uint16_t msg_type;        /* Message type (Binding Request = 0x0001) */
	uint16_t msg_length;      /* Message length (excluding 20-byte header) */
	uint32_t magic_cookie;    /* Magic cookie = 0x2112A442 */
	uint8_t  transaction_id[12]; /* 96-bit transaction ID */
} stun_header_t;

#define STUN_BINDING_REQUEST  0x0001
#define STUN_MAGIC_COOKIE     0x2112A442

int create_payload(uint8_t **, uint32_t *, void *);
int init_module(mod_entry_t *);
void delete_module(void);
static mod_entry_t *_m = NULL;
static const settings_t *s = NULL;

int init_module(mod_entry_t *m) {
	snprintf(m->license, sizeof(m->license) - 1, "GPLv2");
	snprintf(m->author, sizeof(m->author) - 1, "unicornscan-modernization");
	snprintf(m->desc, sizeof(m->desc) - 1, "STUN Binding Request (RFC 5389)");
	m->iver = 0x0103;
	m->type = MI_TYPE_PAYLOAD;

	m->param_u.payload_s.sport = -1;   /* Random source port */
	m->param_u.payload_s.dport = 3478; /* Standard STUN port */
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
	stun_header_t *hdr;
	uint32_t rand_vals[3];

	*dlen = sizeof(stun_header_t);
	*data = (uint8_t *)xmalloc(*dlen);
	memset(*data, 0, *dlen);
	hdr = (stun_header_t *)*data;

	/* Build STUN Binding Request (RFC 5389) */
	hdr->msg_type = htons(STUN_BINDING_REQUEST);
	hdr->msg_length = htons(0);  /* No attributes for basic binding request */
	hdr->magic_cookie = htonl(STUN_MAGIC_COOKIE);

	/* Generate random 96-bit transaction ID */
	rand_vals[0] = prng_get32();
	rand_vals[1] = prng_get32();
	rand_vals[2] = prng_get32();
	memcpy(hdr->transaction_id, rand_vals, 12);

	return 1;
}
