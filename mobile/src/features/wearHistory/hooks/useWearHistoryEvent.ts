/**
 * React Query hook for fetching a single wear history event by ID.
 *
 * This hook provides access to a specific wear event's details, used by
 * the outfit detail screen to display wear-specific context when navigated
 * from the wear history timeline.
 *
 * Features:
 * - Single event fetch by ID
 * - Automatic cache population
 * - Error classification for UI feedback
 * - Loading and error states
 *
 * @module features/wearHistory/hooks/useWearHistoryEvent
 */

import { useQuery } from '@tanstack/react-query';
import { useStore } from '../../../core/state/store';
import { wearHistoryQueryKey, WearHistoryClientError } from '../api/wearHistoryClient';
import { getWearHistoryEventById, WearHistoryError } from '../api/wearHistoryRepository';
import type { WearHistoryRow } from '../types';

/**
 * Return type for useWearHistoryEvent hook.
 */
export interface UseWearHistoryEventResult {
  /** The wear history event, or null if not found */
  event: WearHistoryRow | null;
  /** Whether the data is being loaded */
  isLoading: boolean;
  /** Whether an error occurred */
  isError: boolean;
  /** The error that occurred, if any */
  error: WearHistoryClientError | null;
  /** Function to refetch the event */
  refetch: () => void;
}

/**
 * React Query hook for fetching a single wear history event.
 *
 * @param eventId - The wear history event ID to fetch (optional)
 * @returns Object containing event data, loading states, and refetch function
 *
 * @example
 * ```tsx
 * function OutfitDetail({ wearHistoryId }: { wearHistoryId?: string }) {
 *   const { event, isLoading, isError } = useWearHistoryEvent(wearHistoryId);
 *
 *   if (isLoading) return <Loading />;
 *   if (isError || !event) return <Error />;
 *
 *   return <Content event={event} />;
 * }
 * ```
 */
export function useWearHistoryEvent(eventId?: string): UseWearHistoryEventResult {
  const user = useStore((state) => state.user);
  const userId = user?.id;

  const query = useQuery<WearHistoryRow | null, WearHistoryError>({
    queryKey: wearHistoryQueryKey.event(userId ?? '', eventId ?? ''),
    queryFn: async () => {
      if (!userId) {
        throw new WearHistoryError('User not authenticated', 'auth');
      }
      if (!eventId) {
        return null;
      }
      return getWearHistoryEventById(userId, eventId);
    },
    enabled: !!userId && !!eventId,
    staleTime: 30 * 1000,
    refetchOnMount: true,
    retry: (failureCount, error) => {
      if (error.code === 'auth' || error.code === 'validation') {
        return false;
      }
      return failureCount < 3;
    },
  });

  return {
    event: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ? WearHistoryClientError.fromRepositoryError(query.error) : null,
    refetch: query.refetch,
  };
}
