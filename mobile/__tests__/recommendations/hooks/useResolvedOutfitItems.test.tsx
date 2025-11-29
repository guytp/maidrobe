/**
 * Unit tests for useResolvedOutfitItems hook.
 *
 * Tests the React Query composition hook for resolving outfit item IDs
 * to view-models, covering normal operation, loading states, error handling,
 * and telemetry.
 *
 * @module __tests__/recommendations/hooks/useResolvedOutfitItems
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import type { OutfitSuggestion } from '../../../src/features/recommendations/types';
import type { BatchWardrobeItem } from '../../../src/features/wardrobe/types';

// ============================================================================
// Mocks - Must be defined before imports that use them
// ============================================================================

// Mock telemetry - using jest.fn() inside the factory function
jest.mock('../../../src/core/telemetry', () => ({
  logError: jest.fn(),
  trackCaptureEvent: jest.fn(),
}));

// Import mocks to use in tests after jest.mock is set up
import * as telemetry from '../../../src/core/telemetry';
const mockLogError = telemetry.logError as jest.Mock;
const mockTrackCaptureEvent = telemetry.trackCaptureEvent as jest.Mock;

// Mock store
jest.mock('../../../src/core/state/store', () => ({
  useStore: jest.fn((selector) =>
    selector({
      user: { id: 'test-user-123' },
    })
  ),
}));

// Mock getItemImageUrl
jest.mock('../../../src/features/wardrobe/utils/getItemImageUrl', () => ({
  getItemImageUrl: jest.fn((item: BatchWardrobeItem) => {
    if (item.thumb_key) return `https://cdn.test.com/${item.thumb_key}`;
    if (item.clean_key) return `https://cdn.test.com/${item.clean_key}`;
    if (item.original_key) return `https://cdn.test.com/${item.original_key}`;
    return null;
  }),
}));

// Mock useBatchWardrobeItems hook - need to mock the entire api module
const mockUseBatchWardrobeItems = jest.fn();

jest.mock('../../../src/features/wardrobe/api', () => ({
  useBatchWardrobeItems: (...args: unknown[]) => mockUseBatchWardrobeItems(...args),
  wardrobeItemsQueryKey: {
    all: ['wardrobe', 'items'],
    user: (userId: string) => ['wardrobe', 'items', userId],
    detail: (userId: string, itemId: string) => ['wardrobe', 'items', userId, 'detail', itemId],
    batch: (userId: string, itemIds: string[]) => ['wardrobe', 'items', userId, 'batch', ...itemIds.slice().sort()],
  },
}));

// Import the hook after mocks are set up
import {
  useResolvedOutfitItems,
  useResolvedOutfitItemsSingle,
} from '../../../src/features/recommendations/hooks/useResolvedOutfitItems';

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
 * Creates a mock batch query result.
 */
function createMockBatchResult(
  items: Map<string, BatchWardrobeItem> = new Map(),
  options: {
    isLoading?: boolean;
    isError?: boolean;
    error?: { code: string; message: string } | null;
    missingIds?: string[];
  } = {}
) {
  return {
    items,
    missingIds: options.missingIds ?? [],
    isLoading: options.isLoading ?? false,
    isError: options.isError ?? false,
    error: options.error ?? null,
    isFetching: options.isLoading ?? false,
    refetch: jest.fn(),
  };
}

// ============================================================================
// Test Setup
// ============================================================================

