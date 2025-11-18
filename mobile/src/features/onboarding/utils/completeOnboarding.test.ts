import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useCompleteOnboarding } from './completeOnboarding';
import { supabase } from '../../../services/supabase';
import * as telemetry from '../../../core/telemetry';
import * as analytics from './onboardingAnalytics';
import type { OnboardingStep } from '../store/onboardingSlice';

// Mock dependencies
jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

jest.mock('../../../services/supabase', () => ({
  supabase: {
    auth: {
      updateUser: jest.fn(),
    },
  },
}));

jest.mock('../../../core/telemetry', () => ({
  logError: jest.fn(),
  logSuccess: jest.fn(),
}));

jest.mock('./onboardingAnalytics', () => ({
  trackOnboardingCompleted: jest.fn(),
  trackOnboardingSkippedAll: jest.fn(),
  trackOnboardingCompletedAllSteps: jest.fn(),
  trackOnboardingCompletedWithSkips: jest.fn(),
  trackOnboardingExitToHome: jest.fn(),
}));

// Mock store
const mockUpdateHasOnboarded = jest.fn();
const mockResetOnboardingState = jest.fn();
let mockUser = { id: 'user-123' };

jest.mock('../../../core/state/store', () => ({
  useStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: mockUser,
      updateHasOnboarded: mockUpdateHasOnboarded,
      resetOnboardingState: mockResetOnboardingState,
    }),
}));

// Mock router replace
let mockReplace = jest.fn();

