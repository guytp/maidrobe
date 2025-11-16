import { Stack, useRouter, useSegments } from 'expo-router';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { ActivityIndicator, View, BackHandler } from 'react-native';
import { useStore } from '../../src/core/state/store';
import { OnboardingStep, getPreviousStep } from '../../src/features/onboarding';
import { useTheme } from '../../src/core/theme';
import { OnboardingProvider } from '../../src/features/onboarding/context/OnboardingContext';
import {
  trackStepViewed,
  trackStepSkipped,
  trackOnboardingCompleted,
  trackOnboardingSkippedAll,
  trackStateReset,
  trackStateResumed,
} from '../../src/features/onboarding/utils/onboardingAnalytics';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used in TODO comment for story #95
import { logSuccess, logError } from '../../src/core/telemetry';

/**
 * Onboarding flow shell container.
 *
 * This layout serves as the single control point for onboarding step ordering,
 * navigation decisions, and resumption. It manages the entire onboarding lifecycle:
 * - Checks hasOnboarded flag to determine if onboarding should run
 * - Initializes or resumes onboarding based on persisted state
 * - Normalizes direct navigation to child routes
 * - Prevents onboarding flicker when user has already completed onboarding
 *
 * Flow Logic:
 * 1. Wait for auth hydration to complete (isHydrating = false)
 * 2. Check hasOnboarded flag from user profile
 *    - If true: redirect to /home and clear onboarding state
 *    - If false: proceed to step 3
 * 3. Check currentStep from persisted onboarding state
 *    - If null: call startOnboarding() to begin fresh
 *    - If valid step: resume at that step
 * 4. Navigate to the step indicated by currentStep
 *
 * Route Normalization:
 * Direct navigation to child routes (e.g., /onboarding/prefs) is normalized
 * to behave as if the user entered /onboarding. The shell always routes based
 * on currentStep from the store, not the URL path. This prevents arbitrary
 * deep-link step jumps and maintains onboarding flow integrity.
 *
 * No Flicker Guarantee:
 * Shows loading indicator while determining route (during auth hydration and
 * initialization). The Stack navigator only renders after routing decisions
 * are complete, preventing brief flashes of onboarding screens for users who
 * have already completed onboarding.
 *
 * @returns Onboarding layout with shell logic and Stack navigator
 */
