/**
 * CIDR utilities for IPv4 address manipulation
 * Pure functions for network grouping and containment checks
 *
 * Note: IPv4-only for now. IPv6 support planned - will require BigInt
 * for 128-bit address handling.
 */

// =============================================================================
// IP Address Conversion
// =============================================================================

/**
 * Convert IPv4 dotted-decimal string to 32-bit unsigned number
 * "192.168.1.1" -> 3232235777
 *
 * Uses multiplication instead of bit shifts to avoid JavaScript's
 * signed 32-bit integer behavior with bitwise operators.
 */
export function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]
}

/**
 * Convert 32-bit unsigned number to IPv4 dotted-decimal string
 * 3232235777 -> "192.168.1.1"
 */
export function numberToIp(num: number): string {
  return [
    (num >>> 24) & 0xff,
    (num >>> 16) & 0xff,
    (num >>> 8) & 0xff,
    num & 0xff,
  ].join('.')
}

// =============================================================================
// CIDR Operations
// =============================================================================

/**
 * Parse CIDR notation into network address and prefix length
 * "192.168.1.0/24" -> { network: 3232235776, prefix: 24 }
 */
export function parseCIDR(cidr: string): { network: number; prefix: number } {
  const [ip, prefixStr] = cidr.split('/')
  const prefix = parseInt(prefixStr, 10)
  const network = ipToNumber(ip)
  return { network, prefix }
}

/**
 * Create a bitmask for a given prefix length
 * 24 -> 0xFFFFFF00 (4294967040)
 * 32 -> 0xFFFFFFFF (4294967295)
 * 0  -> 0x00000000 (0)
 */
export function prefixToMask(prefixLength: number): number {
  // Special case: shifting by 32 bits in JS wraps to 0, not 32
  if (prefixLength === 0) return 0
  if (prefixLength === 32) return 0xffffffff >>> 0
  // Create mask by shifting 1s left, then convert to unsigned with >>> 0
  return (0xffffffff << (32 - prefixLength)) >>> 0
}

/**
 * Get the CIDR group (network address) for an IP at a given prefix length
 * ("192.168.1.45", 24) -> "192.168.1.0/24"
 * ("10.0.5.100", 16)   -> "10.0.0.0/16"
 * ("172.16.30.5", 8)   -> "172.0.0.0/8"
 */
export function getCIDRGroup(ip: string, prefixLength: number): string {
  const ipNum = ipToNumber(ip)
  const mask = prefixToMask(prefixLength)
  const network = (ipNum & mask) >>> 0
  return `${numberToIp(network)}/${prefixLength}`
}

/**
 * Get just the network address portion of an IP for a given prefix
 * ("192.168.1.45", 24) -> "192.168.1.0"
 */
export function getNetworkAddress(ip: string, prefixLength: number): string {
  const ipNum = ipToNumber(ip)
  const mask = prefixToMask(prefixLength)
  const network = (ipNum & mask) >>> 0
  return numberToIp(network)
}

/**
 * Check if an IP address falls within a CIDR range
 * ("192.168.1.0/24", "192.168.1.45")  -> true
 * ("192.168.1.0/24", "192.168.2.1")   -> false
 * ("10.0.0.0/8", "10.255.255.255")    -> true
 */
export function cidrContains(cidr: string, ip: string): boolean {
  const { network, prefix } = parseCIDR(cidr)
  const mask = prefixToMask(prefix)
  const ipNetwork = (ipToNumber(ip) & mask) >>> 0
  return ipNetwork === network
}

/**
 * Check if an IP is a private/RFC1918 address
 * Used for smart prefix defaults (private networks often use /24)
 */
export function isPrivateIP(ip: string): boolean {
  const num = ipToNumber(ip)
  // 10.0.0.0/8
  if ((num & 0xff000000) === 0x0a000000) return true
  // 172.16.0.0/12
  if ((num & 0xfff00000) === 0xac100000) return true
  // 192.168.0.0/16
  if ((num & 0xffff0000) === 0xc0a80000) return true
  return false
}

// =============================================================================
// Scan Target Parsing
// =============================================================================

/**
 * Validate an IPv4 address string
 * Returns true if the string is a valid dotted-decimal IPv4 address
 */
export function isValidIPv4(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  for (const part of parts) {
    const num = parseInt(part, 10)
    if (isNaN(num) || num < 0 || num > 255 || String(num) !== part) {
      return false
    }
  }
  return true
}

/**
 * Extract just the prefix length from a scan target string
 * Works even when target is a hostname (can't resolve to IP)
 *
 * Examples:
 * - "192.168.1.0/24:80"    -> 24
 * - "www.google.com/24:80" -> 24
 * - "192.168.1.1"          -> 32 (implied single host)
 * - "www.google.com"       -> 32 (implied single host)
 * - "/255.255.255.0"       -> 24 (netmask notation)
 *
 * Returns null if prefix cannot be determined
 */
export function extractPrefixFromTarget(target: string): number | null {
  if (!target) return null

  // Strip port/mode suffix
  let trimmed = target.trim()
  const colonIdx = trimmed.indexOf(':')
  if (colonIdx !== -1) {
    const slashIdx = trimmed.indexOf('/')
    if (slashIdx !== -1 && colonIdx > slashIdx) {
      trimmed = trimmed.substring(0, colonIdx)
    } else if (slashIdx === -1) {
      trimmed = trimmed.substring(0, colonIdx)
    }
  }

  if (trimmed.includes('/')) {
    const suffix = trimmed.split('/')[1]

    if (suffix.includes('.')) {
      // Netmask notation: extract prefix from mask
      if (!isValidIPv4(suffix)) return null
      const maskNum = ipToNumber(suffix)
      return countLeadingOnes(maskNum)
    } else {
      // Prefix length notation
      const prefix = parseInt(suffix, 10)
      if (isNaN(prefix) || prefix < 0 || prefix > 32) return null
      return prefix
    }
  }

  // No slash means single host (/32)
  return 32
}

