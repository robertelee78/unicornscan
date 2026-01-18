/**
 * Unicornscan Command Simulation
 * Based on real unicornscan C source code from src/
 *
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 *
 * Port parsing logic from: src/scan_progs/portfunc.c
 * CLI argument parsing from: src/getconfig.c
 * Output format from: src/scan_progs/options.c, src/scan_progs/report.c
 * Default options from: src/scan_progs/options.c
 */

// ============================================================================
// Constants from real unicornscan source (options.c lines 49-52)
// ============================================================================
const DEFAULT_TCP_QUICK_PORTS = '22';
const DEFAULT_UDP_QUICK_PORTS = '53';
const DEFAULT_PORT_STRING = 'q';

// Format strings from options.c lines 78-83
const DEFAULT_IP_REPORT_FMT = '%-8r\t%16P[%5p]\t\tFrom %h %T ttl %t';
const DEFAULT_IP_IM_REPORT_FMT = '%-8r %h:%p %T ttl %t';
const DEFAULT_ARP_REPORT_FMT = 'ARP %M (%o) from %h';

const DEFAULT_OPEN_STR = 'open';
const DEFAULT_CLOSED_STR = 'closed';

// Scan modes from src/scan_progs/scanopts.h
type ScanMode = 'tcpscan' | 'udpscan' | 'arpscan' | 'tcptrace' | 'tcpconnect';

// ============================================================================
// Port Parsing (based on src/scan_progs/portfunc.c parse_pstr function)
// ============================================================================

interface ParsedPorts {
  ports: number[];
  error?: string;
}

/**
 * Parse port string following the logic from portfunc.c:93-208
 *
 * Port specifications:
 * - 'a' or 'A': All ports (0-65535)  [portfunc.c:100-101]
 * - 'p' or 'P': Privileged ports (1-1024)  [portfunc.c:103-104]
 * - 'q' or 'Q': Quick ports (expanded based on mode in workunits.c)
 * - Numeric: Single port (e.g., "80")
 * - Range: Port range (e.g., "1-1024")
 * - Comma-separated: Multiple specs (e.g., "22,80,443")
 */
function parsePortString(input: string, mode: ScanMode = 'tcpscan', tcpQuickPorts: string = DEFAULT_TCP_QUICK_PORTS, udpQuickPorts: string = DEFAULT_UDP_QUICK_PORTS): ParsedPorts {
  if (!input || input.length === 0) {
    return { ports: [], error: "cannot parse port string ''" };
  }

  let portString: string;

  // Handle special port specifiers (portfunc.c:100-108)
  const firstChar = input[0].toLowerCase();

  if (firstChar === 'a') {
    // All ports (0-65535)
    portString = '0-65535';
  } else if (firstChar === 'p') {
    // Privileged ports (1-1024)
    portString = '1-1024';
  } else if (firstChar === 'q' || input === '') {
    // Quick ports - expand based on scan mode (workunits.c:302-324)
    switch (mode) {
      case 'tcpscan':
      case 'tcptrace':
      case 'tcpconnect':
        portString = tcpQuickPorts;
        break;
      case 'udpscan':
        portString = udpQuickPorts;
        break;
      case 'arpscan':
        // ARP doesn't use ports
        return { ports: [] };
      default:
        return { ports: [], error: 'bad scan mode' };
    }
  } else {
    portString = input;
  }

  const ports: number[] = [];

  // Parse comma-separated port specifications (portfunc.c:115-146)
  const specs = portString.split(',');

  for (const spec of specs) {
    const trimmed = spec.trim();
    if (!trimmed) continue;

    // Try range format: "low-high"
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      let low = parseInt(rangeMatch[1], 10);
      let high = parseInt(rangeMatch[2], 10);

      // Swap if needed (portfunc.c:117-119)
      if (low > high) {
        [low, high] = [high, low];
      }

      // Check bounds (portfunc.c:120-126)
      if (low > 0xffff || high > 0xffff) {
        return { ports: [], error: 'port out of range' };
      }

      // Add all ports in range (portfunc.c:173-175)
      for (let port = low; port <= high; port++) {
        ports.push(port);
      }
      continue;
    }

    // Try single port format (portfunc.c:129-138)
    const singleMatch = trimmed.match(/^(\d+)$/);
    if (singleMatch) {
      const port = parseInt(singleMatch[1], 10);

      if (port > 0xffff) {
        return { ports: [], error: 'port out of range' };
      }

      ports.push(port);
      continue;
    }

    // Cannot parse (portfunc.c:139-144)
    return { ports: [], error: `cannot parse port string '${input}'` };
  }

  return { ports };
}

