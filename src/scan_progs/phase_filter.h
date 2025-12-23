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
#ifndef _PHASE_FILTER_H
# define _PHASE_FILTER_H

/*
 * Phase Filter - ARP Response Cache for Compound Mode
 *
 * In compound mode (-mA+T, -mA+U), the ARP phase discovers which hosts
 * are alive on the local network. Subsequent phases (TCP, UDP) filter
 * their workunits to only target hosts that responded to ARP.
 *
 * This eliminates the kernel ARP blocking delays that occur when
 * sendto() tries to reach hosts with no ARP cache entry.
 */

/* Initialize the ARP response cache. Returns 1 on success, -1 on failure. */
int phase_filter_init(void);

/* Store an ARP response. ipaddr is network byte order. Returns 1 on success. */
int phase_filter_store(uint32_t ipaddr, const uint8_t *hwaddr);

/* Check if an IP address responded to ARP. Returns 1 if found, 0 if not. */
int phase_filter_check(uint32_t ipaddr);

/* Get count of ARP responses stored. */
uint32_t phase_filter_count(void);

/* Walk through all IPs in the ARP cache. */
void phase_filter_walk(void (*func)(uint32_t ipaddr, void *ctx), void *ctx);

/* Destroy the cache and free memory. */
void phase_filter_destroy(void);

#endif
