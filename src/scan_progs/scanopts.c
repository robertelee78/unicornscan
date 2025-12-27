/**********************************************************************
 * Copyright (C) 2004-2006 (Jack Louis) <jack@rapturesecurity.org>    *
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

#include <ctype.h>

#include <scan_progs/scanopts.h>
#include <scan_progs/scan_export.h>

#include <scan_progs/options.h>

#include <settings.h>
#include <unilib/xmalloc.h>
#include <unilib/xipc.h>
#include <unilib/output.h>
#include <unilib/modules.h>
#include <unilib/prng.h>
#include <unilib/cidr.h>
#include <scan_progs/portfunc.h>
#include <scan_progs/workunits.h>

/* forward declarations for static functions */
static int parse_phase_modifiers(const char *, uint32_t *, uint8_t *);
static int scan_parsemode_ext(const char *, uint8_t *, uint16_t *, uint16_t *,
                              uint16_t *, uint16_t *, uint32_t *, uint32_t *, uint8_t *);
static int scan_parsemode_compound(const char *);

int scan_getmode(void) {
	return s->ss->mode;
}

void scan_setprivdefaults() {

	s->ss=(SCANSETTINGS *)xmalloc(sizeof(SCANSETTINGS));

	memset(s->ss, 0, sizeof(SCANSETTINGS));

	/* default mode is tcp syn scan */
	s->ss->mode=MODE_TCPSCAN;
	s->ss->tcphdrflgs=TH_SYN; /* FSRPAUEC */
	s->ss->src_port=-1;
	s->ss->recv_timeout=DEF_SCANTIMEOUT; /* in config.h */
	s->global_recv_timeout=DEF_SCANTIMEOUT;
	s->ss->window_size=0x1000;

	s->ss->syn_key=prng_get32();

	return;
}

int scan_setsrcp(int port) {

	if (port < -1 || port > 0xffff) {
		ERR("source port `%d' out of range", port);
		return -1;
	}
	s->ss->src_port=(int32_t)port;

	return 1;
}

int scan_setretlayers(int layers) {

	if (layers < 0) {
		s->ss->ret_layers=0xff;
	}

	if (layers > 0xff) {
		ERR("too many layers");
		return -1;
	}

	s->ss->ret_layers=(uint8_t)layers;

	return 1;
}

int scan_setfingerprint(int fp) {

	if (fp < 0 || fp > 0xffff) {
		ERR("bad fingerprint value");
		return -1;
	}

	s->ss->fingerprint=(uint16_t)fp;

	return 1;
}

int scan_setttl(const char *ttl) {
	unsigned short int a=0, b=0;

	if (ttl == NULL) {
		return -1;
	}

	if (sscanf(ttl, "%hu-%hu", &a, &b) == 2) {
		if (a > 0xff || b > 0xff) {
			ERR("ttl out of range");
			return -1;
		}
		if (a > b) {
			unsigned short int t=0;

			t=a;
			a=b;
			b=t;
		}

		s->ss->minttl=(uint8_t)a;
		s->ss->maxttl=(uint8_t)b;
	}
	else if (sscanf(ttl, "%hu", &a) == 1) {
		if (a > 0xff) {
			ERR("ttl out of range");
			return -1;
		}
		s->ss->minttl=(uint8_t)a;
		s->ss->maxttl=(uint8_t)a;
	}
	else {
		ERR("bad ttl option `%s'", ttl);
		return -1;
	}

	return 1;
}

