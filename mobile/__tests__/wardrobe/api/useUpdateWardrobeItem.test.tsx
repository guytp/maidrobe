/**
 * Unit tests for useUpdateWardrobeItem hook.
 *
 * Tests the React Query mutation hook for updating wardrobe items,
 * covering validation, error handling, cache updates, and telemetry.
 *
 * @module __tests__/wardrobe/api/useUpdateWardrobeItem
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import { useUpdateWardrobeItem } from '../../../src/features/wardrobe/api/useUpdateWardrobeItem';
import * as updateWardrobeItemModule from '../../../src/features/wardrobe/api/updateWardrobeItem';
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

// Mock updateWardrobeItem - define mock class inside factory with 'mock' prefixed properties
jest.mock('../../../src/features/wardrobe/api/updateWardrobeItem', () => ({
  updateWardrobeItem: jest.fn(),
  UpdateWardrobeItemError: class MockUpdateWardrobeItemError extends Error {
    public readonly mockCode: string;
    public readonly mockOriginalError?: unknown;

    constructor(message: string, mockCode: string, mockOriginalError?: unknown) {
      super(message);
      this.name = 'UpdateWardrobeItemError';
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

describe('useUpdateWardrobeItem', () => {
  let queryClient: QueryClient;

  const mockTelemetry = telemetry as jest.Mocked<typeof telemetry>;
  const mockUpdateModule = updateWardrobeItemModule as jest.Mocked<typeof updateWardrobeItemModule>;

  const mockItemDetail = {
    id: 'item-123',
    user_id: 'test-user-123',
    name: 'Updated Item',
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
    updated_at: '2024-01-02T00:00:00Z',
  };

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
      const { result } = renderHook(() => useUpdateWardrobeItem(), { wrapper });

      expect(result.current.isPending).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.data).toBeUndefined();
      expect(typeof result.current.updateItem).toBe('function');
      expect(typeof result.current.reset).toBe('function');
    });
  });

  describe('successful update', () => {
    it('updates item successfully', async () => {
      mockUpdateModule.updateWardrobeItem.mockResolvedValueOnce(mockItemDetail);

      const { result } = renderHook(() => useUpdateWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.updateItem({
          itemId: 'item-123',
          name: 'Updated Item',
          tags: ['casual', 'summer'],
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.isPending).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(result.current.data).toEqual(mockItemDetail);
    });

    it('calls updateWardrobeItem with correct params', async () => {
      mockUpdateModule.updateWardrobeItem.mockResolvedValueOnce(mockItemDetail);

      const { result } = renderHook(() => useUpdateWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.updateItem({
          itemId: 'item-123',
          name: 'Updated Item',
          tags: ['casual', 'summer'],
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockUpdateModule.updateWardrobeItem).toHaveBeenCalledWith({
        userId: 'test-user-123',
        itemId: 'item-123',
        name: 'Updated Item',
        tags: ['casual', 'summer'],
      });
    });

    it('emits telemetry events on success', async () => {
      mockUpdateModule.updateWardrobeItem.mockResolvedValueOnce(mockItemDetail);

      const { result } = renderHook(() => useUpdateWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.updateItem({
          itemId: 'item-123',
          name: 'Updated Item',
          tags: ['casual', 'summer'],
          originalName: 'Original Item',
          originalTags: ['formal'],
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should emit both legacy and new events
      expect(mockTelemetry.trackCaptureEvent).toHaveBeenCalledWith(
        'wardrobe_item_updated',
        expect.objectContaining({
          userId: 'test-user-123',
          itemId: 'item-123',
        })
      );

      expect(mockTelemetry.trackCaptureEvent).toHaveBeenCalledWith(
        'item_edited',
        expect.objectContaining({
          userId: 'test-user-123',
          itemId: 'item-123',
          nameChanged: true,
          tagsChanged: true,
        })
      );
    });

    it('correctly determines nameChanged flag', async () => {
      mockUpdateModule.updateWardrobeItem.mockResolvedValueOnce(mockItemDetail);

      const { result } = renderHook(() => useUpdateWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.updateItem({
          itemId: 'item-123',
          name: 'Same Name',
          tags: ['casual'],
          originalName: 'Same Name',
          originalTags: ['different'],
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockTelemetry.trackCaptureEvent).toHaveBeenCalledWith(
        'item_edited',
        expect.objectContaining({
          nameChanged: false,
          tagsChanged: true,
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
      const networkError = new mockUpdateModule.UpdateWardrobeItemError('Network error', 'network');
      // Use mockRejectedValue (not Once) because network errors are retried
      mockUpdateModule.updateWardrobeItem.mockRejectedValue(networkError);

      const { result } = renderHook(() => useUpdateWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.updateItem({
          itemId: 'item-123',
          name: 'Updated Item',
          tags: [],
        });
      });

      // Fast-forward through retry delays (retry delays can be up to 10s with jitter)
      // Run timers and await pending promises in sequence for each retry
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

    it('handles validation errors', async () => {
      const validationError = new mockUpdateModule.UpdateWardrobeItemError(
        'Validation error',
        'validation'
      );
      mockUpdateModule.updateWardrobeItem.mockRejectedValueOnce(validationError);

      const { result } = renderHook(() => useUpdateWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.updateItem({
          itemId: 'item-123',
          name: '',
          tags: [],
        });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.code).toBe('validation');
    });

    it('emits telemetry events on failure', async () => {
      const serverError = new mockUpdateModule.UpdateWardrobeItemError('Server error', 'server');
      // Use mockRejectedValue (not Once) because server errors are retried
      mockUpdateModule.updateWardrobeItem.mockRejectedValue(serverError);

      const { result } = renderHook(() => useUpdateWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.updateItem({
          itemId: 'item-123',
          name: 'Updated Item',
          tags: [],
        });
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
        'wardrobe_item_update_failed',
        expect.objectContaining({
          userId: 'test-user-123',
          itemId: 'item-123',
          errorCode: 'server',
        })
      );

      expect(mockTelemetry.trackCaptureEvent).toHaveBeenCalledWith(
        'item_edit_failed',
        expect.objectContaining({
          userId: 'test-user-123',
          itemId: 'item-123',
          errorCategory: 'server',
        })
      );
    });

    it('logs errors to observability stack', async () => {
      const serverError = new mockUpdateModule.UpdateWardrobeItemError('Server error', 'server');
      // Use mockRejectedValue (not Once) because server errors are retried
      mockUpdateModule.updateWardrobeItem.mockRejectedValue(serverError);

      const { result } = renderHook(() => useUpdateWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.updateItem({
          itemId: 'item-123',
          name: 'Updated Item',
          tags: [],
        });
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
          operation: 'updateItem',
        })
      );
    });
  });

  describe('reset functionality', () => {
    it('resets mutation state', async () => {
      mockUpdateModule.updateWardrobeItem.mockResolvedValueOnce(mockItemDetail);

      const { result } = renderHook(() => useUpdateWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.updateItem({
          itemId: 'item-123',
          name: 'Updated Item',
          tags: [],
        });
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

      expect(result.current.data).toBeUndefined();
    });
  });

  describe('cache updates', () => {
    it('updates detail query cache on success', async () => {
      mockUpdateModule.updateWardrobeItem.mockResolvedValueOnce(mockItemDetail);

      // Pre-populate cache with old data
      const oldData = { ...mockItemDetail, name: 'Old Name' };
      queryClient.setQueryData(
        ['wardrobe', 'items', 'test-user-123', 'detail', 'item-123'],
        oldData
      );

      const { result } = renderHook(() => useUpdateWardrobeItem(), { wrapper });

      await act(async () => {
        result.current.updateItem({
          itemId: 'item-123',
          name: 'Updated Item',
          tags: ['casual', 'summer'],
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Cache should be updated with new data
      const cachedData = queryClient.getQueryData([
        'wardrobe',
        'items',
        'test-user-123',
        'detail',
        'item-123',
      ]);
      expect(cachedData).toEqual(mockItemDetail);
    });
  });
});
