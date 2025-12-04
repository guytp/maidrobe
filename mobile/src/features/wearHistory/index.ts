/**
 * Wear History feature public exports.
 *
 * This module provides a clean interface for importing wear history-related
 * functions and types from other parts of the application.
 *
 * @module features/wearHistory
 */

// Types
export type {
  WearHistorySource,
  WearHistoryRow,
  CreateWearEventPayload,
  GetWearHistoryParams,
  GetWearHistoryResponse,
  GetWearHistoryWindowResponse,
  PendingWearEvent,
  PendingWearEventStatus,
} from './types';

// Constants
export {
  WEAR_HISTORY_PROJECTION,
  DEFAULT_WEAR_HISTORY_PAGE_SIZE,
  MAX_PENDING_WEAR_EVENTS,
  MAX_SYNC_ATTEMPTS,
  STALE_EVENT_AGE_MS,
} from './types';

// API / Data access (repository layer)
export {
  createOrUpdateWearEvent,
  getWearHistoryForUser,
  getWearHistoryForWindow,
  WearHistoryError,
} from './api';

// API / Data access (client layer)
export {
  createOrUpdateWearEventForClient,
  wearHistoryQueryKey,
  WearHistoryClientError,
  getTodayDateString,
  validateWearDate,
  type WearHistoryClientErrorCode,
  type CreateWearEventForClientPayload,
  type CreateWearEventResult,
  type CreateWearEventSuccessResult,
  type CreateWearEventFailureResult,
} from './api';

// Hooks
export {
  useCreateWearEvent,
  useInvalidateWearHistory,
  usePendingWearEventsSync,
  useHasPendingWearEvent,
  useWearHistoryInfiniteQuery,
  useInvalidateWearHistoryQuery,
  usePrefetchWearHistory,
  type CreateWearEventParams,
  type UseCreateWearEventResult,
  type UsePendingWearEventsSyncResult,
  type UseWearHistoryInfiniteQueryParams,
  type UseWearHistoryInfiniteQueryResult,
} from './hooks';

// Components
export { MarkAsWornSheet, type MarkAsWornSheetProps } from './components';
export { SyncFailureBanner, type SyncFailureBannerProps } from './components';
export { WearHistorySyncProvider, type WearHistorySyncProviderProps } from './components';
export { WearHistoryScreen } from './components';
export { WearEventCard, type WearEventCardProps } from './components';

// Utils
export {
  groupWearEventsByDate,
  formatDateLabel,
  type WearHistorySection,
} from './utils';
