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
#ifndef _SCAN_EXPORTS_H
# define _SCAN_EXPORTS_H

#ifndef TH_FIN
# define TH_FIN			1
#endif
#ifndef TH_SYN
# define TH_SYN			2
#endif
#ifndef TH_RST
# define TH_RST			4
#endif
#ifndef TH_PUSH
# define TH_PUSH		8
#endif
#ifndef TH_PSH
# define TH_PSH			8
#endif
#ifndef TH_ACK
# define TH_ACK			16
#endif
#ifndef TH_URG
# define TH_URG			32
#endif
#ifndef TH_ECE
# define TH_ECE			64
#endif
#ifndef TH_CWR
# define TH_CWR			128
#endif

#define MODE_TCPSCAN			1
#define MODE_UDPSCAN			2
#define MODE_ARPSCAN			4
#define MODE_ICMPSCAN			8
#define MODE_IPSCAN			16
#define MODE_TCPTRACE			32	/* TCP traceroute with TTL iteration	*/

/*
 * TRACE_PORT_BASE: base source port for traceroute TTL encoding.
 * For MODE_TCPTRACE, source port = TRACE_PORT_BASE + TTL (1-255).
 * This allows receiver to extract TTL from ICMP TE responses even
 * when probes arrive out of order.
 */
#define TRACE_PORT_BASE			40960

/*
 * Payload index encoding in source port for TCP multi-payload support.
 * When multiple payloads are configured for the same port, each SYN uses
 * a different source port that encodes the payload index. When SYN-ACK
 * arrives, the receiver decodes the index to select the correct payload.
 *
 * Layout: source_port = PAYLOAD_PORT_BASE + (base_offset * 16) + payload_index
 * - base_offset: (original_sport - PAYLOAD_PORT_BASE) / 16, preserves randomness
 * - payload_index: 0-15, index into payload chain (->over pointer)
 *
 * Port ranges:
 * - PAYLOAD_PORT_BASE (49152): IANA ephemeral range start
 * - TRACE_PORT_BASE (40960): Used for TTL encoding in tcptrace (40960-41215)
 * - No conflict: 49152 > 41215
 */
#define PAYLOAD_PORT_BASE		49152
#define PAYLOAD_INDEX_BITS		4
#define PAYLOAD_INDEX_MASK		((1 << PAYLOAD_INDEX_BITS) - 1)	/* 0x0F */

/*
 * encode_payload_port: encode payload_index into source port
 * Returns port in range [PAYLOAD_PORT_BASE, 65535]
 */
static inline uint16_t encode_payload_port(uint16_t base_sport, uint16_t payload_index) {
	uint16_t offset;

	/* ensure base is in ephemeral range */
	if (base_sport < PAYLOAD_PORT_BASE) {
		base_sport = PAYLOAD_PORT_BASE + (base_sport % (65536 - PAYLOAD_PORT_BASE));
	}

	/* calculate offset, preserving upper bits of base_sport */
	offset = (base_sport - PAYLOAD_PORT_BASE) / (1 << PAYLOAD_INDEX_BITS);

	return PAYLOAD_PORT_BASE + (offset << PAYLOAD_INDEX_BITS) + (payload_index & PAYLOAD_INDEX_MASK);
}

/*
 * decode_payload_index: extract payload_index from encoded source port
 * Returns 0 if not a payload-encoded port
 */
static inline uint16_t decode_payload_index(uint16_t sport) {
	if (sport < PAYLOAD_PORT_BASE) {
		return 0;
	}
	return (sport - PAYLOAD_PORT_BASE) & PAYLOAD_INDEX_MASK;
}

/*
 * is_payload_port: check if source port is in payload encoding range
 */
static inline int is_payload_port(uint16_t sport) {
	return (sport >= PAYLOAD_PORT_BASE);
}

#define REPORT_BADNETWORK_CKSUM		1
#define REPORT_BADTRANSPORT_CKSUM	2

#define OD_TYPE_OS			1
#define OD_TYPE_BANNER			2

#define REPORT_TYPE_IP			1
#define REPORT_TYPE_ARP			2

#define IP_REPORT_MAGIC			0xd2d19ff2
#define ARP_REPORT_MAGIC		0xd9d82aca
#define TRACE_PATH_MAGIC		0x54525054	/* "TRPT" - trace path report	*/

#define TRACE_PATH_MAX_HOPS		64		/* max hops in path report	*/

/*
 * trace_path_hop_t: single hop in a traceroute path
 * Copyright (C) 2026 Robert E. Lee <robert@unicornscan.org>
 */
typedef struct _PACKED_ trace_path_hop_t {
	uint32_t router_addr;		/* router that responded (ICMP TE source)	*/
	uint8_t hop_number;		/* position in path (1, 2, 3...)		*/
	uint32_t rtt_us;		/* round-trip time in microseconds (0=unknown)	*/
	uint8_t flags;			/* TRACE_HOP_RECV, TRACE_HOP_DEST, etc		*/
} trace_path_hop_t;

/*
 * trace_path_report_t: complete traceroute path for output modules
 * sent when MODE_TCPTRACE session completes
 * Copyright (C) 2026 Robert E. Lee <robert@unicornscan.org>
 */
