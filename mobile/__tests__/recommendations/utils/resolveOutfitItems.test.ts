/**
 * Unit tests for resolveOutfitItems utility.
 *
 * Tests the pure functions used to resolve outfit item IDs to view-models,
 * covering item ID normalization, extraction, resolution, and edge cases
 * including malformed inputs.
 *
 * @module __tests__/recommendations/utils/resolveOutfitItems
 */

import {
  normalizeItemIds,
  extractAllItemIds,
  resolveOutfitItems,
  createEmptyCacheAccessor,
  type CacheableItem,
  type ItemCacheAccessor,
} from '../../../src/features/recommendations/utils/resolveOutfitItems';
import type { OutfitSuggestion } from '../../../src/features/recommendations/types';
import type { BatchWardrobeItem, ItemDetail } from '../../../src/features/wardrobe/types';

// Mock getItemImageUrl to avoid Supabase URL dependencies
jest.mock('../../../src/features/wardrobe/utils/getItemImageUrl', () => ({
  getItemImageUrl: jest.fn((item: CacheableItem) => {
    if (item.thumb_key) return `https://cdn.test.com/${item.thumb_key}`;
    if (item.clean_key) return `https://cdn.test.com/${item.clean_key}`;
    if (item.original_key) return `https://cdn.test.com/${item.original_key}`;
    return null;
  }),
}));

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Creates a valid OutfitSuggestion for testing.
 */
function createMockOutfit(
  overrides: Partial<OutfitSuggestion> = {}
): OutfitSuggestion {
  return {
    id: 'outfit-001',
    userId: 'user-123',
    itemIds: ['item-a', 'item-b', 'item-c'],
    reason: 'A well-balanced outfit for a casual day.',
    context: 'Casual weekend',
    createdAt: '2025-01-15T10:30:00.000Z',
    rating: null,
    ...overrides,
  };
}

/**
 * Creates a valid BatchWardrobeItem for testing.
 */
function createMockBatchItem(
  overrides: Partial<BatchWardrobeItem> = {}
): BatchWardrobeItem {
  return {
    id: 'item-a',
    user_id: 'user-123',
    name: 'Navy Blazer',
    thumb_key: 'user/user-123/items/item-a/thumb.jpg',
    clean_key: 'user/user-123/items/item-a/clean.jpg',
    original_key: 'user/user-123/items/item-a/original.jpg',
    type: 'blazer',
    colour: ['navy'],
    ...overrides,
  };
}

/**
 * Creates a valid ItemDetail for testing.
 */
function createMockItemDetail(
  overrides: Partial<ItemDetail> = {}
): ItemDetail {
  return {
    id: 'item-a',
    user_id: 'user-123',
    name: 'Navy Blazer',
    tags: ['formal', 'work'],
    thumb_key: 'user/user-123/items/item-a/thumb.jpg',
    clean_key: 'user/user-123/items/item-a/clean.jpg',
    original_key: 'user/user-123/items/item-a/original.jpg',
    type: 'blazer',
    colour: ['navy'],
    pattern: 'solid',
    fabric: 'wool',
    season: ['autumn', 'winter'],
    fit: 'regular',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    image_processing_status: 'succeeded',
    attribute_status: 'succeeded',
    attribute_last_run_at: '2024-01-01T00:00:00Z',
    attribute_error_reason: null,
    ...overrides,
  };
}

// ============================================================================
// normalizeItemIds Tests
// ============================================================================

