/**
 * Item resolution utility for outfit suggestions.
 *
 * Resolves raw `itemIds` from outfit suggestions into view-models suitable
 * for UI rendering. Handles:
 * - Cache lookup via a provided accessor function
 * - Identification of uncached items for batch fetching
 * - Graceful handling of missing, invalid, or malformed item IDs
 * - De-duplication of item IDs across multiple outfits
 *
 * This utility is pure (no side effects) and cache-agnostic, making it
 * easy to test and flexible to integrate with React Query or Zustand.
 *
 * @module features/recommendations/utils/resolveOutfitItems
 */

import { getItemImageUrl } from '../../wardrobe/utils/getItemImageUrl';
import type { WardrobeGridItem, ItemDetail } from '../../wardrobe/types';
import type {
  OutfitSuggestion,
  OutfitItemViewModel,
  ItemResolutionResult,
} from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Union type for wardrobe items that can be used for resolution.
 *
 * Supports both the minimal grid projection and full detail projection,
 * allowing flexibility in what data is available in the cache.
 */
export type CacheableItem = WardrobeGridItem | ItemDetail;

/**
 * Function type for accessing cached wardrobe items.
 *
 * The utility accepts this function to look up items by ID, allowing
 * callers to provide their own cache implementation (React Query, Zustand, etc.).
 *
 * @param itemId - The item ID to look up
 * @returns The cached item if found, undefined otherwise
 */
export type ItemCacheAccessor = (itemId: string) => CacheableItem | undefined;

// ============================================================================
// Constants
// ============================================================================

/**
 * Default display name for items that are missing or have no name.
 * This will be replaced with i18n key lookup in the UI layer.
 */
const MISSING_ITEM_DISPLAY_NAME = 'Unknown item';

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Checks if a value is a valid, non-empty string.
 *
 * Used to filter out invalid item IDs including:
 * - null/undefined
 * - Non-string types (numbers, objects, etc.)
 * - Empty strings
 * - Whitespace-only strings
 *
 * @param value - Value to check
 * @returns True if value is a valid string ID
 */
function isValidItemId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Normalises an itemIds array, filtering out invalid entries.
 *
 * Handles malformed input gracefully:
 * - Returns empty array for null/undefined/non-array input
 * - Filters out non-string, empty, or whitespace-only values
 * - Preserves order of valid IDs
 *
 * @param itemIds - Raw itemIds from outfit suggestion (may be malformed)
 * @returns Array of valid, trimmed item ID strings
 *
 * @example
 * ```typescript
 * normalizeItemIds(['a', '', null, 'b', 123, '  c  ']);
 * // Returns: ['a', 'b', 'c']
 *
 * normalizeItemIds(null);
 * // Returns: []
 * ```
 */
export function normalizeItemIds(itemIds: unknown): string[] {
  // Handle null, undefined, or non-array input
  if (!Array.isArray(itemIds)) {
    return [];
  }

  // Filter to valid strings and trim whitespace
  return itemIds.filter(isValidItemId).map((id) => id.trim());
}

// ============================================================================
// Display Name Helpers
// ============================================================================

/**
 * Type guard to check if an item has the 'type' field (ItemDetail).
 */
function hasTypeField(item: CacheableItem): item is ItemDetail {
  return 'type' in item;
}

/**
 * Derives a display name for a wardrobe item.
 *
 * Priority order:
 * 1. User-provided name
 * 2. AI-detected type (for ItemDetail)
 * 3. Fallback constant
 *
 * @param item - Cached wardrobe item
 * @returns Display name string
 */
