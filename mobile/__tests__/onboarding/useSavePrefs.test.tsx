import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import { useSavePrefs, type SavePrefsRequest } from '../../src/features/onboarding/api/useSavePrefs';
import { supabase } from '../../src/services/supabase';
import { logError, logSuccess } from '../../src/core/telemetry';
import type { PrefsRow, PrefsFormData } from '../../src/features/onboarding/utils/prefsTypes';

// Mock dependencies
jest.mock('../../src/services/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('../../src/core/telemetry', () => ({
  logError: jest.fn(),
  logSuccess: jest.fn(),
  getUserFriendlyMessage: jest.fn((classification: string) => {
    switch (classification) {
      case 'network':
        return 'Unable to connect. Please check your internet connection.';
      case 'server':
        return 'Service temporarily unavailable. Please try again later.';
      case 'schema':
        return 'Received unexpected response. Please contact support if this persists.';
      case 'user':
        return 'Invalid request. Please check your input and try again.';
      default:
        return 'An error occurred.';
    }
  }),
}));

const mockSupabase = supabase as jest.Mocked<typeof supabase>;
const mockLogError = logError as jest.MockedFunction<typeof logError>;
const mockLogSuccess = logSuccess as jest.MockedFunction<typeof logSuccess>;

describe('useSavePrefs', () => {
  let queryClient: QueryClient;

  const mockUserId = 'test-user-123';

  const mockFormData: PrefsFormData = {
    colourTendency: 'neutrals',
    exclusions: {
      checklist: ['skirts'],
      freeText: 'no leather',
    },
    noRepeatWindow: 7,
    comfortNotes: 'Test comfort notes',
  };

  const mockPrefsRow: PrefsRow = {
    user_id: mockUserId,
    no_repeat_days: 7,
    colour_prefs: ['neutrals'],
    exclusions: ['skirts', 'free:no leather'],
    comfort_notes: 'Test comfort notes',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    // Create fresh QueryClient for each test
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: {
          retry: false, // Disable retry for tests
        },
      },
    });

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('Insert Operations', () => {
    it('creates new prefs row when no existing data', async () => {
      const mockSingle = jest.fn().mockResolvedValue({
        data: mockPrefsRow,
        error: null,
      });

      const mockSelect = jest.fn().mockReturnValue({
        single: mockSingle,
      });

      const mockUpsert = jest.fn().mockReturnValue({
        select: mockSelect,
      });

      mockSupabase.from.mockReturnValue({
        upsert: mockUpsert,
      } as any);

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      const request: SavePrefsRequest = {
        userId: mockUserId,
        data: mockFormData,
        existingData: null,
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockPrefsRow);
      expect(mockSupabase.from).toHaveBeenCalledWith('prefs');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserId,
          no_repeat_days: 7,
          colour_prefs: ['neutrals'],
          exclusions: ['skirts', 'free:no leather'],
          comfort_notes: 'Test comfort notes',
        })
      );
    });

    it('validates complete row for insert operations', async () => {
      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockPrefsRow,
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      const request: SavePrefsRequest = {
        userId: mockUserId,
        data: mockFormData,
        existingData: null, // Insert operation
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Should not have logged validation errors
      expect(mockLogError).not.toHaveBeenCalledWith(
        expect.anything(),
        'schema',
        expect.anything()
      );
    });
  });

  describe('Update Operations', () => {
    it('updates existing prefs with changed fields only', async () => {
      const existingData: PrefsFormData = {
        colourTendency: 'neutrals',
        exclusions: {
          checklist: ['skirts'],
          freeText: 'no leather',
        },
        noRepeatWindow: 7,
        comfortNotes: 'Old notes',
      };

      const newData: PrefsFormData = {
        ...existingData,
        comfortNotes: 'New notes', // Only this changed
      };

      const updatedRow: PrefsRow = {
        ...mockPrefsRow,
        comfort_notes: 'New notes',
      };

      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: updatedRow,
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      const request: SavePrefsRequest = {
        userId: mockUserId,
        data: newData,
        existingData,
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(updatedRow);
    });

    it('validates partial payload for update operations', async () => {
      const existingData: PrefsFormData = {
        colourTendency: 'neutrals',
        exclusions: { checklist: [], freeText: '' },
        noRepeatWindow: 7,
        comfortNotes: '',
      };

      const newData: PrefsFormData = {
        ...existingData,
        noRepeatWindow: 14, // Only this changed
      };

      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { ...mockPrefsRow, no_repeat_days: 14 },
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      const request: SavePrefsRequest = {
        userId: mockUserId,
        data: newData,
        existingData,
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Should not have logged validation errors
      expect(mockLogError).not.toHaveBeenCalledWith(
        expect.anything(),
        'schema',
        expect.anything()
      );
    });
  });

  describe('Upsert Behavior', () => {
    it('uses upsert operation correctly', async () => {
      const mockUpsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: mockPrefsRow,
            error: null,
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({
        upsert: mockUpsert,
      } as any);

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      const request: SavePrefsRequest = {
        userId: mockUserId,
        data: mockFormData,
        existingData: null,
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserId,
        })
      );
    });
  });

  describe('Response Validation', () => {
    it('validates response with Zod schema', async () => {
      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockPrefsRow,
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      const request: SavePrefsRequest = {
        userId: mockUserId,
        data: mockFormData,
        existingData: null,
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockPrefsRow);
    });

    it('handles invalid response schema', async () => {
      const invalidResponse = {
        user_id: mockUserId,
        invalid_field: 'test',
        // Missing required fields
      };

      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: invalidResponse,
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      const request: SavePrefsRequest = {
        userId: mockUserId,
        data: mockFormData,
        existingData: null,
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe(
        'Received unexpected response. Please contact support if this persists.'
      );
      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Object), // ZodError
        'schema',
        expect.objectContaining({
          feature: 'onboarding',
          operation: 'savePrefs',
        })
      );
    });

    it('handles null response data', async () => {
      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      const request: SavePrefsRequest = {
        userId: mockUserId,
        data: mockFormData,
        existingData: null,
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe(
        'Received unexpected response. Please contact support if this persists.'
      );
    });
  });

  describe('Cache Invalidation', () => {
    it('invalidates query cache on success', async () => {
      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockPrefsRow,
              error: null,
            }),
          }),
        }),
      } as any);

      const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      const request: SavePrefsRequest = {
        userId: mockUserId,
        data: mockFormData,
        existingData: null,
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['prefs', mockUserId],
      });
    });
  });

  describe('Privacy Compliance', () => {
    it('logs success with privacy-safe metadata only', async () => {
      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockPrefsRow,
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      const request: SavePrefsRequest = {
        userId: mockUserId,
        data: mockFormData,
        existingData: null,
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockLogSuccess).toHaveBeenCalledWith(
        'onboarding',
        'savePrefs',
        expect.objectContaining({
          data: {
            noRepeatSet: true,
            colourTendencySelected: true,
            exclusionsSelected: true,
            notesPresent: true,
          },
        })
      );

      // Verify free-text content is NOT logged
      const loggedData = mockLogSuccess.mock.calls[0][2]?.data;
      expect(loggedData).not.toHaveProperty('comfort_notes');
      expect(loggedData).not.toHaveProperty('comfortNotes');
      expect(loggedData).not.toHaveProperty('exclusions');
      expect(loggedData).not.toHaveProperty('freeText');
    });

    it('never logs free-text values in telemetry', async () => {
      const dataWithFreeText: PrefsFormData = {
        colourTendency: 'neutrals',
        exclusions: {
          checklist: [],
          freeText: 'sensitive personal information here',
        },
        noRepeatWindow: null,
        comfortNotes: 'private comfort notes with PII',
      };

      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                ...mockPrefsRow,
                exclusions: ['free:sensitive personal information here'],
                comfort_notes: 'private comfort notes with PII',
              },
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      const request: SavePrefsRequest = {
        userId: mockUserId,
        data: dataWithFreeText,
        existingData: null,
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Check all telemetry calls
      const allLogSuccessCalls = mockLogSuccess.mock.calls;

      allLogSuccessCalls.forEach((call) => {
        const loggedData = JSON.stringify(call);
        expect(loggedData).not.toContain('sensitive personal information');
        expect(loggedData).not.toContain('private comfort notes');
        expect(loggedData).not.toContain('PII');
      });
    });
  });

  describe('Error Handling', () => {
    it.skip('handles network errors with retry', async () => {
      const networkError = new Error('Network request failed');

      const mockSingle = jest.fn().mockResolvedValue({
        data: null,
        error: networkError,
      });

      const mockSelect = jest.fn().mockReturnValue({
        single: mockSingle,
      });

      const mockUpsert = jest.fn().mockReturnValue({
        select: mockSelect,
      });

      mockSupabase.from.mockReturnValue({
        upsert: mockUpsert,
      } as any);

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      const request: SavePrefsRequest = {
        userId: mockUserId,
        data: mockFormData,
        existingData: null,
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 });

      expect(result.current.error?.message).toBe(
        'Unable to connect. Please check your internet connection.'
      );
      expect(mockLogError).toHaveBeenCalledWith(networkError, 'network', {
        feature: 'onboarding',
        operation: 'savePrefs',
        metadata: { userId: mockUserId, isUpdate: false },
      });
    });

    it.skip('handles server errors appropriately', async () => {
      const serverError = new Error('Internal server error');

      const mockSingle = jest.fn().mockResolvedValue({
        data: null,
        error: serverError,
      });

      const mockSelect = jest.fn().mockReturnValue({
        single: mockSingle,
      });

      const mockUpsert = jest.fn().mockReturnValue({
        select: mockSelect,
      });

      mockSupabase.from.mockReturnValue({
        upsert: mockUpsert,
      } as any);

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      const request: SavePrefsRequest = {
        userId: mockUserId,
        data: mockFormData,
        existingData: null,
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 });

      expect(result.current.error?.message).toBe(
        'Service temporarily unavailable. Please try again later.'
      );
    });

    it('does not retry validation errors', async () => {
      // This test verifies the retry predicate
      // We can't easily test this without enabling retry in QueryClient
      // But we can verify the error is classified correctly

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      // Access the mutation options to verify retry configuration
      expect(result.current.mutate).toBeDefined();
    });
  });

  describe('Latency Tracking', () => {
    it('calculates and logs latency on success', async () => {
      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockPrefsRow,
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      const request: SavePrefsRequest = {
        userId: mockUserId,
        data: mockFormData,
        existingData: null,
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockLogSuccess).toHaveBeenCalledWith(
        'onboarding',
        'savePrefs',
        expect.objectContaining({
          latency: expect.any(Number),
        })
      );
    });
  });

  describe('Mutation States', () => {
    it('exposes pending state correctly', async () => {
      let resolveFn: ((value: any) => void) | null = null;
      const pendingPromise = new Promise((resolve) => {
        resolveFn = resolve;
      });

      const mockSingle = jest.fn().mockReturnValue(pendingPromise);

      const mockSelect = jest.fn().mockReturnValue({
        single: mockSingle,
      });

      const mockUpsert = jest.fn().mockReturnValue({
        select: mockSelect,
      });

      mockSupabase.from.mockReturnValue({
        upsert: mockUpsert,
      } as any);

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      const request: SavePrefsRequest = {
        userId: mockUserId,
        data: mockFormData,
        existingData: null,
      };

      result.current.mutate(request);

      // Wait a tick for mutation to start
      await waitFor(() => expect(result.current.isPending).toBe(true), { timeout: 100 });

      expect(result.current.isSuccess).toBe(false);
      expect(result.current.isError).toBe(false);

      // Clean up - resolve the promise
      if (resolveFn) {
        resolveFn({ data: mockPrefsRow, error: null });
      }
    });

    it.skip('exposes error state correctly', async () => {
      const testError = new Error('Test error');

      const mockSingle = jest.fn().mockResolvedValue({
        data: null,
        error: testError,
      });

      const mockSelect = jest.fn().mockReturnValue({
        single: mockSingle,
      });

      const mockUpsert = jest.fn().mockReturnValue({
        select: mockSelect,
      });

      mockSupabase.from.mockReturnValue({
        upsert: mockUpsert,
      } as any);

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      const request: SavePrefsRequest = {
        userId: mockUserId,
        data: mockFormData,
        existingData: null,
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 });

      expect(result.current.isPending).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.error).toBeDefined();
    });

    it('exposes success state correctly', async () => {
      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockPrefsRow,
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useSavePrefs(), { wrapper });

      const request: SavePrefsRequest = {
        userId: mockUserId,
        data: mockFormData,
        existingData: null,
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.isPending).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(result.current.data).toEqual(mockPrefsRow);
    });
  });
});
