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
 * Track when first item screen is viewed.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted once when the first item capture step becomes visible in a session.
 * Guarded against re-renders via useRef in the component.
 *
 * First-item-specific event that provides finer granularity than the generic
 * step_viewed event for analytics and funnel tracking. Includes hasExistingItems
 * flag to understand if users are adding their very first item or have items already.
 *
 * @param isResume - Whether this is a resumed session (vs fresh start)
 * @param hasExistingItems - Whether the user already has items in their wardrobe
 */
export function trackFirstItemViewed(isResume: boolean, hasExistingItems: boolean): void {
  try {
    logSuccess('onboarding', 'first_item_viewed', {
      data: {
        step: 'firstItem',
        isResume,
        hasExistingItems,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track first_item_viewed:', error);
  }
}

/**
 * Track when user starts camera capture from first item step.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted when the camera capture UI successfully opens from the first item step.
 * This indicates the user has engaged with the primary CTA and begun the capture flow.
 *
 * First-item-specific event that tracks engagement with the camera capture feature
 * and measures drop-off between viewing the step and starting capture.
 */
export function trackFirstItemStartedCapture(): void {
  try {
    logSuccess('onboarding', 'first_item_started_capture', {
      data: {
        step: 'firstItem',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track first_item_started_capture:', error);
  }
}

/**
 * Track when user successfully saves their first item.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted once when an item is successfully created and persisted to the database
 * from the first item onboarding step. This represents successful completion of
 * the item capture flow.
 *
 * First-item-specific event that tracks successful item creation during onboarding.
 * Should be fired exactly once per successfully saved item to avoid double-counting.
 */
export function trackFirstItemSavedSuccess(): void {
  try {
    logSuccess('onboarding', 'first_item_saved_success', {
      data: {
        step: 'firstItem',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track first_item_saved_success:', error);
  }
}

/**
 * Track when item save fails during first item step.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted each time a save/upload attempt fails, including retries.
 * Includes a coarse errorType to help diagnose common failure patterns
 * without exposing sensitive error details.
 *
 * First-item-specific event that tracks failures during item persistence.
 * Helps identify systemic issues with uploads, network connectivity, or
 * database operations during the onboarding flow.
 *
 * @param errorType - Coarse error classification (e.g., 'upload', 'db_insert', 'timeout', 'offline')
 */
export function trackFirstItemSaveFailed(errorType: string): void {
  try {
    logSuccess('onboarding', 'first_item_save_failed', {
      data: {
        step: 'firstItem',
        errorType,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track first_item_save_failed:', error);
  }
}

/**
 * Track when user skips the first item step.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted when the user leaves the first item step without creating an item,
 * via either "Skip this step" or "Do this later" actions. The reason field
 * helps distinguish between different skip contexts.
 *
 * First-item-specific event that tracks users who choose not to add an item
 * during onboarding. The reason provides context about why they skipped:
 * - 'pure_skip': User clicked "Skip this step" without attempting capture
 * - 'failure_then_skip': User attempted capture/save but hit errors and chose "Do this later"
 * - 'permission_denied_then_skip': User denied camera permission and chose "Do this later"
 *
 * @param reason - Context for why the step was skipped
 */
export function trackFirstItemSkipped(reason: string): void {
  try {
    logSuccess('onboarding', 'first_item_skipped', {
      data: {
        step: 'firstItem',
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track first_item_skipped:', error);
  }
}

/**
 * Track when onboarding is completed with all steps.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted when user completes onboarding by progressing through all steps
 * without using any per-step skip buttons (though global skip is possible
 * and tracked separately).
 *
 * This provides finer granularity than the generic 'completed' event,
 * distinguishing users who engaged with every step from those who skipped
 * some optional content.
 *
 * @param completedSteps - Array of steps that were completed
 * @param durationMs - Total time spent in onboarding (optional)
 * @param hasItems - Whether user has wardrobe items (optional, defaults to false)
 */
export function trackOnboardingCompletedAllSteps(
  completedSteps: OnboardingStep[],
  durationMs?: number,
  hasItems?: boolean
): void {
  try {
    logSuccess('onboarding', 'completed_all_steps', {
      latency: durationMs,
      data: {
        completedSteps,
        totalSteps: completedSteps.length,
        hasItems: hasItems ?? false,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track completed_all_steps:', error);
  }
}

/**
 * Track when onboarding is completed with some skips.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted when user completes onboarding by reaching the success screen
 * but used per-step skip buttons on one or more optional steps.
 *
 * This provides finer granularity than the generic 'completed' event,
 * distinguishing users who skipped optional content from those who
 * engaged with every step.
 *
 * @param completedSteps - Array of steps that were completed
 * @param skippedSteps - Array of steps that were skipped
 * @param durationMs - Total time spent in onboarding (optional)
 * @param hasItems - Whether user has wardrobe items (optional, defaults to false)
 */
export function trackOnboardingCompletedWithSkips(
  completedSteps: OnboardingStep[],
  skippedSteps: OnboardingStep[],
  durationMs?: number,
  hasItems?: boolean
): void {
  try {
    logSuccess('onboarding', 'completed_with_skips', {
      latency: durationMs,
      data: {
        completedSteps,
        skippedSteps,
        totalSteps: completedSteps.length + skippedSteps.length,
        hasItems: hasItems ?? false,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track completed_with_skips:', error);
  }
}

/**
 * Track when user exits onboarding to home screen.
 *
 * This is a fire-and-forget operation that will not block navigation.
 * Emitted whenever the user transitions from the onboarding flow to the
 * main app (Closet) via any completion path.
 *
 * This event provides a unified tracking point for all onboarding exits,
 * allowing analytics to measure conversion and understand exit paths.
 *
 * @param method - The completion method used
 * @param hasItems - Whether user has wardrobe items (optional, defaults to false)
 * @param originStep - Step the user was on when exiting (for global skip)
 */
export function trackOnboardingExitToHome(
  method: 'completed_all_steps' | 'completed_with_skips' | 'skipped_entire_flow',
  hasItems?: boolean,
  originStep?: OnboardingStep | string
): void {
  try {
    logSuccess('onboarding', 'exit_to_home', {
      data: {
        method,
        hasItems: hasItems ?? false,
        originStep: originStep ?? null,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Silently fail - analytics should never block user flow
    // eslint-disable-next-line no-console
    console.warn('[Onboarding Analytics] Failed to track exit_to_home:', error);
  }
}
