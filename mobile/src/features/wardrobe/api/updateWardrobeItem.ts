/**
 * Data update function for wardrobe item name and tags.
 *
 * Provides a clean interface for updating a wardrobe item's user-editable fields
 * (name and tags) via Supabase. This function is designed to be used by React
 * Query mutation hooks but can also be called directly.
 *
 * Features:
 * - RLS-safe updates (filters by user_id and item id)
 * - Returns updated item with full detail projection
 * - Error classification (network, server, auth, notFound)
 * - Graceful handling of RLS denials
 *
 * @module features/wardrobe/api/updateWardrobeItem
 */

import { supabase } from '../../../services/supabase';
import { type ItemDetail, ITEM_DETAIL_PROJECTION } from '../types';

/**
 * Error codes for wardrobe item update failures.
 *
 * - notFound: Item does not exist or user lacks access (RLS denial)
 * - network: Network connectivity issues (offline, timeout)
 * - server: Backend/database errors
 * - auth: Authentication issues (expired token, not logged in)
 * - validation: Client-side validation failed (should be caught before API call)
 * - unknown: Unexpected errors that couldn't be classified
 */
export type UpdateWardrobeItemErrorCode =
  | 'notFound'
  | 'network'
  | 'server'
  | 'auth'
  | 'validation'
  | 'unknown';

/**
 * Error thrown when updating a wardrobe item fails.
 *
 * Includes error classification for appropriate UI handling:
 * - notFound: Item no longer exists, navigate back to grid
 * - network: Show connectivity error, allow retry
 * - server: Show server error, allow retry
 * - auth: Trigger re-authentication flow
 * - validation: Show field-level errors (should be caught client-side)
 *
 * @example
 * ```ts
 * try {
 *   const item = await updateWardrobeItem({ userId, itemId, name, tags });
 * } catch (error) {
 *   if (error instanceof UpdateWardrobeItemError) {
 *     if (error.code === 'network') {
 *       // Show retry option
 *     } else if (error.code === 'notFound') {
 *       // Navigate back to grid
 *     }
 *   }
 * }
 * ```
 */
export class UpdateWardrobeItemError extends Error {
  constructor(
    message: string,
    public readonly code: UpdateWardrobeItemErrorCode,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'UpdateWardrobeItemError';
  }
}

/**
 * Parameters for updating a wardrobe item.
 */
export interface UpdateWardrobeItemParams {
  /** User ID for RLS compliance (must match authenticated user) */
  userId: string;

  /** Item ID to update */
  itemId: string;

  /** New name for the item (required, max 100 chars) */
  name: string;

  /** New tags for the item (max 20 tags, each max 30 chars, lowercased) */
  tags: string[];
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
function classifySupabaseError(error: unknown): UpdateWardrobeItemErrorCode {
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
 * Updates a wardrobe item's name and tags in Supabase.
 *
 * This function:
 * 1. Updates the `items` table with new name and tags
 * 2. Filters by user_id (RLS-safe) and item id
 * 3. Returns the updated item with full detail projection
 *
 * Note: Supabase returns an empty array (not 403) when RLS blocks access
 * or item doesn't exist. We treat both cases as 'notFound' since the UI
 * response is the same (show error, navigate back to grid).
 *
 * @param params - Update parameters including userId, itemId, name, and tags
 * @returns Promise resolving to updated ItemDetail
 * @throws {UpdateWardrobeItemError} If update fails or item not found
 *
 * @example
 * ```ts
 * // Update item name and tags
 * const updatedItem = await updateWardrobeItem({
 *   userId: 'user-123',
 *   itemId: 'item-456',
 *   name: 'Blue Summer Dress',
 *   tags: ['summer', 'casual', 'blue'],
 * });
 *
 * console.log(updatedItem.name, updatedItem.tags);
 * ```
 */
export async function updateWardrobeItem(
  params: UpdateWardrobeItemParams
): Promise<ItemDetail> {
  const { userId, itemId, name, tags } = params;

  // Validate required parameters
  if (!userId) {
    throw new UpdateWardrobeItemError('User ID is required', 'auth');
  }

  if (!itemId) {
    throw new UpdateWardrobeItemError('Item ID is required', 'notFound');
  }

  try {
    // Update with pessimistic approach - wait for server response
    // RLS policy already filters by user_id = auth.uid() and deleted_at IS NULL
    // We also explicitly filter by user_id for defense in depth
    const { data, error } = await supabase
      .from('items')
      .update({
        name: name.trim() || null, // Store null if empty string
        tags: tags.length > 0 ? tags : null, // Store null if empty array
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('user_id', userId)
      .select(ITEM_DETAIL_PROJECTION)
      .single();

    if (error) {
      // Check for "no rows returned" error which indicates item not found
      // Supabase returns PGRST116 when .single() finds no rows
      if (error.code === 'PGRST116') {
        throw new UpdateWardrobeItemError('Item not found', 'notFound', error);
      }

      const errorCode = classifySupabaseError(error);
      throw new UpdateWardrobeItemError(
        `Failed to update wardrobe item: ${error.message}`,
        errorCode,
        error
      );
    }

    // Safety check - should not happen with .single() but be defensive
    if (!data) {
      throw new UpdateWardrobeItemError('Item not found', 'notFound');
    }

    // Safe cast - Supabase returns data matching our projection
    return data as ItemDetail;
  } catch (error) {
    // Re-throw UpdateWardrobeItemError as-is
    if (error instanceof UpdateWardrobeItemError) {
      throw error;
    }

    // Wrap unexpected errors
    const errorCode = classifySupabaseError(error);
    throw new UpdateWardrobeItemError(
      error instanceof Error ? error.message : 'An unexpected error occurred',
      errorCode,
      error
    );
  }
}
