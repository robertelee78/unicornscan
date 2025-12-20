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
#ifndef _PCAPUTIL_H
# define _PCAPUTIL_H

int util_getheadersize(pcap_t * /* pdev */, char * /* errorbuf pcap size */);
int util_preparepcap  (pcap_t * /* pdev */, char * /* errorbuf pcap size */);
int util_try_set_datalink_ethernet(pcap_t * /* pdev */);
int util_get_radiotap_len(const uint8_t * /* packet */, size_t /* caplen */);

/*
 * Disable NIC offload features that interfere with packet capture.
 * GRO/LRO/TSO cause packets to be coalesced, making tot_len > caplen.
 * Returns: bitmask of features that were disabled (for restoration), or -1 on error.
 */
int util_disable_offload(const char * /* interface */, char * /* errorbuf */);

/*
 * Restore previously disabled offload features.
 * Takes the bitmask returned by util_disable_offload.
 */
int util_restore_offload(const char * /* interface */, int /* features_mask */);

/* Offload feature flags (returned by util_disable_offload) */
#define OFFLOAD_GRO	(1 << 0)
#define OFFLOAD_LRO	(1 << 1)
#define OFFLOAD_TSO	(1 << 2)
#define OFFLOAD_GSO	(1 << 3)

/* Special return value for radiotap (variable-length header) */
#define PCAP_HEADER_RADIOTAP	(-2)

#endif