describe('useResolvedOutfitItems', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    jest.clearAllMocks();

    // Default mock implementation - no items in batch
    mockUseBatchWardrobeItems.mockReturnValue(
      createMockBatchResult()
    );
  });

  afterEach(() => {
    queryClient.clear();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  // ==========================================================================
  // Disabled/Empty State Tests
  // ==========================================================================

  describe('when disabled or empty', () => {
    it('returns empty map when enabled is false', () => {
      const outfits = [createMockOutfit()];

      const { result } = renderHook(
        () => useResolvedOutfitItems({ outfits, enabled: false }),
        { wrapper }
      );

      expect(result.current.resolvedOutfits.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(false);
    });

    it('returns empty map when outfits array is empty', () => {
      const { result } = renderHook(
        () => useResolvedOutfitItems({ outfits: [], enabled: true }),
        { wrapper }
      );

      expect(result.current.resolvedOutfits.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
    });

    it('does not trigger batch fetch when disabled', () => {
      const outfits = [createMockOutfit()];

      renderHook(
        () => useResolvedOutfitItems({ outfits, enabled: false }),
        { wrapper }
      );

      expect(mockUseBatchWardrobeItems).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
    });
  });

  // ==========================================================================
  // Cache Integration Tests
  // ==========================================================================

  describe('cache integration', () => {
    it('uses cached items from React Query without additional fetching', async () => {
      // Pre-populate cache with item data
      const cachedItem = createMockBatchItem({ id: 'item-a', name: 'Cached Item' });
      queryClient.setQueryData(
        ['wardrobe', 'items', 'test-user-123', 'detail', 'item-a'],
        cachedItem
      );

      const outfits = [createMockOutfit({ itemIds: ['item-a'] })];

      const { result } = renderHook(
        () => useResolvedOutfitItems({ outfits }),
        { wrapper }
      );

      // Should have resolved the cached item
      await waitFor(() => {
        expect(result.current.resolvedOutfits.size).toBe(1);
      });

      const items = result.current.resolvedOutfits.get('outfit-001');
      expect(items).toBeDefined();
      expect(items![0].displayName).toBe('Cached Item');
      expect(items![0].status).toBe('resolved');
    });

    it('triggers batch fetch only for uncached items', async () => {
      // Pre-populate cache with one item
      const cachedItem = createMockBatchItem({ id: 'item-a', name: 'Cached Item' });
      queryClient.setQueryData(
        ['wardrobe', 'items', 'test-user-123', 'detail', 'item-a'],
        cachedItem
      );

      const outfits = [createMockOutfit({ itemIds: ['item-a', 'item-b'] })];

      renderHook(
        () => useResolvedOutfitItems({ outfits }),
        { wrapper }
      );

      // Should only request the uncached item
      expect(mockUseBatchWardrobeItems).toHaveBeenCalledWith(
        expect.objectContaining({
          itemIds: ['item-b'],
        })
      );
    });
  });

  // ==========================================================================
  // Batch Fetch Integration Tests
  // ==========================================================================

  describe('batch fetch integration', () => {
    it('combines cached and batch-fetched items in final resolution', async () => {
      // Cache one item
      const cachedItem = createMockBatchItem({ id: 'item-a', name: 'Cached Item' });
      queryClient.setQueryData(
        ['wardrobe', 'items', 'test-user-123', 'detail', 'item-a'],
        cachedItem
      );

      // Mock batch returning the other item
      const batchedItem = createMockBatchItem({ id: 'item-b', name: 'Batched Item' });
      const batchItems = new Map([['item-b', batchedItem]]);
      mockUseBatchWardrobeItems.mockReturnValue(
        createMockBatchResult(batchItems)
      );

      const outfits = [createMockOutfit({ itemIds: ['item-a', 'item-b'] })];

      const { result } = renderHook(
        () => useResolvedOutfitItems({ outfits }),
        { wrapper }
      );

      await waitFor(() => {
        const items = result.current.resolvedOutfits.get('outfit-001');
        expect(items).toHaveLength(2);
      });

      const items = result.current.resolvedOutfits.get('outfit-001');
      expect(items![0].displayName).toBe('Cached Item');
      expect(items![1].displayName).toBe('Batched Item');
      expect(items![0].status).toBe('resolved');
      expect(items![1].status).toBe('resolved');
    });

    it('marks items as missing when not found in batch or cache', async () => {
      // Mock batch returning empty (item not found)
      mockUseBatchWardrobeItems.mockReturnValue(
        createMockBatchResult(new Map(), { missingIds: ['item-a'] })
      );

      const outfits = [createMockOutfit({ itemIds: ['item-a'] })];

      const { result } = renderHook(
        () => useResolvedOutfitItems({ outfits }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.resolvedOutfits.size).toBe(1);
      });

      const items = result.current.resolvedOutfits.get('outfit-001');
      expect(items![0].status).toBe('missing');
      expect(items![0].displayName).toBe('Unknown item');
    });
  });

  // ==========================================================================
  // Loading State Tests
  // ==========================================================================

  describe('loading states', () => {
    it('returns isLoading true while batch fetch is in progress', () => {
      mockUseBatchWardrobeItems.mockReturnValue(
        createMockBatchResult(new Map(), { isLoading: true })
      );

      const outfits = [createMockOutfit()];

      const { result } = renderHook(
        () => useResolvedOutfitItems({ outfits }),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(true);
    });

    it('returns isLoading false when all items are cached', () => {
      // Cache all items
      const itemA = createMockBatchItem({ id: 'item-a' });
      const itemB = createMockBatchItem({ id: 'item-b' });
      const itemC = createMockBatchItem({ id: 'item-c' });

      queryClient.setQueryData(['wardrobe', 'items', 'test-user-123', 'detail', 'item-a'], itemA);
      queryClient.setQueryData(['wardrobe', 'items', 'test-user-123', 'detail', 'item-b'], itemB);
      queryClient.setQueryData(['wardrobe', 'items', 'test-user-123', 'detail', 'item-c'], itemC);

      const outfits = [createMockOutfit({ itemIds: ['item-a', 'item-b', 'item-c'] })];

      const { result } = renderHook(
        () => useResolvedOutfitItems({ outfits }),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(false);
    });

    it('returns isLoading false when batch fetch completes', async () => {
      // Start with loading state
      mockUseBatchWardrobeItems.mockReturnValue(
        createMockBatchResult(new Map(), { isLoading: true })
      );

      const outfits = [createMockOutfit()];

      const { result, rerender } = renderHook(
        () => useResolvedOutfitItems({ outfits }),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(true);

      // Simulate batch fetch completing
      const batchedItems = new Map([
        ['item-a', createMockBatchItem({ id: 'item-a' })],
        ['item-b', createMockBatchItem({ id: 'item-b' })],
        ['item-c', createMockBatchItem({ id: 'item-c' })],
      ]);
      mockUseBatchWardrobeItems.mockReturnValue(
        createMockBatchResult(batchedItems, { isLoading: false })
      );

      rerender({});

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('error handling', () => {
    it('sets isError to true when batch fetch fails', () => {
      const error = { code: 'network', message: 'Network error' };
      mockUseBatchWardrobeItems.mockReturnValue(
        createMockBatchResult(new Map(), { isError: true, error })
      );

      const outfits = [createMockOutfit()];

      const { result } = renderHook(
        () => useResolvedOutfitItems({ outfits }),
        { wrapper }
      );

      expect(result.current.isError).toBe(true);
    });

    it('populates error message from batch fetch error', () => {
      const error = { code: 'server', message: 'Server unavailable' };
      mockUseBatchWardrobeItems.mockReturnValue(
        createMockBatchResult(new Map(), { isError: true, error })
      );

      const outfits = [createMockOutfit()];

      const { result } = renderHook(
        () => useResolvedOutfitItems({ outfits }),
        { wrapper }
      );

      expect(result.current.error).toBe('Server unavailable');
    });

    it('logs error telemetry when batch fetch fails', async () => {
      const error = { code: 'network', message: 'Network error' };
      mockUseBatchWardrobeItems.mockReturnValue(
        createMockBatchResult(new Map(), { isError: true, error })
      );

      const outfits = [createMockOutfit()];

      renderHook(
        () => useResolvedOutfitItems({ outfits }),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockLogError).toHaveBeenCalled();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith(
        'recommendations_items_resolution_failed',
        expect.objectContaining({
          errorCode: 'network',
          errorMessage: 'Network error',
        })
      );
    });
  });

  // ==========================================================================
  // Telemetry Tests
  // ==========================================================================

  describe('telemetry', () => {
    it('tracks recommendations_items_resolved on success', async () => {
      const batchedItems = new Map([
        ['item-a', createMockBatchItem({ id: 'item-a' })],
        ['item-b', createMockBatchItem({ id: 'item-b' })],
        ['item-c', createMockBatchItem({ id: 'item-c' })],
      ]);
      mockUseBatchWardrobeItems.mockReturnValue(
        createMockBatchResult(batchedItems)
      );

      const outfits = [createMockOutfit()];

      renderHook(
        () => useResolvedOutfitItems({ outfits }),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockTrackCaptureEvent).toHaveBeenCalledWith(
          'recommendations_items_resolved',
          expect.objectContaining({
            userId: 'test-user-123',
            metadata: expect.objectContaining({
              outfitCount: 1,
              totalItems: 3,
              resolvedCount: 3,
              missingCount: 0,
            }),
          })
        );
      });
    });

    it('tracks recommendations_high_missing_rate when missing rate exceeds threshold', async () => {
      // Mock 3 items, 2 missing (66% missing rate > 20% threshold)
      const batchedItems = new Map([
        ['item-a', createMockBatchItem({ id: 'item-a' })],
      ]);
      mockUseBatchWardrobeItems.mockReturnValue(
        createMockBatchResult(batchedItems, { missingIds: ['item-b', 'item-c'] })
      );

      const outfits = [createMockOutfit({ itemIds: ['item-a', 'item-b', 'item-c'] })];

      renderHook(
        () => useResolvedOutfitItems({ outfits }),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockTrackCaptureEvent).toHaveBeenCalledWith(
          'recommendations_high_missing_rate',
          expect.objectContaining({
            metadata: expect.objectContaining({
              missingCount: 2,
            }),
          })
        );
      });
    });

    it('does not track high missing rate when below threshold', async () => {
      // Mock 10 items, 1 missing (10% missing rate < 20% threshold)
      const itemIds = Array.from({ length: 10 }, (_, i) => `item-${i}`);
      const batchedItems = new Map(
        itemIds.slice(0, 9).map((id) => [id, createMockBatchItem({ id })])
      );
      mockUseBatchWardrobeItems.mockReturnValue(
        createMockBatchResult(batchedItems, { missingIds: ['item-9'] })
      );

      const outfits = [createMockOutfit({ itemIds })];

      renderHook(
        () => useResolvedOutfitItems({ outfits }),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockTrackCaptureEvent).toHaveBeenCalledWith(
          'recommendations_items_resolved',
          expect.anything()
        );
      });

      expect(mockTrackCaptureEvent).not.toHaveBeenCalledWith(
        'recommendations_high_missing_rate',
        expect.anything()
      );
    });
  });

  // ==========================================================================
  // Count Tests
  // ==========================================================================

  describe('resolved and missing counts', () => {
    it('reports correct resolvedCount and missingCount', async () => {
      // 2 resolved, 1 missing
      const batchedItems = new Map([
        ['item-a', createMockBatchItem({ id: 'item-a' })],
        ['item-b', createMockBatchItem({ id: 'item-b' })],
      ]);
      mockUseBatchWardrobeItems.mockReturnValue(
        createMockBatchResult(batchedItems, { missingIds: ['item-c'] })
      );

      const outfits = [createMockOutfit()];

      const { result } = renderHook(
        () => useResolvedOutfitItems({ outfits }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.resolvedCount).toBe(2);
        expect(result.current.missingCount).toBe(1);
      });
    });
  });

  // ==========================================================================
  // Refetch Tests
  // ==========================================================================

  describe('refetch function', () => {
    it('refetch function triggers batch query refetch', () => {
      const mockRefetch = jest.fn();
      mockUseBatchWardrobeItems.mockReturnValue({
        ...createMockBatchResult(),
        refetch: mockRefetch,
      });

      const outfits = [createMockOutfit()];

      const { result } = renderHook(
        () => useResolvedOutfitItems({ outfits }),
        { wrapper }
      );

      act(() => {
        result.current.refetch();
      });

      expect(mockRefetch).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// useResolvedOutfitItemsSingle Tests
// ============================================================================

describe('useResolvedOutfitItemsSingle', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    jest.clearAllMocks();

    mockUseBatchWardrobeItems.mockReturnValue(
      createMockBatchResult()
    );
  });

  afterEach(() => {
    queryClient.clear();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('returns empty items array when outfit is null', () => {
    const { result } = renderHook(
      () => useResolvedOutfitItemsSingle(null),
      { wrapper }
    );

    expect(result.current.items).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns resolved items for a single outfit', async () => {
    const batchedItems = new Map([
      ['item-a', createMockBatchItem({ id: 'item-a', name: 'Test Item' })],
    ]);
    mockUseBatchWardrobeItems.mockReturnValue(
      createMockBatchResult(batchedItems)
    );

    const outfit = createMockOutfit({ itemIds: ['item-a'] });

    const { result } = renderHook(
      () => useResolvedOutfitItemsSingle(outfit),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    expect(result.current.items[0].displayName).toBe('Test Item');
  });

  it('respects enabled parameter', () => {
    const outfit = createMockOutfit();

    renderHook(
      () => useResolvedOutfitItemsSingle(outfit, false),
      { wrapper }
    );

    expect(mockUseBatchWardrobeItems).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });
});
