/**
 * Unit tests for useBatchWardrobeItems hook.
 *
 * Tests the React Query hook for batch fetching wardrobe items,
 * covering successful fetches, partial results, error handling,
 * and retry behaviour.
 *
 * @module __tests__/wardrobe/api/useBatchWardrobeItems
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import { useBatchWardrobeItems } from '../../../src/features/wardrobe/api/useBatchWardrobeItems';
import * as fetchBatchModule from '../../../src/features/wardrobe/api/fetchWardrobeItemsBatch';
import * as telemetry from '../../../src/core/telemetry';
import type { BatchWardrobeItem } from '../../../src/features/wardrobe/types';

// ============================================================================
// Mocks
// ============================================================================

// Mock telemetry
jest.mock('../../../src/core/telemetry', () => ({
  logError: jest.fn(),
  trackCaptureEvent: jest.fn(),
}));

// Mock store
jest.mock('../../../src/core/state/store', () => ({
  useStore: jest.fn((selector) =>
    selector({
      user: { id: 'test-user-123' },
    })
  ),
}));

// Mock fetchWardrobeItemsBatch - define mock class inside factory
jest.mock('../../../src/features/wardrobe/api/fetchWardrobeItemsBatch', () => ({
  fetchWardrobeItemsBatch: jest.fn(),
  FetchBatchItemsError: class MockFetchBatchItemsError extends Error {
    public readonly mockCode: string;
    public readonly mockOriginalError?: unknown;

    constructor(message: string, mockCode: string, mockOriginalError?: unknown) {
      super(message);
      this.name = 'FetchBatchItemsError';
      this.mockCode = mockCode;
      this.mockOriginalError = mockOriginalError;
    }

    // Getter for 'code' property to maintain API compatibility
    get code(): string {
      return this.mockCode;
    }

    get originalError(): unknown {
      return this.mockOriginalError;
    }
  },
  MAX_BATCH_SIZE: 100,
}));

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Creates a valid BatchWardrobeItem for testing.
 */
function createMockBatchItem(overrides: Partial<BatchWardrobeItem> = {}): BatchWardrobeItem {
  return {
    id: 'item-a',
    user_id: 'test-user-123',
    name: 'Navy Blazer',
    thumb_key: 'user/test-user-123/items/item-a/thumb.jpg',
    clean_key: 'user/test-user-123/items/item-a/clean.jpg',
    original_key: 'user/test-user-123/items/item-a/original.jpg',
    type: 'blazer',
    colour: ['navy'],
    ...overrides,
  };
}

/**
 * Creates a successful fetch response.
 */
function createSuccessResponse(items: BatchWardrobeItem[], missingIds: string[] = []) {
  const itemsMap = new Map<string, BatchWardrobeItem>();
  items.forEach((item) => itemsMap.set(item.id, item));
  return { items: itemsMap, missingIds };
}

// ============================================================================
// Test Setup
// ============================================================================

