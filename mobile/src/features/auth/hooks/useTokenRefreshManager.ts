import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../../../services/supabase';
import { useStore } from '../../../core/state/store';
import { logError, logAuthEvent } from '../../../core/telemetry';

/**
 * Token refresh coordinator that handles proactive and reactive token refresh.
 *
 * IMPORTANT: This is the SOLE mechanism for token refresh in the application.
 * Supabase's autoRefreshToken is DISABLED in mobile/src/services/supabase.ts
 * to prevent conflicts, race conditions, and unpredictable behavior.
 *
 * This hook manages the lifecycle of authentication tokens by:
 * 1. Scheduling proactive refresh 5 minutes before token expiry
 * 2. Providing reactive refresh function for 401 error handling
 * 3. Deduplicating concurrent refresh attempts
 * 4. Monitoring network connectivity and pausing/resuming refresh
 * 5. Implementing exponential backoff for transient failures
 * 6. Forcing logout on unrecoverable errors
 *
 * Proactive Refresh:
 * - Scheduled 5 minutes (300 seconds) before token expiry
 * - Paused when offline, resumed when online
 * - Rescheduled after successful refresh
 * - Cancelled on logout or component unmount
 *
 * Reactive Refresh:
 * - Exposed via refreshToken() function
 * - Ready for API interceptor integration on 401 errors (future step)
 * - Shares deduplication with proactive refresh
 * - Returns promise for caller to await
 *
 * Deduplication:
 * - Only one refresh in-flight at a time
 * - Concurrent callers share the same promise
 * - Promise cleared after completion
 *
 * Exponential Backoff:
 * - Initial delay: 1 second
 * - Multiplier: 2x per attempt
 * - Max attempts: 3
 * - Jitter: 0-1000ms random
 * - Max delay: 30 seconds cap
 *
 * Error Handling:
 * - Transient errors: retry with backoff
 * - Permanent errors: force logout
 * - Max retries exceeded: force logout
 * - Surfaces "Session expired. Please log in again."
 *
 * Network Awareness:
 * - Monitors connectivity via @react-native-community/netinfo
 * - Cancels scheduled refresh when offline
 * - Reschedules refresh when connectivity restored
 * - Prevents battery drain from failed requests
 *
 * Telemetry:
 * - Logs all refresh attempts with structured data
 * - Tracks success/failure, latency, attempt count
 * - Integrates with Sentry/Honeycomb for observability
 * - Never logs tokens or session objects (security)
 *
 * SECURITY:
 * - Never logs session objects (contain tokens)
 * - Only logs metadata (userId, expiresAt)
 * - Tokens remain encrypted in SecureStore
 *
 * @example
 * ```typescript
 * // In root component (_layout.tsx)
 * function RootLayout() {
 *   useTokenRefreshManager();
 *   return <Stack />;
 * }
 *
 * // In API interceptor (future implementation)
 * const { refreshToken } = useTokenRefreshManager();
 * if (error.status === 401) {
 *   await refreshToken();
 *   return retryRequest();
 * }
 * ```
 */
