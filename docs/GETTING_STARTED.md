# Getting Started with Unicornscan

## Prerequisites

If you haven't installed Unicornscan yet:

- **[Install from Package](INSTALL-package.md)** - Recommended for most users (Debian/Ubuntu)
- **[Install from Source](INSTALL-source.md)** - For development or unsupported platforms

## Philosophy: More Than a Port Scanner

Unicornscan is not merely a port scanner—it's a **distributed stimulus/response
framework**. The fundamental design philosophy, remains core to its identity:

> "You supply the stimulus. We supply the delivery mechanism."

This distinction is critical. Traditional scanners simply enumerate open ports.
Unicornscan provides a scalable, accurate, and flexible platform for introducing
network stimulus and recording responses—whether that stimulus is a SYN packet,
a protocol-specific UDP payload, or an exploitation payload delivered post-handshake.

### Fundamental Design Goals

1. **Scalability** - Efficient use of resources, not just "going faster." Think of
   it like a bus system: the goal is optimal throughput, not maximum speed.

2. **Accuracy** - Invalid data collection leads to invalid analysis. Tools should
   introduce stimulus and record response; humans analyze the results.

3. **Flexibility** - Dynamic "just in time" decision control. The framework adapts
   to what it discovers during scanning.

4. **Security** - Implementation follows privilege separation principles. Each
   process runs with minimal required privileges.

### The Scatter Connect Architecture

Traditional TCP scans require the kernel to maintain connection state for every socket.
At high volumes, this becomes a bottleneck—kernel socket limits, memory exhaustion,
and context switching overhead all conspire against scalability.

Unicornscan's **Scatter Connect** architecture solves this by moving TCP state
tracking entirely to userspace via a 3-process model:

```
                         THE 3-PROCESS MODEL

                    ┌──────────────────────────────────────┐
                    │              TARGETS                 │
                    │     192.168.1.0/24:22,80,443         │
                    └──────────────────────────────────────┘
                           ▲                    │
                           │ SYN                │ SYN/ACK
                           │ packets            │ responses
                           │                    ▼
    ┌────────────┐   workunits   ┌────────────┐     ┌────────────┐
    │   MASTER   │ ────────────► │   SENDER   │     │  LISTENER  │
    │    (us)    │               │ (unisend)  │     │(unilisten) │
    │            │               │            │     │            │
    │ • parses   │               │ • crafts   │     │ • captures │
    │   targets  │               │   packets  │     │   via pcap │
    │ • creates  │               │ • rate     │     │ • decodes  │
    │   workunits│               │   limiting │     │   responses│
    │ • tracks   │               │ • transmits│     │ • correlates
    │   state    │               │   on wire  │     │   via seqno│
    └─────┬──────┘               └────────────┘     └──────┬─────┘
          │                                                │
          │                    results                     │
          └────────────────────────────────────────────────┘
                              (IPC)
```

**Why processes, not threads?** Separation of Duties (SoD). A compromise of the
Sender doesn't automatically give access to the Listener's captured data. Each
process runs with only the privileges it needs. This was a deliberate security
architecture decision from 2005, not a performance choice.

**The TCPHASHTRACK Trick:** How does the Listener correlate responses with probes
if there's no shared connection state? Unicornscan encodes target information
directly into TCP sequence numbers. When a SYN/ACK arrives, the acknowledgment
number reveals which probe triggered it—no state table lookup required. This
enables truly stateless scanning with full connection support.

## 1. My First Scan

Unicornscan implements its own userspace TCP/IP stack—a **distributed user space
TCP/IP stack** that enables asynchronous stateless TCP/UDP scanning with full
connection support. This stateless design separates packet transmission from
response collection into independent processes, achieving high throughput on
reliable networks.

### 1.1 Basic TCP SYN Scan

The default scan mode uses TCP SYN probes against a target:

```bash
unicornscan 192.168.1.1
```

By default, this scans the quick list of ports using TCP SYN packets at a
conservative rate (250 pps). The shorthand `us` works identically:

```bash
us 192.168.1.1
```

### 1.2 Specifying Ports

#### Per-Segment Ports

Append ports to each target with the colon syntax:

```bash
us 192.168.1.1:22,80,443
us 192.168.1.1:1-1024
us 192.168.1.1:a              # All 65535 ports
us 192.168.1.1:q              # "Quick" - top 256 ports
```

Multiple targets with different ports:

```bash
us 192.168.1.0/24:22,80,443
us 10.0.0.1:80 10.0.0.2:443 192.168.1.0/24:22
```

#### Global Ports (-p)