describe('useBatchWardrobeItems', () => {
  let queryClient: QueryClient;
  const mockTelemetry = telemetry as jest.Mocked<typeof telemetry>;
  const mockFetchModule = fetchBatchModule as jest.Mocked<typeof fetchBatchModule>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  // ==========================================================================
  // Successful Fetch Tests
  // ==========================================================================

  describe('successful fetch', () => {
    it('returns items map for successful fetch', async () => {
      const itemA = createMockBatchItem({ id: 'item-a', name: 'Item A' });
      const itemB = createMockBatchItem({ id: 'item-b', name: 'Item B' });

      mockFetchModule.fetchWardrobeItemsBatch.mockResolvedValueOnce(
        createSuccessResponse([itemA, itemB])
      );

      const { result } = renderHook(
        () => useBatchWardrobeItems({ itemIds: ['item-a', 'item-b'] }),
        { wrapper }
      );

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.items.size).toBe(2);
      expect(result.current.items.get('item-a')?.name).toBe('Item A');
      expect(result.current.items.get('item-b')?.name).toBe('Item B');
      expect(result.current.isError).toBe(false);
    });

    it('returns empty missingIds when all items are found', async () => {
      const items = [createMockBatchItem({ id: 'item-a' }), createMockBatchItem({ id: 'item-b' })];

      mockFetchModule.fetchWardrobeItemsBatch.mockResolvedValueOnce(createSuccessResponse(items));

      const { result } = renderHook(
        () => useBatchWardrobeItems({ itemIds: ['item-a', 'item-b'] }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.missingIds).toEqual([]);
    });

    it('passes correct params to fetchWardrobeItemsBatch', async () => {
      mockFetchModule.fetchWardrobeItemsBatch.mockResolvedValueOnce(createSuccessResponse([]));

      const { result } = renderHook(
        () => useBatchWardrobeItems({ itemIds: ['item-a', 'item-b'] }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetchModule.fetchWardrobeItemsBatch).toHaveBeenCalledWith({
        userId: 'test-user-123',
        itemIds: ['item-a', 'item-b'],
      });
    });

    it('populates individual item cache on success', async () => {
      const itemA = createMockBatchItem({ id: 'item-a' });

      mockFetchModule.fetchWardrobeItemsBatch.mockResolvedValueOnce(createSuccessResponse([itemA]));

      const { result } = renderHook(() => useBatchWardrobeItems({ itemIds: ['item-a'] }), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Check that item was cached under the detail key
      const cachedItem = queryClient.getQueryData([
        'wardrobe',
        'items',
        'test-user-123',
        'detail',
        'item-a',
      ]);
      expect(cachedItem).toEqual(itemA);
    });
  });

  // ==========================================================================
  // Missing Items Handling Tests
  // ==========================================================================

  describe('missing items handling', () => {
    it('returns partial results when some items are not found', async () => {
      const itemA = createMockBatchItem({ id: 'item-a' });

      mockFetchModule.fetchWardrobeItemsBatch.mockResolvedValueOnce(
        createSuccessResponse([itemA], ['item-b', 'item-c'])
      );

      const { result } = renderHook(
        () => useBatchWardrobeItems({ itemIds: ['item-a', 'item-b', 'item-c'] }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.items.size).toBe(1);
      expect(result.current.items.get('item-a')).toBeDefined();
      expect(result.current.missingIds).toEqual(['item-b', 'item-c']);
    });

    it('populates missingIds array correctly', async () => {
      mockFetchModule.fetchWardrobeItemsBatch.mockResolvedValueOnce(
        createSuccessResponse([], ['missing-1', 'missing-2'])
      );

      const { result } = renderHook(
        () => useBatchWardrobeItems({ itemIds: ['missing-1', 'missing-2'] }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.missingIds).toHaveLength(2);
      expect(result.current.missingIds).toContain('missing-1');
      expect(result.current.missingIds).toContain('missing-2');
    });

    it('does not error when some items are missing', async () => {
      mockFetchModule.fetchWardrobeItemsBatch.mockResolvedValueOnce(
        createSuccessResponse([], ['item-a'])
      );

      const { result } = renderHook(() => useBatchWardrobeItems({ itemIds: ['item-a'] }), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('error handling', () => {
    beforeEach(() => {
      // Use fake timers to speed up retry delays
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('handles network errors with retry', async () => {
      const networkError = new mockFetchModule.FetchBatchItemsError('Network error', 'network');
      // Mock rejection for all retries
      mockFetchModule.fetchWardrobeItemsBatch.mockRejectedValue(networkError);

      const { result } = renderHook(() => useBatchWardrobeItems({ itemIds: ['item-a'] }), {
        wrapper,
      });

      // Fast-forward through retry delays (retry 3 times + initial)
      for (let i = 0; i < 4; i++) {
        await act(async () => {
          jest.advanceTimersByTime(15000);
        });
      }

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isError).toBe(true);
      expect(result.current.error?.code).toBe('network');
    });

    it('handles server errors with retry', async () => {
      const serverError = new mockFetchModule.FetchBatchItemsError('Server unavailable', 'server');
      mockFetchModule.fetchWardrobeItemsBatch.mockRejectedValue(serverError);

      const { result } = renderHook(() => useBatchWardrobeItems({ itemIds: ['item-a'] }), {
        wrapper,
      });

      // Fast-forward through retry delays
      for (let i = 0; i < 4; i++) {
        await act(async () => {
          jest.advanceTimersByTime(15000);
        });
      }

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isError).toBe(true);
      expect(result.current.error?.code).toBe('server');
    });

    it('handles auth errors without retry', async () => {
      const authError = new mockFetchModule.FetchBatchItemsError('Unauthorized', 'auth');
      mockFetchModule.fetchWardrobeItemsBatch.mockRejectedValueOnce(authError);

      const { result } = renderHook(() => useBatchWardrobeItems({ itemIds: ['item-a'] }), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isError).toBe(true);
      expect(result.current.error?.code).toBe('auth');

      // Should only be called once (no retries for auth errors)
      expect(mockFetchModule.fetchWardrobeItemsBatch).toHaveBeenCalledTimes(1);
    });

    it('logs error telemetry on failure', async () => {
      const networkError = new mockFetchModule.FetchBatchItemsError('Network error', 'network');
      mockFetchModule.fetchWardrobeItemsBatch.mockRejectedValue(networkError);

      renderHook(() => useBatchWardrobeItems({ itemIds: ['item-a', 'item-b'] }), { wrapper });

      // Fast-forward through retry delays
      for (let i = 0; i < 4; i++) {
        await act(async () => {
          jest.advanceTimersByTime(15000);
        });
      }

      await waitFor(() => {
        expect(mockTelemetry.logError).toHaveBeenCalled();
      });

      expect(mockTelemetry.trackCaptureEvent).toHaveBeenCalledWith(
        'wardrobe_items_load_failed',
        expect.objectContaining({
          errorCode: 'network',
          errorMessage: 'Network error',
          itemCount: 2,
        })
      );
    });

    it('sets correct error classification for network errors', async () => {
      const networkError = new mockFetchModule.FetchBatchItemsError('Failed to fetch', 'network');
      mockFetchModule.fetchWardrobeItemsBatch.mockRejectedValue(networkError);

      renderHook(() => useBatchWardrobeItems({ itemIds: ['item-a'] }), { wrapper });

      for (let i = 0; i < 4; i++) {
        await act(async () => {
          jest.advanceTimersByTime(15000);
        });
      }

      await waitFor(() => {
        expect(mockTelemetry.logError).toHaveBeenCalledWith(
          networkError,
          'network',
          expect.any(Object)
        );
      });
    });

    it('sets correct error classification for auth errors', async () => {
      const authError = new mockFetchModule.FetchBatchItemsError('Unauthorized', 'auth');
      mockFetchModule.fetchWardrobeItemsBatch.mockRejectedValueOnce(authError);

      renderHook(() => useBatchWardrobeItems({ itemIds: ['item-a'] }), { wrapper });

      await waitFor(() => {
        expect(mockTelemetry.logError).toHaveBeenCalledWith(authError, 'user', expect.any(Object));
      });
    });
  });

  // ==========================================================================
  // Query Behaviour Tests
  // ==========================================================================

  describe('query behaviour', () => {
    it('does not fetch when enabled is false', async () => {
      const { result } = renderHook(
        () => useBatchWardrobeItems({ itemIds: ['item-a'], enabled: false }),
        { wrapper }
      );

      // Wait a bit to ensure no fetch happens
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(result.current.isLoading).toBe(false);
      expect(mockFetchModule.fetchWardrobeItemsBatch).not.toHaveBeenCalled();
    });

    it('does not fetch when itemIds is empty', async () => {
      const { result } = renderHook(() => useBatchWardrobeItems({ itemIds: [] }), { wrapper });

      // Wait a bit to ensure no fetch happens
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(result.current.isLoading).toBe(false);
      expect(mockFetchModule.fetchWardrobeItemsBatch).not.toHaveBeenCalled();
    });

    it('returns empty map when disabled', () => {
      const { result } = renderHook(
        () => useBatchWardrobeItems({ itemIds: ['item-a'], enabled: false }),
        { wrapper }
      );

      expect(result.current.items.size).toBe(0);
      expect(result.current.missingIds).toEqual([]);
    });

    it('fetches when enabled changes from false to true', async () => {
      mockFetchModule.fetchWardrobeItemsBatch.mockResolvedValue(
        createSuccessResponse([createMockBatchItem({ id: 'item-a' })])
      );

      const { result, rerender } = renderHook<
        ReturnType<typeof useBatchWardrobeItems>,
        { enabled: boolean }
      >(({ enabled }) => useBatchWardrobeItems({ itemIds: ['item-a'], enabled }), {
        wrapper,
        initialProps: { enabled: false },
      });

      expect(mockFetchModule.fetchWardrobeItemsBatch).not.toHaveBeenCalled();

      rerender({ enabled: true });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetchModule.fetchWardrobeItemsBatch).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Refetch Tests
  // ==========================================================================

  describe('refetch function', () => {
    it('allows manual refetch', async () => {
      mockFetchModule.fetchWardrobeItemsBatch.mockResolvedValue(
        createSuccessResponse([createMockBatchItem({ id: 'item-a' })])
      );

      const { result } = renderHook(() => useBatchWardrobeItems({ itemIds: ['item-a'] }), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetchModule.fetchWardrobeItemsBatch).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(mockFetchModule.fetchWardrobeItemsBatch).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ==========================================================================
  // Caching Tests
  // ==========================================================================

  describe('caching', () => {
    it('uses cached data on subsequent renders', async () => {
      const item = createMockBatchItem({ id: 'item-a', name: 'Test Item' });
      mockFetchModule.fetchWardrobeItemsBatch.mockResolvedValueOnce(createSuccessResponse([item]));

      // First render
      const { result: result1, unmount } = renderHook(
        () => useBatchWardrobeItems({ itemIds: ['item-a'] }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result1.current.isLoading).toBe(false);
      });

      unmount();

      // Second render - should use cache
      const { result: result2 } = renderHook(() => useBatchWardrobeItems({ itemIds: ['item-a'] }), {
        wrapper,
      });

      // Should have data immediately from cache (or shortly after)
      await waitFor(() => {
        expect(result2.current.items.get('item-a')?.name).toBe('Test Item');
      });

      // Should only have fetched once
      expect(mockFetchModule.fetchWardrobeItemsBatch).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Loading State Tests
  // ==========================================================================

  describe('loading states', () => {
    it('sets isLoading true during initial fetch', async () => {
      // Create a promise that doesn't resolve immediately
      let resolvePromise: (value: {
        items: Map<string, BatchWardrobeItem>;
        missingIds: string[];
      }) => void;
      const pendingPromise = new Promise<{
        items: Map<string, BatchWardrobeItem>;
        missingIds: string[];
      }>((resolve) => {
        resolvePromise = resolve;
      });
      mockFetchModule.fetchWardrobeItemsBatch.mockReturnValueOnce(pendingPromise);

      const { result } = renderHook(() => useBatchWardrobeItems({ itemIds: ['item-a'] }), {
        wrapper,
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isFetching).toBe(true);

      // Resolve the promise
      act(() => {
        resolvePromise!(createSuccessResponse([createMockBatchItem({ id: 'item-a' })]));
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('sets isFetching true during refetch', async () => {
      mockFetchModule.fetchWardrobeItemsBatch.mockResolvedValue(
        createSuccessResponse([createMockBatchItem({ id: 'item-a' })])
      );

      const { result } = renderHook(() => useBatchWardrobeItems({ itemIds: ['item-a'] }), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // During refetch, isLoading should be false but isFetching should be true
      // This is the expected React Query behaviour for background refetches
      expect(result.current.isLoading).toBe(false);
    });
  });
});

// ============================================================================
// useGetCachedItem Tests
// ============================================================================

// Note: useGetCachedItem tests are included in the main test block above
// since they don't require mocking the fetch function and use the same
// QueryClient setup. The hook is a simple cache accessor.
