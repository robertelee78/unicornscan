# Unicornscan Cluster Mode User Guide

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Configuration Options](#configuration-options)
5. [Usage Examples](#usage-examples)
6. [Drone Setup](#drone-setup)
7. [Troubleshooting](#troubleshooting)
8. [Best Practices](#best-practices)

---

## Overview

Unicornscan's cluster mode enables distributed network scanning across multiple machines (called "drones"), allowing for:

- **Horizontal Scaling**: Spread scanning workload across multiple systems
- **Increased Throughput**: Achieve higher packets-per-second (PPS) rates
- **Network Segmentation**: Scan from different network vantage points
- **Resource Distribution**: Separate packet sending from response capture

### Drone Types

| Drone Type | Role | Description |
|------------|------|-------------|
| **Sender** | Transmitter | Sends probe packets to targets |
| **Listener** | Receiver | Captures and analyzes responses |
| **Output** | Collector | Aggregates scan results |

---

## Architecture

### Master-Drone Model

```
                   ┌─────────────────┐
                   │     Master      │
                   │  (unicornscan)  │
                   └────────┬────────┘
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Sender Drone │    │ Sender Drone │    │ Listener     │
│  (unisend)   │    │  (unisend)   │    │   (unilisten)│
└──────────────┘    └──────────────┘    └──────────────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ Target Network│
                    └───────────────┘
```

### Communication Protocol

- **Transport**: TCP sockets (remote) or Unix sockets (local)
- **Protocol**: Custom binary IPC with magic number validation
- **Version Checking**: Automatic drone version compatibility verification

---

## Quick Start

### Local Cluster (Same Machine)

The simplest cluster setup uses local drones on the same machine:

```bash
# Standard scan with local sender and listener (default)
unicornscan 192.168.1.0/24:1-1000

# Explicit local drones
unicornscan -ZL -ZS 192.168.1.0/24:1-1000
```

### Remote Cluster (Multiple Machines)

**Step 1: Start Listener Drone on Machine A (192.168.10.100)**
```bash
# Start listener in standalone mode, listening on port 5555
unilisten -L 192.168.10.100:5555
```

**Step 2: Start Sender Drone on Machine B (192.168.10.101)**
```bash
# Start sender in standalone mode, listening on port 5556
unisend -S 192.168.10.101:5556
```

**Step 3: Run Master on Machine C**
```bash
# Connect to remote drones and scan targets
unicornscan -Z 192.168.10.100:5555,192.168.10.101:5556 10.0.0.0/24:1-65535
```

---

## Configuration Options

### Command-Line Options

| Option | Long Form | Description |
|--------|-----------|-------------|
| `-Z <string>` | `--drone-str` | Drone configuration string |

### Drone String Format

The `-Z` option accepts three different formats:

#### 1. Local Listener Only
```bash
unicornscan -ZL<address>
# Example: Start local listener bound to specific interface
unicornscan -ZL192.168.1.10 target.example.com
```

#### 2. Local Sender Only
```bash
unicornscan -ZS<address>
# Example: Start local sender bound to specific interface
unicornscan -ZS192.168.1.10 target.example.com
```

#### 3. Remote Drone List
```bash
unicornscan -Z <host1:port>,<host2:port>,...
# Example: Connect to two remote drones
unicornscan -Z drone1.internal:5555,drone2.internal:5556 target.example.com
```

### URI Formats

| Format | Description | Example |
|--------|-------------|---------|
| `host:port` | TCP connection | `192.168.1.100:5555` |
| `unix:/path` | Unix domain socket | `unix:/tmp/unicorn.sock` |

---

## Usage Examples

### Example 1: Basic Remote Cluster Scan

Scan using two remote sender drones and one listener:

```bash
# Listener on machine 192.168.10.100:5555
# Senders on machines 192.168.10.101:5556 and 192.168.10.102:5557

unicornscan -Z 192.168.10.100:5555,192.168.10.101:5556,192.168.10.102:5557 \
    -mT -p1-65535 -r 10000 target-network.com/24
```

### Example 2: High-Performance TCP SYN Scan

Distribute a fast SYN scan across multiple senders:

```bash
# Configure high PPS rate distributed across drones
unicornscan -Z drone1:5555,drone2:5556,drone3:5557,listener:5558 \
    -mTs -r 50000 -p1-10000 192.168.0.0/16
```

### Example 3: UDP Scan with Multiple Listeners

Use multiple listener drones for better response capture:

```bash
# Multiple listeners can capture responses from different network segments
unicornscan -Z listener1:5555,listener2:5556,sender:5557 \
    -mU -p53,67,68,123,161,500 10.0.0.0/8
```

### Example 4: Local Unix Socket Connection

For same-machine coordination with Unix sockets:

```bash
# Start listener with Unix socket
unilisten -L unix:/tmp/unicorn-listen.sock &

# Start sender with Unix socket
unisend -S unix:/tmp/unicorn-send.sock &

# Connect master to Unix sockets
unicornscan -Z unix:/tmp/unicorn-listen.sock,unix:/tmp/unicorn-send.sock \
    192.168.1.0/24
```

---

## Drone Setup

### Starting Standalone Drones

#### Listener Drone (unilisten)

```bash
# Basic listener on default settings
unilisten -L 0.0.0.0:5555

# Listener with specific interface
unilisten -L 0.0.0.0:5555 -i eth0

# Listener with verbose output
unilisten -L 0.0.0.0:5555 -v 3
```

#### Sender Drone (unisend)

```bash
# Basic sender on default settings
unisend -S 0.0.0.0:5556

# Sender with specific interface
unisend -S 0.0.0.0:5556 -i eth0

# Sender with high PPS capability
unisend -S 0.0.0.0:5556 -r 100000
```

### Drone Connection Sequence

When the master connects to drones, the following handshake occurs:

```
1. Master → Drone: MSG_IDENT (request identification)
2. Drone → Master: MSG_IDENTSENDER or MSG_IDENTLISTENER (with version info)
3. Master → Drone: MSG_ACK (acknowledge identity)
4. Drone → Master: MSG_READY (ready for work)
5. Master → Drone: MSG_WORKUNIT (assign work)
6. ...scan execution...
7. Drone → Master: MSG_WORKDONE (completion status)
8. Master → Drone: MSG_TERMINATE or MSG_QUIT (shutdown)
```

---

## Troubleshooting

### Common Issues

#### 1. "drone version mismatch"
```
Error: drone on fd X has different version, marking as dead
```
**Cause**: Drone and master are running different Unicornscan versions.
**Solution**: Ensure all components use the same version.

#### 2. "cant connect to drone"
```
Error: cant connect to drone at host:port
```
**Cause**: Network connectivity or firewall issues.
**Solution**:
- Verify drone is running: `netstat -tlnp | grep <port>`
- Check firewall rules: `iptables -L -n`
- Test connectivity: `nc -zv <host> <port>`

#### 3. "too many errors, giving up on drones"
```
Error: too many errors, giving up on drones
```
**Cause**: More than 10 consecutive connection errors.
**Solution**: Check network stability and drone health.

#### 4. "no drones?"
```
Error: no drones?, thats not going to work
```
**Cause**: Empty or invalid drone string.
**Solution**: Verify `-Z` option syntax.

### Debugging

Enable debug output for drone operations:

```bash
# High verbosity with drone debug mask
unicornscan -Z drone:5555 -v 5 -d M_DRN target.example.com
```

Debug mask options:
- `M_DRN` - Drone operations
- `M_IPC` - IPC messaging
- `M_MST` - Master coordination

---

## Best Practices

### 1. Network Placement

- **Listener placement**: The listener must be able to capture responses to the source IP used in probes. If scanning with your real IP, run the listener on that host. If spoofing (with `fantaip`), the listener must be on the network where responses to the spoofed IP will arrive.
- **Sender placement**: Senders can be anywhere with network connectivity to targets. Multiple senders increase aggregate PPS.
- **NAT warning**: Do NOT place senders behind NAT unless you understand that responses will go to the NAT device's external IP, not back through NAT. You'd need a listener positioned to capture traffic at the NAT egress point.

### 2. Resource Allocation

| Metric | Recommended |
|--------|-------------|
| Senders per scan | 2-8 |
| Listeners per scan | 1-4 |
| Max drones total | 32 (hard limit) |

### 3. Performance Tuning

```bash
# Increase system limits for high-volume scanning
ulimit -n 65535  # File descriptors
sysctl -w net.core.rmem_max=16777216
sysctl -w net.core.wmem_max=16777216
```

### 4. Security Considerations

- **Network Segmentation**: Isolate drone traffic from production networks
- **Access Control**: Use firewalls to restrict drone port access
- **No Authentication**: Note that drone connections are NOT authenticated
- **Plaintext Protocol**: All IPC messages are unencrypted

### 5. Workload Distribution

- Multiple senders share the workunit (target/port ranges) and send in parallel
- One listener is typically sufficient - responses go to one source IP
- Multiple listeners only help if using multiple source IPs or need capture redundancy
- Monitor drone status during long scans with `-v` verbosity

---

## Technical Reference

### Data Structures

#### Send Workunit
```c
typedef struct send_workunit_t {
    uint32_t magic;              // Protocol identifier (0x1a1b1c1d for TCP)
    uint32_t repeats;            // Packet repeat count
    uint16_t send_opts;          // Sender options
    uint32_t pps;                // Packets per second
    struct sockaddr_storage target;       // Target network
    struct sockaddr_storage targetmask;   // Target netmask
    uint16_t fingerprint;        // TCP fingerprint ID
    // ... additional fields
} send_workunit_t;
```

#### Receive Workunit
```c
typedef struct recv_workunit_t {
    uint32_t magic;              // Protocol identifier (0xa1b1c1d1 for TCP)
    uint8_t recv_timeout;        // Timeout in seconds
    uint32_t syn_key;            // SYN cookie verification key
    struct sockaddr_storage listen_addr;  // Filter address
    struct sockaddr_storage listen_mask;  // Filter netmask
    // ... additional fields
} recv_workunit_t;
```

### Magic Numbers

| Protocol | Send Magic | Recv Magic |
|----------|------------|------------|
| TCP | 0x1a1b1c1d | 0xa1b1c1d1 |
| UDP | 0x2a2b2c2d | 0xa2b2c2d2 |
| ARP | 0x3a3b3c3d | 0xa3b3c4d3 |
| ICMP | 0x4a4b4c4d | 0xa4b4c4d4 |

### Drone Status Codes

| Status | Value | Description |
|--------|-------|-------------|
| UNKNOWN | 0 | Initial state |
| CONNECTED | 1 | TCP connection established |
| IDENT | 2 | Identity verified |
| READY | 3 | Ready for work |
| DEAD | 4 | Connection failed/terminated |
| WORKING | 5 | Processing workunit |
| DONE | 6 | Completed successfully |

---

## Limitations

1. **Maximum Drones**: Hard limit of 32 concurrent drones (MAX_CONNS)
2. **No Authentication**: Drone connections are not authenticated
3. **No Encryption**: All communication is plaintext
4. **No Auto-Recovery**: Failed drones are not automatically reconnected
5. **Version Strictness**: All drones must match master version exactly

---

## See Also

- `unicornscan(1)` - Main scanner manual page
- `unisend(1)` - Sender drone manual page
- `unilisten(1)` - Listener drone manual page
- `docs/cluster/CLUSTER_SCALABILITY_ANALYSIS.md` - Technical scalability analysis

---

**Document Version**: 1.0
**Last Updated**: 2025-12-16
**Unicornscan Version**: 0.4.7
