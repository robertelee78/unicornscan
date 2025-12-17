/**********************************************************************
 * Copyright (C) 2004-2006 (Jack Louis) <jack@rapturesecurity.org>    *
 * Copyright (C) 2025 Unicornscan Modernization Project               *
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
 * DHCP Discover Payload Module
 *
 * Generates DHCP DISCOVER packets with random transaction IDs for
 * discovering DHCP servers on the network. This is a non-invasive
 * discovery probe that requests network configuration information.
 *
 * RFC 2131 - Dynamic Host Configuration Protocol
 */

#include <config.h>

#include <scan_progs/scanopts.h>
#include <scan_progs/scan_export.h>
#include <settings.h>

#include <unilib/prng.h>
#include <unilib/xmalloc.h>
#include <unilib/output.h>
#include <unilib/modules.h>

/* DHCP packet structure (simplified) */
typedef struct _PACKED_ dhcp_packet {
	uint8_t  op;           /* Message op code: 1=BOOTREQUEST, 2=BOOTREPLY */
	uint8_t  htype;        /* Hardware address type: 1=Ethernet */
	uint8_t  hlen;         /* Hardware address length: 6 for Ethernet */
	uint8_t  hops;         /* Client sets to 0 */
	uint32_t xid;          /* Transaction ID (random) */
	uint16_t secs;         /* Seconds elapsed since client started */
	uint16_t flags;        /* Flags (0x8000 = broadcast) */
	uint32_t ciaddr;       /* Client IP address (0 for DISCOVER) */
	uint32_t yiaddr;       /* 'Your' IP address (server fills in) */
	uint32_t siaddr;       /* Server IP address */
	uint32_t giaddr;       /* Relay agent IP address */
	uint8_t  chaddr[16];   /* Client hardware address */
	uint8_t  sname[64];    /* Server host name (optional) */
	uint8_t  file[128];    /* Boot file name (optional) */
	uint8_t  magic[4];     /* DHCP magic cookie: 0x63825363 */
	/* DHCP options follow */
} dhcp_packet_t;

/* Minimum DHCP options for DISCOVER */
#define DHCP_OPT_MSGTYPE     53
#define DHCP_OPT_PARAMREQ    55
#define DHCP_OPT_END        255
#define DHCP_DISCOVER         1

int create_payload(uint8_t **, uint32_t *, void *);
int init_module(mod_entry_t *);
void delete_module(void);
static mod_entry_t *_m = NULL;
static const settings_t *s = NULL;

int init_module(mod_entry_t *m) {
	snprintf(m->license, sizeof(m->license) - 1, "GPLv2");
	snprintf(m->author, sizeof(m->author) - 1, "unicornscan-modernization");
	snprintf(m->desc, sizeof(m->desc) - 1, "DHCP Discover request");
	m->iver = 0x0103;
	m->type = MI_TYPE_PAYLOAD;

	m->param_u.payload_s.sport = 68;   /* DHCP client port */
	m->param_u.payload_s.dport = 67;   /* DHCP server port */
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
	dhcp_packet_t *pkt;
	uint8_t *opts;
	size_t pkt_len;

	/* Total size: DHCP header + options (msgtype + paramreq + end) */
	pkt_len = sizeof(dhcp_packet_t) + 3 + 6 + 1;  /* 3 for msgtype, 6 for param req, 1 for end */

	*data = (uint8_t *)xmalloc(pkt_len);
	memset(*data, 0, pkt_len);
	pkt = (dhcp_packet_t *)*data;

	/* Build DHCP DISCOVER packet */
	pkt->op = 1;              /* BOOTREQUEST */
	pkt->htype = 1;           /* Ethernet */
	pkt->hlen = 6;            /* Ethernet address length */
	pkt->hops = 0;
	pkt->xid = prng_get32();  /* Random transaction ID */
	pkt->secs = 0;
	pkt->flags = htons(0x8000);  /* Broadcast flag */
	pkt->ciaddr = 0;
	pkt->yiaddr = 0;
	pkt->siaddr = 0;
	pkt->giaddr = 0;

	/* Generate a pseudo-random MAC for chaddr */
	pkt->chaddr[0] = 0x00;
	pkt->chaddr[1] = 0x0c;  /* Common OUI prefix */
	pkt->chaddr[2] = 0x29;
	pkt->chaddr[3] = (uint8_t)(prng_get32() & 0xFF);
	pkt->chaddr[4] = (uint8_t)(prng_get32() & 0xFF);
	pkt->chaddr[5] = (uint8_t)(prng_get32() & 0xFF);

	/* DHCP magic cookie */
	pkt->magic[0] = 0x63;
	pkt->magic[1] = 0x82;
	pkt->magic[2] = 0x53;
	pkt->magic[3] = 0x63;

	/* DHCP Options */
	opts = *data + sizeof(dhcp_packet_t);

	/* Option 53: DHCP Message Type = DISCOVER (1) */
	opts[0] = DHCP_OPT_MSGTYPE;
	opts[1] = 1;
	opts[2] = DHCP_DISCOVER;

	/* Option 55: Parameter Request List */
	opts[3] = DHCP_OPT_PARAMREQ;
	opts[4] = 3;     /* Length: 3 parameters */
	opts[5] = 1;     /* Subnet mask */
	opts[6] = 3;     /* Router */
	opts[7] = 6;     /* DNS server */

	/* Option 255: End */
	opts[8] = DHCP_OPT_END;

	*dlen = pkt_len;

	return 1;
}