// ============================================================================
// Target Parsing (based on src/getconfig.c and usage message)
// ============================================================================

interface ParsedTarget {
  host: string;
  cidr: number;
  ports?: string;
  mode?: string;
  error?: string;
}

/**
 * Parse target string following format from getconfig.c:578
 * Format: X.X.X.X/YY:S-E or X.X.X.X:mMODE,PORTS
 *
 * Examples:
 * - "192.168.1.1" -> Single host, default ports
 * - "192.168.1.0/24" -> Network, default ports
 * - "192.168.1.1:80" -> Single host, port 80
 * - "192.168.1.1:22,80,443" -> Single host, multiple ports
 * - "192.168.1.1:1-1024" -> Single host, port range
 * - "192.168.1.1:q" -> Single host, quick ports
 * - "192.168.1.1:p" -> Single host, privileged ports
 * - "192.168.1.1:a" -> Single host, all ports
 */
function parseTarget(target: string): ParsedTarget {
  if (!target || target.length === 0) {
    return { host: '', cidr: 32, error: 'no target specified' };
  }

  let host = target;
  let cidr = 32;
  let ports: string | undefined;

  // Check for port specification after colon
  const colonIdx = target.lastIndexOf(':');
  if (colonIdx !== -1) {
    const afterColon = target.substring(colonIdx + 1);

    // Check if it's a port spec (not part of IPv6)
    // Accept any alphanumeric + comma + hyphen for port specs
    // Invalid specs will be caught by parsePortString
    // This matches real unicornscan behavior where :x causes a port parsing error
    if (/^[0-9a-zA-Z,-]+$/.test(afterColon) && afterColon.length > 0) {
      ports = afterColon;
      host = target.substring(0, colonIdx);
    }
  }

  // Check for CIDR notation
  const slashIdx = host.indexOf('/');
  if (slashIdx !== -1) {
    const cidrStr = host.substring(slashIdx + 1);
    cidr = parseInt(cidrStr, 10);
    host = host.substring(0, slashIdx);

    if (isNaN(cidr) || cidr < 0 || cidr > 32) {
      return { host, cidr: 32, error: `invalid CIDR mask: ${cidrStr}` };
    }
  }

  // Validate IP address format (basic check)
  const ipMatch = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipMatch) {
    // Could be hostname - allow it
    return { host, cidr, ports };
  }

  // Validate IP octets
  for (let i = 1; i <= 4; i++) {
    const octet = parseInt(ipMatch[i], 10);
    if (octet > 255) {
      return { host, cidr: 32, error: `invalid IP address: ${host}` };
    }
  }

  return { host, cidr, ports };
}

// ============================================================================
// Service Name Lookup (based on src/scan_progs/portfunc.c getservname)
// ============================================================================

// Common service names (subset of /etc/services)
const SERVICE_NAMES: Record<string, Record<number, string>> = {
  tcp: {
    20: 'ftp-data',
    21: 'ftp',
    22: 'ssh',
    23: 'telnet',
    25: 'smtp',
    53: 'domain',
    80: 'http',
    110: 'pop3',
    143: 'imap',
    443: 'https',
    445: 'microsoft-ds',
    993: 'imaps',
    995: 'pop3s',
    3306: 'mysql',
    3389: 'rdp',
    5432: 'postgresql',
    5900: 'vnc',
    6379: 'redis',
    8080: 'http-alt',
    8443: 'https-alt',
    27017: 'mongodb',
  },
  udp: {
    53: 'domain',
    67: 'bootps',
    68: 'bootpc',
    69: 'tftp',
    123: 'ntp',
    137: 'netbios-ns',
    138: 'netbios-dgm',
    161: 'snmp',
    162: 'snmp-trap',
    500: 'isakmp',
    514: 'syslog',
    1194: 'openvpn',
    1900: 'upnp',
  },
};

function getServiceName(port: number, proto: 'tcp' | 'udp' = 'tcp'): string {
  return SERVICE_NAMES[proto]?.[port] || 'unknown';
}

// ============================================================================
// Report Formatting (based on src/scan_progs/report.c fmtcat)
// ============================================================================

