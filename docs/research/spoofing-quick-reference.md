# IP Spoofing Quick Reference for Unicornscan Implementation

## Command-Line Interface Quick Reference

| Feature | Nmap Syntax | Recommended Unicornscan | Capability Required |
|---------|-------------|------------------------|---------------------|
| Source IP spoofing | `-S <ip>` | `-S <ip>` | CAP_NET_RAW |
| Decoy scanning | `-D <ip1>,<ip2>,ME` | `-D <ip1>,<ip2>,ME` | CAP_NET_RAW |
| Random decoys | `-D RND:5` | `-D RND:5` | CAP_NET_RAW |
| MAC spoofing | `--spoof-mac <mac>` | `--spoof-mac <mac>` | CAP_NET_RAW |
| Source port | `-g <port>` | `-g <port>` | CAP_NET_BIND_SERVICE (if <1024) |
| TTL manipulation | `--ttl <value>` | `--ttl <value>` | CAP_NET_RAW |
| Fragmentation (8B) | `-f` | `-f` | CAP_NET_RAW |
| Fragmentation (16B) | `-ff` | `-ff` | CAP_NET_RAW |
| Custom MTU | `--mtu <size>` | `--mtu <size>` | CAP_NET_RAW |
| Interface selection | `-e <iface>` | `-e <iface>` | - |

## Effectiveness Matrix (2025-2026)

| Technique | Basic IDS | DPI | BCP38 | uRPF Strict | uRPF Loose | Modern ML-IDS |
|-----------|-----------|-----|-------|-------------|------------|---------------|
| Source IP spoofing | ⚠️ Moderate | ❌ Low | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Low |
| Decoy scanning | ✅ High | ⚠️ Moderate | ⚠️ Moderate | ⚠️ Moderate | ⚠️ Moderate | ⚠️ Moderate |
| MAC spoofing (local) | ✅ High | ✅ High | ✅ High | ✅ High | ✅ High | ⚠️ Moderate |
| Fragmentation | ⚠️ Moderate | ❌ Low | N/A | N/A | N/A | ❌ Low |
| TTL manipulation | ⚠️ Moderate | ❌ Low | N/A | N/A | N/A | ❌ Low |
| Combined techniques | ⚠️ Moderate | ⚠️ Moderate | ❌ Low | ❌ Low | ⚠️ Moderate | ⚠️ Moderate |

**Legend**: ✅ High effectiveness | ⚠️ Moderate effectiveness | ❌ Low effectiveness | N/A Not applicable

## Anti-Spoofing Detection Quick Tests

### Test 1: BCP38 Detection
```bash
# Send packet with bogon source IP (e.g., 10.0.0.1)
unicornscan -S 10.0.0.1 -p 80 <external_target>

# If no response AND no egress traffic detected → BCP38 active
# Use tcpdump on egress interface to verify
```

### Test 2: uRPF Mode Detection
```bash
# Test 1: Legitimate source IP from local network
unicornscan -S <local_ip> -p 80 <target>

# Test 2: Bogon source IP
unicornscan -S 10.0.0.1 -p 80 <target>

# Test 3: Valid external IP (not local)
unicornscan -S 8.8.8.8 -p 80 <target>

# Results:
# All blocked → Strict uRPF
# Only bogon blocked → Loose uRPF
# None blocked → No uRPF
```

### Test 3: Fragmentation Support
```bash
# Non-fragmented baseline
unicornscan -p 80 <target>

# Fragmented test
unicornscan -f -p 80 <target>

# Compare response rates
# Significant difference → Fragment filtering active
```

## Implementation Checklist

### Priority 1: Core Features (v0.5.x)
- [ ] Source IP spoofing (`-S <ip>`)
  - [ ] Interface selection (`-e <iface>`)
  - [ ] Validation of spoofed IP format
  - [ ] Warning when spoofing detected as ineffective
- [ ] Decoy scanning (`-D <ip1>,<ip2>,ME`)
  - [ ] Manual decoy specification
  - [ ] `ME` keyword for position control
  - [ ] Random decoy generation (`RND:<count>`)
  - [ ] Validation that decoy hosts are up
- [ ] MAC address spoofing (`--spoof-mac <mac>`)
  - [ ] Specific MAC specification
  - [ ] Vendor-based random MAC (e.g., `--spoof-mac Cisco`)
  - [ ] Fully random MAC (`--spoof-mac 0`)
  - [ ] Local network detection (only works on L2)
- [ ] Source port spoofing (`-g <port>`)
  - [ ] Privileged port support (<1024)
  - [ ] Capability check (CAP_NET_BIND_SERVICE)
