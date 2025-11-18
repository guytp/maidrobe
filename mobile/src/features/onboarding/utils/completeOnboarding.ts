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
 * TIMEOUT SAFETY:
 * A 30-second timeout ensures the guard is reset even if completion
 * operations hang (e.g., network issues, router problems). This prevents
 * the user from being permanently blocked from retrying completion while
 * still protecting against rapid double-taps or concurrent invocations.
 *
 * ERROR HANDLING:
 * Backend failures do not prevent local completion. If the Supabase
 * update fails:
 * - Local state is still updated (optimistic)
 * - Navigation still occurs (user proceeds to app)
 * - Error is logged for observability
 * - User may see onboarding again if backend never updates (acceptable)
 *
 * This follows the UX-first approach: never trap the user in onboarding
 * due to backend issues. Local completion ensures forward progress.
 *
 * BACKEND UPDATE:
 * Updates user metadata via supabase.auth.updateUser() which is:
 * - Idempotent by design
 * - Respects RLS automatically
 * - Updates auth.users metadata field
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

      // Safety timeout: Reset guard after 30 seconds to prevent permanent lock
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
          void trackOnboardingSkippedAll(
            options.originStep || 'welcome',
            completedSteps,
            skippedSteps
          );

          // Fire exit_to_home event with skipped_entire_flow method
          void trackOnboardingExitToHome('skipped_entire_flow', hasItems, options.originStep);
        } else {
          // Normal completion path: user reached success screen
          // Determine if all steps were completed or some were skipped
          const hasSkippedSteps = skippedSteps.length > 0;

          if (hasSkippedSteps) {
            // User completed with some per-step skips
            void trackOnboardingCompletedWithSkips(
              completedSteps,
              skippedSteps,
              options.duration,
              hasItems
            );
            void trackOnboardingExitToHome('completed_with_skips', hasItems);
          } else {
            // User completed all steps without skipping
            void trackOnboardingCompletedAllSteps(completedSteps, options.duration, hasItems);
            void trackOnboardingExitToHome('completed_all_steps', hasItems);
          }

          // Fire legacy completed event for backward compatibility
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

        // Step 5: Update backend hasOnboarded flag
        // This happens after local completion to ensure user proceeds
        // even if backend is unavailable
        if (user?.id) {
          try {
            // Update user metadata via Supabase Auth
            // This is idempotent - calling multiple times is safe
            const { error } = await supabase.auth.updateUser({
              data: {
                hasOnboarded: true,
              },
            });

            if (error) {
              throw error;
            }

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
            // Backend update failed, but local completion already succeeded
            // User is already on /home with local state updated
            // This is acceptable - eventual consistency will sync later

            logError(error as Error, 'server', {
              feature: 'onboarding',
              operation: 'updateBackendHasOnboarded',
              metadata: {
                userId: user.id,
                isGlobalSkip: options.isGlobalSkip ?? false,
                note: 'Local completion succeeded, backend update failed',
              },
            });

            // NOTE: User may see onboarding again on next launch if backend
            // never updates. This is acceptable per UX-first approach.
            // We don't revert local state because user has already navigated.

            // TODO: Consider showing non-blocking toast here
            // Would require toast state management in parent component
            // For now, silent failure with telemetry logging is sufficient
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
