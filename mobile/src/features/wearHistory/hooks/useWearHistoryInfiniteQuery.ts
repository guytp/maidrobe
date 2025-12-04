/**
 * React Query hook for fetching wear history with infinite scroll.
 *
 * Provides a complete data layer for the wear history screen with:
 * - Infinite scroll pagination
 * - Automatic cache management
 * - Error classification and telemetry
 * - Loading and error states
 *
 * @module features/wearHistory/hooks/useWearHistoryInfiniteQuery
 */

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { useStore } from '../../../core/state/store';
import { logError, trackCaptureEvent, type ErrorClassification } from '../../../core/telemetry';
import { getWearHistoryForUser, WearHistoryError } from '../api/wearHistoryRepository';
import { wearHistoryQueryKey } from '../api/wearHistoryClient';
import { type GetWearHistoryResponse, type WearHistoryRow, DEFAULT_WEAR_HISTORY_PAGE_SIZE } from '../types';

// ============================================================================
// Hook Types
// ============================================================================

/**
 * Parameters for useWearHistoryInfiniteQuery hook.
 */
export interface UseWearHistoryInfiniteQueryParams {
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
 * Return type for useWearHistoryInfiniteQuery hook.
 *
 * Provides a clean interface for the UI layer without exposing
 * React Query or Supabase implementation details.
 */
export interface UseWearHistoryInfiniteQueryResult {
  /**
   * Flattened array of all loaded wear history events.
   * Empty array when loading or no events exist.
   * Ordered by worn_date DESC, worn_at DESC.
   */
  events: WearHistoryRow[];

  /**
   * Total count of events for the user.
   * Useful for showing "X wears" in UI.
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
  error: WearHistoryError | null;

  /**
   * Whether more events are available to load.
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
   * Function to load the next page of events.
   * No-op if no more pages exist or already fetching.
   */
  fetchNextPage: () => void;

