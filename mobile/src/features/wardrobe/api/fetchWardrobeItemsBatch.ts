/**
 * Data fetching function for batch wardrobe items.
 *
 * Provides efficient batch fetching of multiple wardrobe items by ID,
 * optimised for the outfit recommendation flow. This function is designed
 * to be used by React Query hooks but can also be called directly.
 *
 * Features:
 * - Batch fetch with Supabase `.in()` filter
 * - Minimal projection for performance (only fields needed for item chips)
 * - RLS-safe queries (filters by user_id)
 * - Error classification (network, server, auth)
 * - Graceful handling of missing items (returns partial results)
 *
 * @module features/wardrobe/api/fetchWardrobeItemsBatch
 */

import { supabase } from '../../../services/supabase';
import {
  type BatchWardrobeItem,
  type FetchBatchItemsParams,
  type FetchBatchItemsResponse,
  BATCH_ITEM_PROJECTION,
} from '../types';

/**
 * Error codes for batch wardrobe items fetch failures.
 *
 * - network: Network connectivity issues (offline, timeout)
 * - server: Backend/database errors
 * - auth: Authentication issues (expired token, not logged in)
 * - unknown: Unexpected errors that couldn't be classified
 *
 * Note: Unlike single item fetch, batch operations don't have 'notFound'
 * as a fatal error - missing items are returned in the response.
 */
export type FetchBatchItemsErrorCode = 'network' | 'server' | 'auth' | 'unknown';

/**
 * Error thrown when batch fetching wardrobe items fails.
 *
 * Includes error classification for appropriate UI handling:
 * - network: Show connectivity error, allow retry
 * - server: Show server error, allow retry
 * - auth: Trigger re-authentication flow
 *
 * @example
 * ```ts
 * try {
 *   const result = await fetchWardrobeItemsBatch({ userId, itemIds });
 * } catch (error) {
 *   if (error instanceof FetchBatchItemsError) {
 *     if (error.code === 'network') {
 *       // Show retry option
 *     } else if (error.code === 'auth') {
 *       // Trigger re-auth
 *     }
 *   }
 * }
 * ```
 */
export class FetchBatchItemsError extends Error {
  constructor(
    message: string,
    public readonly code: FetchBatchItemsErrorCode,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'FetchBatchItemsError';
  }
}

/**
 * Classifies a Supabase error into a user-friendly category.
 *
 * Error classification helps the UI show appropriate messages and
 * take correct recovery actions (retry, navigate, re-auth).
 *
 * @param error - The error to classify
 * @returns Error classification code
 */
function classifySupabaseError(error: unknown): FetchBatchItemsErrorCode {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors - connectivity issues
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('offline') ||
      message.includes('failed to fetch')
    ) {
      return 'network';
    }

    // Auth errors - token/session issues
    if (
      message.includes('jwt') ||
      message.includes('token') ||
      message.includes('unauthorized') ||
      message.includes('authentication') ||
      message.includes('row level security')
    ) {
      return 'auth';
    }
  }

  // Supabase error with code
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code: unknown }).code);

    // PostgreSQL/Supabase error codes
    if (code.startsWith('22') || code.startsWith('23')) {
      // Data exception or integrity constraint violation
      return 'server';
    }
    if (code === 'PGRST301' || code === '401') {
      return 'auth';
    }
  }

  return 'server';
}

/**
 * Maximum number of items to fetch in a single batch request.
 *
 * Supabase/PostgreSQL can handle large IN clauses, but we set a
 * reasonable limit for performance and to avoid overly large responses.
 * If more items are needed, the caller should split into multiple calls.
 */
export const MAX_BATCH_SIZE = 100;

/**
 * Fetches multiple wardrobe items from Supabase by their IDs.
 *
 * This function:
 * 1. Queries the `items` table with minimal projection for item chips
 * 2. Uses `.in()` filter to fetch multiple items in one query
 * 3. Filters by user_id (RLS-safe)
 * 4. Returns a Map of found items and a list of missing IDs
 *
 * Unlike single item fetch, this function does NOT throw for missing items.
 * Instead, it returns partial results with missing IDs tracked separately.
 * This allows the UI to show placeholder chips for deleted/inaccessible items.
 *
 * @param params - Fetch parameters including userId and itemIds
 * @returns Promise resolving to FetchBatchItemsResponse with items map and missing IDs
 * @throws {FetchBatchItemsError} If the query itself fails (network, server, auth)
 *
 * @example
 * ```ts
 * // Fetch multiple items
 * const { items, missingIds } = await fetchWardrobeItemsBatch({
 *   userId: 'user-123',
 *   itemIds: ['item-1', 'item-2', 'item-3'],
 * });
 *
 * // items is Map<string, BatchWardrobeItem>
 * const item1 = items.get('item-1');
 *
 * // missingIds contains IDs that weren't found
 * if (missingIds.length > 0) {
 *   console.log('Missing items:', missingIds);
 * }
 * ```
 */
export async function fetchWardrobeItemsBatch(
  params: FetchBatchItemsParams
): Promise<FetchBatchItemsResponse> {
  const { userId, itemIds } = params;

  // Validate required parameters
  if (!userId) {
    throw new FetchBatchItemsError('User ID is required', 'auth');
  }

  // Handle empty array - return empty result immediately
  if (!itemIds || itemIds.length === 0) {
    return {
      items: new Map(),
      missingIds: [],
    };
  }

  // Warn if batch size exceeds recommended limit (but still proceed)
  if (itemIds.length > MAX_BATCH_SIZE) {
    // eslint-disable-next-line no-console
    console.warn(
      `[fetchWardrobeItemsBatch] Batch size ${itemIds.length} exceeds recommended limit of ${MAX_BATCH_SIZE}. ` +
        'Consider splitting into multiple requests for better performance.'
    );
  }

  try {
    // Query with minimal projection using IN filter
    // RLS policy already filters by user_id = auth.uid()
    // We also explicitly filter by user_id for defense in depth
    const { data, error } = await supabase
      .from('items')
      .select(BATCH_ITEM_PROJECTION)
      .eq('user_id', userId)
      .in('id', itemIds);

    if (error) {
      const errorCode = classifySupabaseError(error);
      throw new FetchBatchItemsError(
        `Failed to batch fetch wardrobe items: ${error.message}`,
        errorCode,
        error
      );
    }

    // Build result map from fetched items
    const items = new Map<string, BatchWardrobeItem>();
    const foundIds = new Set<string>();

    if (data) {
      for (const row of data) {
        const item = row as BatchWardrobeItem;
        items.set(item.id, item);
        foundIds.add(item.id);
      }
    }

    // Determine which requested IDs were not found
    const missingIds = itemIds.filter((id) => !foundIds.has(id));

    return {
      items,
      missingIds,
    };
  } catch (error) {
    // Re-throw FetchBatchItemsError as-is
    if (error instanceof FetchBatchItemsError) {
      throw error;
    }

    // Wrap unexpected errors
    const errorCode = classifySupabaseError(error);
    throw new FetchBatchItemsError(
      error instanceof Error ? error.message : 'An unexpected error occurred',
      errorCode,
      error
    );
  }
}
