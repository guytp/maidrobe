/**
 * API function for deleting a wardrobe item via Edge Function.
 *
 * This function invokes the 'delete-wardrobe-item' Supabase Edge Function
 * which handles:
 * - Ownership verification (auth.uid() must match user_id)
 * - Storage object cleanup (original, clean, thumb images)
 * - Database row deletion (hard delete)
 *
 * IDEMPOTENCY:
 * - If item is already deleted, returns success
 * - Safe to retry failed requests
 *
 * OBSERVABILITY:
 * - Generates correlation ID for request tracing
 * - Correlation ID included in X-Correlation-ID header
 * - All backend logs include correlation ID for debugging
 *
 * ERROR CLASSIFICATION:
 * - auth: Not authenticated or not authorized
 * - network: Network connectivity issues
 * - server: Backend processing errors
 * - notFound: Item doesn't exist (treated as success)
 * - unknown: Unexpected errors
 *
 * @module features/wardrobe/api/deleteWardrobeItem
 */

import { supabase } from '../../../services/supabase';
import { generateCorrelationId, getCorrelationHeaders } from '../../../core/utils/correlationId';

/**
 * Error codes for delete operation.
 *
 * Used for error classification and appropriate UI feedback.
 */
export type DeleteWardrobeItemErrorCode =
  | 'notFound'
  | 'network'
  | 'server'
  | 'auth'
  | 'validation'
  | 'unknown';

/**
 * Custom error class for delete failures.
 *
 * Provides structured error information with classification code
 * for appropriate error handling in the UI layer.
 */
export class DeleteWardrobeItemError extends Error {
  constructor(
    message: string,
    public readonly code: DeleteWardrobeItemErrorCode,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'DeleteWardrobeItemError';
  }
}

/**
 * Parameters for deleteWardrobeItem function.
 */
export interface DeleteWardrobeItemParams {
  /** Item ID to delete */
  itemId: string;
}

/**
 * Response from Edge Function.
 */
interface EdgeFunctionResponse {
  success: boolean;
  error?: string;
  code?: string;
  /** Correlation ID returned for request tracing */
  correlationId?: string;
}

/**
 * Deletes a wardrobe item via the Edge Function.
 *
 * The Edge Function handles:
 * 1. Ownership verification via auth.uid()
 * 2. Storage cleanup (original, clean, thumb images)
 * 3. Database row deletion (hard delete)
 *
 * IDEMPOTENCY:
 * If the item has already been deleted, this function returns successfully.
 * This supports retry scenarios where the first request succeeded but the
 * response was lost.
 *
 * @param params - Parameters including itemId
 * @throws DeleteWardrobeItemError with appropriate error code
 *
 * @example
 * ```typescript
 * try {
 *   await deleteWardrobeItem({ itemId: 'abc-123' });
 *   // Success - navigate back to grid
 * } catch (error) {
 *   if (error instanceof DeleteWardrobeItemError) {
 *     switch (error.code) {
 *       case 'network':
 *         // Show offline error
 *         break;
 *       case 'auth':
 *         // Show permission error
 *         break;
 *       default:
 *         // Show generic error
 *     }
 *   }
 * }
 * ```
 */
export async function deleteWardrobeItem(params: DeleteWardrobeItemParams): Promise<void> {
  const { itemId } = params;

  // Generate correlation ID for request tracing
  const correlationId = generateCorrelationId();

  try {
    // Invoke the Edge Function with correlation ID header
    const { data, error } = await supabase.functions.invoke<EdgeFunctionResponse>(
      'delete-wardrobe-item',
      {
        body: { itemId },
        headers: getCorrelationHeaders(correlationId),
      }
    );

    // Handle invocation errors (network issues, function not found, etc.)
    if (error) {
      // Check for network-related errors
      if (
        error.message?.includes('network') ||
        error.message?.includes('fetch') ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('timeout')
      ) {
        throw new DeleteWardrobeItemError('Unable to connect to server', 'network', error);
      }

      // Check for auth errors
      if (
        error.message?.includes('auth') ||
        error.message?.includes('401') ||
        error.message?.includes('403')
      ) {
        throw new DeleteWardrobeItemError('Authentication required', 'auth', error);
      }

      // Generic server error
      throw new DeleteWardrobeItemError('Failed to delete item', 'server', error);
    }

    // Handle response from Edge Function
    if (!data) {
      throw new DeleteWardrobeItemError('No response from server', 'server');
    }

    // Check for Edge Function-level errors
    if (!data.success) {
      const errorCode = data.code as DeleteWardrobeItemErrorCode | undefined;

      switch (errorCode) {
        case 'auth':
          throw new DeleteWardrobeItemError(
            data.error || 'Not authorized to delete this item',
            'auth'
          );
        case 'validation':
          throw new DeleteWardrobeItemError(data.error || 'Invalid request', 'validation');
        case 'notFound':
          // Not found is success for idempotency - don't throw
          return;
        case 'server':
        default:
          throw new DeleteWardrobeItemError(data.error || 'Failed to delete item', 'server');
      }
    }

    // Success
    return;
  } catch (error) {
    // Re-throw DeleteWardrobeItemError as-is
    if (error instanceof DeleteWardrobeItemError) {
      throw error;
    }

    // Check for network errors from fetch
    if (error instanceof TypeError && error.message?.includes('fetch')) {
      throw new DeleteWardrobeItemError('Unable to connect to server', 'network', error);
    }

    // Unknown error
    throw new DeleteWardrobeItemError('An unexpected error occurred', 'unknown', error);
  }
}
