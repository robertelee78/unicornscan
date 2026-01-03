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
#include <config.h>

#include <scan_progs/scanopts.h>
#include <scan_progs/scan_export.h>
#include <settings.h>
#include <scan_progs/trace_session.h>

#include <unilib/output.h>
#include <unilib/xmalloc.h>

trace_session_t *trace_session_create(uint32_t target_addr, uint16_t target_port, uint8_t minttl, uint8_t maxttl) {
	trace_session_t *ts=NULL;
	int j=0;

	ts=(trace_session_t *)xmalloc(sizeof(trace_session_t));
	memset(ts, 0, sizeof(trace_session_t));

	ts->magic=TRACE_SESSION_MAGIC;
	ts->target_addr=target_addr;
	ts->target_port=target_port;
	ts->minttl=minttl;
	ts->maxttl=maxttl;
	ts->curttl=minttl;
	ts->complete=0;

	/* initialize all hops with magic */
	for (j=0; j <= TRACE_MAX_TTL; j++) {
		ts->hops[j].magic=TRACE_HOP_MAGIC;
		ts->hops[j].flags=TRACE_HOP_NONE;
	}

	DBG(M_TRC, "trace session created target %08x port %u ttl %u-%u", target_addr, target_port, minttl, maxttl);

	return ts;
}

void trace_session_destroy(trace_session_t *ts) {

	if (ts == NULL) {
		return;
	}

	if (ts->magic != TRACE_SESSION_MAGIC) {
		ERR("trace session magic bad %08x", ts->magic);
		return;
	}

	ts->magic=0;
	xfree(ts);

	return;
}

int trace_session_record_hop(trace_session_t *ts, uint8_t ttl, uint32_t router_addr, uint32_t rtt_us, uint8_t flags) {

	if (ts == NULL) {
		ERR("null session");
		return -1;
	}

	if (ts->magic != TRACE_SESSION_MAGIC) {
		ERR("trace session magic bad %08x", ts->magic);
		return -1;
	}

	if (ttl > TRACE_MAX_TTL) {
		ERR("ttl %u out of range", ttl);
		return -1;
	}

	ts->hops[ttl].ttl=ttl;
	ts->hops[ttl].router_addr=router_addr;
	ts->hops[ttl].rtt_us=rtt_us;
	ts->hops[ttl].flags=flags;

	DBG(M_TRC, "recorded hop ttl %u router %08x rtt %u flags %02x", ttl, router_addr, rtt_us, flags);

	return 1;
}

void trace_session_mark_complete(trace_session_t *ts) {

	if (ts == NULL) {
		return;
	}

	if (ts->magic != TRACE_SESSION_MAGIC) {
		ERR("trace session magic bad %08x", ts->magic);
		return;
	}

	ts->complete=1;

	DBG(M_TRC, "trace session marked complete");

	return;
}

int trace_session_validate(const trace_session_t *ts) {

	if (ts == NULL) {
		return -1;
	}

	if (ts->magic != TRACE_SESSION_MAGIC) {
		return -1;
	}

	return 1;
}

/*
 * convert trace_session to trace_path_report for output modules.
 * iterates through session hops, copying those with TRACE_HOP_RECV or TRACE_HOP_DEST.
 */
int trace_session_to_path_report(const trace_session_t *ts, trace_path_report_t *rpt) {
	int j=0;
	uint8_t hop_idx=0;

	if (ts == NULL || rpt == NULL) {
		ERR("null pointer");
		return -1;
	}

	if (ts->magic != TRACE_SESSION_MAGIC) {
		ERR("trace session magic bad %08x", ts->magic);
		return -1;
	}

	memset(rpt, 0, sizeof(trace_path_report_t));

	rpt->magic=TRACE_PATH_MAGIC;
	rpt->target_addr=ts->target_addr;
	rpt->target_port=ts->target_port;
	rpt->complete=ts->complete;

	/*
	 * iterate through session hops from minttl to maxttl.
	 * copy hops that have responses (RECV or DEST flags).
	 */
	for (j=ts->minttl; j <= ts->maxttl && hop_idx < TRACE_PATH_MAX_HOPS; j++) {
		if (ts->hops[j].flags == TRACE_HOP_NONE) {
			continue;
		}

		rpt->hops[hop_idx].router_addr=ts->hops[j].router_addr;
		rpt->hops[hop_idx].hop_number=(uint8_t)j;
		rpt->hops[hop_idx].rtt_us=ts->hops[j].rtt_us;
		rpt->hops[hop_idx].flags=ts->hops[j].flags;

		hop_idx++;
	}

	rpt->hop_count=hop_idx;

	DBG(M_TRC, "converted session to path report: %u hops, complete=%u", hop_idx, ts->complete);

	return 1;
}
