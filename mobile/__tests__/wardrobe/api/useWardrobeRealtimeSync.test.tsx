/**
 * Unit tests for useWardrobeRealtimeSync hook.
 *
 * Tests the Supabase real-time subscription hook for wardrobe item updates,
 * covering subscription lifecycle, cache invalidation, and error handling.
 *
 * @module __tests__/wardrobe/api/useWardrobeRealtimeSync
 */

import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import { useWardrobeRealtimeSync } from '../../../src/features/wardrobe/api/useWardrobeRealtimeSync';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../../../src/services/supabase';
import { logError, logSuccess } from '../../../src/core/telemetry';

// Mock the Supabase client
const mockChannel = {
  on: jest.fn().mockReturnThis(),
  subscribe: jest.fn().mockReturnThis(),
};

const mockRemoveChannel = jest.fn();

jest.mock('../../../src/services/supabase', () => ({
  supabase: {
    channel: jest.fn(() => mockChannel),
    removeChannel: mockRemoveChannel,
  },
}));

// Mock telemetry
jest.mock('../../../src/core/telemetry', () => ({
  logError: jest.fn(),
  logSuccess: jest.fn(),
}));

// Get typed mock references
const mockSupabase = jest.mocked(supabase);
const mockLogError = jest.mocked(logError);
const mockLogSuccess = jest.mocked(logSuccess);

// Mock store
const mockUserId = 'test-user-123';
jest.mock('../../../src/core/state/store', () => ({
  useStore: jest.fn((selector) =>
    selector({
      user: { id: mockUserId },
    })
  ),
}));

