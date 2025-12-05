/**
 * Tests for useLatestWearEventForOutfit hook.
 *
 * Tests cover:
 * - Query enablement based on userId (from store) and outfitId (from prop)
 * - Successful data fetching returning the latest wear event
 * - Empty state when no wear events exist (returns null)
 * - Error propagation and transformation to WearHistoryClientError
 * - Cache key configuration
 *
 * @module features/wearHistory/hooks/useLatestWearEventForOutfit.test
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useLatestWearEventForOutfit } from './useLatestWearEventForOutfit';
import * as wearHistoryRepository from '../api/wearHistoryRepository';
import { WearHistoryClientError } from '../api/wearHistoryClient';
import type { User } from '../../auth/store/sessionSlice';
import type { WearHistoryRow } from '../types';

// Mock dependencies - preserve WearHistoryError class while mocking functions
jest.mock('../api/wearHistoryRepository', () => {
  const actual = jest.requireActual('../api/wearHistoryRepository');
  return {
    ...actual,
    getLatestWearEventForOutfit: jest.fn(),
  };
});

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
  outfit_id: 'outfit-456',
  item_ids: ['item-1', 'item-2'],
  worn_date: '2024-12-01',
  worn_at: '2024-12-01T10:00:00Z',
  source: 'ai_recommendation',
  context: 'Work meeting',
  notes: null,
  created_at: '2024-12-01T10:00:00Z',
  updated_at: '2024-12-01T10:00:00Z',
  ...overrides,
});

describe('useLatestWearEventForOutfit', () => {
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
    it('should run query when both userId and outfitId are present', async () => {
      const mockEvent = createMockWearEvent();
      (wearHistoryRepository.getLatestWearEventForOutfit as jest.Mock).mockResolvedValue(mockEvent);

      const { result } = renderHook(() => useLatestWearEventForOutfit('outfit-456'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(wearHistoryRepository.getLatestWearEventForOutfit).toHaveBeenCalledWith(
        'test-user-123',
        'outfit-456'
      );
    });

    it('should not run query when user is null', () => {
      mockUser = null;

      const { result } = renderHook(() => useLatestWearEventForOutfit('outfit-456'), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(wearHistoryRepository.getLatestWearEventForOutfit).not.toHaveBeenCalled();
    });

    it('should not run query when user ID is empty string', () => {
      mockUser = {
        id: '',
        email: 'test@example.com',
        emailVerified: true,
        hasOnboarded: true,
      };

      const { result } = renderHook(() => useLatestWearEventForOutfit('outfit-456'), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(wearHistoryRepository.getLatestWearEventForOutfit).not.toHaveBeenCalled();
    });

    it('should not run query when outfitId is undefined', () => {
      const { result } = renderHook(() => useLatestWearEventForOutfit(undefined), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(wearHistoryRepository.getLatestWearEventForOutfit).not.toHaveBeenCalled();
    });

    it('should not run query when outfitId is empty string', () => {
      const { result } = renderHook(() => useLatestWearEventForOutfit(''), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(wearHistoryRepository.getLatestWearEventForOutfit).not.toHaveBeenCalled();
    });
  });

  describe('Successful data fetching', () => {
    it('should return event when wear history exists', async () => {
      const mockEvent = createMockWearEvent({
        id: 'latest-event',
        worn_date: '2024-12-05',
        context: 'Office day',
      });
      (wearHistoryRepository.getLatestWearEventForOutfit as jest.Mock).mockResolvedValue(mockEvent);

      const { result } = renderHook(() => useLatestWearEventForOutfit('outfit-456'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.event).toEqual(mockEvent);
      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should call repository with correct userId and outfitId', async () => {
      const mockEvent = createMockWearEvent();
      (wearHistoryRepository.getLatestWearEventForOutfit as jest.Mock).mockResolvedValue(mockEvent);

      renderHook(() => useLatestWearEventForOutfit('specific-outfit-id'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(wearHistoryRepository.getLatestWearEventForOutfit).toHaveBeenCalledWith(
          'test-user-123',
          'specific-outfit-id'
        );
      });
    });
  });

  describe('Empty state handling', () => {
    it('should return null event when no wear events exist', async () => {
      (wearHistoryRepository.getLatestWearEventForOutfit as jest.Mock).mockResolvedValue(null);

      const { result } = renderHook(() => useLatestWearEventForOutfit('never-worn-outfit'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.event).toBeNull();
      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return null event when query is disabled', () => {
      mockUser = null;

      const { result } = renderHook(() => useLatestWearEventForOutfit('outfit-456'), {
        wrapper: createWrapper(),
      });

      expect(result.current.event).toBeNull();
    });
  });

  describe('Error handling', () => {
    it('should set isError true on fetch failure', async () => {
      // Using 'validation' error type since it doesn't trigger retries
      const error = new wearHistoryRepository.WearHistoryError('Invalid request', 'validation');
      (wearHistoryRepository.getLatestWearEventForOutfit as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useLatestWearEventForOutfit('outfit-456'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.event).toBeNull();
    });

    it('should transform repository error to client error', async () => {
      // Using 'auth' error type since it doesn't trigger retries
      const repositoryError = new wearHistoryRepository.WearHistoryError('Session expired', 'auth');
      (wearHistoryRepository.getLatestWearEventForOutfit as jest.Mock).mockRejectedValue(
        repositoryError
      );

      const { result } = renderHook(() => useLatestWearEventForOutfit('outfit-456'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(WearHistoryClientError);
      expect(result.current.error?.code).toBe('auth');
    });

    it('should handle auth errors', async () => {
      const authError = new wearHistoryRepository.WearHistoryError('Not authenticated', 'auth');
      (wearHistoryRepository.getLatestWearEventForOutfit as jest.Mock).mockRejectedValue(authError);

      const { result } = renderHook(() => useLatestWearEventForOutfit('outfit-456'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.code).toBe('auth');
      expect(result.current.error?.isRetryable).toBe(false);
    });

    it('should handle validation errors', async () => {
      const validationError = new wearHistoryRepository.WearHistoryError(
        'Invalid outfit ID',
        'validation'
      );
      (wearHistoryRepository.getLatestWearEventForOutfit as jest.Mock).mockRejectedValue(
        validationError
      );

      const { result } = renderHook(() => useLatestWearEventForOutfit('outfit-456'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.code).toBe('validation');
      expect(result.current.error?.isRetryable).toBe(false);
    });

    it('should return null error when no error occurs', async () => {
      const mockEvent = createMockWearEvent();
      (wearHistoryRepository.getLatestWearEventForOutfit as jest.Mock).mockResolvedValue(mockEvent);

      const { result } = renderHook(() => useLatestWearEventForOutfit('outfit-456'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Query key configuration', () => {
    it('should use correct cache key with userId and outfitId', async () => {
      const mockEvent = createMockWearEvent();
      (wearHistoryRepository.getLatestWearEventForOutfit as jest.Mock).mockResolvedValue(mockEvent);

      const { result } = renderHook(() => useLatestWearEventForOutfit('outfit-456'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const cacheKey = queryClient
        .getQueryCache()
        .getAll()
        .find((query) => query.state.data)?.queryKey;

      expect(cacheKey).toEqual(['wear-history', 'test-user-123', 'latest', 'outfit-456']);
    });
  });

  describe('Return type structure', () => {
    it('should return object with all expected properties', async () => {
      const mockEvent = createMockWearEvent();
      (wearHistoryRepository.getLatestWearEventForOutfit as jest.Mock).mockResolvedValue(mockEvent);

      const { result } = renderHook(() => useLatestWearEventForOutfit('outfit-456'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current).toHaveProperty('event');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('isError');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('refetch');
    });

    it('should return refetch as function', async () => {
      const mockEvent = createMockWearEvent();
      (wearHistoryRepository.getLatestWearEventForOutfit as jest.Mock).mockResolvedValue(mockEvent);

      const { result } = renderHook(() => useLatestWearEventForOutfit('outfit-456'), {
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
      (wearHistoryRepository.getLatestWearEventForOutfit as jest.Mock).mockImplementation(
        () => new Promise(() => {})
      );

      const { result } = renderHook(() => useLatestWearEventForOutfit('outfit-456'), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('should set isLoading false after fetch completes', async () => {
      const mockEvent = createMockWearEvent();
      (wearHistoryRepository.getLatestWearEventForOutfit as jest.Mock).mockResolvedValue(mockEvent);

      const { result } = renderHook(() => useLatestWearEventForOutfit('outfit-456'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should set isLoading false when query is disabled', () => {
      mockUser = null;

      const { result } = renderHook(() => useLatestWearEventForOutfit('outfit-456'), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
    });
  });
});
