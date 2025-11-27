/**
 * Unit tests for useDeleteWardrobeItem hook.
 *
 * Tests the React Query mutation hook for deleting wardrobe items,
 * covering error handling, cache removal, and telemetry.
 *
 * @module __tests__/wardrobe/api/useDeleteWardrobeItem
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import { useDeleteWardrobeItem } from '../../../src/features/wardrobe/api/useDeleteWardrobeItem';
import * as deleteWardrobeItemModule from '../../../src/features/wardrobe/api/deleteWardrobeItem';
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

// Mock deleteWardrobeItem - define mock class inside factory with 'mock' prefixed properties
jest.mock('../../../src/features/wardrobe/api/deleteWardrobeItem', () => ({
  deleteWardrobeItem: jest.fn(),
  DeleteWardrobeItemError: class MockDeleteWardrobeItemError extends Error {
    public readonly mockCode: string;
    public readonly mockOriginalError?: unknown;

    constructor(
      message: string,
      mockCode: string,
      mockOriginalError?: unknown
    ) {
      super(message);
      this.name = 'DeleteWardrobeItemError';
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

describe('useDeleteWardrobeItem', () => {
  let queryClient: QueryClient;

  const mockTelemetry = telemetry as jest.Mocked<typeof telemetry>;
  const mockDeleteModule = deleteWardrobeItemModule as jest.Mocked<typeof deleteWardrobeItemModule>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
        mutations: {
          retry: false,
        },
      },
    });

    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1234567890000);
  });

  afterEach(() => {
    queryClient.clear();
    jest.restoreAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('initial state', () => {
    it('returns correct initial state', () => {
      const { result } = renderHook(() => useDeleteWardrobeItem(), { wrapper });

      expect(result.current.isPending).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
      expect(typeof result.current.deleteItem).toBe('function');
      expect(typeof result.current.reset).toBe('function');
    });
  });

  describe('successful deletion', () => {
    it('deletes item successfully', async () => {
      mockDeleteModule.deleteWardrobeItem.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useDeleteWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.deleteItem({ itemId: 'item-123' });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.isPending).toBe(false);
      expect(result.current.isError).toBe(false);
    });

    it('calls deleteWardrobeItem with correct params', async () => {
      mockDeleteModule.deleteWardrobeItem.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useDeleteWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.deleteItem({ itemId: 'item-123' });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockDeleteModule.deleteWardrobeItem).toHaveBeenCalledWith({
        itemId: 'item-123',
      });
    });

    it('emits telemetry events on success', async () => {
      mockDeleteModule.deleteWardrobeItem.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useDeleteWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.deleteItem({ itemId: 'item-123' });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should emit both legacy and new events
      expect(mockTelemetry.trackCaptureEvent).toHaveBeenCalledWith(
        'wardrobe_item_deleted',
        expect.objectContaining({
          userId: 'test-user-123',
          itemId: 'item-123',
        })
      );

      expect(mockTelemetry.trackCaptureEvent).toHaveBeenCalledWith(
        'item_deleted',
        expect.objectContaining({
          userId: 'test-user-123',
          itemId: 'item-123',
        })
      );
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      // Use fake timers to speed up retry delays
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('handles network errors', async () => {
      const networkError = new mockDeleteModule.DeleteWardrobeItemError(
        'Network error',
        'network'
      );
      // Use mockRejectedValue (not Once) because network errors are retried
      mockDeleteModule.deleteWardrobeItem.mockRejectedValue(networkError);

      const { result } = renderHook(() => useDeleteWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.deleteItem({ itemId: 'item-123' });
      });

      // Fast-forward through retry delays
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          jest.advanceTimersByTime(15000);
        });
      }

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.code).toBe('network');
    });

    it('handles auth errors', async () => {
      const authError = new mockDeleteModule.DeleteWardrobeItemError(
        'Not authorized',
        'auth'
      );
      mockDeleteModule.deleteWardrobeItem.mockRejectedValueOnce(authError);

      const { result } = renderHook(() => useDeleteWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.deleteItem({ itemId: 'item-123' });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.code).toBe('auth');
    });

    it('handles server errors', async () => {
      const serverError = new mockDeleteModule.DeleteWardrobeItemError(
        'Server error',
        'server'
      );
      // Use mockRejectedValue (not Once) because server errors are retried
      mockDeleteModule.deleteWardrobeItem.mockRejectedValue(serverError);

      const { result } = renderHook(() => useDeleteWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.deleteItem({ itemId: 'item-123' });
      });

      // Fast-forward through retry delays
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          jest.advanceTimersByTime(15000);
        });
      }

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.code).toBe('server');
    });

    it('emits telemetry events on failure', async () => {
      const serverError = new mockDeleteModule.DeleteWardrobeItemError(
        'Server error',
        'server'
      );
      // Use mockRejectedValue (not Once) because server errors are retried
      mockDeleteModule.deleteWardrobeItem.mockRejectedValue(serverError);

      const { result } = renderHook(() => useDeleteWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.deleteItem({ itemId: 'item-123' });
      });

      // Fast-forward through retry delays
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          jest.advanceTimersByTime(15000);
        });
      }

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // Should emit both legacy and new error events
      expect(mockTelemetry.trackCaptureEvent).toHaveBeenCalledWith(
        'wardrobe_item_delete_failed',
        expect.objectContaining({
          userId: 'test-user-123',
          itemId: 'item-123',
          errorCode: 'server',
        })
      );

      expect(mockTelemetry.trackCaptureEvent).toHaveBeenCalledWith(
        'item_deletion_failed',
        expect.objectContaining({
          userId: 'test-user-123',
          itemId: 'item-123',
          errorCategory: 'server',
        })
      );
    });

    it('logs errors to observability stack', async () => {
      const serverError = new mockDeleteModule.DeleteWardrobeItemError(
        'Server error',
        'server'
      );
      // Use mockRejectedValue (not Once) because server errors are retried
      mockDeleteModule.deleteWardrobeItem.mockRejectedValue(serverError);

      const { result } = renderHook(() => useDeleteWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.deleteItem({ itemId: 'item-123' });
      });

      // Fast-forward through retry delays
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          jest.advanceTimersByTime(15000);
        });
      }

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(mockTelemetry.logError).toHaveBeenCalledWith(
        serverError,
        'server',
        expect.objectContaining({
          feature: 'wardrobe',
          operation: 'deleteItem',
        })
      );
    });
  });

  describe('reset functionality', () => {
    it('resets mutation state', async () => {
      mockDeleteModule.deleteWardrobeItem.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useDeleteWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.deleteItem({ itemId: 'item-123' });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      await act(async () => {
        result.current.reset();
      });

      // Wait for the reset to take effect
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(false);
      });
    });
  });

  describe('cache removal', () => {
    it('removes item from detail cache on success', async () => {
      mockDeleteModule.deleteWardrobeItem.mockResolvedValueOnce(undefined);

      // Pre-populate cache with item data
      const itemData = { id: 'item-123', name: 'Test Item' };
      queryClient.setQueryData(
        ['wardrobe', 'items', 'test-user-123', 'detail', 'item-123'],
        itemData
      );

      const { result } = renderHook(() => useDeleteWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.deleteItem({ itemId: 'item-123' });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Cache should be removed (not just invalidated)
      const cachedData = queryClient.getQueryData([
        'wardrobe',
        'items',
        'test-user-123',
        'detail',
        'item-123',
      ]);
      expect(cachedData).toBeUndefined();
    });

    it('invalidates grid queries on success', async () => {
      mockDeleteModule.deleteWardrobeItem.mockResolvedValueOnce(undefined);

      // Set up a spy on invalidateQueries
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.deleteItem({ itemId: 'item-123' });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['wardrobe', 'items', 'test-user-123'],
      });
    });
  });

  describe('RLS enforcement scenarios', () => {
    it('handles RLS denial (auth error from server)', async () => {
      // Simulates trying to delete another user's item
      // RLS would return auth error
      const authError = new mockDeleteModule.DeleteWardrobeItemError(
        'Not authorized to delete this item',
        'auth'
      );
      mockDeleteModule.deleteWardrobeItem.mockRejectedValueOnce(authError);

      const { result } = renderHook(() => useDeleteWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.deleteItem({ itemId: 'other-users-item' });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.code).toBe('auth');
      expect(result.current.error?.message).toContain('Not authorized');
    });
  });
});
