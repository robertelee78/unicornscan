/**
 * LRU Cache for GeoIP lookups
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import type { LiveGeoIPResult } from './types'

interface CacheEntry {
  result: LiveGeoIPResult
  timestamp: number
  prev: CacheEntry | null
  next: CacheEntry | null
}

/**
 * LRU (Least Recently Used) cache for IP lookups
 * Provides O(1) get/set operations with automatic eviction
 */
export class GeoIPCache {
  private map: Map<string, CacheEntry>
  private head: CacheEntry | null = null // Most recently used
  private tail: CacheEntry | null = null // Least recently used
  private readonly maxSize: number
  private readonly ttlMs: number
  private hits: number = 0
  private misses: number = 0

  constructor(maxSize: number = 1000, ttlMs: number = 60000) {
    this.maxSize = maxSize
    this.ttlMs = ttlMs
    this.map = new Map()
  }

  /**
   * Get cached result for IP
   */
  get(ip: string): LiveGeoIPResult | null {
    const entry = this.map.get(ip)

    if (!entry) {
      this.misses++
      return null
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.delete(ip)
      this.misses++
      return null
    }

    // Move to head (most recently used)
    this.moveToHead(entry)
    this.hits++

    // Return with cached flag
    return { ...entry.result, cached: true }
  }

  /**
   * Store result in cache
   */
  set(ip: string, result: LiveGeoIPResult): void {
    // Check if already exists
    const existing = this.map.get(ip)
    if (existing) {
      existing.result = result
      existing.timestamp = Date.now()
      this.moveToHead(existing)
      return
    }

    // Evict if at capacity
    if (this.map.size >= this.maxSize && this.tail) {
      this.delete(this.getKeyForEntry(this.tail) || '')
    }

    // Create new entry
    const entry: CacheEntry = {
      result,
      timestamp: Date.now(),
      prev: null,
      next: this.head,
    }

    // Add to head
    if (this.head) {
      this.head.prev = entry
    }
    this.head = entry

    if (!this.tail) {
      this.tail = entry
    }

    this.map.set(ip, entry)
  }

  /**
   * Delete entry from cache
   */
  delete(ip: string): boolean {
    const entry = this.map.get(ip)
    if (!entry) return false

    // Update linked list
    if (entry.prev) {
      entry.prev.next = entry.next
    } else {
      this.head = entry.next
    }

    if (entry.next) {
      entry.next.prev = entry.prev
    } else {
      this.tail = entry.prev
    }

    this.map.delete(ip)
    return true
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.map.clear()
    this.head = null
    this.tail = null
    this.hits = 0
    this.misses = 0
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses
    return {
      size: this.map.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    }
  }

  /**
   * Move entry to head of LRU list
   */
  private moveToHead(entry: CacheEntry): void {
    if (entry === this.head) return

    // Remove from current position
    if (entry.prev) {
      entry.prev.next = entry.next
    }
    if (entry.next) {
      entry.next.prev = entry.prev
    }
    if (entry === this.tail) {
      this.tail = entry.prev
    }

    // Insert at head
    entry.prev = null
    entry.next = this.head
    if (this.head) {
      this.head.prev = entry
    }
    this.head = entry

    if (!this.tail) {
      this.tail = entry
    }
  }

  /**
   * Find key for an entry (for eviction)
   */
  private getKeyForEntry(entry: CacheEntry): string | null {
    for (const [key, val] of this.map.entries()) {
      if (val === entry) return key
    }
    return null
  }
}
