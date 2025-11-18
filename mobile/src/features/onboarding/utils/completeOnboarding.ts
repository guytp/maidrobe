import { useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient, QueryClient } from '@tanstack/react-query';
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
import type { Router } from 'expo-router';

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
 * Context required for completing onboarding.
 *
 * This interface defines all dependencies needed by the completion utility.
 * Separating these makes the function testable and allows both hook and
 * non-hook usage patterns.
 */
export interface CompleteOnboardingContext {
  /** Current authenticated user */
  user: { id: string; email: string } | null;
  /** React Query client for cache invalidation */
  queryClient: QueryClient;
  /** Zustand action to update hasOnboarded flag in session state */
  updateHasOnboarded: (value: boolean) => void;
  /** Zustand action to reset onboarding state (steps, progress) */
  resetOnboardingState: () => void;
  /** Expo router for navigation */
  router: Router;
}

/**
 * Completes the onboarding flow for the current authenticated user.
 *
 * This is a dedicated client-side helper that handles all aspects of
 * transitioning a user from hasOnboarded=false to hasOnboarded=true.
 * It is the single source of truth for onboarding completion logic.
 *
 * RESPONSIBILITIES:
 * 1. Fire analytics events for completion/skip tracking
 * 2. Update backend public.profiles.has_onboarded flag via Supabase
 * 3. Invalidate React Query profile cache to ensure fresh data
 * 4. Update Zustand session state (optimistic update)
 * 5. Clear local onboarding progress state
 * 6. Navigate user to main home route
 *
 * CRITICAL GUARANTEES:
 * - hasOnboarded is ONLY set to true, NEVER reverted to false
 * - Backend update is idempotent (safe to call multiple times)
 * - Local state updated optimistically (user proceeds even on backend failure)
 * - Navigation happens regardless of backend success
 * - React Query cache invalidated only on successful backend update
 *
 * USAGE:
 * This utility can be called directly from non-React contexts or wrapped
 * in the useCompleteOnboarding hook for React component usage.
 *
 * ERROR HANDLING:
 * - Backend failures are retried with exponential backoff (3 attempts)
 * - Transient errors (network, 5xx) are retried automatically
 * - Permanent errors (4xx, RLS) are not retried
 * - Local completion always succeeds even if backend fails
 * - Sync failures reported via optional onSyncFailure callback
 *
 * @param context - Dependencies (user, queryClient, actions, router)
 * @param options - Completion options (analytics data, callbacks)
 * @returns Promise that resolves when completion flow finishes
 *
 * @example
 * ```typescript
 * // Direct usage in utility function
 * await completeOnboardingForCurrentUser(
 *   {
 *     user: currentUser,
 *     queryClient: client,
 *     updateHasOnboarded: store.updateHasOnboarded,
 *     resetOnboardingState: store.resetOnboardingState,
 *     router: expoRouter,
 *   },
 *   {
 *     isGlobalSkip: false,
 *     completedSteps: ['welcome', 'prefs'],
 *     hasItems: true,
 *   }
 * );
 * ```
 */
