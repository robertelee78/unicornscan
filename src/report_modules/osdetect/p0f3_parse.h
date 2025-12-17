/**
 * p0f v3 fingerprint file parser - integrated OS detection
 * Parses /etc/p0f/p0f.fp directly without requiring external daemon
 */
#ifndef P0F3_PARSE_H
#define P0F3_PARSE_H

#include <stdint.h>
#include <sys/types.h>

/* Maximum TCP options we track */
#define P0F3_MAX_OPTS 16

/* Window size types */
#define P0F3_WIN_TYPE_NORMAL   0   /* Raw value */
#define P0F3_WIN_TYPE_MSS      1   /* mss*N */
#define P0F3_WIN_TYPE_MTU      2   /* mtu*N */
#define P0F3_WIN_TYPE_MOD      3   /* N%M */
#define P0F3_WIN_TYPE_ANY      4   /* Wildcard * */

/* TCP option types in p0f format */
#define P0F3_OPT_EOL      0
#define P0F3_OPT_NOP      1
#define P0F3_OPT_MSS      2
#define P0F3_OPT_WS       3
#define P0F3_OPT_SOK      4   /* SACK OK */
#define P0F3_OPT_SACK     5
#define P0F3_OPT_TS       8
#define P0F3_OPT_ANY     -1   /* Wildcard ? */

/* Quirks flags */
#define P0F3_QUIRK_DF         0x0001   /* Don't fragment */
#define P0F3_QUIRK_NDF        0x0002   /* Don't fragment NOT set */
#define P0F3_QUIRK_ID_PLUS    0x0004   /* IP ID non-zero */
#define P0F3_QUIRK_ID_MINUS   0x0008   /* IP ID zero */
#define P0F3_QUIRK_ECN        0x0010   /* ECN support */
#define P0F3_QUIRK_ZERO_PLUS  0x0020   /* "must be zero" field not zero */
#define P0F3_QUIRK_FLOW       0x0040   /* IPv6 flow ID non-zero */
#define P0F3_QUIRK_SEQ_MINUS  0x0080   /* Sequence number zero */
#define P0F3_QUIRK_ACK_PLUS   0x0100   /* ACK number non-zero in SYN */
#define P0F3_QUIRK_ACK_MINUS  0x0200   /* ACK number zero in SYN+ACK */
#define P0F3_QUIRK_URG_PLUS   0x0400   /* URG pointer non-zero but flag not set */
#define P0F3_QUIRK_PUSH       0x0800   /* PUSH flag set */
#define P0F3_QUIRK_TS1_MINUS  0x1000   /* Own timestamp zero */
#define P0F3_QUIRK_TS2_PLUS   0x2000   /* Peer timestamp non-zero in SYN */
#define P0F3_QUIRK_OPT_PLUS   0x4000   /* Non-zero data in option padding */
#define P0F3_QUIRK_EXWS       0x8000   /* Excessive window scaling */

/* Signature types */
typedef enum {
	P0F3_SIG_TCP_REQUEST,   /* SYN */
	P0F3_SIG_TCP_RESPONSE,  /* SYN+ACK */
	P0F3_SIG_MTU,
	P0F3_SIG_HTTP_REQUEST,
	P0F3_SIG_HTTP_RESPONSE
} p0f3_sig_type_t;

/* TCP option in signature */
typedef struct p0f3_opt {
	int type;      /* Option type or -1 for wildcard */
	int value;     /* Value if applicable (e.g., WS value) */
} p0f3_opt_t;

/* A single p0f fingerprint signature */
typedef struct p0f3_sig {
	char *label;           /* OS label (e.g., "s:unix:Linux:3.x") */
	char *os_class;        /* Extracted class (unix, win, other) */
	char *os_name;         /* Extracted name (Linux, Windows, etc.) */
	char *os_flavor;       /* Extracted version/flavor */

	/* Signature fields */
	int ip_ver;            /* IP version, -1 = any */
	int ttl;               /* Initial TTL, -1 = any */
	int ip_opt_len;        /* IP options length, -1 = any */
	int mss;               /* MSS value, -1 = any */

	/* Window size - can be expression */
	int win_type;          /* P0F3_WIN_TYPE_* */
	int win_val;           /* Value or multiplier */
	int win_scale;         /* Window scale, -1 = any */

	/* TCP options layout */
	p0f3_opt_t opts[P0F3_MAX_OPTS];
	int opt_cnt;

	/* Quirks */
	uint32_t quirks;

	/* Payload class (0 = no payload) */
	int pclass;

	struct p0f3_sig *next;
} p0f3_sig_t;

/* Observed packet info for matching */
typedef struct p0f3_pkt {
	int ip_ver;
	int ttl;
	int ip_opt_len;
	int mss;              /* From MSS option */
	int win;              /* Window size */
	int win_scale;        /* From WS option, -1 if not present */
	uint32_t quirks;

	/* Observed TCP options */
	p0f3_opt_t opts[P0F3_MAX_OPTS];
	int opt_cnt;

	int has_payload;
} p0f3_pkt_t;

/* Initialize and load fingerprints from file */
int p0f3_load_sigs(const char *filename);

/* Match a packet against loaded signatures */
const char *p0f3_match(p0f3_pkt_t *pkt, p0f3_sig_type_t type);

/* Get detailed match info */
p0f3_sig_t *p0f3_match_detailed(p0f3_pkt_t *pkt, p0f3_sig_type_t type);

/* Clean up */
void p0f3_cleanup_sigs(void);

/* Get number of loaded signatures */
int p0f3_get_sig_count(p0f3_sig_type_t type);

#endif /* P0F3_PARSE_H */
