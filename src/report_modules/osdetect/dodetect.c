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
#include <config.h>

#include <scan_progs/scanopts.h>
#include <scan_progs/scan_export.h>
#include <scan_progs/packet_slice.h>
#include <scan_progs/packets.h>
#include <scan_progs/packet_parse.h>
#include <settings.h>
#include <unilib/output.h>
#include <unilib/xmalloc.h>

#include "module.h"
#include "dodetect.h"
#include "p0f3_parse.h"

/* P0F v3 integrated fingerprint parser state */
static int p0f3_loaded = 0;            /* Have we loaded signatures? */
static int p0f3_sig_count = 0;         /* Number of signatures loaded */

/* P0F v3 uses embedded signatures - no external file needed */

static void osd_add_fp(fps_t *);
static int  osd_tcpopt_match(const tcpopt_t *, const tcpopt_t *);
static void osd_get_tcpopts(tcpopt_t *, const uint8_t *, size_t, int *);

/*
 * ALERT! tcpoption string is WRITTEN TO
 */
static int  osd_str_to_tcpopts(char * /* tcpoption string */, tcpopt_t * /* output */);


fps_t *head=NULL;

/* i wrote all this the day before the defcon talk, so umm, yah... */
/* XXX cleaned up a little... no hardcoded fingerprints in the source ;] */

/*
 * P0F v3 integrated fingerprint parsing functions
 */

/* Initialize p0f v3 fingerprint database (lazy loading) */
static int p0f3_init_sigs(void) {
	int ret;

	if (p0f3_loaded) {
		return p0f3_sig_count;  /* Already loaded */
	}

	/* Load embedded signatures (p0f3_load_sigs ignores filename, uses embedded) */
	ret = p0f3_load_sigs(NULL);
	if (ret > 0) {
		p0f3_loaded = 1;
		p0f3_sig_count = ret;
		VRB(1, "Loaded %d embedded p0f v3 signatures for OS detection", ret);
		return ret;
	}

	DBG(M_MOD, "Failed to load p0f signatures");
	p0f3_loaded = 1;  /* Mark as checked so we don't retry */
	return 0;
}

/* Clean up p0f v3 signatures */
void p0f3_cleanup(void) {
	if (p0f3_loaded && p0f3_sig_count > 0) {
		p0f3_cleanup_sigs();
		p0f3_sig_count = 0;
	}
	p0f3_loaded = 0;
}

/* Extract TCP options from packet into p0f3 format */
static void extract_p0f3_opts(p0f3_pkt_t *pkt, const uint8_t *opts, size_t opts_len) {
	size_t off = 0;
	int idx = 0;

	while (off < opts_len && idx < P0F3_MAX_OPTS) {
		uint8_t opt_type = opts[off];

		switch (opt_type) {
			case 0:  /* EOL */
				pkt->opts[idx].type = P0F3_OPT_EOL;
				pkt->opts[idx].value = 0;
				idx++;
				off = opts_len;  /* Done */
				break;

			case 1:  /* NOP */
				pkt->opts[idx].type = P0F3_OPT_NOP;
				pkt->opts[idx].value = 0;
				idx++;
				off++;
				break;

			case 2:  /* MSS */
				if (off + 4 <= opts_len && opts[off + 1] == 4) {
					pkt->opts[idx].type = P0F3_OPT_MSS;
					pkt->mss = (opts[off + 2] << 8) | opts[off + 3];
					pkt->opts[idx].value = pkt->mss;
					idx++;
					off += 4;
				} else {
					off++;
				}
				break;

			case 3:  /* Window Scale */
				if (off + 3 <= opts_len && opts[off + 1] == 3) {
					pkt->opts[idx].type = P0F3_OPT_WS;
					pkt->win_scale = opts[off + 2];
					pkt->opts[idx].value = pkt->win_scale;
					idx++;
					off += 3;
				} else {
					off++;
				}
				break;

			case 4:  /* SACK Permitted */
				if (off + 2 <= opts_len && opts[off + 1] == 2) {
					pkt->opts[idx].type = P0F3_OPT_SOK;
					pkt->opts[idx].value = 0;
					idx++;
					off += 2;
				} else {
					off++;
				}
				break;

			case 5:  /* SACK */
				pkt->opts[idx].type = P0F3_OPT_SACK;
				pkt->opts[idx].value = 0;
				idx++;
				if (off + 1 < opts_len && opts[off + 1] > 1) {
					off += opts[off + 1];
				} else {
					off++;
				}
				break;

			case 8:  /* Timestamp */
				if (off + 10 <= opts_len && opts[off + 1] == 10) {
					uint32_t ts1 = (opts[off + 2] << 24) | (opts[off + 3] << 16) |
					               (opts[off + 4] << 8) | opts[off + 5];
					uint32_t ts2 = (opts[off + 6] << 24) | (opts[off + 7] << 16) |
					               (opts[off + 8] << 8) | opts[off + 9];
					pkt->opts[idx].type = P0F3_OPT_TS;
					pkt->opts[idx].value = 0;
					idx++;
					/* Check timestamp quirks */
					if (ts1 == 0) {
						pkt->quirks |= P0F3_QUIRK_TS1_MINUS;
					}
					if (ts2 != 0) {
						pkt->quirks |= P0F3_QUIRK_TS2_PLUS;
					}
					off += 10;
				} else {
					off++;
				}
				break;

			default:
				/* Skip unknown option */
				if (off + 1 < opts_len && opts[off + 1] > 1) {
					off += opts[off + 1];
				} else {
					off++;
				}
				break;
		}
	}

	pkt->opt_cnt = idx;
}

