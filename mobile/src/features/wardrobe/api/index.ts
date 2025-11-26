/**
 * Wardrobe feature API layer exports.
 *
 * Provides React Query hooks and data fetching utilities for
 * wardrobe items. All hooks follow the project's established
 * patterns for caching, error handling, and telemetry.
 *
 * @module features/wardrobe/api
 */

// Data fetching
export { fetchWardrobeItems, FetchWardrobeItemsError } from './fetchWardrobeItems';

// React Query hooks
export {
  useWardrobeItems,
  useInvalidateWardrobeItems,
  usePrefetchWardrobeItems,
  wardrobeItemsQueryKey,
  type UseWardrobeItemsParams,
  type UseWardrobeItemsResult,
} from './useWardrobeItems';
