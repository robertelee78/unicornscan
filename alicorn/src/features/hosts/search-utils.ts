/**
 * Smart search utilities for host filtering
 * Auto-detects search type and provides parsing/matching functions
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Search type enumeration - each type has specific matching behavior
 */
export type SearchType =
  | 'port'      // Numeric port (1-65535), matches port numbers
  | 'cidr'      // CIDR notation (e.g., 192.168.1.0/24), matches IP ranges
  | 'ip-prefix' // IP prefix (e.g., 192.168.), matches IP addresses starting with
  | 'mac'       // MAC address (various formats), matches MAC addresses
  | 'asn'       // ASN number (e.g., AS13335), matches Autonomous System Numbers
  | 'regex'     // Regex pattern (starts with / or ~), matches banners
  | 'text'      // Plain text (default), matches IP, hostname, MAC, banner

/**
 * Parsed search result with detected type and normalized value
 */
export interface ParsedSearch {
  /** Detected type of the search query */
  type: SearchType
  /** Original input string */
  original: string
  /** Normalized/cleaned value for matching */
  value: string
  /** Pre-compiled regex for regex/text searches (null if invalid) */
  regex: RegExp | null
  /** For CIDR: parsed network info */
  cidr?: CIDRInfo
  /** For port: parsed port number */
  port?: number
  /** For ASN: parsed AS number */
  asn?: number
}

/**
 * CIDR network information for IP range matching
 */
export interface CIDRInfo {
  /** Network address as 32-bit integer */
  networkInt: number
  /** Subnet mask as 32-bit integer */
  maskInt: number
  /** CIDR prefix length (0-32) */
  prefix: number
  /** Original network address string */
  networkAddr: string
}

// =============================================================================
// Constants
// =============================================================================

/** Valid port range */
const PORT_MIN = 1
const PORT_MAX = 65535

/** Regex to detect CIDR notation: IP/prefix */
const CIDR_REGEX = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/

/** Regex to detect IP prefix (partial IP ending with dot) */
const IP_PREFIX_REGEX = /^(\d{1,3}\.){1,3}$/

/** Regex to detect full IP address */
const FULL_IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/

/** Various MAC address formats */
const MAC_COLON_REGEX = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i    // 00:11:22:33:44:55
const MAC_DASH_REGEX = /^([0-9a-f]{2}-){5}[0-9a-f]{2}$/i     // 00-11-22-33-44-55
const MAC_RAW_REGEX = /^[0-9a-f]{12}$/i                       // 001122334455
const MAC_PARTIAL_REGEX = /^([0-9a-f]{2}[:-]?){1,5}[0-9a-f]{0,2}$/i // Partial MAC

/** Regex prefix indicators */
const REGEX_SLASH_PREFIX = '/'
const REGEX_TILDE_PREFIX = '~'

/** ASN pattern: AS followed by 1-10 digits (ASNs range up to ~4 billion) */
const ASN_REGEX = /^[Aa][Ss](\d{1,10})$/

// =============================================================================
// Detection Functions
// =============================================================================

/**
 * Detect the type of search query based on its format.
 * Returns the most specific type that matches the input.
 *
 * Detection priority:
 * 1. Port number (pure digits 1-65535)
 * 2. ASN (AS followed by digits, e.g., AS13335)
 * 3. CIDR notation (IP/prefix)
 * 4. IP prefix (partial IP ending with dot)
 * 5. MAC address (various formats)
 * 6. Regex (starts with / or ~)
 * 7. Text (default fallback)
 */
export function detectSearchType(input: string): SearchType {
  const trimmed = input.trim()
  if (!trimmed) return 'text'

  // 1. Check for port number (pure digits within valid range)
  if (isValidPort(trimmed)) {
    return 'port'
  }

  // 2. Check for ASN (AS followed by digits)
  if (isASN(trimmed)) {
    return 'asn'
  }

  // 3. Check for CIDR notation
  if (isCIDR(trimmed)) {
    return 'cidr'
  }

  // 4. Check for IP prefix (partial IP ending with dot)
  if (isIPPrefix(trimmed)) {
    return 'ip-prefix'
  }

  // 5. Check for MAC address (full or partial)
  if (isMAC(trimmed)) {
    return 'mac'
  }

  // 6. Check for regex pattern
  if (isRegexPattern(trimmed)) {
    return 'regex'
  }

  // 7. Default to text search
  return 'text'
}

