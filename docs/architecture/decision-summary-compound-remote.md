# Decision Summary: Compound Mode Remote Target Handling

**Quick Reference for Implementers**

---

## The Problem (In 30 Seconds)

```
User runs:  unicornscan -mA+T 8.8.8.0/24 -r1000

Expectation: ARP discovers hosts, TCP scans them
Reality:     ARP phase fails (targets remote), phase 2 scans NOTHING

Why? ARP only works on local Layer 2 broadcast domain.
     Remote hosts (1+ router hops) won't respond to ARP.
```

---

## The Solution (Fail Early + Educate)

### Default Behavior
```bash
$ unicornscan -mA+T 8.8.8.0/24 -r1000

ERROR: Compound mode -mA+T requires targets on local network

Target:    8.8.8.0/24 (remote, 1+ hops away)
Interface: eth0 (192.168.1.5/24)

ARP scanning only works on Layer 2 broadcast domain.
Remote hosts will not respond to ARP requests.

Alternatives:
  1. Use -mT to skip ARP phase: unicornscan -mT 8.8.8.0/24 -r1000
  2. Scan local network: unicornscan -mA+T 192.168.1.0/24 -r1000
  3. Force anyway: unicornscan -mA+T 8.8.8.0/24 --force-remote

Exit code: 1
```

### With --force-remote Flag
```bash
$ unicornscan -mA+T 8.8.8.0/24 -r1000 --force-remote

WARNING: Running ARP phase on remote network (8.8.8.0/24)
WARNING: ARP will not discover remote hosts
WARNING: Phase 2 (TCP) will run on ALL targets regardless

[ARP phase completes with 0 results]
[TCP phase runs on all 254 IPs]
```

---

## Implementation Checklist

### Phase 1: Target Detection
- [ ] Create `src/scan_progs/target_utils.c`
- [ ] Implement `is_local_target(ip, iface)` - subnet comparison
- [ ] Implement `validate_arp_targets(spec)` - check target range
- [ ] Add `print_remote_target_error()` - educational message

### Phase 2: Parser Integration
- [ ] Modify `src/scan_progs/scanopts.c:scan_parsemode_compound()`
- [ ] Add validation hook after parsing phases
- [ ] Check if `phases[0].mode == MODE_ARPSCAN && has_remote_targets()`
- [ ] Return error if remote targets detected (unless force_remote)

### Phase 3: CLI Flag (Optional)
- [ ] Add `--force-remote` to `src/getconfig.c` long_options
- [ ] Add `force_remote` field to `src/settings.h:settings_t`
- [ ] Implement `scan_setforceremote(int val)` in `src/scan_progs/options.c`

### Phase 4: Testing
- [ ] Local network: `192.168.1.0/24` - should work
- [ ] Remote network: `8.8.8.0/24` - should error
- [ ] Remote + flag: `8.8.8.0/24 --force-remote` - should warn + continue
- [ ] Single mode: `-mT 8.8.8.0/24` - no validation
- [ ] Mixed: `192.168.1.0/24,8.8.8.0/24` - should error

---

## Code Snippets

### Target Locality Check
```c
// target_utils.c
int is_local_target(uint32_t target_ip, const struct intf_entry *iface) {
    if (!iface) return 0;

    uint32_t net = iface->intf_addr.addr_ip & iface->intf_addr.addr_bits;
    uint32_t bcast = net | (~iface->intf_addr.addr_bits);

    return (target_ip >= net && target_ip <= bcast);
}
```

### Validation Hook
```c
// scanopts.c
if (phases[0].mode == MODE_ARPSCAN) {
    if (!s->force_remote && validate_arp_targets(s->target_spec) < 0) {
        return -1; // Error already printed
    }
}
```

---

## Why This Approach?

| Criterion | Reasoning |
|-----------|-----------|
| **Explicit** | User specified `-mA+T`, we honor intent or explain why not |
| **Educational** | Error teaches L2/L3 distinction |
| **Simple** | Straightforward validation, no complex filtering logic |
| **Performant** | Prevents wasted time on impossible ARP scan |
| **Flexible** | `--force-remote` for edge cases we haven't thought of |

### Rejected Alternatives

1. **Auto-skip ARP (like nmap)** - Too magical, violates Jack's philosophy
2. **Mixed filtering** - Over-engineered, complex, inconsistent
3. **Always require flag** - More restrictive than necessary

---

## Comparison to Other Tools

```
┌─────────────┬──────────────────┬────────────────────┐
│ Tool        │ Approach         │ Philosophy         │
├─────────────┼──────────────────┼────────────────────┤
│ nmap        │ Auto-detect,     │ Convenience first  │
│             │ auto-skip ARP    │ (GUI-friendly)     │
├─────────────┼──────────────────┼────────────────────┤
│ masscan     │ Require          │ Expert tool,       │
│             │ --router-mac     │ minimal help       │
├─────────────┼──────────────────┼────────────────────┤
│ unicornscan │ Fail early,      │ Explicit +         │
│             │ explain, suggest │ Educational        │
└─────────────┴──────────────────┴────────────────────┘
```

---

## Jack Louis's Design Philosophy

From analysis of original unicornscan code:

> "Explicit is better than implicit. If you don't know what you're doing, the tool should tell you, not guess."

This decision embodies that principle:
- User explicitly chose `-mA+T`
- We explicitly tell them it won't work
- We explicitly suggest alternatives
- We don't silently change behavior

---

## Files Created

1. `/docs/architecture/ADR-001-compound-mode-remote-targets.md` - Full ADR
2. `/docs/research/compound-mode-remote-target-design.md` - Detailed analysis
3. `/docs/architecture/README.md` - ADR index
4. `/docs/architecture/decision-summary-compound-remote.md` - This file

---

## Next Steps

1. Review ADR-001 with project maintainers
2. Get approval on approach
3. Create implementation tasks in Archon
4. Begin Phase 1 implementation (target detection)
5. Test on real networks (local + remote)
6. Document behavior in man page

---

**Architect**: System Architecture Designer (Claude Sonnet 4.5)
**Date**: 2025-12-23
**Task**: b09a614e-6e5c-4126-8417-48bedafd9e94
**Status**: Ready for Review