- [ ] TTL manipulation (`--ttl <value>`)
  - [ ] Range validation (1-255)
  - [ ] OS-default presets (Linux=64, Windows=128, etc.)
- [ ] Fragmentation (`-f`, `--mtu <size>`)
  - [ ] 8-byte fragmentation (`-f`)
  - [ ] 16-byte fragmentation (`-ff`)
  - [ ] Custom MTU (validated as multiple of 8)
  - [ ] IPv4 fragmentation support
- [ ] Capability-based privilege system
  - [ ] CAP_NET_RAW detection
  - [ ] CAP_NET_BIND_SERVICE detection
  - [ ] Graceful degradation when capabilities missing
  - [ ] User-friendly capability setup instructions

### Priority 2: Detection & Validation (v0.6.x)
- [ ] BCP38 detection
  - [ ] Automatic test with bogon source
  - [ ] Report findings to user
- [ ] uRPF mode detection
  - [ ] Strict/loose/disabled identification
  - [ ] Report mode to user
- [ ] Fragmentation support detection
  - [ ] Test fragmented vs. non-fragmented
  - [ ] Report reassembly capability
- [ ] DPI detection heuristics
  - [ ] Packet normalization tests
  - [ ] Report likely DPI presence
- [ ] Anti-spoofing summary report
  - [ ] Consolidated findings
  - [ ] Recommendations for effective evasion

### Priority 3: Advanced Features (v1.0+)
- [ ] Intelligent decoy selection
  - [ ] Scan target network for live hosts
  - [ ] Select plausible decoys automatically
- [ ] TTL calculation
  - [ ] Traceroute-based hop count
  - [ ] Optimal TTL for "local" appearance
- [ ] Spoofing effectiveness scoring
  - [ ] Real-time detection of spoofing failures
  - [ ] Adaptive strategy adjustment
- [ ] IPv6 spoofing support
  - [ ] Source IPv6 address spoofing
  - [ ] IPv6 fragmentation (different from IPv4)
  - [ ] IPv6-specific anti-spoofing detection
- [ ] eBPF integration
  - [ ] Kernel-level packet crafting
  - [ ] Performance optimization
  - [ ] Advanced evasion techniques

## Linux Capabilities Setup

### Method 1: Using setcap (Recommended)
```bash
# Basic spoofing (no root needed)
sudo setcap cap_net_raw=eip /usr/local/bin/unicornscan

# Full spoofing suite
sudo setcap cap_net_raw,cap_net_bind_service=eip /usr/local/bin/unicornscan

# With eBPF support (Linux 5.8+)
sudo setcap cap_net_raw,cap_bpf=eip /usr/local/bin/unicornscan

# Verify capabilities
getcap /usr/local/bin/unicornscan
```

### Method 2: Using make setcap (Project-specific)
```bash
# From unicornscan source directory
sudo make setcap

# This should set appropriate capabilities on all binaries
```

### Method 3: Runtime capability check
```c
#include <sys/capability.h>

bool has_net_raw_capability(void) {
    cap_t caps = cap_get_proc();
    if (!caps) return false;

    cap_flag_value_t value;
    cap_get_flag(caps, CAP_NET_RAW, CAP_EFFECTIVE, &value);
    cap_free(caps);

    return (value == CAP_SET);
}
```

## Common Spoofing Scenarios

### Scenario 1: Basic Attribution Obfuscation
```bash
# Goal: Hide real IP in IDS logs
# Effectiveness: Moderate (if BCP38 not enforced)
unicornscan -D RND:10 -p 1-1000 <target>

# 10 random decoys + your real IP
# IDS sees 11 scanners, cannot easily identify real source
```

### Scenario 2: Firewall Rule Testing
```bash
# Goal: Test if firewall trusts internal IP
# Effectiveness: High (for testing)
unicornscan -S 192.168.1.100 -e eth0 -p 22,80,443 <target>

# Note: You won't see responses (they go to .100)
# Monitor with tcpdump to see if packets accepted/dropped
```

### Scenario 3: Local Network ARP Spoofing
```bash
# Goal: Impersonate local host via MAC spoofing
# Effectiveness: High (on local LAN)
unicornscan --spoof-mac AA:BB:CC:DD:EE:FF -p 1-65535 <local_target>

# Only works on Layer 2 (same network segment)
# Requires knowledge of target's trusted MAC addresses
```

### Scenario 4: IDS Evasion (Fragmentation + Decoys)
```bash
# Goal: Evade signature-based IDS
# Effectiveness: Moderate (against legacy IDS)
unicornscan -f -D RND:5 --ttl 64 -p 80,443,8080 <target>

# Fragment packets (split TCP header)
# Use 5 decoys
# Set Linux-standard TTL
```

