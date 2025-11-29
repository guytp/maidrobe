/**
 * React Query hook for batch fetching wardrobe items.
 *
 * Provides efficient batch fetching of multiple wardrobe items by ID,
 * with automatic cache population for individual item queries. This hook
 * is designed to support the outfit recommendation flow where multiple
 * items need to be resolved efficiently.
 *
 * Features:
 * - Batch fetch with single Supabase query
 * - Populates per-item cache for cross-screen reuse
 * - Error classification and telemetry
 * - Loading and error states
 * - Graceful handling of missing items
 *
 * @module features/wardrobe/api/useBatchWardrobeItems
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback } from 'react';
import { useStore } from '../../../core/state/store';
import { logError, trackCaptureEvent, type ErrorClassification } from '../../../core/telemetry';
import { fetchWardrobeItemsBatch, FetchBatchItemsError } from './fetchWardrobeItemsBatch';
import { wardrobeItemsQueryKey } from './useWardrobeItems';
import type { BatchWardrobeItem, FetchBatchItemsResponse } from '../types';

/**
 * Parameters for useBatchWardrobeItems hook.
 */
export interface UseBatchWardrobeItemsParams {
  /**
   * Array of item IDs to fetch.
   * Should be de-duplicated for efficiency.
   */
  itemIds: string[];

  /**
   * Whether the query should execute.
   * Useful for conditional fetching.
   * @default true (when user is authenticated and itemIds are provided)
   */
  enabled?: boolean;
}

/**
 * Return type for useBatchWardrobeItems hook.
 *
 * Provides a clean interface for the UI layer without exposing
 * React Query or Supabase implementation details.
 */
export interface UseBatchWardrobeItemsResult {
  /**
   * Map of item ID to item data for successfully fetched items.
   * Empty map when loading or no items requested.
   */
  items: Map<string, BatchWardrobeItem>;

  /**
   * Array of item IDs that were requested but not found.
   * Useful for showing placeholder chips.
   */
  missingIds: string[];

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
  error: FetchBatchItemsError | null;

  /**
   * Whether any fetch is in progress (initial or background).
   */
  isFetching: boolean;

  /**
   * Function to refetch the items.
   * Useful for manual refresh or retry after error.
   */
  refetch: () => void;
}

/**
 * Maps FetchBatchItemsError code to telemetry ErrorClassification.
 */
function mapErrorToClassification(error: FetchBatchItemsError): ErrorClassification {
  switch (error.code) {
    case 'network':
      return 'network';
    case 'auth':
      return 'user';
    case 'server':
      return 'server';
    default:
      return 'server';
  }
}

/**
 * React Query hook for batch fetching wardrobe items by ID.
 *
 * This hook provides efficient batch fetching with cache integration:
 * - Fetches multiple items in a single Supabase query
 * - Populates individual item caches for cross-screen reuse
 * - Tracks missing items separately for placeholder display
 * - Integrates with telemetry for error tracking
 *
 * Cache Strategy:
 * - Batch query is cached under ['wardrobe', 'items', userId, 'batch', ...sortedIds]
 * - Each fetched item is also pushed into the detail cache for single-item lookups
 * - This enables cross-screen reuse without re-fetching
 *
 * @param params - Parameters including itemIds and enabled flag
 * @returns Object containing items map, missing IDs, loading states, and refetch function
 *
 * @example
 * ```tsx
 * function OutfitItemChips({ itemIds }: { itemIds: string[] }) {
 *   const { items, missingIds, isLoading, isError } = useBatchWardrobeItems({
 *     itemIds,
 *   });
 *
 *   if (isLoading) return <ChipSkeletons count={itemIds.length} />;
 *   if (isError) return <ErrorChips count={itemIds.length} />;
 *
 *   return (
 *     <>
 *       {itemIds.map(id => {
 *         const item = items.get(id);
 *         if (item) {
 *           return <ItemChip key={id} item={item} />;
 *         }
 *         return <PlaceholderChip key={id} />;
 *       })}
 *     </>
 *   );
 * }
 * ```
 */
export function useBatchWardrobeItems(
  params: UseBatchWardrobeItemsParams
): UseBatchWardrobeItemsResult {
  const { itemIds, enabled = true } = params;
  const user = useStore((state) => state.user);
  const userId = user?.id;
  const queryClient = useQueryClient();

  // Create stable query key based on sorted item IDs
  const queryKey = wardrobeItemsQueryKey.batch(userId ?? '', itemIds);

  const query = useQuery<FetchBatchItemsResponse, FetchBatchItemsError>({
    queryKey,
    queryFn: async () => {
      if (!userId) {
        throw new FetchBatchItemsError('User not authenticated', 'auth');
      }

      return fetchWardrobeItemsBatch({ userId, itemIds });
    },
    // Only run query when user is authenticated, itemIds exist, and enabled
    enabled: !!userId && itemIds.length > 0 && enabled,
    // Refetch on mount to ensure fresh data
    refetchOnMount: true,
    // Match grid stale time for consistency
    staleTime: 30 * 1000,
    // Don't retry on auth errors
    retry: (failureCount, error) => {
      if (error.code === 'auth') {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Populate individual item caches when batch fetch succeeds
  // This enables cross-screen reuse without re-fetching
  useEffect(() => {
    if (query.data && userId) {
      const { items } = query.data;

      // Push each item into the detail cache
      items.forEach((item, itemId) => {
        queryClient.setQueryData(wardrobeItemsQueryKey.detail(userId, itemId), item);
      });
    }
  }, [query.data, userId, queryClient]);

  // Log errors for telemetry when error state changes
  useEffect(() => {
    if (query.error) {
      const classification = mapErrorToClassification(query.error);
      logError(query.error, classification, {
        feature: 'wardrobe',
        operation: 'batchFetchItems',
        metadata: {
          userId,
          itemCount: itemIds.length,
          errorCode: query.error.code,
        },
      });

      // Track error event
      trackCaptureEvent('wardrobe_items_load_failed', {
        userId,
        errorCode: query.error.code,
        errorMessage: query.error.message,
        itemCount: itemIds.length,
      });
    }
  }, [query.error, userId, itemIds.length]);

  // Memoized refetch - using query.refetch directly as it's stable
  const refetch = useCallback(() => {
    query.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.refetch]);

  return {
    items: query.data?.items ?? new Map(),
    missingIds: query.data?.missingIds ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    isFetching: query.isFetching,
    refetch,
  };
}

/**
 * Hook to get a single item from the cache.
 *
 * This is a lightweight accessor that checks if an item exists in the cache
 * without triggering a fetch. Useful for the resolution utility's cache accessor.
 *
 * @param itemId - The item ID to look up
 * @returns The cached item or undefined if not in cache
 */
export function useGetCachedItem(): (itemId: string) => BatchWardrobeItem | undefined {
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);
  const userId = user?.id;

  return useCallback(
    (itemId: string) => {
      if (!userId) return undefined;
      return queryClient.getQueryData<BatchWardrobeItem>(
        wardrobeItemsQueryKey.detail(userId, itemId)
      );
    },
    [queryClient, userId]
  );
}