/**
 * Parse a scan target string into normalized CIDR notation
 * Handles various formats unicornscan accepts:
 * - "192.168.1.0/24"    -> "192.168.1.0/24"
 * - "192.168.1.0/24:80" -> "192.168.1.0/24" (strips port suffix)
 * - "192.168.1.1"       -> "192.168.1.1/32" (single host)
 * - "192.168.1.0/255.255.255.0" -> "192.168.1.0/24" (netmask notation)
 * - "www.google.com/24:80" -> null (hostnames not resolvable here)
 *
 * Returns null if target cannot be parsed as valid CIDR
 */
export function parseCIDRTarget(target: string): string | null {
  if (!target) return null

  // Trim whitespace and strip port/mode suffix (e.g., ":22,80" or ":q")
  let trimmed = target.trim()
  const colonIdx = trimmed.indexOf(':')
  if (colonIdx !== -1) {
    // Check if colon is in the IP part (IPv6 future) or after the CIDR
    // For now, strip everything after the first colon that comes after a slash or at the end
    const slashIdx = trimmed.indexOf('/')
    if (slashIdx !== -1 && colonIdx > slashIdx) {
      // Colon is after the slash - it's a port suffix, strip it
      trimmed = trimmed.substring(0, colonIdx)
    } else if (slashIdx === -1) {
      // No slash, colon is port suffix on plain IP
      trimmed = trimmed.substring(0, colonIdx)
    }
  }

  // Handle CIDR notation: "192.168.1.0/24"
  if (trimmed.includes('/')) {
    const [ip, suffix] = trimmed.split('/')

    if (!isValidIPv4(ip)) return null

    // Check if suffix is a prefix length (number) or netmask (dotted decimal)
    if (suffix.includes('.')) {
      // Netmask notation: "192.168.1.0/255.255.255.0"
      if (!isValidIPv4(suffix)) return null
      const maskNum = ipToNumber(suffix)
      // Count leading 1 bits to get prefix length
      const prefix = countLeadingOnes(maskNum)
      if (prefix === -1) return null // Invalid netmask (non-contiguous)
      const normalizedNetwork = getNetworkAddress(ip, prefix)
      return `${normalizedNetwork}/${prefix}`
    } else {
      // Prefix length notation: "192.168.1.0/24"
      const prefix = parseInt(suffix, 10)
      if (isNaN(prefix) || prefix < 0 || prefix > 32) return null
      const normalizedNetwork = getNetworkAddress(ip, prefix)
      return `${normalizedNetwork}/${prefix}`
    }
  }

  // Plain IP address: treat as /32
  if (isValidIPv4(trimmed)) {
    return `${trimmed}/32`
  }

  return null
}

/**
 * Count leading 1 bits in a netmask
 * Valid netmasks have contiguous 1s followed by 0s
 * Returns -1 for invalid (non-contiguous) netmasks
 */
function countLeadingOnes(mask: number): number {
  // A valid netmask, when inverted and incremented, is a power of 2
  const inverted = (~mask) >>> 0
  if ((inverted & (inverted + 1)) !== 0) {
    return -1 // Non-contiguous mask
  }

  let count = 0
  const m = mask >>> 0
  for (let i = 31; i >= 0; i--) {
    if ((m & (1 << i)) !== 0) {
      count++
    } else {
      break
    }
  }
  return count
}

// =============================================================================
// Intelligent CIDR Grouping
// =============================================================================

/**
 * Find the largest CIDR block from a list that contains the given IP
 * "Largest" means smallest prefix length (e.g., /16 is larger than /24)
 *
 * This enables intelligent grouping: if we scanned both 192.168.1.0/24 and
 * 192.168.1.50/32, a host at 192.168.1.50 should be grouped in the /24.
 *
 * @param ip - The IP address to check
 * @param cidrs - Array of CIDR strings (e.g., ["192.168.1.0/24", "10.0.0.0/8"])
 * @returns The largest containing CIDR, or null if IP is not in any CIDR
 */
export function findLargestContainingCIDR(ip: string, cidrs: string[]): string | null {
  if (!isValidIPv4(ip) || cidrs.length === 0) return null

  let largestCIDR: string | null = null
  let smallestPrefix = 33 // Smaller prefix = larger network

  for (const cidr of cidrs) {
    if (!cidr || !cidr.includes('/')) continue

    try {
      const { prefix } = parseCIDR(cidr)
      if (cidrContains(cidr, ip) && prefix < smallestPrefix) {
        smallestPrefix = prefix
        largestCIDR = cidr
      }
    } catch {
      // Skip invalid CIDRs
      continue
    }
  }

  return largestCIDR
}

/**
 * Determine the CIDR group for an IP based on scanned targets
 * Uses intelligent grouping: find the largest scanned CIDR containing this IP.
 *
 * Returns null if IP is not in any scanned CIDR - this means either:
 * - The host shouldn't be in our topology (data integrity issue)
 * - It's a router discovered via MTR (routers aren't CIDR-grouped)
 *
 * @param ip - The IP address to group
 * @param scannedCidrs - Array of CIDR targets from scans
 * @returns CIDR group string, or null if not in any scanned CIDR
 */
export function determineIPGroup(ip: string, scannedCidrs: string[]): string | null {
  // Find the largest scanned CIDR containing this IP
  const containingCIDR = findLargestContainingCIDR(ip, scannedCidrs)
  return containingCIDR
}