interface ScanResult {
  responseType: 'TCP open' | 'TCP closed' | 'UDP open' | 'UDP closed' | 'ARP';
  serviceName: string;
  port: number;
  host: string;
  ttl: number;
  traceAddr?: string;
  macAddr?: string;
  ouiName?: string;
}

/**
 * Format a scan result using the format string
 * Based on fmtcat() in report.c:595-942
 *
 * Format specifiers:
 * %r - response type (e.g., "TCP open")
 * %P - service/protocol name (e.g., "http")
 * %p - port number
 * %h - host address
 * %t - TTL value
 * %T - trace address (if different from host)
 * %M - MAC address (ARP)
 * %o - OUI name (ARP)
 */
function formatReport(result: ScanResult, format: string = DEFAULT_IP_REPORT_FMT): string {
  let output = format;

  // Handle width specifiers like %-8r, %16P, %5p
  // Replace format specifiers with values

  // %r - response type with optional width
  output = output.replace(/%-?(\d*)r/g, (_, width) => {
    const w = parseInt(width, 10) || 0;
    return result.responseType.padEnd(w);
  });

  // %P - service name with optional width
  output = output.replace(/%(\d*)P/g, (_, width) => {
    const w = parseInt(width, 10) || 0;
    return result.serviceName.padStart(w);
  });

  // %p - port number with optional width
  output = output.replace(/%(\d*)p/g, (_, width) => {
    const w = parseInt(width, 10) || 0;
    return result.port.toString().padStart(w);
  });

  // %h - host address
  output = output.replace(/%h/g, result.host);

  // %t - TTL
  output = output.replace(/%t/g, result.ttl.toString());

  // %T - trace address (only show if different from host)
  output = output.replace(/%T/g, (result.traceAddr && result.traceAddr !== result.host) ? result.traceAddr : '');

  // %M - MAC address (ARP only)
  output = output.replace(/%M/g, result.macAddr || '');

  // %o - OUI name (ARP only)
  output = output.replace(/%o/g, result.ouiName || '');

  return output;
}

// ============================================================================
// Main Simulation Interface
// ============================================================================

interface SimulationOptions {
  targets: string[];
  mode: ScanMode;
  ports?: string;
  pps?: number;
  repeats?: number;
  immediate?: boolean;
  verbose?: boolean;
  tcpQuickPorts?: string;
  udpQuickPorts?: string;
  ipReportFmt?: string;
}

interface SimulationResult {
  output: string[];
  errors: string[];
  success: boolean;
}

/**
 * Parse command-line arguments following getconfig.c pattern
 */
function parseArgs(args: string[]): SimulationOptions | { error: string } {
  const options: SimulationOptions = {
    targets: [],
    mode: 'tcpscan',
    tcpQuickPorts: DEFAULT_TCP_QUICK_PORTS,
    udpQuickPorts: DEFAULT_UDP_QUICK_PORTS,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    // Mode flag: -m
    if (arg === '-m' || arg === '--mode') {
      i++;
      if (i >= args.length) {
        return { error: "option requires an argument -- 'm'" };
      }
      const modeArg = args[i].toLowerCase();
      if (modeArg === 't' || modeArg === 'tcp') {
        options.mode = 'tcpscan';
      } else if (modeArg === 'u' || modeArg === 'udp') {
        options.mode = 'udpscan';
      } else if (modeArg === 'a' || modeArg === 'arp') {
        options.mode = 'arpscan';
      } else if (modeArg === 'tr' || modeArg === 'traceroute') {
        options.mode = 'tcptrace';
      } else if (modeArg === 'sf' || modeArg === 'connect') {
        options.mode = 'tcpconnect';
      } else {
        return { error: `unsupported scan mode '${args[i]}'` };
      }
    }
    // Port flag: -p
    else if (arg === '-p' || arg === '--ports') {
      i++;
      if (i >= args.length) {
        return { error: "option requires an argument -- 'p'" };
      }
      options.ports = args[i];
    }
    // Combined -pPORTS (e.g., -pq, -p22)
    else if (arg.startsWith('-p') && arg.length > 2) {
      options.ports = arg.substring(2);
    }
    // PPS flag: -r
    else if (arg === '-r' || arg === '--pps') {
      i++;
      if (i >= args.length) {
        return { error: "option requires an argument -- 'r'" };
      }
      options.pps = parseInt(args[i], 10);
    }
    // Repeats flag: -R
    else if (arg === '-R' || arg === '--repeats') {
      i++;
      if (i >= args.length) {
        return { error: "option requires an argument -- 'R'" };
      }
      options.repeats = parseInt(args[i], 10);
    }
    // Immediate flag: -I
    else if (arg === '-I' || arg === '--immediate') {
      options.immediate = true;
    }
    // Verbose flag: -v
    else if (arg === '-v' || arg === '--verbose') {
      options.verbose = true;
    }
    // Help flag
    else if (arg === '-h' || arg === '--help') {
      return { error: 'SHOW_HELP' };
    }
    // Version flag
    else if (arg === '-V' || arg === '--version') {
      return { error: 'SHOW_VERSION' };
    }
    // Unknown flag
    else if (arg.startsWith('-')) {
      // Skip unknown flags for now
    }
    // Target
    else {
      options.targets.push(arg);
    }

    i++;
  }

  if (options.targets.length === 0) {
    return { error: 'no targets specified' };
  }

  return options;
}

