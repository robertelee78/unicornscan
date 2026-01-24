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
#include <config.h>

#include <scan_progs/scanopts.h>
#include <scan_progs/scan_export.h>
#include <settings.h>

#include <unilib/xmalloc.h>
#include <unilib/output.h>
#include <unilib/modules.h>

#include <arpa/inet.h>

int create_payload(uint8_t **, uint32_t *, void *);
int init_module(mod_entry_t *);
void delete_module(void);

static mod_entry_t *_m=NULL;
static const settings_t *s=NULL;

int init_module(mod_entry_t *m) {
	snprintf(m->license, sizeof(m->license) -1, "GPLv2");
	snprintf(m->author, sizeof(m->author) -1, "rlee");
	snprintf(m->desc, sizeof(m->desc) -1, "WebSocket upgrade request");
	m->iver=0x0103;
	m->type=MI_TYPE_PAYLOAD;

	m->param_u.payload_s.sport=-1;
	m->param_u.payload_s.dport=4444;
	m->param_u.payload_s.proto=IPPROTO_TCP;
	m->param_u.payload_s.payload_group=1;

	_m=m;
	s=_m->s;
	return 1;
}

void delete_module(void) {
	return;
}

/*
 * WebSocket upgrade request with dynamic Host header.
 * The Sec-WebSocket-Key is a fixed base64 value (acceptable for probing).
 */
#define REQUEST "GET / HTTP/1.1\r\n" \
		"Host: %s:%u\r\n" \
		"Upgrade: websocket\r\n" \
		"Connection: Upgrade\r\n" \
		"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" \
		"Sec-WebSocket-Version: 13\r\n\r\n"

int create_payload(uint8_t **data, uint32_t *dlen, void *i) {
	union {
		void *p;
		ip_report_t *ir;
	} i_u;
	char request[512];
	char host_addr[INET_ADDRSTRLEN];
	struct in_addr ia;

	i_u.p=i;

	assert(i != NULL && i_u.ir->magic == IP_REPORT_MAGIC);

	ia.s_addr=i_u.ir->host_addr;
	inet_ntop(AF_INET, &ia, host_addr, sizeof(host_addr));
	snprintf(request, sizeof(request) -1, REQUEST, host_addr, (unsigned int)i_u.ir->dport);

	*dlen=(uint32_t)strlen(request);
	*data=(uint8_t *)xstrdup(request);

	return 1;
}
