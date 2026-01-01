/**
 * Unit tests for src/lib/errors.ts
 * Tests error parsing and friendly error generation
 */

import { describe, it, expect } from 'vitest'
import { parseError, isNetworkError, canRetryError } from '@/lib/errors'

describe('parseError', () => {
  describe('null/undefined handling', () => {
    it('returns default error for null', () => {
      const result = parseError(null)
      expect(result.title).toBe('Unknown Error')
      expect(result.message).toBe('An unexpected error occurred.')
      expect(result.canRetry).toBe(true)
    })

    it('returns default error for undefined', () => {
      const result = parseError(undefined)
      expect(result.title).toBe('Unknown Error')
      expect(result.canRetry).toBe(true)
    })
  })

  describe('Error object handling', () => {
    it('extracts message from Error objects', () => {
      const error = new Error('Something went wrong')
      const result = parseError(error)
      expect(result.message).toContain('Something went wrong')
    })

    it('extracts code from Error objects when present', () => {
      const error = new Error('Network failed') as Error & { code: string }
      error.code = 'ERR_NETWORK'
      const result = parseError(error)
      expect(result.code).toBe('ERR_NETWORK')
    })
  })

  describe('string handling', () => {
    it('parses plain string errors', () => {
      const result = parseError('Something broke')
      expect(result.message).toContain('Something broke')
    })
  })

  describe('object handling', () => {
    it('extracts message property from objects', () => {
      const result = parseError({ message: 'Object error message' })
      expect(result.message).toContain('Object error message')
    })

    it('extracts error property from objects', () => {
      const result = parseError({ error: 'Object error property' })
      expect(result.message).toContain('Object error property')
    })

    it('extracts code from objects', () => {
      const result = parseError({ message: 'Error', code: 'ERR_123' })
      expect(result.code).toBe('ERR_123')
    })

    it('stringifies objects without message property', () => {
      const result = parseError({ foo: 'bar', count: 42 })
      expect(result.message).toBeDefined()
    })
  })

  describe('network error patterns', () => {
    it('detects fetch errors', () => {
      const result = parseError(new Error('Failed to fetch'))
      expect(result.title).toBe('Connection Error')
      expect(result.canRetry).toBe(true)
    })

    it('detects network errors', () => {
      const result = parseError(new Error('Network error occurred'))
      expect(result.title).toBe('Connection Error')
    })

    it('detects ERR_NETWORK code', () => {
      const error = new Error('error') as Error & { code: string }
      error.code = 'ERR_NETWORK'
      const result = parseError(error)
      expect(result.title).toBe('Connection Error')
    })

    it('detects ERR_INTERNET_DISCONNECTED', () => {
      const result = parseError(new Error('ERR_INTERNET_DISCONNECTED'))
      expect(result.title).toBe('Connection Error')
    })
  })

  describe('timeout error patterns', () => {
    it('detects timeout errors', () => {
      const result = parseError(new Error('Request timeout'))
      expect(result.title).toBe('Request Timeout')
      expect(result.canRetry).toBe(true)
    })

    it('detects ETIMEDOUT code', () => {
      const error = new Error('error') as Error & { code: string }
      error.code = 'ETIMEDOUT'
      const result = parseError(error)
      expect(result.title).toBe('Request Timeout')
    })

    it('detects ECONNRESET', () => {
      const result = parseError(new Error('ECONNRESET'))
      expect(result.title).toBe('Request Timeout')
    })
  })

  describe('connection refused patterns', () => {
    it('detects ECONNREFUSED', () => {
      const result = parseError(new Error('connect ECONNREFUSED'))
      expect(result.title).toBe('Server Unavailable')
      expect(result.canRetry).toBe(true)
    })
  })

  describe('database error patterns', () => {
    it('detects missing table errors', () => {
      const result = parseError(new Error('relation "scans" does not exist'))
      expect(result.title).toBe('Database Schema Error')
      expect(result.canRetry).toBe(false)
    })

    it('detects permission errors', () => {
      const result = parseError(new Error('permission denied for table'))
      expect(result.title).toBe('Access Denied')
      expect(result.canRetry).toBe(false)
    })

    it('detects duplicate key errors', () => {
      const result = parseError(new Error('duplicate key value violates unique constraint'))
      expect(result.title).toBe('Duplicate Entry')
      expect(result.canRetry).toBe(false)
    })

    it('detects foreign key violations', () => {
      const result = parseError(new Error('violates foreign key constraint'))
      expect(result.title).toBe('Reference Error')
      expect(result.canRetry).toBe(false)
    })

    it('detects null constraint violations', () => {
      const result = parseError(new Error('null value in column violates not-null constraint'))
      expect(result.title).toBe('Missing Required Data')
      expect(result.canRetry).toBe(false)
    })
  })

  describe('authentication error patterns', () => {
    it('detects JWT errors', () => {
      const result = parseError(new Error('JWT expired'))
      expect(result.title).toBe('Session Expired')
      expect(result.canRetry).toBe(true)
    })

    it('detects token expired errors', () => {
      const result = parseError(new Error('token has expired'))
      expect(result.title).toBe('Session Expired')
    })

    it('detects invalid token errors', () => {
      const result = parseError(new Error('invalid token provided'))
      expect(result.title).toBe('Session Expired')
    })
  })

  describe('rate limiting patterns', () => {
    it('detects rate limit errors', () => {
      const result = parseError(new Error('rate limit exceeded'))
      expect(result.title).toBe('Rate Limited')
      expect(result.canRetry).toBe(true)
    })

    it('detects 429 errors', () => {
      const result = parseError(new Error('429 Too Many Requests'))
      expect(result.title).toBe('Rate Limited')
    })
  })

  describe('HTTP error patterns', () => {
    it('detects 404 errors', () => {
      const result = parseError(new Error('404 Not Found'))
      expect(result.title).toBe('Not Found')
      expect(result.canRetry).toBe(false)
    })

    it('detects 500 errors', () => {
      const result = parseError(new Error('500 Internal Server Error'))
      expect(result.title).toBe('Server Error')
      expect(result.canRetry).toBe(true)
    })

    it('detects 502 errors', () => {
      const result = parseError(new Error('502 Bad Gateway'))
      expect(result.title).toBe('Gateway Error')
      expect(result.canRetry).toBe(true)
    })

    it('detects 503 errors', () => {
      const result = parseError(new Error('503 Service Unavailable'))
      expect(result.title).toBe('Service Unavailable')
      expect(result.canRetry).toBe(true)
    })
  })

  describe('PostgREST patterns', () => {
    it('detects PGRST errors', () => {
      const result = parseError(new Error('PGRST116: No rows found'))
      expect(result.title).toBe('API Error')
    })
  })

  describe('message sanitization', () => {
    it('removes SQL position details', () => {
      const result = parseError(new Error('error at position 123'))
      expect(result.message).not.toContain('position 123')
    })

    it('removes SQL LINE details', () => {
      const result = parseError(new Error('LINE 1: SELECT * FROM'))
      expect(result.message).not.toContain('LINE 1:')
    })

    it('removes column names', () => {
      const result = parseError(new Error('column "password_hash" invalid'))
      expect(result.message).not.toContain('password_hash')
      // After sanitization + capitalization, becomes "A field"
      expect(result.message.toLowerCase()).toContain('a field')
    })

    it('removes relation names', () => {
      const result = parseError(new Error('relation "users" error'))
      expect(result.message).not.toContain('"users"')
      // After sanitization + capitalization, becomes "A table"
      expect(result.message.toLowerCase()).toContain('a table')
    })

    it('removes postgres URLs', () => {
      const result = parseError(new Error('connection to postgres://user:pass@host/db failed'))
      expect(result.message).not.toContain('user:pass')
      expect(result.message).toContain('[database]')
    })

    it('removes HTTP URLs', () => {
      // Note: "fetch" triggers the network error pattern, so use different wording
      const result = parseError(new Error('request to https://api.example.com/secret failed'))
      expect(result.message).not.toContain('api.example.com')
      expect(result.message).toContain('[url]')
    })

    it('truncates very long messages', () => {
      const longMessage = 'a'.repeat(300)
      const result = parseError(new Error(longMessage))
      expect(result.message.length).toBeLessThanOrEqual(200)
      expect(result.message).toContain('...')
    })

    it('capitalizes first letter', () => {
      const result = parseError(new Error('lowercase error'))
      expect(result.message.charAt(0)).toBe('L')
    })
  })

  describe('return type compliance', () => {
    it('always returns FriendlyError shape', () => {
      const scenarios: unknown[] = [
        null,
        undefined,
        'string',
        new Error('error'),
        { message: 'obj' },
        42,
        [],
        true,
      ]

      scenarios.forEach((input) => {
        const result = parseError(input)
        expect(result).toHaveProperty('title')
        expect(result).toHaveProperty('message')
        expect(result).toHaveProperty('canRetry')
        expect(typeof result.title).toBe('string')
        expect(typeof result.message).toBe('string')
        expect(typeof result.canRetry).toBe('boolean')
      })
    })
  })
})

