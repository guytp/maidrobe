/**
 * React Query mutation hook for creating/updating wear events.
 *
 * Provides a complete mutation layer for the mark-as-worn flows with:
 * - Optimistic UI updates
 * - Automatic cache invalidation on success
 * - Error classification and telemetry
 * - Loading and error states
 *
 * @module features/wearHistory/hooks/useCreateWearEvent
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useStore } from '../../../core/state/store';
import { logError, trackCaptureEvent, type ErrorClassification } from '../../../core/telemetry';
import {
  createOrUpdateWearEventForClient,
  wearHistoryQueryKey,
  WearHistoryClientError,
  getTodayDateString,
  type CreateWearEventForClientPayload,
  type CreateWearEventResult,
} from '../api/wearHistoryClient';
import type { WearHistoryRow, WearHistorySource } from '../types';

// ============================================================================
// Hook Types
// ============================================================================

/**
 * Parameters for the createWearEvent mutation.
 *
 * This is a simplified interface compared to the full client payload,
 * as userId is automatically injected from auth state.
 */
export interface CreateWearEventParams {
  /** Outfit ID being marked as worn */
  outfitId: string;

  /** Snapshot of item IDs in the outfit at the time of wear */
  itemIds: string[];

  /** User-local calendar date (YYYY-MM-DD). Defaults to today if not provided. */
  wornDate?: string;

  /** Precise timestamp when marked as worn (ISO 8601). Defaults to now. */
  wornAt?: string;

  /** Source indicating how the outfit was selected */
  source: WearHistorySource;

  /** Optional occasion/context description */
  context?: string;
}

/**
 * Return type for useCreateWearEvent hook.
 *
 * Provides a clean interface for the UI layer without exposing
 * React Query implementation details directly.
 */
export interface UseCreateWearEventResult {
  /**
   * Function to trigger the create/update wear event mutation.
   * UserId is automatically injected from auth state.
   */
  createWearEvent: (params: CreateWearEventParams) => void;

  /**
   * Async version that returns a promise for the result.
   * Useful when you need to await the mutation outcome.
   */
  createWearEventAsync: (params: CreateWearEventParams) => Promise<CreateWearEventResult>;

  /**
   * Whether the mutation is currently in progress.
   */
  isPending: boolean;

  /**
   * Whether the mutation succeeded.
   */
  isSuccess: boolean;

  /**
   * Whether the mutation failed.
   */
  isError: boolean;

  /**
   * The created/updated wear history record on success.
   */
  data: WearHistoryRow | null;

  /**
   * Whether the last operation was an update to existing record.
   * Null if no operation completed yet.
   */
  wasUpdate: boolean | null;

  /**
   * The error that occurred, if any.
   */
  error: WearHistoryClientError | null;

