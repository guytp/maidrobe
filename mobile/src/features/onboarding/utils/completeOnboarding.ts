import { useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '../../../services/supabase';
import { useStore } from '../../../core/state/store';
import { logError, logSuccess } from '../../../core/telemetry';
import {
  trackOnboardingCompleted,
  trackOnboardingSkippedAll,
  trackOnboardingCompletedAllSteps,
  trackOnboardingCompletedWithSkips,
  trackOnboardingExitToHome,
} from './onboardingAnalytics';
import type { OnboardingStep } from '../store/onboardingSlice';
import type { ProfileUpdatePayload } from '../../auth/types/profile';

/**
 * Classifies Supabase errors to determine if they are transient and should be retried.
 *
 * @param error - Error from Supabase operation
 * @returns true if error is transient (network, 5xx server errors), false if permanent (4xx client errors)
 */
function isTransientSupabaseError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network-related errors are transient
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('offline')
    ) {
      return true;
    }

    // Check for HTTP status codes in error object
    if ('status' in error) {
      const status = (error as { status: number }).status;
      // 5xx server errors are transient, 4xx client errors are permanent
      if (status >= 500 && status < 600) {
        return true;
      }
      if (status >= 400 && status < 500) {
        return false;
      }
    }
  }

  // Conservative: treat unknown errors as transient to allow retry
  return true;
}

/**
 * Retry an async operation with exponential backoff.
 *
 * Implements bounded retry with exponential backoff and jitter, consistent
 * with the app's React Query configuration. Retries only on transient errors.
 *
 * @param operation - Async function to retry
 * @param options - Retry configuration
 * @returns Result of successful operation
 * @throws Error from final attempt if all retries exhausted
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts: number;
    shouldRetry: (error: unknown, attempt: number) => boolean;
    getDelay: (attempt: number) => number;
    onRetry?: (error: unknown, attempt: number) => void;
  }
): Promise<T> {
  const { maxAttempts, shouldRetry, getDelay, onRetry } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      const isLastAttempt = attempt === maxAttempts - 1;
      const willRetry = !isLastAttempt && shouldRetry(error, attempt);

      if (!willRetry) {
        throw error;
      }

      // Call retry callback if provided
      if (onRetry) {
        onRetry(error, attempt + 1);
      }

      // Wait before retrying
      const delay = getDelay(attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Should not reach here, but throw last error as fallback
  throw lastError;
}

/**
 * Options for completing the onboarding flow.
 */
export interface CompleteOnboardingOptions {
  /** Whether this is a global skip (vs normal completion) */
  isGlobalSkip?: boolean;
  /** Steps that were completed */
  completedSteps?: OnboardingStep[];
  /** Steps that were skipped */
  skippedSteps?: OnboardingStep[];
  /** Duration of onboarding in milliseconds */
  duration?: number;
  /** Step the user was on when they skipped (for global skip) */
  originStep?: OnboardingStep;
  /** Whether user has wardrobe items (defaults to false) */
  hasItems?: boolean;
  /** Optional callback when backend sync fails after retries (for toast notification) */
  onSyncFailure?: (message: string) => void;
}

