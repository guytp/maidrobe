/**
 * High-level client interface for wear history operations.
 *
 * This module provides a clean abstraction over the repository layer,
 * exposing functions suitable for direct use from UI components and
 * React Query hooks. It handles:
 * - Client-side validation and idempotency checks
 * - Normalized success/error result types
 * - Error classification for UI feedback and retry decisions
 *
 * @module features/wearHistory/api/wearHistoryClient
 */

import { createOrUpdateWearEvent, WearHistoryError } from './wearHistoryRepository';
import type { WearHistoryRow, WearHistorySource } from '../types';

// ============================================================================
// Query Key Constants
// ============================================================================

/**
 * Sentinel value used in query keys when user is not authenticated.
 * Using a distinct sentinel instead of empty string prevents potential
 * cache collisions and makes disabled query states explicit.
 */
export const QUERY_KEY_NO_USER = '__NO_USER__' as const;

/**
 * Sentinel value used in query keys when a required ID is missing.
 * Makes disabled query states explicit in the cache key.
 */
export const QUERY_KEY_NO_ID = '__NO_ID__' as const;

// ============================================================================
// Query Key Factory
// ============================================================================

/**
 * Query key factory for wear history queries.
 *
 * Creates consistent cache keys that include userId per code guidelines.
 * Used by React Query hooks for cache management and invalidation.
 *
 * Uses sentinel values (QUERY_KEY_NO_USER, QUERY_KEY_NO_ID) instead of
 * empty strings for disabled states to prevent cache collisions and
 * make intent explicit.
 */
export const wearHistoryQueryKey = {
  /**
   * Base key for all wear history queries.
   */
  all: ['wear-history'] as const,

  /**
   * Key for a specific user's wear history.
   */
  user: (userId: string) => [...wearHistoryQueryKey.all, userId] as const,

  /**
   * Key for paginated wear history queries.
   *
   * @param userId - User ID for RLS compliance
   * @param page - Optional page number for pagination
   */
  userPaginated: (userId: string, page?: number) =>
    [...wearHistoryQueryKey.user(userId), { page: page ?? 0 }] as const,

  /**
   * Key for date range wear history queries.
   *
   * Used for no-repeat window calculations and calendar views.
   *
   * @param userId - User ID for RLS compliance
   * @param fromDate - Start date (YYYY-MM-DD)
   * @param toDate - End date (YYYY-MM-DD)
   */
  window: (userId: string, fromDate: string, toDate: string) =>
    [...wearHistoryQueryKey.user(userId), 'window', fromDate, toDate] as const,

  /**
   * Key for a specific outfit's wear status on a date.
   *
   * Used for checking if an outfit was already worn on a given date
   * (client-side idempotency lookups).
   *
   * @param userId - User ID for RLS compliance
   * @param outfitId - Outfit ID to check
   * @param wornDate - Date to check (YYYY-MM-DD)
   */
  forOutfitDate: (userId: string, outfitId: string, wornDate: string) =>
    [...wearHistoryQueryKey.user(userId), 'outfit', outfitId, wornDate] as const,

  /**
   * Key for a single wear history event by ID.
   *
   * @param userId - User ID for RLS compliance
   * @param eventId - Wear history event ID
   */
  event: (userId: string, eventId: string) =>
    [...wearHistoryQueryKey.user(userId), 'event', eventId] as const,
};

// ============================================================================
// Client Error Types
// ============================================================================

/**
 * Error classification for client-facing wear history operations.
 *
 * These classifications determine:
 * - Whether the error is retryable
 * - Whether it should be queued for offline sync
 * - What UI feedback to show the user
 */
export type WearHistoryClientErrorCode =
  | 'network' // Retryable, queue for offline
  | 'server' // Retryable with backoff
  | 'auth' // Not retryable, session recovery needed
  | 'validation'; // Not retryable, user-facing message

/**
 * Client-facing error for wear history operations.
 *
 * Provides a normalized error structure suitable for UI rendering
 * and retry/queue decisions.
 */
export class WearHistoryClientError extends Error {
  constructor(
    message: string,
    public readonly code: WearHistoryClientErrorCode,
    public readonly isRetryable: boolean,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'WearHistoryClientError';
  }

