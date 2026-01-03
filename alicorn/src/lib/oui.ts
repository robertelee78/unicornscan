/**
 * OUI (Organizationally Unique Identifier) Lookup Module
 * Provides bidirectional MAC-to-vendor and vendor-to-MAC lookups
 *
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

// Lazy-loaded OUI data
let ouiData: Record<string, string> | null = null
let reverseIndex: Map<string, string[]> | null = null
let loading = false
let loadError: Error | null = null

/**
 * Extract OUI prefix from MAC address
 * Handles formats: 00:11:22:33:44:55, 00-11-22-33-44-55, 001122334455
 */
function extractOui(mac: string): string | null {
  if (!mac) return null

  // Remove all separators and convert to uppercase
  const cleaned = mac.replace(/[:\-.\s]/g, '').toUpperCase()

  // MAC should be at least 6 hex chars (OUI portion)
  if (cleaned.length < 6) return null

  // Validate hex characters
  if (!/^[0-9A-F]+$/.test(cleaned)) return null

  // Return first 6 characters (OUI)
  return cleaned.substring(0, 6)
}

/**
 * Load OUI data from bundled JSON
 */
async function loadOuiData(): Promise<void> {
  if (ouiData !== null || loading) return

  loading = true
  try {
    // Dynamic import for code splitting
    const data = await import('@/data/oui-data.json')
    ouiData = data.default as Record<string, string>

    // Build reverse index for vendor search
    reverseIndex = new Map()
    for (const [oui, vendor] of Object.entries(ouiData)) {
      const key = vendor.toLowerCase()
      if (!reverseIndex.has(key)) {
        reverseIndex.set(key, [])
      }
      reverseIndex.get(key)!.push(oui)
    }

    loadError = null
  } catch (err) {
    loadError = err instanceof Error ? err : new Error(String(err))
    console.error('Failed to load OUI data:', loadError)
  } finally {
    loading = false
  }
}

/**
 * Ensure OUI data is loaded (call before any lookup)
 */
export async function ensureOuiLoaded(): Promise<boolean> {
  if (ouiData === null && !loading) {
    await loadOuiData()
  }
  return ouiData !== null
}

/**
 * Check if OUI data is currently loaded
 */
export function isOuiLoaded(): boolean {
  return ouiData !== null
}

/**
 * Check if OUI data is currently loading
 */
export function isOuiLoading(): boolean {
  return loading
}

/**
 * Get any load error
 */
export function getOuiLoadError(): Error | null {
  return loadError
}

/**
 * Get vendor name from MAC address
 *
 * @param mac - MAC address in any format (colon, dash, or raw hex)
 * @returns Vendor name or null if not found/invalid
 *
 * @example
 * getVendorFromMac('00:1B:66:04:0A:80') // 'SENNHEISER ELECTRONIC GMBH & CO. KG'
 * getVendorFromMac('00-00-0C-12-34-56') // 'CISCO SYSTEMS, INC'
 * getVendorFromMac('001122334455')      // vendor for OUI 001122
 */
export function getVendorFromMac(mac: string | null | undefined): string | null {
  if (!mac || !ouiData) return null

  const oui = extractOui(mac)
  if (!oui) return null

  return ouiData[oui] ?? null
}

/**
 * Synchronous vendor lookup - returns null if data not loaded
 * Use this in render functions, call ensureOuiLoaded() in useEffect
 */
export function getVendorSync(mac: string | null | undefined): string | null {
  return getVendorFromMac(mac)
}

/**
 * Search vendors by partial name match (case-insensitive)
 *
 * @param query - Search string
 * @param limit - Maximum results (default 100)
 * @returns Array of matching {oui, vendor} pairs
 *
 * @example
 * searchVendors('apple') // [{oui: '000393', vendor: 'APPLE, INC.'}, ...]
 */
export function searchVendors(
  query: string,
  limit = 100
): Array<{ oui: string; vendor: string }> {
  if (!query || !ouiData) return []

  const searchLower = query.toLowerCase().trim()
  if (!searchLower) return []

  const results: Array<{ oui: string; vendor: string }> = []

  for (const [oui, vendor] of Object.entries(ouiData)) {
    if (vendor.toLowerCase().includes(searchLower)) {
      results.push({ oui, vendor })
      if (results.length >= limit) break
    }
  }

  return results
}

/**
 * Get all OUI prefixes for an exact vendor name match
 *
 * @param vendor - Exact vendor name (case-insensitive)
 * @returns Array of OUI prefixes
 *
 * @example
 * getOuisForVendor('APPLE, INC.') // ['000393', '000502', '0010FA', ...]
 */
export function getOuisForVendor(vendor: string): string[] {
  if (!vendor || !reverseIndex) return []

  return reverseIndex.get(vendor.toLowerCase()) ?? []
}

/**
 * Get all unique vendor names (for autocomplete)
 *
 * @param limit - Maximum results
 * @returns Array of unique vendor names
 */
export function getAllVendors(limit = 1000): string[] {
  if (!reverseIndex) return []

  const vendors: string[] = []
  for (const key of reverseIndex.keys()) {
    // Return original casing from first OUI entry
    const ouis = reverseIndex.get(key)
    if (ouis && ouis.length > 0 && ouiData) {
      vendors.push(ouiData[ouis[0]])
    }
    if (vendors.length >= limit) break
  }

  return vendors
}

/**
 * Check if a MAC prefix matches any of the given OUI prefixes
 * Useful for filtering hosts by vendor
 *
 * @param mac - MAC address to check
 * @param ouiPrefixes - Array of 6-char OUI prefixes (uppercase)
 * @returns true if MAC matches any prefix
 */
export function macMatchesOuis(
  mac: string | null | undefined,
  ouiPrefixes: string[]
): boolean {
  if (!mac || ouiPrefixes.length === 0) return false

  const oui = extractOui(mac)
  if (!oui) return false

  return ouiPrefixes.includes(oui)
}

/**
 * Get OUI count (for stats)
 */
export function getOuiCount(): number {
  return ouiData ? Object.keys(ouiData).length : 0
}

/**
 * Format OUI for display (XX:XX:XX)
 */
export function formatOui(oui: string): string {
  if (!oui || oui.length !== 6) return oui
  return `${oui.substring(0, 2)}:${oui.substring(2, 4)}:${oui.substring(4, 6)}`
}
