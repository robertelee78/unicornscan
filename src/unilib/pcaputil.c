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

#include <sys/ioctl.h>
#include <errno.h>

#ifdef HAVE_NET_BPF_H
#include <net/bpf.h>
#include <pcap.h>
#else
#include <pcap.h>
#endif

#include <unilib/pcaputil.h>

int util_getheadersize(pcap_t *pdev, char *errorbuf) {
	int linktype=0;

	assert(pdev != NULL); assert(errorbuf != NULL);

	switch((linktype=pcap_datalink(pdev))) {
		case DLT_NULL:
			return 4;
#ifdef DLT_RAW
		case DLT_RAW:
			return 0;
#endif
		case DLT_EN10MB:
			return 14;
#ifdef DLT_LINUX_SLL
		case DLT_LINUX_SLL:
			/* Linux "cooked" capture - used when capturing on "any" interface */
			return 16;
#endif
#ifdef DLT_LINUX_SLL2
		case DLT_LINUX_SLL2:
			/* Linux "cooked" capture v2 - newer format */
			return 20;
#endif
#ifdef DLT_LOOP /* NetBSD doesnt have this */
		case DLT_LOOP:
			return 8;
#endif
		case DLT_PPP:
			return 4;
		case DLT_IEEE802:
			return 22;
#ifdef DLT_IEEE802_11
		case DLT_IEEE802_11:
			/* 802.11 header: 24 bytes minimum, can be 30 with QoS */
			return 24;
#endif
#ifdef DLT_IEEE802_11_RADIO
		case DLT_IEEE802_11_RADIO:
			/* Radiotap header: variable length, will be computed per-packet */
			/* Return -2 as sentinel to indicate variable-length header */
			return -2;
#endif
#ifdef DLT_PRISM_HEADER
		case DLT_PRISM_HEADER:
			/* Prism header: 144 bytes + 802.11 header */
			return 144 + 24;
#endif
#ifdef DLT_IEEE802_11_RADIO_AVS
		case DLT_IEEE802_11_RADIO_AVS:
			/* AVS header: 64 bytes + 802.11 header */
			return 64 + 24;
#endif
		default:
			snprintf(errorbuf, PCAP_ERRBUF_SIZE -1, "Unknown pcap linktype `%d'", linktype);
	}

	/* not reached */
	return -1;
}

/*
 * Try to set datalink type to Ethernet (cooked mode)
 * Returns 1 on success, 0 if not supported
 */
int util_try_set_datalink_ethernet(pcap_t *pdev) {
#ifdef HAVE_PCAP_SET_DATALINK
	int *dlts = NULL;
	int ndlts, i;

	ndlts = pcap_list_datalinks(pdev, &dlts);
	if (ndlts < 0) {
		return 0;
	}

	for (i = 0; i < ndlts; i++) {
		if (dlts[i] == DLT_EN10MB) {
			pcap_free_datalinks(dlts);
			if (pcap_set_datalink(pdev, DLT_EN10MB) == 0) {
				return 1;
			}
			return 0;
		}
	}

	pcap_free_datalinks(dlts);
#endif
	return 0;
}

/*
 * Get radiotap header length from packet
 * Radiotap header starts with version (1 byte), pad (1 byte), length (2 bytes LE)
 */
int util_get_radiotap_len(const uint8_t *packet, size_t caplen) {
	if (caplen < 4) {
		return -1;
	}
	/* Length is at offset 2, little-endian 16-bit */
	return (packet[3] << 8) | packet[2];
}

#if defined(BIOCIMMEDIATE)
int util_preparepcap(pcap_t *pdev, char *errorbuf) {
	int pfd=-1, param=0;

	pfd=pcap_fileno(pdev);
	/* if its not a savefile then ioctl it (not always needed) */
	if (pfd) {
		param=1;
		if (ioctl(pfd, BIOCIMMEDIATE, &param) < 0) {
			;/* failure here is not always bad */
		}
	}
	return 1;
}
#else
int util_preparepcap(pcap_t *pdev, char *errorbuf) {

	if (pdev) errorbuf[0]='\0'; /* for icc */
	return 1;
}
#endif

/*
 * Disable NIC receive offload features that interfere with accurate packet capture.
 * GRO/LRO coalesce inbound packets in the kernel, making IP tot_len larger than
 * the actual captured data - which breaks packet parsing.
 *
 * Note: We only disable receive-side offloads (GRO/LRO). Transmit-side offloads
 * (TSO/GSO) are irrelevant for unicornscan since we send raw packets via libdnet,
 * completely bypassing the kernel TCP stack.
 *
 * Uses SIOCETHTOOL ioctl to disable these features.
 * Reference: https://github.com/torvalds/linux/blob/master/net/ethtool/ioctl.c
 *
 * Returns: bitmask of features that were disabled, 0 if none needed disabling,
 *          or -1 on error (errorbuf contains message).
 */
#if defined(__linux__)
#include <linux/ethtool.h>
#include <linux/sockios.h>
#include <net/if.h>

