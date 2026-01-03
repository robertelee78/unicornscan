/**
 * Debounce hook for delayed value updates
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useEffect } from 'react'

/**
 * Debounce a value by the specified delay.
 * Returns the debounced value that only updates after
 * the delay has passed without the input changing.
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 * @returns The debounced value
 *
 * @example
 * const [search, setSearch] = useState('')
 * const debouncedSearch = useDebounce(search, 300)
 *
 * // debouncedSearch only updates 300ms after user stops typing
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