/* Build p0f3_pkt_t from raw packet data */
static int build_p0f3_pkt(p0f3_pkt_t *pkt, const uint8_t *data, size_t dlen) {
	packetlayers_t pkl[8];
	size_t ret = 0, j = 0;
	uint8_t ipsig;
	union {
		const struct mytcphdr *t;
		const struct myiphdr *i;
		const uint8_t *ptr;
	} ph_u;

	memset(pkt, 0, sizeof(*pkt));
	pkt->mss = -1;
	pkt->win_scale = -1;

	ipsig = *data;
	if ((ipsig & 0x40) != 0x40) {
		return -1;  /* Not IPv4 */
	}

	pkt->ip_ver = 4;
	ret = packet_slice(data, dlen, &pkl[0], 8, PKLTYPE_IP);

	for (j = 0; j < ret; j++) {
		if (pkl[j].stat != 0) continue;

		switch (pkl[j].type) {
			case PKLTYPE_IP:
				if (pkl[j].len >= sizeof(struct myiphdr)) {
					ph_u.ptr = pkl[j].ptr;
					pkt->ttl = ph_u.i->ttl;
					pkt->ip_opt_len = (ph_u.i->ihl * 4) - 20;

					/* DF quirk */
					if (ntohs(ph_u.i->frag_off) & IP_DF) {
						pkt->quirks |= P0F3_QUIRK_DF;
					}
					/* ID quirks */
					if (ph_u.i->id != 0) {
						pkt->quirks |= P0F3_QUIRK_ID_PLUS;
					} else {
						pkt->quirks |= P0F3_QUIRK_ID_MINUS;
					}
				}
				break;

			case PKLTYPE_TCP:
				if (pkl[j].len >= sizeof(struct mytcphdr)) {
					ph_u.ptr = pkl[j].ptr;
					pkt->win = ntohs(ph_u.t->window);

					/* ECN quirk */
					if (ph_u.t->ece || ph_u.t->cwr) {
						pkt->quirks |= P0F3_QUIRK_ECN;
					}
					/* Sequence quirk */
					if (ph_u.t->seq == 0) {
						pkt->quirks |= P0F3_QUIRK_SEQ_MINUS;
					}
					/* ACK quirks (for SYN packets) */
					if (ph_u.t->syn && !ph_u.t->ack && ph_u.t->ack_seq != 0) {
						pkt->quirks |= P0F3_QUIRK_ACK_PLUS;
					}
					if (ph_u.t->syn && ph_u.t->ack && ph_u.t->ack_seq == 0) {
						pkt->quirks |= P0F3_QUIRK_ACK_MINUS;
					}
					/* URG quirk */
					if (!ph_u.t->urg && ph_u.t->urg_ptr != 0) {
						pkt->quirks |= P0F3_QUIRK_URG_PLUS;
					}
					/* PUSH quirk */
					if (ph_u.t->psh) {
						pkt->quirks |= P0F3_QUIRK_PUSH;
					}
				}
				break;

			case PKLTYPE_TCPOP:
				extract_p0f3_opts(pkt, pkl[j].ptr, pkl[j].len);
				break;

			case PKLTYPE_PAYLOAD:
				pkt->has_payload = (pkl[j].len > 0) ? 1 : 0;
				break;

			default:
				break;
		}
	}

	return 0;
}