int scan_setsrcaddr(const char *addr) {
	unsigned int msk=0;

	if (addr == NULL || strlen(addr) < 1) {
		return -1;
	}

	if (cidr_get(addr, (struct sockaddr *)&s->vi[0]->myaddr, (struct sockaddr *)&s->vi[0]->mymask, &msk) < 0) {
		ERR("invalid source address `%s'", addr);
		return -1;
	}
	strncpy(s->vi[0]->myaddr_s, cidr_saddrstr((const struct sockaddr *)&s->vi[0]->myaddr), sizeof(s->vi[0]->myaddr_s) -1);

	DBG(M_CNF, "using explicit (user) source address `%s/%u'", s->vi[0]->myaddr_s, msk);

#if 0
	char *tok=NULL, *rent=NULL, *sdup=NULL;
	sdup=xstrdup(addr);

	for (tok=strtok_r(sdup, ",", &rent); tok != NULL; tok=strtok_r(NULL, ",", &rent)) {
	}
#endif

	SET_OVERRIDE(1);
	SET_PROMISC(1);

        return 1;
}

int scan_settos(int tos) {

	if (tos > 0xff || tos < 0) {
		ERR("tos out of range");
		return -1;
	}

	s->ss->tos=(uint8_t)tos;

	return 1;
}

int scan_setbroken(const char *instr) {

	if (instr == NULL || strlen(instr) < 1) {
		return -1;
	}

	if (instr[0] == 'N') {
		SET_BROKENNET(1);
	}
	else if (instr[0] == 'T') {
		SET_BROKENTRANS(1);
	}
	else {
		return -1;
	}

	if (instr[1] != '\0') {
		if (instr[1] == 'N') {
			SET_BROKENNET(1);
		}
		else if (instr[1] == 'T') {
			SET_BROKENTRANS(1);
		}
		else {
			return -1;
		}
	}

	return 1;
}

int scan_settcpflags(int flags) {

	if (flags < 0 || flags > 0xff) {
		ERR("TCP flags out of range");
		return -1;
	}

	s->ss->tcphdrflgs=flags;

	return 1;
}

int scan_setrecvtimeout(int seconds) {

	if (seconds < 0 || seconds > 0xff) {
		return -1;
	}

	s->ss->recv_timeout=seconds;
	s->global_recv_timeout=seconds;

	return 1;
}

int scan_getrecvtimeout(void) {
	return s->ss->recv_timeout;
}

/*
 * Parse compound mode string (e.g., "A+T", "A100:R3:L15+T", "A+Tsf500")
 * Splits on '+' delimiter and parses each phase separately.
 * Per-phase options override global settings; 0 means use global.
 * Master flags (M_DO_CONNECT etc.) are OR'd globally.
 * Returns: 1 on success, -1 on error
 */
