/**
 * Tests for useWearHistoryInfiniteQuery hook.
 *
 * Tests cover:
 * - Query enablement based on user authentication
 * - Successful data fetching and pagination
 * - Error handling and classification
 * - Telemetry event tracking
 * - Cache key configuration
 *
 * @module features/wearHistory/hooks/useWearHistoryInfiniteQuery.test
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useWearHistoryInfiniteQuery } from './useWearHistoryInfiniteQuery';
import * as wearHistoryRepository from '../api/wearHistoryRepository';
import * as telemetry from '../../../core/telemetry';
import type { User } from '../../auth/store/sessionSlice';
import type { GetWearHistoryResponse, WearHistoryRow } from '../types';

// Mock dependencies
jest.mock('../api/wearHistoryRepository');
jest.mock('../../../core/telemetry', () => ({
  logError: jest.fn(),
  trackCaptureEvent: jest.fn(),
}));

// Mock store
let mockUser: User | null = {
  id: 'test-user-123',
  email: 'test@example.com',
  emailVerified: true,
  hasOnboarded: true,
};

jest.mock('../../../core/state/store', () => ({
  useStore: (selector: (state: { user: User | null }) => unknown) => selector({ user: mockUser }),
}));

// Sample test data
const createMockWearEvent = (overrides: Partial<WearHistoryRow> = {}): WearHistoryRow => ({
  id: 'event-1',
  user_id: 'test-user-123',
  outfit_id: 'outfit-1',
  item_ids: ['item-1', 'item-2'],
  worn_date: '2024-12-01',
  worn_at: '2024-12-01T10:00:00Z',
  source: 'manual_outfit',
  context: 'Work meeting',
  notes: null,
  created_at: '2024-12-01T10:00:00Z',
  updated_at: '2024-12-01T10:00:00Z',
  ...overrides,
});

const createMockResponse = (
  events: WearHistoryRow[],
  total: number,
  hasMore: boolean
): GetWearHistoryResponse => ({
  events,
  total,
  hasMore,
});

describe('useWearHistoryInfiniteQuery', () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    return wrapper;
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    jest.clearAllMocks();

    // Reset user to authenticated state
    mockUser = {
      id: 'test-user-123',
      email: 'test@example.com',
      emailVerified: true,
      hasOnboarded: true,
    };
  });

  describe('Query enablement', () => {
    it('should run query when user is authenticated', async () => {
      const mockEvents = [createMockWearEvent()];
      const mockResponse = createMockResponse(mockEvents, 1, false);
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(wearHistoryRepository.getWearHistoryForUser).toHaveBeenCalledWith(
        'test-user-123',
        expect.objectContaining({ limit: 20, offset: 0 })
      );
    });

    it('should not run query when user is null', () => {
      mockUser = null;

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      // Disabled query shows isFetching: false with empty events
      expect(result.current.isFetching).toBe(false);
      expect(wearHistoryRepository.getWearHistoryForUser).not.toHaveBeenCalled();
    });

    it('should not run query when user ID is missing', () => {
      mockUser = {
        id: '',
        email: 'test@example.com',
        emailVerified: true,
        hasOnboarded: true,
      };

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      // Disabled query shows isLoading: false with empty events
      expect(result.current.isFetching).toBe(false);
      expect(wearHistoryRepository.getWearHistoryForUser).not.toHaveBeenCalled();
    });

    it('should not run query when enabled is false', () => {
      const { result } = renderHook(() => useWearHistoryInfiniteQuery({ enabled: false }), {
        wrapper: createWrapper(),
      });

      // Disabled query shows isLoading: false with empty events
      expect(result.current.isFetching).toBe(false);
      expect(wearHistoryRepository.getWearHistoryForUser).not.toHaveBeenCalled();
    });
  });

  describe('Successful data fetching', () => {
    it('should return events from successful query', async () => {
      const mockEvents = [
        createMockWearEvent({ id: 'event-1' }),
        createMockWearEvent({ id: 'event-2' }),
      ];
      const mockResponse = createMockResponse(mockEvents, 2, false);
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.events).toHaveLength(2);
      expect(result.current.events[0].id).toBe('event-1');
      expect(result.current.events[1].id).toBe('event-2');
    });

    it('should return totalCount from response', async () => {
      const mockResponse = createMockResponse([createMockWearEvent()], 50, true);
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.totalCount).toBe(50);
    });

    it('should return hasNextPage when more data exists', async () => {
      const mockResponse = createMockResponse([createMockWearEvent()], 50, true);
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasNextPage).toBe(true);
    });

    it('should return hasNextPage false when no more data', async () => {
      const mockResponse = createMockResponse([createMockWearEvent()], 1, false);
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasNextPage).toBe(false);
    });

    it('should return empty events array when no events exist', async () => {
      const mockResponse = createMockResponse([], 0, false);
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.events).toEqual([]);
      expect(result.current.totalCount).toBe(0);
    });
  });

  describe('Custom page size', () => {
    it('should use custom pageSize when provided', async () => {
      const mockResponse = createMockResponse([createMockWearEvent()], 1, false);
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockResolvedValue(mockResponse);

      renderHook(() => useWearHistoryInfiniteQuery({ pageSize: 10 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(wearHistoryRepository.getWearHistoryForUser).toHaveBeenCalledWith(
          'test-user-123',
          expect.objectContaining({ limit: 10, offset: 0 })
        );
      });
    });

    it('should use default pageSize of 20 when not provided', async () => {
      const mockResponse = createMockResponse([createMockWearEvent()], 1, false);
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockResolvedValue(mockResponse);

      renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(wearHistoryRepository.getWearHistoryForUser).toHaveBeenCalledWith(
          'test-user-123',
          expect.objectContaining({ limit: 20, offset: 0 })
        );
      });
    });
  });

  describe('Error handling', () => {
    it('should set isError true on fetch failure', async () => {
      const error = new wearHistoryRepository.WearHistoryError('Test error', 'server');
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBe(error);
    });

    it('should return null error when no error occurs', async () => {
      const mockResponse = createMockResponse([createMockWearEvent()], 1, false);
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Telemetry tracking', () => {
    it('should track wear_history_loaded event on successful first page load', async () => {
      const mockEvents = [createMockWearEvent()];
      const mockResponse = createMockResponse(mockEvents, 10, true);
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(telemetry.trackCaptureEvent).toHaveBeenCalledWith(
        'wear_history_loaded',
        expect.objectContaining({
          userId: 'test-user-123',
          metadata: expect.objectContaining({
            eventCount: 1,
            totalEvents: 10,
          }),
        })
      );
    });

    it('should track wear_history_time_to_first_event when events exist', async () => {
      const mockEvents = [createMockWearEvent()];
      const mockResponse = createMockResponse(mockEvents, 1, false);
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(telemetry.trackCaptureEvent).toHaveBeenCalledWith(
        'wear_history_time_to_first_event',
        expect.objectContaining({
          userId: 'test-user-123',
        })
      );
    });

    it('should not track wear_history_time_to_first_event when no events', async () => {
      const mockResponse = createMockResponse([], 0, false);
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(telemetry.trackCaptureEvent).not.toHaveBeenCalledWith(
        'wear_history_time_to_first_event',
        expect.anything()
      );
    });

    it('should log error on fetch failure', async () => {
      const error = new wearHistoryRepository.WearHistoryError('Test error', 'server');
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(telemetry.logError).toHaveBeenCalledWith(
        error,
        'server',
        expect.objectContaining({
          feature: 'wearHistory',
          operation: 'fetchHistory',
        })
      );
    });

    it('should track wear_history_load_failed on error', async () => {
      // Create error object that matches WearHistoryError structure
      const error = Object.assign(new Error('Network error'), {
        code: 'network',
        name: 'WearHistoryError',
      });
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(telemetry.trackCaptureEvent).toHaveBeenCalledWith(
        'wear_history_load_failed',
        expect.objectContaining({
          userId: 'test-user-123',
          errorCode: 'network',
          errorMessage: 'Network error',
        })
      );
    });
  });

  describe('Return type structure', () => {
    it('should return object with all expected properties', async () => {
      const mockResponse = createMockResponse([createMockWearEvent()], 1, false);
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current).toHaveProperty('events');
      expect(result.current).toHaveProperty('totalCount');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('isError');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('hasNextPage');
      expect(result.current).toHaveProperty('isFetchingNextPage');
      expect(result.current).toHaveProperty('isFetching');
      expect(result.current).toHaveProperty('fetchNextPage');
      expect(result.current).toHaveProperty('refetch');
    });

    it('should return fetchNextPage as function', async () => {
      const mockResponse = createMockResponse([createMockWearEvent()], 1, false);
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.fetchNextPage).toBe('function');
    });

    it('should return refetch as function', async () => {
      const mockResponse = createMockResponse([createMockWearEvent()], 1, false);
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.refetch).toBe('function');
    });
  });

  describe('Loading states', () => {
    it('should set isLoading true during initial fetch', () => {
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockImplementation(
        () => new Promise(() => {})
      );

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('should set isLoading false after fetch completes', async () => {
      const mockResponse = createMockResponse([createMockWearEvent()], 1, false);
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should set isFetching true during any fetch', () => {
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockImplementation(
        () => new Promise(() => {})
      );

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isFetching).toBe(true);
    });
  });

  describe('Query key configuration', () => {
    it('should use correct cache key with user ID', async () => {
      const mockResponse = createMockResponse([createMockWearEvent()], 1, false);
      (wearHistoryRepository.getWearHistoryForUser as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useWearHistoryInfiniteQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const cacheKey = queryClient
        .getQueryCache()
        .getAll()
        .find((query) => query.state.data)?.queryKey;

      expect(cacheKey).toEqual(['wear-history', 'test-user-123']);
    });
  });
});
