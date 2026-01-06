/**
 * Unit tests for useWardrobeItem hook.
 *
 * Tests the React Query hook for fetching a single wardrobe item detail,
 * covering loading states, error handling, and data transformation.
 *
 * @module __tests__/wardrobe/api/useWardrobeItem
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import { useWardrobeItem } from '../../../src/features/wardrobe/api/useWardrobeItem';
import * as fetchWardrobeItemModule from '../../../src/features/wardrobe/api/fetchWardrobeItem';
import * as telemetry from '../../../src/core/telemetry';

// Mock dependencies
jest.mock('../../../src/core/telemetry', () => ({
  logError: jest.fn(),
  trackCaptureEvent: jest.fn(),
}));

jest.mock('../../../src/core/state/store', () => ({
  useStore: jest.fn((selector) =>
    selector({
      user: { id: 'test-user-123' },
    })
  ),
}));

// Mock fetchWardrobeItem - define mock class inside factory with 'mock' prefixed properties
jest.mock('../../../src/features/wardrobe/api/fetchWardrobeItem', () => ({
  fetchWardrobeItem: jest.fn(),
  FetchWardrobeItemError: class MockFetchWardrobeItemError extends Error {
    public readonly mockCode: string;
    public readonly mockOriginalError?: unknown;

    constructor(message: string, mockCode: string, mockOriginalError?: unknown) {
      super(message);
      this.name = 'FetchWardrobeItemError';
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
}));

describe('useWardrobeItem', () => {
  let queryClient: QueryClient;

  // Telemetry is mocked but not directly used in these tests - the hook uses it internally
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _mockTelemetry = telemetry as jest.Mocked<typeof telemetry>;
  const mockFetchModule = fetchWardrobeItemModule as jest.Mocked<typeof fetchWardrobeItemModule>;

  const mockItemDetail = {
    id: 'item-123',
    user_id: 'test-user-123',
    name: 'Test Item',
    tags: ['casual', 'summer'],
    original_key: 'user/test-user-123/items/item-123/original.jpg',
    clean_key: 'user/test-user-123/items/item-123/clean.jpg',
    thumb_key: 'user/test-user-123/items/item-123/thumb.jpg',
    image_processing_status: 'succeeded' as const,
    attribute_status: 'succeeded' as const,
    attribute_last_run_at: '2024-01-01T00:00:00Z',
    attribute_error_reason: null,
    colour: ['blue'],
    type: 'shirt',
    fabric: 'cotton',
    pattern: 'solid',
    fit: 'regular',
    season: ['spring', 'summer'],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

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

  describe('successful fetch', () => {
    it('returns item data on successful fetch', async () => {
      mockFetchModule.fetchWardrobeItem.mockResolvedValueOnce(mockItemDetail);

      const { result } = renderHook(() => useWardrobeItem({ itemId: 'item-123' }), { wrapper });

      // Initially loading
      expect(result.current.isLoading).toBe(true);
      expect(result.current.item).toBeNull();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should have item data
      expect(result.current.item).toEqual(mockItemDetail);
      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('passes correct params to fetchWardrobeItem', async () => {
      mockFetchModule.fetchWardrobeItem.mockResolvedValueOnce(mockItemDetail);

      const { result } = renderHook(() => useWardrobeItem({ itemId: 'item-123' }), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetchModule.fetchWardrobeItem).toHaveBeenCalledWith({
        userId: 'test-user-123',
        itemId: 'item-123',
      });
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      // Use fake timers to speed up retry delays for queries
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('handles network errors', async () => {
      const networkError = new mockFetchModule.FetchWardrobeItemError('Network error', 'network');
      // Use mockRejectedValue (not Once) because network errors are retried
      mockFetchModule.fetchWardrobeItem.mockRejectedValue(networkError);

      const { result } = renderHook(() => useWardrobeItem({ itemId: 'item-123' }), { wrapper });

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
      expect(result.current.error).toBeDefined();
      expect(result.current.error?.code).toBe('network');
    });

    it('handles not found errors', async () => {
      const notFoundError = new mockFetchModule.FetchWardrobeItemError(
        'Item not found',
        'notFound'
      );
      mockFetchModule.fetchWardrobeItem.mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useWardrobeItem({ itemId: 'nonexistent-item' }), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isError).toBe(true);
      expect(result.current.error?.code).toBe('notFound');
    });

    it('handles server errors', async () => {
      const serverError = new mockFetchModule.FetchWardrobeItemError('Server error', 'server');
      // Use mockRejectedValue (not Once) because server errors are retried
      mockFetchModule.fetchWardrobeItem.mockRejectedValue(serverError);

      const { result } = renderHook(() => useWardrobeItem({ itemId: 'item-123' }), { wrapper });

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
  });

  describe('enabled option', () => {
    it('does not fetch when enabled is false', async () => {
      const { result } = renderHook(() => useWardrobeItem({ itemId: 'item-123', enabled: false }), {
        wrapper,
      });

      // Wait a bit to ensure no fetch happens
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(result.current.isLoading).toBe(false);
      expect(mockFetchModule.fetchWardrobeItem).not.toHaveBeenCalled();
    });

    it('fetches when enabled is true', async () => {
      mockFetchModule.fetchWardrobeItem.mockResolvedValueOnce(mockItemDetail);

      const { result } = renderHook(() => useWardrobeItem({ itemId: 'item-123', enabled: true }), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetchModule.fetchWardrobeItem).toHaveBeenCalled();
    });
  });

  describe('caching', () => {
    it('uses cached data on subsequent renders', async () => {
      mockFetchModule.fetchWardrobeItem.mockResolvedValueOnce(mockItemDetail);

      // First render
      const { result: result1, unmount } = renderHook(
        () => useWardrobeItem({ itemId: 'item-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result1.current.isLoading).toBe(false);
      });

      unmount();

      // Second render - should use cache
      const { result: result2 } = renderHook(() => useWardrobeItem({ itemId: 'item-123' }), {
        wrapper,
      });

      // Should have data immediately from cache
      expect(result2.current.item).toEqual(mockItemDetail);
      // Should only have called fetch once
      expect(mockFetchModule.fetchWardrobeItem).toHaveBeenCalledTimes(1);
    });
  });
});
