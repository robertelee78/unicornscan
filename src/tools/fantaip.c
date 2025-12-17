/*
 * AUTHOR: kiki, Wanta Fanta? ( gh0st <gh0st@rapturesecurity.org> )
 * "Yo man, i thought you was black!"
 *
 * Modernized 2025: Added WiFi support, periodic gratuitous ARP,
 * clean signal handling, statistics
 *
 * this is GPL like the rest
 */
#include <config.h>

#include <signal.h>
#include <errno.h>
#include <time.h>

#include <pcap.h>

#include <scan_progs/packets.h>
#include <scan_progs/makepkt.h>
#include <unilib/pcaputil.h>
#include <unilib/pktutil.h>
#include <unilib/output.h>
#include <unilib/xmalloc.h>
#include <settings.h>

#include <arpa/inet.h>

#include <dnet.h>

struct  myetheraddr {
	uint8_t octet[THE_ONLY_SUPPORTED_HWADDR_LEN];
};

struct _PACKED_ arp_packet {
	uint16_t hw_type;
	uint16_t protocol;
	uint8_t hwsize;
	uint8_t protosize;
	uint16_t opcode;
	uint8_t smac[THE_ONLY_SUPPORTED_HWADDR_LEN];
	uint32_t sip;
	uint8_t dmac[THE_ONLY_SUPPORTED_HWADDR_LEN];
	uint32_t dip;
};

struct {
	struct myetheraddr shwaddr;
	uint32_t saddr;
	uint32_t oaddr;
	uint32_t saddr_mask;
	uint8_t cidr;
	eth_t *e;
	char *device;
	int addr_cleared;
	/* Header handling */
	int link_header_size;
	int link_type;
	/* Statistics */
	unsigned long arp_requests_recv;
	unsigned long arp_replies_sent;
	unsigned long grat_arp_sent;
	/* Periodic gratuitous ARP */
	int grat_interval;
	time_t last_grat_time;
} bob;

/* Global handles for signal handler cleanup */
static pcap_t *g_pdev = NULL;
static volatile sig_atomic_t g_running = 1;

static int send_arp(struct myetheraddr *, uint32_t);
static void process_packet(uint8_t *, const struct pcap_pkthdr *, const uint8_t *);
static void usage(void) _NORETURN_;
static void do_daemon(void);
static void signal_handler(int signo);
static void print_stats(void);
static int broadcast_grat_arp(void);

settings_t *s=NULL;

const char *ident_name_ptr="Fnta";
int ident=0;

static void signal_handler(int signo) {
	if (signo == SIGINT || signo == SIGTERM) {
		g_running = 0;
		if (g_pdev != NULL) {
			pcap_breakloop(g_pdev);
		}
	}
}

static void print_stats(void) {
	OUT("\n--- fantaip statistics ---");
	OUT("ARP requests received: %lu", bob.arp_requests_recv);
	OUT("ARP replies sent: %lu", bob.arp_replies_sent);
	OUT("Gratuitous ARPs sent: %lu", bob.grat_arp_sent);
}

#ifdef HAVE_PCAP_SET_NONBLOCK
static int broadcast_arp(uint16_t type, uint32_t addr);

static int breakloop=0;

static void alarm_hndlr(int signo) {

	breakloop=1;

	return;
}