Use `-p` to apply the same ports to all targets:

```bash
us -p 22,80,443 192.168.1.0/24 10.0.0.0/24
us -p 1-1024 192.168.1.1 192.168.1.2 192.168.1.3
us -p a 10.0.0.0/8             # All ports on large network
us -p q 192.168.0.0/16         # Quick scan multiple segments
```

Per-segment ports override global when both are specified:

```bash
us -p 80 192.168.1.0/24 10.0.0.1:22,443
#        ^^^^^^^^^^^^^^^          ^^^^^^
#        Uses global -p 80        Uses per-segment 22,443
```

### 1.3 Adjusting Speed (rate of send)

The `-r` flag sets packets per second (PPS) rate:

```bash
us -r300 192.168.1.0/24       # 300 packets/second
us -r10000 10.0.0.0/16:80     # 10,000 pps for large networks
```

For gigabit networks with capable hardware, rates of 50,000+ PPS are achievable.
Start conservatively and increase based on your network capacity.

### 1.4 Verbosity

Add `-v` for more detail, stack for increasing verbosity:

```bash
us -v 192.168.1.1             # Show scan progress
us -vv 192.168.1.1            # More detail
us -vvv 192.168.1.1           # Debug-level output
```

## 2. Understanding the Output

### 2.1 Default Output Format

A typical scan produces:

```
TCP open 192.168.1.1:22      ttl 64
TCP open 192.168.1.1:80      ttl 64
TCP open 192.168.1.1:443     ttl 64
```

Fields: `protocol`, `state`, `host:port`, `ttl`.

### 2.2 Extended Information

With `-I` (immediate mode), results are displayed as responses arrive rather
than buffered at the end:

```bash
us -Iv 192.168.1.0/24:22
```

The `-e` flag enables output modules for richer data:

```bash
us -eosdetect 192.168.1.1    # OS fingerprinting
```

### 2.3 The -U Flag

The `-U` flag displays raw TCP flags instead of translating them to "open"
or "closed":

Without `-U` (default):
```
TCP open                ssh[   22]     from 192.168.1.1  ttl 64
```

With `-U`:
```
TCP -S--A---            ssh[   22]     from 192.168.1.1  ttl 64
```

The flag positions are `FSRPAUEC` (FIN, SYN, RST, PSH, ACK, URG, ECE, CWR).
A dash means the flag is unset. `-S--A---` indicates SYN+ACK.

Common patterns:
- `-S--A---` - SYN+ACK (port accepting connections)
- `--R-A---` - RST+ACK (port refusing connections)
- `--R-----` - RST only

Useful for analyzing firewall behavior or unusual TCP responses.

## 3. Core Modes Explained

Unicornscan supports multiple scan modes selected with `-m`. Each mode uses
different protocols or techniques.

### 3.1 TCP SYN Mode (-mT)

The default mode. Sends TCP SYN packets. A SYN/ACK response is considered
open, RST is considered closed:

```bash
us -mT -U 192.168.1.1:1-1024
```

**TCP Flag Customization:**

Append single-letter flag characters to `-mT`. Uppercase sets the flag,
lowercase clears it. The default is SYN only.

```bash
us -mTF -U 192.168.1.1          # FIN scan (F sets FIN)
us -mTA -U 192.168.1.1          # ACK scan (A sets ACK)
us -mTSF -U 192.168.1.1         # SYN+FIN
us -mTFSPAU -U 192.168.1.1      # FIN+SYN+PSH+ACK+URG
```

Flag characters (mnemonic: FSRPAUEC):
- `F` - FIN
- `S` - SYN
- `R` - RST
- `P` - PSH
- `A` - ACK
- `U` - URG
- `E` - ECE
- `C` - CWR

Lowercase clears: `-mTsFA` sets FIN+ACK, ensures SYN is clear.

**Note:** Don't confuse `-mTSF` (TCP with SYN+FIN flags) with `-msf` (TCP connect mode).
They look similar but are completely different scan types.

### 3.2 UDP Mode (-mU)

Sends UDP probes with protocol-specific payloads from `/etc/unicornscan/payloads.conf`.

```bash
us -mU -U 192.168.1.1:53,123,161
```

A port is "open" if it sends a UDP response. By default, closed ports are not
shown. ICMP Port Unreachable messages are ignored unless you add `-E`:

```bash
us -mU -UE 192.168.1.1:53,123,161    # -E shows ICMP errors (closed ports)
```

Payloads matter: a DNS server won't respond to garbage, but it will respond to
a valid DNS query. The payload file contains many protocol-specific probes.

