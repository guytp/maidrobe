import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { supabase } from '../../../services/supabase';
import { useStore } from '../../../core/state/store';
import { logError } from '../../../core/telemetry';

/**
 * Global auth state listener hook.
 *
 * This hook subscribes to Supabase auth state changes and:
 * - Syncs auth state with the local Zustand store
 * - Updates emailVerified status when user confirms email
 * - Refreshes session to get latest user data
 * - Navigates from verification screen to home when verified
 * - Handles sign out by clearing local state
 * - Fetches initial session on mount
 *
 * Should be called once at app root level (_layout.tsx).
 *
 * Events handled:
 * - SIGNED_IN: User signs in
 * - SIGNED_OUT: User signs out
 * - USER_UPDATED: User data changed (email verified)
 * - TOKEN_REFRESHED: Token refreshed
 *
 * Navigation rules:
 * - Only navigates when on /auth/verify screen
 * - Navigates to /home when email is verified
 * - Uses router.replace to prevent back navigation
 *
 * @example
 * ```typescript
 * // In app/_layout.tsx
 * export default function RootLayout() {
 *   useAuthStateListener();
 *   return <Stack />;
 * }
 * ```
 */
export function useAuthStateListener() {
  const router = useRouter();
  const segments = useSegments();
  const setUser = useStore((state) => state.setUser);
  const clearUser = useStore((state) => state.clearUser);

  useEffect(() => {
    // Fetch initial session on mount
    const initializeAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          logError(error, 'server', {
            feature: 'auth',
            operation: 'get-session',
            metadata: { message: error.message },
          });
          return;
        }

        if (data.session?.user) {
          const user = data.session.user;
          setUser({
            id: user.id,
            email: user.email || '',
            emailVerified: !!user.email_confirmed_at,
          });

          // eslint-disable-next-line no-console
          console.log('[Auth] Initial session loaded', {
            userId: user.id,
            emailVerified: !!user.email_confirmed_at,
          });
        }
      } catch (error) {
        logError(error instanceof Error ? error : new Error('Unknown error'), 'server', {
          feature: 'auth',
          operation: 'initialize-auth',
        });
      }
    };

    // Initialize auth state
    initializeAuth();

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // eslint-disable-next-line no-console
      console.log('[Auth] State change:', event, {
        hasSession: !!session,
        emailConfirmed: !!session?.user?.email_confirmed_at,
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
              const isOnVerifyScreen = segments.includes('verify');
              if (isOnVerifyScreen) {
                // eslint-disable-next-line no-console
                console.log('[Auth] Navigating from verify screen to home');
                router.replace('/home');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - run once on mount
}
