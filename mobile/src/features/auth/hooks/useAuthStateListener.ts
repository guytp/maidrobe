import { useEffect, useRef } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { supabase } from '../../../services/supabase';
import { useStore } from '../../../core/state/store';
import { logError } from '../../../core/telemetry';
import { deriveTokenExpiry } from '../utils/tokenExpiry';

/**
 * Global auth state listener hook.
 *
 * This hook subscribes to Supabase auth state changes and:
 * - Syncs runtime auth state changes with the local Zustand store
 * - Updates emailVerified status when user confirms email
 * - Refreshes session to get latest user data
 * - Navigates from verification screen to home when verified
 * - Handles sign out by clearing local state
 *
 * Should be called once at app root level (_layout.tsx).
 *
 * IMPORTANT: This hook handles RUNTIME auth changes only.
 * Cold-start session restoration is handled by restoreAuthStateOnLaunch() in _layout.tsx.
 * This separation prevents duplicate session fetches and race conditions.
 *
 * Events handled:
 * - SIGNED_IN: User signs in (via login/signup forms)
 * - SIGNED_OUT: User signs out (via logout button)
 * - USER_UPDATED: User data changed (email verified via confirmation link)
 * - TOKEN_REFRESHED: Token refreshed (background refresh or manual)
 *
 * Navigation rules:
 * - Only navigates when on /auth/verify screen
 * - Navigates to /home when email is verified
 * - Uses router.replace to prevent back navigation
 *
 * Implementation notes:
 * - Effect runs once on mount and sets up persistent subscription
 * - router and segments accessed via refs to get current values
 * - Refs updated on every render to ensure navigation uses latest route state
 * - Prevents effect re-runs while allowing access to current router/segments
 * - Zustand store actions (setUser, clearUser) are stable and safe in deps
 *
 * Edge cases handled:
 * - Route changes during auth state transition: refs ensure current route checked
 * - Component unmount: subscription cleanup prevents memory leaks
 * - Multiple rapid auth changes: each handled with current route state
 * - Navigation during listener active: refs provide latest router reference
 *
 * @example
 * ```typescript
 * // In app/_layout.tsx
 * export default function RootLayout() {
 *   // Cold-start restore pipeline
 *   useEffect(() => {
 *     restoreAuthStateOnLaunch();
 *   }, []);
 *
 *   // Runtime auth state listener
 *   useAuthStateListener();
 *
 *   return <Stack />;
 * }
 * ```
 */
export function useAuthStateListener() {
  const router = useRouter();
  const segments = useSegments();
  const setUser = useStore((state) => state.setUser);
  const clearUser = useStore((state) => state.clearUser);
  const setTokenMetadata = useStore((state) => state.setTokenMetadata);

  // Use refs to store latest router and segments values
  // This allows the effect to access current values without re-running
  const routerRef = useRef(router);
  const segmentsRef = useRef(segments);

  // Update refs on every render to ensure they're current
  useEffect(() => {
    routerRef.current = router;
    segmentsRef.current = segments;
  });

  useEffect(() => {
    // Subscribe to runtime auth state changes
    // Note: Initial session load on cold start is handled by restoreAuthStateOnLaunch()
    // in _layout.tsx to prevent duplicate fetches and race conditions
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // SECURITY: Do NOT log the session object - it contains tokens
      // eslint-disable-next-line no-console
      console.log('[Auth] State change:', event, {
        hasSession: !!session,
        emailConfirmed: !!session?.user?.email_confirmed_at,
        // Note: session object is [REDACTED] - contains sensitive tokens
      });

      try {
        // Handle sign in and user updates
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            const user = session.user;
            const isEmailVerified = !!user.email_confirmed_at;

            // Update user in store
            setUser({
              id: user.id,
              email: user.email || '',
              emailVerified: isEmailVerified,
            });

            // Update token metadata when tokens are refreshed
            // SECURITY: We only store metadata (expiry time), NOT the tokens themselves
            const { expiresAt, fallbackUsed } = deriveTokenExpiry(session);
            const tokenType = session.token_type || 'bearer';
            setTokenMetadata(expiresAt, tokenType);

            // Log token metadata for observability (helps debug refresh issues)
            if (fallbackUsed !== 'none') {
              // eslint-disable-next-line no-console
              console.log('[Auth] Token metadata fallback used', {
                event,
                fallbackUsed,
                expiresAt,
                tokenType,
              });
            }

            // If email was just verified, refresh session and navigate
            if (isEmailVerified && event === 'USER_UPDATED') {
              // eslint-disable-next-line no-console
              console.log('[Auth] Email verified, refreshing session');

              // Refresh session to ensure we have latest data
              const { error: refreshError } = await supabase.auth.refreshSession();
              if (refreshError) {
                logError(refreshError, 'server', {
                  feature: 'auth',
                  operation: 'refresh-session',
                  metadata: { event },
                });
              }

              // Navigate to home if currently on verify screen
              // Use ref to access current segments without effect re-running
              const isOnVerifyScreen = segmentsRef.current.includes('verify');
              if (isOnVerifyScreen) {
                // eslint-disable-next-line no-console
                console.log('[Auth] Navigating from verify screen to home');
                // Use ref to access current router without effect re-running
                routerRef.current.replace('/home');
              }

              // Log telemetry
              // eslint-disable-next-line no-console
              console.log('[Telemetry]', {
                feature: 'auth',
                operation: 'email-verified',
                metadata: {
                  userId: user.id,
                  navigated: isOnVerifyScreen,
                },
              });
            }
          }
        }

        // Handle sign out
        if (event === 'SIGNED_OUT') {
          // eslint-disable-next-line no-console
          console.log('[Auth] User signed out, clearing store');
          clearUser();
        }
      } catch (error) {
        logError(error instanceof Error ? error : new Error('Unknown error'), 'server', {
          feature: 'auth',
          operation: 'auth-state-change',
          metadata: { event },
        });
      }
    });

    // Cleanup subscription on unmount
    return () => {
      // eslint-disable-next-line no-console
      console.log('[Auth] Unsubscribing from auth state changes');
      subscription.unsubscribe();
    };
    // Stable Zustand store actions - don't cause re-runs
    // router and segments accessed via refs to get current values
  }, [setUser, clearUser, setTokenMetadata]);
}
