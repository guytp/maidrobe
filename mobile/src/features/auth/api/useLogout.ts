import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { supabase } from '../../../services/supabase';
import { logAuthEvent } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';
import { checkFeatureFlag } from '../../../core/featureFlags';
import { resetInterceptor } from '../../../services/supabaseInterceptor';
import { clearStoredSession } from '../storage/sessionPersistence';
import { handleAuthError } from '../utils/authErrorHandler';
import { getAuthErrorMessage } from '../utils/authErrorMessages';
import { logAuthErrorToSentry } from '../utils/logAuthErrorToSentry';

/**
 * Context type for logout mutation (used for latency tracking)
 */
interface LogoutMutationContext {
  startTime: number;
}

/**
 * React Query mutation hook for user logout.
 *
 * This hook handles:
 * - Feature flag check (optional, as logout should typically always work)
 * - Supabase Auth signOut API call
 * - Clearing local session state in Zustand store
 * - Error classification and telemetry logging
 * - Success event logging with latency metrics
 * - Navigation to login screen after logout
 *
 * State Management:
 * - Clears user from Zustand session store
 * - Clears logoutReason (user-initiated logout)
 * - Supabase client automatically clears stored tokens
 *
 * Navigation:
 * - Automatically navigates to /auth/login using router.replace()
 * - Prevents back navigation to protected screens
 *
 * Error Handling:
 * - Logs errors but still clears local state (fail-safe)
 * - Network errors during logout don't prevent local cleanup
 * - User is considered logged out even if API call fails
 * - Still navigates to login screen after error
 *
 * @returns React Query mutation object with logout function
 *
 * @example
 * ```typescript
 * const { mutate: logout, isPending } = useLogout();
 *
 * const handleLogout = () => {
 *   logout(); // Navigation handled automatically
 * };
 * ```
 */
export function useLogout() {
  const router = useRouter();
  return useMutation<void, Error, void, LogoutMutationContext>({
    onMutate: () => {
      // Capture start timestamp for latency tracking
      return { startTime: Date.now() };
    },
    mutationFn: async () => {
      const startTime = Date.now();

      try {
        // Get user ID before clearing (for telemetry)
        const userId = useStore.getState().user?.id;

        // Check feature flag (optional for logout)
        const featureFlag = await checkFeatureFlag('auth.logout');

        // Note: We don't block logout even if flag is disabled
        // Logout should always be available for security reasons
        if (!featureFlag.enabled) {
          console.warn('[Auth] Logout feature flag is disabled but proceeding anyway');
        }

        // Call Supabase Auth signOut
        const { error } = await supabase.auth.signOut();

        // Calculate latency
        const latency = Date.now() - startTime;

        // Handle Supabase errors
        if (error) {
          const normalizedError = handleAuthError(error, {
            flow: 'logout',
            supabaseOperation: 'signOut',
          });

          logAuthErrorToSentry(normalizedError, error, {
            flow: 'logout',
            userId,
            platform: Platform.OS as 'ios' | 'android' | 'unknown',
            metadata: {
              latency,
            },
          });

          // Log structured auth event
          logAuthEvent('logout-failure', {
            userId,
            errorCode: normalizedError.code,
            outcome: 'failure',
            latency,
          });

          // Still clear local state even if API call failed
          // User should be logged out locally for security
          useStore.getState().clearUser();
          useStore.getState().setLogoutReason(null);
          useStore.getState().resetOnboardingState();

          // Clear stored session even on API error
          await clearStoredSession();

          const userMessage = getAuthErrorMessage(normalizedError, 'logout');
          throw new Error(userMessage);
        }

        // Clear local session state and logout reason
        useStore.getState().clearUser();
        useStore.getState().setLogoutReason(null);
        useStore.getState().resetOnboardingState();

        // Clear stored session bundle from SecureStore
        // This ensures no session data persists after logout
        await clearStoredSession();

        // Reset interceptor state to clear any in-flight refresh promises
        resetInterceptor();

        // Log structured auth event
        logAuthEvent('logout-success', {
          userId,
          outcome: 'success',
          latency,
        });
      } catch (error) {
        // Ensure local state is cleared even on error
        // This is a fail-safe to prevent user from being stuck logged in
        useStore.getState().clearUser();
        useStore.getState().setLogoutReason(null);
        useStore.getState().resetOnboardingState();
        await clearStoredSession();
        resetInterceptor();

        // Re-throw if already an Error
        if (error instanceof Error) {
          throw error;
        }

        // Handle unknown errors
        const latency = Date.now() - startTime;
        const unknownError = new Error('Unknown error during logout');
        const normalizedError = handleAuthError(unknownError, {
          flow: 'logout',
          supabaseOperation: 'signOut',
        });

        logAuthErrorToSentry(normalizedError, unknownError, {
          flow: 'logout',
          userId: undefined,
          platform: Platform.OS as 'ios' | 'android' | 'unknown',
          metadata: { latency },
        });

        const userMessage = getAuthErrorMessage(normalizedError, 'logout');
        throw new Error(userMessage);
      }
    },
    onSuccess: () => {
      // Navigate to login screen after successful logout
      // Use replace to prevent back navigation to protected screens
      router.replace('/auth/login');
    },
    onError: (_error, _variables, context) => {
      // Calculate request latency for performance monitoring in error path
      const latency = context?.startTime ? Date.now() - context.startTime : undefined;

      // Ensure user is cleared from store even on error (fail-safe)
      useStore.getState().clearUser();
      useStore.getState().setLogoutReason(null);
      useStore.getState().resetOnboardingState();
      clearStoredSession(); // Fire and forget - don't await in error handler
      resetInterceptor();

      // Navigate to login even on error (user is logged out locally)
      router.replace('/auth/login');

      // Log error latency for observability
      // eslint-disable-next-line no-console
      console.log('[Telemetry]', {
        feature: 'auth',
        operation: 'logout',
        status: 'error',
        latency,
        timestamp: new Date().toISOString(),
      });
    },
  });
}