### Scenario 5: Stealthy Source Port Spoofing
```bash
# Goal: Bypass firewall that trusts DNS/HTTP sources
# Effectiveness: Moderate (against stateless filters)
unicornscan -g 53 -p 1-1000 <target>

# Source port 53 (DNS) often trusted
# Some firewalls allow return traffic from "DNS servers"
# Requires CAP_NET_BIND_SERVICE
```

### Scenario 6: Maximum Evasion Combination
```bash
# Goal: Combine all techniques
# Effectiveness: Variable (depends on defenses)
unicornscan \
  -S 192.168.1.50 \          # Spoof internal IP
  -D RND:8 \                  # 8 random decoys
  -g 53 \                     # Source port 53 (DNS)
  --ttl 64 \                  # Linux default TTL
  -f \                        # Fragment packets
  --spoof-mac Cisco \         # Random Cisco MAC (if local)
  -e eth0 \                   # Specific interface
  -p 1-1000 <target>

# Kitchen sink approach
# Use only when authorized!
```

## Warning Signs of Anti-Spoofing Measures

### BCP38 Active
```
Symptoms:
- Spoofed packets never leave local network
- tcpdump on egress shows dropped packets
- Only packets with local source IPs pass

Solution:
- Use decoy scanning instead of full spoofing
- Ensure decoy IPs are within allowed prefix
```

### uRPF Strict Mode Active
```
Symptoms:
- Only packets arriving on "correct" interface forwarded
- Asymmetric routing breaks connectivity
- Spoofed packets consistently dropped

Solution:
- Cannot effectively bypass strict uRPF
- Reconnaissance to identify network topology
- Use decoys from expected source networks
```

### DPI Active
```
Symptoms:
- Packets modified in transit (normalization)
- Fragmented packets reassembled before delivery
- TTL inconsistencies detected and flagged

Solution:
- Combine multiple evasion techniques
- Randomize packet characteristics
- Use encrypted channels (VPN/Tor) for C2
```

### ML-based IDS Active
```
Symptoms:
- Static evasion patterns detected
- Behavioral anomalies flagged
- Decoy scanning identified via timing analysis

Solution:
- Randomize all parameters (timing, TTL, fragmentation)
- Mimic legitimate traffic patterns
- Slow down scan (--scan-delay)
```

## Code Snippets for Implementation

### Capability Check (C)
```c
#include <sys/capability.h>
#include <stdio.h>
#include <stdlib.h>

int check_capabilities(void) {
    cap_t caps;
    cap_flag_value_t cap_value;
    int has_net_raw = 0;
    int has_net_bind = 0;

    caps = cap_get_proc();
    if (caps == NULL) {
        perror("cap_get_proc");
        return -1;
    }

    // Check CAP_NET_RAW
    if (cap_get_flag(caps, CAP_NET_RAW, CAP_EFFECTIVE, &cap_value) == 0) {
        has_net_raw = (cap_value == CAP_SET);
    }

    // Check CAP_NET_BIND_SERVICE
    if (cap_get_flag(caps, CAP_NET_BIND_SERVICE, CAP_EFFECTIVE, &cap_value) == 0) {
        has_net_bind = (cap_value == CAP_SET);
    }

    cap_free(caps);

    if (!has_net_raw) {
        fprintf(stderr, "Error: CAP_NET_RAW not set\n");
        fprintf(stderr, "Run: sudo setcap cap_net_raw=eip %s\n", program_invocation_name);
        return -1;
    }

    return 0;
}
```

### Raw Socket Creation with Spoofed Source
```c
#include <sys/socket.h>
#include <netinet/ip.h>
#include <netinet/tcp.h>
#include <string.h>

int create_raw_socket(void) {
    int sockfd = socket(AF_INET, SOCK_RAW, IPPROTO_TCP);
    if (sockfd < 0) {
        perror("socket(SOCK_RAW)");
        return -1;
    }

    // Tell kernel we will provide IP header
    int one = 1;
    if (setsockopt(sockfd, IPPROTO_IP, IP_HDRINCL, &one, sizeof(one)) < 0) {
        perror("setsockopt(IP_HDRINCL)");
        close(sockfd);
        return -1;
    }

    return sockfd;
}

void spoof_source_ip(struct iphdr *iph, uint32_t spoofed_ip) {
    iph->saddr = spoofed_ip;

    // Recalculate checksum
    iph->check = 0;
    iph->check = calculate_ip_checksum((uint16_t *)iph, iph->ihl * 4);
}
```