static int broadcast_arp(uint16_t type, uint32_t addr) {
	uint8_t broadcast[6];
	const uint8_t *pbuf=NULL;
	size_t buf_size=0;

	memset(broadcast, 0xFF, 6);

	makepkt_clear();

	makepkt_build_ethernet(6, &broadcast[0], (uint8_t *)&bob.shwaddr.octet[0], ETHERTYPE_ARP);

	makepkt_build_arp(
				ARPHRD_ETHER,				/* ethernet		*/
				ETHERTYPE_IP,				/* proto for addr res	*/
				6,					/* hardware addr len	*/
				4,					/* proto addr len	*/
				type,					/* arp type		*/
				(uint8_t *)&bob.shwaddr.octet[0],	/* source		*/
				(uint8_t *)&addr,			/* ip src		*/
				&broadcast[0],				/* dst hw		*/
				(uint8_t *)&bob.saddr);			/* src ip		*/

	makepkt_getbuf(&buf_size, &pbuf);

	if (buf_size < 1 || pbuf == NULL) {
		ERR("makepkt fails, exiting");
		exit(1);
	}

	if (eth_send(bob.e, pbuf, buf_size) < 1) {
		ERR("eth_send fails, exiting");
		exit(1);
	}

	return 1;
}
#endif

/* Send gratuitous ARP for all IPs in CIDR block */
static int broadcast_grat_arp(void) {
	uint8_t broadcast[6];
	const uint8_t *pbuf=NULL;
	size_t buf_size=0;
	uint32_t cur_addr;
	uint32_t min_addr, max_addr;
	int count = 0;

	memset(broadcast, 0xFF, 6);

	min_addr = ntohl(bob.oaddr);
	max_addr = min_addr | ~bob.saddr_mask;

	for (cur_addr = min_addr; cur_addr <= max_addr && g_running; cur_addr++) {
		uint32_t net_addr = htonl(cur_addr);

		makepkt_clear();

		/* Gratuitous ARP: sender IP = target IP */
		makepkt_build_ethernet(6, &broadcast[0], (uint8_t *)&bob.shwaddr.octet[0], ETHERTYPE_ARP);

		makepkt_build_arp(
					ARPHRD_ETHER,
					ETHERTYPE_IP,
					6,
					4,
					ARPOP_REQUEST,  /* Gratuitous uses request */
					(uint8_t *)&bob.shwaddr.octet[0],
					(uint8_t *)&net_addr,
					&broadcast[0],
					(uint8_t *)&net_addr);  /* Target = Source for gratuitous */

		makepkt_getbuf(&buf_size, &pbuf);

		if (buf_size < 1 || pbuf == NULL) {
			ERR("makepkt fails for gratuitous ARP");
			continue;
		}

		if (eth_send(bob.e, pbuf, buf_size) < 1) {
			ERR("eth_send fails for gratuitous ARP: %s", strerror(errno));
			continue;
		}

		count++;
		bob.grat_arp_sent++;

		/* Small delay between gratuitous ARPs to avoid flooding */
		if ((cur_addr - min_addr) % 16 == 15) {
			usleep(1000);
		}
	}

	VRB(1, "sent %d gratuitous ARPs", count);
	return count;
}

static int send_arp(struct myetheraddr *dst, uint32_t dstip) {
	const uint8_t *pbuf=NULL;
	size_t buf_size=0;

	VRB(1, "sending ARP resp to: %s", decode_6mac((const uint8_t *)&dst->octet[0]));

	makepkt_clear();

	makepkt_build_ethernet(6,
				(uint8_t *)&dst->octet[0],		/* dest host hw addr	*/
				(uint8_t *)&bob.shwaddr.octet[0],	/* dest host src addr	*/
				ETHERTYPE_ARP);				/* ethernet, arp	*/

	makepkt_build_arp(
				ARPHRD_ETHER,				/* ethernet follows	*/
				ETHERTYPE_IP,				/* proto for addr res	*/
				6,					/* hardware addr len	*/
				4,					/* proto addr len	*/
				ARPOP_REPLY,				/* duh			*/
				(uint8_t *)&bob.shwaddr.octet[0],	/* source		*/
				(uint8_t *)&bob.saddr,			/* ip src		*/
				(uint8_t *)&dst->octet[0],		/* dst hw		*/
				(uint8_t *)&dstip);			/* dst ip		*/

	makepkt_getbuf(&buf_size, &pbuf);

	if (buf_size < 1 || pbuf == NULL) {
		ERR("makepkt fails, exiting");
		exit(1);
	}

	if (eth_send(bob.e, pbuf, buf_size) < 1) {
		ERR("eth_send fails, exiting");
		exit(1);
	}

	bob.arp_replies_sent++;
	return 1;
}

