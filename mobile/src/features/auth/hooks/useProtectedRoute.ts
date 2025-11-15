import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useStore } from '../../../core/state/store';

/**
 * Protected route guard hook.
 *
 * This hook enforces authentication and email verification requirements for protected routes.
 * It uses the centralized routing logic from the auth store to determine where users should
 * be redirected, ensuring consistency with launch-time routing and preventing divergence.
 *
 * Routing Strategy:
 * - Delegates routing decisions to store.deriveRoute()
 * - deriveRoute() uses deriveInitialRouteFromAuthState from authRouting.ts
 * - Single source of truth for all routing logic
 * - No duplication of authentication/verification checks
 *
 * Route Mappings:
 * - 'login' -> /auth/login (unauthenticated users)
 * - 'verify' -> /auth/verify (authenticated but unverified users)
 * - 'home' -> allow access (authenticated and verified users)
 *
 * The redirect to /auth/login (rather than /auth/signup) is intentional:
 * - Returning users can immediately sign in
 * - Session expired messages are displayed on the login screen
 * - New users can navigate to signup from login screen
 * - Aligns with launch-time routing behavior in app/index.tsx
 *
 * Features:
 * - Prevents redirect loops by checking current route
 * - Uses router.replace to prevent back button to protected routes
 * - Handles deep link scenarios
 * - Waits for auth hydration before making redirect decisions
 *
 * Hydration Coordination:
 * The hook waits for isHydrating flag to become false before redirecting.
 * This flag is set by the auth restore pipeline (restoreAuthStateOnLaunch)
 * and prevents race conditions where the hook might redirect before auth
 * state is fully loaded from SecureStore at cold start.
 *
 * Integration with Step 5:
 * This hook uses the same routing logic as launch-time navigation, ensuring
 * that in-app route protection and cold-start navigation produce identical
 * results for any given auth state. Changes to routing rules in authRouting.ts
 * automatically apply to both launch-time and in-app routing.
 *
 * Usage:
 * Call this hook at the top of any protected route component.
 * The hook returns true when authorized, false otherwise.
 * Render loading state or null while unauthorized.
 *
 * @returns boolean - true if user is authorized (route === 'home'), false otherwise
 *
 * @example
 * ```typescript
 * export default function ProtectedScreen() {
 *   const isAuthorized = useProtectedRoute();
 *
 *   if (!isAuthorized) {
 *     return null;
 *   }
 *
 *   return <View>Protected content</View>;
 * }
 * ```
 */
export function useProtectedRoute(): boolean {
  const router = useRouter();
  const segments = useSegments();
  const isHydrating = useStore((state) => state.isHydrating);
  const deriveRoute = useStore((state) => state.deriveRoute);

  useEffect(() => {
    // Wait for auth hydration to complete before making redirect decisions
    // This prevents race conditions where we might redirect before auth state
    // is restored from SecureStore at cold start
    if (isHydrating) {
      return;
    }

    // Use centralized routing logic to determine required route
    // This delegates to deriveInitialRouteFromAuthState in authRouting.ts
    const requiredRoute = deriveRoute();

    // Get current path for redirect loop prevention
    const currentPath = segments.join('/');

    // Redirect based on required route, avoiding loops
    if (requiredRoute === 'login') {
      // User is unauthenticated, redirect to login unless already there
      if (!currentPath.startsWith('auth/login') && !currentPath.startsWith('auth/signup')) {
        // eslint-disable-next-line no-console
        console.log('[AuthGuard] User unauthenticated, redirecting to login');
        router.replace('/auth/login');
      }
      return;
    }

    if (requiredRoute === 'verify') {
      // User is authenticated but unverified, redirect to verify unless already there
      if (!currentPath.includes('verify')) {
        // eslint-disable-next-line no-console
        console.log('[AuthGuard] Email not verified, redirecting to verify');
        router.replace('/auth/verify');
      }
      return;
    }

    // requiredRoute === 'home'
    // User is authenticated and verified - allow access
    // eslint-disable-next-line no-console
    console.log('[AuthGuard] User authorized');
  }, [deriveRoute, segments, router, isHydrating]);

  // Return authorization status based on centralized routing logic
  // User is authorized only when deriveRoute() returns 'home'
  if (isHydrating) {
    return false; // Still hydrating, not yet authorized
  }

  const requiredRoute = deriveRoute();
  return requiredRoute === 'home';
}