### 3.3 ARP Mode (-mA)

Layer 2 ARP discovery for the local broadcast domain:

```bash
us -mA 192.168.1.0/24
```

This directly ARPs for hosts on the same network segment.

### 3.4 TCP Traceroute Mode (-mtr)

Stateless TCP traceroute to a specific host:port:

```bash
us -mtr 10.45.3.1:80
```

**Typical workflow:** After scanning a remote network, run `-mtr` against a
responding host:port to map the path. This traceroute data enables Alicorn to
plot network topology, linking your local network to the remote through the
enumerated routers in between.

```bash
us -mT -U 10.45.0.0/20:80,443         # Scan the remote /20
us -mtr 10.45.3.1:80                   # Trace to a host that responded
```

The implementation encodes TTL in the source port (40961 = TTL 1, 40962 = TTL 2,
etc). When routers return ICMP Time Exceeded, the original TCP header reveals
which TTL triggered the response—no per-probe state required.

### 3.5 TCP Connect Mode (-msf)

Full TCP handshake (SYN→SYN/ACK→ACK) for application-layer interaction.

Connect mode requires `fantaip` running and `-s` specifying the phantom IP.
See Section 4 for the complete setup and examples.

### 3.6 Per-Target Mode Override

Override the global mode for specific targets using `:m<mode>,<ports>`:

```bash
us -mT -U 192.168.1.1:80 192.168.1.2:mU,53
#                        ^^^^^^^^^^^^^ UDP mode for this target
```

The per-target mode string follows the same syntax as `-m`:

```bash
us -mA 192.168.1.0/24 gateway:mT,22,80 dns.local:mU,53
#      ^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^
#      ARP (global)   TCP SYN          UDP
```

Per-target options can include flags, PPS, and phase modifiers:

```bash
us -mT webserver:mTSF500:R2,80,443    # SYN+FIN, 500 pps, 2 repeats
```

## 4. Connect Scanning with fantaip

