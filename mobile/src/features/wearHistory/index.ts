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
} from './types';

// Constants
export { WEAR_HISTORY_PROJECTION, DEFAULT_WEAR_HISTORY_PAGE_SIZE } from './types';

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
  type CreateWearEventParams,
  type UseCreateWearEventResult,
} from './hooks';
