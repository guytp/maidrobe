import { QueryClient } from '@tanstack/react-query';

/**
 * Global React Query client configuration.
 *
 * Implements stale-while-revalidate caching strategy with:
 * - 30s stale time for balance between freshness and network efficiency
 * - 5 minute cache time to keep data available during navigation
 * - Exponential backoff retry with 3 attempts
 * - Query retries disabled on 4xx errors (client errors)
 *
 * All cache keys must include userId per code guidelines.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale-while-revalidate: data considered fresh for 30 seconds
      staleTime: 30 * 1000,
      // Keep unused data in cache for 5 minutes
      gcTime: 5 * 60 * 1000,
      // Retry failed requests with exponential backoff
      retry: (failureCount, error) => {
        // Don't retry on 4xx client errors
        if (error instanceof Error && 'status' in error) {
          const status = (error as { status: number }).status;
          if (status >= 400 && status < 500) {
            return false;
          }
        }
        // Retry up to 3 times for network/server errors
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) =>
        Math.min(1000 * 2 ** attemptIndex + Math.random() * 1000, 30000),
      // Don't refetch on window focus in mobile context
      refetchOnWindowFocus: false,
      // Refetch on reconnect to handle offline scenarios
      refetchOnReconnect: true,
    },
    mutations: {
      // Retry mutations once on network errors
      retry: 1,
      retryDelay: 1000,
    },
  },
});
