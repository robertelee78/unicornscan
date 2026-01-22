# Unicornscan Payload Module API Reference

This document describes the libunirainbow dynamic payload module API, including
the `create_payload()` function signature and the context data available to
payload modules during execution.

## Overview

Unicornscan uses dynamically-loaded shared object modules for generating
protocol-specific payloads. Modules are loaded from `src/payload_modules/` and
registered via the `init_module()` function.

## Module Registration

### init_module()

```c
int init_module(mod_entry_t *m);
```

Called when the module is loaded. Populates the `mod_entry_t` structure with
module metadata and payload parameters.

**Required fields:**
- `m->license` - License string (e.g., "GPLv2")
- `m->author` - Author name
- `m->desc` - Short description
- `m->iver` - Interface version (e.g., 0x0103)
- `m->type` - Must be `MI_TYPE_PAYLOAD`
- `m->param_u.payload_s.proto` - Protocol (IPPROTO_TCP or IPPROTO_UDP)
- `m->param_u.payload_s.sport` - Source port (-1 for any)
- `m->param_u.payload_s.dport` - Destination port
- `m->param_u.payload_s.payload_group` - Payload group ID

**Example:**
```c
int init_module(mod_entry_t *m) {
	snprintf(m->license, sizeof(m->license) - 1, "GPLv2");
	snprintf(m->author, sizeof(m->author) - 1, "unicornscan-modernization");
	snprintf(m->desc, sizeof(m->desc) - 1, "HTTP GET request");
	m->iver = 0x0103;
	m->type = MI_TYPE_PAYLOAD;

	m->param_u.payload_s.sport = -1;        /* any source port */
	m->param_u.payload_s.dport = 80;        /* HTTP */
	m->param_u.payload_s.proto = IPPROTO_TCP;
	m->param_u.payload_s.payload_group = 1;

	_m = m;
	s = _m->s;  /* global settings pointer */

	return 1;
}
```

### delete_module()

```c
void delete_module(void);
```

Called when the module is unloaded. Clean up any allocated resources.

## Payload Generation

### create_payload()

```c
int create_payload(uint8_t **data, uint32_t *dlen, void *user);
```

**Parameters:**
- `data` - Output: pointer to allocated payload buffer
- `dlen` - Output: payload length in bytes
- `user` - Context data (type depends on calling context)

**Returns:** 1 on success, 0 on failure

**Memory:** The module must allocate the payload buffer using `xmalloc()`.
The caller is responsible for freeing it.

## CRITICAL: Context Parameter Types

The `void *user` parameter has **different types** depending on how the
module is invoked:

### TCP Connect Mode (connect.c)

When payloads are generated during TCP connect scans, the context is an
`ip_report_t *` pointer:

```c
/* From src/scan_progs/connect.c:516 */
create_payload(&pay_ptr, &pay_size, (void *)r);  /* r is ip_report_t * */
```

**Usage pattern:**
```c
int create_payload(uint8_t **data, uint32_t *dlen, void *i) {
	union {
		void *p;
		ip_report_t *ir;
	} i_u;
	struct in_addr ia;
	char host_addr[32];

	i_u.p = i;
	assert(i != NULL && i_u.ir->magic == IP_REPORT_MAGIC);

	ia.s_addr = i_u.ir->host_addr;
	inet_ntop(AF_INET, &ia, host_addr, sizeof(host_addr));
	/* host_addr now contains target IP as string */
}
```

**Available data from ip_report_t:**
- `host_addr` - Target IPv4 address (uint32_t, network byte order)
- `sport` - Source port
- `dport` - Destination port
- `proto` - IP protocol
- `ttl` - TTL from received packet
- `trace_addr` - Response source address (for traceroute)

### UDP Sender Mode (send_packet.c)

When payloads are generated during UDP scans, the context is a
`struct sockaddr *` pointer:

```c
/* From src/scan_progs/send_packet.c:798 */
sl.create_payload(&sl.payload, &sl.payload_size, target_u.s);
```

