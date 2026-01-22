/**********************************************************************
 * Copyright (C) 2026 Robert E. Lee <robert@unicornscan.org>          *
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
/*
 * MongoDB wire protocol payload module
 *
 * Generates an OP_MSG isMaster command that elicits a server response
 * containing MongoDB version, server capabilities, and configuration.
 *
 * Features:
 * - Uses modern OP_MSG format (MongoDB 3.6+)
 * - Unique request IDs per target for response correlation
 * - Includes client metadata for better fingerprinting
 * - Compatible with MongoDB 3.6 through 8.x
 *
 * Reference: https://www.mongodb.com/docs/manual/reference/mongodb-wire-protocol/
 */
#include <config.h>

#include <scan_progs/scanopts.h>
#include <scan_progs/scan_export.h>
#include <settings.h>

#include <unilib/xmalloc.h>
#include <unilib/output.h>
#include <unilib/modules.h>

#include <arpa/inet.h>
#include <string.h>

int create_payload(uint8_t **, uint32_t *, void *);
int init_module(mod_entry_t *);
void delete_module(void);

static mod_entry_t *_m = NULL;
static const settings_t *s = NULL;

/*
 * MongoDB wire protocol constants
 */
#define MONGO_OP_MSG		2013	/* OP_MSG opcode (MongoDB 3.6+) */
#define MONGO_SECTION_BODY	0x00	/* Section kind: body */

/*
 * BSON type constants
 */
#define BSON_TYPE_DOUBLE	0x01
#define BSON_TYPE_STRING	0x02
#define BSON_TYPE_DOCUMENT	0x03
#define BSON_TYPE_INT32		0x10
#define BSON_TYPE_INT64		0x12

int init_module(mod_entry_t *m) {
	snprintf(m->license, sizeof(m->license) - 1, "GPLv2");
	snprintf(m->author, sizeof(m->author) - 1, "unicornscan-modernization");
	snprintf(m->desc, sizeof(m->desc) - 1, "MongoDB isMaster OP_MSG");
	m->iver = 0x0103;
	m->type = MI_TYPE_PAYLOAD;

	m->param_u.payload_s.sport = -1;
	m->param_u.payload_s.dport = 27017;
	m->param_u.payload_s.proto = IPPROTO_TCP;
	m->param_u.payload_s.payload_group = 1;

	_m = m;
	s = _m->s;
	return 1;
}

void delete_module(void) {
	return;
}

/*
 * Helper: Write a 32-bit little-endian integer
 */
static void write_le32(uint8_t *p, uint32_t val) {
	p[0] = (val >> 0) & 0xff;
	p[1] = (val >> 8) & 0xff;
	p[2] = (val >> 16) & 0xff;
	p[3] = (val >> 24) & 0xff;
}

/*
 * Build MongoDB OP_MSG isMaster command
 *
 * Wire Protocol Structure (OP_MSG):
 *
 * [Message Header - 16 bytes]
 *   messageLength: int32 (total message size including header)
 *   requestID: int32 (unique per connection, we use target IP hash)
 *   responseTo: int32 (0 for client requests)
 *   opCode: int32 (2013 for OP_MSG)
 *
 * [OP_MSG Body]
 *   flagBits: uint32 (0 for simple request)
 *   sections: one or more sections
 *     [Section Type 0 - Body]
 *       kind: byte (0 = body)
 *       body: BSON document
 *
 * BSON Document for isMaster:
 * {
 *   isMaster: 1,
 *   client: { driver: { name: "unicornscan" } },
 *   $db: "admin"
 * }
 *
 * The isMaster command returns server info including:
 * - ismaster, secondary, arbiter status
 * - maxBsonObjectSize, maxMessageSizeBytes
 * - version, minWireVersion, maxWireVersion
 * - hosts (for replica sets)
 */