#define FILTER "arp"

int main(int argc, char ** argv) {
	char errors[PCAP_ERRBUF_SIZE], pfilter[2048];
	char *hwaddr=NULL, *myip=NULL;
	struct ifreq ifr;
	bpf_u_int32 mask=0, net=0;
	struct bpf_program filter;
	pcap_t *pdev=NULL;
	int opt=0, detach=0;
	int header_size;
#ifdef HAVE_PCAP_SET_NONBLOCK
	int tries=0;
#endif

	s=(settings_t *)xmalloc(sizeof(settings_t));
	memset(&bob, 0, sizeof(bob));

	s->_stdout=stdout;
	s->_stderr=stderr;

	bob.grat_interval = 30;  /* Default: gratuitous ARP every 30 seconds */

	memset(&ifr, 0, sizeof(ifr));

	while ((opt=getopt(argc, argv, "i:hH:dvg:")) != -1) {
		switch (opt) {
			case 'h':
				usage();
				break;
			case 'i':
				bob.device=xstrdup(optarg);
				break;
			case 'H':
				hwaddr=xstrdup(optarg);
				break;
			case 'd':
				detach=1;
				break;
			case 'v':
				s->verbose++;
				break;
			case 'g':
				bob.grat_interval=atoi(optarg);
				if (bob.grat_interval < 0) bob.grat_interval = 0;
				break;
			default:
				usage();
				break;
		}
	}

	if (optind < argc) {
		char *mptr=NULL;
		struct in_addr ia;

		myip=xstrdup(argv[optind]);
		if ((mptr=strrchr(myip, '/')) != NULL && strlen(mptr) > 1) {
			int i=0;

			*mptr='\0'; mptr++;
			bob.cidr=(uint8_t )(atoi(mptr) & 255);

			for (; i < bob.cidr; i++) {
				bob.saddr_mask=(bob.saddr_mask >> 1) | 0x80000000;
			}
		}
		else {
			bob.saddr_mask=0xFFFFFFFF;
			bob.cidr=32;
		}
		if (inet_aton(myip, &ia) == 0) {
			ERR("illegal IP address `%s'", myip);
			exit(1);
		}
		ia.s_addr &= htonl(bob.saddr_mask);
		xfree(myip);
		{
			char addr_buf[INET_ADDRSTRLEN];
			inet_ntop(AF_INET, &ia, addr_buf, sizeof(addr_buf));
			myip=xstrdup(addr_buf);
		}
		bob.oaddr=bob.saddr=ia.s_addr;
	}

	if (bob.saddr_mask != 0xffffffff) {
		uint8_t *p=NULL;
		uint32_t lmask=0;
		char highip[64];
		struct in_addr hi;

		lmask=ntohl(bob.saddr_mask);
		p=(uint8_t *)&lmask;
		hi.s_addr=bob.saddr | ~ntohl(bob.saddr_mask);

		inet_ntop(AF_INET, &hi, highip, sizeof(highip));

		VRB(1, "using addresses `%s->%s/%u' (netmask %u.%u.%u.%u)", myip, highip, bob.cidr, *(p), *(p + 1), *(p + 2), *(p + 3));
	}
	else if (myip != NULL) {
		VRB(1, "using address `%s'", myip);
	}

	if (myip == NULL) {
		ERR("IP address is required");
		usage();
	}

	if (bob.device == NULL) {
		ERR("interface argument is required");
		exit(1);
	}


	bob.e=eth_open(bob.device);
	if (bob.e == NULL) {
		ERR("cant open ethernet link: %s", strerror(errno));
		exit(1);
	}

	if (hwaddr != NULL) {
		uint32_t hws[6];
		uint8_t hwaddrs[6];

		if (sscanf(hwaddr, "%x:%x:%x:%x:%x:%x", &hws[0], &hws[1], &hws[2], &hws[3], &hws[4], &hws[5]) != 6) {
			ERR("bad hardware address, use XX:XX:XX:XX:XX:XX, not `%s'", hwaddr);
			exit(1);
		}
		if (hws[0] > 255 || hws[1] > 255 || hws[2] > 255 || hws[3] > 255 || hws[4] > 255 || hws[5] > 255) {
			ERR("no, thats not really going to work, sorry");
			exit(1);
		}

		hwaddrs[0]=(uint8_t)hws[0];
		hwaddrs[1]=(uint8_t)hws[1];
		hwaddrs[2]=(uint8_t)hws[2];
		hwaddrs[3]=(uint8_t)hws[3];
		hwaddrs[4]=(uint8_t)hws[4];
		hwaddrs[5]=(uint8_t)hws[5];

		VRB(0, "using hardware address %x:%x:%x:%x:%x:%x", hwaddrs[0], hwaddrs[1], hwaddrs[2], hwaddrs[3], hwaddrs[4], hwaddrs[5]);
		memcpy((void *)&bob.shwaddr, (void *)&hwaddrs[0], 6);
	}

	else if (eth_get(bob.e, (eth_addr_t *)&bob.shwaddr) < 0) {
		ERR("cant get hardware address: %s", strerror(errno));
		exit(1);
	}

	snprintf(pfilter, sizeof(pfilter) -1, FILTER);
	(void )pcap_lookupnet(bob.device, &net, &mask, errors);

	pdev=pcap_open_live(bob.device, 500, 1, -1, errors);
	if (pdev == NULL) {
		ERR("cant open up interface `%s': %s", bob.device, errors);
		exit(1);
	}

	/* Try to set Ethernet link type for WiFi compatibility */
	if (util_try_set_datalink_ethernet(pdev)) {
		VRB(1, "set datalink to Ethernet (cooked mode)");
	}

	/* Get header size for this interface */
	header_size = util_getheadersize(pdev, errors);
	bob.link_type = pcap_datalink(pdev);

	if (header_size == -1) {
		ERR("unsupported link type on `%s': %s", bob.device, errors);
		pcap_close(pdev);
		exit(1);
	}

	if (header_size == PCAP_HEADER_RADIOTAP) {
		/* Radiotap: variable length, will be computed per-packet */
		VRB(1, "using radiotap headers (variable length)");
		bob.link_header_size = 0;  /* Will be computed per-packet */
	} else if (header_size != 14) {
		/* Warn but continue - we'll try our best */
		VRB(0, "warning: non-standard header size %d (type %d), ARP may not work correctly",
		    header_size, bob.link_type);
		bob.link_header_size = header_size;
	} else {
		bob.link_header_size = header_size;
		VRB(1, "using link header size %d (Ethernet)", header_size);
	}

	g_pdev = pdev;  /* Store for signal handler */

	if (util_preparepcap(pdev, errors) < 0) {
		ERR("cant prepare bpf socket: %s", strerror(errno));
		pcap_close(pdev);
		exit(1);
	}

	if (pcap_compile(pdev, &filter, pfilter, 0, net) < 0) {
		ERR("cant compile pcap filter `%s'", pfilter);
		pcap_close(pdev);
		exit(1);
	}

	if (pcap_setfilter(pdev, &filter) < 0) {
		ERR("cant set pcap filter");
		pcap_close(pdev);
		exit(1);
	}

	/* Set up signal handlers for clean shutdown */
	signal(SIGINT, signal_handler);
	signal(SIGTERM, signal_handler);

#ifdef HAVE_PCAP_SET_NONBLOCK
	/* look for dups */
	if (pcap_setnonblock(pdev, 1, errors) < 0) {
		ERR("can't set pcap dev nonblocking: %s", errors);
		exit(1);
	}

	signal(SIGALRM, &alarm_hndlr);

	do {
		if (!g_running) break;

		for (bob.addr_cleared=0, tries=0; bob.addr_cleared == 0 && tries < 3; tries++) {
			{
				char test_addr[INET_ADDRSTRLEN];
				inet_ntop(AF_INET, &bob.saddr, test_addr, sizeof(test_addr));
				VRB(2, "testing `%s'", test_addr);
			}
			/* lets be sure about this */
			broadcast_arp(ARPOP_REQUEST, 0xFFFFFFFF);
			broadcast_arp(ARPOP_REQUEST, 0x00000000);
			broadcast_arp(ARPOP_REQUEST, bob.saddr);

			alarm(1);

			for (breakloop=0, bob.addr_cleared=0 ; breakloop == 0 && bob.addr_cleared == 0 && g_running; ) {
				pcap_dispatch(pdev, -1, process_packet, NULL);
				usleep(10000);
			}

			alarm(0);
		}

		alarm(0);

		if (bob.addr_cleared == -1) {
			ERR("error: Address already in use");
			pcap_close(pdev);
			eth_close(bob.e);
			exit(1);
		}

		bob.saddr += htonl(1);
		if (1) {
			uint32_t max, cur, lmask;

			lmask=ntohl(bob.saddr_mask);
			max=ntohl(bob.oaddr | ~lmask);
			cur=ntohl(bob.saddr);
			if (cur == 0xffffffff || cur > max) {
				bob.addr_cleared=1;
				break;
			}
		}
	} while (g_running);

	signal(SIGALRM, SIG_DFL);

#else
# warning no pcap_setnonblock
#endif /* pcap_setnonblock */

	if (!g_running) {
		print_stats();
		eth_close(bob.e);
		pcap_close(pdev);
		exit(0);
	}

	if (detach) {
		VRB(1, "going into background");

		s->verbose=0;
		s->debugmask=0;

		do_daemon();
	}

	bob.saddr=bob.oaddr;

	{
		char arp_addr[INET_ADDRSTRLEN];
		inet_ntop(AF_INET, &bob.saddr, arp_addr, sizeof(arp_addr));
		VRB(0, "arping for %s/%u [%s]", arp_addr, bob.cidr, decode_6mac((const uint8_t *)&bob.shwaddr.octet[0]));
	}

	/* Send initial gratuitous ARP */
	if (bob.grat_interval > 0) {
		VRB(1, "sending initial gratuitous ARPs");
		broadcast_grat_arp();
		bob.last_grat_time = time(NULL);
	}

#ifdef HAVE_PCAP_SET_NONBLOCK
	/* Use non-blocking mode with periodic gratuitous ARP */
	if (bob.grat_interval > 0) {
		/* Stay in non-blocking mode for periodic tasks */
		while (g_running) {
			time_t now = time(NULL);

			if (pcap_dispatch(pdev, -1, process_packet, NULL) == 0) {
				usleep(10000);
			}

			/* Send periodic gratuitous ARPs */
			if (bob.grat_interval > 0 && (now - bob.last_grat_time) >= bob.grat_interval) {
				VRB(2, "sending periodic gratuitous ARPs");
				broadcast_grat_arp();
				bob.last_grat_time = now;
			}
		}
	} else {
		/* Block mode if no periodic tasks needed */
		if (pcap_setnonblock(pdev, 0, errors) < 0) {
			ERR("cant set pcap dev blocking: %s", errors);
			pcap_close(pdev);
			eth_close(bob.e);
			exit(1);
		}

		while (g_running) {
			if (pcap_dispatch(pdev, -1, process_packet, NULL) == 0) {
				usleep(1000);
			}
		}
	}
#else
	for (; g_running ;) {
		if (pcap_dispatch(pdev, -1, process_packet, NULL) == 0) {
			usleep(1000);
		}
	}
#endif

	print_stats();
	eth_close(bob.e);
	pcap_close(pdev);

	exit(0);
}