/**
 * Check if value is a valid port number (1-65535)
 */
export function isValidPort(value: string): boolean {
  // Must be pure digits
  if (!/^\d+$/.test(value)) return false
  const num = parseInt(value, 10)
  return num >= PORT_MIN && num <= PORT_MAX
}

/**
 * Check if value is valid CIDR notation
 */
export function isCIDR(value: string): boolean {
  const match = value.match(CIDR_REGEX)
  if (!match) return false

  // Validate IP octets
  const ip = match[1]
  if (!isValidIPAddress(ip)) return false

  // Validate prefix (0-32)
  const prefix = parseInt(match[2], 10)
  return prefix >= 0 && prefix <= 32
}

/**
 * Check if value is an IP prefix (partial IP ending with dot)
 */
export function isIPPrefix(value: string): boolean {
  if (!IP_PREFIX_REGEX.test(value)) return false

  // Validate each octet
  const octets = value.slice(0, -1).split('.')
  return octets.every(octet => {
    const num = parseInt(octet, 10)
    return num >= 0 && num <= 255
  })
}

/**
 * Check if value is a full valid IPv4 address
 */
export function isValidIPAddress(ip: string): boolean {
  if (!FULL_IP_REGEX.test(ip)) return false
  return ip.split('.').every(octet => {
    const num = parseInt(octet, 10)
    return num >= 0 && num <= 255
  })
}

/**
 * Check if value looks like a MAC address (full or partial)
 */
export function isMAC(value: string): boolean {
  // Check full MAC formats
  if (MAC_COLON_REGEX.test(value)) return true
  if (MAC_DASH_REGEX.test(value)) return true
  if (MAC_RAW_REGEX.test(value)) return true

  // Check partial MAC (OUI prefix, partial address)
  if (MAC_PARTIAL_REGEX.test(value) && value.length >= 6) return true

  return false
}

/**
 * Check if value is a regex pattern (starts with / or ~)
 */
export function isRegexPattern(value: string): boolean {
  return value.startsWith(REGEX_SLASH_PREFIX) || value.startsWith(REGEX_TILDE_PREFIX)
}

/**
 * Check if value is an ASN (Autonomous System Number)
 * Accepts formats: AS13335, as13335 (case-insensitive)
 */
export function isASN(value: string): boolean {
  return ASN_REGEX.test(value)
}

/**
 * Parse an ASN string and return the numeric value
 */
export function parseASN(value: string): number | undefined {
  const match = value.match(ASN_REGEX)
  if (!match) return undefined
  const num = parseInt(match[1], 10)
  // ASNs can be up to 4,294,967,295 (32-bit)
  if (num < 0 || num > 4294967295) return undefined
  return num
}

// =============================================================================
// Parsing Functions
// =============================================================================

/**
 * Parse a search query into a structured format for matching.
 * Automatically detects type and normalizes the value.
 */
export function parseSearch(input: string): ParsedSearch {
  const trimmed = input.trim()
  const type = detectSearchType(trimmed)

  const result: ParsedSearch = {
    type,
    original: input,
    value: trimmed.toLowerCase(),
    regex: null,
  }

  switch (type) {
    case 'port':
      result.port = parseInt(trimmed, 10)
      break

    case 'asn':
      result.asn = parseASN(trimmed)
      break

    case 'cidr':
      result.cidr = parseCIDR(trimmed)
      break

    case 'ip-prefix':
      // Normalize to lowercase (already done)
      break

    case 'mac':
      result.value = normalizeMAC(trimmed)
      break

    case 'regex':
      result.regex = parseRegexPattern(trimmed)
      // Keep original pattern as value for display
      result.value = trimmed
      break

    case 'text':
      // Create case-insensitive substring regex for text search
      result.regex = createTextSearchRegex(trimmed)
      break
  }

  return result
}

/**
 * Parse CIDR notation into network info for range matching
 */
