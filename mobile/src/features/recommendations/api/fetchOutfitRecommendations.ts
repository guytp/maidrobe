/**
 * API function for fetching outfit recommendations via Edge Function.
 *
 * This function invokes the 'get-outfit-recommendations' Supabase Edge Function
 * which handles:
 * - JWT authentication and user ID extraction
 * - Generating outfit suggestions (stubbed in v1)
 * - Structured logging with correlation IDs
 *
 * OBSERVABILITY:
 * - Generates correlation ID for request tracing
 * - Correlation ID included in X-Correlation-ID header
 * - All backend logs include correlation ID for debugging
 * - Client-side telemetry via logError and addBreadcrumb
 *
 * ERROR CLASSIFICATION:
 * - auth: Not authenticated or token expired
 * - network: Network connectivity issues
 * - server: Backend processing errors (5xx)
 * - schema: Response validation failed
 * - unknown: Unexpected errors
 *
 * @module features/recommendations/api/fetchOutfitRecommendations
 */

import { supabase } from '../../../services/supabase';
import { generateCorrelationId, getCorrelationHeaders } from '../../../core/utils/correlationId';
import { logError, logSuccess, type ErrorClassification } from '../../../core/telemetry';
import { parseOutfitRecommendationsResponse, type OutfitRecommendationsResponse } from '../types';

/**
 * Error codes for recommendation fetch operation.
 *
 * Used for error classification and appropriate UI feedback.
 */
export type FetchRecommendationsErrorCode = 'auth' | 'network' | 'server' | 'schema' | 'unknown';

/**
 * Custom error class for recommendation fetch failures.
 *
 * Provides structured error information with classification code
 * for appropriate error handling in the UI layer.
 */
export class FetchRecommendationsError extends Error {
  constructor(
    message: string,
    public readonly code: FetchRecommendationsErrorCode,
    public readonly correlationId: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'FetchRecommendationsError';
  }
}

/**
 * Maps error code to telemetry classification.
 */
function toErrorClassification(code: FetchRecommendationsErrorCode): ErrorClassification {
  switch (code) {
    case 'auth':
      return 'user';
    case 'network':
      return 'network';
    case 'server':
      return 'server';
    case 'schema':
      return 'schema';
    case 'unknown':
    default:
      return 'server';
  }
}

/**
 * Checks if an error message indicates a network-related issue.
 */
function isNetworkError(message: string | undefined): boolean {
  if (!message) return false;
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('network') ||
    lowerMessage.includes('fetch') ||
    lowerMessage.includes('failed to fetch') ||
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('connection') ||
    lowerMessage.includes('offline')
  );
}

/**
 * Checks if an error message indicates an authentication issue.
 */
function isAuthError(message: string | undefined): boolean {
  if (!message) return false;
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('auth') ||
    lowerMessage.includes('401') ||
    lowerMessage.includes('403') ||
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('unauthenticated')
  );
}

/**
 * Checks if an error is an AbortError from an aborted fetch request.
 *
 * AbortError occurs when:
 * - The AbortController.abort() is called
 * - A timeout signal fires
 * - React Query cancels the request (e.g., component unmount)
 */
function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    // Standard AbortError from fetch API
    if (error.name === 'AbortError') {
      return true;
    }
    // Some environments use DOMException with 'AbortError' name
    if (error.name === 'DOMException' && error.message.includes('abort')) {
      return true;
    }
    // Check message for abort-related keywords
    const lowerMessage = error.message.toLowerCase();
    if (lowerMessage.includes('aborted') || lowerMessage.includes('abort')) {
      return true;
    }
  }
  return false;
}

/**
 * Options for fetchOutfitRecommendations.
 */
export interface FetchOutfitRecommendationsOptions {
  /**
   * AbortSignal for request cancellation.
   *
   * When the signal is aborted, the underlying fetch request will be
   * cancelled and a FetchRecommendationsError with code 'network' will
   * be thrown. This allows the request to be cancelled on:
   * - Component unmount (React Query passes signal automatically)
   * - Timeout (via AbortController.abort())
   * - Manual cancellation
   *
   * @example
   * ```typescript
   * const controller = new AbortController();
   *
   * // Set a 5 second timeout
   * const timeoutId = setTimeout(() => controller.abort(), 5000);
   *
   * try {
   *   const response = await fetchOutfitRecommendations({
   *     signal: controller.signal,
   *   });
   *   clearTimeout(timeoutId);
   * } catch (error) {
   *   if (error instanceof FetchRecommendationsError && error.code === 'network') {
   *     // Request was aborted or timed out
   *   }
   * }
   * ```
   */
  signal?: AbortSignal;
}