int create_payload(uint8_t **data, uint32_t *dlen, void *i) {
	union {
		void *p;
		ip_report_t *ir;
	} i_u;
	uint8_t bson_doc[256];
	uint8_t *bp = NULL;
	size_t bson_len = 0;
	size_t msg_len = 0;
	uint8_t *pkt = NULL;
	uint8_t *p = NULL;
	uint32_t request_id = 0;

	i_u.p = i;

	assert(i != NULL && i_u.ir->magic == IP_REPORT_MAGIC);

	/*
	 * Generate unique request ID from target address
	 * This allows correlation of responses to targets
	 */
	request_id = i_u.ir->host_addr ^ 0x4d4f4e47;	/* XOR with "MONG" */

	/*
	 * Build BSON document for isMaster command
	 *
	 * BSON structure:
	 * - int32 document_size (including this field)
	 * - elements (type, name, value)
	 * - null terminator (0x00)
	 *
	 * Element format:
	 * - byte type
	 * - cstring name (null-terminated)
	 * - type-specific value
	 */
	bp = bson_doc;

	/* Skip document size (we'll fill it in at the end) */
	bp += 4;

	/* Element: isMaster: 1 (int32) */
	*bp++ = BSON_TYPE_INT32;		/* type */
	memcpy(bp, "isMaster", 8); bp += 8;	/* key */
	*bp++ = 0x00;				/* null terminator */
	write_le32(bp, 1); bp += 4;		/* value: 1 */

	/*
	 * Element: client: { driver: { name: "unicornscan" } }
	 * This embedded document helps identify our scanner in logs
	 *
	 * Outer document: client
	 */
	*bp++ = BSON_TYPE_DOCUMENT;		/* type */
	memcpy(bp, "client", 6); bp += 6;	/* key */
	*bp++ = 0x00;				/* null terminator */

	/* Client document size placeholder - offset 22 bytes from start */
	{
		uint8_t *client_size_ptr = bp;
		uint8_t *client_start = bp;
		bp += 4;	/* skip size field */

		/* Nested document: driver */
		*bp++ = BSON_TYPE_DOCUMENT;		/* type */
		memcpy(bp, "driver", 6); bp += 6;	/* key */
		*bp++ = 0x00;				/* null terminator */

		/* Driver document */
		{
			uint8_t *driver_size_ptr = bp;
			uint8_t *driver_start = bp;
			bp += 4;	/* skip size field */

			/* Element: name: "unicornscan" */
			*bp++ = BSON_TYPE_STRING;		/* type */
			memcpy(bp, "name", 4); bp += 4;		/* key */
			*bp++ = 0x00;				/* null terminator */
			write_le32(bp, 12); bp += 4;		/* string length + null */
			memcpy(bp, "unicornscan", 11); bp += 11; /* string value */
			*bp++ = 0x00;				/* null terminator */

			*bp++ = 0x00;	/* driver document terminator */

			/* Fill in driver document size */
			write_le32(driver_size_ptr, (uint32_t)(bp - driver_start));
		}

		*bp++ = 0x00;	/* client document terminator */

		/* Fill in client document size */
		write_le32(client_size_ptr, (uint32_t)(bp - client_start));
	}

	/* Element: $db: "admin" (required for OP_MSG) */
	*bp++ = BSON_TYPE_STRING;		/* type */
	memcpy(bp, "$db", 3); bp += 3;		/* key */
	*bp++ = 0x00;				/* null terminator */
	write_le32(bp, 6); bp += 4;		/* string length + null */
	memcpy(bp, "admin", 5); bp += 5;	/* string value */
	*bp++ = 0x00;				/* null terminator */

	/* Document terminator */
	*bp++ = 0x00;

	/* Fill in document size at the beginning */
	bson_len = (size_t)(bp - bson_doc);
	write_le32(bson_doc, (uint32_t)bson_len);

	/*
	 * Build OP_MSG message
	 *
	 * Total size:
	 * - Message header: 16 bytes
	 * - Flags: 4 bytes
	 * - Section kind: 1 byte
	 * - BSON document: bson_len bytes
	 */
	msg_len = 16 + 4 + 1 + bson_len;

	pkt = (uint8_t *)xmalloc(msg_len);
	memset(pkt, 0, msg_len);
	p = pkt;

	/*
	 * Message Header
	 */
	write_le32(p, (uint32_t)msg_len);	/* messageLength */
	p += 4;
	write_le32(p, request_id);		/* requestID */
	p += 4;
	write_le32(p, 0);			/* responseTo (0 for client) */
	p += 4;
	write_le32(p, MONGO_OP_MSG);		/* opCode */
	p += 4;

	/*
	 * OP_MSG Flags
	 * - 0x00000000: no flags (simple request, wait for response)
	 */
	write_le32(p, 0);
	p += 4;

	/*
	 * Section: Body (kind = 0)
	 */
	*p++ = MONGO_SECTION_BODY;

	/*
	 * BSON Document
	 */
	memcpy(p, bson_doc, bson_len);
	p += bson_len;

	/* Verify we wrote the expected length */
	assert((size_t)(p - pkt) == msg_len);

	*data = pkt;
	*dlen = (uint32_t)msg_len;

	return 1;
}
