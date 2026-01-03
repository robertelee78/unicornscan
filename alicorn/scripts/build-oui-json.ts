#!/usr/bin/env npx tsx
/**
 * OUI Database Builder
 * Converts IEEE OUI text file to optimized JSON for frontend bundling
 *
 * Input: /opt/unicornscan/etc/oui.txt (format: XX-XX-XX:Vendor Name)
 * Output: src/data/oui-data.json (format: {"XXXXXX": "Vendor Name", ...})
 *
 * Usage: npx tsx scripts/build-oui-json.ts
 *
 * To update OUI database from IEEE source, download from
 * standards-oui.ieee.org/oui/oui.txt and convert format.
 *
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const OUI_SOURCE = '/opt/unicornscan/etc/oui.txt'
const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'data')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'oui-data.json')

interface OuiEntry {
  oui: string
  vendor: string
}

function parseOuiFile(filePath: string): OuiEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')
  const entries: OuiEntry[] = []

  for (const line of lines) {
    // Skip empty lines and comments
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // Format: XX-XX-XX:Vendor Name
    const colonIndex = trimmed.indexOf(':')
    if (colonIndex === -1) continue

    const ouiPart = trimmed.substring(0, colonIndex).trim()
    const vendor = trimmed.substring(colonIndex + 1).trim()

    // Validate OUI format (XX-XX-XX)
    if (!/^[0-9A-Fa-f]{2}-[0-9A-Fa-f]{2}-[0-9A-Fa-f]{2}$/.test(ouiPart)) {
      continue
    }

    // Normalize OUI: remove dashes, uppercase
    const oui = ouiPart.replace(/-/g, '').toUpperCase()

    if (vendor) {
      entries.push({ oui, vendor })
    }
  }

  return entries
}

function buildOuiMap(entries: OuiEntry[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const { oui, vendor } of entries) {
    map[oui] = vendor
  }
  return map
}

function main() {
  console.log('OUI Database Builder')
  console.log('====================')
  console.log('Source:', OUI_SOURCE)
  console.log('Output:', OUTPUT_FILE)
  console.log('')

  // Check source file exists
  if (!fs.existsSync(OUI_SOURCE)) {
    console.error('Error: Source file not found:', OUI_SOURCE)
    process.exit(1)
  }

  // Parse OUI file
  console.log('Parsing OUI database...')
  const entries = parseOuiFile(OUI_SOURCE)
  console.log('Found', entries.length, 'OUI entries')

  // Build map
  const ouiMap = buildOuiMap(entries)

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
    console.log('Created directory:', OUTPUT_DIR)
  }

  // Write JSON
  const json = JSON.stringify(ouiMap, null, 0) // Compact format
  fs.writeFileSync(OUTPUT_FILE, json, 'utf-8')

  // Stats
  const stats = fs.statSync(OUTPUT_FILE)
  const sizeKb = (stats.size / 1024).toFixed(1)
  console.log('')
  console.log('Output written:', OUTPUT_FILE)
  console.log('Size:', sizeKb, 'KB (' + stats.size + ' bytes)')
  console.log('Entries:', Object.keys(ouiMap).length)

  // Sample output
  console.log('')
  console.log('Sample entries:')
  const sampleKeys = Object.keys(ouiMap).slice(0, 5)
  for (const key of sampleKeys) {
    console.log('  ' + key + ': ' + ouiMap[key])
  }

  // Verify some known OUIs
  console.log('')
  console.log('Verification:')
  const tests = [
    { oui: '000000', expected: 'XEROX' },
    { oui: '00000C', expected: 'CISCO' },
    { oui: '001B66', expected: 'SENNHEISER' },
  ]
  for (const test of tests) {
    const vendor = ouiMap[test.oui] || 'NOT FOUND'
    const ok = vendor.toUpperCase().includes(test.expected) ? 'OK' : 'FAIL'
    console.log('  [' + ok + '] ' + test.oui + ': ' + vendor)
  }

  console.log('')
  console.log('Done!')
}

main()