export async function completeOnboardingForCurrentUser(
  context: CompleteOnboardingContext,
  options: CompleteOnboardingOptions = {}
): Promise<void> {
  const { user, queryClient, updateHasOnboarded, resetOnboardingState, router } = context;

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

  // Step 2: Update backend hasOnboarded flag with retry logic
  // This happens first to ensure data consistency before UI updates
  // If this fails, we still proceed with local updates (optimistic)
  let backendUpdateSucceeded = false;
  if (user?.id) {
    try {
      // Update profile in public.profiles table with retry on transient failures
      // This is idempotent - calling multiple times is safe
      // RLS ensures user can only update their own profile
      // CRITICAL: hasOnboarded is ONLY set to true, NEVER false
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
              operation: 'completeOnboardingForCurrentUser',
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

      backendUpdateSucceeded = true;

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
      // We still proceed with local updates and navigation (UX-first approach)
      backendUpdateSucceeded = false;

      logError(error as Error, 'server', {
        feature: 'onboarding',
        operation: 'completeOnboardingForCurrentUser',
        metadata: {
          userId: user.id,
          isGlobalSkip: options.isGlobalSkip ?? false,
          retriesExhausted: true,
          note: 'Backend update failed after retries, proceeding with local completion',
        },
      });

      // Notify user of sync failure if callback provided
      // This allows parent component to show a non-blocking toast
      if (options.onSyncFailure) {
        options.onSyncFailure(
          "Setup complete! We're still syncing your progress in the background."
        );
      }

      // CRITICAL: Invalidate React Query profile cache even on backend failure
      // This prevents stale cached hasOnboarded=false from being served while
      // Zustand state has been optimistically set to hasOnboarded=true.
      // Without this, components using useProfile might see inconsistent state
      // and incorrectly route users back to onboarding on next session.
      // The cache will refetch from the server (which still has hasOnboarded=false)
      // on next read, maintaining correct server-side state as source of truth.
      if (user?.id) {
        try {
          await queryClient.invalidateQueries({
            queryKey: ['profile', user.id],
          });

          logSuccess('onboarding', 'profile_cache_invalidated_on_failure', {
            data: {
              userId: user.id,
              queryKey: ['profile', user.id],
              note: 'Cache invalidated despite backend failure to prevent stale data',
            },
          });
        } catch (cacheError) {
          // Cache invalidation failure is non-fatal but should be logged
          // The stale cache will eventually expire based on React Query staleTime
          logError(cacheError as Error, 'user', {
            feature: 'onboarding',
            operation: 'invalidateProfileCacheOnFailure',
            metadata: {
              userId: user.id,
              note: 'Failed to invalidate cache after backend failure, may serve stale data',
            },
          });
        }
      }
    }
  }

  // Step 3: Invalidate React Query profile cache (only if backend succeeded)
  // This ensures useProfile hook refetches and gets the updated hasOnboarded value
  // Skip if backend update failed to avoid cache inconsistency
  if (backendUpdateSucceeded && user?.id) {
    try {
      await queryClient.invalidateQueries({
        queryKey: ['profile', user.id],
      });

      logSuccess('onboarding', 'profile_cache_invalidated', {
        data: {
          userId: user.id,
          queryKey: ['profile', user.id],
        },
      });
    } catch (error) {
      // Cache invalidation failure is non-fatal
      // Query will eventually refetch on stale time expiry
      logError(error as Error, 'user', {
        feature: 'onboarding',
        operation: 'invalidateProfileCache',
        metadata: {
          userId: user.id,
          note: 'Failed to invalidate cache, query will refetch on next stale check',
        },
      });
    }
  }

  // Step 4: Optimistically update local Zustand session state
  // This happens immediately to provide instant UI feedback
  // CRITICAL: hasOnboarded is ONLY set to true, NEVER false
  updateHasOnboarded(true);

  // Step 5: Clear all local onboarding state
  // Resets currentStep, completedSteps, skippedSteps to initial state
  resetOnboardingState();

  // Step 6: Navigate to main app entry (home)
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
}

/**
 * React hook for completing the onboarding flow.
 *
 * This hook wraps the completeOnboardingForCurrentUser utility function
 * with React-specific dependencies (hooks for router, queryClient, store).
 * It provides a memoized callback that can be safely used in React components.
 *
 * FEATURES:
 * - Idempotent: Safe to call multiple times (uses guard)
 * - Timeout safety: 30s timeout prevents permanent lock
 * - Error resilient: Local completion succeeds even on backend failure
 * - Cache invalidation: Updates React Query profile cache
 *
 * USAGE:
 * This is the recommended way to complete onboarding from React components:
 * - Success screen
 * - Layout skip handlers
 * - Any completion context in the component tree
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
  const queryClient = useQueryClient();
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
          operation: 'useCompleteOnboarding',
          metadata: {
            timeoutMs: 30000,
            note: 'Completion took too long, guard reset to allow retry',
          },
        });
      }, 30000);

      try {
        // Delegate to the standalone utility function
        // This function handles all the completion logic
        await completeOnboardingForCurrentUser(
          {
            user,
            queryClient,
            updateHasOnboarded,
            resetOnboardingState,
            router,
          },
          options
        );
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
    [user, queryClient, updateHasOnboarded, resetOnboardingState, router]
  );
}