export function useTokenRefreshManager() {
  const router = useRouter();

  // Refs for mutable state that doesn't trigger re-renders
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const scheduledTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const attemptCountRef = useRef<number>(0);
  const isOnlineRef = useRef<boolean>(true);
  const routerRef = useRef(router);

  // Update router ref on every render to ensure we have current router
  useEffect(() => {
    routerRef.current = router;
  });

  /**
   * Calculates exponential backoff delay with jitter.
   *
   * Formula: min(baseDelay * 2^attempt + jitter, maxDelay)
   *
   * @param attempt - Current attempt number (0-indexed)
   * @returns Delay in milliseconds
   */
  const getBackoffDelay = useCallback((attempt: number): number => {
    const baseDelay = 1000; // 1 second
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 1000; // 0-1000ms random jitter
    const totalDelay = exponentialDelay + jitter;
    const maxDelay = 30000; // Cap at 30 seconds
    return Math.min(totalDelay, maxDelay);
  }, []);

  /**
   * Classifies refresh errors to determine retry strategy.
   *
   * @param error - Error from refresh attempt
   * @returns true if error is transient (should retry), false if permanent
   */
  const isTransientError = useCallback((error: unknown): boolean => {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // Network errors are transient
      if (
        message.includes('network') ||
        message.includes('fetch') ||
        message.includes('timeout') ||
        message.includes('connection')
      ) {
        return true;
      }
      // Invalid/expired token errors are permanent
      if (
        message.includes('invalid') ||
        message.includes('expired') ||
        message.includes('refresh_token')
      ) {
        return false;
      }
      // Server errors are transient (might recover)
      if (message.includes('500') || message.includes('503') || message.includes('502')) {
        return true;
      }
    }
    // Unknown errors treated as transient (retry)
    return true;
  }, []);

  /**
   * Forces logout by clearing tokens and session state.
   *
   * Called on unrecoverable errors:
   * - Invalid/expired refresh token
   * - Max retry attempts exhausted
   *
   * This function:
   * - Sets logout reason in store for UI display
   * - Clears all auth state and tokens
   * - Navigates to login screen
   * - Logs forced logout event
   *
   * @param reason - Reason for forced logout
   */
  const forceLogout = useCallback(async (reason: string) => {
    try {
      // Get user ID before clearing (for telemetry)
      const userId = useStore.getState().user?.id;

      // Log the forced logout
      // eslint-disable-next-line no-console
      console.error('[TokenRefresh] Forcing logout:', reason);
      logError(new Error(reason), 'user', {
        feature: 'auth',
        operation: 'token-refresh-force-logout',
        metadata: { reason },
      });

      // Log structured auth event
      logAuthEvent('logout-forced', {
        userId,
        outcome: 'forced',
        metadata: { reason },
      });

      // Clear scheduled timeout
      if (scheduledTimeoutRef.current) {
        clearTimeout(scheduledTimeoutRef.current);
        scheduledTimeoutRef.current = null;
      }

      // Clear refresh promise
      refreshPromiseRef.current = null;

      // Set logout reason for UI display
      useStore.getState().setLogoutReason('Session expired. Please log in again.');

      // Sign out (clears SecureStore)
      await supabase.auth.signOut();

      // Clear session state
      useStore.getState().clearUser();

      // Navigate to login screen
      routerRef.current.replace('/auth/login');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[TokenRefresh] Error during forced logout:', error);

      // Ensure state is cleared even on error
      useStore.getState().setLogoutReason('Session expired. Please log in again.');
      useStore.getState().clearUser();
      routerRef.current.replace('/auth/login');
    }
  }, []);

  /**
   * Executes a token refresh attempt.
   *
   * @returns Promise that resolves on success
   * @throws Error on failure
   */
  const executeRefresh = useCallback(async (): Promise<void> => {
    const startTime = Date.now();

    try {
      // Check network connectivity
      if (!isOnlineRef.current) {
        throw new Error('Network offline. Cannot refresh token.');
      }

      // SECURITY: Do NOT log the refresh call details
      // eslint-disable-next-line no-console
      console.log('[TokenRefresh] Executing refresh attempt', {
        attempt: attemptCountRef.current + 1,
      });

      // Call Supabase refresh session
      const { data, error } = await supabase.auth.refreshSession();

      const latency = Date.now() - startTime;

      if (error) {
        // Classify error
        const transient = isTransientError(error);

        logError(error, transient ? 'network' : 'user', {
          feature: 'auth',
          operation: 'token-refresh',
          metadata: {
            attempt: attemptCountRef.current + 1,
            transient,
            latency,
          },
        });

        // Log structured auth event for failure
        const userId = useStore.getState().user?.id;
        logAuthEvent('token-refresh-failure', {
          userId,
          errorCode: transient ? 'network_error' : 'auth_error',
          outcome: 'failure',
          latency,
          metadata: {
            attempt: attemptCountRef.current + 1,
            transient,
          },
        });

        throw error;
      }

      // Validate response
      if (!data.session || !data.user) {
        const validationError = new Error('Invalid refresh response: missing session or user');
        logError(validationError, 'schema', {
          feature: 'auth',
          operation: 'token-refresh',
          metadata: {
            hasSession: !!data.session,
            hasUser: !!data.user,
            latency,
          },
        });
        throw validationError;
      }

      // Update user in store
      useStore.getState().setUser({
        id: data.user.id,
        email: data.user.email || '',
        emailVerified: !!data.user.email_confirmed_at,
      });

      // Update token metadata
      // SECURITY: We only store metadata (expiry time), NOT the tokens
      //
      // Token expiry derivation strategy (same as useLogin):
      // 1. Use session.expires_at if provided (absolute timestamp in seconds)
      // 2. Calculate from session.expires_in if provided (relative seconds)
      // 3. Fall back to 3600 seconds (1 hour) if neither provided
      //
      // This ensures token metadata is always updated after successful refresh,
      // allowing scheduleProactiveRefresh to continue scheduling future refreshes.
      let expiresAt: number;
      if (data.session.expires_at) {
        // Supabase provides expires_at as unix timestamp in seconds
        // Convert to milliseconds for JavaScript Date
        expiresAt = data.session.expires_at * 1000;
      } else if (data.session.expires_in) {
        // Calculate absolute expiry from relative expires_in (seconds)
        expiresAt = Date.now() + data.session.expires_in * 1000;
      } else {
        // Fallback: Default to 1 hour (3600 seconds) - Supabase standard
        expiresAt = Date.now() + 3600 * 1000;
      }
      const tokenType = data.session.token_type || 'bearer';
      useStore.getState().setTokenMetadata(expiresAt, tokenType);

      // Reset attempt count on success
      attemptCountRef.current = 0;

      // Log structured auth event
      logAuthEvent('token-refresh-success', {
        userId: data.user.id,
        outcome: 'success',
        latency,
        metadata: {
          // Safe to log: token metadata but NOT the token itself
          tokenExpiresAt: expiresAt,
        },
      });

      // eslint-disable-next-line no-console
      console.log('[TokenRefresh] Refresh successful');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[TokenRefresh] Refresh failed:', error);

      // Check if error is transient
      const transient = isTransientError(error);

      // Increment attempt count
      attemptCountRef.current += 1;

      // Check if we should retry
      if (transient && attemptCountRef.current < 3) {
        const delay = getBackoffDelay(attemptCountRef.current - 1);
        // eslint-disable-next-line no-console
        console.log('[TokenRefresh] Retrying after backoff', {
          attempt: attemptCountRef.current,
          delayMs: delay,
        });

        // Wait for backoff delay
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Retry
        return executeRefresh();
      }

      // Unrecoverable error or max retries exceeded
      const reason = transient
        ? 'Session refresh failed. Please log in again.'
        : 'Your session is no longer valid. Please log in again.';

      await forceLogout(reason);

      // Throw structured error for callers
      throw new Error('Session expired. Please log in again.');
    }
  }, [forceLogout, isTransientError, getBackoffDelay]);

  /**
   * Refreshes the access token (reactive refresh).
   *
   * This function is exposed for imperative calls (e.g., from API interceptors).
   * Deduplicates concurrent refresh attempts by sharing a single promise.
   *
   * @returns Promise that resolves when refresh completes
   * @throws Error if refresh fails unrecoverably
   */
  const refreshToken = useCallback(async (): Promise<void> => {
    // If refresh already in progress, return the existing promise
    if (refreshPromiseRef.current) {
      // eslint-disable-next-line no-console
      console.log('[TokenRefresh] Deduplicating refresh request');
      return refreshPromiseRef.current;
    }

    // eslint-disable-next-line no-console
    console.log('[TokenRefresh] Starting reactive refresh');

    // Create new refresh promise
    const promise = executeRefresh();
    refreshPromiseRef.current = promise;

    try {
      await promise;
    } finally {
      // Clear promise after completion (success or failure)
      refreshPromiseRef.current = null;
    }
  }, [executeRefresh]);

  /**
   * Schedules a proactive token refresh.
   *
   * Calculates time until token expiry and schedules refresh
   * 5 minutes (300 seconds) before expiry.
   */
  const scheduleProactiveRefresh = useCallback(() => {
    // Clear any existing timeout
    if (scheduledTimeoutRef.current) {
      clearTimeout(scheduledTimeoutRef.current);
      scheduledTimeoutRef.current = null;
    }

    // Get token metadata
    const { tokenMetadata } = useStore.getState();
    if (!tokenMetadata) {
      // eslint-disable-next-line no-console
      console.log('[TokenRefresh] No token metadata, skipping schedule');
      return;
    }

    // Calculate time until expiry
    const now = Date.now();
    const expiresAt = tokenMetadata.expiresAt;
    const timeUntilExpiry = expiresAt - now;

    // Calculate when to refresh (5 minutes before expiry)
    const proactiveRefreshTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    const refreshIn = timeUntilExpiry - proactiveRefreshTime;

    if (refreshIn <= 0) {
      // Token already expired or expiring soon, refresh immediately
      // eslint-disable-next-line no-console
      console.log('[TokenRefresh] Token expired or expiring soon, refreshing immediately');
      refreshToken().catch((error) => {
        // eslint-disable-next-line no-console
        console.error('[TokenRefresh] Immediate refresh failed:', error);
      });
      return;
    }

    // Schedule proactive refresh
    // eslint-disable-next-line no-console
    console.log('[TokenRefresh] Scheduling proactive refresh', {
      refreshInMs: refreshIn,
      refreshInMin: Math.round(refreshIn / 60000),
    });

    scheduledTimeoutRef.current = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.log('[TokenRefresh] Proactive refresh triggered');
      refreshToken()
        .then(() => {
          // Reschedule after successful refresh
          scheduleProactiveRefresh();
        })
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.error('[TokenRefresh] Proactive refresh failed:', error);
          // Error already handled in refreshToken (forced logout if unrecoverable)
        });
    }, refreshIn);
  }, [refreshToken]);

  /**
   * Handles network connectivity changes.
   *
   * @param online - true if online, false if offline
   */
  const handleConnectivityChange = useCallback(
    (online: boolean) => {
      const wasOnline = isOnlineRef.current;
      isOnlineRef.current = online;

      // eslint-disable-next-line no-console
      console.log('[TokenRefresh] Connectivity changed', {
        wasOnline,
        isOnline: online,
      });

      if (online && !wasOnline) {
        // Just came online, reschedule refresh
        // eslint-disable-next-line no-console
        console.log('[TokenRefresh] Device came online, rescheduling refresh');
        scheduleProactiveRefresh();
      } else if (!online && wasOnline) {
        // Just went offline, clear scheduled refresh
        // eslint-disable-next-line no-console
        console.log('[TokenRefresh] Device went offline, clearing scheduled refresh');
        if (scheduledTimeoutRef.current) {
          clearTimeout(scheduledTimeoutRef.current);
          scheduledTimeoutRef.current = null;
        }
      }
    },
    [scheduleProactiveRefresh]
  );

  // Initialize on mount
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[TokenRefresh] Initializing token refresh manager');

    // Get initial connectivity state
    NetInfo.fetch().then((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      isOnlineRef.current = online;
      // eslint-disable-next-line no-console
      console.log('[TokenRefresh] Initial connectivity state', { online });

      // Schedule initial refresh if online
      if (online) {
        scheduleProactiveRefresh();
      }
    });

    // Subscribe to connectivity changes
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      handleConnectivityChange(online);
    });

    // Cleanup on unmount
    return () => {
      // eslint-disable-next-line no-console
      console.log('[TokenRefresh] Cleaning up token refresh manager');

      // Unsubscribe from connectivity
      unsubscribe();

      // Clear scheduled timeout
      if (scheduledTimeoutRef.current) {
        clearTimeout(scheduledTimeoutRef.current);
        scheduledTimeoutRef.current = null;
      }

      // Note: Don't clear refreshPromiseRef - let in-flight refresh complete
    };
  }, [scheduleProactiveRefresh, handleConnectivityChange]);

  // Expose refreshToken function for imperative calls
  // This allows API interceptors to call refreshToken()
  return { refreshToken };
}