/**
 * Generate simulated scan results
 * In a real implementation, this would perform actual network scanning
 */
function generateSimulatedResults(target: ParsedTarget, ports: number[], mode: ScanMode): ScanResult[] {
  const results: ScanResult[] = [];
  const proto = mode === 'udpscan' ? 'udp' : 'tcp';
  const responseType = mode === 'udpscan' ? 'UDP open' : 'TCP open';

  // Simulate finding some open ports (for demo purposes)
  // In a real implementation, this would perform actual scanning
  const simulatedOpenPorts = [22, 80, 443].filter(p => ports.includes(p));

  for (const port of simulatedOpenPorts) {
    results.push({
      responseType: responseType as ScanResult['responseType'],
      serviceName: getServiceName(port, proto),
      port,
      host: target.host,
      ttl: 64, // Common Linux/Unix TTL
    });
  }

  return results;
}

/**
 * Main simulation entry point
 */
function runSimulation(args: string[]): SimulationResult {
  const output: string[] = [];
  const errors: string[] = [];

  // Parse arguments
  const optionsOrError = parseArgs(args);

  if ('error' in optionsOrError) {
    if (optionsOrError.error === 'SHOW_HELP') {
      output.push(getUsageMessage());
      return { output, errors, success: true };
    }
    if (optionsOrError.error === 'SHOW_VERSION') {
      output.push('unicornscan (version 0.4.43)');
      return { output, errors, success: true };
    }

    // Error from portfunc.c:142 format
    errors.push(`Main [Error   getconfig.c:507] ${optionsOrError.error}`);
    return { output, errors, success: false };
  }

  const options = optionsOrError;

  // Process each target
  for (const targetStr of options.targets) {
    const target = parseTarget(targetStr);

    if (target.error) {
      errors.push(`Main [Error   getconfig.c:507] ${target.error}`);
      continue;
    }

    // Determine port string
    let portStr = options.ports || target.ports || DEFAULT_PORT_STRING;

    // Parse ports
    const parsedPorts = parsePortString(
      portStr,
      options.mode,
      options.tcpQuickPorts,
      options.udpQuickPorts
    );

    if (parsedPorts.error) {
      // Error format from portfunc.c:142 and getconfig.c:507
      errors.push(`Main [Error   portfunc.c:142] ${parsedPorts.error}`);
      errors.push(`Main [Error   getconfig.c:507] cant add workunit for argument '${targetStr}': port string '${portStr}' rejected by parser`);
      continue;
    }

    // Generate simulated results
    const results = generateSimulatedResults(target, parsedPorts.ports, options.mode);

    // Format and output results
    for (const result of results) {
      output.push(formatReport(result, options.ipReportFmt || DEFAULT_IP_REPORT_FMT));
    }
  }

  return {
    output,
    errors,
    success: errors.length === 0,
  };
}

/**
 * Get usage message (from getconfig.c:563-600)
 */
