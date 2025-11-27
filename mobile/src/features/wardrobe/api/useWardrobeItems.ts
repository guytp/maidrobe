/**
 * React Query hook for fetching wardrobe items with infinite scroll.
 *
 * Provides a complete data layer for the wardrobe grid with:
 * - Infinite scroll pagination
 * - Backend-powered search
 * - Automatic cache management
 * - Error classification and telemetry
 * - Loading and error states
 *
 * @module features/wardrobe/api/useWardrobeItems
 */

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { useStore } from '../../../core/state/store';
import { logError, trackCaptureEvent, type ErrorClassification } from '../../../core/telemetry';
import { fetchWardrobeItems, FetchWardrobeItemsError } from './fetchWardrobeItems';
import {
  type WardrobeGridItem,
  type FetchWardrobeItemsResponse,
  DEFAULT_PAGE_SIZE,
} from '../types';

/**
 * Query key factory for wardrobe items.
 *
 * Creates consistent cache keys that include userId per code guidelines.
 * Search queries are included as an object for easy cache management.
 * Single item queries use a dedicated 'detail' segment for cache isolation.
 */
export const wardrobeItemsQueryKey = {
  /**
   * Base key for all wardrobe item queries.
   */
  all: ['wardrobe', 'items'] as const,

  /**
   * Key for a specific user's wardrobe items.
   */
  user: (userId: string) => [...wardrobeItemsQueryKey.all, userId] as const,

  /**
   * Key for a specific user's wardrobe items with search filter.
   */
  search: (userId: string, searchQuery: string | undefined) =>
    [...wardrobeItemsQueryKey.user(userId), { search: searchQuery ?? '' }] as const,

  /**
   * Key for a specific item's detail view.
   *
   * Uses a 'detail' segment to isolate from grid queries while maintaining
   * the hierarchical structure for cache invalidation.
   *
   * @param userId - User ID for RLS compliance
   * @param itemId - Specific item ID to fetch
   * @returns Query key array: ['wardrobe', 'items', userId, 'detail', itemId]
   */
  detail: (userId: string, itemId: string) =>
    [...wardrobeItemsQueryKey.user(userId), 'detail', itemId] as const,
};

/**
 * Parameters for useWardrobeItems hook.
 */
export interface UseWardrobeItemsParams {
  /**
   * Optional search query for filtering items.
   * When provided, filters items by name and tags using case-insensitive ILIKE.
   */
  searchQuery?: string;

  /**
   * Number of items to fetch per page.
   * @default 20
   */
  pageSize?: number;

  /**
   * Whether the query should execute.
   * Useful for conditional fetching.
   * @default true (when user is authenticated)
   */
  enabled?: boolean;
}

/**
 * Return type for useWardrobeItems hook.
 *
 * Provides a clean interface for the UI layer without exposing
 * React Query or Supabase implementation details.
 */
export interface UseWardrobeItemsResult {
  /**
   * Flattened array of all loaded wardrobe items.
   * Empty array when loading or no items exist.
   */
  items: WardrobeGridItem[];

  /**
   * Total count of items matching the current query.
   * Useful for showing "X items" in UI.
   */
  totalCount: number;

  /**
   * Whether the initial data is being loaded.
   * True only on first load, not during pagination.
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
  error: FetchWardrobeItemsError | null;

  /**
   * Whether more items are available to load.
   */
  hasNextPage: boolean;

  /**
   * Whether the next page is currently being fetched.
   */
  isFetchingNextPage: boolean;

  /**
   * Whether any fetch is in progress (initial or pagination).
   */
  isFetching: boolean;

  /**
   * Function to load the next page of items.
   * No-op if no more pages exist or already fetching.
   */
  fetchNextPage: () => void;

  /**
   * Function to refetch all data.
   * Useful for manual refresh or retry after error.
   */
  refetch: () => void;
}

/**
 * Maps FetchWardrobeItemsError code to telemetry ErrorClassification.
 */
