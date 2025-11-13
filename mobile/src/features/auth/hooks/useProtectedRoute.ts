import { useEffect, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useStore } from '../../../core/state/store';

/**
 * Protected route guard hook.
 *
 * This hook enforces authentication and email verification requirements for protected routes.
 * It checks the current user state and redirects unauthorized users to appropriate auth screens.
 *
 * Redirect logic:
 * - No user -> /auth/signup
 * - User exists but email not verified -> /auth/verify
 * - User exists and email verified -> allow access
 *
 * Features:
 * - Prevents redirect loops by checking current route
 * - Uses router.replace to prevent back button to protected routes
 * - Handles deep link scenarios
 * - Includes loading state to prevent flash of redirect
 *
 * Usage:
 * Call this hook at the top of any protected route component.
 * The hook returns true when authorized, false otherwise.
 * Render loading state or null while unauthorized.
 *
 * @returns boolean - true if user is authorized, false if redirecting
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
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Allow one tick for store to initialize
    const timer = setTimeout(() => {
      setIsChecking(false);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Don't redirect while still checking initial state
    if (isChecking) {
      return;
    }

    // Get current route segments
    const inAuthGroup = segments[0] === 'auth';

    // If no user, redirect to signup (unless already on auth screen)
    if (!user) {
      if (!inAuthGroup) {
        // eslint-disable-next-line no-console
        console.log('[AuthGuard] No user found, redirecting to signup');
        router.replace('/auth/signup');
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
  }, [user, segments, router, isChecking]);

  // Return authorization status
  if (isChecking) {
    return false; // Still checking
  }

  if (!user) {
    return false; // Not authenticated
  }

  if (!user.emailVerified) {
    return false; // Not verified
  }

  return true; // Authorized
}