typedef struct _PACKED_ trace_path_report_t {
	uint32_t magic;			/* TRACE_PATH_MAGIC				*/
	uint32_t target_addr;		/* destination IP we traced to			*/
	uint16_t target_port;		/* destination port used for probes		*/
	uint8_t hop_count;		/* number of valid hops in array		*/
	uint8_t complete;		/* 1 if reached target, 0 if max TTL hit	*/
	trace_path_hop_t hops[TRACE_PATH_MAX_HOPS];
} trace_path_report_t;

typedef struct output_data_t {
	uint8_t type;
	union {
		char *os;
		char *banner;
	} t_u;
} output_data_t;

typedef struct _PACKED_ ip_report_t {
	uint32_t magic;			/* extra checking						*/
	uint16_t sport;			/* from our senders `local' port				*/
	uint16_t dport;			/* the `target' machines listening port (or not listening)	*/
	uint8_t proto;			/* what ip protocol it was that we got back			*/
	uint16_t type;			/* for icmp this is type, for tcp it is the header flags	*
					 * on the packet, udp doesnt use this				*/
	uint16_t subtype;		/* for icmp this is the code, for tcp and udp it is not used	*/
	uint32_t send_addr;		/* who started this conversation anyhow				*/
	uint32_t host_addr;		/* our target machine						*/
	uint32_t trace_addr;		/* if we sent to the target where did the packet come back from?*/
	uint8_t ttl;			/* the raw ttl on the packet from the wire (not that we sent)	*/
	struct timeval recv_time; 	/* the secs and usecs that we pulled the packet off the wire at	*/
	void *od_q;			/* list of arbitrary data linked to this "packet" used in	*
					 * output mode (output_data_t list)				*/
	uint16_t flags;			/* had bad network or transport crc				*/
	/* XXX this is too tcp specific for ip reporting */
	uint32_t mseq;			/* tcp only							*/
	uint32_t tseq;			/* tcp only							*/
	uint16_t window_size;		/* tcp only							*/
	uint32_t t_tstamp;
	uint32_t m_tstamp;

	struct ip_report_t *next;	/* if keys can collide, well store chains here			*/

	/* v9: Ethernet source MAC for L2-local responses */
	uint8_t eth_hwaddr[6];		/* source MAC from Ethernet header (valid only for local targets) */
	uint8_t eth_hwaddr_valid;	/* 1 if eth_hwaddr contains valid MAC, 0 otherwise		*/

	uint16_t doff;			/*
					 * is there a packet following this report structure?
					 * if so how many bytes is it
					 */
} ip_report_t;

typedef struct _PACKED_ arp_report_t {
	uint32_t magic;			/* extra checking						*/
	uint8_t hwaddr[6];
	uint32_t ipaddr;
	struct timeval recv_time;
	void *od_q;
	uint16_t flags;
	uint16_t doff;
} arp_report_t;

#ifndef SCANSETTINGS
#define SCANSETTINGS void
#endif

void scan_setprivdefaults(void);

/*
 * returns 1, or -1 for error
 */
int scan_parsemode(
			const char *	/* input string		*/,
			uint8_t *	/* output mode		*/,
			uint16_t *	/* output flags		*/,
			uint16_t *	/* output sendflags	*/,
			uint16_t *	/* output recvflags	*/,
			uint16_t *	/* output masterflags	*/,
			uint32_t *	/* output pps		*/
		);

int scan_setoptmode(const char *);
int scan_setsrcaddr(const char *);
int scan_settcpflags(int );
int scan_setretlayers(int );
int scan_setttl(const char * );
int scan_settos(int );
int scan_setbroken(const char *);
int scan_setfingerprint(int );
int scan_setsrcp(int);
int scan_setrecvtimeout(int );
int scan_getrecvtimeout(void);
int scan_getmode(void);
int load_phase_settings(int /* phase_index */);

int decode_tcpflags(const char *);

void send_mode(void);
void recv_mode(void);
void init_mode(void);

int init_payloads(void);

int add_payload(
		uint16_t /* proto */,
		uint16_t /* port */,
		int32_t /* local port */,
		const uint8_t * /* payload */,
		uint32_t /* payload_size */,
		int (* /* create payload */)(uint8_t **, uint32_t *, void *),
		uint16_t /* payload group */
	);

int add_default_payload(
		uint16_t /* proto */,
		int32_t /* local port */,
		const uint8_t * /* payload */,
		uint32_t /* payload_size */,
		int (* /* create payload */)(uint8_t **, uint32_t *, void *),
		uint16_t /* payload group */
	);

int get_payload(
		uint16_t /*index*/,
		uint16_t /* proto */,
		uint16_t /*port*/,
		uint8_t ** /*data*/,
		uint32_t * /*payload_s*/,
		int32_t * /*local_port*/,
		int (** /*create payload */)(uint8_t **, uint32_t *, void *),
		uint16_t /* payload_group */
	);

uint16_t count_payloads(
		uint16_t /* proto */,
		uint16_t /* port */,
		uint16_t /* payload_group */
	);

char *strscanmode(int /* s->ss->mode */);

#endif