**Usage pattern:**
```c
int create_payload(uint8_t **data, uint32_t *dlen, void *ir) {
	union sock_u s_u;
	char src_ip[128], dst_ip[128];

	/* Get local address from global settings */
	s_u.ss = &s->vi[0]->myaddr;
	snprintf(src_ip, sizeof(src_ip) - 1, "%s", cidr_saddrstr(s_u.s));

	/* Get target address from parameter */
	s_u.s = ir;
	snprintf(dst_ip, sizeof(dst_ip) - 1, "%s", cidr_saddrstr(s_u.s));
}
```

**Available data:**
- Target IP address (via `cidr_saddrstr()`)
- Local IP address (via `s->vi[0]->myaddr`)

### Ignored Context

Some modules (e.g., DHCP) ignore the context entirely when the payload
does not depend on target-specific information:

```c
int create_payload(uint8_t **data, uint32_t *dlen, void *ir) {
	/* ir is ignored - DHCP discover is target-independent */
	*data = (uint8_t *)xmalloc(pkt_len);
	/* ... build static payload ... */
	return 1;
}
```

## Important Limitations

### No Hostname Available

**CRITICAL:** Neither context type provides a hostname - only IP addresses.

This has significant implications for protocols requiring hostname information:

| Protocol | Impact |
|----------|--------|
| TLS/SNI | Cannot use real hostname in SNI extension |
| HTTP Host | Must use IP address or hardcoded value |
| SIP | Must use IP address in SIP URIs |

**Workarounds:**
1. Use IP address as SNI (some servers accept this)
2. Use a generic hostname (e.g., "localhost")
3. Add reverse DNS lookup (performance impact)
4. Modify architecture to pass hostname through settings

### IPv4 Only (ip_report_t)

The `ip_report_t` structure stores addresses as `uint32_t`, limiting it to
IPv4. The `struct sockaddr *` context supports both IPv4 and IPv6.

### No Session State

Modules receive no session state between invocations. Each `create_payload()`
call must be self-contained.

## Global Settings Access

Modules can access global settings via the `settings_t *s` pointer:

```c
static const settings_t *s = NULL;

int init_module(mod_entry_t *m) {
	_m = m;
	s = _m->s;  /* Store settings pointer */
	return 1;
}
```

**Useful settings:**
- `s->vi[0]->myaddr` - Local interface address
- `s->vi[0]->hwaddr` - Local MAC address
- `s->vi[0]->mtu` - Interface MTU

## Helper Functions

### cidr_saddrstr()

```c
const char *cidr_saddrstr(const struct sockaddr *);
```

Converts a sockaddr to a string representation. Supports both IPv4 and IPv6.

### xmalloc()

```c
void *xmalloc(size_t size);
```

Memory allocation wrapper that terminates on failure. Always use this
instead of raw `malloc()`.

## Coding Style

Payload modules must follow the Jack Louis coding style guide. Key points:

- K&R brace style (opening brace on same line)
- Tabs for indentation (8-space width)
- Use `xmalloc()` wrappers, not raw `malloc()`
- Use type-punning unions for pointer casts
- Initialize all variables at declaration
- Always check return values

See `docs/jack-louis-coding-style-guide.md` for complete style requirements.

## Example Modules

| Module | Protocol | Context Usage |
|--------|----------|---------------|
| `http.c` | TCP | Uses `ip_report_t->host_addr` |
| `sip.c` | UDP | Uses `struct sockaddr *` via `cidr_saddrstr()` |
| `upnp.c` | UDP | Uses `struct sockaddr *` via `cidr_saddrstr()` |
| `dhcp.c` | UDP | Ignores context |

## References

- `src/unilib/modules.h` - `mod_entry_t` structure definition
- `src/scan_progs/scan_export.h` - `ip_report_t` structure definition
- `src/settings.h` - `settings_t` and `union sock_u` definitions
- `src/unilib/cidr.h` - `cidr_saddrstr()` declaration
- `src/scan_progs/connect.c` - TCP payload invocation
- `src/scan_progs/send_packet.c` - UDP payload invocation
