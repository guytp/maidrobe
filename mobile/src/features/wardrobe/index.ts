/**
 * Wardrobe feature public exports.
 *
 * This module provides a clean interface for importing wardrobe-related
 * components and utilities from other parts of the application.
 *
 * @module features/wardrobe
 */

// Components
export { WardrobeScreen } from './components/WardrobeScreen';
export { CaptureScreen } from './components/CaptureScreen';
export { ReviewDetailsScreen } from './components/ReviewDetailsScreen';
export { CropScreen } from './crop';

// Constants
export { NAVIGATION_DEBOUNCE_MS, SETTINGS_RETURN_DELAY_MS, EDGE_FUNCTIONS } from './constants';

// Types
export type {
  WardrobeGridItem,
  FetchWardrobeItemsParams,
  FetchWardrobeItemsResponse,
  WardrobeScreenState,
} from './types';
export {
  WARDROBE_GRID_PROJECTION,
  DEFAULT_PAGE_SIZE,
  MIN_CARD_WIDTH,
  GRID_GAP,
  SEARCH_DEBOUNCE_MS,
} from './types';

// API / Data fetching
export {
  useWardrobeItems,
  useInvalidateWardrobeItems,
  usePrefetchWardrobeItems,
  wardrobeItemsQueryKey,
  fetchWardrobeItems,
  FetchWardrobeItemsError,
  type UseWardrobeItemsParams,
  type UseWardrobeItemsResult,
} from './api';
