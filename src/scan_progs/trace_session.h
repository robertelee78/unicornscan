/**********************************************************************
 * Copyright (C) 2025 (Robert E. Lee) <robert@unicornscan.org>        *
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
#ifndef _TRACE_SESSION_H
# define _TRACE_SESSION_H

#define TRACE_SESSION_MAGIC	0x54524143	/* "TRAC"	*/
#define TRACE_HOP_MAGIC		0x484f5021	/* "HOP!"	*/

#define TRACE_HOP_NONE		0x00		/* no response	*/
#define TRACE_HOP_RECV		0x01		/* got ICMP TE	*/
#define TRACE_HOP_DEST		0x02		/* got SYN/ACK	*/
#define TRACE_HOP_UNREACH	0x04		/* got ICMP DU	*/

#define TRACE_MAX_TTL		255

typedef struct _PACKED_ trace_hop_t {
	uint32_t magic;
	uint32_t router_addr;		/* router that responded	*/
	uint8_t ttl;			/* TTL that triggered response	*/
	uint32_t rtt_us;		/* round-trip time in usec	*/
	uint8_t flags;			/* TRACE_HOP_* flags		*/
} trace_hop_t;

typedef struct _PACKED_ trace_session_t {
	uint32_t magic;
	uint32_t target_addr;		/* destination IP address	*/
	uint16_t target_port;		/* destination port		*/
	uint8_t minttl;			/* starting TTL			*/
	uint8_t maxttl;			/* ending TTL			*/
	uint8_t curttl;			/* current TTL in progress	*/
	uint8_t complete;		/* 1 if trace finished		*/
	trace_hop_t hops[TRACE_MAX_TTL + 1];
	struct timeval send_times[TRACE_MAX_TTL + 1];
} trace_session_t;

trace_session_t *trace_session_create(uint32_t /* target_addr */, uint16_t /* target_port */, uint8_t /* minttl */, uint8_t /* maxttl */);
void trace_session_destroy(trace_session_t *);
int trace_session_record_hop(trace_session_t *, uint8_t /* ttl */, uint32_t /* router_addr */, uint32_t /* rtt_us */, uint8_t /* flags */);
void trace_session_mark_complete(trace_session_t *);
int trace_session_validate(const trace_session_t *);

/*
 * convert trace_session to trace_path_report for output modules.
 * caller must provide buffer (sizeof(trace_path_report_t)).
 * returns 1 on success, -1 on error.
 */
struct trace_path_report_t;	/* forward decl, defined in scan_export.h */
int trace_session_to_path_report(const trace_session_t *, struct trace_path_report_t *);

#endif
