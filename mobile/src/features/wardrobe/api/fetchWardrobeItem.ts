/**
 * Data fetching function for a single wardrobe item.
 *
 * Provides a clean interface for fetching a single wardrobe item from Supabase
 * with full detail projection including AI attributes. This function is designed
 * to be used by React Query hooks but can also be called directly.
 *
 * Features:
 * - RLS-safe queries (filters by user_id and item id)
 * - Full detail projection including AI attributes
 * - Error classification (notFound, network, server, auth)
 * - Graceful handling of missing items and RLS denials
 *
 * @module features/wardrobe/api/fetchWardrobeItem
 */

import { supabase } from '../../../services/supabase';
import { type ItemDetail, ITEM_DETAIL_PROJECTION } from '../types';

/**
 * Error codes for wardrobe item fetch failures.
 *
 * - notFound: Item does not exist or user lacks access (RLS denial)
 * - network: Network connectivity issues (offline, timeout)
 * - server: Backend/database errors
 * - auth: Authentication issues (expired token, not logged in)
 * - unknown: Unexpected errors that couldn't be classified
 */
export type FetchWardrobeItemErrorCode = 'notFound' | 'network' | 'server' | 'auth' | 'unknown';

/**
 * Error thrown when fetching a single wardrobe item fails.
 *
 * Includes error classification for appropriate UI handling:
 * - notFound: Show "item not found" message, navigate back to grid
 * - network: Show connectivity error, allow retry
 * - server: Show server error, allow retry
 * - auth: Trigger re-authentication flow
 *
 * @example
 * ```ts
 * try {
 *   const item = await fetchWardrobeItem({ userId, itemId });
 * } catch (error) {
 *   if (error instanceof FetchWardrobeItemError) {
 *     if (error.code === 'notFound') {
 *       // Navigate back to grid
 *     } else if (error.code === 'network') {
 *       // Show retry option
 *     }
 *   }
 * }
 * ```
 */
export class FetchWardrobeItemError extends Error {
  constructor(
    message: string,
    public readonly code: FetchWardrobeItemErrorCode,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'FetchWardrobeItemError';
  }
}

/**
 * Parameters for fetching a single wardrobe item.
 */
export interface FetchWardrobeItemParams {
  /** User ID for RLS compliance (must match authenticated user) */
  userId: string;

  /** Item ID to fetch */
  itemId: string;
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
function classifySupabaseError(error: unknown): FetchWardrobeItemErrorCode {
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
    if (code === 'PGRST116') {
      // Row not found
      return 'notFound';
    }
  }

  return 'server';
}

/**
 * Fetches a single wardrobe item from Supabase by ID.
 *
 * This function:
 * 1. Queries the `items` table with full detail projection
 * 2. Filters by user_id (RLS-safe) and item id
 * 3. Returns the complete item detail or throws classified error
 *
 * Note: Supabase returns an empty array (not 403) when RLS blocks access
 * or item doesn't exist. We treat both cases as 'notFound' since the UI
 * response is the same (show error, navigate back to grid).
 *
 * @param params - Fetch parameters including userId and itemId
 * @returns Promise resolving to ItemDetail
 * @throws {FetchWardrobeItemError} If fetch fails or item not found
 *
 * @example
 * ```ts
 * // Fetch item detail
 * const item = await fetchWardrobeItem({
 *   userId: 'user-123',
 *   itemId: 'item-456',
 * });
 *
 * console.log(item.name, item.type, item.colour);
 * ```
 */
export async function fetchWardrobeItem(params: FetchWardrobeItemParams): Promise<ItemDetail> {
  const { userId, itemId } = params;

  // Validate required parameters
  if (!userId) {
    throw new FetchWardrobeItemError('User ID is required', 'auth');
  }

  if (!itemId) {
    throw new FetchWardrobeItemError('Item ID is required', 'notFound');
  }

  try {
    // Query with full detail projection
    // RLS policy already filters by user_id = auth.uid() and deleted_at IS NULL
    // We also explicitly filter by user_id for defense in depth
    const { data, error } = await supabase
      .from('items')
      .select(ITEM_DETAIL_PROJECTION)
      .eq('id', itemId)
      .eq('user_id', userId)
      .single();

    if (error) {
      // Check for "no rows returned" error which indicates item not found
      // Supabase returns PGRST116 when .single() finds no rows
      if (error.code === 'PGRST116') {
        throw new FetchWardrobeItemError('Item not found', 'notFound', error);
      }

      const errorCode = classifySupabaseError(error);
      throw new FetchWardrobeItemError(
        `Failed to fetch wardrobe item: ${error.message}`,
        errorCode,
        error
      );
    }

    // Safety check - should not happen with .single() but be defensive
    if (!data) {
      throw new FetchWardrobeItemError('Item not found', 'notFound');
    }

    // Safe cast - Supabase returns data matching our projection
    return data as ItemDetail;
  } catch (error) {
    // Re-throw FetchWardrobeItemError as-is
    if (error instanceof FetchWardrobeItemError) {
      throw error;
    }

    // Wrap unexpected errors
    const errorCode = classifySupabaseError(error);
    throw new FetchWardrobeItemError(
      error instanceof Error ? error.message : 'An unexpected error occurred',
      errorCode,
      error
    );
  }
}
