/**
 * Error message parsing and friendly error display
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

// =============================================================================
// Error Types
// =============================================================================

export interface FriendlyError {
  title: string
  message: string
  code?: string
  canRetry: boolean
}

// =============================================================================
// Error Patterns
// =============================================================================

const ERROR_PATTERNS: Array<{
  pattern: RegExp | string
  title: string
  message: string
  canRetry: boolean
}> = [
  // Network errors
  {
    pattern: /fetch|network|ERR_NETWORK|ERR_INTERNET_DISCONNECTED/i,
    title: 'Connection Error',
    message: 'Unable to reach the server. Check your internet connection and try again.',
    canRetry: true,
  },
  {
    pattern: /timeout|ETIMEDOUT|ECONNRESET/i,
    title: 'Request Timeout',
    message: 'The server took too long to respond. Please try again.',
    canRetry: true,
  },
  {
    pattern: /ECONNREFUSED/i,
    title: 'Server Unavailable',
    message: 'Cannot connect to the database server. Ensure the server is running.',
    canRetry: true,
  },

  // Database errors
  {
    pattern: /relation.*does not exist|undefined table/i,
    title: 'Database Schema Error',
    message: 'Required database tables are missing. Run the schema migration.',
    canRetry: false,
  },
  {
    pattern: /permission denied|access denied|unauthorized/i,
    title: 'Access Denied',
    message: 'You don\'t have permission to access this resource.',
    canRetry: false,
  },
  {
    pattern: /duplicate key|unique.*violation|already exists/i,
    title: 'Duplicate Entry',
    message: 'This record already exists. Try updating instead.',
    canRetry: false,
  },
  {
    pattern: /foreign key.*violation|violates foreign key/i,
    title: 'Reference Error',
    message: 'This record references data that doesn\'t exist or cannot be removed.',
    canRetry: false,
  },
  {
    pattern: /null value|not-null constraint|cannot be null/i,
    title: 'Missing Required Data',
    message: 'Some required fields are missing. Please check your input.',
    canRetry: false,
  },

  // Supabase/PostgREST specific
  {
    pattern: /JWT|token.*expired|invalid.*token/i,
    title: 'Session Expired',
    message: 'Your session has expired. Please refresh the page.',
    canRetry: true,
  },
  {
    pattern: /rate limit|too many requests|429/i,
    title: 'Rate Limited',
    message: 'Too many requests. Please wait a moment and try again.',
    canRetry: true,
  },
  {
    pattern: /PGRST/i,
    title: 'API Error',
    message: 'The database API returned an error. Check the server configuration.',
    canRetry: true,
  },

  // HTTP errors
  {
    pattern: /404|not found/i,
    title: 'Not Found',
    message: 'The requested resource could not be found.',
    canRetry: false,
  },
  {
    pattern: /500|internal server error/i,
    title: 'Server Error',
    message: 'The server encountered an unexpected error. Please try again later.',
    canRetry: true,
  },
  {
    pattern: /502|bad gateway/i,
    title: 'Gateway Error',
    message: 'The server is temporarily unavailable. Please try again.',
    canRetry: true,
  },
  {
    pattern: /503|service unavailable/i,
    title: 'Service Unavailable',
    message: 'The service is temporarily unavailable. Please try again later.',
    canRetry: true,
  },
]

// =============================================================================
// Parser
// =============================================================================

/**
 * Parse a raw error into a user-friendly message
 */
export function parseError(error: unknown): FriendlyError {
  // Handle null/undefined
  if (!error) {
    return {
      title: 'Unknown Error',
      message: 'An unexpected error occurred.',
      canRetry: true,
    }
  }

  // Extract error message
  let errorMessage = ''
  let errorCode: string | undefined

  if (error instanceof Error) {
    errorMessage = error.message
    // Check for code property (common in fetch errors)
    if ('code' in error && typeof error.code === 'string') {
      errorCode = error.code
    }
  } else if (typeof error === 'string') {
    errorMessage = error
  } else if (typeof error === 'object') {
    // Handle Supabase/PostgREST error objects
    const obj = error as Record<string, unknown>
    errorMessage = String(obj.message || obj.error || obj.details || JSON.stringify(error))
    if (obj.code) {
      errorCode = String(obj.code)
    }
  } else {
    errorMessage = String(error)
  }

  // Match against known patterns
  for (const { pattern, title, message, canRetry } of ERROR_PATTERNS) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern
    if (regex.test(errorMessage) || (errorCode && regex.test(errorCode))) {
      return { title, message, code: errorCode, canRetry }
    }
  }

  // Default: sanitize and return
  return {
    title: 'Error',
    message: sanitizeErrorMessage(errorMessage),
    code: errorCode,
    canRetry: true,
  }
}

/**
 * Sanitize error message to remove sensitive information
 */
function sanitizeErrorMessage(message: string): string {
  // Remove SQL details
  let sanitized = message
    .replace(/at position \d+/gi, '')
    .replace(/LINE \d+:/gi, '')
    .replace(/column "[^"]+"/gi, 'a field')
    .replace(/relation "[^"]+"/gi, 'a table')
    .replace(/\bpg_\w+/gi, '[internal]')
    .replace(/postgres:\/\/[^\s]+/gi, '[database]')
    .replace(/http[s]?:\/\/[^\s]+/gi, '[url]')
    .trim()

  // Truncate very long messages
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 197) + '...'
  }

  // Ensure first letter is capitalized
  if (sanitized.length > 0) {
    sanitized = sanitized.charAt(0).toUpperCase() + sanitized.slice(1)
  }

  return sanitized || 'An unexpected error occurred.'
}

/**
 * Check if an error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  const parsed = parseError(error)
  return parsed.title === 'Connection Error' || parsed.title === 'Request Timeout'
}

/**
 * Check if an error can be retried
 */
export function canRetryError(error: unknown): boolean {
  return parseError(error).canRetry
}