describe('isNetworkError', () => {
  it('returns true for connection errors', () => {
    expect(isNetworkError(new Error('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new Error('network error'))).toBe(true)
  })

  it('returns true for timeout errors', () => {
    expect(isNetworkError(new Error('Request timeout'))).toBe(true)
    expect(isNetworkError(new Error('ETIMEDOUT'))).toBe(true)
  })

  it('returns false for non-network errors', () => {
    expect(isNetworkError(new Error('Not found'))).toBe(false)
    expect(isNetworkError(new Error('permission denied'))).toBe(false)
    expect(isNetworkError(new Error('duplicate key'))).toBe(false)
  })

  it('returns false for null/undefined', () => {
    expect(isNetworkError(null)).toBe(false)
    expect(isNetworkError(undefined)).toBe(false)
  })
})

describe('canRetryError', () => {
  it('returns true for retryable errors', () => {
    expect(canRetryError(new Error('Failed to fetch'))).toBe(true)
    expect(canRetryError(new Error('timeout'))).toBe(true)
    expect(canRetryError(new Error('rate limit'))).toBe(true)
    expect(canRetryError(new Error('500 error'))).toBe(true)
    expect(canRetryError(new Error('ECONNREFUSED'))).toBe(true)
  })

  it('returns false for non-retryable errors', () => {
    expect(canRetryError(new Error('permission denied'))).toBe(false)
    expect(canRetryError(new Error('404 Not Found'))).toBe(false)
    expect(canRetryError(new Error('duplicate key'))).toBe(false)
    expect(canRetryError(new Error('foreign key violation'))).toBe(false)
  })

  it('returns true for unknown errors (safe default)', () => {
    expect(canRetryError(new Error('some random error'))).toBe(true)
    expect(canRetryError(null)).toBe(true)
    expect(canRetryError(undefined)).toBe(true)
  })
})