  /**
   * Reset the mutation state (clears error, success, data).
   */
  reset: () => void;
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Internal mutation variables including resolved userId.
 */
interface MutationVariables {
  params: CreateWearEventParams;
  userId: string;
}

/**
 * Internal mutation context for success handling.
 */
interface MutationResult {
  data: WearHistoryRow;
  isUpdate: boolean;
}

// ============================================================================
// Telemetry Helpers
// ============================================================================

/**
 * Maps WearHistoryClientError code to telemetry ErrorClassification.
 */
function mapErrorToClassification(error: WearHistoryClientError): ErrorClassification {
  switch (error.code) {
    case 'network':
      return 'network';
    case 'auth':
      return 'user';
    case 'validation':
      return 'user';
    case 'server':
    default:
      return 'server';
  }
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * React Query mutation hook for creating/updating wear events.
 *
 * This hook provides everything needed for the mark-as-worn functionality:
 * - Automatic userId injection from auth state
 * - Default wornDate to today if not provided
 * - Cache invalidation on success
 * - Error classification for appropriate UI feedback
 * - Telemetry logging for observability
 *
 * CACHE STRATEGY:
 * On success, the hook invalidates:
 * - User's wear history list (for timeline refresh)
 * - Specific outfit+date key (for idempotency lookups)
 *
 * IDEMPOTENCY:
 * Multiple calls for the same outfit+date update the existing record
 * rather than creating duplicates. The `wasUpdate` field indicates
 * whether the operation was an update.
 *
 * @returns Object containing mutation function, states, and reset
 *
 * @example
 * ```tsx
 * function OutfitCard({ outfit }) {
 *   const { createWearEvent, isPending, isSuccess, error, reset } = useCreateWearEvent();
 *
 *   const handleWearToday = () => {
 *     createWearEvent({
 *       outfitId: outfit.id,
 *       itemIds: outfit.itemIds,
 *       source: 'ai_recommendation',
 *     });
 *   };
 *
 *   useEffect(() => {
 *     if (isSuccess) {
 *       showToast('Marked as worn!');
 *     }
 *   }, [isSuccess]);
 *
 *   return (
 *     <Button onPress={handleWearToday} loading={isPending}>
 *       Wear this today
 *     </Button>
 *   );
 * }
 * ```
 */
export function useCreateWearEvent(): UseCreateWearEventResult {
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);
  const userId = user?.id;

  const mutation = useMutation<MutationResult, WearHistoryClientError, MutationVariables>({
    mutationKey: ['wear-history', 'createOrUpdate', userId],

    mutationFn: async (variables: MutationVariables): Promise<MutationResult> => {
      const { params, userId: varUserId } = variables;

      // Build the full payload
      const payload: CreateWearEventForClientPayload = {
        userId: varUserId,
        outfitId: params.outfitId,
        itemIds: params.itemIds,
        wornDate: params.wornDate ?? getTodayDateString(),
        wornAt: params.wornAt ?? new Date().toISOString(),
        source: params.source,
        context: params.context,
      };

      const startTime = Date.now();
      const result = await createOrUpdateWearEventForClient(payload);

      if (result.success) {
        // Track successful wear event
        const latencyMs = Date.now() - startTime;

        trackCaptureEvent('wear_history_marked', {
          userId: varUserId,
          itemId: params.outfitId, // Using itemId field for outfitId
          latencyMs,
          metadata: {
            outfitId: params.outfitId,
            source: params.source, // WearHistorySource goes in metadata
            itemCount: params.itemIds.length,
            wornDate: payload.wornDate,
            hasContext: !!params.context,
            isUpdate: result.isUpdate,
          },
        });

        return {
          data: result.data,
          isUpdate: result.isUpdate,
        };
      }

      // Track failed wear event
      trackCaptureEvent('wear_history_mark_failed', {
        userId: varUserId,
        itemId: params.outfitId,
        errorCode: result.error.code,
        errorMessage: result.error.message,
        metadata: {
          outfitId: params.outfitId,
          source: params.source, // WearHistorySource goes in metadata
          isRetryable: result.error.isRetryable,
        },
      });

      throw result.error;
    },

    onSuccess: (result, variables) => {
      const { params, userId: varUserId } = variables;
      const wornDate = params.wornDate ?? getTodayDateString();

      // Invalidate user's wear history list
      queryClient.invalidateQueries({
        queryKey: wearHistoryQueryKey.user(varUserId),
      });

      // Also invalidate any window queries that might include this date
      // This is a broad invalidation but ensures consistency
      queryClient.invalidateQueries({
        queryKey: [...wearHistoryQueryKey.all, varUserId, 'window'],
        exact: false,
      });

      // Set the specific outfit+date query data directly
      // This allows immediate lookups for idempotency checks
      queryClient.setQueryData(
        wearHistoryQueryKey.forOutfitDate(varUserId, params.outfitId, wornDate),
        result.data
      );
    },

    onError: (error, variables) => {
      // Log error for telemetry
      const classification = mapErrorToClassification(error);
      logError(error, classification, {
        feature: 'wearHistory',
        operation: 'createOrUpdateWearEvent',
        metadata: {
          userId: variables.userId,
          outfitId: variables.params.outfitId,
          errorCode: error.code,
          isRetryable: error.isRetryable,
        },
      });
    },

    // Retry configuration
    retry: (failureCount, error) => {
      // Don't retry auth or validation errors
      if (error.code === 'validation' || error.code === 'auth') {
        return false;
      }
      // Retry network/server errors up to 2 times
      return failureCount < 2;
    },

    retryDelay: (attemptIndex) => {
      // Exponential backoff with jitter
      return Math.min(1000 * 2 ** attemptIndex * (0.5 + Math.random()), 10000);
    },
  });

  // Memoized fire-and-forget mutation function
  const createWearEvent = useCallback(
    (params: CreateWearEventParams) => {
      if (!userId) {
        // Log error but don't throw - the mutation will handle auth errors
        logError(new Error('Cannot create wear event: user not authenticated'), 'user', {
          feature: 'wearHistory',
          operation: 'createWearEvent_guard',
        });
        return;
      }

      mutation.mutate({ params, userId });
    },
    [mutation, userId]
  );

  // Memoized async mutation function that returns the result
  const createWearEventAsync = useCallback(
    async (params: CreateWearEventParams): Promise<CreateWearEventResult> => {
      if (!userId) {
        return {
          success: false,
          error: new WearHistoryClientError('User not authenticated', 'auth', false),
        };
      }

      try {
        const result = await mutation.mutateAsync({ params, userId });
        return {
          success: true,
          data: result.data,
          isUpdate: result.isUpdate,
        };
      } catch (error) {
        if (error instanceof WearHistoryClientError) {
          return { success: false, error };
        }
        return {
          success: false,
          error: WearHistoryClientError.fromUnknown(error),
        };
      }
    },
    [mutation, userId]
  );

  // Memoized reset function
  const reset = useCallback(() => {
    mutation.reset();
  }, [mutation]);

  return {
    createWearEvent,
    createWearEventAsync,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    data: mutation.data?.data ?? null,
    wasUpdate: mutation.data?.isUpdate ?? null,
    error: mutation.error ?? null,
    reset,
  };
}

/**
 * Hook for invalidating wear history cache.
 *
 * Useful when external changes (e.g., offline sync completion)
 * require refreshing the wear history data.
 *
 * @returns Function to invalidate wear history cache for current user
 */
export function useInvalidateWearHistory(): () => void {
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);

  return useCallback(() => {
    if (user?.id) {
      queryClient.invalidateQueries({
        queryKey: wearHistoryQueryKey.user(user.id),
      });
    }
  }, [queryClient, user?.id]);
}