static int scan_parsemode_compound(const char *str) {
	char *dup=NULL, *token=NULL, *saveptr=NULL;
	int phase_count=0, i=0;
	const char *p=NULL;
	scan_phase_t *phases=NULL;

	assert(str != NULL);

	if (strlen(str) < 1) {
		return -1;
	}

	/* count phases by counting '+' delimiters */
	for (p=str; *p != '\0'; p++) {
		if (*p == '+') {
			phase_count++;
		}
	}
	phase_count++; /* N delimiters = N+1 segments */

	DBG(M_CNF, "compound mode: str=`%s' phase_count=%d", str, phase_count);

	/* allocate phase array */
	phases=(scan_phase_t *)xmalloc(sizeof(scan_phase_t) * phase_count);
	memset(phases, 0, sizeof(scan_phase_t) * phase_count);

	/* split and parse each segment */
	dup=xstrdup(str);

	for (token=strtok_r(dup, "+", &saveptr), i=0;
	     token != NULL && i < phase_count;
	     token=strtok_r(NULL, "+", &saveptr), i++) {
		uint8_t mode=0;
		uint16_t flags=0, sf=0, lf=0, mf=0;
		uint32_t pps=0, repeats=0;
		uint8_t timeout=0;

		/* empty token from ++ or leading/trailing + */
		if (strlen(token) < 1) {
			ERR("invalid compound mode `%s': empty phase at position %d", str, i + 1);
			xfree(dup);
			xfree(phases);
			return -1;
		}

		/* use extended parser for per-phase options */
		if (scan_parsemode_ext(token, &mode, &flags, &sf, &lf, &mf, &pps, &repeats, &timeout) < 0) {
			/* scan_parsemode_ext already printed error */
			xfree(dup);
			xfree(phases);
			return -1;
		}

		phases[i].mode=mode;
		phases[i].tcphdrflgs=flags;
		phases[i].send_opts=sf;
		phases[i].recv_opts=lf;
		phases[i].pps=pps;
		phases[i].repeats=repeats;
		phases[i].recv_timeout=timeout;

		/* master flags (M_DO_CONNECT etc.) are global, OR them in */
		s->options |= mf;

		DBG(M_CNF, "compound mode: phase %d: mode=%s pps=%u repeats=%u timeout=%u mf=0x%x options=0x%x",
		    i + 1, strscanmode(mode), pps, repeats, timeout, mf, s->options);
	}

	xfree(dup);

	DBG(M_CNF, "compound mode: after loop i=%d phase_count=%d", i, phase_count);

	/* validate we got expected number of phases (handles +A, A+, A++T, etc.) */
	if (i != phase_count) {
		ERR("invalid compound mode `%s': expected %d phases, got %d (check for leading/trailing/double +)",
		    str, phase_count, i);
		xfree(phases);
		return -1;
	}

	/*
	 * If ARP is used in compound mode, it must be first phase.
	 * ARP filtering only helps BEFORE subsequent scans to reduce blocked sendto() calls.
	 * -mT+A makes no sense since TCP would already run before ARP discovery.
	 */
	{
		int arp_position=-1;
		int j=0;

		for (j=0; j < phase_count; j++) {
			if (phases[j].mode == MODE_ARPSCAN) {
				arp_position=j;
				break;
			}
		}

		if (arp_position > 0) {
			ERR("compound mode `%s': ARP phase must be first for filtering benefit; "
			    "reorder to -mA+... (ARP discovery should precede other scan types)",
			    str);
			xfree(phases);
			return -1;
		}
	}

	/* store in global settings */
	s->phases=phases;
	s->num_phases=(uint8_t)phase_count;
	s->cur_phase=0;

	/* set current scan settings to phase 0 for initial execution */
	s->ss->mode=phases[0].mode;
	s->ss->tcphdrflgs=phases[0].tcphdrflgs;
	s->send_opts |= phases[0].send_opts;
	s->recv_opts |= phases[0].recv_opts;

	/* per-phase overrides global if set (0 = use global) */
	if (phases[0].pps > 0) {
		s->pps=phases[0].pps;
	}
	if (phases[0].repeats > 0) {
		s->repeats=phases[0].repeats;
	}
	if (phases[0].recv_timeout > 0) {
		s->ss->recv_timeout=phases[0].recv_timeout;
	}

	DBG(M_CNF, "compound mode: %d phases parsed from `%s'", phase_count, str);

	return 1;
}

int scan_setoptmode(const char *str) {

	/* check for compound mode ('+' delimiter) */
	if (strchr(str, '+') != NULL) {
		return scan_parsemode_compound(str);
	}

	/* single mode - use existing parser */
	return scan_parsemode(str, &s->ss->mode, &s->ss->tcphdrflgs, &s->send_opts, &s->recv_opts, &s->options, &s->pps);
}

/*
 * Parse phase modifiers after PPS number: :R<repeats>:L<timeout>
 * Modifiers can appear in any order. 0 means use global setting.
 * Returns: 1 on success, -1 on error
 */