export function parseCIDR(cidr: string): CIDRInfo | undefined {
  const match = cidr.match(CIDR_REGEX)
  if (!match) return undefined

  const networkAddr = match[1]
  const prefix = parseInt(match[2], 10)

  // Validate prefix range (0-32) and IP octets
  if (prefix < 0 || prefix > 32) return undefined
  if (!isValidIPAddress(networkAddr)) return undefined

  const networkInt = ipToInt(networkAddr)
  const maskInt = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0

  return {
    networkInt,
    maskInt,
    prefix,
    networkAddr,
  }
}

/**
 * Parse regex pattern from user input.
 * Supports:
 * - /pattern/flags - standard regex syntax
 * - ~pattern - shorthand for case-insensitive match
 *
 * Returns null if the pattern is invalid.
 */
export function parseRegexPattern(pattern: string): RegExp | null {
  if (pattern.startsWith(REGEX_TILDE_PREFIX)) {
    // Shorthand syntax: ~pattern -> case-insensitive
    const regexBody = pattern.slice(1)
    return createSafeRegex(regexBody, 'i')
  }

  if (pattern.startsWith(REGEX_SLASH_PREFIX)) {
    // Standard /pattern/flags syntax
    const lastSlash = pattern.lastIndexOf('/')
    if (lastSlash <= 0) {
      // No closing slash - treat as pattern with implicit close
      const regexBody = pattern.slice(1)
      return createSafeRegex(regexBody, 'i')
    }

    const regexBody = pattern.slice(1, lastSlash)
    const flags = pattern.slice(lastSlash + 1)

    return createSafeRegex(regexBody, flags)
  }

  return null
}

/**
 * Create a safe regex, returning null if the pattern is invalid.
 * Prevents ReDoS by timing out complex patterns.
 */
export function createSafeRegex(pattern: string, flags = ''): RegExp | null {
  try {
    // Basic validation - check for excessive complexity
    if (hasExcessiveComplexity(pattern)) {
      return null
    }
    return new RegExp(pattern, flags)
  } catch {
    return null
  }
}

/**
 * Create a regex for plain text search (case-insensitive substring match)
 */
export function createTextSearchRegex(text: string): RegExp | null {
  // Escape special regex characters for literal matching
  const escaped = escapeRegex(text)
  return createSafeRegex(escaped, 'i')
}

/**
 * Check if a regex pattern might be dangerous (ReDoS prevention)
 */
function hasExcessiveComplexity(pattern: string): boolean {
  // Reject patterns with nested quantifiers (common ReDoS pattern)
  // Examples: (a+)+, (a*)*b, (?:a+){2,}
  const nestedQuantifier = /(\([^)]*[+*][^)]*\))[+*{]/
  if (nestedQuantifier.test(pattern)) return true

  // Reject excessively long patterns
  if (pattern.length > 500) return true

  // Reject patterns with many alternations
  const alternations = (pattern.match(/\|/g) || []).length
  if (alternations > 50) return true

  return false
}

/**
 * Escape special regex characters in a string
 */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// =============================================================================
// IP/Network Utilities
// =============================================================================

/**
 * Convert IPv4 address to 32-bit integer
 */
export function ipToInt(ip: string): number {
  const parts = ip.split('.')
  return (
    ((parseInt(parts[0], 10) << 24) |
     (parseInt(parts[1], 10) << 16) |
     (parseInt(parts[2], 10) << 8) |
     parseInt(parts[3], 10)) >>> 0
  )
}

/**
 * Convert 32-bit integer to IPv4 address
 */
export function intToIp(num: number): string {
  return [
    (num >>> 24) & 0xff,
    (num >>> 16) & 0xff,
    (num >>> 8) & 0xff,
    num & 0xff,
  ].join('.')
}

/**
 * Check if an IP address falls within a CIDR range
 */
export function matchesCIDR(ip: string, cidr: CIDRInfo): boolean {
  if (!isValidIPAddress(ip)) return false

  const ipInt = ipToInt(ip)
  // Apply mask to both and compare
  return (ipInt & cidr.maskInt) === (cidr.networkInt & cidr.maskInt)
}

/**
 * Check if an IP address starts with the given prefix
 */
