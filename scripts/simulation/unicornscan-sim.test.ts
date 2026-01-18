/**
 * Tests for Unicornscan Simulation
 *
 * Verifies that the simulation produces output matching the real
 * unicornscan binary based on the C source code patterns.
 */

import { describe, it, expect, test } from 'vitest';
import {
  parsePortString,
  parseTarget,
  parseArgs,
  formatReport,
  getServiceName,
  runSimulation,
  DEFAULT_TCP_QUICK_PORTS,
  DEFAULT_UDP_QUICK_PORTS,
} from './unicornscan-sim';

describe('parsePortString', () => {
  describe('special port specifiers (portfunc.c:100-108)', () => {
    it('should parse "q" as quick ports for TCP mode', () => {
      const result = parsePortString('q', 'tcpscan');
      expect(result.error).toBeUndefined();
      // Default TCP quick ports is "22"
      expect(result.ports).toEqual([22]);
    });

    it('should parse "Q" as quick ports (case insensitive)', () => {
      const result = parsePortString('Q', 'tcpscan');
      expect(result.error).toBeUndefined();
      expect(result.ports).toEqual([22]);
    });

    it('should parse "q" as UDP quick ports for UDP mode', () => {
      const result = parsePortString('q', 'udpscan');
      expect(result.error).toBeUndefined();
      // Default UDP quick ports is "53"
      expect(result.ports).toEqual([53]);
    });

    it('should parse "p" as privileged ports (1-1024)', () => {
      const result = parsePortString('p', 'tcpscan');
      expect(result.error).toBeUndefined();
      expect(result.ports.length).toBe(1024);
      expect(result.ports[0]).toBe(1);
      expect(result.ports[1023]).toBe(1024);
    });

    it('should parse "P" as privileged ports (case insensitive)', () => {
      const result = parsePortString('P', 'tcpscan');
      expect(result.error).toBeUndefined();
      expect(result.ports.length).toBe(1024);
    });

    it('should parse "a" as all ports (0-65535)', () => {
      const result = parsePortString('a', 'tcpscan');
      expect(result.error).toBeUndefined();
      expect(result.ports.length).toBe(65536);
      expect(result.ports[0]).toBe(0);
      expect(result.ports[65535]).toBe(65535);
    });

    it('should return empty ports for ARP mode', () => {
      const result = parsePortString('q', 'arpscan');
      expect(result.error).toBeUndefined();
      expect(result.ports).toEqual([]);
    });
  });

  describe('numeric port specifications', () => {
    it('should parse single port "80"', () => {
      const result = parsePortString('80', 'tcpscan');
      expect(result.error).toBeUndefined();
      expect(result.ports).toEqual([80]);
    });

    it('should parse port range "22-25"', () => {
      const result = parsePortString('22-25', 'tcpscan');
      expect(result.error).toBeUndefined();
      expect(result.ports).toEqual([22, 23, 24, 25]);
    });

    it('should swap reversed range "80-22"', () => {
      const result = parsePortString('80-22', 'tcpscan');
      expect(result.error).toBeUndefined();
      expect(result.ports).toEqual(Array.from({ length: 59 }, (_, i) => 22 + i));
    });

    it('should parse comma-separated ports "22,80,443"', () => {
      const result = parsePortString('22,80,443', 'tcpscan');
      expect(result.error).toBeUndefined();
      expect(result.ports).toEqual([22, 80, 443]);
    });

    it('should parse mixed format "22,80-82,443"', () => {
      const result = parsePortString('22,80-82,443', 'tcpscan');
      expect(result.error).toBeUndefined();
      expect(result.ports).toEqual([22, 80, 81, 82, 443]);
    });
  });

  describe('error handling (portfunc.c:120-144)', () => {
    it('should error on port > 65535', () => {
      const result = parsePortString('70000', 'tcpscan');
      expect(result.error).toBe('port out of range');
    });

    it('should error on invalid string "x"', () => {
      const result = parsePortString('x', 'tcpscan');
      expect(result.error).toBe("cannot parse port string 'x'");
    });

    // Note: "abc" starts with 'a', so per portfunc.c:100-101 it's treated as "all ports"
    // This matches real unicornscan behavior where only the first char matters
    it('should treat "abc" as all ports (starts with a)', () => {
      const result = parsePortString('abc', 'tcpscan');
      expect(result.error).toBeUndefined();
      expect(result.ports.length).toBe(65536); // All ports 0-65535
    });

    it('should error on invalid string "xyz"', () => {
      const result = parsePortString('xyz', 'tcpscan');
      expect(result.error).toBe("cannot parse port string 'xyz'");
    });
  });

  describe('custom quick ports', () => {
    it('should use custom TCP quick ports', () => {
      const result = parsePortString('q', 'tcpscan', '22,80,443');
      expect(result.error).toBeUndefined();
      expect(result.ports).toEqual([22, 80, 443]);
    });

    it('should use custom UDP quick ports', () => {
      const result = parsePortString('q', 'udpscan', '22', '53,123');
      expect(result.error).toBeUndefined();
      expect(result.ports).toEqual([53, 123]);
    });
  });
});

