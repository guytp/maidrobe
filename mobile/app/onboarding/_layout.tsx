import { Stack, useRouter, useSegments } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useStore } from '../../src/core/state/store';
import { OnboardingStep } from '../../src/features/onboarding';
import { useTheme } from '../../src/core/theme';

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
  const startOnboarding = useStore((state) => state.startOnboarding);
  const resetOnboardingState = useStore((state) => state.resetOnboardingState);

  // Local initialization state
  const [isInitializing, setIsInitializing] = useState(true);

  /**
   * Effect: Handle hasOnboarded gate and onboarding initialization
   *
   * This effect runs once after auth hydration completes. It checks the
   * hasOnboarded flag and either redirects to home or initializes/resumes
   * onboarding based on persisted state.
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
    }

    // Mark initialization as complete
    // Navigation will happen in the second effect when currentStep is set
    setIsInitializing(false);
  }, [isHydrating, user, currentStep, startOnboarding, resetOnboardingState, router]);

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
      // but handle gracefully by resetting
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
  }, [currentStep, isHydrating, isInitializing, router, segments, resetOnboardingState, startOnboarding]);

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
   * Render Stack navigator for onboarding steps.
   *
   * This only renders after routing decisions are complete (both isHydrating
   * and isInitializing are false). At this point, either:
   * - User has been redirected to /home (hasOnboarded = true), or
   * - currentStep is set and navigation to the appropriate step is happening
   */
  return (
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
  );
}
