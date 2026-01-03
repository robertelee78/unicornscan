/**
 * p0f v3 fingerprint parser - integrated OS detection
 * All signatures are embedded directly - NO external dependencies
 *
 * Signatures derived from p0f v3 by Michal Zalewski <lcamtuf@coredump.cx>
 */
#include <config.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#include <settings.h>
#include <unilib/output.h>
#include <unilib/xmalloc.h>

#include "module.h"
#include "p0f3_parse.h"

/*
 * Embedded TCP SYN+ACK signatures (what we see when scanning)
 * Format: { label, ttl, df, win_type, win_val, win_scale, mss, opt_layout, quirks }
 *
 * opt_layout is a string like "mss,sok,ts,nop,ws"
 * -1 for wildcards
 */
typedef struct {
	const char *os_name;
	const char *os_flavor;
	int ttl;           /* Initial TTL (-1 = any) */
	int df;            /* DF flag (0/1, -1 = any) */
	int win_type;      /* P0F3_WIN_TYPE_* */
	int win_val;       /* Window value or multiplier */
	int win_scale;     /* Window scale (-1 = any) */
	int mss;           /* MSS value (-1 = any) */
	const char *opts;  /* TCP options layout */
	uint32_t quirks;   /* Quirk flags */
} embedded_sig_t;