/* Helper to get/set a single ethtool feature */
static int ethtool_get_feature(int fd, const char *ifname, uint32_t cmd) {
	struct ifreq ifr;
	struct ethtool_value eval;

	memset(&ifr, 0, sizeof(ifr));
	strncpy(ifr.ifr_name, ifname, IFNAMSIZ - 1);

	eval.cmd = cmd;
	eval.data = 0;
	ifr.ifr_data = (void *)&eval;

	if (ioctl(fd, SIOCETHTOOL, &ifr) < 0) {
		return -1;  /* Feature not supported or error */
	}
	return eval.data;
}

static int ethtool_set_feature(int fd, const char *ifname, uint32_t cmd, uint32_t value) {
	struct ifreq ifr;
	struct ethtool_value eval;

	memset(&ifr, 0, sizeof(ifr));
	strncpy(ifr.ifr_name, ifname, IFNAMSIZ - 1);

	eval.cmd = cmd;
	eval.data = value;
	ifr.ifr_data = (void *)&eval;

	return ioctl(fd, SIOCETHTOOL, &ifr);
}

int util_disable_offload(const char *interface, char *errorbuf) {
	int fd, ret;
	int disabled_mask = 0;
	int feature_val;

	(void)ret;  /* May be unused depending on ifdefs */
	(void)feature_val;

	if (interface == NULL || strlen(interface) == 0) {
		snprintf(errorbuf, PCAP_ERRBUF_SIZE - 1, "No interface specified");
		return -1;
	}

	/* Skip for loopback and special interfaces */
	if (strcmp(interface, "lo") == 0 || strcmp(interface, "any") == 0) {
		return 0;  /* Nothing to disable */
	}

	fd = socket(AF_INET, SOCK_DGRAM, 0);
	if (fd < 0) {
		snprintf(errorbuf, PCAP_ERRBUF_SIZE - 1, "Cannot create socket for ethtool: %s", strerror(errno));
		return -1;
	}

	/* Check and disable GRO (Generic Receive Offload) */
#ifdef ETHTOOL_GGRO
	feature_val = ethtool_get_feature(fd, interface, ETHTOOL_GGRO);
	if (feature_val > 0) {
		ret = ethtool_set_feature(fd, interface, ETHTOOL_SGRO, 0);
		if (ret == 0) {
			disabled_mask |= OFFLOAD_GRO;
		}
	}
#endif

	/* Check and disable LRO (Large Receive Offload) - via flags */
#ifdef ETHTOOL_GFLAGS
	feature_val = ethtool_get_feature(fd, interface, ETHTOOL_GFLAGS);
	if (feature_val >= 0 && (feature_val & ETH_FLAG_LRO)) {
		ret = ethtool_set_feature(fd, interface, ETHTOOL_SFLAGS, feature_val & ~ETH_FLAG_LRO);
		if (ret == 0) {
			disabled_mask |= OFFLOAD_LRO;
		}
	}
#endif

	/* Note: TSO/GSO are transmit-side offloads - not disabled here since
	 * unicornscan sends raw packets via libdnet, bypassing kernel TCP stack */

	close(fd);

	if (disabled_mask > 0) {
		/* Build message about what was disabled */
		char features[128] = "";
		if (disabled_mask & OFFLOAD_GRO) strcat(features, "GRO ");
		if (disabled_mask & OFFLOAD_LRO) strcat(features, "LRO ");
		snprintf(errorbuf, PCAP_ERRBUF_SIZE - 1, "Disabled receive offload on %s: %s", interface, features);
	} else {
		errorbuf[0] = '\0';
	}

	return disabled_mask;
}

int util_restore_offload(const char *interface, int features_mask) {
	int fd, ret = 0;

	if (features_mask == 0 || interface == NULL) {
		return 0;
	}

	fd = socket(AF_INET, SOCK_DGRAM, 0);
	if (fd < 0) {
		return -1;
	}

#ifdef ETHTOOL_SGRO
	if (features_mask & OFFLOAD_GRO) {
		ethtool_set_feature(fd, interface, ETHTOOL_SGRO, 1);
	}
#endif

#ifdef ETHTOOL_SFLAGS
	if (features_mask & OFFLOAD_LRO) {
		int flags = ethtool_get_feature(fd, interface, ETHTOOL_GFLAGS);
		if (flags >= 0) {
			ethtool_set_feature(fd, interface, ETHTOOL_SFLAGS, flags | ETH_FLAG_LRO);
		}
	}
#endif

	/* Note: TSO/GSO are transmit-side offloads that we don't touch */

	close(fd);
	return ret;
}

#else /* Non-Linux systems */

int util_disable_offload(const char *interface, char *errorbuf) {
	/* Offload control not implemented for this platform */
	if (interface && errorbuf) {
		errorbuf[0] = '\0';
	}
	return 0;  /* Assume no offload or not controllable */
}

int util_restore_offload(const char *interface, int features_mask) {
	(void)interface;
	(void)features_mask;
	return 0;
}

#endif /* __linux__ */
