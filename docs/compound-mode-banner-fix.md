# Compound Mode Banner Capture Fix

## Issue
Banner capture was not working in compound scan modes (e.g., `-mA+sf`) while working correctly in standalone modes (e.g., `-msf`).

## Root Cause
The `S_DEFAULT_PAYLOAD` flag was not being preserved across phase transitions in compound mode.

### Technical Details

When a compound scan like `-mA+sf` runs:
1. **Phase 1 (ARP)**: Discovers live hosts
2. **Phase 2 (sf - TCP SYN+connect)**: Scans discovered hosts and attempts banner grabbing

During phase transitions, `load_phase_settings()` in `scanopts.c` copies phase-specific settings to the active scan settings. However, it was only preserving:
- `S_SRC_OVERRIDE` - phantom IP setting
- `L_USE_PROMISC` - promiscuous mode for phantom IP

The `S_DEFAULT_PAYLOAD` flag (which enables the default TCP payload used for banner grabbing) was being lost when phase 2 loaded its settings.

### The Fix

In `src/scan_progs/scanopts.c`, the `load_phase_settings()` function now preserves `S_DEFAULT_PAYLOAD` alongside other global flags:

```c
{
    uint16_t preserve_send = s->send_opts & (S_SRC_OVERRIDE | S_DEFAULT_PAYLOAD);
    uint16_t preserve_promisc = s->recv_opts & L_USE_PROMISC;
    s->send_opts = phase->send_opts | preserve_send;
    s->recv_opts = phase->recv_opts | preserve_promisc;
}
```

## Flags Reference

### send_opts (S_*) - Sender Options
| Flag | Value | Purpose | Phase-Specific? |
|------|-------|---------|-----------------|
| `S_SHUFFLE_PORTS` | 0x01 | Randomize port order | Yes |
| `S_SRC_OVERRIDE` | 0x02 | Use phantom/spoofed source IP | No (global) |
| `S_DEFAULT_PAYLOAD` | 0x04 | Use default TCP payload for banners | No (global) |
| `S_BROKEN_TRANS` | 0x08 | Broken transport layer | Yes |
| `S_BROKEN_NET` | 0x10 | Broken network layer | Yes |
| `S_SENDER_INTR` | 0x20 | Sender can be interrupted | Yes |

### recv_opts (L_*) - Listener Options
| Flag | Value | Purpose | Phase-Specific? |
|------|-------|---------|-----------------|
| `L_WATCH_ERRORS` | 0x01 | Watch ICMP errors | Yes |
| `L_USE_PROMISC` | 0x02 | Promiscuous mode | No (global) |
| `L_DO_CONNECT` | 0x04 | Enable TCP connect mode | Yes |
| `L_IGNORE_RSEQ` | 0x08 | Ignore RST sequence | Yes |
| `L_IGNORE_SEQ` | 0x10 | Ignore all sequences | Yes |
| `L_SNIFF` | 0x20 | Display packet parsing | Yes |

## Testing

```bash
# This should now capture banners:
sudo unicornscan -mA+sf -s 192.168.1.100/32 -r 100 target:22

# Expected output includes Banner field:
# TCP open    ssh[22]    from target  ttl 64 Banner `SSH-2.0-OpenSSH_9.6p1'
```

## Version
Fixed in version 0.4.32