function mapErrorToClassification(error: FetchWardrobeItemsError): ErrorClassification {
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
 * React Query hook for fetching wardrobe items with infinite scroll.
 *
 * This hook provides everything needed to display the wardrobe grid:
 * - Paginated data fetching with automatic page management
 * - Backend-powered search on name and tags
 * - Loading, error, and pagination states
 * - Automatic refetch on navigation focus
 * - Cache invalidation support
 *
 * Query configuration:
 * - Cache key: ['wardrobe', 'items', userId, { search: searchQuery }]
 * - Stale time: 30 seconds (default from queryClient)
 * - Refetch on mount: true (ensures fresh data on navigation)
 * - Retry: per queryClient defaults (3 attempts with backoff)
 *
 * @param params - Optional parameters for search and pagination
 * @returns Object containing items, loading states, and pagination controls
 *
 * @example
 * ```tsx
 * function WardrobeGrid() {
 *   const {
 *     items,
 *     isLoading,
 *     isError,
 *     hasNextPage,
 *     fetchNextPage,
 *     isFetchingNextPage,
 *   } = useWardrobeItems({ searchQuery: debouncedSearch });
 *
 *   if (isLoading) return <Loading />;
 *   if (isError) return <Error onRetry={refetch} />;
 *
 *   return (
 *     <FlatList
 *       data={items}
 *       onEndReached={() => hasNextPage && fetchNextPage()}
 *       ListFooterComponent={isFetchingNextPage ? <Loading /> : null}
 *     />
 *   );
 * }
 * ```
 */
export function useWardrobeItems(params: UseWardrobeItemsParams = {}): UseWardrobeItemsResult {
  const { searchQuery, pageSize = DEFAULT_PAGE_SIZE, enabled = true } = params;
  const user = useStore((state) => state.user);
  const userId = user?.id;

  // Track when query starts for telemetry
  // We intentionally reset the start time when searchQuery changes to measure
  // the latency of each new search query
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queryStartTime = useMemo(() => Date.now(), [searchQuery]);

  const query = useInfiniteQuery<FetchWardrobeItemsResponse, FetchWardrobeItemsError>({
    queryKey: wardrobeItemsQueryKey.search(userId ?? '', searchQuery),
    queryFn: async ({ pageParam = 0 }) => {
      if (!userId) {
        throw new FetchWardrobeItemsError('User not authenticated', 'auth');
      }

      const result = await fetchWardrobeItems({
        userId,
        pageSize,
        offset: pageParam as number,
        searchQuery,
      });

      // Track successful load for first page
      if (pageParam === 0) {
        const latency = Date.now() - queryStartTime;
        trackCaptureEvent('wardrobe_items_loaded', {
          userId,
          itemCount: result.items.length,
          totalItems: result.total,
          hasSearchQuery: !!searchQuery,
          latencyMs: latency,
        });

        // Track time to first item for observability (AC15)
        if (result.items.length > 0) {
          trackCaptureEvent('wardrobe_time_to_first_item', {
            userId,
            latencyMs: latency,
            hasSearchQuery: !!searchQuery,
          });
        }

        // User story #241 spec-compliant event: item_search_used
        // Emitted when a meaningful search is applied and results are updated.
        // Only fires for non-empty queries to distinguish active searches from
        // clearing the search field or initial load without search.
        // Properties per spec: query_length, results_count_bucket, search_latency_ms
        if (searchQuery && searchQuery.length > 0) {
          // Calculate results count bucket per spec: "0", "1-5", ">5"
          const resultsCountBucket: '0' | '1-5' | '>5' =
            result.total === 0 ? '0' : result.total <= 5 ? '1-5' : '>5';

          trackCaptureEvent('item_search_used', {
            userId,
            query_length: searchQuery.length,
            results_count_bucket: resultsCountBucket,
            search_latency_ms: latency,
          });
        }
      } else {
        // Track pagination event
        trackCaptureEvent('wardrobe_pagination_triggered', {
          userId,
          page: Math.floor((pageParam as number) / pageSize),
          itemCount: result.items.length,
          hasSearchQuery: !!searchQuery,
        });
      }

      return result;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // Calculate total items loaded across all pages
      const loadedCount = allPages.reduce((sum, page) => sum + page.items.length, 0);

      // Return next offset if more items exist, undefined otherwise
      if (lastPage.hasMore && loadedCount < lastPage.total) {
        return loadedCount;
      }
      return undefined;
    },
    // Only run query when user is authenticated and hook is enabled
    enabled: !!userId && enabled,
    // Refetch on mount to ensure fresh data when navigating back
    refetchOnMount: true,
    // Use longer stale time for search queries to reduce re-fetches while typing
    staleTime: searchQuery ? 60 * 1000 : 30 * 1000,
  });

  // Log errors for telemetry when error state changes
  // Using useEffect ensures logging happens once per distinct error occurrence
  // rather than on every re-render when query.error is truthy
  useEffect(() => {
    if (query.error) {
      const classification = mapErrorToClassification(query.error);
      logError(query.error, classification, {
        feature: 'wardrobe',
        operation: 'fetchItems',
        metadata: {
          userId,
          hasSearchQuery: !!searchQuery,
          errorCode: query.error.code,
        },
      });

      // Track error event
      trackCaptureEvent('wardrobe_items_load_failed', {
        userId,
        errorCode: query.error.code,
        errorMessage: query.error.message,
        hasSearchQuery: !!searchQuery,
      });
    }
  }, [query.error, userId, searchQuery]);

  // Flatten all pages into a single items array
  const items = useMemo(() => {
    if (!query.data?.pages) return [];
    return query.data.pages.flatMap((page) => page.items);
  }, [query.data?.pages]);

  // Get total count from the most recent page (it's consistent across pages)
  const totalCount = useMemo(() => {
    if (!query.data?.pages?.length) return 0;
    return query.data.pages[0].total;
  }, [query.data?.pages]);

  // Memoized fetchNextPage to avoid unnecessary re-renders
  const fetchNextPage = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [query]);

  // Memoized refetch
  const refetch = useCallback(() => {
    query.refetch();
  }, [query]);

  return {
    items,
    totalCount,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
    isFetching: query.isFetching,
    fetchNextPage,
    refetch,
  };
}