void process_packet(uint8_t *user, const struct pcap_pkthdr *phdr, const uint8_t *packet) {
	const struct ether_header *ehdr_ptr=NULL;
	const struct arp_packet *ap=NULL;
	int header_offset = 0;
	size_t min_arp_size;

	if (phdr->caplen != phdr->len) {
		VRB(3, "truncated packet: caplen=%u len=%u", phdr->caplen, phdr->len);
		return;
	}

	/* Handle variable-length radiotap headers */
	if (bob.link_type == DLT_IEEE802_11_RADIO) {
		int rt_len = util_get_radiotap_len(packet, phdr->caplen);
		if (rt_len < 0 || (size_t)rt_len > phdr->caplen) {
			VRB(3, "invalid radiotap header");
			return;
		}
		/* Skip radiotap + 802.11 header (24 bytes minimum) to get to LLC/SNAP */
		header_offset = rt_len + 24;
		/* LLC/SNAP header adds 8 bytes before Ethernet type */
		if ((size_t)header_offset + 8 > phdr->caplen) {
			VRB(3, "packet too short for 802.11 + LLC");
			return;
		}
		/* For 802.11, we need to extract ethertype from LLC/SNAP */
		/* This is complex; for ARP we look at offset+6 for ethertype in SNAP */
		/* Skip this complexity for now - cooked mode should handle it */
		VRB(3, "radiotap packet - try using cooked mode (set DLT_EN10MB)");
		return;
	} else if (bob.link_header_size > 0) {
		header_offset = bob.link_header_size;
	} else {
		header_offset = 14;  /* Default Ethernet */
	}

	/* For Ethernet, header_offset should be 14 */
	if (phdr->caplen < (size_t)header_offset) {
		VRB(3, "packet too short for link header");
		return;
	}

	/* For Ethernet-like frames, the Ethernet header is at the start */
	if (bob.link_type == DLT_EN10MB) {
		ehdr_ptr=(const struct ether_header *)packet;
	} else {
		/* Non-Ethernet link types may not have standard ether_header */
		VRB(3, "non-Ethernet link type %d - packet processing may fail", bob.link_type);
		/* Try anyway - some drivers present Ethernet-like frames */
		ehdr_ptr=(const struct ether_header *)packet;
	}

	if (ntohs(ehdr_ptr->ether_type) != ETHERTYPE_ARP) {
		return;  /* Not ARP, ignore silently */
	}

	/*
	 * Minimum ARP packet size: 14 bytes Ethernet header + 28 bytes ARP
	 * (for IPv4 over Ethernet: hwsize=6, protosize=4).
	 * Note: We use a hardcoded constant because sizeof(struct arp_packet)
	 * may include padding if the _PACKED_ attribute isn't working.
	 */
	min_arp_size = 14 + 28;  /* Ethernet header + ARP for IPv4/Ethernet */
	if (phdr->caplen < min_arp_size) {
		VRB(3, "short ARP packet: %u < %zu", phdr->caplen, min_arp_size);
		return;
	}

	ap=(const struct arp_packet *)(packet + sizeof(struct ether_header));

	DBG(M_PKT, "got packet hw type %u proto %x hwsize %x protosize %x", ntohs(ap->hw_type), ntohs(ap->protocol), ap->hwsize, ap->protosize);

	/* ethernet -> ip -> hwsize = 6 and ip size = 4 */
	if (ntohs(ap->hw_type) == 1 && ntohs(ap->protocol) == 0x800 && ap->hwsize == 6 && ap->protosize == 4) {
		char src[17], dst[17];
		char tmphw[32];

		switch (ntohs(ap->opcode)) {
			case 1:
				/* arp request */
				bob.arp_requests_recv++;

				if (s->verbose > 2) {
					char rbuf[256];

					snprintf(tmphw, sizeof(tmphw) -1, "%s", decode_6mac(ap->smac));
					snprintf(rbuf, sizeof(rbuf) -1, "Arp Request: Source Mac: %s Dest Mac: %s",
						tmphw, decode_6mac(ap->dmac));
					/* hide the children, they will cry if they see this */
					inet_ntop(AF_INET, &ap->sip, src, sizeof(src));
					inet_ntop(AF_INET, &ap->dip, dst, sizeof(dst));
					DBG(M_PKT, "%s [ %s -> %s ]", rbuf, src, dst);
				}

				if (bob.addr_cleared) {
					uint32_t min, max, req;

					min=ntohl(bob.saddr);
					max=ntohl(bob.saddr) | ~(bob.saddr_mask);
					req=ntohl(ap->dip);

					if (min <= req && req <= max) {
						struct myetheraddr sea;

						memset(&sea, 0, sizeof(sea));
						memcpy(&(sea.octet[0]), &ap->smac[0], 6);

						bob.saddr=htonl(req);
						send_arp((struct myetheraddr *)&sea, ap->sip);
						bob.saddr=bob.oaddr;
					}
				}
				break;
			case 2: /* reply */
				if (s->verbose > 2) {
					char rbuf[256];

					snprintf(tmphw, sizeof(tmphw) -1, "%s", decode_6mac(ap->smac));
					snprintf(rbuf, sizeof(rbuf) -1, "Arp Reply: Source Mac: %s Dest Mac: %s",
						tmphw, decode_6mac(ap->dmac));
					/* hide the children, they will cry if they see this */
					inet_ntop(AF_INET, &ap->sip, src, sizeof(src));
					inet_ntop(AF_INET, &ap->dip, dst, sizeof(dst));
					DBG(M_PKT, "%s [ %s -> %s ]", rbuf, src, dst);
				}

				if (bob.addr_cleared == 0 && ap->sip == bob.saddr) {
					bob.addr_cleared=-1;
				}
				break;
			default:
				break;
		}
	}

	return;
}

