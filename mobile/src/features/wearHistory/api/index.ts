/**
 * Wear History API exports.
 *
 * @module features/wearHistory/api
 */

// Repository layer (low-level Supabase operations)
export {
  createOrUpdateWearEvent,
  getWearHistoryForUser,
  getWearHistoryForWindow,
  WearHistoryError,
} from './wearHistoryRepository';

// Client layer (high-level functions for UI consumption)
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
} from './wearHistoryClient';
