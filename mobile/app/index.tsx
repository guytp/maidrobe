import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useStore } from '../src/core/state/store';
import { trackOnboardingGateEvent } from '../src/core/telemetry';
import { checkFeatureFlagSync } from '../src/core/featureFlags';

/**
 * Root entry point for the application.
 *
 * HYDRATION LIFECYCLE:
 * This component coordinates with the auth restore pipeline (restoreAuthStateOnLaunch)
 * triggered in _layout.tsx. The restore pipeline runs asynchronously on cold start,
 * loading the session from SecureStore, validating it, and attempting refresh if needed.
 * To avoid incorrectly redirecting before this completes, we wait for the isHydrating
 * flag to become false.
 *
 * Hydration Flow:
 * 1. App mounts, restoreAuthStateOnLaunch() starts in _layout.tsx
 * 2. This component renders with isHydrating=true
 * 3. Shows neutral loading spinner while waiting for hydration
 * 4. Restore pipeline completes (success or failure)
 * 5. Pipeline sets isHydrating=false
 * 6. This component re-renders with hydrated state
 * 7. Calls deriveRoute() to determine target route based on auth state
 * 8. Redirects to appropriate route: /auth/login, /auth/verify, or /home
 *
 * Why isHydrating instead of isInitialized:
 * - isHydrating specifically tracks the cold-start restore pipeline
 * - Prevents premature navigation before session is loaded from SecureStore
 * - Prevents flash of incorrect screen (e.g., login screen for authenticated user)
 * - Runtime auth changes (login, logout) don't set isHydrating
 *
 * Why deriveRoute() instead of manual checks:
 * - Single source of truth for routing logic (defined in authRouting.ts)
 * - Same logic used by useProtectedRoute for in-app route guards
 * - Prevents divergence between launch-time and runtime routing
 * - Easier to test and reason about
 *
 * Redirect logic (after hydration):
 * - deriveRoute() returns 'login' -> /auth/login
 *   - No authenticated user
 *   - Session expired messages displayed via SessionExpiredBanner
 *   - New users can navigate to signup from login screen
 * - deriveRoute() returns 'verify' -> /auth/verify
 *   - Authenticated user but email not verified
 * - deriveRoute() returns 'onboarding' -> /onboarding/welcome
 *   - Authenticated and verified user who hasn't completed onboarding
 *   - Only if onboarding gate feature flag is enabled
 * - deriveRoute() returns 'home' -> /home
 *   - Authenticated user with verified email and completed onboarding
 *   - OR onboarding gate feature flag is disabled
 *
 * Navigation Semantics:
 * - Uses <Redirect> which replaces the current route in the stack
 * - Prevents back navigation to this loading screen
 * - User cannot navigate back from Login/Verify/Home to see loading spinner
 *
 * Error Handling:
 * - If restore pipeline fails, isHydrating still becomes false
 * - deriveRoute() returns 'login' for unauthenticated state
 * - SessionExpiredBanner shows reason if logoutReason is set
 *
 * @returns Loading spinner during hydration, or Redirect to appropriate route
 */
export default function Index(): React.JSX.Element {
  const isHydrating = useStore((state) => state.isHydrating);
  const deriveRoute = useStore((state) => state.deriveRoute);
  const user = useStore((state) => state.user);

  // Show loading state while auth is hydrating
  // This prevents premature redirects before we know if a valid session exists
  if (isHydrating) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Loading application"
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#000000',
        }}
      >
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  // Hydration complete - derive target route from auth state
  // This uses the centralized routing logic shared with useProtectedRoute
  // The deriveRoute() function now considers:
  // - isAuthenticated: whether user has valid session
  // - isVerified: whether user's email is verified
  // - hasOnboarded: whether user completed onboarding flow
  // - onboardingGateEnabled: whether onboarding gate feature is enabled
  const targetRoute = deriveRoute();

  // Get onboarding gate state for analytics
  const onboardingGateResult = checkFeatureFlagSync('onboarding.gate');
  const hasOnboarded = user?.hasOnboarded ?? false;

  // Track onboarding gate evaluation
  // This event is emitted every time the gate is shown (app launch)
  // It provides visibility into routing decisions and feature flag state
  if (targetRoute === 'onboarding' || targetRoute === 'home') {
    trackOnboardingGateEvent('onboarding_gate.shown', {
      userId: user?.id,
      hasOnboarded,
      gateEnabled: onboardingGateResult.enabled,
      route: targetRoute === 'onboarding' ? 'onboarding' : 'home',
    });
  }

  if (targetRoute === 'login') {
    return <Redirect href="/auth/login" />;
  }

  if (targetRoute === 'verify') {
    return <Redirect href="/auth/verify" />;
  }

  if (targetRoute === 'onboarding') {
    // Track routing decision to onboarding
    trackOnboardingGateEvent('onboarding_gate.route_onboarding', {
      userId: user?.id,
      hasOnboarded,
      gateEnabled: onboardingGateResult.enabled,
      route: 'onboarding',
    });
    return <Redirect href="/onboarding/welcome" />;
  }

  // Track routing decision to home (if onboarding gate was relevant)
  if (onboardingGateResult.enabled) {
    trackOnboardingGateEvent('onboarding_gate.route_home', {
      userId: user?.id,
      hasOnboarded,
      gateEnabled: onboardingGateResult.enabled,
      route: 'home',
    });
  }

  return <Redirect href="/home" />;
}