void do_daemon(void) {
	pid_t child=0;

	child=fork();
	if (child < 0) {
		ERR("cant fork: %s", strerror(errno));
		exit(1);
	}
	else if (child == 0) {
		if (setsid() < 0) {
			ERR("setsid failed: %s", strerror(errno));
		}
		if (chdir("/") < 0) {
			ERR("chdir failed: %s", strerror(errno));
		}
		umask(077);
		if (freopen("/dev/null", "r", stdin) == NULL ||
		    freopen("/dev/null", "w", stdout) == NULL ||
		    freopen("/dev/null", "w", stderr) == NULL) {
			/* Can't report error - stderr is gone */
		}

		return;
	}
	else {
		exit(0);
	}
}

void usage(void) {
	OUT("FantaIP by Kiki (Modernized 2025)\n"
		"Usage: fantaip (options) IP[/CIDR]\n"
		"\t-d\t\tDetach from terminal and daemonize\n"
		"\t-H MAC\t\tHardware address like XX:XX:XX:XX:XX:XX (otherwise use NIC's hwaddr)\n"
		"\t-h\t\tHelp\n"
		"\t-i IFACE\t*Interface (required)\n"
		"\t-v\t\tVerbose operation (repeat for more)\n"
		"\t-g SECONDS\tGratuitous ARP interval (default: 30, 0 to disable)\n"
		"*: Argument required\n\n"
		"Examples:\n"
		"  fantaip -i eth0 192.168.1.7              # Single IPv4\n"
		"  fantaip -i wlan0 192.168.1.0/24          # IPv4 CIDR block\n"
		"  fantaip -i wlan0 -g 60 10.0.0.0/24       # CIDR with 60s gratuitous ARP\n"
		"  fantaip -i wlan0 -g 0 192.168.1.100      # No periodic gratuitous ARP\n");

	exit(0);
}
