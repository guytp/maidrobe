/**
 * Unit tests for auth restore pipeline.
 *
 * Tests all major branches of the restore logic including successful session
 * restoration, token refresh success and failure, offline behavior within and
 * beyond the 7-day trust window, corrupted session data, and all logout/error
 * outcomes.
 */

// Mock all external dependencies
import { supabase } from '../../../services/supabase';
import { useStore } from '../../../core/state/store';
import { logAuthEvent, logError } from '../../../core/telemetry';
import {
  loadStoredSession,
  saveSessionFromSupabase,
  clearStoredSession,
  markNeedsRefresh as markNeedsRefreshInStorage,
} from '../storage/sessionPersistence';
import { deriveTokenExpiry } from './tokenExpiry';
import { restoreAuthStateOnLaunch, mapLogoutReasonToI18nKey } from './authRestore';

jest.mock('../../../services/supabase');
jest.mock('../../../core/state/store');
jest.mock('../../../core/telemetry');
jest.mock('../storage/sessionPersistence');
jest.mock('./tokenExpiry');

describe('mapLogoutReasonToI18nKey', () => {
  it('should map session-expired to sessionExpired i18n key', () => {
    expect(mapLogoutReasonToI18nKey('session-expired')).toBe(
      'screens.auth.login.sessionMessages.sessionExpired'
    );
  });

  it('should map restore-failed-stale to sessionRestoreFailed i18n key', () => {
    expect(mapLogoutReasonToI18nKey('restore-failed-stale')).toBe(
      'screens.auth.login.sessionMessages.sessionRestoreFailed'
    );
  });

  it('should map restore-failed-invalid to sessionInvalid i18n key', () => {
    expect(mapLogoutReasonToI18nKey('restore-failed-invalid')).toBe(
      'screens.auth.login.sessionMessages.sessionInvalid'
    );
  });

  it('should map restore-failed-error to sessionError i18n key', () => {
    expect(mapLogoutReasonToI18nKey('restore-failed-error')).toBe(
      'screens.auth.login.sessionMessages.sessionError'
    );
  });

  it('should map no-session to empty string', () => {
    expect(mapLogoutReasonToI18nKey('no-session')).toBe('');
  });

  it('should map unknown codes to sessionError as fallback', () => {
    expect(mapLogoutReasonToI18nKey('unknown-code')).toBe(
      'screens.auth.login.sessionMessages.sessionError'
    );
  });
});