describe('useCompleteOnboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    mockUser = { id: 'user-123' };
    mockReplace = jest.fn();

    // Default mock: successful backend update
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({
      data: {},
      error: null,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Normal completion (all steps)', () => {
    it('should fire correct analytics events for all steps completed', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      await act(async () => {
        await result.current({
          isGlobalSkip: false,
          completedSteps: ['welcome', 'prefs', 'firstItem', 'success'] as OnboardingStep[],
          skippedSteps: [],
          duration: 120000,
          hasItems: false,
        });
      });

      expect(analytics.trackOnboardingCompletedAllSteps).toHaveBeenCalledWith(
        ['welcome', 'prefs', 'firstItem', 'success'],
        120000,
        false
      );
      expect(analytics.trackOnboardingExitToHome).toHaveBeenCalledWith(
        'completed_all_steps',
        false
      );
      expect(analytics.trackOnboardingCompleted).toHaveBeenCalledWith(
        ['welcome', 'prefs', 'firstItem', 'success'],
        [],
        120000
      );
    });

    it('should update local state', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      await act(async () => {
        await result.current({
          completedSteps: ['welcome', 'success'] as OnboardingStep[],
        });
      });

      expect(mockUpdateHasOnboarded).toHaveBeenCalledWith(true);
      expect(mockResetOnboardingState).toHaveBeenCalled();
    });

    it('should navigate to home', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      await act(async () => {
        await result.current({});
      });

      expect(mockReplace).toHaveBeenCalledWith('/home');
    });

    it('should update backend hasOnboarded flag', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      await act(async () => {
        await result.current({});
      });

      await waitFor(() => {
        expect(supabase.auth.updateUser).toHaveBeenCalledWith({
          data: {
            hasOnboarded: true,
          },
        });
      });
    });
  });

  describe('Completion with skipped steps', () => {
    it('should fire correct analytics events for completion with skips', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      await act(async () => {
        await result.current({
          isGlobalSkip: false,
          completedSteps: ['welcome', 'success'] as OnboardingStep[],
          skippedSteps: ['prefs', 'firstItem'] as OnboardingStep[],
          duration: 60000,
          hasItems: true,
        });
      });

      expect(analytics.trackOnboardingCompletedWithSkips).toHaveBeenCalledWith(
        ['welcome', 'success'],
        ['prefs', 'firstItem'],
        60000,
        true
      );
      expect(analytics.trackOnboardingExitToHome).toHaveBeenCalledWith(
        'completed_with_skips',
        true
      );
      expect(analytics.trackOnboardingCompleted).toHaveBeenCalledWith(
        ['welcome', 'success'],
        ['prefs', 'firstItem'],
        60000
      );
    });

    it('should not fire trackOnboardingCompletedAllSteps', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      await act(async () => {
        await result.current({
          completedSteps: ['welcome'] as OnboardingStep[],
          skippedSteps: ['prefs'] as OnboardingStep[],
        });
      });

      expect(analytics.trackOnboardingCompletedAllSteps).not.toHaveBeenCalled();
    });
  });

  describe('Global skip behavior', () => {
    it('should fire correct analytics events for global skip', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      await act(async () => {
        await result.current({
          isGlobalSkip: true,
          originStep: 'prefs' as OnboardingStep,
          completedSteps: ['welcome'] as OnboardingStep[],
          skippedSteps: [],
        });
      });

      expect(analytics.trackOnboardingSkippedAll).toHaveBeenCalledWith('prefs', ['welcome'], []);
      expect(analytics.trackOnboardingExitToHome).toHaveBeenCalledWith(
        'skipped_entire_flow',
        false,
        'prefs'
      );
    });

    it('should not fire normal completion events', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      await act(async () => {
        await result.current({
          isGlobalSkip: true,
        });
      });

      expect(analytics.trackOnboardingCompletedAllSteps).not.toHaveBeenCalled();
      expect(analytics.trackOnboardingCompletedWithSkips).not.toHaveBeenCalled();
    });

    it('should still update local state and navigate', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      await act(async () => {
        await result.current({
          isGlobalSkip: true,
        });
      });

      expect(mockUpdateHasOnboarded).toHaveBeenCalledWith(true);
      expect(mockResetOnboardingState).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
  });

  describe('Idempotency guard', () => {
    it('should prevent concurrent executions', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      // Start first execution but don't await
      const promise1 = act(async () => {
        await result.current({});
      });

      // Try to start second execution immediately
      const promise2 = act(async () => {
        await result.current({});
      });

      await Promise.all([promise1, promise2]);

      // Should only update once
      expect(mockUpdateHasOnboarded).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledTimes(1);
    });

    it('should allow execution after first completes', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      await act(async () => {
        await result.current({});
      });

      mockUpdateHasOnboarded.mockClear();
      mockReplace.mockClear();

      await act(async () => {
        await result.current({});
      });

      expect(mockUpdateHasOnboarded).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledTimes(1);
    });
  });

  describe('Timeout safety mechanism', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should reset guard after 30 seconds', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      // Make backend update hang
      (supabase.auth.updateUser as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      act(() => {
        void result.current({});
      });

      // Fast-forward past 30 second timeout
      act(() => {
        jest.advanceTimersByTime(30000);
      });

      // Should log timeout error
      expect(telemetry.logError).toHaveBeenCalledWith(
        expect.any(Error),
        'user',
        expect.objectContaining({
          feature: 'onboarding',
          operation: 'completeOnboarding',
          metadata: expect.objectContaining({
            timeoutMs: 30000,
          }),
        })
      );
    });

    it('should allow retry after timeout', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      // Make first call hang
      (supabase.auth.updateUser as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));

      act(() => {
        void result.current({});
      });

      // Fast-forward past timeout
      act(() => {
        jest.advanceTimersByTime(30000);
      });

      // Reset mock to succeed
      (supabase.auth.updateUser as jest.Mock).mockResolvedValue({
        data: {},
        error: null,
      });

      mockUpdateHasOnboarded.mockClear();

      // Should be able to execute again
      await act(async () => {
        await result.current({});
      });

      expect(mockUpdateHasOnboarded).toHaveBeenCalled();
    });
  });

  describe('Backend update success', () => {
    it('should log success when backend update succeeds', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      await act(async () => {
        await result.current({
          completedSteps: ['welcome'] as OnboardingStep[],
        });
      });

      await waitFor(() => {
        expect(telemetry.logSuccess).toHaveBeenCalledWith(
          'onboarding',
          'backend_update_succeeded',
          expect.objectContaining({
            data: expect.objectContaining({
              userId: 'user-123',
            }),
          })
        );
      });
    });

    it('should not call onSyncFailure callback on success', async () => {
      const mockOnSyncFailure = jest.fn();
      const { result } = renderHook(() => useCompleteOnboarding());

      await act(async () => {
        await result.current({
          onSyncFailure: mockOnSyncFailure,
        });
      });

      await waitFor(() => {
        expect(supabase.auth.updateUser).toHaveBeenCalled();
      });

      expect(mockOnSyncFailure).not.toHaveBeenCalled();
    });
  });

  describe('Backend update failure - transient errors with retry', () => {
    it('should retry on network errors', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      const networkError = new Error('Network request failed');
      (supabase.auth.updateUser as jest.Mock)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({ data: {}, error: null });

      await act(async () => {
        await result.current({});
      });

      await waitFor(() => {
        expect(supabase.auth.updateUser).toHaveBeenCalledTimes(3);
      });

      // Should log retries
      expect(telemetry.logError).toHaveBeenCalledWith(
        networkError,
        'server',
        expect.objectContaining({
          metadata: expect.objectContaining({
            willRetry: true,
          }),
        })
      );
    });

    it('should retry on 5xx server errors', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      const serverError = { message: 'Server error', status: 500 };
      (supabase.auth.updateUser as jest.Mock)
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({ data: {}, error: null });

      await act(async () => {
        await result.current({});
      });

      await waitFor(() => {
        expect(supabase.auth.updateUser).toHaveBeenCalledTimes(2);
      });
    });

    it('should call onSyncFailure after all retries exhausted', async () => {
      const mockOnSyncFailure = jest.fn();
      const { result } = renderHook(() => useCompleteOnboarding());

      const networkError = new Error('Network request failed');
      (supabase.auth.updateUser as jest.Mock).mockRejectedValue(networkError);

      await act(async () => {
        await result.current({
          onSyncFailure: mockOnSyncFailure,
        });
      });

      await waitFor(() => {
        expect(supabase.auth.updateUser).toHaveBeenCalledTimes(3);
      });

      expect(mockOnSyncFailure).toHaveBeenCalledWith(
        "Setup complete! We're still syncing your progress in the background."
      );
    });

    it('should log error after all retries exhausted', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      const networkError = new Error('Network request failed');
      (supabase.auth.updateUser as jest.Mock).mockRejectedValue(networkError);

      await act(async () => {
        await result.current({});
      });

      await waitFor(() => {
        expect(telemetry.logError).toHaveBeenCalledWith(
          networkError,
          'server',
          expect.objectContaining({
            operation: 'updateBackendHasOnboarded',
            metadata: expect.objectContaining({
              retriesExhausted: true,
            }),
          })
        );
      });
    });
  });

  describe('Backend update failure - permanent errors without retry', () => {
    it('should not retry on 4xx client errors', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      const clientError = Object.assign(new Error('Bad request'), { status: 400 });
      (supabase.auth.updateUser as jest.Mock).mockRejectedValue(clientError);

      await act(async () => {
        await result.current({});
      });

      await waitFor(() => {
        expect(supabase.auth.updateUser).toHaveBeenCalledTimes(1);
      });
    });

    it('should call onSyncFailure on permanent error', async () => {
      const mockOnSyncFailure = jest.fn();
      const { result } = renderHook(() => useCompleteOnboarding());

      const clientError = Object.assign(new Error('Bad request'), { status: 400 });
      (supabase.auth.updateUser as jest.Mock).mockRejectedValue(clientError);

      await act(async () => {
        await result.current({
          onSyncFailure: mockOnSyncFailure,
        });
      });

      await waitFor(() => {
        expect(mockOnSyncFailure).toHaveBeenCalled();
      });
    });

    it('should still complete locally on permanent backend error', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      const clientError = Object.assign(new Error('Bad request'), { status: 400 });
      (supabase.auth.updateUser as jest.Mock).mockRejectedValue(clientError);

      await act(async () => {
        await result.current({});
      });

      expect(mockUpdateHasOnboarded).toHaveBeenCalledWith(true);
      expect(mockResetOnboardingState).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
  });

  describe('Navigation failure', () => {
    it('should log error when navigation fails', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      const navError = new Error('Navigation failed');
      mockReplace.mockImplementationOnce(() => {
        throw navError;
      });

      await act(async () => {
        await result.current({});
      });

      expect(telemetry.logError).toHaveBeenCalledWith(
        navError,
        'user',
        expect.objectContaining({
          operation: 'navigateToHome',
        })
      );
    });

    it('should not prevent backend update when navigation fails', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      mockReplace.mockImplementationOnce(() => {
        throw new Error('Navigation failed');
      });

      await act(async () => {
        await result.current({});
      });

      await waitFor(() => {
        expect(supabase.auth.updateUser).toHaveBeenCalled();
      });
    });

    it('should still update local state when navigation fails', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      mockReplace.mockImplementationOnce(() => {
        throw new Error('Navigation failed');
      });

      await act(async () => {
        await result.current({});
      });

      expect(mockUpdateHasOnboarded).toHaveBeenCalledWith(true);
      expect(mockResetOnboardingState).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should handle missing user gracefully', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockUser = null as any;
      const { result } = renderHook(() => useCompleteOnboarding());

      await act(async () => {
        await result.current({});
      });

      // Should still update local state and navigate
      expect(mockUpdateHasOnboarded).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalled();

      // Should not attempt backend update
      expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    });

    it('should handle empty options', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      await act(async () => {
        await result.current({});
      });

      expect(mockUpdateHasOnboarded).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalled();
    });

    it('should default hasItems to false when not provided', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      await act(async () => {
        await result.current({
          completedSteps: ['welcome'] as OnboardingStep[],
        });
      });

      expect(analytics.trackOnboardingCompletedAllSteps).toHaveBeenCalledWith(
        ['welcome'],
        undefined,
        false
      );
    });
  });

  describe('Timeout cleanup', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should clear timeout when completion finishes normally', async () => {
      const { result } = renderHook(() => useCompleteOnboarding());

      await act(async () => {
        await result.current({});
      });

      // Fast-forward past 30 seconds
      act(() => {
        jest.advanceTimersByTime(30000);
      });

      // Should not log timeout error since completion finished
      expect(telemetry.logError).not.toHaveBeenCalledWith(
        expect.any(Error),
        'user',
        expect.objectContaining({
          operation: 'completeOnboarding',
        })
      );
    });
  });
});