/* Try to get OS info from integrated p0f v3 signatures */
static const char *do_osdetect_p0f3(const uint8_t *data, size_t dlen, int is_synack) {
	p0f3_pkt_t pkt;
	const char *result;
	p0f3_sig_type_t sig_type;

	/* Initialize signatures if not done */
	if (p0f3_init_sigs() <= 0) {
		return NULL;  /* No signatures loaded */
	}

	/* Build packet structure */
	if (build_p0f3_pkt(&pkt, data, dlen) < 0) {
		return NULL;
	}

	/* Choose signature type based on packet type */
	sig_type = is_synack ? P0F3_SIG_TCP_RESPONSE : P0F3_SIG_TCP_REQUEST;

	/* Match against signatures */
	result = p0f3_match(&pkt, sig_type);
	if (result != NULL) {
		DBG(M_MOD, "p0f3 match: TTL=%d Win=%d MSS=%d WS=%d -> %s",
			pkt.ttl, pkt.win, pkt.mss, pkt.win_scale, result);
	} else if (osd.dump_unknown && is_synack) {
		/* Dump unknown fingerprint if dumpunknown is enabled */
		p0f3_dump_unknown(&pkt);
	}

	return result;
}

/* Original detection function - renamed */
static char *do_osdetect_builtin(const uint8_t *data, size_t dlen);

/*
 * Main OS detection entry point - tries integrated p0f v3 first, then falls back to built-in
 */
char *do_osdetect(const uint8_t *data, size_t dlen) {
	union {
		const struct myiphdr *i;
		const struct mytcphdr *t;
		const uint8_t *ptr;
	} ip_u, tcp_u;
	const char *p0f_result = NULL;
	char *builtin_result = NULL;
	static char result_buf[256];
	uint8_t ipsig;
	int is_synack = 0;

	/* Check if this is a SYN-ACK (typical response we're matching) */
	ipsig = *data;
	if ((ipsig & 0xF0) == 0x40 && dlen >= sizeof(struct myiphdr)) {
		ip_u.ptr = data;
		size_t ip_hlen = ip_u.i->ihl * 4;
		if (dlen >= ip_hlen + sizeof(struct mytcphdr)) {
			tcp_u.ptr = data + ip_hlen;
			is_synack = (tcp_u.t->syn && tcp_u.t->ack);
		}
	}

	/* Try integrated p0f v3 first */
	p0f_result = do_osdetect_p0f3(data, dlen, is_synack);
	if (p0f_result != NULL && strlen(p0f_result) > 0) {
		DBG(M_MOD, "p0f v3 detected: %s", p0f_result);
		snprintf(result_buf, sizeof(result_buf), "%s", p0f_result);
		return result_buf;
	}

	/* Fall back to built-in detection */
	builtin_result = do_osdetect_builtin(data, dlen);
	if (builtin_result != NULL && strlen(builtin_result) > 0) {
		DBG(M_MOD, "Built-in detected: %s", builtin_result);
		return builtin_result;
	}

	return NULL;
}

/*
 * Built-in OS detection (original implementation)
 */