describe('restoreAuthStateOnLaunch', () => {
  // Mock store methods
  const mockBeginHydration = jest.fn();
  const mockEndHydration = jest.fn();
  const mockMarkUnauthenticated = jest.fn();
  const mockApplyAuthenticatedUser = jest.fn();
  const mockSetNeedsRefresh = jest.fn();

  const mockGetState = jest.fn(() => ({
    beginHydration: mockBeginHydration,
    endHydration: mockEndHydration,
    markUnauthenticated: mockMarkUnauthenticated,
    applyAuthenticatedUser: mockApplyAuthenticatedUser,
    setNeedsRefresh: mockSetNeedsRefresh,
  }));

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Set up default mock implementations
    (useStore as unknown as { getState: jest.Mock }).getState = mockGetState;
    (logAuthEvent as jest.Mock).mockImplementation(() => {});
    (logError as jest.Mock).mockImplementation(() => {});
    (clearStoredSession as jest.Mock).mockResolvedValue(undefined);
    (saveSessionFromSupabase as jest.Mock).mockResolvedValue(undefined);
    (markNeedsRefreshInStorage as jest.Mock).mockResolvedValue(undefined);
    (deriveTokenExpiry as jest.Mock).mockReturnValue({
      expiresAt: Date.now() + 3600000,
    });
  });

  describe('No stored session', () => {
    it('should handle missing session gracefully', async () => {
      (loadStoredSession as jest.Mock).mockResolvedValue(null);

      await restoreAuthStateOnLaunch();

      expect(mockBeginHydration).toHaveBeenCalledTimes(1);
      expect(loadStoredSession).toHaveBeenCalledTimes(1);
      expect(clearStoredSession).toHaveBeenCalledTimes(1);
      expect(mockMarkUnauthenticated).toHaveBeenCalledWith('');
      expect(logAuthEvent).toHaveBeenCalledWith('auth-restore-no-session', {
        outcome: 'no-session',
      });
      expect(mockEndHydration).toHaveBeenCalledTimes(1);
    });
  });

  describe('Successful session restoration', () => {
    it('should restore session when refresh succeeds', async () => {
      const mockSession = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          email_confirmed_at: '2025-01-01T00:00:00Z',
        },
      };

      const mockBundle = {
        session: mockSession,
        lastAuthSuccessAt: new Date(Date.now() - 1000).toISOString(),
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
        data: { session: mockSession, user: mockSession.user },
        error: null,
      });

      await restoreAuthStateOnLaunch();

      expect(mockBeginHydration).toHaveBeenCalledTimes(1);
      expect(loadStoredSession).toHaveBeenCalledTimes(1);
      expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
      expect(saveSessionFromSupabase).toHaveBeenCalled();
      expect(mockApplyAuthenticatedUser).toHaveBeenCalledWith(
        {
          id: 'user-123',
          email: 'test@example.com',
          emailVerified: true,
        },
        expect.objectContaining({
          tokenType: 'bearer',
        })
      );
      expect(logAuthEvent).toHaveBeenCalledWith(
        'auth-restore-success',
        expect.objectContaining({
          userId: 'user-123',
          outcome: 'success',
        })
      );
      expect(mockEndHydration).toHaveBeenCalledTimes(1);
    });

    it('should handle unverified email correctly', async () => {
      const mockSession = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          email_confirmed_at: null,
        },
      };

      const mockBundle = {
        session: mockSession,
        lastAuthSuccessAt: new Date().toISOString(),
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
        data: { session: mockSession, user: mockSession.user },
        error: null,
      });

      await restoreAuthStateOnLaunch();

      expect(mockApplyAuthenticatedUser).toHaveBeenCalledWith(
        {
          id: 'user-123',
          email: 'test@example.com',
          emailVerified: false,
        },
        expect.any(Object)
      );
    });
  });

  describe('Token refresh auth error', () => {
    it('should handle 401 auth error correctly', async () => {
      const mockBundle = {
        session: {
          user: { id: 'user-123' },
        },
        lastAuthSuccessAt: new Date().toISOString(),
      };

      const authError = { status: 401, message: 'Unauthorized' };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
        data: null,
        error: authError,
      });

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).toHaveBeenCalledTimes(1);
      expect(mockMarkUnauthenticated).toHaveBeenCalledWith(
        'screens.auth.login.sessionMessages.sessionExpired'
      );
      expect(logError).toHaveBeenCalledWith(authError, 'user', expect.any(Object));
      expect(logAuthEvent).toHaveBeenCalledWith(
        'auth-restore-failed-invalid-session',
        expect.objectContaining({
          outcome: 'failure',
          errorCode: 'invalid_token',
        })
      );
    });

    it('should handle 403 auth error correctly', async () => {
      const mockBundle = {
        session: {
          user: { id: 'user-123' },
        },
        lastAuthSuccessAt: new Date().toISOString(),
      };

      const authError = { status: 403, message: 'Forbidden' };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
        data: null,
        error: authError,
      });

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).toHaveBeenCalledTimes(1);
      expect(mockMarkUnauthenticated).toHaveBeenCalledWith(
        'screens.auth.login.sessionMessages.sessionExpired'
      );
    });

    it('should handle auth error in catch block', async () => {
      const mockBundle = {
        session: {
          user: { id: 'user-123' },
        },
        lastAuthSuccessAt: new Date().toISOString(),
      };

      const authError = new Error('invalid refresh token');

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(authError);

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).toHaveBeenCalledTimes(1);
      expect(mockMarkUnauthenticated).toHaveBeenCalledWith(
        'screens.auth.login.sessionMessages.sessionExpired'
      );
      expect(logError).toHaveBeenCalled();
    });
  });

  describe('Offline behavior within 7-day trust window', () => {
    it('should trust cached session when network unavailable and < 7 days old', async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          token_type: 'bearer',
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: twoDaysAgo,
      };

      const networkError = new Error('network timeout');

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(networkError);

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).not.toHaveBeenCalled();
      expect(mockApplyAuthenticatedUser).toHaveBeenCalledWith(
        {
          id: 'user-123',
          email: 'test@example.com',
          emailVerified: true,
        },
        expect.any(Object)
      );
      expect(mockSetNeedsRefresh).toHaveBeenCalledWith(true);
      expect(markNeedsRefreshInStorage).toHaveBeenCalledTimes(1);
      expect(logAuthEvent).toHaveBeenCalledWith(
        'auth-restore-offline-trusted',
        expect.objectContaining({
          outcome: 'offline-trusted',
        })
      );
    });

    it('should handle corrupted session within trust window', async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          access_token: 'access-token',
          user: null, // Missing user
        },
        lastAuthSuccessAt: twoDaysAgo,
      };

      const networkError = new Error('network timeout');

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(networkError);

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).toHaveBeenCalledTimes(1);
      expect(mockMarkUnauthenticated).toHaveBeenCalledWith(
        'screens.auth.login.sessionMessages.sessionInvalid'
      );
      expect(logAuthEvent).toHaveBeenCalledWith(
        'auth-restore-failed-stale',
        expect.objectContaining({
          outcome: 'failure',
        })
      );
    });
  });

  describe('Offline behavior beyond 7-day trust window', () => {
    it('should clear session when > 7 days old and network unavailable', async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
          },
        },
        lastAuthSuccessAt: eightDaysAgo,
      };

      const networkError = new Error('network timeout');

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(networkError);

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).toHaveBeenCalledTimes(1);
      expect(mockMarkUnauthenticated).toHaveBeenCalledWith(
        'screens.auth.login.sessionMessages.sessionRestoreFailed'
      );
      expect(logAuthEvent).toHaveBeenCalledWith(
        'auth-restore-failed-stale',
        expect.objectContaining({
          outcome: 'failure',
          metadata: expect.objectContaining({
            timeSinceLastAuthDays: 8,
          }),
        })
      );
    });
  });

  describe('Unexpected errors', () => {
    it('should handle unexpected errors during restore', async () => {
      const unexpectedError = new Error('Unexpected error');

      (loadStoredSession as jest.Mock).mockRejectedValue(unexpectedError);

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).toHaveBeenCalledTimes(1);
      expect(mockMarkUnauthenticated).toHaveBeenCalledWith(
        'screens.auth.login.sessionMessages.sessionError'
      );
      expect(logError).toHaveBeenCalledWith(unexpectedError, 'server', expect.any(Object));
      expect(logAuthEvent).toHaveBeenCalledWith(
        'auth-restore-failed-stale',
        expect.objectContaining({
          outcome: 'failure',
          errorCode: 'unexpected_error',
        })
      );
      expect(mockEndHydration).toHaveBeenCalledTimes(1);
    });
  });

  describe('Deduplication', () => {
    it('should deduplicate concurrent restore calls', async () => {
      (loadStoredSession as jest.Mock).mockResolvedValue(null);

      // Call restore multiple times concurrently
      const promise1 = restoreAuthStateOnLaunch();
      const promise2 = restoreAuthStateOnLaunch();
      const promise3 = restoreAuthStateOnLaunch();

      await Promise.all([promise1, promise2, promise3]);

      // Should only call beginHydration once
      expect(mockBeginHydration).toHaveBeenCalledTimes(1);
      expect(loadStoredSession).toHaveBeenCalledTimes(1);
      expect(mockEndHydration).toHaveBeenCalledTimes(1);
    });

    it('should allow new restore after previous completes', async () => {
      (loadStoredSession as jest.Mock).mockResolvedValue(null);

      await restoreAuthStateOnLaunch();
      expect(mockBeginHydration).toHaveBeenCalledTimes(1);

      await restoreAuthStateOnLaunch();
      expect(mockBeginHydration).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error classification', () => {
    it('should classify 401 as auth error', async () => {
      const mockBundle = {
        session: { user: { id: 'user-123' } },
        lastAuthSuccessAt: new Date().toISOString(),
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
        data: null,
        error: { status: 401 },
      });

      await restoreAuthStateOnLaunch();

      expect(mockMarkUnauthenticated).toHaveBeenCalledWith(
        'screens.auth.login.sessionMessages.sessionExpired'
      );
    });

    it('should classify network errors as transient', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: oneDayAgo,
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(new Error('network error'));

      await restoreAuthStateOnLaunch();

      // Should trust cached session, not clear it
      expect(clearStoredSession).not.toHaveBeenCalled();
      expect(mockApplyAuthenticatedUser).toHaveBeenCalled();
      expect(mockSetNeedsRefresh).toHaveBeenCalledWith(true);
    });

    it('should treat unknown errors as network errors conservatively', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: oneDayAgo,
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(new Error('unknown error'));

      await restoreAuthStateOnLaunch();

      // Should apply offline trust window logic
      expect(clearStoredSession).not.toHaveBeenCalled();
      expect(mockApplyAuthenticatedUser).toHaveBeenCalled();
    });
  });

  describe('Error classification - HTTP status codes', () => {
    it('should classify 404 as network error, not auth error', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: oneDayAgo,
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
        data: null,
        error: { status: 404, message: 'Not found' },
      });

      await restoreAuthStateOnLaunch();

      // Should apply offline trust window logic (network error)
      expect(clearStoredSession).not.toHaveBeenCalled();
      expect(mockApplyAuthenticatedUser).toHaveBeenCalled();
      expect(mockSetNeedsRefresh).toHaveBeenCalledWith(true);
    });

    it('should classify 500 as network error, not auth error', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: oneDayAgo,
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
        data: null,
        error: { status: 500, message: 'Internal server error' },
      });

      await restoreAuthStateOnLaunch();

      // Should apply offline trust window logic (network error)
      expect(clearStoredSession).not.toHaveBeenCalled();
      expect(mockApplyAuthenticatedUser).toHaveBeenCalled();
    });

    it('should classify error with status but not 401/403 as network error', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: oneDayAgo,
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
        data: null,
        error: { status: 503, message: 'Service unavailable' },
      });

      await restoreAuthStateOnLaunch();

      // Should apply offline trust window logic
      expect(clearStoredSession).not.toHaveBeenCalled();
      expect(mockApplyAuthenticatedUser).toHaveBeenCalled();
    });
  });

  describe('Error classification - auth keywords', () => {
    it('should classify "invalid" keyword as auth error', async () => {
      const mockBundle = {
        session: { user: { id: 'user-123' } },
        lastAuthSuccessAt: new Date().toISOString(),
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(
        new Error('Invalid credentials')
      );

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).toHaveBeenCalledTimes(1);
      expect(mockMarkUnauthenticated).toHaveBeenCalledWith(
        'screens.auth.login.sessionMessages.sessionExpired'
      );
    });

    it('should classify "expired" keyword as auth error', async () => {
      const mockBundle = {
        session: { user: { id: 'user-123' } },
        lastAuthSuccessAt: new Date().toISOString(),
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(new Error('Token has expired'));

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).toHaveBeenCalledTimes(1);
      expect(mockMarkUnauthenticated).toHaveBeenCalledWith(
        'screens.auth.login.sessionMessages.sessionExpired'
      );
    });

    it('should classify "unauthorized" keyword as auth error', async () => {
      const mockBundle = {
        session: { user: { id: 'user-123' } },
        lastAuthSuccessAt: new Date().toISOString(),
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(
        new Error('Unauthorized access')
      );

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).toHaveBeenCalledTimes(1);
      expect(mockMarkUnauthenticated).toHaveBeenCalledWith(
        'screens.auth.login.sessionMessages.sessionExpired'
      );
    });

    it('should classify "forbidden" keyword as auth error', async () => {
      const mockBundle = {
        session: { user: { id: 'user-123' } },
        lastAuthSuccessAt: new Date().toISOString(),
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(new Error('Access forbidden'));

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).toHaveBeenCalledTimes(1);
      expect(mockMarkUnauthenticated).toHaveBeenCalledWith(
        'screens.auth.login.sessionMessages.sessionExpired'
      );
    });

    it('should classify "refresh_token" keyword as auth error', async () => {
      const mockBundle = {
        session: { user: { id: 'user-123' } },
        lastAuthSuccessAt: new Date().toISOString(),
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(
        new Error('refresh_token is invalid')
      );

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).toHaveBeenCalledTimes(1);
      expect(mockMarkUnauthenticated).toHaveBeenCalledWith(
        'screens.auth.login.sessionMessages.sessionExpired'
      );
    });

    it('should handle case insensitive auth keywords', async () => {
      const mockBundle = {
        session: { user: { id: 'user-123' } },
        lastAuthSuccessAt: new Date().toISOString(),
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(new Error('INVALID TOKEN'));

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).toHaveBeenCalledTimes(1);
      expect(mockMarkUnauthenticated).toHaveBeenCalledWith(
        'screens.auth.login.sessionMessages.sessionExpired'
      );
    });
  });

  describe('Error classification - network keywords', () => {
    it('should classify "timeout" keyword as network error', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: oneDayAgo,
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(new Error('Request timeout'));

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).not.toHaveBeenCalled();
      expect(mockApplyAuthenticatedUser).toHaveBeenCalled();
      expect(mockSetNeedsRefresh).toHaveBeenCalledWith(true);
    });

    it('should classify "fetch" keyword as network error', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: oneDayAgo,
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(new Error('Fetch failed'));

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).not.toHaveBeenCalled();
      expect(mockApplyAuthenticatedUser).toHaveBeenCalled();
    });

    it('should classify "connection" keyword as network error', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: oneDayAgo,
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(
        new Error('Connection refused')
      );

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).not.toHaveBeenCalled();
      expect(mockApplyAuthenticatedUser).toHaveBeenCalled();
    });

    it('should classify "offline" keyword as network error', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: oneDayAgo,
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(new Error('Device is offline'));

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).not.toHaveBeenCalled();
      expect(mockApplyAuthenticatedUser).toHaveBeenCalled();
    });
  });

  describe('Error classification - conservative defaults', () => {
    it('should treat empty error message as network error', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: oneDayAgo,
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(new Error(''));

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).not.toHaveBeenCalled();
      expect(mockApplyAuthenticatedUser).toHaveBeenCalled();
    });

    it('should treat string error as network error', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: oneDayAgo,
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue('random string error');

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).not.toHaveBeenCalled();
      expect(mockApplyAuthenticatedUser).toHaveBeenCalled();
    });

    it('should treat non-standard error object as network error', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: oneDayAgo,
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue({
        code: 'UNKNOWN',
      });

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).not.toHaveBeenCalled();
      expect(mockApplyAuthenticatedUser).toHaveBeenCalled();
    });
  });

  describe('Error classification - security verification', () => {
    it('should apply offline trust window for unknown errors with recent session', async () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: threeDaysAgo,
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(new Error('some random error'));

      await restoreAuthStateOnLaunch();

      // Session should be trusted, not cleared
      expect(clearStoredSession).not.toHaveBeenCalled();
      expect(mockApplyAuthenticatedUser).toHaveBeenCalledWith(
        {
          id: 'user-123',
          email: 'test@example.com',
          emailVerified: true,
        },
        expect.any(Object)
      );
      expect(mockSetNeedsRefresh).toHaveBeenCalledWith(true);
      expect(markNeedsRefreshInStorage).toHaveBeenCalledTimes(1);
    });

    it('should enforce trust window for unknown errors with old session', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: tenDaysAgo,
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(new Error('some random error'));

      await restoreAuthStateOnLaunch();

      // Session should be cleared due to age
      expect(clearStoredSession).toHaveBeenCalledTimes(1);
      expect(mockMarkUnauthenticated).toHaveBeenCalledWith(
        'screens.auth.login.sessionMessages.sessionRestoreFailed'
      );
    });

    it('should immediately clear session for auth errors regardless of age', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: oneDayAgo,
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
        data: null,
        error: { status: 401, message: 'Token expired' },
      });

      await restoreAuthStateOnLaunch();

      // Auth error should bypass trust window
      expect(clearStoredSession).toHaveBeenCalledTimes(1);
      expect(mockMarkUnauthenticated).toHaveBeenCalledWith(
        'screens.auth.login.sessionMessages.sessionExpired'
      );
      // Should NOT trust cached session
      expect(mockApplyAuthenticatedUser).not.toHaveBeenCalled();
      expect(mockSetNeedsRefresh).not.toHaveBeenCalled();
    });

    it('should verify trust window boundary at exactly 7 days', async () => {
      const exactlySevenDays = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: exactlySevenDays,
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(new Error('network error'));

      await restoreAuthStateOnLaunch();

      // At exactly 7 days, should be within trust window (< 7 days check)
      expect(clearStoredSession).not.toHaveBeenCalled();
      expect(mockApplyAuthenticatedUser).toHaveBeenCalled();
    });
  });

  describe('Error classification - edge cases', () => {
    it('should prioritize auth classification when both auth and network keywords present', async () => {
      const mockBundle = {
        session: { user: { id: 'user-123' } },
        lastAuthSuccessAt: new Date().toISOString(),
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(
        new Error('invalid network connection')
      );

      await restoreAuthStateOnLaunch();

      // Should classify as auth error (auth keywords checked first)
      expect(clearStoredSession).toHaveBeenCalledTimes(1);
      expect(mockMarkUnauthenticated).toHaveBeenCalledWith(
        'screens.auth.login.sessionMessages.sessionExpired'
      );
    });

    it('should handle uppercase error messages correctly', async () => {
      const mockBundle = {
        session: { user: { id: 'user-123' } },
        lastAuthSuccessAt: new Date().toISOString(),
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(new Error('EXPIRED TOKEN'));

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).toHaveBeenCalledTimes(1);
      expect(mockMarkUnauthenticated).toHaveBeenCalledWith(
        'screens.auth.login.sessionMessages.sessionExpired'
      );
    });

    it('should handle mixed case error messages correctly', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const mockBundle = {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2025-01-01T00:00:00Z',
          },
        },
        lastAuthSuccessAt: oneDayAgo,
      };

      (loadStoredSession as jest.Mock).mockResolvedValue(mockBundle);
      (supabase.auth.refreshSession as jest.Mock).mockRejectedValue(
        new Error('Network Timeout Error')
      );

      await restoreAuthStateOnLaunch();

      expect(clearStoredSession).not.toHaveBeenCalled();
      expect(mockApplyAuthenticatedUser).toHaveBeenCalled();
    });
  });
});
