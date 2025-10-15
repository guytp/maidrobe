import { QueryClient } from '@tanstack/react-query';

/**
 * Global React Query client instance with optimized caching configuration
 *
 * This client implements a stale-while-revalidate (SWR) caching strategy that
 * balances data freshness with performance. The SWR pattern allows the app to
 * serve cached (stale) data immediately while fetching fresh data in the background,
 * providing instant UI updates and seamless user experience.
 *
 * Configuration Rationale:
 *
 * staleTime (5 minutes):
 * - Data is considered fresh for 5 minutes after fetching
 * - During this window, React Query serves cached data without refetching
 * - Reduces unnecessary network requests for frequently accessed data
 * - Balances data freshness with API load and user experience
 * - Appropriate for user profile data, settings, and semi-static content
 *
 * gcTime (10 minutes):
 * - Cached data is kept in memory for 10 minutes after last use
 * - Longer than staleTime to support stale-while-revalidate pattern
 * - Allows serving stale data immediately while revalidating in background
 * - After 10 minutes of inactivity, data is garbage collected to free memory
 * - Prevents memory leaks while maintaining good cache hit rates
 *
 * Stale-While-Revalidate Strategy:
 * When data is older than staleTime (5 min) but younger than gcTime (10 min):
 * 1. React Query immediately returns the cached (stale) data to the component
 * 2. Simultaneously triggers a background refetch to get fresh data
 * 3. Updates the UI when fresh data arrives, without loading states
 * 4. User sees instant response with eventual consistency
 *
 * This pattern is optimal for mobile apps where perceived performance is critical
 * and users expect instant interactions even with slightly stale data.
 *
 * @see {@link https://tanstack.com/query/latest/docs/react/guides/caching}
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data remains fresh for 5 minutes - no refetch during this period
      staleTime: 1000 * 60 * 5, // 5 minutes
      // Cache persists for 10 minutes after last use - enables stale-while-revalidate
      gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