static char *do_osdetect_builtin(const uint8_t *data, size_t dlen) {
	packetlayers_t pkl[8];
	size_t ret=0, j=0;
	uint8_t ipsig=0;
	union {
		const struct mytcphdr *t;
		const struct myiphdr *i;
		const uint8_t *ptr;
	} ph_u;
	fps_t fp;

	memset(&fp, 0, sizeof(fp));

	for (j=0; j < MAX_TCPOPTS; j++) {
		fp.tcpopts[j].type=-1;
		memset(fp.tcpopts[j].desc, 0, sizeof(fp.tcpopts[j].desc));
	}

	fp.stim_fp=osd.stim_fp;

	ipsig=*data;

	if ((ipsig & 0x40) == 0x40) {
		ret=packet_slice(data, dlen, &pkl[0], 8, PKLTYPE_IP);
	}
	else {
		ret=0;
	}

	for (j=0; j < ret; j++) {

		if (pkl[j].stat != 0) {
			continue;
		}

		switch (pkl[j].type) {
			case PKLTYPE_IP:
				if (pkl[j].len >= sizeof(struct myiphdr)) {
					ph_u.ptr=pkl[j].ptr;

					fp.ttl=ph_u.i->ttl;
					fp.tos=ph_u.i->tos;
					fp.df=ntohs(ph_u.i->frag_off) & IP_DF ? 1 : 0;

				}
				break;

			case PKLTYPE_TCP:
				if (pkl[j].len >= sizeof(struct mytcphdr)) {
					ph_u.ptr=pkl[j].ptr;
					fp.urg_ptr=ntohs(ph_u.t->urg_ptr);
					fp.ws=ntohs(ph_u.t->window);

					if (fp.urg_ptr != 0 && ph_u.t->urg == 0) {
						fp.misc_flags |= OSD_URGPTR_LEAK;
					}

					if (ph_u.t->res1 != 0) {
						fp.misc_flags |= OSD_RESFLAGS_LEAK;
					}

					if (ph_u.t->ece != 0) {
						fp.misc_flags |= OSD_ECE_ON;
						fp.flag_ece=1;
					}

					if (ph_u.t->cwr != 0) {
						fp.misc_flags |= OSD_CWR_ON;
						fp.flag_cwr=1;
					}

					fp.flag_fin=ph_u.t->fin;
					fp.flag_syn=ph_u.t->syn;
					fp.flag_rst=ph_u.t->rst;
					fp.flag_psh=ph_u.t->psh;
					fp.flag_ack=ph_u.t->ack;
					fp.flag_urg=ph_u.t->urg;
				}
				break;

			case PKLTYPE_TCPOP:
				osd_get_tcpopts(&fp.tcpopts[0], pkl[j].ptr, pkl[j].len, &fp.misc_flags);
				break;
		
			case PKLTYPE_PAYLOAD:
				break;

			default:
				break;
		}
	}

	return osd_find_match(&fp);
}

static void osd_fp_dump(const fps_t *fp) {
	char fpstr[1024];
	int pfret=0;
	unsigned int j=0, fpoff=0;

	pfret=snprintf(fpstr, sizeof(fpstr),	"ST %u IP TTL %u TOS 0x%02x [%s] "
						"TCP WS %u urg_ptr %04x",
				fp->stim_fp, fp->ttl, fp->tos, (fp->df  == 1 ? "DF" : ""),
				fp->ws, fp->urg_ptr
		);

	if (pfret > 0) {
		fpoff += (unsigned int)pfret;
	}
	else {
		PANIC("snprintf fails");
	}

	/* Only show fingerprint details with -vv or higher */
	VRB(1, "%s", fpstr);

	if (fp->misc_flags & OSD_URGPTR_LEAK) {
		DBG(M_MOD, "urgent pointer leak!");
	}
	if (fp->misc_flags & OSD_RESFLAGS_LEAK) {
		DBG(M_MOD, "reserved flag leak!");
	}
	if (fp->misc_flags & OSD_ECE_ON) {
		DBG(M_MOD, "ECN echo on");
	}
	if (fp->misc_flags & OSD_CWR_ON) {
		DBG(M_MOD, "congestion window reduced");
	}
	if (fp->misc_flags & OSD_TIMESTAMP_LOW_LITTLEENDIAN) {
		DBG(M_MOD, "Low timestamp, littleendian!");
	}
	if (fp->misc_flags & OSD_TIMESTAMP_LOW_BIGENDIAN) {
		DBG(M_MOD, "Low Timestamp, Bigendian!");
	}

	if (fp->misc_flags & OSD_TIMESTAMP_ZERO) {
		DBG(M_MOD, "Zero Timestamp!");
	}

	for (j=0; j < MAX_TCPOPTS && fp->tcpopts[j].type != -1; j++) {
		DBG(M_MOD, "option [%d] %s", fp->tcpopts[j].type, fp->tcpopts[j].desc);
	}
}