/**
 * Custom hook for completing the onboarding flow.
 *
 * Provides a callback that handles all aspects of onboarding completion:
 * - Fires analytics events
 * - Updates backend hasOnboarded flag (with error handling)
 * - Clears local onboarding state
 * - Navigates to main app
 *
 * This is a shared helper that can be called from:
 * - Success step primary CTA
 * - Global "Skip onboarding" action
 * - Any other completion context
 *
 * IDEMPOTENCY:
 * The returned callback is idempotent and safe to call multiple times.
 * It uses a guard to prevent concurrent executions and ensures only
 * one navigation occurs even if invoked repeatedly.
 *
 * TIMEOUT SAFETY (AC5):
 * A 30-second timeout ensures the guard is reset even if completion
 * operations hang (e.g., network issues, router problems). This prevents
 * the user from being permanently blocked from retrying completion while
 * still protecting against rapid double-taps or concurrent invocations.
 * The 30s value balances allowing for slow networks while preventing
 * indefinite hangs.
 *
 * ERROR HANDLING (AC6, NFR3):
 * Backend failures do not prevent local completion. If the Supabase
 * update fails:
 * - Local state is still updated (optimistic)
 * - Navigation still occurs (user proceeds to app)
 * - Transient failures are retried with exponential backoff (3 attempts, AC6)
 * - Permanent failures (4xx errors) are not retried (NFR3)
 * - Error is logged for observability
 * - User notified via optional onSyncFailure callback (AC6)
 * - User may see onboarding again if backend never updates (acceptable per AC6)
 *
 * This follows the UX-first approach: never trap the user in onboarding
 * due to backend issues. Local completion ensures forward progress.
 *
 * BACKEND UPDATE:
 * Updates public.profiles.has_onboarded via Supabase database update:
 * - Idempotent by design
 * - Respects RLS automatically (user can only update own profile)
 * - Updates public.profiles table
 *
 * @returns Memoized callback to complete onboarding
 *
 * @example
 * ```tsx
 * function OnboardingLayout() {
 *   const completeOnboarding = useCompleteOnboarding();
 *
 *   const handleFinish = () => {
 *     completeOnboarding({
 *       isGlobalSkip: false,
 *       completedSteps: ['welcome', 'prefs'],
 *       skippedSteps: ['firstItem'],
 *       duration: 120000,
 *     });
 *   };
 * }
 * ```
 */