static int parse_phase_modifiers(const char *walk, uint32_t *repeats, uint8_t *timeout) {
	unsigned int val=0;

	*repeats=0;
	*timeout=0;

	while (*walk == ':') {
		walk++;

		if (*walk == 'R') {
			walk++;
			if (sscanf(walk, "%u", &val) != 1) {
				ERR("bad repeats value after :R");
				return -1;
			}
			if (val > 0xffff) {
				ERR("repeats value out of range (max 65535)");
				return -1;
			}
			*repeats=(uint32_t)val;

			/* skip past digits */
			for (; *walk != '\0' && isdigit(*walk); walk++) {
				;
			}
		}
		else if (*walk == 'L') {
			walk++;
			if (sscanf(walk, "%u", &val) != 1) {
				ERR("bad timeout value after :L");
				return -1;
			}
			if (val > 0xff) {
				ERR("timeout value out of range (max 255)");
				return -1;
			}
			*timeout=(uint8_t)val;

			/* skip past digits */
			for (; *walk != '\0' && isdigit(*walk); walk++) {
				;
			}
		}
		else {
			ERR("unknown phase modifier `:%c' (valid: :R<repeats> :L<timeout>)", *walk);
			return -1;
		}
	}

	/* verify we consumed all input */
	if (*walk != '\0') {
		ERR("unexpected characters after phase modifiers: `%s'", walk);
		return -1;
	}

	return 1;
}

int scan_parsemode(const char *str, uint8_t *mode, uint16_t *flags, uint16_t *sf, uint16_t *lf, uint16_t *mf, uint32_t *pps) {
	int ret=0;
	const char *walk=NULL;

	assert(str != NULL);
	assert(mode != NULL); assert(flags != NULL); assert(sf != NULL);
	assert(lf != NULL); assert(mf != NULL); assert(pps != NULL);

	if (strlen(str) < 1) {
		return -1;
	}

	*pps=s->pps;

	walk=str;

	if (*walk == 'T') {

		*mode=MODE_TCPSCAN;

		walk++;
		/* check to see if the user specified TCP flags with TCP mode */
		if (strlen(walk) > 0 && !isdigit(*walk) && *walk != ':') {
			ret=decode_tcpflags(walk);
			if (ret < 0) {
				ERR("bad tcp flags `%s'", str);
				return -1;
			}
			*flags=(uint16_t)ret;

			for (;*walk != '\0' && ! isdigit(*walk) && *walk != ':'; walk++) {
				;
			}
		}
		else {
			/* Default to SYN scan if no flags specified */
			*flags=TH_SYN;
		}
	}
	else if (*walk == 'U') {
		*mode=MODE_UDPSCAN;
		walk++;
	}
	else if (*walk == 'A') {
		*mode=MODE_ARPSCAN;
		walk++;
	}
	else if (*walk == 's' && *(walk + 1) == 'f') {
		*mode=MODE_TCPSCAN;
		/* XXX */
		*mf |= M_DO_CONNECT;
		*lf |= L_DO_CONNECT;
		*sf |= S_SENDER_INTR;
		/* XXX */
		if (scan_setretlayers(0xff) < 0) {
			ERR("unable to request packet transfer though IPC, exiting");
	                return -1;
		}
		walk += 2;

		/* check to see if the user specified TCP flags with TCP mode */
		if (strlen(walk) > 0 && *walk != ':') {
			ret=decode_tcpflags(walk);
			if (ret < 0) {
				ERR("bad tcp flags `%s'", str);
				return -1;
			}
			*flags=(uint16_t)ret;

			for (;*walk != '\0' && ! isdigit(*walk) && *walk != ':'; walk++) {
				;
			}
		}
	}
	else {
		ERR("unknown scanning mode `%c'", str[1]);
		return -1;
	}

	if (*walk == '\0') {
		return 1;
	}

	/* parse optional PPS number */
	if (isdigit(*walk)) {
		if (sscanf(walk, "%u", pps) != 1) {
			ERR("bad pps `%s', using default %u", walk, s->pps);
			*pps=s->pps;
		}

		/* skip past digits to any modifiers */
		for (; *walk != '\0' && isdigit(*walk); walk++) {
			;
		}
	}

	/* check for end of string or phase modifiers */
	if (*walk == '\0') {
		return 1;
	}

	/* remainder must be phase modifiers - handled by caller for compound mode */
	return 1;
}

/*
 * Extended mode parser with per-phase options support.
 * Parses: <mode>[<flags>][<pps>][:R<repeats>][:L<timeout>]
 * Example: A100:R3:L15 or TsS500:R2
 * Returns: 1 on success, -1 on error
 */