char *osd_find_match(const fps_t *fp) {
	fps_t *walk=NULL;
	int match=0;
	static char desc[128];

	assert(fp != NULL);

	memset(desc, 0, sizeof(desc));

	for (walk=head; walk != NULL; walk=walk->next) {

		if (ISDBG(M_MOD)) {
			DBG(M_MOD, "matching:");
			osd_fp_dump(fp);
			DBG(M_MOD, "Vs:");
			osd_fp_dump(walk);
		}

		if (	fp->stim_fp  == walk->stim_fp &&
			fp->flag_fin == walk->flag_fin &&
			fp->flag_syn == walk->flag_syn &&
			fp->flag_rst == walk->flag_rst &&
			fp->flag_psh == walk->flag_psh &&
			fp->flag_ack == walk->flag_ack &&
			fp->flag_ece == walk->flag_ece &&
			fp->flag_cwr == walk->flag_cwr &&
			fp->misc_flags == walk->misc_flags &&
			fp->df == walk->df &&
			fp->ws == walk->ws &&
			fp->tos == walk->tos &&
			((fp->ttl >  32 && fp->ttl <  65 && walk->ttl ==  64) ||
			 (fp->ttl >  30 && fp->ttl <  61 && walk->ttl ==  60) ||
			 (fp->ttl >  64 && fp->ttl < 129 && walk->ttl == 128) ||
			 (fp->ttl > 129 && 1             && walk->ttl >  250)
			)
		) {
			match=1;

			if (osd_tcpopt_match(fp->tcpopts, walk->tcpopts) != 1) {
				match=0;
				continue;
			}

			if (match == 1) {
				snprintf(desc, sizeof(desc) - 1, "%s:%s", walk->ostype, walk->osdesc);
				break;
			}
		}
		else {
#if 0
			MSG(M_DBG2, "Error matching basic things!");
#endif
		}
	}

	if (osd.dump_unknown && match == 0) {
/*
		fps_t *nwalk=NULL;
		MSG(M_ERR, "no match stim_fp %d -> %d df %d %d ws %d %d tos %d %d misc_flags %d %d", fp->stim_fp, walk->stim_fp, fp->df, walk->df, fp->ws, walk->ws, fp->tos, walk->tos, fp->misc_flags, walk->misc_flags);
		MSG(M_ERR, "f %u s %u r %u p %u a %u e %u c %u VS f %u s %u r %u p %u a %u e %u c %u",
		fp->flag_fin, fp->flag_syn, fp->flag_rst, fp->flag_psh, fp->flag_ack, fp->flag_ece, fp->flag_cwr,
		walk->flag_fin, walk->flag_syn, walk->flag_rst, walk->flag_psh, walk->flag_ack, walk->flag_ece, walk->flag_cwr);
*/
		DBG(M_MOD, "Unknown Fingerprint Follows");
		osd_fp_dump(fp);

/*I
		for (nwalk=head; nwalk != NULL; nwalk=nwalk->next) {
			MSG(M_DBG2, "Fingerprint ive got");
			osd_fp_dump(nwalk);
		}
*/
	}

	return desc;
}

