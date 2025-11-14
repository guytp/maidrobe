import { useEffect, useRef } from 'react';
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
  const setInitialized = useStore((state) => state.setInitialized);
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
          // Mark as initialized even on error to prevent indefinite waiting
          setInitialized(true);
          return;
        }

        if (data.session?.user) {
          const user = data.session.user;
          setUser({
            id: user.id,
            email: user.email || '',
            emailVerified: !!user.email_confirmed_at,
          });

          // Store token metadata (expiry time and type) - NOT the actual tokens
          // SECURITY: Tokens are stored encrypted in SecureStore by Supabase client
          // We only store metadata for proactive refresh scheduling
          //
          // Token expiry derivation strategy (three-tier fallback):
          // 1. Use session.expires_at if provided (absolute timestamp in seconds)
          // 2. Calculate from session.expires_in if provided (relative seconds)
          // 3. Fall back to 3600 seconds (1 hour) if neither provided
          //
          // This ensures the proactive refresh system always has valid metadata,
          // even when Supabase events don't include expires_at.
          let expiresAt: number;
          let fallbackUsed = 'none';
          if (data.session.expires_at) {
            // Supabase provides expires_at as unix timestamp in seconds
            // Convert to milliseconds for JavaScript Date
            expiresAt = data.session.expires_at * 1000;
          } else if (data.session.expires_in) {
            // Calculate absolute expiry from relative expires_in (seconds)
            expiresAt = Date.now() + data.session.expires_in * 1000;
            fallbackUsed = 'expires_in';
          } else {
            // Fallback: Default to 1 hour (3600 seconds) - Supabase standard
            expiresAt = Date.now() + 3600 * 1000;
            fallbackUsed = 'default_ttl';
          }
          const tokenType = data.session.token_type || 'bearer';
          setTokenMetadata(expiresAt, tokenType);

          // SECURITY: Do NOT log the session object - it contains tokens
          // eslint-disable-next-line no-console
          console.log('[Auth] Initial session loaded', {
            userId: user.id,
            emailVerified: !!user.email_confirmed_at,
            tokenMetadata: { expiresAt, tokenType, fallbackUsed },
            // Note: session object is [REDACTED] - contains sensitive tokens
          });
        }

        // Mark auth initialization as complete
        setInitialized(true);
      } catch (error) {
        logError(error instanceof Error ? error : new Error('Unknown error'), 'server', {
          feature: 'auth',
          operation: 'initialize-auth',
        });
        // Mark as initialized even on error to prevent indefinite waiting
        setInitialized(true);
      }
    };

    // Initialize auth state
    initializeAuth();

    // Subscribe to auth state changes
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
            //
            // Token expiry derivation strategy (three-tier fallback):
            // 1. Use session.expires_at if provided (absolute timestamp in seconds)
            // 2. Calculate from session.expires_in if provided (relative seconds)
            // 3. Fall back to 3600 seconds (1 hour) if neither provided
            //
            // This ensures the proactive refresh system always has valid metadata,
            // even when Supabase events don't include expires_at.
            let expiresAt: number;
            let fallbackUsed = 'none';
            if (session.expires_at) {
              // Supabase provides expires_at as unix timestamp in seconds
              // Convert to milliseconds for JavaScript Date
              expiresAt = session.expires_at * 1000;
            } else if (session.expires_in) {
              // Calculate absolute expiry from relative expires_in (seconds)
              expiresAt = Date.now() + session.expires_in * 1000;
              fallbackUsed = 'expires_in';
            } else {
              // Fallback: Default to 1 hour (3600 seconds) - Supabase standard
              expiresAt = Date.now() + 3600 * 1000;
              fallbackUsed = 'default_ttl';
            }
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
  }, [setUser, clearUser, setInitialized, setTokenMetadata]);
}
