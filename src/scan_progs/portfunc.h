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
#ifndef _PORTFUNC_H
# define _PORTFUNC_H

/*
 * Port encoding for TCP multi-payload support.
 * Payload count is stored in upper 16 bits of int32_t ports[] array.
 * Format: (count << 16) | port
 *
 * Examples:
 *   "443"   -> count=1, port=443  -> 0x00010443
 *   "443:3" -> count=3, port=443  -> 0x00030443
 *   "80:2"  -> count=2, port=80   -> 0x00020050
 */
#define PORT_VALUE(x)		((uint16_t)((x) & 0xFFFF))
#define PORT_COUNT(x)		((uint16_t)(((x) >> 16) & 0xFFFF))
#define PORT_ENCODE(port, cnt)	(((int32_t)(cnt) << 16) | ((port) & 0xFFFF))

void init_portsquick(void);
void reset_getnextport(void);
void shuffle_ports(void);
int get_nextport(int32_t *);
int parse_pstr(const char *, uint32_t * /* if not null only calculate number of ports couted and exit */);
char *getservname(uint16_t );
char *getouiname(uint8_t , uint8_t, uint8_t );

#endif