export function matchesIPPrefix(ip: string, prefix: string): boolean {
  return ip.toLowerCase().startsWith(prefix.toLowerCase())
}

// =============================================================================
// MAC Address Utilities
// =============================================================================

/**
 * Normalize MAC address to uppercase with separators removed.
 * Handles various input formats:
 * - Colon-separated: 00:11:22:33:44:55
 * - Dash-separated: 00-11-22-33-44-55
 * - Raw hex: 001122334455
 * - Partial: 00:11:22 or 001122
 *
 * Returns raw hex uppercase for consistent matching.
 */
export function normalizeMAC(mac: string): string {
  // Remove all separators and convert to uppercase
  return mac.replace(/[:-]/g, '').toUpperCase()
}

/**
 * Format a normalized MAC for display (colon-separated)
 */
export function formatMAC(mac: string): string {
  const cleaned = normalizeMAC(mac)
  if (cleaned.length === 12) {
    return cleaned.match(/.{2}/g)?.join(':') || cleaned
  }
  return cleaned
}

/**
 * Check if a MAC address matches a search pattern (normalized)
 */
export function matchesMAC(mac: string | null | undefined, pattern: string): boolean {
  if (!mac) return false

  const normalizedMac = normalizeMAC(mac)
  const normalizedPattern = normalizeMAC(pattern)

  // For partial patterns, check if MAC starts with or contains pattern
  return normalizedMac.includes(normalizedPattern)
}

// =============================================================================
// Banner/Text Matching
// =============================================================================

/**
 * Match a banner against a parsed search.
 * Supports regex patterns for advanced matching.
 */
export function matchesBanner(
  banner: string | null | undefined,
  search: ParsedSearch
): boolean {
  if (!banner) return false

  if (search.regex) {
    try {
      return search.regex.test(banner)
    } catch {
      // Regex execution failed (shouldn't happen with safe regex)
      return false
    }
  }

  // Fallback to case-insensitive substring match
  return banner.toLowerCase().includes(search.value)
}

/**
 * Match any text field (IP, hostname, MAC, banner) against a text search
 */
export function matchesText(
  text: string | null | undefined,
  search: ParsedSearch
): boolean {
  if (!text) return false

  if (search.regex) {
    try {
      return search.regex.test(text)
    } catch {
      return false
    }
  }

  return text.toLowerCase().includes(search.value)
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate a user's regex pattern and return error message if invalid
 */
export function validateRegex(pattern: string): string | null {
  if (!isRegexPattern(pattern)) {
    return null // Not a regex pattern
  }

  const parsed = parseRegexPattern(pattern)
  if (parsed === null) {
    return 'Invalid regular expression'
  }

  return null // Valid
}

/**
 * Get a human-readable description of the detected search type
 */
export function getSearchTypeDescription(type: SearchType): string {
  switch (type) {
    case 'port':
      return 'Port number - matches hosts with this port'
    case 'asn':
      return 'ASN - matches hosts in this Autonomous System'
    case 'cidr':
      return 'CIDR range - matches IPs within network'
    case 'ip-prefix':
      return 'IP prefix - matches IPs starting with this'
    case 'mac':
      return 'MAC address - matches full or partial MAC'
    case 'regex':
      return 'Regex pattern - matches banners/text'
    case 'text':
      return 'Text search - matches IP, hostname, MAC, or banner'
  }
}

/**
 * Get example patterns for each search type
 */
export function getSearchTypeExamples(type: SearchType): string[] {
  switch (type) {
    case 'port':
      return ['22', '80', '443', '8080']
    case 'asn':
      return ['AS13335', 'AS15169', 'AS32934', 'AS16509']
    case 'cidr':
      return ['192.168.1.0/24', '10.0.0.0/8', '172.16.0.0/12']
    case 'ip-prefix':
      return ['192.168.', '10.0.0.', '172.16.']
    case 'mac':
      return ['00:11:22:33:44:55', '001122334455', '00:11:22']
    case 'regex':
      return ['/Apache/i', '/SSH-2\\.0/', '~nginx', '/OpenSSH/']
    case 'text':
      return ['webserver', 'router', 'apache', 'linux']
  }
}
