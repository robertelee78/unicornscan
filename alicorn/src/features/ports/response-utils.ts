/**
 * Response type utilities for unicornscan results
 * Separated from component file to allow Fast Refresh
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { IP_PROTOCOLS, TCP_FLAGS, decodeTcpFlags } from '@/types/database'

// =============================================================================
// ICMP Type/Code Mappings (RFC 792, RFC 1122)
// =============================================================================

export interface IcmpTypeInfo {
  name: string
  codes?: Record<number, string>
}

export const ICMP_TYPES: Record<number, IcmpTypeInfo> = {
  0: { name: 'Echo Reply' },
  3: {
    name: 'Destination Unreachable',
    codes: {
      0: 'Network Unreachable',
      1: 'Host Unreachable',
      2: 'Protocol Unreachable',
      3: 'Port Unreachable',
      4: 'Fragmentation Needed',
      5: 'Source Route Failed',
      6: 'Destination Network Unknown',
      7: 'Destination Host Unknown',
      9: 'Network Administratively Prohibited',
      10: 'Host Administratively Prohibited',
      13: 'Communication Administratively Prohibited',
    },
  },
  4: { name: 'Source Quench' },
  5: {
    name: 'Redirect',
    codes: {
      0: 'Network Redirect',
      1: 'Host Redirect',
      2: 'TOS Network Redirect',
      3: 'TOS Host Redirect',
    },
  },
  8: { name: 'Echo Request' },
  9: { name: 'Router Advertisement' },
  10: { name: 'Router Solicitation' },
  11: {
    name: 'Time Exceeded',
    codes: {
      0: 'TTL Exceeded in Transit',
      1: 'Fragment Reassembly Time Exceeded',
    },
  },
  12: { name: 'Parameter Problem' },
  13: { name: 'Timestamp Request' },
  14: { name: 'Timestamp Reply' },
}

/**
 * Get human-readable ICMP type/code description
 */
export function getIcmpDescription(type: number, code: number): string {
  const typeInfo = ICMP_TYPES[type]
  if (!typeInfo) return `ICMP Type ${type} Code ${code}`

  const codeName = typeInfo.codes?.[code]
  if (codeName) return codeName
  if (typeInfo.codes) return `${typeInfo.name} (code ${code})`
  return typeInfo.name
}

// =============================================================================
// Response Type Classification
// =============================================================================

export type ResponseCategory =
  | 'tcp-synack'     // Got SYN+ACK - service accepting connections
  | 'tcp-rst'        // Got RST - port closed or filtered
  | 'tcp-rstack'     // Got RST+ACK - explicit rejection
  | 'tcp-other'      // Got other TCP flags
  | 'udp-response'   // Got UDP data back
  | 'icmp-unreachable' // Got ICMP unreachable (port/host/network)
  | 'icmp-ttl'       // Got ICMP TTL exceeded (traceroute)
  | 'icmp-reply'     // Got ICMP echo reply
  | 'icmp-other'     // Got other ICMP
  | 'no-response'    // Sent but got nothing back
  | 'unknown'        // Can't classify

export interface ResponseClassification {
  category: ResponseCategory
  summary: string
  detail: string
  colorClass: string
}

/**
 * Classify a response based on protocol and flags/type
 */
export function classifyResponse(
  protocol: number,
  flags: number,
  icmpType?: number,
  icmpCode?: number
): ResponseClassification {
  // TCP responses - classify by flags
  if (protocol === IP_PROTOCOLS.TCP) {
    const hasSyn = (flags & TCP_FLAGS.SYN) !== 0
    const hasAck = (flags & TCP_FLAGS.ACK) !== 0
    const hasRst = (flags & TCP_FLAGS.RST) !== 0

    if (hasSyn && hasAck) {
      return {
        category: 'tcp-synack',
        summary: 'SYN+ACK',
        detail: 'Service accepting connections',
        colorClass: 'bg-emerald-600 text-white',
      }
    }

    if (hasRst && hasAck) {
      return {
        category: 'tcp-rstack',
        summary: 'RST+ACK',
        detail: 'Connection explicitly rejected',
        colorClass: 'bg-red-600 text-white',
      }
    }

    if (hasRst) {
      return {
        category: 'tcp-rst',
        summary: 'RST',
        detail: 'Connection reset',
        colorClass: 'bg-red-500 text-white',
      }
    }

    // Other flag combinations
    const flagNames = decodeTcpFlags(flags)
    return {
      category: 'tcp-other',
      summary: flagNames.join('+') || 'TCP',
      detail: `TCP response with flags: ${flagNames.join(', ') || 'none'}`,
      colorClass: 'bg-blue-600 text-white',
    }
  }

  // UDP responses
  if (protocol === IP_PROTOCOLS.UDP) {
    return {
      category: 'udp-response',
      summary: 'UDP Data',
      detail: 'Received UDP response payload',
      colorClass: 'bg-purple-600 text-white',
    }
  }

  // ICMP responses - classify by type/code
  if (protocol === IP_PROTOCOLS.ICMP) {
    const type = icmpType ?? 0
    const code = icmpCode ?? 0

    // Echo reply
    if (type === 0) {
      return {
        category: 'icmp-reply',
        summary: 'Echo Reply',
        detail: 'Host responded to ping',
        colorClass: 'bg-emerald-600 text-white',
      }
    }

    // Destination unreachable
    if (type === 3) {
      const desc = getIcmpDescription(type, code)
      return {
        category: 'icmp-unreachable',
        summary: code === 3 ? 'Port Unreach' : 'Unreachable',
        detail: desc,
        colorClass: 'bg-amber-600 text-white',
      }
    }

    // TTL exceeded
    if (type === 11) {
      return {
        category: 'icmp-ttl',
        summary: 'TTL Exceeded',
        detail: getIcmpDescription(type, code),
        colorClass: 'bg-cyan-600 text-white',
      }
    }

    // Other ICMP
    return {
      category: 'icmp-other',
      summary: `ICMP ${type}`,
      detail: getIcmpDescription(type, code),
      colorClass: 'bg-slate-600 text-white',
    }
  }

  return {
    category: 'unknown',
    summary: `Proto ${protocol}`,
    detail: `Unknown protocol ${protocol}`,
    colorClass: 'bg-muted text-muted-foreground',
  }
}