static int osd_tcpopt_match(const tcpopt_t *a, const tcpopt_t *b) {
	int match=1;
	unsigned int j=0;

	assert(a != NULL && b != NULL);

	for (j=0; j < MAX_TCPOPTS; j++) {
		if (a->type == -1 && b->type == -1) {
			break;
		}
		if (a->type != b->type) {
			match=0;
			break;
		}

		switch (a->type) {
			case TCPOPT_WINDOW:
				if (a->tcpopt_u.wscale != b->tcpopt_u.wscale) {
					//MSG(M_DBG2, "wscale %u != wscale %u", a->tcpopt_u.wscale, b->tcpopt_u.wscale);
					match=0;
				}
				break;

			case TCPOPT_MAXSEG:
				if (a->tcpopt_u.maxseg != b->tcpopt_u.maxseg) {
					//MSG(M_DBG2, "maxseg %u != maxseg %u", a->tcpopt_u.maxseg, b->tcpopt_u.maxseg);
					match=0;
				}
				break;

			case TCPOPT_TIMESTAMP:
				break;

			default:
				break;
		}

		if (match == 0) {
			//MSG(M_DBG2, "mis-match tcpoptions!");
			break;
		}

		a++; b++;
	}

	return match;
}

int osd_add_fingerprint(const char *str) {
	char *sdup, *tok=NULL, *subtok=NULL, *st1=NULL, *st2=NULL;
	fps_t *fnew=NULL;
	int fpstate=0;
#define FPSTATE_NONE		 0
#define FPSTATE_STIMFP		 1
#define FPSTATE_TCPFLAGS	 2
#define FPSTATE_IPTTL		 3
#define FPSTATE_IPDF		 4
#define FPSTATE_TCPWS		 5
#define FPSTATE_IPTOS		 6
#define FPSTATE_MISCFLGS	 7
#define FPSTATE_TCPOPTS		 8
#define FPSTATE_OSTYPE		 9
#define FPSTATE_OSDESC		10

	if (str == NULL || strlen(str) < 1) {
		return 0;
	}
	fnew=(fps_t *)xmalloc(sizeof(fps_t));
	memset(fnew, 0, sizeof(fps_t));

	sdup=xstrdup(str);
	for (	fpstate=FPSTATE_NONE, tok=strtok_r(sdup, ", \t", &st1) ;
		tok != NULL ;
		tok=strtok_r(NULL, ", \t", &st1)
		) {

		if (strlen(tok)) fpstate++;

		//MSG(M_DBG2, "token `%s' at state %d", tok, fpstate);

		switch (fpstate) {
			case FPSTATE_STIMFP:
				if (tok[0] == 'S' && tok[1] == 'T') {
					tok += 2;
				}
				fnew->stim_fp=atoi(tok);
				break;

			case FPSTATE_TCPFLAGS:
				for (; *tok != '\0'; tok++) {
					switch (*tok) {
						case 'S':
							fnew->flag_syn=1;
							break;
						case 'A':
							fnew->flag_ack=1;
							break;
						case 'F':
							fnew->flag_fin=1;
							break;
						case 'R':
							fnew->flag_rst=1;
							break;
						case 'U':
							fnew->flag_urg=1;
							break;
						case 'P':
							fnew->flag_urg=1;
							break;
						default:
							ERR("Unknown TCP flag `%c', ignoring it!", *tok);
							goto error;
					}
				}
				break;

			case FPSTATE_IPTTL:
				fnew->ttl=atoi(tok);
				break;

			case FPSTATE_IPDF:
				fnew->df=atoi(tok);
				break;

			case FPSTATE_TCPWS:
				fnew->ws=atoi(tok);
				break;

			case FPSTATE_IPTOS:
				fnew->tos=atoi(tok);
				break;

			case FPSTATE_MISCFLGS:

				for (	subtok=strtok_r(tok, "|", &st2) ;
					subtok != NULL ;
					subtok=strtok_r(NULL, "|", &st2)
					) {
					fnew->misc_flags=0;
					if (strcmp(subtok, "TS0") == 0) {
						fnew->misc_flags |= OSD_TIMESTAMP_ZERO;
					}
					else if (strcmp(subtok, "none") == 0) {
						break;
					}
					else {
						DBG(M_MOD, "Ack! %s", subtok);
						goto error;
					}
				}
				break;

			case FPSTATE_TCPOPTS:
				if (osd_str_to_tcpopts(tok, fnew->tcpopts) != 1) {
					ERR("badly formed tcpoption string");
					goto error;
					break;
				}
				break;

			case FPSTATE_OSTYPE:
				fnew->ostype=xstrdup(tok);
				break;

			case FPSTATE_OSDESC: 
				fnew->osdesc=xstrdup(tok);
				break;

			default:
				ERR("Unknown state %d", fpstate);
				goto error;
				break;
		}
	}

	if (sdup) xfree(sdup);  

	VRB(2, "adding fingerprint for %s:%s", fnew->ostype, fnew->osdesc);

	osd_add_fp(fnew);

	return 1;
error:

	ERR("bad fingerprint from configuration file!, ignoring it");

	if (fnew && fnew->ostype) xfree(fnew->ostype);
	if (fnew && fnew->osdesc) xfree(fnew->osdesc);
	if (fnew) xfree(fnew);

	return 0;
}