  /**
   * Creates a client error from a repository error.
   *
   * Maps repository error codes to client error codes and determines
   * retryability based on error type.
   */
  static fromRepositoryError(error: WearHistoryError): WearHistoryClientError {
    switch (error.code) {
      case 'network':
        return new WearHistoryClientError(
          'Unable to connect. Your wear will be synced when online.',
          'network',
          true,
          error
        );
      case 'server':
        return new WearHistoryClientError(
          'Service temporarily unavailable. Please try again.',
          'server',
          true,
          error
        );
      case 'auth':
        return new WearHistoryClientError(
          'Your session has expired. Please sign in again.',
          'auth',
          false,
          error
        );
      case 'validation':
        return new WearHistoryClientError(error.message, 'validation', false, error);
      default:
        return new WearHistoryClientError(
          'Something went wrong. Please try again.',
          'server',
          true,
          error
        );
    }
  }

  /**
   * Creates a client error from an unknown error.
   */
  static fromUnknown(error: unknown): WearHistoryClientError {
    if (error instanceof WearHistoryError) {
      return WearHistoryClientError.fromRepositoryError(error);
    }

    if (error instanceof WearHistoryClientError) {
      return error;
    }

    // Check for network-like errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (
        message.includes('network') ||
        message.includes('fetch') ||
        message.includes('connection') ||
        message.includes('offline')
      ) {
        return new WearHistoryClientError(
          'Unable to connect. Your wear will be synced when online.',
          'network',
          true,
          error
        );
      }
    }

    return new WearHistoryClientError(
      'Something went wrong. Please try again.',
      'server',
      true,
      error
    );
  }
}

// ============================================================================
// Client Payload Types
// ============================================================================

/**
 * Payload for creating or updating a wear event from the client.
 *
 * This is the primary interface for UI components to record wear events.
 * The function handles all validation and server communication.
 */
export interface CreateWearEventForClientPayload {
  /** User ID (from auth state) */
  userId: string;

  /** Outfit ID being marked as worn */
  outfitId: string;

  /** Snapshot of item IDs in the outfit at the time of wear */
  itemIds: string[];

  /** User-local calendar date (YYYY-MM-DD) */
  wornDate: string;

  /** Precise timestamp when marked as worn (ISO 8601, defaults to now) */
  wornAt?: string;

  /** Source indicating how the outfit was selected */
  source: WearHistorySource;

  /** Optional occasion/context description */
  context?: string;
}

// ============================================================================
// Client Result Types
// ============================================================================

/**
 * Successful result from creating/updating a wear event.
 */
export interface CreateWearEventSuccessResult {
  success: true;
  /** The created or updated wear history record */
  data: WearHistoryRow;
  /** Whether this was an update to an existing record (same outfit+date) */
  isUpdate: boolean;
}

/**
 * Failed result from creating/updating a wear event.
 */
export interface CreateWearEventFailureResult {
  success: false;
  /** Client-friendly error with classification */
  error: WearHistoryClientError;
}

/**
 * Result type for createOrUpdateWearEventForClient.
 *
 * Uses a discriminated union for type-safe result handling:
 * ```typescript
 * const result = await createOrUpdateWearEventForClient(payload);
 * if (result.success) {
 *   // result.data is WearHistoryRow
 *   // result.isUpdate tells if it was an update
 * } else {
 *   // result.error is WearHistoryClientError
 *   // result.error.isRetryable tells if we should retry/queue
 * }
 * ```
 */
export type CreateWearEventResult = CreateWearEventSuccessResult | CreateWearEventFailureResult;

// ============================================================================
// Client Functions
// ============================================================================