describe('parseTarget', () => {
  it('should parse simple IP address', () => {
    const result = parseTarget('192.168.1.1');
    expect(result.error).toBeUndefined();
    expect(result.host).toBe('192.168.1.1');
    expect(result.cidr).toBe(32);
    expect(result.ports).toBeUndefined();
  });

  it('should parse IP with CIDR', () => {
    const result = parseTarget('192.168.1.0/24');
    expect(result.error).toBeUndefined();
    expect(result.host).toBe('192.168.1.0');
    expect(result.cidr).toBe(24);
  });

  it('should parse IP with port', () => {
    const result = parseTarget('192.168.1.1:80');
    expect(result.error).toBeUndefined();
    expect(result.host).toBe('192.168.1.1');
    expect(result.ports).toBe('80');
  });

  it('should parse IP with quick ports ":q"', () => {
    const result = parseTarget('192.168.1.1:q');
    expect(result.error).toBeUndefined();
    expect(result.host).toBe('192.168.1.1');
    expect(result.ports).toBe('q');
  });

  it('should parse IP with privileged ports ":p"', () => {
    const result = parseTarget('192.168.1.1:p');
    expect(result.error).toBeUndefined();
    expect(result.ports).toBe('p');
  });

  it('should parse IP with all ports ":a"', () => {
    const result = parseTarget('192.168.1.1:a');
    expect(result.error).toBeUndefined();
    expect(result.ports).toBe('a');
  });

  it('should parse IP with port range', () => {
    const result = parseTarget('192.168.1.1:1-1024');
    expect(result.error).toBeUndefined();
    expect(result.ports).toBe('1-1024');
  });

  it('should parse IP with multiple ports', () => {
    const result = parseTarget('192.168.1.1:22,80,443');
    expect(result.error).toBeUndefined();
    expect(result.ports).toBe('22,80,443');
  });

  it('should parse CIDR with port', () => {
    const result = parseTarget('192.168.1.0/24:80');
    expect(result.error).toBeUndefined();
    expect(result.host).toBe('192.168.1.0');
    expect(result.cidr).toBe(24);
    expect(result.ports).toBe('80');
  });

  it('should allow hostname', () => {
    const result = parseTarget('example.com');
    expect(result.error).toBeUndefined();
    expect(result.host).toBe('example.com');
  });

  it('should allow hostname with port', () => {
    const result = parseTarget('example.com:80');
    expect(result.error).toBeUndefined();
    expect(result.host).toBe('example.com');
    expect(result.ports).toBe('80');
  });
});

describe('parseArgs', () => {
  it('should parse simple target', () => {
    const result = parseArgs(['192.168.1.1']);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.targets).toEqual(['192.168.1.1']);
      expect(result.mode).toBe('tcpscan');
    }
  });

  it('should parse -p port flag', () => {
    const result = parseArgs(['-p', '80', '192.168.1.1']);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.ports).toBe('80');
    }
  });

  it('should parse -pq combined flag', () => {
    const result = parseArgs(['-pq', '192.168.1.1']);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.ports).toBe('q');
    }
  });

  it('should parse -m mode flag', () => {
    const result = parseArgs(['-m', 'U', '192.168.1.1']);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.mode).toBe('udpscan');
    }
  });

  it('should parse multiple targets', () => {
    const result = parseArgs(['192.168.1.1', '192.168.1.2']);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.targets).toEqual(['192.168.1.1', '192.168.1.2']);
    }
  });

  it('should error on missing target', () => {
    const result = parseArgs([]);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('no targets specified');
    }
  });

  it('should return help flag', () => {
    const result = parseArgs(['--help']);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('SHOW_HELP');
    }
  });

  it('should return version flag', () => {
    const result = parseArgs(['-V']);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('SHOW_VERSION');
    }
  });
});

