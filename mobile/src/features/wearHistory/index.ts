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

// API / Data access
export {
  createOrUpdateWearEvent,
  getWearHistoryForUser,
  getWearHistoryForWindow,
  WearHistoryError,
} from './api';