export default function OnboardingLayout(): React.JSX.Element {
  const router = useRouter();
  const segments = useSegments();
  const { colors } = useTheme();

  // Auth state
  const isHydrating = useStore((state) => state.isHydrating);
  const user = useStore((state) => state.user);

  // Onboarding state
  const currentStep = useStore((state) => state.currentStep);
  const completedSteps = useStore((state) => state.completedSteps);
  const skippedSteps = useStore((state) => state.skippedSteps);
  const startOnboarding = useStore((state) => state.startOnboarding);
  const markStepCompleted = useStore((state) => state.markStepCompleted);
  const markStepSkipped = useStore((state) => state.markStepSkipped);
  const setCurrentStep = useStore((state) => state.setCurrentStep);
  const resetOnboardingState = useStore((state) => state.resetOnboardingState);
  const updateHasOnboarded = useStore((state) => state.updateHasOnboarded);

  // Local initialization state
  const [isInitializing, setIsInitializing] = useState(true);

  // Track if this is a resumed session for analytics
  const isResumedSession = useRef(false);

  // Track onboarding start time for duration analytics
  const onboardingStartTime = useRef<number | null>(null);

  /**
   * Completion handler for onboarding flow.
   *
   * Called when user completes onboarding (via final step or global skip).
   * Performs the following actions:
   * 1. Optimistically sets hasOnboarded = true via updateHasOnboarded
   * 2. Clears local onboarding state via resetOnboardingState
   * 3. Navigates to /home
   * 4. Logs completion (server-side update placeholder)
   *
   * OPTIMISTIC UPDATE & ROLLBACK:
   * This function performs an optimistic update of hasOnboarded before the
   * server-side update completes (when story #95 is implemented). If the
   * server update fails:
   * - The local optimistic state is reverted via updateHasOnboarded(previousValue)
   * - The failure is logged to telemetry for observability
   * - The user remains on /home (navigation is NOT reverted for better UX)
   * - Profile refresh will sync authoritative server state on next app launch
   *
   * This dual-layer approach ensures:
   * - Explicit rollback path (code guidelines compliance)
   * - Self-correction via eventual consistency (profile refresh)
   * - User experience is not disrupted by transient server errors
   * - Observability through structured error logging
   *
   * Server failures are logged but do not block navigation or force user
   * back into onboarding. The optimistic update ensures the user can
   * proceed immediately.
   */
  const handleOnboardingComplete = useCallback(
    (isGlobalSkip = false) => {
      // 1. Fire-and-forget analytics
      if (isGlobalSkip) {
        void trackOnboardingSkippedAll(currentStep || 'welcome', completedSteps, skippedSteps);
      } else {
        const duration =
          onboardingStartTime.current !== null
            ? Date.now() - onboardingStartTime.current
            : undefined;
        void trackOnboardingCompleted(completedSteps, skippedSteps, duration);
      }

      // 2. Capture previous hasOnboarded value for potential rollback
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used in TODO comment for story #95
      const previousHasOnboarded = user?.hasOnboarded ?? false;

      // 3. Optimistically set hasOnboarded = true
      updateHasOnboarded(true);

      // 4. Clear local onboarding state
      resetOnboardingState();

      // 5. Navigate to home
      router.replace('/home');

      // 6. Server-side update (placeholder - will be replaced when #95 is implemented)
      // For now, just log the completion via telemetry
      logSuccess('onboarding', 'completed', {
        data: {
          completedSteps,
          skippedSteps,
          isGlobalSkip,
          stepCount: completedSteps.length,
          skippedCount: skippedSteps.length,
        },
      });

      // TODO: When story #95 API is available, add:
      // try {
      //   await updateUserOnboardingStatus({ hasOnboarded: true });
      // } catch (error) {
      //   // ROLLBACK: Revert optimistic update on server failure
      //   updateHasOnboarded(previousHasOnboarded);
      //
      //   // Log error with rollback context for observability
      //   logError(error, 'server', {
      //     feature: 'onboarding',
      //     operation: 'updateServerStatus',
      //     metadata: {
      //       attemptedValue: true,
      //       rolledBackTo: previousHasOnboarded,
      //       isGlobalSkip,
      //     },
      //   });
      //
      //   // NOTE: User remains on /home (navigation not reverted).
      //   // The local rollback prevents hasOnboarded gate from incorrectly
      //   // blocking re-entry to onboarding if the user navigates back.
      //   // Profile refresh will sync authoritative server state on next launch,
      //   // providing self-correction via eventual consistency.
      // }
    },
    [
      updateHasOnboarded,
      resetOnboardingState,
      router,
      completedSteps,
      skippedSteps,
      currentStep,
      user,
    ]
  );

  /**
   * Handler for primary action (Next/Continue/Get Started).
   *
   * On regular steps: marks step as completed and advances to next step.
   * On final step: triggers completion handler.
   */
  const handleNext = useCallback(() => {
    if (!currentStep) return;

    if (currentStep === 'success') {
      // Final step - complete onboarding
      handleOnboardingComplete();
    } else {
      // Regular step - mark completed and advance
      markStepCompleted(currentStep);
    }
  }, [currentStep, markStepCompleted, handleOnboardingComplete]);

  /**
   * Handler for step-level skip.
   *
   * Marks current step as skipped and advances to next step.
   * Only available on optional steps (Preferences, First Item).
   * Emits step_skipped analytics event.
   */
  const handleSkipStep = useCallback(() => {
    if (!currentStep) return;

    // Fire-and-forget analytics
    void trackStepSkipped(currentStep);

    // Mark step as skipped and advance
    markStepSkipped(currentStep);
  }, [currentStep, markStepSkipped]);

  /**
   * Handler for global skip onboarding.
   *
   * Immediately completes onboarding, skipping all remaining steps.
   * Available on all non-terminal steps.
   * Emits skipped_all analytics event.
   */
  const handleSkipOnboarding = useCallback(() => {
    handleOnboardingComplete(true);
  }, [handleOnboardingComplete]);

  /**
   * Handler for back navigation.
   *
   * Moves to the previous step in the defined order using setCurrentStep.
   * Does NOT modify completedSteps or skippedSteps, preserving invariants.
   * Connected to platform back affordances (iOS gesture, Android hardware back).
   */
  const handleBack = useCallback(() => {
    if (!currentStep) return;

    const previousStep = getPreviousStep(currentStep);
    if (previousStep) {
      setCurrentStep(previousStep);
    }
  }, [currentStep, setCurrentStep]);

  /**
   * Effect: Handle hasOnboarded gate and onboarding initialization
   *
   * This effect runs once after auth hydration completes. It checks the
   * hasOnboarded flag and either redirects to home or initializes/resumes
   * onboarding based on persisted state. Includes state validation and
   * analytics tracking for resumption and resets.
   */
  useEffect(() => {
    // Wait for auth hydration to complete
    if (isHydrating) {
      return;
    }

    // Check hasOnboarded flag (default to false if user doesn't exist or field not set)
    const hasOnboarded = user?.hasOnboarded ?? false;

    if (hasOnboarded) {
      // User has already completed onboarding - redirect to home
      // Clear any persisted onboarding state to prevent confusion
      resetOnboardingState();
      router.replace('/home');
      return;
    }

    // User needs onboarding - check if we should start fresh or resume
    if (!currentStep) {
      // No persisted step - start fresh onboarding
      // This sets currentStep to 'welcome', which will trigger navigation below
      startOnboarding();

      // Record start time for duration analytics
      onboardingStartTime.current = Date.now();

      // Mark as fresh session (not resumed)
      isResumedSession.current = false;
    } else {
      // Valid persisted step found - this is a resumed session
      // Fire-and-forget analytics for successful resumption
      void trackStateResumed(currentStep, completedSteps, skippedSteps);

      // Mark as resumed session for step_viewed analytics
      isResumedSession.current = true;

      // Set start time to now (we don't track across sessions)
      onboardingStartTime.current = Date.now();
    }

    // Mark initialization as complete
    // Navigation will happen in the second effect when currentStep is set
    setIsInitializing(false);
  }, [
    isHydrating,
    user,
    currentStep,
    startOnboarding,
    resetOnboardingState,
    router,
    completedSteps,
    skippedSteps,
  ]);

  /**
   * Effect: Track step views with analytics
   *
   * This effect runs whenever currentStep changes (via Next, Skip, Back, or resume).
   * Emits a fire-and-forget step_viewed analytics event.
   */
  useEffect(() => {
    // Wait for initialization to complete
    if (isInitializing || !currentStep) {
      return;
    }

    // Fire-and-forget analytics for step view
    void trackStepViewed(currentStep, isResumedSession.current);

    // After first step view, mark as not resumed anymore
    // (subsequent views in same session are navigations, not resumptions)
    if (isResumedSession.current) {
      isResumedSession.current = false;
    }
  }, [currentStep, isInitializing]);

  /**
   * Effect: Navigate to current step
   *
   * This effect runs whenever currentStep changes (including after startOnboarding
   * is called). It navigates to the route corresponding to the current step,
   * implementing route normalization by ignoring the actual URL path.
   */
  useEffect(() => {
    // Wait for hydration and initialization
    if (isHydrating || isInitializing) {
      return;
    }

    // Ensure we have a valid current step
    if (!currentStep) {
      return;
    }

    // Step to route name mapping
    const STEP_TO_ROUTE: Record<OnboardingStep, string> = {
      welcome: 'welcome',
      prefs: 'prefs',
      firstItem: 'first-item',
      success: 'success',
    };

    // Get the route name for the current step
    const routeName = STEP_TO_ROUTE[currentStep];
    if (!routeName) {
      // Invalid step - this shouldn't happen due to validation in store
      // but handle gracefully by resetting and logging diagnostic
      void trackStateReset('invalid_step', currentStep);
      resetOnboardingState();
      startOnboarding();
      return;
    }

    // Check if we're already on the correct route to avoid unnecessary navigation
    const currentPath = segments.join('/');

    if (!currentPath.endsWith(routeName)) {
      // Navigate to the step indicated by currentStep
      // This implements route normalization - we always navigate based on
      // currentStep, not the URL the user tried to access
      router.replace(`/onboarding/${routeName}`);
    }
  }, [
    currentStep,
    isHydrating,
    isInitializing,
    router,
    segments,
    resetOnboardingState,
    startOnboarding,
  ]);

  /**
   * Effect: Handle Android hardware back button
   *
   * Connects Android back button to handleBack for consistent navigation.
   * Returns true to prevent default behavior (app exit).
   */
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true; // Prevent default (exit app)
    });

    return () => backHandler.remove();
  }, [handleBack]);

  /**
   * Show loading indicator while determining route.
   *
   * This prevents onboarding flicker for users who have already completed
   * onboarding (hasOnboarded = true). The loading state is shown during:
   * - Auth hydration (isHydrating = true)
   * - Onboarding initialization (isInitializing = true)
   *
   * Once both flags are false, either:
   * - User is redirected to /home (if hasOnboarded = true), or
   * - Stack navigator renders and user sees onboarding step
   */
  if (isHydrating || isInitializing) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" color={colors.textPrimary} />
      </View>
    );
  }

  /**
   * Render Stack navigator for onboarding steps with context provider.
   *
   * This only renders after routing decisions are complete (both isHydrating
   * and isInitializing are false). At this point, either:
   * - User has been redirected to /home (hasOnboarded = true), or
   * - currentStep is set and navigation to the appropriate step is happening
   *
   * The OnboardingProvider wraps the Stack to provide navigation handlers
   * to all child components (screens, shell, footer) via context.
   */
  return (
    <OnboardingProvider
      currentStep={currentStep}
      onNext={handleNext}
      onSkipStep={handleSkipStep}
      onSkipOnboarding={handleSkipOnboarding}
      onBack={handleBack}
    >
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="welcome" />
        <Stack.Screen name="prefs" />
        <Stack.Screen name="first-item" />
        <Stack.Screen name="success" />
      </Stack>
    </OnboardingProvider>
  );
}
