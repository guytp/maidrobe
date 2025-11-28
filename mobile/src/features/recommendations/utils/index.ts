/**
 * Recommendations feature utility exports.
 *
 * Provides pure utility functions for processing outfit recommendations,
 * including item resolution and validation.
 *
 * @module features/recommendations/utils
 */

export {
  resolveOutfitItems,
  extractAllItemIds,
  normalizeItemIds,
  createEmptyCacheAccessor,
  type CacheableItem,
  type ItemCacheAccessor,
} from './resolveOutfitItems';