The name? Legend has it this tool was born during a late-night hacking session
with the TV on in the background when a [Fanta commercial](https://www.youtube.com/watch?v=eEb0cYq6dvI)
came on. "Wanta Fanta?" became "fantaip"—a phantom IP. Check the source file
header if you don't believe us.

### 4.1 The Problem

If you send SYN packets with a source IP that the kernel owns, the kernel's TCP
stack will see the incoming SYN/ACK responses and send RST because it doesn't
know about unicornscan's connections. This terminates the handshake before
unicornscan can complete it.

This is a fundamental conflict: we want full TCP connections (for banner grabbing,
protocol interaction, payload delivery), but we've moved the TCP state machine
out of the kernel to achieve scalability. The kernel and userspace are fighting
over the same connections.

### 4.2 The Solution: fantaip (The Phantom ARP Responder)

`fantaip` was Jack's elegant solution to this problem: claim IP addresses that
don't exist on any interface. The name comes from "phantom IP"—an IP address
that appears on the network (answers ARP) but belongs to no real host.

`fantaip` responds to ARP requests for an IP address not bound to any local
interface. Incoming frames reach the NIC (the MAC address is in the sender's
ARP cache), but the kernel's IP layer discards them as the destination IP doesn't
match any configured interface. Meanwhile, unicornscan captures the raw frames
via libpcap and handles the TCP state machine in userspace.

**From the DC13 presentation:** fantaip enables Unicornscan to operate as a
completely userspace TCP/IP stack—the kernel sees the frames, but since the IP
isn't "ours," it stays out of the way. All TCP logic happens in unilisten.

```
+------------------+     ARP Request: Who has 192.168.1.200?
|   Network        | ------------------------------------------------>
+------------------+
         |
         v
+------------------+     ARP Reply: 192.168.1.200 is at 00:11:22:33:44:55
|    fantaip       | <------------------------------------------------
| (192.168.1.200)  |
+------------------+
         |
         v
+------------------+     SYN from 192.168.1.200 → Target
|   unicornscan    |     SYN/ACK from Target → 192.168.1.200
|     sender       |     (Kernel ignores - not its IP)
+------------------+     ACK from 192.168.1.200 → Target
```

### 4.3 Starting fantaip

In one terminal, start fantaip with the phantom IP range:

```bash
sudo fantaip -i eth0 192.168.1.200/32
```

For scanning from multiple source IPs:

```bash
sudo fantaip -i eth0 192.168.1.200/28
```

This claims 16 phantom IPs (192.168.1.200-215), making them usable as source addresses.

### 4.4 Running the Connect Scan

In another terminal, run unicornscan with the phantom IP as source:

```bash
us -msf -U -s 192.168.1.200 192.168.1.1:1-1024
```

With a CIDR range of phantom IPs:

```bash
us -msf -U -s 192.168.1.200/28 192.168.1.0/24:80,443
```

Unicornscan rotates through the phantom IPs, distributing payloads.

### 4.5 Verifying fantaip Operation

Check that fantaip is responding to ARP:

```bash
arping -I eth0 192.168.1.200
```

You should see replies from fantaip's MAC address.

## 5. Compound Modes

On local networks, scanning at high PPS doesn't guarantee fast completion. Each
non-responsive host incurs an ARP resolution timeout (typically 3+ seconds)
while the kernel waits for a link-layer address that never arrives. A /24 with
200 dead hosts adds 10+ minutes of ARP delays to your scan.

Compound mode solves this by isolating ARP discovery into a controlled first
phase. Subsequent phases only target hosts that responded, eliminating ARP
latency from port scanning entirely.

### 5.1 ARP + TCP SYN (-mA+T)

First discover live hosts via ARP, then TCP scan only those hosts:

```bash
us -mA+T -U 192.168.1.0/24:22,80,443
```

Phase 1 (ARP): Finds hosts 192.168.1.1, .5, .10, .254
Phase 2 (TCP): Scans ports 22,80,443 on those 4 hosts only

### 5.2 ARP + Connect (-mA+sf)

ARP discovery followed by full TCP connect:

```bash
fantaip -i eth0 192.168.1.200 &
us -mA+sf -U -s 192.168.1.200 192.168.1.0/24:80
```

### 5.3 ARP + UDP (-mA+U)

```bash
us -mA+U -U 192.168.1.0/24:53,161,123
```

### 5.4 Three-Phase Compound

Chain multiple phases. Note that per-target mode specifiers (`:mU,ports`) apply to
the target, not the compound mode—use separate targets or rely on the mode sequence:

```bash
us -mA+T+U -U 192.168.1.0/24:22,80,443
```

Phase 1: ARP discovery
Phase 2: TCP SYN on ports 22,80,443
Phase 3: UDP on ports 22,80,443

For different port sets per protocol, run separate scans.

### 5.5 Local Network Requirement

Compound modes starting with ARP (`-mA+...`) require targets on the local broadcast
domain. ARP is Layer 2—requests cannot cross routers or reach remote subnets. If
you specify a target that requires gateway routing, unicornscan exits with:

```
compound mode -mA+... requires targets on local network; target X requires gateway Y
```

For remote targets, use `-mT` or `-mU` directly without ARP discovery.

## 6. Per-Phase Options

Fine-tune each phase independently using inline modifiers.

### 6.1 Packets Per Second (Inline)

Specify PPS directly after the mode letter:

```bash
us -mA50+T1000 -U 192.168.1.0/24:80
```

- ARP phase: 50 pps (conservative for discovery)
- TCP phase: 1000 pps (faster for port scanning)

### 6.2 Repeat Count (:R)

Retransmit packets for reliability on lossy networks:

```bash
us -mA:R3 192.168.1.0/24      # Send each ARP probe 3 times
us -mA:R2+T 192.168.1.0/24 # ARP 2x, TCP 1x (default)
```

### 6.3 Timeout (:L)

Set per-phase listen timeout in seconds:

```bash
us -mA:L5 192.168.1.0/24       # Wait 5 seconds for ARP replies
us -mA:L10+T:L3 192.168.1.0/24 # ARP 10s, TCP 3s
```

### 6.4 Combined Per-Phase Options

Stack options within a phase:

```bash
us -mA50:R3:L15+sf+U -U 192.168.1.0/24:q
```

- `A50` - ARP at 50 pps
- `:R3` - Repeat ARP probes 3 times
- `:L15` - Wait 15 seconds for ARP replies
- `+sf` - Then TCP connect scan
- `+U` - Then UDP scan

### 6.5 Global vs Per-Phase

Global options (`-r`, `-R`, `-L`) apply to all phases unless overridden:

```bash
us -r500 -mA+T -U 192.168.1.0/24        # Both phases at 500 pps
us -r500 -mA100+T -U 192.168.1.0/24     # ARP at 100, TCP at 500
```

## 7. Advanced Options

### 7.1 Interface Selection (-i)

Use a specific network interface:

```bash
us -i eth1 192.168.1.0/24
```

### 7.2 Output Modules (-e)

Enable modules for extended functionality:

```bash
us -eosdetect 192.168.1.1           # OS fingerprinting
us -epgsqldb 192.168.1.0/24         # Store results in PostgreSQL
us -eosdetect,pgsqldb 192.168.1.1   # Both modules
```

#### PostgreSQL Module (pgsqldb)

Store scan results in a database for the Alicorn web interface or custom
analysis.

**Quick setup** (if using unicornscan-web):

```bash
sudo unicornscan-web start
us -epgsqldb 192.168.1.0/24
```

The `unicornscan-web start` command auto-configures `/etc/unicornscan/modules.conf`
with database credentials.

**Manual configuration** in `/etc/unicornscan/modules.conf`:

```ini
[pgsqldb]
host=localhost
port=5432
user=alicorn
pass=YOUR_PASSWORD
db=unicornscan
```

**Override via command line:**

```bash
us -epgsqldb,host=db.example.com,user=scanner,pass=secret,db=scans \
   192.168.1.0/24
```

**Module options:**

| Option   | Description                        | Default     |
|----------|------------------------------------|-------------|
| host     | PostgreSQL server hostname         | localhost   |
| port     | PostgreSQL port                    | 5432        |
| user     | Database username                  | alicorn     |
| pass     | Database password                  | (required)  |
| db       | Database name                      | unicornscan |

The pgsqldb module integrates with GeoIP when available, storing country,
city, and ASN data alongside scan results.

### 7.3 Payload Files (-p)

Load custom UDP payloads:

```bash
us -mU -p /etc/unicornscan/payloads.conf 192.168.1.1:53,161
```

Payloads trigger responses from UDP services that would otherwise stay silent.

### 7.4 Broken CRC (-b)

Send packets with invalid checksums (firewall testing):

```bash
us -b 192.168.1.1:80
```

### 7.5 Port Shuffle

By default, ports are scanned in random order. Disable with `-S`:

```bash
us -S 192.168.1.1:1-1024       # Sequential port order (1, 2, 3, ...)
```

## 8. Cluster Mode

Unicornscan supports distributed scanning across multiple machines, separating
the master (coordination), senders (transmission), and listener (capture) roles.

### 8.1 Components

**Master** (`unicornscan`): Parses targets, creates workunits, dispatches work
to drones, collects results. Does not send or capture packets directly.

**Sender** (`unisend`): Receives workunits from master, transmits probe packets
at the configured rate. Multiple senders share work round-robin.

**Listener** (`unilisten`): Captures response packets via pcap, reports results
to master via IPC. For connect mode, runs alongside fantaip.

### 8.2 Basic Cluster (SYN Scanning)

Three machines for distributed SYN scanning:

```
   MASTER (192.168.1.10)         SENDER (192.168.1.11)
   +------------------+          +------------------+
   | unicornscan      |   IPC    | unisend          |
   | - creates WU     |<-------->| - sends probes   |---> Target
   | - collects data  |          +------------------+     Network
   +--------+---------+                                      |
            |                                                |
            | IPC                                            v
            |                    LISTENER (192.168.1.12)     |
            |                    +------------------+        |
            +<------------------>| unilisten        |<-------+
                                 | - pcap capture   |  responses
                                 +------------------+
```

**Listener (192.168.1.12):**

```bash
sudo unilisten -i eth0 -p 12345
```

**Sender (192.168.1.11):**

```bash
sudo unisend -i eth0 -p 12346
```

**Master (192.168.1.10):**

```bash
us -mT -Z 192.168.1.11:12346,192.168.1.12:12345 10.0.0.0/16:22,80,443
```

The `-Z` drone string lists all drones (senders and listeners) as comma-separated
`host:port` pairs. The master auto-detects drone type during handshake.

### 8.3 Connect Mode Cluster

For TCP connect scanning (`-msf`), fantaip must run on the listener host. The
listener captures SYN+ACK responses arriving at the phantom IPs, reports them
to the master, and the master schedules ACK workunits back to the senders.

**4-machine cluster scanning 192.168.1.1:80 with source IP 172.16.5.1:**

```
  MASTER           SENDER1          SENDER2          RECEIVER           TARGET
 172.16.5.4       172.16.5.3       172.16.5.2       172.16.5.1       192.168.1.1
 +--------+       +--------+       +--------+       +---------+        +------+
 |        |<---------- IPC connections ------------>| fantaip |        |      |
 |   us   |       |unisend |       |unisend |       |unilisten|        | :80  |
 +--------+       +--------+       +--------+       +---------+        +------+
      |                |                |                |                |
      | 1. SYN workunit|                |                |                |
      +--------------->|                |                |                |
                       | 1. SYN (src=172.16.5.1)         |                |
                       +--------------------------------------------------->
                                                         |                |
                                                         |   2. SYN/ACK   |
                                                         |<---------------|
                                                         |                |
      |<-------- 3. report (SYN/ACK info) ---------------|                |
      |                                                                   |
      | 4. ACK workunit                 |                                 |
      +-------------------------------->|                                 |
                                        | 5. ACK (src=172.16.5.1)         |
                                        +-------------------------------->|
                                                                          |
                                                    (handshake complete)  |
```

**One TCP connect scan - step by step:**

1. **SYN sent**: Master dispatches SYN workunit to sender1, which transmits
   SYN packet with spoofed source IP 172.16.5.1 (the receiver)
2. **SYN/ACK arrives**: Target responds with SYN/ACK to 172.16.5.1; fantaip
   answers ARP, unilisten captures the packet
3. **Report to master**: Listener sends packet details to master via IPC
4. **ACK queued**: Master creates priority workunit for the ACK
5. **ACK sent**: Master dispatches ACK workunit to sender2, which transmits
   ACK with source 172.16.5.1 - three-way handshake complete

**Receiver (172.16.5.1) - runs fantaip + unilisten:**

```bash
sudo fantaip -i eth0 172.16.5.1/32 &
sudo unilisten -i eth0 -p 12345
```

**Sender1 (172.16.5.3):**

```bash
sudo unisend -i eth0 -p 12346
```

**Sender2 (172.16.5.2):**

```bash
sudo unisend -i eth0 -p 12347
```

**Master (172.16.5.4):**

```bash
us -msf -s 172.16.5.1 \
   -Z 172.16.5.3:12346,172.16.5.2:12347,172.16.5.1:12345 \
   192.168.1.1:80
```

When `-Z` is specified, the master disables local forking and connects only to
the drones listed. Both senders receive workunits round-robin, sharing the
load for batch (SYN) and priority (ACK) packets.

### 8.4 Security Considerations

- Drone communication is unencrypted; use on trusted networks or VPN (we will add encryption in future).
- Drones require root or Linux capabilities for raw sockets
- The listener captures all traffic on its interface

## 9. Putting It All Together

Let's decode a complex real-world command:

```bash
us -s 192.168.1.134/32 -Ivr1000 -mA50:R3:L15+sf -R2 192.168.1.0/24:q -eosdetect,pgsqldb -L15 -U
```

### 9.1 Breaking It Down

| Fragment              | Meaning                                           |
|-----------------------|---------------------------------------------------|
| `us`                  | Unicornscan (shorthand)                           |
| `-s 192.168.1.134/32` | Source IP (single address, for fantaip)           |
| `-I`                  | Immediate mode (show results as they arrive)      |
| `-v`                  | Verbose output                                    |
| `-r1000`              | Global rate: 1000 packets/second                  |
| `-mA50:R3:L15+sf`     | Compound mode (see below)                         |
| `-R2`                 | Repeat scan 2 times (send each probe twice)       |
| `192.168.1.0/24:q`    | Target: /24 network, quick ports (top 256)        |
| `-eosdetect,pgsqldb`  | Enable OS detection and PostgreSQL output         |
| `-L15`                | Global listen timeout: 15 seconds                 |
| `-U`                  | Show raw TCP flags instead of state labels        |

### 9.2 Mode String Deep Dive: `-mA50:R3:L15+sf`

```
-mA50:R3:L15+sf
  │ │  │   │  └── Phase 2: TCP connect
  │ │  │   └───── Phase 1: Listen 15 seconds for ARP replies
  │ │  └───────── Phase 1: Repeat each ARP probe 3 times
  │ └──────────── Phase 1: ARP at 50 packets/second
  └────────────── Phase 1: ARP discovery mode
```

**Execution flow:**

1. **ARP Discovery** (Phase 1):
   - Send ARP requests to 192.168.1.0/24
   - Rate: 50 pps (conservative to avoid switch flooding)
   - Each probe sent 3 times (`:R3`) for reliability
   - Wait 15 seconds (`:L15`) for all replies
   - Result: List of live hosts (e.g., .1, .10, .50, .254)

2. **TCP Connect** (Phase 2):
   - Scan only the ARP responding discovered hosts
   - Full TCP handshake using fantaip source IP
   - Rate: Inherits global 1000 pps (`-r1000`)
   - Ports: Quick scan set of ports

### 9.3 Prerequisites

This command requires fantaip running in a separate terminal:

```bash
sudo fantaip -i eth0 192.168.1.134
```

And the PostgreSQL backend:

```bash
sudo unicornscan-web start
```

### 9.4 Expected Output

With `-Iv -U`, output streams in real-time with raw TCP flags:

```
ARP                     192.168.1.1    [00:1a:2b:3c:4d:5e]
ARP                     192.168.1.10   [00:aa:bb:cc:dd:ee]
ARP                     192.168.1.50   [00:11:22:33:44:55]
ARP                     192.168.1.254  [00:de:ad:be:ef:00]
TCP -S--A---            ssh[   22]     from 192.168.1.1    ttl 64
TCP -S--A---            http[   80]    from 192.168.1.1    ttl 64
TCP -S--A---            ssh[   22]     from 192.168.1.10   ttl 128
TCP -S--A---            http[   80]    from 192.168.1.50   ttl 64
TCP -S--A---            https[  443]   from 192.168.1.50   ttl 64
TCP -S--A---            ssh[   22]     from 192.168.1.254  ttl 255
TCP -S--A---            http[   80]    from 192.168.1.254  ttl 255
```

Results are simultaneously stored in PostgreSQL for web interface viewing.

### 9.5 Variations

**Faster, potentially brittle:**

```bash
us -s 192.168.1.134/32 -Ivr5000 -mA200:R1:L5+sf -R2 192.168.1.0/24:q -eosdetect,pgsqldb -L10 -U
```

**Slower, more robust (lossy network):**

```bash
us -s 192.168.1.134/32 -Ivr300 -mA20:R5:L30+sf -R2 192.168.1.0/24:a -eosdetect,pgsqldb -L30 -U
```

**Without database (console only):**

```bash
us -s 192.168.1.134/32 -Ivr1000 -mA50:R3:L15+sf -R2 192.168.1.0/24:q -eosdetect -L15 -U
```

---

## Quick Reference

### Common Mode Strings

| Mode String    | Description                              |
|----------------|------------------------------------------|
| `-mT`          | TCP SYN (default)                        |
| `-mU`          | UDP                                      |
| `-mA`          | ARP discovery                            |
| `-mtr`         | TCP traceroute                           |
| `-msf`         | TCP connect (requires fantaip)           |
| `-mA+T`        | ARP discovery → TCP SYN                  |
| `-mA+sf`       | ARP discovery → TCP connect              |
| `-mA+U`        | ARP discovery → UDP                      |
| `-mTF`         | TCP FIN scan                             |
| `-mTA`         | TCP ACK scan                             |

### Essential Flags

| Flag          | Purpose                                   |
|---------------|-------------------------------------------|
| `-r<N>`       | Packets per second                        |
| `-s<IP>`      | Source IP (required for -msf)             |
| `-i<iface>`   | Network interface                         |
| `-I`          | Immediate output mode                     |
| `-v`          | Verbose (stack: -vvv)                     |
| `-e<module>`  | Enable output module                      |
| `-R<N>`       | Repeat scan N times                       |
| `-S`          | Disable port shuffle (sequential order)   |
| `-L<N>`       | Listen timeout (seconds)                  |
| `-U`          | Show raw TCP flags instead of open/closed |
| `-W<N>`       | OS fingerprint (0=Cisco 8=Win10 9=Linux)  |
| `-p<spec>`    | Global port specification                 |

### Per-Phase Modifiers

| Modifier      | Example           | Meaning                      |
|---------------|-------------------|------------------------------|
| Inline PPS    | `-mA50`           | ARP at 50 pps                |
| `:R<N>`       | `-mA:R3`          | Repeat probes N times        |
| `:L<N>`       | `-mA:L15`         | Listen N seconds for replies |
| Combined      | `-mA50:R3:L15`    | All three together           |

### Further Reading

| Resource                          | Description                    |
|-----------------------------------|--------------------------------|
| `man unicornscan`                 | Full manual page               |
| `man fantaip`                     | Phantom IP ARP proxy           |
| `unicornscan -h`                  | Quick option reference         |
| `/etc/unicornscan/payloads.conf`  | UDP payload definitions        |
| `/etc/unicornscan/modules.conf`   | Module configuration           |

---

## 10. Payload Delivery

Unicornscan can deliver arbitrary payloads after completing TCP handshakes.
The module system processes responses and can trigger follow-up actions.

### 10.1 Payload Modules

Nine payload modules are included (`src/payload_modules/`):

| Module | Proto | Port | Group | Purpose |
|--------|-------|------|-------|---------|
| http | TCP | 80 | 1 | HTTP GET request |
| dhcp | UDP | 67 | 1 | DHCP DISCOVER |
| rdns | UDP | 53 | 1 | Reverse DNS PTR query |
| nbns | UDP | 137 | 1 | NetBIOS name query |
| sip | UDP | 5060 | 1 | SIP OPTIONS |
| stun | UDP | 3478 | 1 | STUN binding request |
| upnp | UDP | 1900 | 1 | UPnP M-SEARCH |
| ntalk | UDP | 518 | 1 | ntalk announce |
| **httpexp** | TCP | 80 | 3 | **OS-specific HTTP exploit** |

Select payload group with `-G<n>`. Default is group 1.

### 10.2 Inter-Module Data Flow

Report modules share data via a FIFO queue (`od_q`) attached to each `ip_report_t`:

```
SYN/ACK received
       ↓
┌─────────────────┐
│    osdetect     │ → pushes OD_TYPE_OS to od_q
└────────┬────────┘
         ↓
┌─────────────────┐
│  payload module │ → fifo_walk(od_q) retrieves OS string
└────────┬────────┘
         ↓
    create_payload() generates OS-specific payload
```

The `ip_report_t` structure passed to payload modules contains:
- `host_addr` - target IP
- `dport`, `sport` - ports
- `od_q` - FIFO queue of `output_data_t` (OS strings, banners)
- TTL, TCP window, timestamps, TCP options

### 10.3 The Pipeline

**Stage 1: Live host detection (ARP)**
```bash
us -mA50:R2:L10 192.168.1.0/24 -epgsqldb
```
Identifies which hosts respond. Results stored in database.

**Stage 2: Open port detection (TCP)**
```bash
sudo fantaip -i eth0 192.168.1.134 &
us -s 192.168.1.134/32 -msf 192.168.1.0/24:q -epgsqldb -L15
```
Full TCP handshake reveals open ports. Connect mode (`-msf`) required for stage 3.

**Stage 3: Service identification (banner grab)**

Connect mode completes the handshake, allowing banner collection. The `osdetect`
module fingerprints the OS via TTL and TCP options. Service banners identify
software versions (e.g., "Apache/2.4.41", "OpenSSH_8.2").

```bash
us -s 192.168.1.134/32 -msf 192.168.1.0/24:22,80,443 -eosdetect,pgsqldb -L15
```

**Stage 4: Target selection**
```sql
SELECT host_addr, port, os_guess, banner FROM scan_results
WHERE port = 80
  AND os_guess LIKE '%Windows%'
  AND banner LIKE '%IIS/10%';
```

**Stage 5: Payload delivery**

With OS and service version known, deliver exploitation payloads. The included
`httpexp.so` module demonstrates this pattern:

```bash
us -s 192.168.1.134/32 -msf 192.168.1.0/24:80 -eosdetect,httpexp -L15
```

How `httpexp` works (see `src/payload_modules/httpexp.c`):

```c
fifo_walk(ir->od_q, httpexp_find_os);  /* retrieve OS from osdetect */
if (strstr(os_str, "Linux")) {
    fd = open("/tmp/linux-stage1.bin", O_RDONLY);
    /* ... */
    sc = encode(scbuf, sb.st_size, BANNED, ENC_XOR,
                FLG_RAND|FLG_RANDP, PLT_LINXX86, &sc_len);
}
```

1. Walks `od_q` FIFO to find `OD_TYPE_OS` pushed by osdetect
2. Loads shellcode from `/tmp/<os>-stage1.bin`
3. Encodes via `libunirainbow`:
   - `rand_nops()` fills buffer with random valid x86 NOPs
   - `encode()` XOR-encodes shellcode with random key + metamorphic loader
   - Output avoids BANNED characters (`?&#+ \t\f\v\r\n%<>"`)
4. Builds HTTP GET request with encoded payload in query string
5. Returns to sender for transmission

**libunirainbow** (`src/payload_modules/libunirainbow/`) generates per-target
unique payloads: random XOR key, random loader stub, random NOP sled. Supports
Linux, FreeBSD, NetBSD, OpenBSD x86.

### 10.4 Workunit Dispatch

Two dispatch modes:

**Batch mode** (`send_workunit_t`): Template containing target CIDR + port list.
Sender iterates and generates packets. Efficient for scanning.

**Priority mode** (`send_pri_workunit_t`): Single packet with inline payload.
Used in connect mode - when SYN/ACK arrives, ACK+payload workunit is queued
immediately. Enables multi-stage protocols.

```
Connect mode flow:
  SYN/ACK received → create_payload() called with ip_report_t
                   → payload attached to send_pri_workunit_t
                   → queued to priority FIFO
                   → sender transmits ACK, then ACK+PSH with payload
```
