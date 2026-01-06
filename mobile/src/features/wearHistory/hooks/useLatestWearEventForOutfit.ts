/**
 * React Query hook for fetching the most recent wear event for an outfit.
 *
 * This hook provides access to the latest wear event for a specific outfit,
 * used by the outfit detail screen to display "Last worn" information when
 * navigated from non-history sources (saved outfits, recommendations).
 *
 * Features:
 * - Fetches the most recent wear event by worn_date and worn_at
 * - Automatic cache population per outfitId
 * - Error classification for UI feedback
 * - Loading and error states
 * - Returns null if outfit has never been worn
 *
 * @module features/wearHistory/hooks/useLatestWearEventForOutfit
 */

import { useQuery } from '@tanstack/react-query';
import { useStore } from '../../../core/state/store';
import {
  wearHistoryQueryKey,
  WearHistoryClientError,
  QUERY_KEY_NO_USER,
  QUERY_KEY_NO_ID,
} from '../api/wearHistoryClient';
import { getLatestWearEventForOutfit, WearHistoryError } from '../api/wearHistoryRepository';
import type { WearHistoryRow } from '../types';

/**
 * Return type for useLatestWearEventForOutfit hook.
 */
export interface UseLatestWearEventForOutfitResult {
  /** The most recent wear history event for the outfit, or null if never worn */
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
 * React Query hook for fetching the most recent wear event for an outfit.
 *
 * This hook is used by the outfit detail screen when opened from non-history
 * sources (saved outfits, recommendations) where a specific wearHistoryId is
 * not available. It fetches the most recent wear event for the outfit to
 * display "Last worn" information.
 *
 * @param outfitId - The outfit ID to look up (optional)
 * @returns Object containing event data, loading states, and refetch function
 *
 * @example
 * ```tsx
 * function OutfitDetail({ outfitId, wearHistoryId }: Props) {
 *   // Use this hook when no specific wearHistoryId is provided
 *   const { event: latestEvent, isLoading } = useLatestWearEventForOutfit(
 *     wearHistoryId ? undefined : outfitId
 *   );
 *
 *   if (isLoading) return <Loading />;
 *
 *   // latestEvent is null if outfit has never been worn
 *   if (latestEvent) {
 *     return <LastWornSection event={latestEvent} />;
 *   }
 *
 *   return <NoHistoryPlaceholder />;
 * }
 * ```
 */
export function useLatestWearEventForOutfit(outfitId?: string): UseLatestWearEventForOutfitResult {
  const user = useStore((state) => state.user);
  const userId = user?.id;

  const query = useQuery<WearHistoryRow | null, WearHistoryError>({
    queryKey: wearHistoryQueryKey.latestForOutfit(
      userId ?? QUERY_KEY_NO_USER,
      outfitId ?? QUERY_KEY_NO_ID
    ),
    queryFn: async () => {
      if (!userId) {
        throw new WearHistoryError('User not authenticated', 'auth');
      }
      if (!outfitId) {
        return null;
      }
      return getLatestWearEventForOutfit(userId, outfitId);
    },
    enabled: !!userId && !!outfitId,
    staleTime: 30 * 1000, // 30 seconds, consistent with useWearHistoryEvent
    refetchOnMount: true,
    retry: (failureCount, error) => {
      // Don't retry auth or validation errors
      if (error.code === 'auth' || error.code === 'validation') {
        return false;
      }
      // Retry network/server errors up to 3 times
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
