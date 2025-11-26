/**
 * Data fetching function for wardrobe items.
 *
 * Provides a clean interface for fetching wardrobe items from Supabase
 * with support for pagination and search. This function is designed to
 * be used by React Query hooks but can also be called directly.
 *
 * Features:
 * - RLS-safe queries (filters by user_id)
 * - Minimal projection for performance
 * - Case-insensitive search on name and tags
 * - Offset-based pagination
 * - Deterministic sorting (created_at DESC, id DESC)
 *
 * @module features/wardrobe/api/fetchWardrobeItems
 */

import { supabase } from '../../../services/supabase';
import {
  type WardrobeGridItem,
  type FetchWardrobeItemsParams,
  type FetchWardrobeItemsResponse,
  WARDROBE_GRID_PROJECTION,
  DEFAULT_PAGE_SIZE,
} from '../types';

/**
 * Error thrown when wardrobe items fetch fails.
 *
 * Includes additional context for error classification and telemetry.
 */
export class FetchWardrobeItemsError extends Error {
  constructor(
    message: string,
    public readonly code: 'network' | 'server' | 'auth' | 'unknown',
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'FetchWardrobeItemsError';
  }
}

/**
 * Classifies a Supabase error into a user-friendly category.
 *
 * @param error - The error to classify
 * @returns Error classification code
 */
function classifySupabaseError(error: unknown): 'network' | 'server' | 'auth' | 'unknown' {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
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

    // Auth errors
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
 * Fetches wardrobe items from Supabase with pagination and optional search.
 *
 * This function:
 * 1. Queries the `items` table with minimal projection
 * 2. Filters by user_id (RLS-safe)
 * 3. Optionally filters by search query (ILIKE on name and tags)
 * 4. Sorts by created_at DESC with id as tiebreaker
 * 5. Returns paginated results with total count
 *
 * The search is case-insensitive and matches partial strings in both
 * the item name and tags array (cast to text for pattern matching).
 *
 * @param params - Fetch parameters including userId, pagination, and search
 * @returns Promise resolving to items, total count, and hasMore flag
 * @throws {FetchWardrobeItemsError} If fetch fails
 *
 * @example
 * ```ts
 * // Fetch first page
 * const result = await fetchWardrobeItems({ userId: 'abc-123' });
 *
 * // Fetch with search
 * const result = await fetchWardrobeItems({
 *   userId: 'abc-123',
 *   searchQuery: 'blue shirt',
 *   offset: 0,
 * });
 *
 * // Fetch next page
 * const result = await fetchWardrobeItems({
 *   userId: 'abc-123',
 *   offset: 20,
 * });
 * ```
 */
export async function fetchWardrobeItems(
  params: FetchWardrobeItemsParams
): Promise<FetchWardrobeItemsResponse> {
  const { userId, pageSize = DEFAULT_PAGE_SIZE, offset = 0, searchQuery } = params;

  // Validate required parameters
  if (!userId) {
    throw new FetchWardrobeItemsError('User ID is required', 'auth');
  }

  try {
    // Build the query with projection and user filter
    let query = supabase
      .from('items')
      .select(WARDROBE_GRID_PROJECTION, { count: 'exact' })
      .eq('user_id', userId);

    // Apply search filter if provided
    // Uses ILIKE for case-insensitive partial matching
    // Searches both name and tags (cast to text for array search)
    if (searchQuery && searchQuery.trim().length > 0) {
      const searchPattern = `%${searchQuery.trim()}%`;
      // Use OR to match either name or tags
      // tags::text converts the array to text for ILIKE matching
      query = query.or(`name.ilike.${searchPattern},tags::text.ilike.${searchPattern}`);
    }

    // Apply sorting: created_at DESC (newest first), id DESC (deterministic tiebreaker)
    query = query.order('created_at', { ascending: false }).order('id', { ascending: false });

    // Apply pagination using range
    // range is inclusive, so range(0, 19) returns 20 items
    query = query.range(offset, offset + pageSize - 1);

    // Execute query
    const { data, error, count } = await query;

    if (error) {
      const errorCode = classifySupabaseError(error);
      throw new FetchWardrobeItemsError(
        `Failed to fetch wardrobe items: ${error.message}`,
        errorCode,
        error
      );
    }

    // Safe cast - Supabase returns data matching our projection
    const items = (data ?? []) as WardrobeGridItem[];
    const total = count ?? 0;

    // Calculate if there are more items to load
    const loadedCount = offset + items.length;
    const hasMore = loadedCount < total;

    return {
      items,
      total,
      hasMore,
    };
  } catch (error) {
    // Re-throw FetchWardrobeItemsError as-is
    if (error instanceof FetchWardrobeItemsError) {
      throw error;
    }

    // Wrap unexpected errors
    const errorCode = classifySupabaseError(error);
    throw new FetchWardrobeItemsError(
      error instanceof Error ? error.message : 'An unexpected error occurred',
      errorCode,
      error
    );
  }
}