/**
 * Hook to invalidate wardrobe items cache.
 *
 * Useful after creating, updating, or deleting items to ensure
 * the grid shows fresh data.
 *
 * @returns Function to invalidate cache for current user
 *
 * @example
 * ```tsx
 * const invalidateWardrobeItems = useInvalidateWardrobeItems();
 *
 * async function handleItemCreated() {
 *   await saveItem();
 *   invalidateWardrobeItems();
 * }
 * ```
 */
export function useInvalidateWardrobeItems(): () => void {
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);

  return useCallback(() => {
    if (user?.id) {
      // Invalidate all queries for this user's wardrobe items
      queryClient.invalidateQueries({
        queryKey: wardrobeItemsQueryKey.user(user.id),
      });
    }
  }, [queryClient, user?.id]);
}

/**
 * Hook to prefetch wardrobe items.
 *
 * Useful for optimistic data loading, e.g., when user is about
 * to navigate to the wardrobe screen.
 *
 * @returns Function to prefetch wardrobe items
 *
 * @example
 * ```tsx
 * const prefetchWardrobeItems = usePrefetchWardrobeItems();
 *
 * // Prefetch when button is focused
 * <Button onFocus={prefetchWardrobeItems}>Go to Wardrobe</Button>
 * ```
 */
export function usePrefetchWardrobeItems(): () => void {
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);

  return useCallback(() => {
    if (user?.id) {
      queryClient.prefetchInfiniteQuery({
        queryKey: wardrobeItemsQueryKey.search(user.id, undefined),
        queryFn: async () =>
          fetchWardrobeItems({
            userId: user.id,
            pageSize: DEFAULT_PAGE_SIZE,
            offset: 0,
          }),
        initialPageParam: 0,
      });
    }
  }, [queryClient, user?.id]);
}
