/**
 * React Query mutation hook for deleting a wardrobe item.
 *
 * Provides a complete mutation layer for the item delete flow with:
 * - Edge Function invocation for server-side deletion
 * - Automatic cache removal on success
 * - Error classification and telemetry
 * - Loading and error states
 *
 * @module features/wardrobe/api/useDeleteWardrobeItem
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useStore } from '../../../core/state/store';
import { logError, trackCaptureEvent, type ErrorClassification } from '../../../core/telemetry';
import { deleteWardrobeItem, DeleteWardrobeItemError } from './deleteWardrobeItem';
import { wardrobeItemsQueryKey } from './useWardrobeItems';

/**
 * Parameters for the useDeleteWardrobeItem hook mutation.
 */
export interface UseDeleteWardrobeItemMutationParams {
  /** Item ID to delete */
  itemId: string;
}

/**
 * Return type for useDeleteWardrobeItem hook.
 *
 * Provides a clean interface for the UI layer without exposing
 * React Query implementation details directly.
 */
export interface UseDeleteWardrobeItemResult {
  /**
   * Function to trigger the delete mutation.
   */
  deleteItem: (params: UseDeleteWardrobeItemMutationParams) => void;

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
  error: DeleteWardrobeItemError | null;

  /**
   * Reset the mutation state (clears error, success).
   */
  reset: () => void;
}

/**
 * Maps DeleteWardrobeItemError code to telemetry ErrorClassification.
 */
function mapErrorToClassification(error: DeleteWardrobeItemError): ErrorClassification {
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
 * React Query mutation hook for deleting a wardrobe item.
 *
 * This hook provides everything needed for the delete functionality:
 * - Invokes Edge Function for server-side deletion
 * - Removes item from cache on success (immediate, not just invalidate)
 * - Invalidates grid queries to ensure consistency
 * - Error classification for appropriate UI feedback
 * - Telemetry logging for observability
 *
 * Cache strategy:
 * - On success: Removes item from detail cache immediately
 * - Also invalidates all user's wardrobe grid queries
 * - Uses removeQueries for immediate cache cleanup
 *
 * @returns Object containing mutation function, states, and reset
 *
 * @example
 * ```tsx
 * function ItemDetailScreen({ itemId }) {
 *   const { deleteItem, isPending, isError, error, reset } = useDeleteWardrobeItem();
 *
 *   const handleDelete = () => {
 *     Alert.alert(
 *       'Delete item?',
 *       'This cannot be undone.',
 *       [
 *         { text: 'Cancel', style: 'cancel' },
 *         {
 *           text: 'Delete',
 *           style: 'destructive',
 *           onPress: () => deleteItem({ itemId }),
 *         },
 *       ]
 *     );
 *   };
 *
 *   // On success, navigate back to grid
 *   useEffect(() => {
 *     if (isSuccess) {
 *       router.back();
 *     }
 *   }, [isSuccess]);
 *
 *   return (
 *     <Button
 *       onPress={handleDelete}
 *       loading={isPending}
 *       disabled={isPending}
 *     >
 *       Delete
 *     </Button>
 *   );
 * }
 * ```
 */
export function useDeleteWardrobeItem(): UseDeleteWardrobeItemResult {
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);
  const userId = user?.id;

  const mutation = useMutation<void, DeleteWardrobeItemError, UseDeleteWardrobeItemMutationParams>({
    mutationKey: ['wardrobe', 'deleteItem', userId],
    mutationFn: async (params: UseDeleteWardrobeItemMutationParams) => {
      if (!userId) {
        throw new DeleteWardrobeItemError('User not authenticated', 'auth');
      }

      const startTime = Date.now();

      try {
        await deleteWardrobeItem({ itemId: params.itemId });

        // Track successful deletion
        const latency = Date.now() - startTime;

        // Legacy event for backward compatibility
        trackCaptureEvent('wardrobe_item_deleted', {
          userId,
          itemId: params.itemId,
          latencyMs: latency,
        });

        // New event per user story spec
        trackCaptureEvent('item_deleted', {
          userId,
          itemId: params.itemId,
          latencyMs: latency,
        });
      } catch (error) {
        // Track failed deletion
        if (error instanceof DeleteWardrobeItemError) {
          // Legacy event for backward compatibility
          trackCaptureEvent('wardrobe_item_delete_failed', {
            userId,
            itemId: params.itemId,
            errorCode: error.code,
            errorMessage: error.message,
          });

          // User story #241 spec-compliant event: item_deletion_failed
          // Properties per spec: error_type (enum)
          trackCaptureEvent('item_deletion_failed', {
            userId,
            itemId: params.itemId,
            error_type: error.code,
          });
        }
        throw error;
      }
    },
    onSuccess: (_data, variables) => {
      if (userId) {
        // Remove the item from detail cache immediately
        // Using removeQueries ensures it's gone from cache, not just marked stale
        queryClient.removeQueries({
          queryKey: wardrobeItemsQueryKey.detail(userId, variables.itemId),
        });

        // Invalidate all user's wardrobe grid queries
        // This triggers a refetch when user navigates back to the grid
        queryClient.invalidateQueries({
          queryKey: wardrobeItemsQueryKey.user(userId),
        });
      }
    },
    onError: (error) => {
      // Log error for telemetry
      const classification = mapErrorToClassification(error);
      logError(error, classification, {
        feature: 'wardrobe',
        operation: 'deleteItem',
        metadata: {
          userId,
          errorCode: error.code,
        },
      });
    },
    // Don't retry on auth or validation errors
    retry: (failureCount, error) => {
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

  // Memoized delete function
  const deleteItem = useCallback(
    (params: UseDeleteWardrobeItemMutationParams) => {
      mutation.mutate(params);
    },
    [mutation]
  );

  // Memoized reset function
  const reset = useCallback(() => {
    mutation.reset();
  }, [mutation]);

  return {
    deleteItem,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error ?? null,
    reset,
  };
}