static int osd_str_to_tcpopts(char *str, tcpopt_t *to) {
	unsigned int j=0, tcpopt_cnt=0;
	tcpopt_t *walk=NULL;
	char *tok=NULL, *st1=NULL;

	assert(str != NULL && to != NULL);

	for (walk=to, j=0; j < MAX_TCPOPTS; j++) {
		walk->type=-1;
		walk++;
	}

	//MSG(M_DBG2, "osd_str_to_tcpopts for %s", str);

	tcpopt_cnt=0;
	for (tok=strtok_r(str, ":", &st1); tok != NULL; tok=strtok_r(NULL, ":", &st1)) {
		tcpopt_cnt++;

		if (tcpopt_cnt > MAX_TCPOPTS) {
			ERR("Too many tcpoptions, ignoring the rest!");
			break;
		}

		//MSG(M_DBG2, "tcpoption %s", tok);
		if (strlen(tok) > 3 && strncmp(tok, "MSS", 3)  == 0) {
			to->type=TCPOPT_MAXSEG;
			if (sscanf(tok + 3, "%hu", &to->tcpopt_u.maxseg) != 1) {
				ERR("Bad tcpopt maxseg value!");
				continue;
			}
			sprintf(to->desc, "MSS%hu", to->tcpopt_u.maxseg);
			to++;
		}
		else if (strlen(tok) > 2 && strncmp(tok, "WS", 2) == 0) {
			uint16_t rval=0;

			to->type=TCPOPT_WINDOW;
			if (sscanf(tok + 2, "%hu", &rval) != 1) {
				ERR("Bad tcpopt windowscale value!");
				continue;
			}
			if (rval > 0xff) {
				ERR("Bad tcpopt windowscale value! (out of range)");
				continue;
			}
			to->tcpopt_u.wscale=(uint8_t )rval & 0xff;
			sprintf(to->desc, "WS%hu", to->tcpopt_u.wscale);
			to++;
		}
		else if (strlen(tok) == 2 && strncmp(tok, "TS", 2) == 0) {
			to->type=TCPOPT_TIMESTAMP;
			to->tcpopt_u.tstamp_s.us=0x41414141;
			to->tcpopt_u.tstamp_s.them=0x41414141;
			strcpy(to->desc, "TS?:?");
			to++;
		}
		else if (tok[0] == 'N' && tok[1] == '\0') {
			to->type=TCPOPT_NOP;
			strcpy(to->desc, "N");
			to++;
		}
		else if (tok[0] == 'E' && tok[1] == '\0') {
			to->type=TCPOPT_EOL;
			strcpy(to->desc, "E");
			to++;
		}
		else if (tok[0] == 'S' && tok[1] == '\0') {
			to->type=TCPOPT_SACK_PERMITTED;
			strcpy(to->desc, "S");
			to++;
		}
		else {
			ERR("Unknown tcpoption %s", tok);
		}
	}

	return 1;
}

