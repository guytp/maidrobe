/**
 * React Query mutation hook for updating wardrobe item name and tags.
 *
 * Provides a complete mutation layer for the item detail screen with:
 * - Pessimistic updates (waits for server confirmation)
 * - Automatic cache invalidation on success
 * - Error classification and telemetry
 * - Loading and error states
 *
 * @module features/wardrobe/api/useUpdateWardrobeItem
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useStore } from '../../../core/state/store';
import { logError, trackCaptureEvent, type ErrorClassification } from '../../../core/telemetry';
import { updateWardrobeItem, UpdateWardrobeItemError } from './updateWardrobeItem';
import { wardrobeItemsQueryKey } from './useWardrobeItems';
import type { ItemDetail } from '../types';

/**
 * Parameters for the useUpdateWardrobeItem hook mutation.
 *
 * Omits userId since it's automatically derived from the authenticated user.
 */
export interface UseUpdateWardrobeItemMutationParams {
  /** Item ID to update */
  itemId: string;

  /** New name for the item (required, max 100 chars) */
  name: string;

  /** New tags for the item (max 20 tags, each max 30 chars, lowercased) */
  tags: string[];
}

/**
 * Return type for useUpdateWardrobeItem hook.
 *
 * Provides a clean interface for the UI layer without exposing
 * React Query implementation details directly.
 */
export interface UseUpdateWardrobeItemResult {
  /**
   * Function to trigger the update mutation.
   */
  updateItem: (params: UseUpdateWardrobeItemMutationParams) => void;

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
   * The error that occurred, if any.
   */
  error: UpdateWardrobeItemError | null;

  /**
   * The updated item data on success.
   */
  data: ItemDetail | undefined;

  /**
   * Reset the mutation state (clears error, success, data).
   */
  reset: () => void;
}

/**
 * Maps UpdateWardrobeItemError code to telemetry ErrorClassification.
 */
function mapErrorToClassification(error: UpdateWardrobeItemError): ErrorClassification {
  switch (error.code) {
    case 'network':
      return 'network';
    case 'auth':
      return 'user';
    case 'server':
    case 'notFound':
    case 'validation':
    case 'unknown':
    default:
      return 'server';
  }
}

/**
 * React Query mutation hook for updating wardrobe item name and tags.
 *
 * This hook provides everything needed for the save functionality:
 * - Pessimistic updates that wait for server confirmation
 * - Automatic cache invalidation for grid consistency
 * - Error classification for appropriate UI feedback
 * - Telemetry logging for observability
 *
 * Cache strategy:
 * - On success: Invalidates all user's wardrobe queries to ensure grid freshness
 * - Also updates the detail query cache with the server response
 * - Uses pessimistic updates (no optimistic UI) for data integrity
 *
 * @returns Object containing mutation function, states, and reset
 *
 * @example
 * ```tsx
 * function ItemDetailScreen({ itemId }) {
 *   const { updateItem, isPending, isError, error, reset } = useUpdateWardrobeItem();
 *
 *   const handleSave = () => {
 *     updateItem({
 *       itemId,
 *       name: formName.trim(),
 *       tags: formTags,
 *     });
 *   };
 *
 *   if (isError) {
 *     return <ErrorMessage error={error} onRetry={handleSave} onDismiss={reset} />;
 *   }
 *
 *   return (
 *     <Button onPress={handleSave} loading={isPending}>
 *       Save
 *     </Button>
 *   );
 * }
 * ```
 */
export function useUpdateWardrobeItem(): UseUpdateWardrobeItemResult {
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);
  const userId = user?.id;

  const mutation = useMutation<
    ItemDetail,
    UpdateWardrobeItemError,
    UseUpdateWardrobeItemMutationParams
  >({
    mutationKey: ['wardrobe', 'updateItem', userId],
    mutationFn: async (params: UseUpdateWardrobeItemMutationParams) => {
      if (!userId) {
        throw new UpdateWardrobeItemError('User not authenticated', 'auth');
      }

      const startTime = Date.now();

      try {
        const result = await updateWardrobeItem({
          userId,
          itemId: params.itemId,
          name: params.name,
          tags: params.tags,
        });

        // Track successful update
        const latency = Date.now() - startTime;
        trackCaptureEvent('wardrobe_item_updated', {
          userId,
          itemId: params.itemId,
          hasName: !!params.name.trim(),
          tagCount: params.tags.length,
          latencyMs: latency,
        });

        return result;
      } catch (error) {
        // Track failed update
        if (error instanceof UpdateWardrobeItemError) {
          trackCaptureEvent('wardrobe_item_update_failed', {
            userId,
            itemId: params.itemId,
            errorCode: error.code,
            errorMessage: error.message,
          });
        }
        throw error;
      }
    },
    onSuccess: (data, variables) => {
      // Update the detail query cache with server response
      if (userId) {
        queryClient.setQueryData(
          wardrobeItemsQueryKey.detail(userId, variables.itemId),
          data
        );

        // Invalidate all user's wardrobe queries to ensure grid shows fresh data
        // This triggers a refetch when user navigates back to the grid
        queryClient.invalidateQueries({
          queryKey: wardrobeItemsQueryKey.user(userId),
          // Don't invalidate the detail query we just updated
          predicate: (query) => {
            const key = query.queryKey;
            // Keep the detail query we just updated
            if (
              Array.isArray(key) &&
              key.includes('detail') &&
              key.includes(variables.itemId)
            ) {
              return false;
            }
            return true;
          },
        });
      }
    },
    onError: (error) => {
      // Log error for telemetry
      const classification = mapErrorToClassification(error);
      logError(error, classification, {
        feature: 'wardrobe',
        operation: 'updateItem',
        metadata: {
          userId,
          errorCode: error.code,
        },
      });
    },
    // Don't retry on validation or notFound errors
    retry: (failureCount, error) => {
      if (
        error.code === 'validation' ||
        error.code === 'notFound' ||
        error.code === 'auth'
      ) {
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

  // Memoized update function
  const updateItem = useCallback(
    (params: UseUpdateWardrobeItemMutationParams) => {
      mutation.mutate(params);
    },
    [mutation]
  );

  // Memoized reset function
  const reset = useCallback(() => {
    mutation.reset();
  }, [mutation]);

  return {
    updateItem,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error ?? null,
    data: mutation.data,
    reset,
  };
}