### Decoy IP Generation
```c
#include <stdlib.h>
#include <time.h>

void generate_random_decoys(uint32_t *decoys, size_t count, uint32_t network, uint32_t netmask) {
    srand(time(NULL));

    for (size_t i = 0; i < count; i++) {
        // Generate random IP within network
        uint32_t host_part = rand() & ~netmask;
        decoys[i] = network | host_part;

        // Avoid network/broadcast addresses
        if ((decoys[i] & ~netmask) == 0 || (decoys[i] | netmask) == 0xFFFFFFFF) {
            i--; // Retry
        }
    }
}
```

### Fragment Packet
```c
#include <netinet/ip.h>

void fragment_packet(const uint8_t *packet, size_t packet_len,
                    uint8_t *fragments[], size_t *frag_lens,
                    size_t *frag_count, size_t mtu) {
    struct iphdr *orig_iph = (struct iphdr *)packet;
    size_t header_len = orig_iph->ihl * 4;
    size_t data_len = packet_len - header_len;
    size_t fragment_data_size = mtu - header_len;

    // Ensure fragment size is multiple of 8
    fragment_data_size = (fragment_data_size / 8) * 8;

    *frag_count = (data_len + fragment_data_size - 1) / fragment_data_size;

    for (size_t i = 0; i < *frag_count; i++) {
        size_t offset = i * fragment_data_size;
        size_t this_frag_data = (i == *frag_count - 1) ?
                                (data_len - offset) : fragment_data_size;

        // Allocate fragment
        fragments[i] = malloc(header_len + this_frag_data);
        frag_lens[i] = header_len + this_frag_data;

        // Copy IP header
        memcpy(fragments[i], packet, header_len);
        struct iphdr *frag_iph = (struct iphdr *)fragments[i];

        // Set fragment offset and flags
        frag_iph->frag_off = htons((offset / 8) | (i < *frag_count - 1 ? IP_MF : 0));
        frag_iph->tot_len = htons(header_len + this_frag_data);

        // Copy fragment data
        memcpy(fragments[i] + header_len, packet + header_len + offset, this_frag_data);

        // Recalculate checksum
        frag_iph->check = 0;
        frag_iph->check = calculate_ip_checksum((uint16_t *)frag_iph, header_len);
    }
}
```

## Testing and Validation

### Test Suite for Spoofing Features
```bash
#!/bin/bash
# test-spoofing.sh - Validate spoofing implementation

# Test 1: Basic source IP spoofing
test_source_ip_spoof() {
    echo "[*] Testing source IP spoofing..."
    unicornscan -S 192.168.1.100 -p 80 127.0.0.1
    # Verify with tcpdump that source IP is spoofed
}

# Test 2: Decoy scanning
test_decoy_scanning() {
    echo "[*] Testing decoy scanning..."
    unicornscan -D 192.168.1.10,192.168.1.20,ME -p 80 127.0.0.1
    # Verify multiple source IPs in traffic
}

# Test 3: MAC spoofing
test_mac_spoofing() {
    echo "[*] Testing MAC spoofing..."
    unicornscan --spoof-mac AA:BB:CC:DD:EE:FF -p 80 192.168.1.1
    # Verify MAC address in Ethernet frame
}

# Test 4: Fragmentation
test_fragmentation() {
    echo "[*] Testing fragmentation..."
    unicornscan -f -p 80 127.0.0.1
    # Verify packets are fragmented
}

# Test 5: Combined techniques
test_combined() {
    echo "[*] Testing combined evasion..."
    unicornscan -f -D RND:3 --ttl 64 -p 80 127.0.0.1
    # Verify all techniques applied
}

# Run all tests
test_source_ip_spoof
test_decoy_scanning
test_mac_spoofing
test_fragmentation
test_combined

echo "[+] All tests completed"
```

## Legal and Ethical Guidelines

### ✅ AUTHORIZED USE
- Written authorization from network owner
- Penetration testing contracts
- Bug bounty programs with explicit scope
- Own networks and systems
- Isolated lab environments

### ❌ UNAUTHORIZED USE
- Scanning without permission
- Using spoofing to hide malicious activity
- DDoS attacks with spoofed sources
- Circumventing access controls
- Violating ISP terms of service

### 🎓 EDUCATIONAL USE
- Documented research projects
- Academic study in controlled environments
- Security training with sandboxed networks
- Conference presentations with lab setup

### ⚖️ LEGAL CONSIDERATIONS
- **US**: Computer Fraud and Abuse Act (CFAA)
- **UK**: Computer Misuse Act 1990
- **EU**: Directive 2013/40/EU
- **International**: Council of Europe Convention on Cybercrime

**Always consult legal counsel before conducting security testing with spoofing techniques.**

---

**Document Version**: 1.0
**Last Updated**: 2025-12-16
**Part of**: Unicornscan Modernization Project