function getItemDisplayName(item: CacheableItem): string {
  // Use user-provided name if available
  if (item.name && item.name.trim().length > 0) {
    return item.name.trim();
  }

  // Use AI-detected type for ItemDetail items
  if (hasTypeField(item) && item.type && item.type.trim().length > 0) {
    // Capitalise first letter for display
    const type = item.type.trim();
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  return MISSING_ITEM_DISPLAY_NAME;
}

/**
 * Extracts colour array from an item if available.
 *
 * @param item - Cached wardrobe item
 * @returns Colour array or null
 */
function getItemColour(item: CacheableItem): string[] | null {
  if (hasTypeField(item) && item.colour && item.colour.length > 0) {
    return item.colour;
  }
  return null;
}

/**
 * Extracts type from an item if available.
 *
 * @param item - Cached wardrobe item
 * @returns Type string or null
 */
function getItemType(item: CacheableItem): string | null {
  if (hasTypeField(item) && item.type && item.type.trim().length > 0) {
    return item.type.trim();
  }
  return null;
}

// ============================================================================
// View-Model Builders
// ============================================================================

/**
 * Creates a view-model for a successfully resolved item.
 *
 * @param itemId - Original item ID
 * @param item - Cached wardrobe item data
 * @returns Resolved item view-model
 */
function createResolvedViewModel(
  itemId: string,
  item: CacheableItem
): OutfitItemViewModel {
  return {
    id: itemId,
    displayName: getItemDisplayName(item),
    thumbnailUrl: getItemImageUrl(item),
    status: 'resolved',
    type: getItemType(item),
    colour: getItemColour(item),
  };
}

/**
 * Creates a view-model for a missing/unresolved item.
 *
 * @param itemId - Original item ID that couldn't be resolved
 * @returns Missing item view-model with placeholder data
 */
function createMissingViewModel(itemId: string): OutfitItemViewModel {
  return {
    id: itemId,
    displayName: MISSING_ITEM_DISPLAY_NAME,
    thumbnailUrl: null,
    status: 'missing',
    type: null,
    colour: null,
  };
}

// ============================================================================
// Main Resolution Function
// ============================================================================

/**
 * Extracts and de-duplicates all valid item IDs from a list of outfits.
 *
 * Useful for determining the full set of unique items that need to be
 * cached or fetched before resolution.
 *
 * @param outfits - List of outfit suggestions
 * @returns De-duplicated array of valid item IDs
 *
 * @example
 * ```typescript
 * const outfits = [
 *   { id: 'o1', itemIds: ['a', 'b'] },
 *   { id: 'o2', itemIds: ['b', 'c'] },
 * ];
 * extractAllItemIds(outfits);
 * // Returns: ['a', 'b', 'c']
 * ```
 */
export function extractAllItemIds(outfits: OutfitSuggestion[]): string[] {
  const allIds = new Set<string>();

  for (const outfit of outfits) {
    const normalizedIds = normalizeItemIds(outfit.itemIds);
    for (const id of normalizedIds) {
      allIds.add(id);
    }
  }

  return Array.from(allIds);
}

/**
 * Resolves outfit item IDs to view-models using a cache accessor.
 *
 * For each outfit in the input list:
 * 1. Normalises and validates the `itemIds` array
 * 2. Looks up each ID in the cache via the provided accessor
 * 3. Creates a view-model with status 'resolved' or 'missing'
 *
 * Returns both the resolved view-models and a list of IDs that weren't
 * found in the cache (for batch fetching).
 *
 * @param outfits - List of outfit suggestions to resolve
 * @param cacheAccessor - Function to look up items by ID
 * @returns Resolution result with view-models and uncached IDs
 *
 * @example
 * ```typescript
 * // With React Query cache
 * const cacheAccessor = (id: string) =>
 *   queryClient.getQueryData(['wardrobe', 'items', userId, 'detail', id]);
 *
 * const result = resolveOutfitItems(outfits, cacheAccessor);
 *
 * if (result.uncachedIds.length > 0) {
 *   // Fetch missing items
 *   await batchFetchItems(result.uncachedIds);
 *   // Re-resolve with updated cache
 *   return resolveOutfitItems(outfits, cacheAccessor);
 * }
 *
 * // Render using result.resolvedOutfits
 * ```
 */
export function resolveOutfitItems(
  outfits: OutfitSuggestion[],
  cacheAccessor: ItemCacheAccessor
): ItemResolutionResult {
  const resolvedOutfits = new Map<string, OutfitItemViewModel[]>();
  const uncachedIdsSet = new Set<string>();

  for (const outfit of outfits) {
    const normalizedIds = normalizeItemIds(outfit.itemIds);
    const itemViewModels: OutfitItemViewModel[] = [];

    for (const itemId of normalizedIds) {
      const cachedItem = cacheAccessor(itemId);

      if (cachedItem) {
        // Item found in cache - create resolved view-model
        itemViewModels.push(createResolvedViewModel(itemId, cachedItem));
      } else {
        // Item not in cache - mark as missing for now, track for batch fetch
        itemViewModels.push(createMissingViewModel(itemId));
        uncachedIdsSet.add(itemId);
      }
    }

    resolvedOutfits.set(outfit.id, itemViewModels);
  }

  return {
    resolvedOutfits,
    uncachedIds: Array.from(uncachedIdsSet),
  };
}

/**
 * Creates an empty cache accessor that marks all items as uncached.
 *
 * Useful for testing or when cache is intentionally bypassed.
 *
 * @returns Cache accessor that always returns undefined
 */
export function createEmptyCacheAccessor(): ItemCacheAccessor {
  return () => undefined;
}