function getUsageMessage(): string {
  return `unicornscan (version 0.4.43)
usage: unicornscan [options 'b:B:cd:De:EFG:hH:i:Ij:l:L:m:M:No:p:P:q:Qr:R:s:St:T:u:Uw:W:vVzZ:' ] X.X.X.X/YY:S-E
	-b, --broken-crc     *set broken crc sums on [T]ransport layer, [N]etwork layer, or both[TN]
	-B, --source-port    *set source port? or whatever the scan module expects as a number
	-c, --proc-duplicates process duplicate replies
	-d, --delay-type     *set delay type (numeric value, valid options are '1:tsc 2:gtod 3:sleep')
	-D, --no-defpayload   no default Payload, only probe known protocols
	-e, --enable-module  *enable modules listed as arguments (output and report currently)
	-E, --proc-errors     for processing 'non-open' responses (icmp errors, tcp rsts...)
	-F, --try-frags
	-G, --payload-group  *payload group (numeric) for tcp/udp type payload selection (default all)
	-h, --help            help
	-H, --hardware-address *spoof source MAC address (XX:XX:XX:XX:XX:XX format)
	-i, --interface      *interface name, like eth0 or fxp1, not normally required
	-I, --immediate       immediate mode, display things as we find them
	-j, --ignore-seq     *ignore 'A'll, 'R'eset sequence numbers for tcp header validation
	-l, --logfile        *write to this file not my terminal
	-L, --packet-timeout *wait this long for packets to come back (default 7 secs)
	-m, --mode           *scan mode, tcp (syn) scan is default, U for udp T for tcp 'sf' for tcp connect scan
	                       A for arp, and 'tr' for tcp traceroute (uses TTL iteration)
	-M, --module-dir     *directory modules are found at (defaults to /usr/lib/unicornscan/modules)
	-N, --do-dns          resolve hostnames during the reporting phase
	-o, --format         *format of what to display for replies, see man page for format specification
	-p, --ports           global ports to scan, if not specified in target options
	-P, --pcap-filter    *extra pcap filter string for reciever
	-q, --covertness     *covertness value from 0 to 255
	-Q, --quiet           dont use output to screen, its going somewhere else (a database say...)
	-r, --pps            *packets per second (total, not per host, and as you go higher it gets less accurate)
	-R, --repeats        *repeat packet scan N times
	-s, --source-addr    *source address for packets 'r' for random
	-S, --no-shuffle      do not shuffle ports
	-t, --ip-ttl         *set TTL on sent packets as in 62 or 6-16 or r64-128
	-T, --ip-tos         *set TOS on sent packets
	-u, --debug          *debug mask
	-U, --no-openclosed   dont say open or closed
	-w, --safefile       *write pcap file of recieved packets
	-W, --fingerprint    *OS fingerprint 0=cisco(def) 1=openbsd 2=WindowsXP 3=p0fsendsyn 4=FreeBSD 5=nmap
	                      6=linux 7=strangetcp 8=Win10/11 9=Linux5/6 10=macOS 11=Android
	-v, --verbose         verbose (each time more verbose so -vvvvv is really verbose)
	-V, --version         display version
	-z, --sniff           sniff alike
	-Z, --drone-str      *drone String

*:	options with '*' require an argument following them

  address ranges are cidr like 1.2.3.4/8 for all of 1.?.?.?
  if you omit the cidr mask then /32 is implied
  port ranges are like 1-4096 with 53 only scanning one port, a for all 65k and p for 1-1024
example: unicornscan -i eth1 -Ir 160 -E 192.168.1.0/24:1-4000 gateway:a`;
}

// ============================================================================
// Exports
// ============================================================================

export {
  parsePortString,
  parseTarget,
  parseArgs,
  formatReport,
  getServiceName,
  runSimulation,
  getUsageMessage,
  // Constants
  DEFAULT_TCP_QUICK_PORTS,
  DEFAULT_UDP_QUICK_PORTS,
  DEFAULT_PORT_STRING,
  DEFAULT_IP_REPORT_FMT,
  DEFAULT_IP_IM_REPORT_FMT,
  DEFAULT_ARP_REPORT_FMT,
};

// Type exports (must be separate for ESM compatibility)
export type {
  ScanMode,
  ParsedPorts,
  ParsedTarget,
  ScanResult,
  SimulationOptions,
  SimulationResult,
};

// CLI entry point when run directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('unicornscan-sim.ts')) {
  const args = process.argv.slice(2);
  const result = runSimulation(args);

  for (const line of result.output) {
    console.log(line);
  }

  for (const err of result.errors) {
    console.error(err);
  }

  process.exit(result.success ? 0 : 1);
}
