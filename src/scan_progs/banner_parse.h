/**********************************************************************
 * Copyright (C) 2026 (Robert E. Lee) <robert@unicornscan.org>        *
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
#ifndef _BANNER_PARSE_H
# define _BANNER_PARSE_H

#include <stddef.h>
#include <stdint.h>

/*
 * Protocol detection result codes
 */
typedef enum {
	BANNER_PROTO_UNKNOWN = 0,
	BANNER_PROTO_DNS,
	BANNER_PROTO_TLS,
	BANNER_PROTO_RPC,
	BANNER_PROTO_HEX_FALLBACK
} banner_proto_t;

/*
 * Parse binary response data into human-readable banner string.
 *
 * buf     - raw response bytes from network
 * len     - length of response
 * out     - output buffer for banner string
 * out_len - size of output buffer
 *
 * Returns: detected protocol type (BANNER_PROTO_*)
 *
 * The function auto-detects protocol from binary signatures:
 *   - DNS: TCP length prefix + QR bit set
 *   - TLS: Content type 0x16, version 0x03 0x0X
 *   - RPC: Record marking header + reply msg type
 *
 * If no protocol matches, falls back to hex dump.
 */
banner_proto_t parse_binary_banner(const uint8_t *buf, size_t len,
                                   char *out, size_t out_len);

/*
 * Detect protocol type without parsing.
 *
 * buf - raw response bytes
 * len - length of response
 *
 * Returns: detected protocol type
 */
banner_proto_t detect_banner_protocol(const uint8_t *buf, size_t len);

/*
 * Get human-readable protocol name.
 *
 * proto - protocol type from detection
 *
 * Returns: static string like "DNS", "TLS", "RPC", or "UNKNOWN"
 */
const char *banner_proto_name(banner_proto_t proto);

#endif