/**
 * Fetches outfit recommendations from the Edge Function.
 *
 * The Edge Function handles:
 * 1. JWT validation and user ID extraction
 * 2. Generating outfit suggestions (stubbed with 5 static outfits)
 * 3. Structured logging with correlation ID
 *
 * AUTHENTICATION:
 * Requires an active Supabase session. The JWT is automatically
 * included by the Supabase client.
 *
 * CANCELLATION:
 * Supports request cancellation via AbortSignal. When aborted, throws
 * a FetchRecommendationsError with code 'network'. This integrates with
 * React Query's automatic cancellation on component unmount and allows
 * for timeout implementation via AbortController.
 *
 * @param options - Optional configuration including AbortSignal
 * @param options.signal - AbortSignal for request cancellation
 * @returns Promise resolving to OutfitRecommendationsResponse
 * @throws FetchRecommendationsError with appropriate error code
 *
 * @example
 * ```typescript
 * // Basic usage
 * try {
 *   const response = await fetchOutfitRecommendations();
 *   // Display response.outfits in UI
 * } catch (error) {
 *   if (error instanceof FetchRecommendationsError) {
 *     switch (error.code) {
 *       case 'auth':
 *         // Redirect to login
 *         break;
 *       case 'network':
 *         // Show offline state (also covers aborted requests)
 *         break;
 *       case 'schema':
 *         // Log and show generic error
 *         break;
 *       default:
 *         // Show generic error
 *     }
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // With timeout cancellation
 * const controller = new AbortController();
 * const timeoutId = setTimeout(() => controller.abort(), 5000);
 *
 * try {
 *   const response = await fetchOutfitRecommendations({
 *     signal: controller.signal,
 *   });
 *   clearTimeout(timeoutId);
 * } catch (error) {
 *   clearTimeout(timeoutId);
 *   // Handle error
 * }
 * ```
 */
export async function fetchOutfitRecommendations(
  options: FetchOutfitRecommendationsOptions = {}
): Promise<OutfitRecommendationsResponse> {
  const { signal } = options;
  // Generate correlation ID for request tracing
  const correlationId = generateCorrelationId();

  // Check if already aborted before making the request
  if (signal?.aborted) {
    const fetchError = new FetchRecommendationsError(
      'Request was cancelled',
      'network',
      correlationId
    );
    throw fetchError;
  }

  try {
    // Invoke the Edge Function with correlation ID header and abort signal
    const { data, error } = await supabase.functions.invoke<unknown>('get-outfit-recommendations', {
      headers: getCorrelationHeaders(correlationId),
      signal,
    });

    // Handle invocation errors (network issues, function errors, etc.)
    if (error) {
      let code: FetchRecommendationsErrorCode;
      let message: string;

      if (isNetworkError(error.message)) {
        code = 'network';
        message = 'Unable to connect to server. Please check your connection.';
      } else if (isAuthError(error.message)) {
        code = 'auth';
        message = 'Please sign in to get outfit recommendations.';
      } else {
        code = 'server';
        message = 'Unable to load recommendations. Please try again.';
      }

      const fetchError = new FetchRecommendationsError(message, code, correlationId, error);

      logError(fetchError, toErrorClassification(code), {
        feature: 'recommendations',
        operation: 'fetch',
        metadata: {
          correlationId,
          supabaseError: error.message,
        },
      });

      throw fetchError;
    }

    // Handle missing response
    if (!data) {
      const fetchError = new FetchRecommendationsError(
        'No response from server',
        'server',
        correlationId
      );

      logError(fetchError, 'server', {
        feature: 'recommendations',
        operation: 'fetch',
        metadata: { correlationId, reason: 'empty_response' },
      });

      throw fetchError;
    }

    // Validate response against Zod schema
    const parseResult = parseOutfitRecommendationsResponse(data);

    if (!parseResult.success) {
      const fetchError = new FetchRecommendationsError(
        'Received unexpected response format',
        'schema',
        correlationId,
        parseResult.error
      );

      logError(fetchError, 'schema', {
        feature: 'recommendations',
        operation: 'schema_validation',
        metadata: {
          correlationId,
          zodIssues: parseResult.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        },
      });

      throw fetchError;
    }

    // Log success for observability
    logSuccess('recommendations', 'fetch', {
      data: {
        correlationId,
        outfitCount: parseResult.data.outfits.length,
      },
    });

    return parseResult.data;
  } catch (error) {
    // Re-throw FetchRecommendationsError as-is
    if (error instanceof FetchRecommendationsError) {
      throw error;
    }

    // Handle abort errors (from AbortController/signal cancellation)
    if (isAbortError(error)) {
      const fetchError = new FetchRecommendationsError(
        'Request was cancelled',
        'network',
        correlationId,
        error
      );

      // Don't log abort errors as they're intentional cancellations
      // (e.g., component unmount, timeout, user navigation)

      throw fetchError;
    }

    // Handle network errors from fetch
    if (error instanceof TypeError && isNetworkError(error.message)) {
      const fetchError = new FetchRecommendationsError(
        'Unable to connect to server. Please check your connection.',
        'network',
        correlationId,
        error
      );

      logError(fetchError, 'network', {
        feature: 'recommendations',
        operation: 'fetch',
        metadata: { correlationId, typeError: error.message },
      });

      throw fetchError;
    }

    // Unknown error
    const fetchError = new FetchRecommendationsError(
      'An unexpected error occurred',
      'unknown',
      correlationId,
      error
    );

    logError(fetchError, 'server', {
      feature: 'recommendations',
      operation: 'unexpected_error',
      metadata: {
        correlationId,
        errorType: error instanceof Error ? error.name : typeof error,
      },
    });

    throw fetchError;
  }
}
