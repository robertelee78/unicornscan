/**
 * Download utilities
 * Functions for triggering file downloads and creating ZIP archives
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { saveAs } from 'file-saver'
import type { ExportFormat } from './types'

// =============================================================================
// MIME Types
// =============================================================================

const MIME_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv;charset=utf-8',
  json: 'application/json;charset=utf-8',
  pdf: 'application/pdf',
}

const FILE_EXTENSIONS: Record<ExportFormat, string> = {
  csv: '.csv',
  json: '.json',
  pdf: '.pdf',
}

// =============================================================================
// Download Functions
// =============================================================================

/**
 * Download a string as a file
 */
export function downloadString(content: string, filename: string, format: ExportFormat): void {
  const blob = new Blob([content], { type: MIME_TYPES[format] })
  saveAs(blob, filename)
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  saveAs(blob, filename)
}

/**
 * Generate a timestamped filename
 */
export function generateFilename(prefix: string, format: ExportFormat, suffix?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const parts = [prefix, timestamp]
  if (suffix) parts.push(suffix)
  return parts.join('-') + FILE_EXTENSIONS[format]
}

/**
 * Generate a filename for scan export
 */
export function scanFilename(scan_id: number, format: ExportFormat): string {
  return generateFilename(`scan-${scan_id}`, format)
}

/**
 * Generate a filename for host export
 */
export function hostFilename(ipAddr: string, format: ExportFormat): string {
  // Replace dots with dashes for filename compatibility
  const safeIp = ipAddr.replace(/\./g, '-')
  return generateFilename(`host-${safeIp}`, format)
}

/**
 * Generate a filename for bulk export
 */
export function bulkFilename(entityType: 'scans' | 'hosts', format: ExportFormat): string {
  return generateFilename(`${entityType}-export`, format)
}

// =============================================================================
// ZIP Archive Creation (for individual file exports)
// =============================================================================

interface ZipFileEntry {
  filename: string
  content: string | Blob
}

/**
 * Create a ZIP archive containing multiple files
 * Uses JSZip library loaded dynamically
 */
export async function createZipArchive(files: ZipFileEntry[], archiveName: string): Promise<void> {
  // Dynamic import of JSZip to avoid bundle bloat when not needed
  const JSZip = (await import('jszip')).default

  const zip = new JSZip()

  for (const file of files) {
    if (typeof file.content === 'string') {
      zip.file(file.filename, file.content)
    } else {
      zip.file(file.filename, file.content)
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  saveAs(blob, archiveName)
}

/**
 * Create individual file exports and bundle into ZIP
 */
export async function exportAsIndividualFiles(
  items: Array<{ id: string; content: string | Blob; format: ExportFormat }>,
  archiveName: string
): Promise<void> {
  const files: ZipFileEntry[] = items.map((item) => ({
    filename: `${item.id}${FILE_EXTENSIONS[item.format]}`,
    content: item.content,
  }))

  await createZipArchive(files, archiveName)
}
