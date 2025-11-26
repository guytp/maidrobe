/**
 * Debounce hook for delaying value updates.
 *
 * Used primarily for search input to avoid triggering API requests
 * on every keystroke. Delays updating the output value until the
 * input value has been stable for the specified delay.
 *
 * @module features/wardrobe/hooks/useDebounce
 */

import { useEffect, useState } from 'react';

/**
 * Debounces a value by delaying updates until the value is stable.
 *
 * Returns the debounced value which only updates after the input
 * value has not changed for the specified delay period.
 *
 * @param value - The value to debounce
 * @param delayMs - Delay in milliseconds before updating
 * @returns The debounced value
 *
 * @example
 * ```tsx
 * const [searchQuery, setSearchQuery] = useState('');
 * const debouncedSearch = useDebounce(searchQuery, 300);
 *
 * // debouncedSearch updates 300ms after searchQuery stops changing
 * useEffect(() => {
 *   fetchResults(debouncedSearch);
 * }, [debouncedSearch]);
 * ```
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up timer to update debounced value after delay
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    // Clean up timer if value changes before delay completes
    // This effectively "resets" the debounce timer
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
