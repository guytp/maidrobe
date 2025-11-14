import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useStore } from '../../../core/state/store';

/**
 * Protected route guard hook.
 *
 * This hook enforces authentication and email verification requirements for protected routes.
 * It checks the current user state and redirects unauthorized users to appropriate auth screens.
 *
 * Redirect logic:
 * - No user -> /auth/login (where users can sign in or navigate to signup)
 * - User exists but email not verified -> /auth/verify
 * - User exists and email verified -> allow access
 *
 * The redirect to /auth/login (rather than /auth/signup) is intentional:
 * - Returning users can immediately sign in
 * - Session expired messages are displayed on the login screen
 * - New users can navigate to signup from login screen
 * - Aligns with the root redirect behavior in app/index.tsx
 *
 * Features:
 * - Prevents redirect loops by checking current route
 * - Uses router.replace to prevent back button to protected routes
 * - Handles deep link scenarios
 * - Waits for auth initialization before making redirect decisions
 *
 * Initialization coordination:
 * The hook waits for isInitialized flag from the store before redirecting.
 * This flag is set by useAuthStateListener after initial session fetch completes,
 * preventing race conditions where the hook might redirect before auth state loads.
 *
 * Usage:
 * Call this hook at the top of any protected route component.
 * The hook returns true when authorized, false otherwise.
 * Render loading state or null while unauthorized.
 *
 * @returns boolean - true if user is authorized, false if redirecting or initializing
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
  const user = useStore((state) => state.user);
  const isInitialized = useStore((state) => state.isInitialized);

  useEffect(() => {
    // Wait for auth initialization to complete before making redirect decisions
    // This prevents race conditions where we might redirect before initial session loads
    if (!isInitialized) {
      return;
    }

    // Get current route segments
    const inAuthGroup = segments[0] === 'auth';

    // If no user, redirect to login (unless already on auth screen)
    if (!user) {
      if (!inAuthGroup) {
        // eslint-disable-next-line no-console
        console.log('[AuthGuard] No user found, redirecting to login');
        router.replace('/auth/login');
      }
      return;
    }

    // If user exists but email not verified, redirect to verify (unless already there)
    if (!user.emailVerified) {
      const onVerifyScreen = segments.includes('verify');
      if (!onVerifyScreen) {
        // eslint-disable-next-line no-console
        console.log('[AuthGuard] Email not verified, redirecting to verify');
        router.replace('/auth/verify');
      }
      return;
    }

    // User is authenticated and verified - allow access
    // eslint-disable-next-line no-console
    console.log('[AuthGuard] User authorized');
  }, [user, segments, router, isInitialized]);

  // Return authorization status
  if (!isInitialized) {
    return false; // Still initializing
  }

  if (!user) {
    return false; // Not authenticated
  }

  if (!user.emailVerified) {
    return false; // Not verified
  }

  return true; // Authorized
}
