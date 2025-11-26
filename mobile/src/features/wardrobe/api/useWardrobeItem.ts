/**
 * React Query hook for fetching a single wardrobe item.
 *
 * Provides a complete data layer for the item detail screen with:
 * - Single item fetching with full detail projection
 * - Automatic cache management aligned with grid queries
 * - Error classification and telemetry
 * - Loading and error states
 *
 * @module features/wardrobe/api/useWardrobeItem
 */

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useStore } from '../../../core/state/store';
import { logError, trackCaptureEvent, type ErrorClassification } from '../../../core/telemetry';
import { fetchWardrobeItem, FetchWardrobeItemError } from './fetchWardrobeItem';
import { wardrobeItemsQueryKey } from './useWardrobeItems';
import type { ItemDetail } from '../types';

/**
 * Parameters for useWardrobeItem hook.
 */
export interface UseWardrobeItemParams {
  /**
   * The ID of the item to fetch.
   * When undefined or empty, the query will not execute.
   */
  itemId: string | undefined;

  /**
   * Whether the query should execute.
   * Useful for conditional fetching.
   * @default true (when user is authenticated and itemId is provided)
   */
  enabled?: boolean;
}

/**
 * Return type for useWardrobeItem hook.
 *
 * Provides a clean interface for the UI layer without exposing
 * React Query or Supabase implementation details.
 */
export interface UseWardrobeItemResult {
  /**
   * The fetched item detail, or null when loading/error.
   */
  item: ItemDetail | null;

  /**
   * Whether the data is being loaded.
   * True only during initial load, not during background refetches.
   */
  isLoading: boolean;

  /**
   * Whether a fetch error occurred.
   */
  isError: boolean;

  /**
   * The error that occurred, if any.
   * Includes classification for user-friendly messaging.
   */
  error: FetchWardrobeItemError | null;

  /**
   * Whether any fetch is in progress (initial or background).
   */
  isFetching: boolean;

  /**
   * Function to refetch the item data.
   * Useful for manual refresh or retry after error.
   */
  refetch: () => void;
}

/**
 * Maps FetchWardrobeItemError code to telemetry ErrorClassification.
 */
function mapErrorToClassification(error: FetchWardrobeItemError): ErrorClassification {
  switch (error.code) {
    case 'network':
      return 'network';
    case 'auth':
      return 'user';
    case 'notFound':
      return 'user';
    case 'server':
      return 'server';
    default:
      return 'server';
  }
}

/**
 * React Query hook for fetching a single wardrobe item by ID.
 *
 * This hook provides everything needed to display the item detail screen:
 * - Full item data including AI attributes
 * - Loading and error states with classification
 * - Automatic cache management
 * - Telemetry for success and failure
 *
 * Query configuration:
 * - Cache key: ['wardrobe', 'items', userId, 'detail', itemId]
 * - Stale time: 30 seconds (matches grid for consistency)
 * - Refetch on mount: true (ensures fresh data on navigation)
 * - Retry: per queryClient defaults (3 attempts with backoff)
 * - No retry on 'notFound' errors (item doesn't exist)
 *
 * @param params - Parameters including itemId and enabled flag
 * @returns Object containing item, loading states, and refetch function
 *
 * @example
 * ```tsx
 * function ItemDetailScreen() {
 *   const { id } = useLocalSearchParams<{ id: string }>();
 *   const { item, isLoading, isError, error, refetch } = useWardrobeItem({
 *     itemId: id,
 *   });
 *
 *   if (isLoading) return <LoadingSkeleton />;
 *
 *   if (isError) {
 *     if (error?.code === 'notFound') {
 *       // Navigate back to grid
 *       return <NotFoundError onDismiss={() => router.back()} />;
 *     }
 *     return <ErrorState onRetry={refetch} />;
 *   }
 *
 *   return <ItemDetail item={item} />;
 * }
 * ```
 */
export function useWardrobeItem(params: UseWardrobeItemParams): UseWardrobeItemResult {
  const { itemId, enabled = true } = params;
  const user = useStore((state) => state.user);
  const userId = user?.id;

  const query = useQuery<ItemDetail, FetchWardrobeItemError>({
    queryKey: wardrobeItemsQueryKey.detail(userId ?? '', itemId ?? ''),
    queryFn: async () => {
      if (!userId) {
        throw new FetchWardrobeItemError('User not authenticated', 'auth');
      }

      if (!itemId) {
        throw new FetchWardrobeItemError('Item ID is required', 'notFound');
      }

      return fetchWardrobeItem({ userId, itemId });
    },
    // Only run query when user is authenticated, itemId is provided, and enabled
    enabled: !!userId && !!itemId && enabled,
    // Refetch on mount to ensure fresh data when navigating back
    refetchOnMount: true,
    // Match grid stale time for consistency
    staleTime: 30 * 1000,
    // Don't retry on 'notFound' - the item genuinely doesn't exist
    retry: (failureCount, error) => {
      if (error.code === 'notFound') {
        return false;
      }
      // Default retry behavior for other errors (up to 3 times)
      return failureCount < 3;
    },
  });

  // Log errors for telemetry when error state changes
  useEffect(() => {
    if (query.error) {
      const classification = mapErrorToClassification(query.error);
      logError(query.error, classification, {
        feature: 'wardrobe',
        operation: 'fetchItem',
        metadata: {
          userId,
          itemId,
          errorCode: query.error.code,
        },
      });

      // Track error event
      trackCaptureEvent('wardrobe_items_load_failed', {
        userId,
        errorCode: query.error.code,
        errorMessage: query.error.message,
        itemId,
      });
    }
  }, [query.error, userId, itemId]);

  return {
    item: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