static int scan_parsemode_ext(const char *str, uint8_t *mode, uint16_t *flags, uint16_t *sf,
                              uint16_t *lf, uint16_t *mf, uint32_t *pps,
                              uint32_t *repeats, uint8_t *timeout) {
	int ret=0;
	const char *walk=NULL;

	assert(str != NULL);
	assert(mode != NULL); assert(flags != NULL); assert(sf != NULL);
	assert(lf != NULL); assert(mf != NULL); assert(pps != NULL);
	assert(repeats != NULL); assert(timeout != NULL);

	if (strlen(str) < 1) {
		return -1;
	}

	/* initialize defaults - 0 means "use global setting" */
	*pps=0;
	*repeats=0;
	*timeout=0;

	walk=str;

	if (*walk == 'T') {

		*mode=MODE_TCPSCAN;

		walk++;
		/* check to see if the user specified TCP flags with TCP mode */
		if (strlen(walk) > 0 && !isdigit(*walk) && *walk != ':') {
			ret=decode_tcpflags(walk);
			if (ret < 0) {
				ERR("bad tcp flags `%s'", str);
				return -1;
			}
			*flags=(uint16_t)ret;

			for (;*walk != '\0' && ! isdigit(*walk) && *walk != ':'; walk++) {
				;
			}
		}
		else {
			/* Default to SYN scan if no flags specified */
			*flags=TH_SYN;
		}
	}
	else if (*walk == 'U') {
		*mode=MODE_UDPSCAN;
		walk++;
	}
	else if (*walk == 'A') {
		*mode=MODE_ARPSCAN;
		walk++;
	}
	else if (*walk == 's' && *(walk + 1) == 'f') {
		*mode=MODE_TCPSCAN;
		/* XXX */
		*mf |= M_DO_CONNECT;
		*lf |= L_DO_CONNECT;
		*sf |= S_SENDER_INTR;
		/* XXX */
		if (scan_setretlayers(0xff) < 0) {
			ERR("unable to request packet transfer though IPC, exiting");
	                return -1;
		}
		walk += 2;

		/* check to see if the user specified TCP flags with TCP mode */
		if (strlen(walk) > 0 && *walk != ':') {
			ret=decode_tcpflags(walk);
			if (ret < 0) {
				ERR("bad tcp flags `%s'", str);
				return -1;
			}
			*flags=(uint16_t)ret;

			for (;*walk != '\0' && ! isdigit(*walk) && *walk != ':'; walk++) {
				;
			}
		}
	}
	else {
		ERR("unknown scanning mode `%c'", str[1]);
		return -1;
	}

	if (*walk == '\0') {
		return 1;
	}

	/* parse optional PPS number */
	if (isdigit(*walk)) {
		if (sscanf(walk, "%u", pps) != 1) {
			ERR("bad pps `%s', using default %u", walk, s->pps);
			*pps=s->pps;
		}

		/* skip past digits to any modifiers */
		for (; *walk != '\0' && isdigit(*walk); walk++) {
			;
		}
	}

	/* check for end of string */
	if (*walk == '\0') {
		return 1;
	}

	/* parse phase modifiers (:R<n> :L<n>) */
	if (*walk == ':') {
		if (parse_phase_modifiers(walk, repeats, timeout) < 0) {
			return -1;
		}
	}
	else {
		ERR("unexpected characters in mode string: `%s'", walk);
		return -1;
	}

	return 1;
}

