import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useStore } from '../../../core/state/store';

/**
 * Onboarding route protection hook.
 *
 * This hook ensures that only authenticated users can access onboarding routes.
 * It does not check hasOnboarded or onboarding completion status yet, as that
 * will be implemented in later steps when the onboarding gate from story #95
 * is integrated.
 *
 * Routing Strategy:
 * - If user is not authenticated, redirect to /auth/login
 * - If user is authenticated, allow access to onboarding routes
 * - The onboarding shell (_layout.tsx) will later add logic to check hasOnboarded
 *   and redirect to home if onboarding is already complete
 *
 * Hydration Coordination:
 * The hook waits for the isHydrating flag to become false before redirecting.
 * This prevents race conditions where the hook might redirect before auth state
 * is fully loaded from SecureStore at cold start.
 *
 * Usage:
 * Call this hook at the top of any onboarding route component or in the
 * onboarding _layout.tsx. The hook returns true when authorized, false otherwise.
 * Render loading state while unauthorized.
 *
 * @returns boolean - true if user is authorized (authenticated), false otherwise
 *
 * @example
 * ```typescript
 * export default function OnboardingScreen() {
 *   const isAuthorized = useOnboardingProtection();
 *
 *   if (!isAuthorized) {
 *     return <ActivityIndicator />;
 *   }
 *
 *   return <View>Onboarding content</View>;
 * }
 * ```
 */
export function useOnboardingProtection(): boolean {
  const router = useRouter();
  const segments = useSegments();
  const isHydrating = useStore((state) => state.isHydrating);
  const isAuthenticated = useStore((state) => state.isAuthenticated);

  useEffect(() => {
    // Wait for auth hydration to complete before making redirect decisions
    if (isHydrating) {
      return;
    }

    // Get current path for redirect loop prevention
    const currentPath = segments.join('/');

    // Redirect unauthenticated users to login
    if (!isAuthenticated) {
      // Avoid redirect loop if already navigating to auth routes
      if (!currentPath.startsWith('auth/login') && !currentPath.startsWith('auth/signup')) {
        router.replace('/auth/login');
      }
      return;
    }

    // User is authenticated - allow access to onboarding
    // Note: Later steps will add hasOnboarded check here to redirect to home
    // if onboarding is already complete
  }, [isAuthenticated, segments, router, isHydrating]);

  // Return authorization status
  if (isHydrating) {
    return false; // Still hydrating, not yet authorized
  }

  return isAuthenticated;
}