describe('normalizeItemIds', () => {
  describe('null and undefined input handling', () => {
    it('returns empty array for null input', () => {
      const result = normalizeItemIds(null);
      expect(result).toEqual([]);
    });

    it('returns empty array for undefined input', () => {
      const result = normalizeItemIds(undefined);
      expect(result).toEqual([]);
    });
  });

  describe('non-array input handling', () => {
    it('returns empty array for string input', () => {
      const result = normalizeItemIds('item-id');
      expect(result).toEqual([]);
    });

    it('returns empty array for number input', () => {
      const result = normalizeItemIds(123);
      expect(result).toEqual([]);
    });

    it('returns empty array for object input', () => {
      const result = normalizeItemIds({ id: 'item-a' });
      expect(result).toEqual([]);
    });

    it('returns empty array for boolean input', () => {
      const result = normalizeItemIds(true);
      expect(result).toEqual([]);
    });
  });

  describe('array with invalid elements', () => {
    it('filters out null values from array', () => {
      const result = normalizeItemIds(['item-a', null, 'item-b']);
      expect(result).toEqual(['item-a', 'item-b']);
    });

    it('filters out undefined values from array', () => {
      const result = normalizeItemIds(['item-a', undefined, 'item-b']);
      expect(result).toEqual(['item-a', 'item-b']);
    });

    it('filters out number values from array', () => {
      const result = normalizeItemIds(['item-a', 123, 'item-b']);
      expect(result).toEqual(['item-a', 'item-b']);
    });

    it('filters out object values from array', () => {
      const result = normalizeItemIds(['item-a', { id: 'x' }, 'item-b']);
      expect(result).toEqual(['item-a', 'item-b']);
    });

    it('filters out boolean values from array', () => {
      const result = normalizeItemIds(['item-a', true, false, 'item-b']);
      expect(result).toEqual(['item-a', 'item-b']);
    });

    it('filters out empty strings', () => {
      const result = normalizeItemIds(['item-a', '', 'item-b']);
      expect(result).toEqual(['item-a', 'item-b']);
    });

    it('filters out whitespace-only strings', () => {
      const result = normalizeItemIds(['item-a', '   ', '\t', '\n', 'item-b']);
      expect(result).toEqual(['item-a', 'item-b']);
    });
  });

  describe('valid input handling', () => {
    it('trims whitespace from valid strings', () => {
      const result = normalizeItemIds(['  item-a  ', 'item-b  ', '  item-c']);
      expect(result).toEqual(['item-a', 'item-b', 'item-c']);
    });

    it('preserves order of valid IDs', () => {
      const result = normalizeItemIds(['z-item', 'a-item', 'm-item']);
      expect(result).toEqual(['z-item', 'a-item', 'm-item']);
    });

    it('handles mixed valid and invalid input correctly', () => {
      const result = normalizeItemIds([
        'item-a',
        null,
        '',
        'item-b',
        123,
        '   ',
        'item-c',
        undefined,
      ]);
      expect(result).toEqual(['item-a', 'item-b', 'item-c']);
    });

    it('returns empty array for array with only invalid elements', () => {
      const result = normalizeItemIds([null, undefined, '', 123, '   ']);
      expect(result).toEqual([]);
    });
  });
});

// ============================================================================
// extractAllItemIds Tests
// ============================================================================

