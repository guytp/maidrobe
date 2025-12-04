/**
 * Wear History hooks exports.
 *
 * @module features/wearHistory/hooks
 */

export {
  useCreateWearEvent,
  useInvalidateWearHistory,
  type CreateWearEventParams,
  type UseCreateWearEventResult,
} from './useCreateWearEvent';

export {
  usePendingWearEventsSync,
  useHasPendingWearEvent,
  type UsePendingWearEventsSyncResult,
} from './usePendingWearEventsSync';

export {
  useWearHistoryInfiniteQuery,
  useInvalidateWearHistoryQuery,
  usePrefetchWearHistory,
  type UseWearHistoryInfiniteQueryParams,
  type UseWearHistoryInfiniteQueryResult,
} from './useWearHistoryInfiniteQuery';