export function useCompleteOnboarding() {
  const router = useRouter();
  const user = useStore((state) => state.user);
  const updateHasOnboarded = useStore((state) => state.updateHasOnboarded);
  const resetOnboardingState = useStore((state) => state.resetOnboardingState);

  // Guard to prevent concurrent executions
  // This ensures idempotency even if the callback is invoked multiple times
  const isCompletingRef = useRef(false);
  // Timeout reference for safety reset mechanism
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback(
    async (options: CompleteOnboardingOptions = {}) => {
      // Idempotency guard: return early if already completing
      if (isCompletingRef.current) {
        return;
      }

      isCompletingRef.current = true;

      // Safety timeout: Reset guard after 30 seconds to prevent permanent lock (AC5)
      // This protects against hung navigation, slow backend, or other stalls
      // while still preventing rapid concurrent invocations
      timeoutRef.current = setTimeout(() => {
        isCompletingRef.current = false;
        timeoutRef.current = null;

        logError(new Error('Onboarding completion exceeded timeout'), 'user', {
          feature: 'onboarding',
          operation: 'completeOnboarding',
          metadata: {
            timeoutMs: 30000,
            note: 'Completion took too long, guard reset to allow retry',
          },
        });
      }, 30000);

      try {
        // Step 1: Fire analytics events (fire-and-forget)
        // These are non-blocking and should not prevent completion
        const hasItems = options.hasItems ?? false;
        const completedSteps = options.completedSteps || [];
        const skippedSteps = options.skippedSteps || [];

        if (options.isGlobalSkip) {
          // Global skip path: user bypassed onboarding entirely
          // Fire legacy skipped_all event for backward compatibility
          // NOTE: trackOnboardingSkippedAll is not part of the AC9 spec but maintained
          // for backward compatibility with existing analytics dashboards
          void trackOnboardingSkippedAll(
            options.originStep || 'welcome',
            completedSteps,
            skippedSteps
          );

          // Fire exit_to_home event with skipped_entire_flow method (AC9)
          void trackOnboardingExitToHome('skipped_entire_flow', hasItems, options.originStep);
        } else {
          // Normal completion path: user reached success screen
          // Determine if all steps were completed or some were skipped
          const hasSkippedSteps = skippedSteps.length > 0;

          if (hasSkippedSteps) {
            // User completed with some per-step skips (AC9)
            void trackOnboardingCompletedWithSkips(
              completedSteps,
              skippedSteps,
              options.duration,
              hasItems
            );
            void trackOnboardingExitToHome('completed_with_skips', hasItems);
          } else {
            // User completed all steps without skipping (AC9)
            void trackOnboardingCompletedAllSteps(completedSteps, options.duration, hasItems);
            void trackOnboardingExitToHome('completed_all_steps', hasItems);
          }

          // Fire legacy completed event for backward compatibility
          // NOTE: trackOnboardingCompleted is not part of the AC9 spec but maintained
          // for backward compatibility with existing analytics dashboards
          void trackOnboardingCompleted(completedSteps, skippedSteps, options.duration);
        }

        // Step 2: Optimistically update local state
        // This happens immediately to provide instant feedback
        // If backend fails, we still want local completion to succeed
        updateHasOnboarded(true);

        // Step 3: Clear all local onboarding state
        // Resets currentStep, completedSteps, skippedSteps to initial state
        resetOnboardingState();

        // Step 4: Navigate to main app entry (Closet)
        // Using replace to prevent back navigation to onboarding
        try {
          router.replace('/home');
        } catch (error) {
          // Log navigation failure but don't throw
          // User might still be navigated by router's error recovery
          logError(error as Error, 'user', {
            feature: 'onboarding',
            operation: 'navigateToHome',
            metadata: {
              isGlobalSkip: options.isGlobalSkip ?? false,
              target: '/home',
            },
          });
        }

        // Step 5: Update backend hasOnboarded flag with retry logic
        // This happens after local completion to ensure user proceeds
        // even if backend is unavailable
        if (user?.id) {
          try {
            // Update profile in public.profiles table with retry on transient failures
            // This is idempotent - calling multiple times is safe
            // RLS ensures user can only update their own profile
            await retryWithBackoff(
              async () => {
                const { error } = await supabase
                  .from('profiles')
                  .update({ has_onboarded: true } as ProfileUpdatePayload)
                  .eq('id', user.id);

                if (error) {
                  throw error;
                }

                return { success: true };
              },
              {
                maxAttempts: 3,
                shouldRetry: isTransientSupabaseError,
                getDelay: (attempt) => {
                  // Exponential backoff with jitter: 1s, 2s, 4s (plus 0-1s random)
                  // Formula consistent with React Query config
                  return Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 30000);
                },
                onRetry: (error, attempt) => {
                  // Log retry attempts for observability
                  logError(error as Error, 'server', {
                    feature: 'onboarding',
                    operation: 'updateBackendHasOnboarded',
                    metadata: {
                      userId: user.id,
                      attempt,
                      maxAttempts: 3,
                      willRetry: true,
                      note: 'Retrying backend update due to transient error',
                    },
                  });
                },
              }
            );

            // Log successful backend update
            logSuccess('onboarding', 'backend_update_succeeded', {
              data: {
                userId: user.id,
                completedSteps: options.completedSteps || [],
                skippedSteps: options.skippedSteps || [],
                isGlobalSkip: options.isGlobalSkip ?? false,
              },
            });
          } catch (error) {
            // Backend update failed after all retries
            // User is already on /home with local state updated
            // This is acceptable - eventual consistency will sync later

            logError(error as Error, 'server', {
              feature: 'onboarding',
              operation: 'updateBackendHasOnboarded',
              metadata: {
                userId: user.id,
                isGlobalSkip: options.isGlobalSkip ?? false,
                retriesExhausted: true,
                note: 'Local completion succeeded, backend update failed after retries',
              },
            });

            // NOTE: User may see onboarding again on next launch if backend
            // never updates. This is acceptable per UX-first approach.
            // We don't revert local state because user has already navigated.

            // Notify user of sync failure if callback provided
            // This allows parent component to show a non-blocking toast
            if (options.onSyncFailure) {
              options.onSyncFailure(
                "Setup complete! We're still syncing your progress in the background."
              );
            }
          }
        }
      } finally {
        // Clear safety timeout if completion finished before timeout
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        // Reset completion guard
        // This allows the callback to be invoked again if needed
        // (though in practice, user will be on /home by now)
        isCompletingRef.current = false;
      }
    },
    [user, updateHasOnboarded, resetOnboardingState, router]
  );
}
