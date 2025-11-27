/**
 * Correlation ID utilities for request tracing.
 *
 * This module provides client-side correlation ID generation for end-to-end
 * request tracing through the mobile app and backend services.
 *
 * ARCHITECTURE:
 * - Each operation (item creation, deletion, etc.) generates a unique correlation ID
 * - The correlation ID is passed to Edge Functions via X-Correlation-ID header
 * - All backend logs include the correlation ID for debugging and monitoring
 * - If the client doesn't provide a correlation ID, the server generates one
 *
 * USAGE:
 * ```typescript
 * const correlationId = generateCorrelationId();
 *
 * await supabase.functions.invoke('edge-function', {
 *   body: { ... },
 *   headers: getCorrelationHeaders(correlationId),
 * });
 *
 * // Log the correlation ID for client-side debugging
 * console.log(`[Operation] Correlation ID: ${correlationId}`);
 * ```
 *
 * @module core/utils/correlationId
 */

/**
 * Generates a UUID v4 correlation ID.
 *
 * Uses crypto.randomUUID() which is available in React Native 0.64+
 * and provides cryptographically secure random UUIDs.
 *
 * @returns A new UUID v4 correlation ID
 */
export function generateCorrelationId(): string {
  // crypto.randomUUID() is available in React Native via hermes
  // Falls back to a simple implementation if not available
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback implementation for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Creates headers object with correlation ID for Edge Function calls.
 *
 * @param correlationId - The correlation ID to include
 * @returns Headers object with X-Correlation-ID header
 */
export function getCorrelationHeaders(correlationId: string): Record<string, string> {
  return {
    'X-Correlation-ID': correlationId,
  };
}

/**
 * Header name for correlation ID.
 * Exported for consistency across the codebase.
 */
export const CORRELATION_ID_HEADER = 'X-Correlation-ID';