/**
 * Creates or updates a wear event for the current user.
 *
 * This is the primary function for recording when an outfit is worn.
 * It handles:
 * - Client-side validation
 * - Server communication via the repository layer
 * - Error normalization for UI consumption
 * - Idempotent behavior (same outfit+date updates existing record)
 *
 * The function is designed for use from both:
 * - Recommendation flow ("Wear this today" button)
 * - Outfit detail flow ("Mark as worn..." action)
 *
 * IDEMPOTENCY:
 * The server uses a unique constraint on (user_id, outfit_id, worn_date)
 * with ON CONFLICT DO UPDATE. This means:
 * - First call for an outfit+date creates a new record
 * - Subsequent calls update the existing record
 * - No duplicate entries are created for the same outfit+date
 *
 * The `isUpdate` field in the success result indicates whether the
 * operation updated an existing record. This is determined by comparing
 * created_at and updated_at timestamps.
 *
 * @param payload - Wear event data including user, outfit, items, date, and source
 * @returns Promise resolving to success with data or failure with error
 *
 * @example
 * ```typescript
 * // From recommendation flow
 * const result = await createOrUpdateWearEventForClient({
 *   userId: user.id,
 *   outfitId: outfit.id,
 *   itemIds: outfit.itemIds,
 *   wornDate: getTodayDateString(), // '2024-12-03'
 *   source: 'ai_recommendation',
 * });
 *
 * if (result.success) {
 *   showToast('Marked as worn!');
 *   updateUIState(outfit.id, result.data);
 * } else if (result.error.isRetryable) {
 *   queueForOfflineSync(payload);
 *   showToast('Will sync when online');
 * } else {
 *   showError(result.error.message);
 * }
 * ```
 */
export async function createOrUpdateWearEventForClient(
  payload: CreateWearEventForClientPayload
): Promise<CreateWearEventResult> {
  const { userId, outfitId, itemIds, wornDate, wornAt, source, context } = payload;

  // Client-side validation for required fields
  if (!userId) {
    return {
      success: false,
      error: new WearHistoryClientError('User not authenticated', 'auth', false),
    };
  }

  if (!outfitId) {
    return {
      success: false,
      error: new WearHistoryClientError('Outfit ID is required', 'validation', false),
    };
  }

  if (!itemIds || itemIds.length === 0) {
    return {
      success: false,
      error: new WearHistoryClientError('Outfit must contain at least one item', 'validation', false),
    };
  }

  if (!wornDate) {
    return {
      success: false,
      error: new WearHistoryClientError('Wear date is required', 'validation', false),
    };
  }

  if (!source) {
    return {
      success: false,
      error: new WearHistoryClientError('Source is required', 'validation', false),
    };
  }

  try {
    // Call the repository function
    const data = await createOrUpdateWearEvent(userId, outfitId, wornDate, {
      item_ids: itemIds,
      worn_at: wornAt,
      source,
      context: context ?? null,
    });

    // Determine if this was an update by comparing timestamps
    // If created_at !== updated_at, it was an update to an existing record
    const isUpdate = data.created_at !== data.updated_at;

    return {
      success: true,
      data,
      isUpdate,
    };
  } catch (error) {
    return {
      success: false,
      error: WearHistoryClientError.fromUnknown(error),
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Gets the current user-local date as a YYYY-MM-DD string.
 *
 * This function returns the date in the user's local timezone,
 * which is important for the "Wear this today" feature where
 * "today" should match the user's perception of the current day.
 *
 * @returns Current date in YYYY-MM-DD format
 *
 * @example
 * ```typescript
 * const today = getTodayDateString();
 * // '2024-12-03' (in user's local timezone)
 * ```
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Validates that a date string is within the allowed range for marking as worn.
 *
 * Per user story requirements:
 * - Future dates are not allowed
 * - Dates older than 30 days are not allowed
 *
 * @param dateString - Date to validate (YYYY-MM-DD)
 * @returns Object with isValid flag and optional error message
 *
 * @example
 * ```typescript
 * const result = validateWearDate('2024-12-03');
 * if (!result.isValid) {
 *   showError(result.errorMessage);
 * }
 * ```
 */
export function validateWearDate(dateString: string): {
  isValid: boolean;
  errorMessage?: string;
} {
  // Basic format validation
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    return { isValid: false, errorMessage: 'Invalid date format' };
  }

  const inputDate = new Date(dateString + 'T00:00:00');
  if (isNaN(inputDate.getTime())) {
    return { isValid: false, errorMessage: 'Invalid date' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  // Check for future date
  if (inputDate > todayEnd) {
    return { isValid: false, errorMessage: 'Cannot mark outfits as worn for future dates' };
  }

  // Check for date older than 30 days
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  if (inputDate < thirtyDaysAgo) {
    return { isValid: false, errorMessage: 'Cannot mark outfits as worn for dates older than 30 days' };
  }

  return { isValid: true };
}
