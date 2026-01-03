/**
 * Banner display utility tests
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { describe, it, expect } from 'vitest'
import {
  truncateBanner,
  bannerNeedsExpansion,
  BANNER_PREVIEW_LENGTH,
} from '../../src/features/ports/port-utils'

describe('Banner Display Utilities', () => {
  describe('BANNER_PREVIEW_LENGTH', () => {
    it('should be 40 characters', () => {
      expect(BANNER_PREVIEW_LENGTH).toBe(40)
    })
  })

  describe('truncateBanner', () => {
    it('should return short banners unchanged', () => {
      const banner = 'SSH-2.0-OpenSSH_8.9'
      expect(truncateBanner(banner)).toBe(banner)
    })

    it('should truncate long banners with ellipsis', () => {
      // First line is only 15 chars, so no truncation needed
      const banner = 'HTTP/1.1 200 OK\r\nServer: nginx/1.18.0 (Ubuntu)\r\nContent-Type: text/html'
      const result = truncateBanner(banner)
      expect(result).toBe('HTTP/1.1 200 OK') // First line only, no truncation

      // Test with a long first line
      const longBanner = 'This is a very long banner that exceeds forty characters easily and should be truncated'
      const longResult = truncateBanner(longBanner)
      expect(longResult.length).toBe(41) // 40 chars + ellipsis
      expect(longResult.endsWith('…')).toBe(true)
    })

    it('should only return the first line', () => {
      const banner = 'SSH-2.0-OpenSSH_8.9\nProtocol version'
      expect(truncateBanner(banner)).toBe('SSH-2.0-OpenSSH_8.9')
    })

    it('should handle empty banners', () => {
      expect(truncateBanner('')).toBe('')
    })

    it('should respect custom maxLength parameter', () => {
      const banner = 'Hello World This is a test'
      expect(truncateBanner(banner, 10)).toBe('Hello Worl…')
    })

    it('should not add ellipsis if exactly at maxLength', () => {
      const banner = 'a'.repeat(40)
      expect(truncateBanner(banner)).toBe(banner)
      expect(truncateBanner(banner).length).toBe(40)
    })

    it('should handle banners with only newlines', () => {
      const banner = '\n\n\n'
      expect(truncateBanner(banner)).toBe('')
    })

    it('should handle multiline banners correctly', () => {
      const banner = 'HTTP/1.1 200 OK\nServer: Apache\nContent-Type: text/html'
      expect(truncateBanner(banner)).toBe('HTTP/1.1 200 OK')
    })
  })

  describe('bannerNeedsExpansion', () => {
    it('should return false for short single-line banners', () => {
      const banner = 'SSH-2.0-OpenSSH'
      expect(bannerNeedsExpansion(banner)).toBe(false)
    })

    it('should return true for banners with newlines', () => {
      const banner = 'HTTP/1.1 200 OK\nServer: nginx'
      expect(bannerNeedsExpansion(banner)).toBe(true)
    })

    it('should return true for long single-line banners', () => {
      const banner = 'a'.repeat(50)
      expect(bannerNeedsExpansion(banner)).toBe(true)
    })

    it('should return false for exactly 40 char banners', () => {
      const banner = 'a'.repeat(40)
      expect(bannerNeedsExpansion(banner)).toBe(false)
    })

    it('should return true for 41+ char banners', () => {
      const banner = 'a'.repeat(41)
      expect(bannerNeedsExpansion(banner)).toBe(true)
    })

    it('should handle empty banners', () => {
      expect(bannerNeedsExpansion('')).toBe(false)
    })

    it('should return true for short banner with newline', () => {
      const banner = 'Short\n'
      expect(bannerNeedsExpansion(banner)).toBe(true)
    })
  })

  describe('Real-world banner examples', () => {
    it('should handle HTTP response banner', () => {
      const banner = 'HTTP/1.1 200 OK\r\nServer: Apache/2.4.41 (Ubuntu)\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n<!DOCTYPE html>'
      expect(bannerNeedsExpansion(banner)).toBe(true)
      expect(truncateBanner(banner)).toBe('HTTP/1.1 200 OK')
    })

    it('should handle SSH banner', () => {
      const banner = 'SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.1'
      expect(truncateBanner(banner)).toBe('SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.1')
      expect(bannerNeedsExpansion(banner)).toBe(false) // 39 chars, under 40 limit
      expect(banner.length).toBe(39)
    })

    it('should handle short SSH banner', () => {
      const banner = 'SSH-2.0-OpenSSH_8.9'
      expect(truncateBanner(banner)).toBe('SSH-2.0-OpenSSH_8.9')
      expect(bannerNeedsExpansion(banner)).toBe(false) // 19 chars
    })

    it('should handle SMTP banner', () => {
      const banner = '220 mail.example.com ESMTP Postfix'
      expect(truncateBanner(banner)).toBe('220 mail.example.com ESMTP Postfix')
      expect(bannerNeedsExpansion(banner)).toBe(false) // 34 chars
    })

    it('should handle FTP banner', () => {
      const banner = '220 (vsFTPd 3.0.3)\r\n230 Login successful.'
      expect(truncateBanner(banner)).toBe('220 (vsFTPd 3.0.3)')
      expect(bannerNeedsExpansion(banner)).toBe(true)
    })

    it('should handle MySQL banner with binary prefix', () => {
      const banner = '\\x4a\\x00\\x00\\x00\\x0a5.7.42-0ubuntu0.18.04.1'
      expect(bannerNeedsExpansion(banner)).toBe(true)
    })
  })
})
