import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import { useUserPrefs } from '../../src/features/onboarding/api/useUserPrefs';
import { supabase } from '../../src/services/supabase';
import { useStore } from '../../src/core/state/store';
import { logError } from '../../src/core/telemetry';
import type { PrefsRow } from '../../src/features/onboarding/utils/prefsTypes';

// Type helper for partial Supabase mock returns in tests
type MockSupabaseFrom = ReturnType<typeof supabase.from>;

// Mock dependencies
jest.mock('../../src/services/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('../../src/core/telemetry', () => ({
  logError: jest.fn(),
  getUserFriendlyMessage: jest.fn((classification: string) => {
    switch (classification) {
      case 'network':
        return 'Unable to connect. Please check your internet connection.';
      case 'server':
        return 'Service temporarily unavailable. Please try again later.';
      case 'schema':
        return 'Received unexpected response. Please contact support if this persists.';
      default:
        return 'An error occurred.';
    }
  }),
}));

jest.mock('../../src/core/state/store', () => ({
  useStore: jest.fn(),
}));

const mockSupabase = supabase as jest.Mocked<typeof supabase>;
const mockUseStore = useStore as jest.MockedFunction<typeof useStore>;
const mockLogError = logError as jest.MockedFunction<typeof logError>;

describe('useUserPrefs', () => {
  let queryClient: QueryClient;

  const mockUserId = 'test-user-123';
  const mockPrefsRow: PrefsRow = {
    user_id: mockUserId,
    no_repeat_days: 7,
    no_repeat_mode: 'item',
    colour_prefs: ['neutrals'],
    exclusions: ['skirts', 'free:no leather'],
    comfort_notes: 'Test notes',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    // Create fresh QueryClient for each test
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false, // Disable retry for tests
        },
      },
    });

    // Reset all mocks
    jest.clearAllMocks();

    // Default: user is authenticated
    mockUseStore.mockReturnValue(mockUserId);
  });

  afterEach(() => {
    queryClient.clear();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('Authentication', () => {
    it('returns null when user is not authenticated', async () => {
      // Mock: no user ID
      mockUseStore.mockReturnValue(undefined);

      const { result } = renderHook(() => useUserPrefs(), { wrapper });

      // Should return undefined data immediately without calling API (query is disabled)
      expect(result.current.data).toBeUndefined();
      expect(result.current.isLoading).toBe(false);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('uses correct cache key with userId', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      } as unknown as MockSupabaseFrom);

      const { result } = renderHook(() => useUserPrefs(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Verify cache key includes userId
      const cacheKey = queryClient
        .getQueryCache()
        .getAll()
        .find((query) => query.queryKey[0] === 'prefs')?.queryKey;

      expect(cacheKey).toEqual(['prefs', mockUserId]);
    });

    it('uses anonymous cache key when userId is undefined', () => {
      mockUseStore.mockReturnValue(undefined);

      renderHook(() => useUserPrefs(), { wrapper });

      const cacheKey = queryClient
        .getQueryCache()
        .getAll()
        .find((query) => query.queryKey[0] === 'prefs')?.queryKey;

      expect(cacheKey).toEqual(['prefs', 'anonymous']);
    });
  });

  describe('Successful Queries', () => {
    it('fetches prefs successfully for authenticated user', async () => {
      const mockMaybeSingle = jest.fn().mockResolvedValue({
        data: mockPrefsRow,
        error: null,
      });

      const mockEq = jest.fn().mockReturnValue({
        maybeSingle: mockMaybeSingle,
      });

      const mockSelect = jest.fn().mockReturnValue({
        eq: mockEq,
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      } as unknown as MockSupabaseFrom);

      const { result } = renderHook(() => useUserPrefs(), { wrapper });

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      // Wait for success
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Verify data
      expect(result.current.data).toEqual(mockPrefsRow);
      expect(result.current.error).toBeNull();

      // Verify Supabase calls
      expect(mockSupabase.from).toHaveBeenCalledWith('prefs');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockMaybeSingle).toHaveBeenCalled();
    });

    it('returns null when user has no prefs row', async () => {
      const mockMaybeSingle = jest.fn().mockResolvedValue({
        data: null,
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: mockMaybeSingle,
          }),
        }),
      } as unknown as MockSupabaseFrom);

      const { result } = renderHook(() => useUserPrefs(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('validates response with Zod schema', async () => {
      const validRow: PrefsRow = {
        user_id: mockUserId,
        no_repeat_days: null,
        no_repeat_mode: 'item',
        colour_prefs: [],
        exclusions: [],
        comfort_notes: null,
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: validRow, error: null }),
          }),
        }),
      } as unknown as MockSupabaseFrom);

      const { result } = renderHook(() => useUserPrefs(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(validRow);
    });
  });

  describe('Error Handling', () => {
    it('handles network errors appropriately', async () => {
      const networkError = new Error('Network request failed');

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: networkError,
            }),
          }),
        }),
      } as unknown as MockSupabaseFrom);

      const { result } = renderHook(() => useUserPrefs(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe(
        'Unable to connect. Please check your internet connection.'
      );
      expect(mockLogError).toHaveBeenCalledWith(networkError, 'network', {
        feature: 'onboarding',
        operation: 'fetchPrefs',
        metadata: { userId: mockUserId },
      });
    });

    it('handles server errors appropriately', async () => {
      const serverError = new Error('Internal server error');

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: serverError,
            }),
          }),
        }),
      } as unknown as MockSupabaseFrom);

      const { result } = renderHook(() => useUserPrefs(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe(
        'Service temporarily unavailable. Please try again later.'
      );
      expect(mockLogError).toHaveBeenCalledWith(serverError, 'server', {
        feature: 'onboarding',
        operation: 'fetchPrefs',
        metadata: { userId: mockUserId },
      });
    });

    it('handles schema validation errors', async () => {
      const invalidData = {
        user_id: mockUserId,
        // Missing required fields
        invalid_field: 'test',
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: invalidData,
              error: null,
            }),
          }),
        }),
      } as unknown as MockSupabaseFrom);

      const { result } = renderHook(() => useUserPrefs(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe(
        'Received unexpected response. Please contact support if this persists.'
      );
      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Object), // ZodError
        'schema',
        expect.objectContaining({
          feature: 'onboarding',
          operation: 'fetchPrefs',
        })
      );
    });

    it('handles unknown errors gracefully', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockRejectedValue('string error'),
          }),
        }),
      } as unknown as MockSupabaseFrom);

      const { result } = renderHook(() => useUserPrefs(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeDefined();
      expect(mockLogError).toHaveBeenCalled();
    });
  });

  describe('Query Configuration', () => {
    it('sets correct staleTime and gcTime', () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      } as unknown as MockSupabaseFrom);

      renderHook(() => useUserPrefs(), { wrapper });

      const query = queryClient.getQueryCache().getAll()[0];

      // staleTime: 30 seconds (30000ms)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((query.options as any).staleTime).toBe(30000);

      // gcTime: 5 minutes (300000ms)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((query.options as any).gcTime).toBe(300000);
    });

    it('respects enabled flag when no userId', () => {
      mockUseStore.mockReturnValue(undefined);

      const { result } = renderHook(() => useUserPrefs(), { wrapper });

      // Query should not run
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeUndefined();
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('enables query when userId exists', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      } as unknown as MockSupabaseFrom);

      const { result } = renderHook(() => useUserPrefs(), { wrapper });

      // Query should run
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockSupabase.from).toHaveBeenCalled();
    });
  });

  describe('Data States', () => {
    it('exposes loading state correctly', () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockImplementation(
              () => new Promise(() => {}) // Never resolves
            ),
          }),
        }),
      } as unknown as MockSupabaseFrom);

      const { result } = renderHook(() => useUserPrefs(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.isError).toBe(false);
    });

    it('exposes error state correctly', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: new Error('Test error'),
            }),
          }),
        }),
      } as unknown as MockSupabaseFrom);

      const { result } = renderHook(() => useUserPrefs(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.error).toBeDefined();
    });

    it('exposes success state correctly', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockPrefsRow,
              error: null,
            }),
          }),
        }),
      } as unknown as MockSupabaseFrom);

      const { result } = renderHook(() => useUserPrefs(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(result.current.data).toEqual(mockPrefsRow);
    });
  });
});
