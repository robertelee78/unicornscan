# Unicornscan Cluster Mode Documentation

This directory contains comprehensive documentation for Unicornscan's distributed scanning (cluster mode) functionality.

## Documentation Index

| Document | Description |
|----------|-------------|
| [CLUSTER_MODE_GUIDE.md](CLUSTER_MODE_GUIDE.md) | **User Guide** - How to configure and use cluster mode for distributed scanning |
| [CLUSTER_SCALABILITY_ANALYSIS.md](CLUSTER_SCALABILITY_ANALYSIS.md) | **Technical Analysis** - Deep dive into architecture, scalability limits, and fault tolerance |

## Quick Reference

### Starting a Distributed Scan

```bash
# 1. On listener machine (192.168.10.100):
unilisten -L 0.0.0.0:5555

# 2. On sender machine (192.168.10.101):
unisend -S 0.0.0.0:5556

# 3. On master machine:
unicornscan -Z 192.168.10.100:5555,192.168.10.101:5556 target.example.com
```

### Drone Configuration Options

| Option | Description |
|--------|-------------|
| `-ZL<addr>` | Start local listener drone |
| `-ZS<addr>` | Start local sender drone |
| `-Z host:port,host:port,...` | Connect to remote drones |

### Key Architecture Points

- **Maximum Drones**: 32 (hardcoded `MAX_CONNS`)
- **Transport**: TCP or Unix sockets
- **Protocol**: Binary IPC with magic number validation
- **Version Check**: Strict version matching required

## Test Suite

The cluster mode test suite is located at:
```
src/scan_progs/tests/test_drone_cluster.c
```

Build and run tests:
```bash
cd src/scan_progs/tests
make -f Makefile.drone_tests run
```

## Known Limitations

1. No authentication on drone connections
2. No encryption of IPC traffic
3. No automatic retry of failed workunits
4. No dynamic drone reconnection

See [CLUSTER_SCALABILITY_ANALYSIS.md](CLUSTER_SCALABILITY_ANALYSIS.md) for detailed technical assessment.