describe('extractAllItemIds', () => {
  it('returns empty array for empty outfits array', () => {
    const result = extractAllItemIds([]);
    expect(result).toEqual([]);
  });

  it('extracts all unique IDs from a single outfit', () => {
    const outfits = [createMockOutfit({ itemIds: ['item-a', 'item-b', 'item-c'] })];
    const result = extractAllItemIds(outfits);
    expect(result).toEqual(['item-a', 'item-b', 'item-c']);
  });

  it('de-duplicates IDs across multiple outfits', () => {
    const outfits = [
      createMockOutfit({ id: 'outfit-1', itemIds: ['item-a', 'item-b'] }),
      createMockOutfit({ id: 'outfit-2', itemIds: ['item-b', 'item-c'] }),
      createMockOutfit({ id: 'outfit-3', itemIds: ['item-c', 'item-d'] }),
    ];
    const result = extractAllItemIds(outfits);
    expect(result).toHaveLength(4);
    expect(result).toContain('item-a');
    expect(result).toContain('item-b');
    expect(result).toContain('item-c');
    expect(result).toContain('item-d');
  });

  it('handles outfits with overlapping item IDs', () => {
    const outfits = [
      createMockOutfit({ id: 'outfit-1', itemIds: ['shared-item', 'unique-1'] }),
      createMockOutfit({ id: 'outfit-2', itemIds: ['shared-item', 'unique-2'] }),
    ];
    const result = extractAllItemIds(outfits);
    expect(result).toHaveLength(3);
    expect(result.filter((id) => id === 'shared-item')).toHaveLength(1);
  });

  it('handles outfits with malformed itemIds by filtering them out', () => {
    const outfits = [
      createMockOutfit({ id: 'outfit-1', itemIds: ['item-a', null as unknown as string, 'item-b'] }),
      createMockOutfit({ id: 'outfit-2', itemIds: undefined as unknown as string[] }),
    ];
    const result = extractAllItemIds(outfits);
    expect(result).toEqual(['item-a', 'item-b']);
  });

  it('handles single outfit with all IDs being invalid', () => {
    const outfits = [
      createMockOutfit({ id: 'outfit-1', itemIds: [null, undefined, ''] as unknown as string[] }),
    ];
    const result = extractAllItemIds(outfits);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// resolveOutfitItems Tests
// ============================================================================

describe('resolveOutfitItems', () => {
  describe('with all items in cache', () => {
    it('returns resolved view-models for all cached items', () => {
      const outfits = [
        createMockOutfit({ id: 'outfit-1', itemIds: ['item-a', 'item-b'] }),
      ];

      const itemA = createMockBatchItem({ id: 'item-a', name: 'Navy Blazer' });
      const itemB = createMockBatchItem({ id: 'item-b', name: 'White Shirt' });

      const cacheAccessor: ItemCacheAccessor = (itemId) => {
        if (itemId === 'item-a') return itemA;
        if (itemId === 'item-b') return itemB;
        return undefined;
      };

      const result = resolveOutfitItems(outfits, cacheAccessor);

      expect(result.uncachedIds).toEqual([]);
      expect(result.resolvedOutfits.size).toBe(1);

      const outfit1Items = result.resolvedOutfits.get('outfit-1');
      expect(outfit1Items).toHaveLength(2);
      expect(outfit1Items![0]).toMatchObject({
        id: 'item-a',
        displayName: 'Navy Blazer',
        status: 'resolved',
      });
      expect(outfit1Items![1]).toMatchObject({
        id: 'item-b',
        displayName: 'White Shirt',
        status: 'resolved',
      });
    });

    it('generates correct thumbnail URLs from cache', () => {
      const outfits = [createMockOutfit({ id: 'outfit-1', itemIds: ['item-a'] })];
      const itemA = createMockBatchItem({
        id: 'item-a',
        thumb_key: 'user/123/items/item-a/thumb.jpg',
      });

      const cacheAccessor: ItemCacheAccessor = () => itemA;
      const result = resolveOutfitItems(outfits, cacheAccessor);

      const items = result.resolvedOutfits.get('outfit-1');
      expect(items![0].thumbnailUrl).toBe('https://cdn.test.com/user/123/items/item-a/thumb.jpg');
    });
  });

  describe('with no items in cache', () => {
    it('returns missing view-models for all uncached items', () => {
      const outfits = [
        createMockOutfit({ id: 'outfit-1', itemIds: ['item-a', 'item-b'] }),
      ];

      const emptyCacheAccessor = createEmptyCacheAccessor();
      const result = resolveOutfitItems(outfits, emptyCacheAccessor);

      expect(result.uncachedIds).toEqual(['item-a', 'item-b']);
      expect(result.resolvedOutfits.size).toBe(1);

      const outfit1Items = result.resolvedOutfits.get('outfit-1');
      expect(outfit1Items).toHaveLength(2);
      expect(outfit1Items![0]).toMatchObject({
        id: 'item-a',
        displayName: 'Unknown item',
        thumbnailUrl: null,
        status: 'missing',
      });
      expect(outfit1Items![1]).toMatchObject({
        id: 'item-b',
        displayName: 'Unknown item',
        thumbnailUrl: null,
        status: 'missing',
      });
    });

    it('de-duplicates uncached IDs across multiple outfits', () => {
      const outfits = [
        createMockOutfit({ id: 'outfit-1', itemIds: ['item-a', 'item-b'] }),
        createMockOutfit({ id: 'outfit-2', itemIds: ['item-b', 'item-c'] }),
      ];

      const emptyCacheAccessor = createEmptyCacheAccessor();
      const result = resolveOutfitItems(outfits, emptyCacheAccessor);

      expect(result.uncachedIds).toHaveLength(3);
      expect(result.uncachedIds).toContain('item-a');
      expect(result.uncachedIds).toContain('item-b');
      expect(result.uncachedIds).toContain('item-c');
    });
  });

  describe('with mixed cached and uncached items', () => {
    it('handles mixed cached/uncached items in single outfit', () => {
      const outfits = [
        createMockOutfit({ id: 'outfit-1', itemIds: ['cached-item', 'uncached-item'] }),
      ];

      const cachedItem = createMockBatchItem({ id: 'cached-item', name: 'Cached Item' });

      const cacheAccessor: ItemCacheAccessor = (itemId) => {
        if (itemId === 'cached-item') return cachedItem;
        return undefined;
      };

      const result = resolveOutfitItems(outfits, cacheAccessor);

      expect(result.uncachedIds).toEqual(['uncached-item']);

      const items = result.resolvedOutfits.get('outfit-1');
      expect(items).toHaveLength(2);
      expect(items![0].status).toBe('resolved');
      expect(items![1].status).toBe('missing');
    });
  });

  describe('display name priority', () => {
    it('uses user-provided name when available', () => {
      const outfits = [createMockOutfit({ id: 'outfit-1', itemIds: ['item-a'] })];
      const item = createMockBatchItem({ id: 'item-a', name: 'My Custom Name', type: 'shirt' });

      const cacheAccessor: ItemCacheAccessor = () => item;
      const result = resolveOutfitItems(outfits, cacheAccessor);

      const items = result.resolvedOutfits.get('outfit-1');
      expect(items![0].displayName).toBe('My Custom Name');
    });

    it('falls back to type when name is null', () => {
      const outfits = [createMockOutfit({ id: 'outfit-1', itemIds: ['item-a'] })];
      const item = createMockItemDetail({ id: 'item-a', name: null, type: 'blazer' });

      const cacheAccessor: ItemCacheAccessor = () => item;
      const result = resolveOutfitItems(outfits, cacheAccessor);

      const items = result.resolvedOutfits.get('outfit-1');
      expect(items![0].displayName).toBe('Blazer');
    });

    it('falls back to type when name is empty string', () => {
      const outfits = [createMockOutfit({ id: 'outfit-1', itemIds: ['item-a'] })];
      const item = createMockItemDetail({ id: 'item-a', name: '', type: 'pants' });

      const cacheAccessor: ItemCacheAccessor = () => item;
      const result = resolveOutfitItems(outfits, cacheAccessor);

      const items = result.resolvedOutfits.get('outfit-1');
      expect(items![0].displayName).toBe('Pants');
    });

    it('falls back to type when name is whitespace-only', () => {
      const outfits = [createMockOutfit({ id: 'outfit-1', itemIds: ['item-a'] })];
      const item = createMockItemDetail({ id: 'item-a', name: '   ', type: 'jacket' });

      const cacheAccessor: ItemCacheAccessor = () => item;
      const result = resolveOutfitItems(outfits, cacheAccessor);

      const items = result.resolvedOutfits.get('outfit-1');
      expect(items![0].displayName).toBe('Jacket');
    });

    it('uses default fallback when both name and type are unavailable', () => {
      const outfits = [createMockOutfit({ id: 'outfit-1', itemIds: ['item-a'] })];
      const item = createMockBatchItem({ id: 'item-a', name: null, type: null });

      const cacheAccessor: ItemCacheAccessor = () => item;
      const result = resolveOutfitItems(outfits, cacheAccessor);

      const items = result.resolvedOutfits.get('outfit-1');
      expect(items![0].displayName).toBe('Unknown item');
    });
  });

  describe('item type and colour extraction', () => {
    it('extracts type from ItemDetail items', () => {
      const outfits = [createMockOutfit({ id: 'outfit-1', itemIds: ['item-a'] })];
      const item = createMockItemDetail({ id: 'item-a', type: 'blazer' });

      const cacheAccessor: ItemCacheAccessor = () => item;
      const result = resolveOutfitItems(outfits, cacheAccessor);

      const items = result.resolvedOutfits.get('outfit-1');
      expect(items![0].type).toBe('blazer');
    });

    it('extracts colour from ItemDetail items', () => {
      const outfits = [createMockOutfit({ id: 'outfit-1', itemIds: ['item-a'] })];
      const item = createMockItemDetail({ id: 'item-a', colour: ['navy', 'white'] });

      const cacheAccessor: ItemCacheAccessor = () => item;
      const result = resolveOutfitItems(outfits, cacheAccessor);

      const items = result.resolvedOutfits.get('outfit-1');
      expect(items![0].colour).toEqual(['navy', 'white']);
    });

    it('returns null for type when not available', () => {
      const outfits = [createMockOutfit({ id: 'outfit-1', itemIds: ['item-a'] })];
      const item = createMockBatchItem({ id: 'item-a', type: null });

      const cacheAccessor: ItemCacheAccessor = () => item;
      const result = resolveOutfitItems(outfits, cacheAccessor);

      const items = result.resolvedOutfits.get('outfit-1');
      expect(items![0].type).toBeNull();
    });

    it('returns null for colour when not available', () => {
      const outfits = [createMockOutfit({ id: 'outfit-1', itemIds: ['item-a'] })];
      const item = createMockBatchItem({ id: 'item-a', colour: null });

      const cacheAccessor: ItemCacheAccessor = () => item;
      const result = resolveOutfitItems(outfits, cacheAccessor);

      const items = result.resolvedOutfits.get('outfit-1');
      expect(items![0].colour).toBeNull();
    });
  });

  describe('order preservation', () => {
    it('preserves order of items within each outfit', () => {
      const outfits = [
        createMockOutfit({ id: 'outfit-1', itemIds: ['third', 'first', 'second'] }),
      ];

      const items: Record<string, BatchWardrobeItem> = {
        third: createMockBatchItem({ id: 'third', name: 'Third Item' }),
        first: createMockBatchItem({ id: 'first', name: 'First Item' }),
        second: createMockBatchItem({ id: 'second', name: 'Second Item' }),
      };

      const cacheAccessor: ItemCacheAccessor = (itemId) => items[itemId];
      const result = resolveOutfitItems(outfits, cacheAccessor);

      const outfit1Items = result.resolvedOutfits.get('outfit-1');
      expect(outfit1Items![0].id).toBe('third');
      expect(outfit1Items![1].id).toBe('first');
      expect(outfit1Items![2].id).toBe('second');
    });
  });

  describe('edge cases', () => {
    it('handles empty outfits array', () => {
      const result = resolveOutfitItems([], createEmptyCacheAccessor());
      expect(result.resolvedOutfits.size).toBe(0);
      expect(result.uncachedIds).toEqual([]);
    });

    it('handles outfit with empty itemIds array', () => {
      const outfits = [createMockOutfit({ id: 'outfit-1', itemIds: [] })];
      const result = resolveOutfitItems(outfits, createEmptyCacheAccessor());

      expect(result.resolvedOutfits.size).toBe(1);
      expect(result.resolvedOutfits.get('outfit-1')).toEqual([]);
      expect(result.uncachedIds).toEqual([]);
    });

    it('handles outfit with null itemIds', () => {
      const outfits = [createMockOutfit({ id: 'outfit-1', itemIds: null as unknown as string[] })];
      const result = resolveOutfitItems(outfits, createEmptyCacheAccessor());

      expect(result.resolvedOutfits.size).toBe(1);
      expect(result.resolvedOutfits.get('outfit-1')).toEqual([]);
      expect(result.uncachedIds).toEqual([]);
    });

    it('handles outfit with undefined itemIds', () => {
      const outfits = [createMockOutfit({ id: 'outfit-1', itemIds: undefined as unknown as string[] })];
      const result = resolveOutfitItems(outfits, createEmptyCacheAccessor());

      expect(result.resolvedOutfits.size).toBe(1);
      expect(result.resolvedOutfits.get('outfit-1')).toEqual([]);
      expect(result.uncachedIds).toEqual([]);
    });

    it('handles multiple outfits correctly', () => {
      const outfits = [
        createMockOutfit({ id: 'outfit-1', itemIds: ['item-a'] }),
        createMockOutfit({ id: 'outfit-2', itemIds: ['item-b'] }),
        createMockOutfit({ id: 'outfit-3', itemIds: ['item-c'] }),
      ];

      const items: Record<string, BatchWardrobeItem> = {
        'item-a': createMockBatchItem({ id: 'item-a', name: 'Item A' }),
        'item-b': createMockBatchItem({ id: 'item-b', name: 'Item B' }),
        'item-c': createMockBatchItem({ id: 'item-c', name: 'Item C' }),
      };

      const cacheAccessor: ItemCacheAccessor = (itemId) => items[itemId];
      const result = resolveOutfitItems(outfits, cacheAccessor);

      expect(result.resolvedOutfits.size).toBe(3);
      expect(result.resolvedOutfits.get('outfit-1')![0].displayName).toBe('Item A');
      expect(result.resolvedOutfits.get('outfit-2')![0].displayName).toBe('Item B');
      expect(result.resolvedOutfits.get('outfit-3')![0].displayName).toBe('Item C');
    });
  });
});

// ============================================================================
// createEmptyCacheAccessor Tests
// ============================================================================

describe('createEmptyCacheAccessor', () => {
  it('returns accessor that always returns undefined', () => {
    const accessor = createEmptyCacheAccessor();
    expect(accessor('any-id')).toBeUndefined();
    expect(accessor('another-id')).toBeUndefined();
    expect(accessor('')).toBeUndefined();
  });
});
