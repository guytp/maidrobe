/**
 * Composition hook for resolving outfit item IDs to view-models.
 *
 * This hook orchestrates the complete item resolution flow for outfit
 * recommendations:
 * 1. Checks React Query cache for already-loaded items
 * 2. Batch-fetches only the missing items
 * 3. Builds stable view-models for UI consumption
 *
 * The hook integrates with the wardrobe feature's caching layer to ensure
 * items are only fetched once and can be reused across screens.
 *
 * @module features/recommendations/hooks/useResolvedOutfitItems
 */

import { useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '../../../core/state/store';
import {
  useBatchWardrobeItems,
  wardrobeItemsQueryKey,
} from '../../wardrobe/api';
import {
  resolveOutfitItems,
  extractAllItemIds,
  type CacheableItem,
  type ItemCacheAccessor,
} from '../utils';
import type {
  OutfitSuggestion,
  OutfitItemViewModel,
  ItemResolutionResult,
} from '../types';

/**
 * Parameters for useResolvedOutfitItems hook.
 */
export interface UseResolvedOutfitItemsParams {
  /**
   * Array of outfit suggestions to resolve items for.
   * Each outfit's itemIds will be resolved to view-models.
   */
  outfits: OutfitSuggestion[];

  /**
   * Whether the resolution should be enabled.
   * Set to false to skip resolution (e.g., while outfits are loading).
   * @default true
   */
  enabled?: boolean;
}

/**
 * Return type for useResolvedOutfitItems hook.
 */
export interface UseResolvedOutfitItemsResult {
  /**
   * Map of outfit ID to resolved item view-models.
   * Each outfit's items are in the same order as the original itemIds.
   * Items that couldn't be resolved have status: 'missing'.
   */
  resolvedOutfits: Map<string, OutfitItemViewModel[]>;

  /**
   * Whether item resolution is currently loading.
   * True while batch fetch is in progress.
   */
  isLoading: boolean;

  /**
   * Whether an error occurred during resolution.
   */
  isError: boolean;

  /**
   * Error message if resolution failed, null otherwise.
   */
  error: string | null;

  /**
   * Number of items that were successfully resolved.
   */
  resolvedCount: number;

  /**
   * Number of items that couldn't be resolved (missing/deleted).
   */
  missingCount: number;

  /**
   * Function to refresh the resolution.
   * Useful for retry after error.
   */
  refetch: () => void;
}

/**
 * Composition hook for resolving outfit item IDs to view-models.
 *
 * This hook provides a complete solution for the item resolution flow:
 *
 * 1. **Extract unique IDs**: Collects all unique item IDs across all outfits
 * 2. **Check cache**: Identifies which items are already in React Query cache
 * 3. **Batch fetch**: Fetches only the missing items in a single request
 * 4. **Build view-models**: Creates UI-ready view-models with status and display data
 *
 * The hook is designed to be efficient:
 * - Only fetches items that aren't already cached
 * - Fetched items are pushed into per-item cache for cross-screen reuse
 * - Resolution is stable (same input = same output) for React rendering
 *
 * @param params - Parameters including outfits array and enabled flag
 * @returns Object containing resolved items, loading states, and refetch function
 *
 * @example
 * ```tsx
 * function OutfitSuggestionsList({ outfits }: { outfits: OutfitSuggestion[] }) {
 *   const {
 *     resolvedOutfits,
 *     isLoading,
 *     isError,
 *     resolvedCount,
 *     missingCount,
 *   } = useResolvedOutfitItems({ outfits });
 *
 *   if (isLoading) return <LoadingSkeleton />;
 *   if (isError) return <ErrorState onRetry={refetch} />;
 *
 *   return (
 *     <FlatList
 *       data={outfits}
 *       renderItem={({ item: outfit }) => {
 *         const items = resolvedOutfits.get(outfit.id) ?? [];
 *         return <OutfitCard outfit={outfit} items={items} />;
 *       }}
 *     />
 *   );
 * }
 * ```
 */
export function useResolvedOutfitItems(
  params: UseResolvedOutfitItemsParams
): UseResolvedOutfitItemsResult {
  const { outfits, enabled = true } = params;
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);
  const userId = user?.id;

  // Extract all unique item IDs from all outfits
  const allItemIds = useMemo(() => {
    if (!enabled || outfits.length === 0) return [];
    return extractAllItemIds(outfits);
  }, [outfits, enabled]);

  // Create cache accessor that checks React Query cache
  const cacheAccessor = useCallback<ItemCacheAccessor>(
    (itemId: string) => {
      if (!userId) return undefined;

      // Check for item in detail cache (could be BatchWardrobeItem or ItemDetail)
      const cached = queryClient.getQueryData<CacheableItem>(
        wardrobeItemsQueryKey.detail(userId, itemId)
      );

      return cached;
    },
    [queryClient, userId]
  );

  // Determine which items are not in cache and need fetching
  const uncachedIds = useMemo(() => {
    if (!enabled || allItemIds.length === 0) return [];

    const needsFetch: string[] = [];
    for (const itemId of allItemIds) {
      if (!cacheAccessor(itemId)) {
        needsFetch.push(itemId);
      }
    }
    return needsFetch;
  }, [allItemIds, cacheAccessor, enabled]);

  // Batch fetch only the uncached items
  const batchQuery = useBatchWardrobeItems({
    itemIds: uncachedIds,
    enabled: enabled && uncachedIds.length > 0,
  });

  // Create updated cache accessor that includes batch-fetched items
  const updatedCacheAccessor = useCallback<ItemCacheAccessor>(
    (itemId: string) => {
      // First check batch query results (freshest data)
      const batchItem = batchQuery.items.get(itemId);
      if (batchItem) return batchItem;

      // Fall back to cache accessor
      return cacheAccessor(itemId);
    },
    [batchQuery.items, cacheAccessor]
  );

  // Resolve all outfits using the combined cache + batch data
  const resolution = useMemo<ItemResolutionResult>(() => {
    if (!enabled || outfits.length === 0) {
      return {
        resolvedOutfits: new Map(),
        uncachedIds: [],
      };
    }

    // If batch is still loading, do initial resolution with cache only
    // This allows partial rendering while remaining items load
    if (batchQuery.isLoading && uncachedIds.length > 0) {
      return resolveOutfitItems(outfits, cacheAccessor);
    }

    // Full resolution with cache + batch data
    return resolveOutfitItems(outfits, updatedCacheAccessor);
  }, [
    outfits,
    enabled,
    cacheAccessor,
    updatedCacheAccessor,
    batchQuery.isLoading,
    uncachedIds.length,
  ]);

  // Calculate counts for telemetry/debugging
  const { resolvedCount, missingCount } = useMemo(() => {
    let resolved = 0;
    let missing = 0;

    resolution.resolvedOutfits.forEach((items) => {
      for (const item of items) {
        if (item.status === 'resolved') {
          resolved++;
        } else {
          missing++;
        }
      }
    });

    return { resolvedCount: resolved, missingCount: missing };
  }, [resolution.resolvedOutfits]);

  // Memoized refetch function - using batchQuery.refetch directly as it's stable
  const refetch = useCallback(() => {
    batchQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchQuery.refetch]);

  return {
    resolvedOutfits: resolution.resolvedOutfits,
    isLoading: batchQuery.isLoading && uncachedIds.length > 0,
    isError: batchQuery.isError,
    error: batchQuery.error?.message ?? null,
    resolvedCount,
    missingCount,
    refetch,
  };
}

/**
 * Helper hook to get resolved items for a single outfit.
 *
 * This is a convenience wrapper when you only need items for one outfit.
 *
 * @param outfit - Single outfit to resolve items for
 * @param enabled - Whether resolution should be enabled
 * @returns Resolved items array and loading states
 */
export function useResolvedOutfitItemsSingle(
  outfit: OutfitSuggestion | null,
  enabled: boolean = true
): {
  items: OutfitItemViewModel[];
  isLoading: boolean;
  isError: boolean;
} {
  const outfits = useMemo(() => (outfit ? [outfit] : []), [outfit]);

  const result = useResolvedOutfitItems({
    outfits,
    enabled: enabled && !!outfit,
  });

  const items = useMemo(() => {
    if (!outfit) return [];
    return result.resolvedOutfits.get(outfit.id) ?? [];
  }, [outfit, result.resolvedOutfits]);

  return {
    items,
    isLoading: result.isLoading,
    isError: result.isError,
  };
}