static void osd_add_fp(fps_t *n) {
	assert(n != NULL);

	if (head == NULL) {
		head=n;
		head->next=NULL;
	}
	else {
		fps_t *walk=NULL;

		for (walk=head; walk->next != NULL; walk=walk->next) {
			;
		}
		walk->next=n;
		walk=walk->next;
		walk->next=NULL;
	}
}

void osd_get_tcpopts(tcpopt_t *t, const uint8_t *data, size_t len, int *misc_flags) {
	const uint8_t *ptr=NULL;
	unsigned int tcpopt_off=0;
	size_t dataoff=0;
	union {
		const uint8_t *ptr;
		const uint16_t *hw;
		const uint32_t *w;
		struct {
			uint32_t *w1;
			uint32_t *w2;
		} dw;
	} w_u;

	for (ptr=data; dataoff < len && dataoff < 0xff; /* options are variable length */) {
		switch ((uint8_t )*ptr) {

			case TCPOPT_EOL:
				strcat(t[tcpopt_off].desc, "E");
				t[tcpopt_off++].type=TCPOPT_EOL;
				dataoff++; ptr++;
				break;

			case TCPOPT_NOP:
				strcat(t[tcpopt_off].desc, "N");
				t[tcpopt_off++].type=TCPOPT_NOP;
				dataoff++; ptr++;
				break;

			case TCPOPT_MAXSEG:
				dataoff++; ptr++;
				if (*ptr != 4 || (dataoff + 2) > len) {
					break;
				}
				ptr++; dataoff++;
				w_u.ptr=ptr;
				t[tcpopt_off].tcpopt_u.maxseg=ntohs(*w_u.hw);
				sprintf(t[tcpopt_off].desc, "MS%hu", t[tcpopt_off].tcpopt_u.maxseg);
				t[tcpopt_off++].type=TCPOPT_MAXSEG;
				ptr += 2; dataoff += 2;
				break;

			case TCPOPT_SACK_PERMITTED:
				dataoff++; ptr++;
				if (*ptr != 2) {
					break;
				}
				strcat(t[tcpopt_off].desc, "S");
				t[tcpopt_off++].type=TCPOPT_SACK_PERMITTED;
				dataoff++; ptr++;
				break;

			case TCPOPT_TIMESTAMP:
				dataoff++; ptr++;
				if (*ptr != 10 || (dataoff + 9) > len) {
					break;
				}
				ptr++; dataoff++;

				w_u.ptr=ptr;
				t[tcpopt_off].tcpopt_u.tstamp_s.them=*w_u.w;
				ptr += 4; dataoff += 4;

				w_u.ptr=ptr;
				t[tcpopt_off].tcpopt_u.tstamp_s.us=*w_u.w;
				ptr += 4; dataoff += 4;

				if (t[tcpopt_off].tcpopt_u.tstamp_s.them == 0) {
					*misc_flags |= OSD_TIMESTAMP_ZERO;
				}
				else if (t[tcpopt_off].tcpopt_u.tstamp_s.them < 0xff) {
					*misc_flags |= OSD_TIMESTAMP_LOW_BIGENDIAN;
				}
				else if (ntohl(t[tcpopt_off].tcpopt_u.tstamp_s.them) < 0xff) {
					*misc_flags |= OSD_TIMESTAMP_LOW_LITTLEENDIAN;
				}

				sprintf(t[tcpopt_off].desc, "T%08x:%08x", t[tcpopt_off].tcpopt_u.tstamp_s.them,
				t[tcpopt_off].tcpopt_u.tstamp_s.us);

				t[tcpopt_off++].type=TCPOPT_TIMESTAMP;
				break;

			case TCPOPT_WINDOW:
				dataoff++; ptr++;
				if (*ptr != 3 || (dataoff + 1) > len) {
					break;
				}
				ptr++; dataoff++;
				t[tcpopt_off].tcpopt_u.wscale=*ptr;
				sprintf(t[tcpopt_off].desc, "WS%hu", t[tcpopt_off].tcpopt_u.wscale);
				t[tcpopt_off++].type=TCPOPT_WINDOW;
				ptr++; dataoff++;
				break;

			default:
				dataoff++; ptr++;
		}
	}

	return;
}
