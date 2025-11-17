/**
 * Onboarding analytics tracking module.
 *
 * Provides fire-and-forget analytics event tracking for the onboarding flow.
 * All analytics calls are non-blocking and will not prevent navigation or
 * state updates from proceeding.
 *
 * Analytics events:
 * - onboarding.step_viewed: Emitted on mount and whenever currentStep changes
 * - onboarding.step_skipped: Emitted when user skips a single step
 * - onboarding.completed: Emitted when user completes onboarding normally
 * - onboarding.skipped_all: Emitted when user uses global skip
 * - onboarding.state_reset: Emitted when corrupted state is detected and reset
 * - onboarding.state_resumed: Emitted when valid state is loaded on mount
 * - onboarding.welcome_viewed: Emitted when welcome screen becomes visible
 * - onboarding.welcome_get_started_clicked: Emitted when user taps "Get started"
 * - onboarding.welcome_skipped: Emitted when user taps "Skip for now" on welcome
 *
 * @module features/onboarding/utils/onboardingAnalytics
 */

import { logSuccess } from '../../../core/telemetry';
import type { OnboardingStep } from '../store/onboardingSlice';

/**
 * Track when a step is viewed.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted on shell mount and whenever currentStep changes via Next, Skip,
 * Back, or resume operations.
 *
 * @param step - The step being viewed
 * @param isResume - Whether this is a resumed session (vs fresh start)
 */
export function trackStepViewed(step: OnboardingStep, isResume: boolean): void {
  try {
    logSuccess('onboarding', 'step_viewed', {
      data: {
        step,
        isResume,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track step_viewed:', error);
  }
}

/**
 * Track when a step is skipped.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted when user uses the step-level Skip button on optional steps
 * (Preferences, First Item).
 *
 * @param step - The step being skipped
 */
export function trackStepSkipped(step: OnboardingStep): void {
  try {
    logSuccess('onboarding', 'step_skipped', {
      data: {
        step,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track step_skipped:', error);
  }
}

/**
 * Track when onboarding is completed normally.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted when user completes all steps by clicking through the final
 * "Get Started" button on the success step.
 *
 * @param completedSteps - Array of steps that were completed
 * @param skippedSteps - Array of steps that were skipped
 * @param durationMs - Total time spent in onboarding (optional)
 */
export function trackOnboardingCompleted(
  completedSteps: OnboardingStep[],
  skippedSteps: OnboardingStep[],
  durationMs?: number
): void {
  try {
    logSuccess('onboarding', 'completed', {
      latency: durationMs,
      data: {
        completedSteps,
        skippedSteps,
        totalSteps: completedSteps.length + skippedSteps.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track completed:', error);
  }
}

/**
 * Track when onboarding is skipped using global skip.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted when user uses the "Skip Onboarding" button to bypass the
 * entire flow from any non-terminal step.
 *
 * @param atStep - The step the user was on when they skipped
 * @param completedSteps - Array of steps completed before skip
 * @param skippedSteps - Array of steps skipped before global skip
 */
export function trackOnboardingSkippedAll(
  atStep: OnboardingStep,
  completedSteps: OnboardingStep[],
  skippedSteps: OnboardingStep[]
): void {
  try {
    logSuccess('onboarding', 'skipped_all', {
      data: {
        atStep,
        completedSteps,
        skippedSteps,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track skipped_all:', error);
  }
}

/**
 * Track when onboarding state is reset due to corruption.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted when persisted state fails validation and is reset to initial
 * state. This provides diagnostic data for debugging state issues.
 *
 * @param reason - Reason for reset (e.g., 'corrupted', 'invalid_version')
 * @param corruptedState - The invalid state that was detected (sanitized)
 */
export function trackStateReset(reason: string, corruptedState?: unknown): void {
  try {
    logSuccess('onboarding', 'state_reset', {
      data: {
        reason,
        hadState: corruptedState !== null && corruptedState !== undefined,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track state_reset:', error);
  }
}

/**
 * Track when onboarding state is successfully resumed.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted when valid persisted state is loaded on app restart/mount,
 * indicating the user is continuing a previously started onboarding flow.
 *
 * @param currentStep - The step being resumed to
 * @param completedSteps - Steps completed in previous session
 * @param skippedSteps - Steps skipped in previous session
 */
export function trackStateResumed(
  currentStep: OnboardingStep,
  completedSteps: OnboardingStep[],
  skippedSteps: OnboardingStep[]
): void {
  try {
    logSuccess('onboarding', 'state_resumed', {
      data: {
        currentStep,
        completedSteps,
        skippedSteps,
        totalProgress: completedSteps.length + skippedSteps.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track state_resumed:', error);
  }
}

/**
 * Track when welcome screen is viewed.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted once when the welcome screen first becomes visible in a session.
 * Guarded against re-renders via useRef in the component.
 *
 * Welcome-specific event that provides finer granularity than the generic
 * step_viewed event for analytics and funnel tracking.
 *
 * @param isResume - Whether this is a resumed session (vs fresh start)
 */
export function trackWelcomeViewed(isResume: boolean): void {
  try {
    logSuccess('onboarding', 'welcome_viewed', {
      data: {
        step: 'welcome',
        isResume,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track welcome_viewed:', error);
  }
}

/**
 * Track when user clicks "Get started" on welcome screen.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted when user taps the primary CTA to begin onboarding flow.
 * Duplicate prevention handled by footer's debouncing state.
 *
 * Welcome-specific event that tracks engagement with the primary CTA
 * and entry into the onboarding flow.
 */
export function trackWelcomeGetStartedClicked(): void {
  try {
    logSuccess('onboarding', 'welcome_get_started_clicked', {
      data: {
        step: 'welcome',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track welcome_get_started_clicked:', error);
  }
}

/**
 * Track when user clicks "Skip for now" on welcome screen.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted when user taps the global skip button to bypass onboarding
 * from the welcome screen.
 * Duplicate prevention handled by footer's debouncing state.
 *
 * Welcome-specific event that tracks users who choose to skip onboarding
 * immediately without viewing any content.
 */
export function trackWelcomeSkipped(): void {
  try {
    logSuccess('onboarding', 'welcome_skipped', {
      data: {
        step: 'welcome',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track welcome_skipped:', error);
  }
}

/**
 * Track when preferences screen is viewed.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted once when the preferences screen first becomes visible in a session.
 * Guarded against re-renders via useRef in the component.
 *
 * Prefs-specific event that provides finer granularity than the generic
 * step_viewed event for analytics and funnel tracking.
 *
 * @param isResume - Whether this is a resumed session (vs fresh start)
 */
export function trackPrefsViewed(isResume: boolean): void {
  try {
    logSuccess('onboarding', 'prefs_viewed', {
      data: {
        step: 'prefs',
        isResume,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track prefs_viewed:', error);
  }
}
