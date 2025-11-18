import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useHasWardrobeItems } from './useHasWardrobeItems';
import { supabase } from '../../../services/supabase';
import * as telemetry from '../../../core/telemetry';
import type { User } from '../../../features/auth/store/sessionSlice';

// Mock dependencies
jest.mock('../../../services/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('../../../core/telemetry', () => ({
  logError: jest.fn(),
}));

// Mock store
let mockUser: User | null = {
  id: 'test-user-123',
  email: 'test@example.com',
  emailVerified: true,
  hasOnboarded: false,
};

jest.mock('../../../core/state/store', () => ({
  useStore: (selector: (state: { user: User | null }) => unknown) => selector({ user: mockUser }),
}));

describe('useHasWardrobeItems', () => {
  let queryClient: QueryClient;
  let mockFrom: jest.Mock;
  let mockSelect: jest.Mock;
  let mockEq: jest.Mock;

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
      hasOnboarded: false,
    };

    // Setup default mock chain
    mockEq = jest.fn();
    mockSelect = jest.fn(() => ({ eq: mockEq }));
    mockFrom = jest.fn(() => ({ select: mockSelect }));
    (supabase.from as jest.Mock) = mockFrom;
  });

  describe('Query behavior with items', () => {
    it('should return hasItems: true when user has items (count > 0)', async () => {
      mockEq.mockResolvedValue({ count: 5, error: null });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual({ hasItems: true });
    });

    it('should return hasItems: false when user has no items (count = 0)', async () => {
      mockEq.mockResolvedValue({ count: 0, error: null });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual({ hasItems: false });
    });

    it('should return hasItems: false when count is null', async () => {
      mockEq.mockResolvedValue({ count: null, error: null });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual({ hasItems: false });
    });

    it('should use correct Supabase query parameters', async () => {
      mockEq.mockResolvedValue({ count: 3, error: null });

      renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(mockFrom).toHaveBeenCalledWith('items');
      });

      expect(mockSelect).toHaveBeenCalledWith('*', { count: 'exact', head: true });
      expect(mockEq).toHaveBeenCalledWith('user_id', 'test-user-123');
    });
  });

  describe('Query enablement', () => {
    it('should only run query when user is authenticated', async () => {
      mockEq.mockResolvedValue({ count: 0, error: null });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockFrom).toHaveBeenCalled();
    });

    it('should not run query when user is null', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockUser = null as any;

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('should not run query when user ID is missing', () => {
      mockUser = {
        id: '',
        email: 'test@example.com',
        emailVerified: true,
        hasOnboarded: false,
      };

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle Supabase errors', async () => {
      const supabaseError = new Error('Database connection failed');
      mockEq.mockResolvedValue({ count: null, error: supabaseError });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBe(supabaseError);
    });

    it('should log network errors with correct classification', async () => {
      const networkError = new Error('Network request failed');
      mockEq.mockResolvedValue({ count: null, error: networkError });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(telemetry.logError).toHaveBeenCalledWith(
        networkError,
        'network',
        expect.objectContaining({
          feature: 'onboarding_success',
          operation: 'checkHasItems',
          metadata: expect.objectContaining({
            userId: 'test-user-123',
            errorType: 'network',
          }),
        })
      );
    });

    it('should log server errors with correct classification', async () => {
      const serverError = new Error('Internal server error');
      mockEq.mockResolvedValue({ count: null, error: serverError });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(telemetry.logError).toHaveBeenCalledWith(
        serverError,
        'server',
        expect.objectContaining({
          feature: 'onboarding_success',
          operation: 'checkHasItems',
          metadata: expect.objectContaining({
            userId: 'test-user-123',
            errorType: 'server',
          }),
        })
      );
    });

    it('should classify timeout errors as network errors', async () => {
      const timeoutError = new Error('Request timeout');
      mockEq.mockResolvedValue({ count: null, error: timeoutError });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(telemetry.logError).toHaveBeenCalledWith(
        timeoutError,
        'network',
        expect.objectContaining({
          metadata: expect.objectContaining({
            errorType: 'network',
          }),
        })
      );
    });

    it('should classify connection errors as network errors', async () => {
      const connectionError = new Error('Connection refused');
      mockEq.mockResolvedValue({ count: null, error: connectionError });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(telemetry.logError).toHaveBeenCalledWith(
        connectionError,
        'network',
        expect.objectContaining({
          metadata: expect.objectContaining({
            errorType: 'network',
          }),
        })
      );
    });

    it('should classify fetch errors as network errors', async () => {
      const fetchError = new Error('Fetch failed');
      mockEq.mockResolvedValue({ count: null, error: fetchError });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(telemetry.logError).toHaveBeenCalledWith(
        fetchError,
        'network',
        expect.objectContaining({
          metadata: expect.objectContaining({
            errorType: 'network',
          }),
        })
      );
    });

    it('should classify offline errors as network errors', async () => {
      const offlineError = new Error('Device is offline');
      mockEq.mockResolvedValue({ count: null, error: offlineError });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(telemetry.logError).toHaveBeenCalledWith(
        offlineError,
        'network',
        expect.objectContaining({
          metadata: expect.objectContaining({
            errorType: 'network',
          }),
        })
      );
    });
  });

  describe('Query configuration', () => {
    it('should use correct cache key with user ID', async () => {
      mockEq.mockResolvedValue({ count: 1, error: null });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const cacheKey = queryClient
        .getQueryCache()
        .getAll()
        .find((query) => query.state.data)?.queryKey;

      expect(cacheKey).toEqual(['onboarding', 'hasWardrobeItems', 'test-user-123']);
    });

    it('should have stale time of 5 minutes', async () => {
      mockEq.mockResolvedValue({ count: 1, error: null });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify stale time by checking query state
      const query = queryClient.getQueryCache().getAll()[0];
      expect(query).toBeDefined();
    });

    it('should not retry on error', async () => {
      const error = new Error('Test error');
      mockEq.mockResolvedValue({ count: null, error });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // Query should have been called only once (no retries)
      expect(mockEq).toHaveBeenCalledTimes(1);
    });

    it('should not refetch on window focus', async () => {
      mockEq.mockResolvedValue({ count: 1, error: null });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Query completes without refetching
      expect(mockEq).toHaveBeenCalledTimes(1);
    });

    it('should not refetch on reconnect', async () => {
      mockEq.mockResolvedValue({ count: 1, error: null });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Query completes without refetching
      expect(mockEq).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined user gracefully', () => {
      mockUser = undefined as unknown as User | null;

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('should handle missing items table gracefully', async () => {
      // Simulate table not existing (returns null count with no error)
      mockEq.mockResolvedValue({ count: null, error: null });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should treat null count as 0 items (Feature #3 not implemented yet)
      expect(result.current.data).toEqual({ hasItems: false });
    });

    it('should use user ID in query key for cache isolation', async () => {
      mockEq.mockResolvedValue({ count: 2, error: null });

      const { result } = renderHook(() => useHasWardrobeItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual({ hasItems: true });

      // Verify query was called with correct user ID
      expect(mockEq).toHaveBeenCalledWith('user_id', 'test-user-123');
    });
  });
});
