/**
 * Data access module for wear history operations.
 *
 * Provides a clean interface for creating, updating, and querying wear history
 * events from Supabase. This module encapsulates all database interactions and
 * can be reused by:
 * - Mobile app components (via React Query hooks)
 * - Edge Functions (for AI/recommendation modules)
 * - Background jobs (for analytics and no-repeat calculations)
 *
 * Features:
 * - RLS-safe queries (filters by user_id)
 * - Upsert pattern for duplicate prevention
 * - Paginated queries for timeline views
 * - Date range queries for no-repeat window enforcement
 * - Consistent error handling with classification
 *
 * @module features/wearHistory/api/wearHistoryRepository
 */

import { supabase } from '../../../services/supabase';
import {
  type WearHistoryRow,
  type CreateWearEventPayload,
  type GetWearHistoryParams,
  type GetWearHistoryResponse,
  type GetWearHistoryWindowResponse,
  WEAR_HISTORY_PROJECTION,
  DEFAULT_WEAR_HISTORY_PAGE_SIZE,
} from '../types';

/**
 * Error thrown when wear history operations fail.
 *
 * Includes additional context for error classification and telemetry.
 */
export class WearHistoryError extends Error {
  constructor(
    message: string,
    public readonly code: 'network' | 'server' | 'auth' | 'validation' | 'unknown',
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'WearHistoryError';
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
 * Validates a UUID string format.
 *
 * @param value - The string to validate
 * @returns True if the string is a valid UUID format
 */
function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validates a date string format (YYYY-MM-DD).
 *
 * @param value - The string to validate
 * @returns True if the string is a valid date format
 */
function isValidDateString(value: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) {
    return false;
  }
  // Also verify it's a valid date
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * Creates or updates a wear event using the upsert pattern.
 *
 * If a wear event already exists for the same user, outfit, and date,
 * the existing record is updated with the new values. Otherwise, a new
 * record is created.
 *
 * The unique constraint on (user_id, outfit_id, worn_date) enables this
 * upsert behavior via ON CONFLICT DO UPDATE.
 *
 * @param userId - The authenticated user's ID
 * @param outfitId - The outfit being worn
 * @param wornDate - The calendar date (YYYY-MM-DD format)
 * @param payload - Additional wear event data
 * @returns The created or updated wear history record
 * @throws {WearHistoryError} If the operation fails
 *
 * @example
 * ```ts
 * const event = await createOrUpdateWearEvent(
 *   'user-123',
 *   'outfit-456',
 *   '2024-12-03',
 *   {
 *     item_ids: ['item-1', 'item-2'],
 *     source: 'ai_recommendation',
 *     context: 'Client meeting',
 *   }
 * );
 * ```
 */
export async function createOrUpdateWearEvent(
  userId: string,
  outfitId: string,
  wornDate: string,
  payload: CreateWearEventPayload
): Promise<WearHistoryRow> {
  // Validate required parameters
  if (!userId || !isValidUuid(userId)) {
    throw new WearHistoryError('Invalid user ID', 'validation');
  }

  if (!outfitId || !isValidUuid(outfitId)) {
    throw new WearHistoryError('Invalid outfit ID', 'validation');
  }

  if (!wornDate || !isValidDateString(wornDate)) {
    throw new WearHistoryError('Invalid worn date format (expected YYYY-MM-DD)', 'validation');
  }

  if (!payload.item_ids || !Array.isArray(payload.item_ids)) {
    throw new WearHistoryError('item_ids must be an array', 'validation');
  }

  if (payload.item_ids.length === 0) {
    throw new WearHistoryError('item_ids cannot be empty', 'validation');
  }

  // Validate each item ID
  for (const itemId of payload.item_ids) {
    if (!isValidUuid(itemId)) {
      throw new WearHistoryError(`Invalid item ID: ${itemId}`, 'validation');
    }
  }

  if (!payload.source) {
    throw new WearHistoryError('source is required', 'validation');
  }

  const validSources = ['ai_recommendation', 'saved_outfit', 'manual_outfit', 'imported'];
  if (!validSources.includes(payload.source)) {
    throw new WearHistoryError(`Invalid source: ${payload.source}`, 'validation');
  }

  try {
    // Build the upsert record
    const record = {
      user_id: userId,
      outfit_id: outfitId,
      worn_date: wornDate,
      item_ids: payload.item_ids,
      worn_at: payload.worn_at ?? new Date().toISOString(),
      context: payload.context ?? null,
      source: payload.source,
      notes: payload.notes ?? null,
    };

    // Perform upsert using ON CONFLICT
    const { data, error } = await supabase
      .from('wear_history')
      .upsert(record, {
        onConflict: 'user_id,outfit_id,worn_date',
        ignoreDuplicates: false, // Update on conflict
      })
      .select(WEAR_HISTORY_PROJECTION)
      .single();

    if (error) {
      const errorCode = classifySupabaseError(error);
      throw new WearHistoryError(
        `Failed to create/update wear event: ${error.message}`,
        errorCode,
        error
      );
    }

    if (!data) {
      throw new WearHistoryError('No data returned from upsert operation', 'server');
    }

    return data as WearHistoryRow;
  } catch (error) {
    // Re-throw WearHistoryError as-is
    if (error instanceof WearHistoryError) {
      throw error;
    }

    // Wrap unexpected errors
    const errorCode = classifySupabaseError(error);
    throw new WearHistoryError(
      error instanceof Error ? error.message : 'An unexpected error occurred',
      errorCode,
      error
    );
  }
}

/**
 * Fetches paginated wear history for a user.
 *
 * Returns events sorted by worn_date DESC, then worn_at DESC for
 * reverse-chronological display in timeline views.
 *
 * @param userId - The authenticated user's ID
 * @param params - Pagination parameters (limit, offset)
 * @returns Paginated wear history response
 * @throws {WearHistoryError} If the query fails
 *
 * @example
 * ```ts
 * // Fetch first page
 * const result = await getWearHistoryForUser('user-123');
 *
 * // Fetch second page
 * const result = await getWearHistoryForUser('user-123', {
 *   limit: 20,
 *   offset: 20,
 * });
 * ```
 */
export async function getWearHistoryForUser(
  userId: string,
  params: GetWearHistoryParams = {}
): Promise<GetWearHistoryResponse> {
  const { limit = DEFAULT_WEAR_HISTORY_PAGE_SIZE, offset = 0 } = params;

  // Validate required parameters
  if (!userId || !isValidUuid(userId)) {
    throw new WearHistoryError('Invalid user ID', 'validation');
  }

  if (limit < 1 || limit > 100) {
    throw new WearHistoryError('limit must be between 1 and 100', 'validation');
  }

  if (offset < 0) {
    throw new WearHistoryError('offset must be non-negative', 'validation');
  }

  try {
    // Build query with projection, user filter, and sorting
    const { data, error, count } = await supabase
      .from('wear_history')
      .select(WEAR_HISTORY_PROJECTION, { count: 'exact' })
      .eq('user_id', userId)
      .order('worn_date', { ascending: false })
      .order('worn_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      const errorCode = classifySupabaseError(error);
      throw new WearHistoryError(
        `Failed to fetch wear history: ${error.message}`,
        errorCode,
        error
      );
    }

    // Safe cast - Supabase returns data matching our projection
    const events = (data ?? []) as WearHistoryRow[];
    const total = count ?? 0;

    // Calculate if there are more events to load
    const loadedCount = offset + events.length;
    const hasMore = loadedCount < total;

    return {
      events,
      total,
      hasMore,
    };
  } catch (error) {
    // Re-throw WearHistoryError as-is
    if (error instanceof WearHistoryError) {
      throw error;
    }

    // Wrap unexpected errors
    const errorCode = classifySupabaseError(error);
    throw new WearHistoryError(
      error instanceof Error ? error.message : 'An unexpected error occurred',
      errorCode,
      error
    );
  }
}

/**
 * Fetches wear history for a user within a date range.
 *
 * Returns all events where worn_date is between fromDate and toDate (inclusive),
 * sorted by worn_date DESC, then worn_at DESC.
 *
 * This function is designed for:
 * - No-repeat window calculations in the recommendation engine
 * - Calendar view displays
 * - Date-filtered exports
 *
 * @param userId - The authenticated user's ID
 * @param fromDate - Start of date range (YYYY-MM-DD, inclusive)
 * @param toDate - End of date range (YYYY-MM-DD, inclusive)
 * @returns All wear events within the date range
 * @throws {WearHistoryError} If the query fails
 *
 * @example
 * ```ts
 * // Get last 14 days of wear history for no-repeat check
 * const today = new Date();
 * const twoWeeksAgo = new Date(today);
 * twoWeeksAgo.setDate(today.getDate() - 14);
 *
 * const result = await getWearHistoryForWindow(
 *   'user-123',
 *   twoWeeksAgo.toISOString().split('T')[0],
 *   today.toISOString().split('T')[0]
 * );
 * ```
 */
export async function getWearHistoryForWindow(
  userId: string,
  fromDate: string,
  toDate: string
): Promise<GetWearHistoryWindowResponse> {
  // Validate required parameters
  if (!userId || !isValidUuid(userId)) {
    throw new WearHistoryError('Invalid user ID', 'validation');
  }

  if (!fromDate || !isValidDateString(fromDate)) {
    throw new WearHistoryError('Invalid fromDate format (expected YYYY-MM-DD)', 'validation');
  }

  if (!toDate || !isValidDateString(toDate)) {
    throw new WearHistoryError('Invalid toDate format (expected YYYY-MM-DD)', 'validation');
  }

  // Validate date range
  if (fromDate > toDate) {
    throw new WearHistoryError('fromDate must be before or equal to toDate', 'validation');
  }

  try {
    // Build query with date range filter
    const { data, error } = await supabase
      .from('wear_history')
      .select(WEAR_HISTORY_PROJECTION)
      .eq('user_id', userId)
      .gte('worn_date', fromDate)
      .lte('worn_date', toDate)
      .order('worn_date', { ascending: false })
      .order('worn_at', { ascending: false });

    if (error) {
      const errorCode = classifySupabaseError(error);
      throw new WearHistoryError(
        `Failed to fetch wear history window: ${error.message}`,
        errorCode,
        error
      );
    }

    // Safe cast - Supabase returns data matching our projection
    const events = (data ?? []) as WearHistoryRow[];

    return { events };
  } catch (error) {
    // Re-throw WearHistoryError as-is
    if (error instanceof WearHistoryError) {
      throw error;
    }

    // Wrap unexpected errors
    const errorCode = classifySupabaseError(error);
    throw new WearHistoryError(
      error instanceof Error ? error.message : 'An unexpected error occurred',
      errorCode,
      error
    );
  }
}
