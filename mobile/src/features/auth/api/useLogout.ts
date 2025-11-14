import { useMutation } from '@tanstack/react-query';
import { supabase } from '../../../services/supabase';
import { logError, getUserFriendlyMessage, logSuccess } from '../../../core/telemetry';
import type { ErrorClassification } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';
import { checkFeatureFlag } from '../../../core/featureFlags';

/**
 * Context type for logout mutation (used for latency tracking)
 */
interface LogoutMutationContext {
  startTime: number;
}

/**
 * Classifies logout errors into standard error categories.
 *
 * @param error - The error object from Supabase or network failure
 * @returns The error classification type
 */
function classifyLogoutError(error: unknown): ErrorClassification {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network-related errors
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('connection')
    ) {
      return 'network';
    }

    // Server errors
    if (message.includes('500') || message.includes('503') || message.includes('502')) {
      return 'server';
    }
  }

  // Default to server error for unknown issues
  return 'server';
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
 *
 * State Management:
 * - Clears user from Zustand session store
 * - Supabase client automatically clears stored tokens
 * - No explicit navigation (caller handles routing)
 *
 * Error Handling:
 * - Logs errors but still clears local state (fail-safe)
 * - Network errors during logout don't prevent local cleanup
 * - User is considered logged out even if API call fails
 *
 * @returns React Query mutation object with logout function
 *
 * @example
 * ```typescript
 * const { mutate: logout, isPending } = useLogout();
 *
 * const handleLogout = () => {
 *   logout(undefined, {
 *     onSuccess: () => {
 *       router.replace('/auth/login');
 *     },
 *     onError: (error) => {
 *       // Still logged out locally, just log the error
 *       console.error('Logout API error:', error.message);
 *     },
 *   });
 * };
 * ```
 */
export function useLogout() {
  return useMutation<void, Error, void, LogoutMutationContext>({
    onMutate: () => {
      // Capture start timestamp for latency tracking
      return { startTime: Date.now() };
    },
    mutationFn: async () => {
      const startTime = Date.now();

      try {
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
          const classification = classifyLogoutError(error);
          logError(error, classification, {
            feature: 'auth',
            operation: 'logout',
            metadata: {
              errorCode: error.status,
              latency,
            },
          });

          // Still clear local state even if API call failed
          // User should be logged out locally for security
          useStore.getState().clearUser();

          throw new Error(getUserFriendlyMessage(classification));
        }

        // Clear local session state
        useStore.getState().clearUser();

        // Log success
        logSuccess('auth', 'logout', {
          latency,
        });
      } catch (error) {
        // Ensure local state is cleared even on error
        // This is a fail-safe to prevent user from being stuck logged in
        useStore.getState().clearUser();

        // Re-throw if already an Error
        if (error instanceof Error) {
          throw error;
        }

        // Handle unknown errors
        const latency = Date.now() - startTime;
        const unknownError = new Error('Unknown error during logout');
        logError(unknownError, 'server', {
          feature: 'auth',
          operation: 'logout',
          metadata: { latency },
        });
        throw new Error(getUserFriendlyMessage('server'));
      }
    },
    onError: (_error, _variables, context) => {
      // Calculate request latency for performance monitoring in error path
      const latency = context?.startTime ? Date.now() - context.startTime : undefined;

      // Ensure user is cleared from store even on error (fail-safe)
      useStore.getState().clearUser();

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