describe('formatReport', () => {
  const testResult = {
    responseType: 'TCP open' as const,
    serviceName: 'http',
    port: 80,
    host: '192.168.1.1',
    ttl: 64,
  };

  it('should format default IP report correctly', () => {
    const output = formatReport(testResult);
    // Default format: "%-8r\t%16P[%5p]\t\tFrom %h %T ttl %t"
    // Should produce: "TCP open\t            http[   80]\t\tFrom 192.168.1.1  ttl 64"
    expect(output).toMatch(/^TCP open/);
    expect(output).toContain('http');
    expect(output).toContain('[');
    expect(output).toContain('80');
    expect(output).toContain('From 192.168.1.1');
    expect(output).toContain('ttl 64');
  });

  it('should handle width specifiers', () => {
    const output = formatReport(testResult, '%-8r');
    expect(output).toBe('TCP open');
  });

  it('should right-pad service name', () => {
    const output = formatReport(testResult, '%10P');
    expect(output).toBe('      http');
  });

  it('should include trace address when different', () => {
    const resultWithTrace = {
      ...testResult,
      traceAddr: '10.0.0.1',
    };
    const output = formatReport(resultWithTrace, '%T');
    expect(output).toBe('10.0.0.1');
  });

  it('should omit trace address when same as host', () => {
    const resultWithSameTrace = {
      ...testResult,
      traceAddr: '192.168.1.1',
    };
    const output = formatReport(resultWithSameTrace, '%T');
    expect(output).toBe('');
  });
});

describe('getServiceName', () => {
  it('should return known TCP service names', () => {
    expect(getServiceName(22, 'tcp')).toBe('ssh');
    expect(getServiceName(80, 'tcp')).toBe('http');
    expect(getServiceName(443, 'tcp')).toBe('https');
  });

  it('should return known UDP service names', () => {
    expect(getServiceName(53, 'udp')).toBe('domain');
    expect(getServiceName(123, 'udp')).toBe('ntp');
  });

  it('should return "unknown" for unknown ports', () => {
    expect(getServiceName(12345, 'tcp')).toBe('unknown');
  });
});

describe('runSimulation', () => {
  it('should produce output for valid target', () => {
    const result = runSimulation(['192.168.1.1']);
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    // Output may be empty if no simulated ports match
  });

  it('should handle :q port specification', () => {
    const result = runSimulation(['192.168.1.1:q']);
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('should handle -pq flag', () => {
    const result = runSimulation(['-pq', '192.168.1.1']);
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('should error on invalid port spec "x"', () => {
    const result = runSimulation(['192.168.1.1:x']);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Should match real error format from portfunc.c:142
    expect(result.errors[0]).toContain("cannot parse port string 'x'");
  });

  it('should show help with --help', () => {
    const result = runSimulation(['--help']);
    expect(result.success).toBe(true);
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.output[0]).toContain('unicornscan');
    expect(result.output[0]).toContain('usage:');
  });

  it('should show version with -V', () => {
    const result = runSimulation(['-V']);
    expect(result.success).toBe(true);
    expect(result.output).toEqual(['unicornscan (version 0.4.43)']);
  });

  it('should error with no targets', () => {
    const result = runSimulation([]);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('no targets specified');
  });
});

describe('output format matching real unicornscan', () => {
  // Real output example:
  // "TCP open               http[   80]        from 192.168.1.1  ttl 64"

  it('should produce output in authentic format', () => {
    const result = formatReport({
      responseType: 'TCP open',
      serviceName: 'http',
      port: 80,
      host: '192.168.1.1',
      ttl: 64,
    });

    // The output should contain these key elements in order
    expect(result).toMatch(/TCP open/);
    expect(result).toMatch(/http/);
    expect(result).toMatch(/80/);
    expect(result).toMatch(/From 192\.168\.1\.1/);
    expect(result).toMatch(/ttl 64/);
  });

  it('should match error format from C source', () => {
    const result = runSimulation(['192.168.1.1:invalid']);
    expect(result.errors[0]).toMatch(/\[Error\s+portfunc\.c:\d+\]/);
  });
});
