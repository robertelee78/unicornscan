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
 * TLS 1.2/1.3 ClientHello default payload module
 *
 * Registered as a default TCP payload (dport=-1) for probing TLS services
 * on non-standard ports. Used when no port-specific payload exists.
 *
 * See tls_common.h for TLS constants and create_payload implementation.
 * See tls.c for the port-443-specific variant.
 */
#include "tls_common.h"

int create_payload(uint8_t **, uint32_t *, void *);
int init_module(mod_entry_t *);
void delete_module(void);

int init_module(mod_entry_t *m) {
	snprintf(m->license, sizeof(m->license) - 1, "GPLv2");
	snprintf(m->author, sizeof(m->author) - 1, "unicornscan-modernization");
	snprintf(m->desc, sizeof(m->desc) - 1, "TLS 1.2/1.3 ClientHello (default)");
	m->iver=0x0103;
	m->type=MI_TYPE_PAYLOAD;

	m->param_u.payload_s.sport=-1;
	m->param_u.payload_s.dport=-1;	/* Default payload for all TCP ports */
	m->param_u.payload_s.proto=IPPROTO_TCP;
	m->param_u.payload_s.payload_group=1;

	return 1;
}

void delete_module(void) {
	return;
}

int create_payload(uint8_t **data, uint32_t *dlen, void *i) {
	return tls_create_payload(data, dlen, i);
}
