/**
 * Wardrobe feature API layer exports.
 *
 * Provides React Query hooks and data fetching utilities for
 * wardrobe items. All hooks follow the project's established
 * patterns for caching, error handling, and telemetry.
 *
 * @module features/wardrobe/api
 */

// Data fetching - list operations
export { fetchWardrobeItems, FetchWardrobeItemsError } from './fetchWardrobeItems';

// Data fetching - single item operations
export {
  fetchWardrobeItem,
  FetchWardrobeItemError,
  type FetchWardrobeItemErrorCode,
  type FetchWardrobeItemParams,
} from './fetchWardrobeItem';

// React Query hooks - list operations
export {
  useWardrobeItems,
  useInvalidateWardrobeItems,
  usePrefetchWardrobeItems,
  wardrobeItemsQueryKey,
  type UseWardrobeItemsParams,
  type UseWardrobeItemsResult,
} from './useWardrobeItems';

// React Query hooks - single item operations
export {
  useWardrobeItem,
  type UseWardrobeItemParams,
  type UseWardrobeItemResult,
} from './useWardrobeItem';
