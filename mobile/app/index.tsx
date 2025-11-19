import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useStore } from '../src/core/state/store';
import { trackOnboardingGateEvent } from '../src/core/telemetry';
import { checkFeatureFlagSync } from '../src/core/featureFlags';

/**
 * Root entry point for the application - Central Routing Gate.
 *
 * This component serves as the single decision point for all post-launch and
 * post-login navigation flows. It ensures users are routed to the correct
 * screen based on their authentication state, email verification status, and
 * onboarding completion status.
 *
 * GATE DECISION FLOW:
 * 1. Wait for auth hydration to complete (isHydrating === false)
 * 2. Determine user state: unauthenticated, authenticated-but-unverified, or authenticated-and-verified
 * 3. Check onboarding.gate feature flag state
 * 4. Read hasOnboarded from profile data (populated during auth restore)
 * 5. Route to appropriate destination:
 *    - Unauthenticated -> /auth/login
 *    - Authenticated but unverified -> /auth/verify
 *    - Authenticated, verified, not onboarded (gate enabled) -> /onboarding/welcome
 *    - Authenticated, verified, onboarded (or gate disabled) -> /home
 * 6. Display neutral loading UI during resolution
 * 7. Emit analytics events for gate decisions
 *
 * HYDRATION LIFECYCLE:
 * This component coordinates with the auth restore pipeline (restoreAuthStateOnLaunch)
 * triggered in _layout.tsx. The restore pipeline runs asynchronously on cold start,
 * loading the session from SecureStore, validating it, attempting refresh if needed,
 * and fetching the user profile (including hasOnboarded flag).
 *
 * Hydration Flow:
 * 1. App mounts, restoreAuthStateOnLaunch() starts in _layout.tsx
 * 2. This component renders with isHydrating=true
 * 3. Shows neutral loading spinner while waiting for hydration
 * 4. Restore pipeline completes (success or failure):
 *    - Fetches user profile with hasOnboarded flag
 *    - Handles network errors with retry logic and fallbacks
 *    - Populates Zustand store with user state
 * 5. Pipeline sets isHydrating=false
 * 6. This component re-renders with hydrated state
 * 7. Calls deriveRoute() to determine target route based on auth state
 * 8. Redirects to appropriate route based on decision flow
 *
 * Why isHydrating instead of isInitialized:
 * - isHydrating specifically tracks the cold-start restore pipeline
 * - Prevents premature navigation before session is loaded from SecureStore
 * - Prevents flash of incorrect screen (e.g., login screen for authenticated user)
 * - Runtime auth changes (login, logout) don't set isHydrating
 *
 * Why deriveRoute() instead of manual checks:
 * - Single source of truth for routing logic (defined in authRouting.ts)
 * - Integrates onboarding gate logic with feature flag check
 * - Same logic used by useProtectedRoute for in-app route guards
 * - Prevents divergence between launch-time and runtime routing
 * - Easier to test and reason about
 * - Already handles hasOnboarded from user state
 *
 * ONBOARDING GATE INTEGRATION:
 * The deriveRoute() function (sessionSlice.deriveRoute) checks:
 * - onboarding.gate feature flag via checkFeatureFlagSync()
 * - user.hasOnboarded from profile data
 * - Returns 'onboarding' for users who need onboarding
 * - Returns 'home' for users who completed onboarding or when gate is disabled
 *
 * PROFILE DATA HANDLING:
 * The hasOnboarded flag is populated during auth restore with robust error handling:
 * - Primary: Fetched from public.profiles via fetchProfile()
 * - Fallback 1: Retry with exponential backoff for existing users
 * - Fallback 2: Use cached value from session bundle (offline resilience)
 * - Fallback 3: Default to false for brand new users
 * - All errors logged via structured telemetry
 *
 * This ensures the gate always has hasOnboarded data available, even in
 * degraded network conditions. The gate does not need additional profile
 * fetching or error handling - it relies on auth restore guarantees.
 *
 * ROUTE MAPPING:
 * - deriveRoute() returns 'login' -> /auth/login
 *   - No authenticated user
 *   - Session expired messages displayed via SessionExpiredBanner
 *   - New users can navigate to signup from login screen
 * - deriveRoute() returns 'verify' -> /auth/verify
 *   - Authenticated user but email not verified
 * - deriveRoute() returns 'onboarding' -> /onboarding/welcome
 *   - Authenticated and verified user who hasn't completed onboarding
 *   - Only if onboarding.gate feature flag is enabled
 *   - hasOnboarded === false from profile
 * - deriveRoute() returns 'home' -> /home
 *   - Authenticated user with verified email and completed onboarding
 *   - OR onboarding gate feature flag is disabled (skip onboarding)
 *
 * NAVIGATION SEMANTICS:
 * - Uses <Redirect> which replaces the current route in the stack
 * - Prevents back navigation to this loading screen
 * - User cannot navigate back from Login/Verify/Onboarding/Home to see loading spinner
 * - Single navigation call per render (no loops)
 *
 * ANALYTICS INTEGRATION:
 * Emits three key events for onboarding gate observability:
 * 1. onboarding_gate.shown - When gate evaluates and has routing decision
 * 2. onboarding_gate.route_onboarding - When routing to onboarding flow
 * 3. onboarding_gate.route_home - When routing to home (skipping onboarding)
 *
 * Events include metadata: userId, hasOnboarded, gateEnabled, route
 * No PII is logged (only user IDs and boolean flags)
 *
 * ERROR HANDLING:
 * - If restore pipeline fails, isHydrating still becomes false
 * - deriveRoute() returns 'login' for unauthenticated state
 * - SessionExpiredBanner shows reason if logoutReason is set
 * - Profile fetch failures are handled in auth restore with fallbacks
 * - No explicit error/retry UI needed in gate (restore handles it)
 *
 * FEATURE FLAG BEHAVIOR:
 * - onboarding.gate enabled: Route based on hasOnboarded flag
 * - onboarding.gate disabled: Always route to home (skip onboarding)
 * - Flag checked synchronously via checkFeatureFlagSync()
 * - Defaults to enabled if flag system unavailable (fail-safe)
 *
 * OFFLINE RESILIENCE:
 * - Auth restore uses multi-tier fallback for hasOnboarded
 * - Cached session bundle includes hasOnboarded from last online session
 * - Offline users can cold start and route correctly
 * - No network dependency for gate decision (uses cached data)
 *
 * STATE PRECEDENCE:
 * - Server profile data is authoritative (fetched during restore)
 * - Cached bundle data used as fallback (offline scenarios)
 * - Local onboarding state cleared if hasOnboarded=true from server
 * - Prevents routing loops or stale state issues
 *
 * ACCEPTANCE CRITERIA COVERAGE:
 * - AC2: Post-login and session-restore routing uses hasOnboarded
 * - AC5: State precedence (server truth wins)
 * - AC6: Analytics hook points (three events emitted)
 * - AC7: Feature flag behavior (gate can be toggled)
 *
 * @returns Loading spinner during hydration, or Redirect to appropriate route
 */
export default function Index(): React.JSX.Element {
  const isHydrating = useStore((state) => state.isHydrating);
  const deriveRoute = useStore((state) => state.deriveRoute);
  const user = useStore((state) => state.user);

  // Show loading state while auth is hydrating
  // This prevents premature redirects before we know if a valid session exists
  // and before hasOnboarded flag is populated from profile data
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
  // The deriveRoute() function (defined in sessionSlice) considers:
  // - isAuthenticated: whether user has valid session
  // - isVerified: whether user's email is verified
  // - hasOnboarded: whether user completed onboarding flow (from profile)
  // - onboardingGateEnabled: whether onboarding.gate feature flag is enabled
  //
  // The deriveRoute() implementation calls deriveInitialRouteFromAuthState()
  // from authRouting.ts with the current auth state, ensuring consistent
  // routing decisions across the app.
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
