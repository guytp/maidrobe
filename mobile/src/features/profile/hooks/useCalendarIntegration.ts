/**
 * React Query hook for fetching calendar integration status.
 *
 * Provides reactive data fetching for calendar integration state with:
 * - Automatic caching and refetching
 * - Error state management
 * - Loading indicators
 * - Background refresh support
 *
 * @module features/profile/hooks/useCalendarIntegration
 */

import { useQuery } from '@tanstack/react-query';
import { useStore } from '../../../core/state/store';
import {
  getCalendarIntegration,
  CalendarIntegrationError,
} from '../api/calendarIntegrationRepository';
import { type CalendarIntegration, type CalendarProvider } from '../types';

/**
 * Return type for useCalendarIntegration hook.
 */
export interface UseCalendarIntegrationResult {
  /**
   * The calendar integration data.
   */
  integration: CalendarIntegration | null;

  /**
   * Whether the query is currently loading.
   */
  isLoading: boolean;

  /**
   * Whether the query encountered an error.
   */
  isError: boolean;

  /**
   * Whether the query is refetching in the background.
   */
  isRefetching: boolean;

  /**
   * The error that occurred, if any.
   */
  error: CalendarIntegrationError | null;

  /**
   * Function to manually refetch the data.
   */
  refetch: () => void;
}

/**
 * React Query hook for fetching calendar integration status.
 *
 * Automatically fetches the calendar integration for the authenticated user
 * and manages caching, loading states, and error handling.
 *
 * Features:
 * - Stale data refetching when app regains focus
 * - Automatic retry on network errors (2 attempts)
 * - Selective refetching based on user ID
 * - Proper error classification for UI feedback
 *
 * @param provider - The calendar provider to check (default: 'google')
 * @returns Object containing integration data, loading states, and refetch function
 *
 * @example
 * ```tsx
 * function GoogleCalendarStatus() {
 *   const { integration, isLoading, isError, error, refetch } = useCalendarIntegration('google');
 *
 *   if (isLoading) {
 *     return <ActivityIndicator size="small" />;
 *   }
 *
 *   if (isError) {
 *     return <Text style={{ color: colors.error }}>Connection error</Text>;
 *   }
 *
 *   if (integration?.isConnected) {
 *     return (
 *       <Text style={{ color: colors.success }}>
 *         Connected • {integration.connectedEmail}
 *       </Text>
 *     );
 *   }
 *
 *   return <Text style={{ color: colors.textSecondary }}>Not connected</Text>;
 * }
 * ```
 */
export function useCalendarIntegration(
  provider: CalendarProvider = 'google'
): UseCalendarIntegrationResult {
  const user = useStore((state) => state.user);
  const userId = user?.id;

  const query = useQuery<CalendarIntegration | null, CalendarIntegrationError>({
    queryKey: ['calendar-integration', userId, provider],

    queryFn: async () => {
      if (!userId) {
        throw new CalendarIntegrationError('User not authenticated', 'auth');
      }
      return getCalendarIntegration(userId, provider);
    },

    // Only enable query if user is authenticated
    enabled: !!userId,

    // Refetch stale data when component mounts or app regains focus
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,

    // Retry configuration for network errors
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error.code === 'auth' || error.code === 'validation') {
        return false;
      }
      // Retry network/server errors up to 2 times
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => {
      // Exponential backoff starting at 1s
      return Math.min(1000 * 2 ** attemptIndex, 5000);
    },
  });

  const integration = query.data ?? null;
  const error = query.error ?? null;

  return {
    integration,
    isLoading: query.isLoading,
    isError: query.isError,
    isRefetching: query.isRefetching,
    error,
    refetch: query.refetch,
  };
}