describe('useWardrobeRealtimeSync', () => {
  let queryClient: QueryClient;
  let capturedSubscribeCallback: (status: string, err?: Error) => void;
  let capturedChangeHandler: (
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>
  ) => void;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    jest.clearAllMocks();

    // Capture the callbacks passed to on() and subscribe()
    mockChannel.on.mockImplementation(
      (
        _event: string,
        _config: Record<string, unknown>,
        handler: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void
      ) => {
        capturedChangeHandler = handler;
        return mockChannel;
      }
    );

    mockChannel.subscribe.mockImplementation((callback: (status: string, err?: Error) => void) => {
      capturedSubscribeCallback = callback;
      return mockChannel;
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('subscription lifecycle', () => {
    it('should create a Supabase channel on mount when user is authenticated', () => {
      renderHook(() => useWardrobeRealtimeSync(), { wrapper });

      expect(mockSupabase.channel).toHaveBeenCalledWith(`wardrobe-items-${mockUserId}`);
      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: '*',
          schema: 'public',
          table: 'items',
          filter: `user_id=eq.${mockUserId}`,
        }),
        expect.any(Function)
      );
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    it('should not create a channel when disabled', () => {
      renderHook(() => useWardrobeRealtimeSync({ enabled: false }), { wrapper });

      expect(mockSupabase.channel).not.toHaveBeenCalled();
    });

    it('should remove channel on unmount', () => {
      const { unmount } = renderHook(() => useWardrobeRealtimeSync(), { wrapper });

      unmount();

      expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
    });

    it('should provide reconnect function', () => {
      const { result } = renderHook(() => useWardrobeRealtimeSync(), { wrapper });

      expect(typeof result.current.reconnect).toBe('function');
    });

    it('should remove and recreate channel on reconnect', () => {
      const { result } = renderHook(() => useWardrobeRealtimeSync(), { wrapper });

      // Initial subscription
      expect(mockSupabase.channel).toHaveBeenCalledTimes(1);

      // Reconnect
      act(() => {
        result.current.reconnect();
      });

      // Should have removed old channel and created new one
      expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
      expect(mockSupabase.channel).toHaveBeenCalledTimes(2);
    });
  });

  describe('subscription status', () => {
    it('should handle SUBSCRIBED status', () => {
      renderHook(() => useWardrobeRealtimeSync(), { wrapper });

      // Simulate successful subscription
      act(() => {
        capturedSubscribeCallback('SUBSCRIBED');
      });

      expect(mockLogSuccess).toHaveBeenCalledWith(
        'wardrobe',
        'realtime_subscribed',
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUserId,
          }),
        })
      );
    });

    it('should handle CHANNEL_ERROR status', () => {
      renderHook(() => useWardrobeRealtimeSync(), { wrapper });

      // Simulate channel error
      const testError = new Error('Connection failed');
      act(() => {
        capturedSubscribeCallback('CHANNEL_ERROR', testError);
      });

      expect(mockLogError).toHaveBeenCalledWith(
        testError,
        'network',
        expect.objectContaining({
          feature: 'wardrobe',
          operation: 'realtime_subscribe',
        })
      );
    });

    it('should handle TIMED_OUT status', () => {
      renderHook(() => useWardrobeRealtimeSync(), { wrapper });

      // Simulate timeout
      act(() => {
        capturedSubscribeCallback('TIMED_OUT');
      });

      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        'network',
        expect.objectContaining({
          feature: 'wardrobe',
          operation: 'realtime_subscribe',
          metadata: expect.objectContaining({
            status: 'TIMED_OUT',
          }),
        })
      );
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate queries when image processing fields change', () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useWardrobeRealtimeSync(), { wrapper });

      // Simulate an UPDATE event with image processing changes
      const payload = {
        eventType: 'UPDATE' as const,
        new: {
          id: 'item-456',
          user_id: mockUserId,
          image_processing_status: 'succeeded',
          clean_key: 'user/test/items/456/clean.jpg',
          thumb_key: 'user/test/items/456/thumb.jpg',
        },
        old: {
          id: 'item-456',
          user_id: mockUserId,
          image_processing_status: 'processing',
          clean_key: null,
          thumb_key: null,
        },
        schema: 'public',
        table: 'items',
        commit_timestamp: '2024-01-01T00:00:00Z',
        errors: [],
      };

      act(() => {
        capturedChangeHandler(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
      });

      // Single invalidation with prefix matching covers both list and detail queries
      // (invalidates all queries under ['wardrobe', 'items', userId])
      expect(invalidateSpy).toHaveBeenCalledTimes(1);
    });

    it('should not invalidate queries when only non-image fields change', () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useWardrobeRealtimeSync(), { wrapper });

      // Simulate an UPDATE event with only name change (no image processing changes)
      const payload = {
        eventType: 'UPDATE' as const,
        new: {
          id: 'item-456',
          user_id: mockUserId,
          image_processing_status: 'succeeded',
          clean_key: 'user/test/items/456/clean.jpg',
          thumb_key: 'user/test/items/456/thumb.jpg',
          name: 'Updated Name',
        },
        old: {
          id: 'item-456',
          user_id: mockUserId,
          image_processing_status: 'succeeded',
          clean_key: 'user/test/items/456/clean.jpg',
          thumb_key: 'user/test/items/456/thumb.jpg',
          name: 'Old Name',
        },
        schema: 'public',
        table: 'items',
        commit_timestamp: '2024-01-01T00:00:00Z',
        errors: [],
      };

      act(() => {
        capturedChangeHandler(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
      });

      // Should NOT invalidate queries since no image processing fields changed
      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('should not invalidate queries for DELETE events', () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useWardrobeRealtimeSync(), { wrapper });

      // Simulate a DELETE event
      const payload = {
        eventType: 'DELETE' as const,
        new: {},
        old: {
          id: 'item-456',
          user_id: mockUserId,
        },
        schema: 'public',
        table: 'items',
        commit_timestamp: '2024-01-01T00:00:00Z',
        errors: [],
      };

      act(() => {
        capturedChangeHandler(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
      });

      // Should NOT invalidate queries for DELETE (handled by delete mutation hook)
      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('should invalidate queries for INSERT with image processing data', () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderHook(() => useWardrobeRealtimeSync(), { wrapper });

      // Simulate an INSERT event with clean_key/thumb_key already populated
      // (unlikely but possible if processing completed before subscription)
      const payload = {
        eventType: 'INSERT' as const,
        new: {
          id: 'item-789',
          user_id: mockUserId,
          image_processing_status: 'succeeded',
          clean_key: 'user/test/items/789/clean.jpg',
          thumb_key: 'user/test/items/789/thumb.jpg',
        },
        old: {},
        schema: 'public',
        table: 'items',
        commit_timestamp: '2024-01-01T00:00:00Z',
        errors: [],
      };

      act(() => {
        capturedChangeHandler(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
      });

      // Single invalidation with prefix matching covers both list and detail queries
      // (invalidates all queries under ['wardrobe', 'items', userId])
      expect(invalidateSpy).toHaveBeenCalledTimes(1);
    });

    it('should log update event for observability', () => {
      renderHook(() => useWardrobeRealtimeSync(), { wrapper });

      // Simulate subscription success first
      act(() => {
        capturedSubscribeCallback('SUBSCRIBED');
      });

      // Clear previous calls
      mockLogSuccess.mockClear();

      // Simulate an UPDATE event
      const payload = {
        eventType: 'UPDATE' as const,
        new: {
          id: 'item-456',
          user_id: mockUserId,
          image_processing_status: 'succeeded',
          clean_key: 'user/test/items/456/clean.jpg',
          thumb_key: 'user/test/items/456/thumb.jpg',
        },
        old: {
          id: 'item-456',
          user_id: mockUserId,
          image_processing_status: 'processing',
          clean_key: null,
          thumb_key: null,
        },
        schema: 'public',
        table: 'items',
        commit_timestamp: '2024-01-01T00:00:00Z',
        errors: [],
      };

      act(() => {
        capturedChangeHandler(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
      });

      expect(mockLogSuccess).toHaveBeenCalledWith(
        'wardrobe',
        'realtime_item_updated',
        expect.objectContaining({
          data: expect.objectContaining({
            itemId: 'item-456',
            userId: mockUserId,
            eventType: 'UPDATE',
            newStatus: 'succeeded',
            hasCleanKey: true,
            hasThumbKey: true,
          }),
        })
      );
    });
  });

  describe('user authentication', () => {
    it('should not subscribe when user is not authenticated', () => {
      // Override mock for this test - need to use require for dynamic mock override
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const { useStore } = require('../../../src/core/state/store');
      useStore.mockImplementation((selector: (state: { user: null }) => unknown) =>
        selector({ user: null })
      );

      renderHook(() => useWardrobeRealtimeSync(), { wrapper });

      expect(mockSupabase.channel).not.toHaveBeenCalled();
    });
  });
});