/* Embedded SYN+ACK signatures for common operating systems */
static const embedded_sig_t embedded_response_sigs[] = {
	/* Linux 3.x / 4.x / 5.x / 6.x (modern kernels) */
	{ "Linux", "3.x+", 64, 1, P0F3_WIN_TYPE_MSS, 10, 0, -1, "mss", P0F3_QUIRK_DF },
	{ "Linux", "3.x+", 64, 1, P0F3_WIN_TYPE_MSS, 10, 0, -1, "mss,sok,ts", P0F3_QUIRK_DF },
	{ "Linux", "3.x+", 64, 1, P0F3_WIN_TYPE_MSS, 10, 0, -1, "mss,nop,nop,ts", P0F3_QUIRK_DF },
	{ "Linux", "3.x+", 64, 1, P0F3_WIN_TYPE_MSS, 10, 0, -1, "mss,nop,nop,sok", P0F3_QUIRK_DF },
	{ "Linux", "3.x+", 64, 1, P0F3_WIN_TYPE_MSS, 10, -1, -1, "mss,nop,ws", P0F3_QUIRK_DF },
	{ "Linux", "3.x+", 64, 1, P0F3_WIN_TYPE_MSS, 10, -1, -1, "mss,sok,ts,nop,ws", P0F3_QUIRK_DF },
	{ "Linux", "3.x+", 64, 1, P0F3_WIN_TYPE_MSS, 10, -1, -1, "mss,nop,nop,ts,nop,ws", P0F3_QUIRK_DF },
	{ "Linux", "3.x+", 64, 1, P0F3_WIN_TYPE_MSS, 10, -1, -1, "mss,nop,nop,sok,nop,ws", P0F3_QUIRK_DF },

	/* Linux 2.6.x */
	{ "Linux", "2.6.x", 64, 1, P0F3_WIN_TYPE_MSS, 4, -1, -1, "mss,nop,ws", P0F3_QUIRK_DF },
	{ "Linux", "2.6.x", 64, 1, P0F3_WIN_TYPE_MSS, 4, -1, -1, "mss,sok,ts,nop,ws", P0F3_QUIRK_DF },
	{ "Linux", "2.6.x", 64, 1, P0F3_WIN_TYPE_MSS, 4, -1, -1, "mss,nop,nop,ts,nop,ws", P0F3_QUIRK_DF },
	{ "Linux", "2.6.x", 64, 1, P0F3_WIN_TYPE_MSS, 4, -1, -1, "mss,nop,nop,sok,nop,ws", P0F3_QUIRK_DF },

	/* Linux 2.4-2.6 */
	{ "Linux", "2.4-2.6", 64, 1, P0F3_WIN_TYPE_MSS, 4, 0, -1, "mss", P0F3_QUIRK_DF },
	{ "Linux", "2.4-2.6", 64, 1, P0F3_WIN_TYPE_MSS, 4, 0, -1, "mss,sok,ts", P0F3_QUIRK_DF },
	{ "Linux", "2.4-2.6", 64, 1, P0F3_WIN_TYPE_MSS, 4, 0, -1, "mss,nop,nop,ts", P0F3_QUIRK_DF },
	{ "Linux", "2.4-2.6", 64, 1, P0F3_WIN_TYPE_MSS, 4, 0, -1, "mss,nop,nop,sok", P0F3_QUIRK_DF },

	/* Windows XP */
	{ "Windows", "XP", 128, 1, P0F3_WIN_TYPE_NORMAL, 65535, 0, -1, "mss", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Windows", "XP", 128, 1, P0F3_WIN_TYPE_NORMAL, 65535, 0, -1, "mss,nop,ws", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Windows", "XP", 128, 1, P0F3_WIN_TYPE_NORMAL, 65535, 0, -1, "mss,nop,nop,sok", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Windows", "XP", 128, 1, P0F3_WIN_TYPE_NORMAL, 65535, 0, -1, "mss,nop,nop,ts", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS | P0F3_QUIRK_TS1_MINUS },
	{ "Windows", "XP", 128, 1, P0F3_WIN_TYPE_NORMAL, 16384, 0, -1, "mss", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Windows", "XP", 128, 1, P0F3_WIN_TYPE_NORMAL, 16384, 0, -1, "mss,nop,ws", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },

	/* Windows 7/8/10/11 */
	{ "Windows", "7+", 128, 1, P0F3_WIN_TYPE_NORMAL, 8192, 0, -1, "mss", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Windows", "7+", 128, 1, P0F3_WIN_TYPE_NORMAL, 8192, 0, -1, "mss,sok,ts", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Windows", "7+", 128, 1, P0F3_WIN_TYPE_NORMAL, 8192, 8, -1, "mss,nop,ws", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Windows", "7+", 128, 1, P0F3_WIN_TYPE_NORMAL, 8192, 0, -1, "mss,nop,nop,ts", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Windows", "7+", 128, 1, P0F3_WIN_TYPE_NORMAL, 8192, 0, -1, "mss,nop,nop,sok", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Windows", "7+", 128, 1, P0F3_WIN_TYPE_NORMAL, 8192, 8, -1, "mss,nop,ws,sok,ts", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Windows", "7+", 128, 1, P0F3_WIN_TYPE_NORMAL, 8192, 8, -1, "mss,nop,ws,nop,nop,ts", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Windows", "7+", 128, 1, P0F3_WIN_TYPE_NORMAL, 8192, 8, -1, "mss,nop,ws,nop,nop,sok", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },

	/* FreeBSD 9.x+ */
	{ "FreeBSD", "9.x+", 64, 1, P0F3_WIN_TYPE_NORMAL, 65535, 6, -1, "mss,nop,ws", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "FreeBSD", "9.x+", 64, 1, P0F3_WIN_TYPE_NORMAL, 65535, 6, -1, "mss,nop,ws,sok,ts", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "FreeBSD", "9.x+", 64, 1, P0F3_WIN_TYPE_NORMAL, 65535, 6, -1, "mss,nop,ws,nop,nop,ts", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },

	/* FreeBSD 8.x */
	{ "FreeBSD", "8.x", 64, 1, P0F3_WIN_TYPE_NORMAL, 65535, 3, -1, "mss,nop,ws", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "FreeBSD", "8.x", 64, 1, P0F3_WIN_TYPE_NORMAL, 65535, 3, -1, "mss,nop,ws,sok,ts", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "FreeBSD", "8.x", 64, 1, P0F3_WIN_TYPE_NORMAL, 65535, 3, -1, "mss,nop,ws,nop,nop,ts", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },

	/* OpenBSD 5.x+ */
	{ "OpenBSD", "5.x+", 64, 1, P0F3_WIN_TYPE_NORMAL, 16384, 0, 1460, "mss,nop,nop,sok", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "OpenBSD", "5.x+", 64, 1, P0F3_WIN_TYPE_NORMAL, 16384, 3, 1460, "mss,nop,ws", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "OpenBSD", "5.x+", 64, 1, P0F3_WIN_TYPE_NORMAL, 16384, 3, 1460, "mss,nop,nop,sok,nop,ws", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "OpenBSD", "5.x+", 64, 1, P0F3_WIN_TYPE_NORMAL, 16384, 0, 1460, "mss,nop,nop,ts", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "OpenBSD", "5.x+", 64, 1, P0F3_WIN_TYPE_NORMAL, 16384, 3, 1460, "mss,nop,ws,nop,nop,ts", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },

	/* NetBSD */
	{ "NetBSD", "5.x+", 64, 1, P0F3_WIN_TYPE_NORMAL, 32768, 0, 1460, "mss,nop,nop,ts", P0F3_QUIRK_DF },
	{ "NetBSD", "5.x+", 64, 1, P0F3_WIN_TYPE_NORMAL, 32768, 1, 1460, "mss,nop,ws,nop,nop,ts", P0F3_QUIRK_DF },

	/* Mac OS X */
	{ "Mac OS X", "10.x", 64, 1, P0F3_WIN_TYPE_NORMAL, 65535, 0, -1, "mss,nop,ws", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Mac OS X", "10.x", 64, 1, P0F3_WIN_TYPE_NORMAL, 65535, 0, -1, "mss,nop,nop,ts", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Mac OS X", "10.x", 64, 1, P0F3_WIN_TYPE_NORMAL, 65535, 0, -1, "mss,nop,ws,nop,nop,ts", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Mac OS X", "10.x", 64, 1, P0F3_WIN_TYPE_NORMAL, 65535, 0, -1, "mss,nop,ws,nop,nop,ts,sok", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },

	/* iOS / macOS modern (iOS 15+, macOS 12+) - with EOL and ID- quirk */
	{ "iOS/macOS", "15+", 64, 1, P0F3_WIN_TYPE_NORMAL, 65535, 5, -1, "mss,nop,ws,nop,nop,ts,sok,eol", P0F3_QUIRK_DF | P0F3_QUIRK_ID_MINUS | P0F3_QUIRK_TS2_PLUS },
	{ "iOS/macOS", "15+", 64, 1, P0F3_WIN_TYPE_NORMAL, 65535, 6, -1, "mss,nop,ws,nop,nop,ts,sok,eol", P0F3_QUIRK_DF | P0F3_QUIRK_ID_MINUS | P0F3_QUIRK_TS2_PLUS },
	{ "iOS/macOS", "15+", 64, 1, P0F3_WIN_TYPE_NORMAL, 65535, 7, -1, "mss,nop,ws,nop,nop,ts,sok,eol", P0F3_QUIRK_DF | P0F3_QUIRK_ID_MINUS | P0F3_QUIRK_TS2_PLUS },
	{ "iOS/macOS", "15+", 64, 1, P0F3_WIN_TYPE_NORMAL, 65535, 8, -1, "mss,nop,ws,nop,nop,ts,sok,eol", P0F3_QUIRK_DF | P0F3_QUIRK_ID_MINUS | P0F3_QUIRK_TS2_PLUS },

	/* iOS / macOS older (iOS 14 and earlier, macOS 11 and earlier) */
	{ "iOS/macOS", "14-", 64, 1, P0F3_WIN_TYPE_NORMAL, 65535, 5, -1, "mss,nop,ws,nop,nop,ts,sok", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "iOS/macOS", "14-", 64, 1, P0F3_WIN_TYPE_NORMAL, 65535, 6, -1, "mss,nop,ws,nop,nop,ts,sok", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },

	/* Solaris 10/11 */
	{ "Solaris", "10+", 64, 1, P0F3_WIN_TYPE_MSS, 37, 0, -1, "mss", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Solaris", "10+", 64, 1, P0F3_WIN_TYPE_MSS, 37, 0, -1, "mss,nop,ws", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Solaris", "10+", 64, 1, P0F3_WIN_TYPE_MSS, 37, 0, -1, "nop,nop,ts,mss", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Solaris", "10+", 64, 1, P0F3_WIN_TYPE_MSS, 37, 0, -1, "mss,nop,nop,sok", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },

	/* HP-UX */
	{ "HP-UX", "11.x", 64, 1, P0F3_WIN_TYPE_NORMAL, 32768, 0, -1, "mss", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "HP-UX", "11.x", 64, 1, P0F3_WIN_TYPE_NORMAL, 32768, 0, -1, "mss,nop,nop,ts", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "HP-UX", "11.x", 64, 1, P0F3_WIN_TYPE_NORMAL, 32768, 0, -1, "mss,nop,nop,sok", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },

	/* AIX */
	{ "AIX", "5.x+", 64, 1, P0F3_WIN_TYPE_NORMAL, 16384, 0, -1, "mss", P0F3_QUIRK_DF },
	{ "AIX", "5.x+", 64, 1, P0F3_WIN_TYPE_NORMAL, 16384, 0, -1, "mss,nop,nop,ts", P0F3_QUIRK_DF },
	{ "AIX", "5.x+", 64, 1, P0F3_WIN_TYPE_NORMAL, 16384, 1, -1, "mss,nop,ws,nop,nop,ts", P0F3_QUIRK_DF },

	/* Cisco IOS */
	{ "Cisco", "IOS", 255, 1, P0F3_WIN_TYPE_NORMAL, 4128, 0, -1, "mss", P0F3_QUIRK_DF },
	{ "Cisco", "IOS", 255, 0, P0F3_WIN_TYPE_NORMAL, 4128, 0, -1, "mss", 0 },

	/* Android (Linux-based) */
	{ "Android", "4.x+", 64, 1, P0F3_WIN_TYPE_MSS, 10, -1, -1, "mss,sok,ts,nop,ws", P0F3_QUIRK_DF },
	{ "Android", "4.x+", 64, 1, P0F3_WIN_TYPE_MSS, 10, -1, -1, "mss,nop,nop,ts,nop,ws", P0F3_QUIRK_DF },

	/* Linux embedded/IoT (Raspberry Pi, routers, etc.) - smaller window */
	{ "Linux", "embedded", 64, 1, P0F3_WIN_TYPE_NORMAL, 29200, 3, -1, "mss,nop,nop,sok,nop,ws", P0F3_QUIRK_DF | P0F3_QUIRK_ID_MINUS },
	{ "Linux", "embedded", 64, 1, P0F3_WIN_TYPE_NORMAL, 29200, 7, -1, "mss,nop,nop,sok,nop,ws", P0F3_QUIRK_DF | P0F3_QUIRK_ID_MINUS },

	/* Generic Linux (catch-all) */
	{ "Linux", "", 64, 1, P0F3_WIN_TYPE_ANY, 0, -1, -1, "mss,sok,ts,nop,ws", P0F3_QUIRK_DF },
	{ "Linux", "", 64, 1, P0F3_WIN_TYPE_ANY, 0, -1, -1, "mss,nop,nop,ts,nop,ws", P0F3_QUIRK_DF },
	{ "Linux", "", 64, 1, P0F3_WIN_TYPE_ANY, 0, -1, -1, "mss,nop,nop,sok,nop,ws", P0F3_QUIRK_DF },

	/* Generic Windows (catch-all) */
	{ "Windows", "", 128, 1, P0F3_WIN_TYPE_ANY, 0, -1, -1, "mss,nop,ws,nop,nop,sok", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },
	{ "Windows", "", 128, 1, P0F3_WIN_TYPE_ANY, 0, 8, -1, "mss,nop,ws", P0F3_QUIRK_DF | P0F3_QUIRK_ID_PLUS },

	/* End marker */
	{ NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 0 }
};

/* Parsed signature cache */
static p0f3_sig_t *tcp_response_sigs = NULL;
static int tcp_response_count = 0;
static int sigs_initialized = 0;

/* Parse options string like "mss,sok,ts,nop,ws" into opt array */
static int parse_opts_str(const char *opts_str, p0f3_opt_t *opts) {
	char *copy, *p, *tok;
	int cnt = 0;

	if (!opts_str || !opts_str[0]) return 0;

	copy = xstrdup(opts_str);
	p = copy;

	while ((tok = strsep(&p, ",")) != NULL && cnt < P0F3_MAX_OPTS) {
		while (*tok == ' ') tok++;  /* trim leading space */

		if (strcmp(tok, "mss") == 0) {
			opts[cnt].type = P0F3_OPT_MSS;
		} else if (strcmp(tok, "ws") == 0) {
			opts[cnt].type = P0F3_OPT_WS;
		} else if (strcmp(tok, "sok") == 0) {
			opts[cnt].type = P0F3_OPT_SOK;
		} else if (strcmp(tok, "sack") == 0) {
			opts[cnt].type = P0F3_OPT_SACK;
		} else if (strcmp(tok, "ts") == 0) {
			opts[cnt].type = P0F3_OPT_TS;
		} else if (strcmp(tok, "nop") == 0) {
			opts[cnt].type = P0F3_OPT_NOP;
		} else if (strcmp(tok, "eol") == 0) {
			opts[cnt].type = P0F3_OPT_EOL;
		} else {
			opts[cnt].type = P0F3_OPT_ANY;
		}
		opts[cnt].value = 0;
		cnt++;
	}

	xfree(copy);
	return cnt;
}

/* Initialize signatures from embedded data */
int p0f3_load_sigs(const char *filename) {
	const embedded_sig_t *esig;
	p0f3_sig_t *sig;
	int loaded = 0;

	(void)filename;  /* Unused - we use embedded sigs */

	if (sigs_initialized) {
		return tcp_response_count;
	}

	for (esig = embedded_response_sigs; esig->os_name != NULL; esig++) {
		sig = xmalloc(sizeof(p0f3_sig_t));
		memset(sig, 0, sizeof(p0f3_sig_t));

		/* Copy OS info */
		sig->os_name = xstrdup(esig->os_name);
		sig->os_flavor = esig->os_flavor[0] ? xstrdup(esig->os_flavor) : NULL;
		sig->label = xmalloc(128);
		snprintf(sig->label, 128, "s:unix:%s:%s", esig->os_name,
		         esig->os_flavor ? esig->os_flavor : "");

		/* Copy signature fields */
		sig->ip_ver = 4;  /* IPv4 only for now */
		sig->ttl = esig->ttl;
		sig->ip_opt_len = 0;
		sig->mss = esig->mss;
		sig->win_type = esig->win_type;
		sig->win_val = esig->win_val;
		sig->win_scale = esig->win_scale;
		sig->quirks = esig->quirks;

		/* Parse TCP options */
		sig->opt_cnt = parse_opts_str(esig->opts, sig->opts);

		/* Add to list */
		sig->next = tcp_response_sigs;
		tcp_response_sigs = sig;
		tcp_response_count++;
		loaded++;
	}

	sigs_initialized = 1;
	DBG(M_MOD, "Loaded %d embedded p0f signatures", loaded);

	return loaded;
}

/* Check if TCP options match */
static int opts_match(const p0f3_opt_t *sig_opts, int sig_cnt,
                      const p0f3_opt_t *pkt_opts, int pkt_cnt) {
	int i;

	if (sig_cnt != pkt_cnt) return 0;

	for (i = 0; i < sig_cnt; i++) {
		if (sig_opts[i].type == P0F3_OPT_ANY) continue;
		if (sig_opts[i].type != pkt_opts[i].type) return 0;
	}

	return 1;
}

/* Check if window size matches */
static int win_match(p0f3_sig_t *sig, p0f3_pkt_t *pkt) {
	int expected;

	if (sig->win_type == P0F3_WIN_TYPE_ANY) return 1;

	switch (sig->win_type) {
		case P0F3_WIN_TYPE_MSS:
			if (pkt->mss <= 0) return 0;
			expected = pkt->mss * sig->win_val;
			break;
		case P0F3_WIN_TYPE_MTU:
			if (pkt->mss <= 0) return 0;
			expected = (pkt->mss + 40) * sig->win_val;
			break;
		case P0F3_WIN_TYPE_NORMAL:
			expected = sig->win_val;
			break;
		default:
			return 1;
	}

	/* Allow 10% tolerance */
	int diff = abs(pkt->win - expected);
	return (diff <= expected / 10 || diff <= 1);
}

/* Match a packet against loaded signatures */
const char *p0f3_match(p0f3_pkt_t *pkt, p0f3_sig_type_t type) {
	p0f3_sig_t *sig = p0f3_match_detailed(pkt, type);
	if (sig) {
		static char result[256];
		if (sig->os_name && sig->os_flavor && sig->os_flavor[0]) {
			snprintf(result, sizeof(result), "%s %s", sig->os_name, sig->os_flavor);
		} else if (sig->os_name) {
			snprintf(result, sizeof(result), "%s", sig->os_name);
		} else {
			return NULL;
		}
		return result;
	}
	return NULL;
}

/* Get detailed match info */
p0f3_sig_t *p0f3_match_detailed(p0f3_pkt_t *pkt, p0f3_sig_type_t type) {
	p0f3_sig_t *sig;
	p0f3_sig_t *best_match = NULL;
	int best_score = 0;

	/* We only have SYN+ACK sigs right now */
	if (type != P0F3_SIG_TCP_RESPONSE) {
		return NULL;
	}

	/* Make sure sigs are loaded */
	if (!sigs_initialized) {
		p0f3_load_sigs(NULL);
	}

	for (sig = tcp_response_sigs; sig != NULL; sig = sig->next) {
		int score = 0;

		/* Check TTL (allow for decremented TTL in transit) */
		if (sig->ttl > 0) {
			int ttl_diff = sig->ttl - pkt->ttl;
			if (ttl_diff < 0 || ttl_diff > 35) continue;
			score += (35 - ttl_diff);  /* Closer TTL = higher score */
		}

		/* Check DF quirk */
		int sig_df = (sig->quirks & P0F3_QUIRK_DF) ? 1 : 0;
		int pkt_df = (pkt->quirks & P0F3_QUIRK_DF) ? 1 : 0;
		if (sig_df && !pkt_df) continue;  /* Sig requires DF, packet doesn't have it */
		if (sig_df == pkt_df) score += 5;

		/* Check window size */
		if (!win_match(sig, pkt)) continue;
		score += 15;

		/* Check window scale */
		if (sig->win_scale != -1) {
			if (sig->win_scale != pkt->win_scale) continue;
			score += 10;
		}

		/* Check MSS if specified */
		if (sig->mss != -1) {
			if (sig->mss != pkt->mss) continue;
			score += 10;
		}

		/* Check TCP options layout */
		if (!opts_match(sig->opts, sig->opt_cnt, pkt->opts, pkt->opt_cnt)) continue;
		score += 25;

		/* Prefer more specific signatures */
		if (sig->os_flavor && sig->os_flavor[0]) score += 5;

		if (score > best_score) {
			best_score = score;
			best_match = sig;
		}
	}

	return best_match;
}

/* Clean up */
void p0f3_cleanup_sigs(void) {
	p0f3_sig_t *sig, *next;

	for (sig = tcp_response_sigs; sig; sig = next) {
		next = sig->next;
		if (sig->label) xfree(sig->label);
		if (sig->os_class) xfree(sig->os_class);
		if (sig->os_name) xfree(sig->os_name);
		if (sig->os_flavor) xfree(sig->os_flavor);
		xfree(sig);
	}
	tcp_response_sigs = NULL;
	tcp_response_count = 0;
	sigs_initialized = 0;
}

/* Get number of loaded signatures */
int p0f3_get_sig_count(p0f3_sig_type_t type) {
	if (type == P0F3_SIG_TCP_RESPONSE) return tcp_response_count;
	return 0;
}

/* Track seen fingerprints to avoid duplicate logging */
#define MAX_SEEN_FPS 64
static uint32_t seen_fp_hashes[MAX_SEEN_FPS];
static int seen_fp_count = 0;

/* Simple hash for fingerprint deduplication */
static uint32_t fp_hash(p0f3_pkt_t *pkt) {
	uint32_t h = 0;
	int i;
	h = pkt->ttl ^ (pkt->win << 8) ^ (pkt->win_scale << 16) ^ pkt->quirks;
	for (i = 0; i < pkt->opt_cnt && i < P0F3_MAX_OPTS; i++) {
		h ^= (pkt->opts[i].type << (i * 3));
	}
	return h;
}

/* Dump unknown fingerprint for debugging (once per unique fingerprint) */
void p0f3_dump_unknown(p0f3_pkt_t *pkt) {
	char opts_str[256];
	char quirks_str[256];
	int i, pos = 0, qpos = 0;
	uint32_t h;
	const char *opt_names[] = {
		[P0F3_OPT_EOL] = "eol",
		[P0F3_OPT_NOP] = "nop",
		[P0F3_OPT_MSS] = "mss",
		[P0F3_OPT_WS] = "ws",
		[P0F3_OPT_SOK] = "sok",
		[P0F3_OPT_SACK] = "sack",
		[P0F3_OPT_TS] = "ts"
	};

	/* Check if we've already seen this fingerprint */
	h = fp_hash(pkt);
	for (i = 0; i < seen_fp_count; i++) {
		if (seen_fp_hashes[i] == h) return;  /* Already logged */
	}
	/* Record this fingerprint */
	if (seen_fp_count < MAX_SEEN_FPS) {
		seen_fp_hashes[seen_fp_count++] = h;
	}

	/* Build options string */
	opts_str[0] = '\0';
	for (i = 0; i < pkt->opt_cnt && i < P0F3_MAX_OPTS; i++) {
		int t = pkt->opts[i].type;
		const char *name = (t >= 0 && t <= 8 && opt_names[t]) ? opt_names[t] : "?";
		if (i > 0) pos += snprintf(opts_str + pos, sizeof(opts_str) - pos, ",");
		pos += snprintf(opts_str + pos, sizeof(opts_str) - pos, "%s", name);
	}

	/* Build quirks string */
	quirks_str[0] = '\0';
	if (pkt->quirks & P0F3_QUIRK_DF) qpos += snprintf(quirks_str + qpos, sizeof(quirks_str) - qpos, "DF,");
	if (pkt->quirks & P0F3_QUIRK_ID_PLUS) qpos += snprintf(quirks_str + qpos, sizeof(quirks_str) - qpos, "ID+,");
	if (pkt->quirks & P0F3_QUIRK_ID_MINUS) qpos += snprintf(quirks_str + qpos, sizeof(quirks_str) - qpos, "ID-,");
	if (pkt->quirks & P0F3_QUIRK_ECN) qpos += snprintf(quirks_str + qpos, sizeof(quirks_str) - qpos, "ECN,");
	if (pkt->quirks & P0F3_QUIRK_SEQ_MINUS) qpos += snprintf(quirks_str + qpos, sizeof(quirks_str) - qpos, "SEQ-,");
	if (pkt->quirks & P0F3_QUIRK_ACK_PLUS) qpos += snprintf(quirks_str + qpos, sizeof(quirks_str) - qpos, "ACK+,");
	if (pkt->quirks & P0F3_QUIRK_ACK_MINUS) qpos += snprintf(quirks_str + qpos, sizeof(quirks_str) - qpos, "ACK-,");
	if (pkt->quirks & P0F3_QUIRK_URG_PLUS) qpos += snprintf(quirks_str + qpos, sizeof(quirks_str) - qpos, "URG+,");
	if (pkt->quirks & P0F3_QUIRK_PUSH) qpos += snprintf(quirks_str + qpos, sizeof(quirks_str) - qpos, "PUSH,");
	if (pkt->quirks & P0F3_QUIRK_TS1_MINUS) qpos += snprintf(quirks_str + qpos, sizeof(quirks_str) - qpos, "TS1-,");
	if (pkt->quirks & P0F3_QUIRK_TS2_PLUS) qpos += snprintf(quirks_str + qpos, sizeof(quirks_str) - qpos, "TS2+,");
	if (qpos > 0) quirks_str[qpos - 1] = '\0';  /* Remove trailing comma */
	if (quirks_str[0] == '\0') snprintf(quirks_str, sizeof(quirks_str), "none");

	/* Output in a format suitable for adding as a signature */
	VRB(0, "Unknown p0f fingerprint: ver=%d ttl=%d olen=%d mss=%d win=%d,ws=%d opts=[%s] quirks=[%s]",
		pkt->ip_ver,
		pkt->ttl,
		pkt->ip_opt_len,
		pkt->mss,
		pkt->win,
		pkt->win_scale,
		opts_str,
		quirks_str);

	/* Output in C signature format for easy copy-paste */
	VRB(0, "  Signature: { \"Unknown\", \"\", %d, %d, P0F3_WIN_TYPE_NORMAL, %d, %d, %d, \"%s\", 0x%04x },",
		pkt->ttl,
		(pkt->quirks & P0F3_QUIRK_DF) ? 1 : 0,
		pkt->win,
		pkt->win_scale,
		pkt->mss,
		opts_str,
		pkt->quirks);
}