  /**
   * Function to refetch all data.
   * Useful for manual refresh or retry after error.
   */
  refetch: () => void;
}

// ============================================================================
// Telemetry Helpers
// ============================================================================

/**
 * Maps WearHistoryError code to telemetry ErrorClassification.
 */
function mapErrorToClassification(error: WearHistoryError): ErrorClassification {
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

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * React Query hook for fetching wear history with infinite scroll.
 *
 * This hook provides everything needed to display the wear history list:
 * - Paginated data fetching with automatic page management
 * - Server-side ordering by worn_date DESC, worn_at DESC
 * - Loading, error, and pagination states
 * - Automatic refetch on navigation focus
 * - Cache invalidation support
 *
 * Query configuration:
 * - Cache key: ['wear-history', userId]
 * - Stale time: 30 seconds (default from queryClient)
 * - Refetch on mount: true (ensures fresh data on navigation)
 * - Retry: per queryClient defaults (3 attempts with backoff)
 *
 * @param params - Optional parameters for pagination
 * @returns Object containing events, loading states, and pagination controls
 *
 * @example
 * ```tsx
 * function WearHistoryList() {
 *   const {
 *     events,
 *     isLoading,
 *     isError,
 *     hasNextPage,
 *     fetchNextPage,
 *     isFetchingNextPage,
 *   } = useWearHistoryInfiniteQuery();
 *
 *   if (isLoading) return <Loading />;
 *   if (isError) return <Error onRetry={refetch} />;
 *
 *   return (
 *     <SectionList
 *       sections={groupByDate(events)}
 *       onEndReached={() => hasNextPage && fetchNextPage()}
 *       ListFooterComponent={isFetchingNextPage ? <Loading /> : null}
 *     />
 *   );
 * }
 * ```
 */
export function useWearHistoryInfiniteQuery(
  params: UseWearHistoryInfiniteQueryParams = {}
): UseWearHistoryInfiniteQueryResult {
  const { pageSize = DEFAULT_WEAR_HISTORY_PAGE_SIZE, enabled = true } = params;
  const user = useStore((state) => state.user);
  const userId = user?.id;

  // Track when query starts for telemetry
  const queryStartTime = useMemo(() => Date.now(), []);

  const query = useInfiniteQuery<GetWearHistoryResponse, WearHistoryError>({
    queryKey: wearHistoryQueryKey.user(userId ?? ''),
    queryFn: async ({ pageParam = 0 }) => {
      if (!userId) {
        throw new WearHistoryError('User not authenticated', 'auth');
      }

      const result = await getWearHistoryForUser(userId, {
        limit: pageSize,
        offset: pageParam as number,
      });

      // Track successful load for first page
      if (pageParam === 0) {
        const latency = Date.now() - queryStartTime;
        trackCaptureEvent('wear_history_loaded', {
          userId,
          latencyMs: latency,
          metadata: {
            eventCount: result.events.length,
            totalEvents: result.total,
          },
        });

        // Track time to first event for observability
        if (result.events.length > 0) {
          trackCaptureEvent('wear_history_time_to_first_event', {
            userId,
            latencyMs: latency,
          });
        }
      } else {
        // Track pagination event
        trackCaptureEvent('wear_history_pagination_triggered', {
          userId,
          metadata: {
            page: Math.floor((pageParam as number) / pageSize),
            eventCount: result.events.length,
          },
        });
      }

      return result;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // Calculate total events loaded across all pages
      const loadedCount = allPages.reduce((sum, page) => sum + page.events.length, 0);

      // Return next offset if more events exist, undefined otherwise
      if (lastPage.hasMore && loadedCount < lastPage.total) {
        return loadedCount;
      }
      return undefined;
    },
    // Only run query when user is authenticated and hook is enabled
    enabled: !!userId && enabled,
    // Refetch on mount to ensure fresh data when navigating back
    refetchOnMount: true,
    // Use default stale time
    staleTime: 30 * 1000,
  });

  // Log errors for telemetry when error state changes
  // Using useEffect ensures logging happens once per distinct error occurrence
  // rather than on every re-render when query.error is truthy
  useEffect(() => {
    if (query.error) {
      const classification = mapErrorToClassification(query.error);
      logError(query.error, classification, {
        feature: 'wearHistory',
        operation: 'fetchHistory',
        metadata: {
          userId,
          errorCode: query.error.code,
        },
      });

      // Track error event
      trackCaptureEvent('wear_history_load_failed', {
        userId,
        errorCode: query.error.code,
        errorMessage: query.error.message,
      });
    }
  }, [query.error, userId]);

  // Flatten all pages into a single events array
  const events = useMemo(() => {
    if (!query.data?.pages) return [];
    return query.data.pages.flatMap((page) => page.events);
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
    events,
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
 * Hook to invalidate wear history cache.
 *
 * Useful after creating wear events or when external changes
 * require refreshing the wear history data.
 *
 * @returns Function to invalidate wear history cache for current user
 *
 * @example
 * ```tsx
 * const invalidateWearHistory = useInvalidateWearHistoryQuery();
 *
 * async function handleWearEventCreated() {
 *   await createWearEvent();
 *   invalidateWearHistory();
 * }
 * ```
 */
export function useInvalidateWearHistoryQuery(): () => void {
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);

  return useCallback(() => {
    if (user?.id) {
      // Invalidate all queries for this user's wear history
      queryClient.invalidateQueries({
        queryKey: wearHistoryQueryKey.user(user.id),
      });
    }
  }, [queryClient, user?.id]);
}

/**
 * Hook to prefetch wear history.
 *
 * Useful for optimistic data loading, e.g., when user is about
 * to navigate to the wear history screen.
 *
 * @returns Function to prefetch wear history
 *
 * @example
 * ```tsx
 * const prefetchWearHistory = usePrefetchWearHistory();
 *
 * // Prefetch when button is focused
 * <Button onFocus={prefetchWearHistory}>View Wear History</Button>
 * ```
 */
export function usePrefetchWearHistory(): () => void {
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);

  return useCallback(() => {
    if (user?.id) {
      queryClient.prefetchInfiniteQuery({
        queryKey: wearHistoryQueryKey.user(user.id),
        queryFn: async () =>
          getWearHistoryForUser(user.id, {
            limit: DEFAULT_WEAR_HISTORY_PAGE_SIZE,
            offset: 0,
          }),
        initialPageParam: 0,
      });
    }
  }, [queryClient, user?.id]);
}