int decode_tcpflags(const char *str) {
	int ret=0;

	for (; *str != '\0' && (! isdigit(*str)); str++) {
		switch (*str) {
			case 'F':
				ret |= TH_FIN;
				break;
			case 'f':
				ret &= ~(TH_FIN);
				break;
			case 'S':
				ret |= TH_SYN;
				break;
			case 's':
				ret &= ~(TH_SYN);
				break;
			case 'R':
				ret |= TH_RST;
				break;
			case 'r':
				ret &= ~(TH_RST);
				break;
			case 'P':
				ret |= TH_PSH;
				break;
			case 'p':
				ret &= ~(TH_PSH);
				break;
			case 'A':
				ret |= TH_ACK;
				break;
			case 'a':
				ret &= ~(TH_ACK);
				break;
			case 'U':
				ret |= TH_URG;
				break;
			case 'u':
				ret &= ~(TH_URG);
				break;
			case 'E':
				ret |= TH_ECE;
				break;
			case 'e':
				ret &= ~(TH_ECE);
				break;
			case 'C':
				ret |= TH_CWR;
				break;
			case 'c':
				ret &= ~(TH_CWR);
				break;
			default:
				ERR("unknown TCP flag `%c' (FfSsRrPpAaUuEeCc are valid)", *str);
				return -1;
		} /* switch *str */
	} /* for strlen(str) */

	return ret;
}

char *strscanmode(int mode) {
	static char modestr[64];

	CLEAR(modestr);

	switch (mode) {
		case MODE_TCPSCAN:
			strcpy(modestr, "TCPscan");
			break;

		case MODE_UDPSCAN:
			strcpy(modestr, "UDPscan");
			break;

		case MODE_ARPSCAN:
			strcpy(modestr, "ARPscan");
			break;

		case MODE_ICMPSCAN:
			strcpy(modestr, "ICMPscan");
			break;

		case MODE_IPSCAN:
			strcpy(modestr, "IPscan");
			break;

		default:
			sprintf(modestr, "Unknown [%d]", mode);
			break;
	}

	return modestr;
}

/*
 * Load settings from a specific phase into the active scan settings.
 * Used for compound mode to switch between phases (e.g., ARP -> TCP).
 * Per-phase values (pps, repeats, recv_timeout) override global if non-zero.
 * Returns 1 on success, -1 on error.
 */
int load_phase_settings(int phase_index) {
	scan_phase_t *phase=NULL;

	if (s->phases == NULL || phase_index < 0 || phase_index >= s->num_phases) {
		ERR("load_phase_settings: invalid phase %d (num_phases=%d)",
			phase_index, s->num_phases);
		return -1;
	}

	phase=&s->phases[phase_index];

	/* Copy phase-specific settings to active scan settings */
	s->ss->mode=phase->mode;
	s->ss->tcphdrflgs=phase->tcphdrflgs;

	/*
	 * Apply phase-specific send/recv options.
	 * Preserve flags from -s option - these must persist across phases
	 * so the phantom IP is used for all phases:
	 * - S_SRC_OVERRIDE: tells drone_setup to keep user's source address
	 * - L_USE_PROMISC: enables promiscuous mode to see phantom IP responses
	 */
	{
		uint16_t preserve_override = s->send_opts & S_SRC_OVERRIDE;
		uint16_t preserve_promisc = s->recv_opts & L_USE_PROMISC;
		s->send_opts = phase->send_opts | preserve_override;
		s->recv_opts = phase->recv_opts | preserve_promisc;
	}

	/* Apply phase-specific PPS if set, otherwise restore global -r rate */
	if (phase->pps > 0) {
		s->pps=phase->pps;
	}
	else {
		s->pps=s->global_pps;
	}

	/* Apply phase-specific repeats if set, otherwise restore global -R repeats */
	if (phase->repeats > 0) {
		s->repeats=phase->repeats;
	}
	else {
		s->repeats=s->global_repeats;
	}

	/* Apply phase-specific recv_timeout if set, otherwise restore global -L timeout */
	if (phase->recv_timeout > 0) {
		s->ss->recv_timeout=phase->recv_timeout;
	}
	else {
		s->ss->recv_timeout=s->global_recv_timeout;
	}

	VRB(1, "phase %d: mode %s, tcphdrflgs 0x%04x, pps %u, repeats %u, timeout %u",
		phase_index + 1,
		strscanmode(phase->mode),
		phase->tcphdrflgs,
		s->pps,
		s->repeats,
		s->ss->recv_timeout);

	return 1;
}
