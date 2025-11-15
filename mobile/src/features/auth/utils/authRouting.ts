/**
 * Auth-based routing logic for launch-time navigation and route protection.
 *
 * This module provides a pure, deterministic function that maps normalized
 * auth state (from the Zustand store) to route descriptors. It serves as the
 * single source of truth for all auth-based navigation decisions, ensuring
 * consistent routing behavior across:
 * - Cold start / app launch (Step 5 integration)
 * - Route protection hooks (Story #7)
 * - Deep link handling
 * - Session state changes
 *
 * ## Design Principles
 *
 * 1. **Pure Function**: No side effects, deterministic output
 * 2. **Normalized Inputs**: Operates on boolean flags only, not Supabase types
 * 3. **Single Source of Truth**: All routing logic centralized here
 * 4. **Type Safety**: Strong TypeScript contracts for inputs and outputs
 * 5. **Fail-Safe Defaults**: Denies access on ambiguous state
 *
 * ## Routing Rules
 *
 * The function implements a simple decision tree based on two flags:
 *
 * | isAuthenticated | isVerified | Route    | Meaning                    |
 * |-----------------|------------|----------|----------------------------|
 * | false           | *          | 'login'  | User must sign in          |
 * | true            | false      | 'verify' | Email verification needed  |
 * | true            | true       | 'home'   | Full access granted        |
 *
 * ## Usage Examples
 *
 * ### Example 1: Direct usage
 * ```typescript
 * import { deriveInitialRouteFromAuthState } from '@/features/auth';
 *
 * const route = deriveInitialRouteFromAuthState({
 *   isAuthenticated: true,
 *   isVerified: false,
 * });
 * // route === 'verify'
 * ```
 *
 * ### Example 2: With auth store
 * ```typescript
 * import { useStore } from '@/core/state/store';
 *
 * const route = useStore.getState().deriveRoute();
 * // Returns current route based on live auth state
 * ```
 *
 * ### Example 3: In route protection hook
 * ```typescript
 * function useRouteProtection() {
 *   const isAuthenticated = useStore(s => s.isAuthenticated);
 *   const isVerified = useStore(s => s.isVerified);
 *
 *   const requiredRoute = deriveInitialRouteFromAuthState({
 *     isAuthenticated,
 *     isVerified,
 *   });
 *
 *   // Navigate if current route doesn't match requiredRoute
 * }
 * ```
 *
 * @module features/auth/utils/authRouting
 */

/**
 * Route descriptor representing the top-level navigation target.
 *
 * These routes correspond to the main navigation stacks in the app:
 * - 'login': Unauthenticated flow (sign in, sign up, password reset)
 * - 'verify': Email verification prompt (authenticated but unverified)
 * - 'home': Main application (authenticated and verified)
 *
 * The navigation layer is responsible for mapping these descriptors to
 * actual Expo Router paths or React Navigation stack names.
 */
export type AuthRoute = 'login' | 'verify' | 'home';

/**
 * Normalized auth state input for routing decisions.
 *
 * This interface decouples the routing logic from the auth store
 * implementation, making the function pure and testable. Callers extract
 * these flags from the store and pass them explicitly.
 *
 * @property isAuthenticated - User has valid session (access + refresh tokens)
 * @property isVerified - User's email has been confirmed (email_confirmed_at set)
 */
export interface AuthRoutingInput {
  /**
   * Whether the user has a valid authenticated session.
   *
   * This flag is set to true when:
   * - Login succeeds (useLogin onSuccess)
   * - Signup succeeds with auto-login (useSignUp onSuccess)
   * - Session restore succeeds (authRestore pipeline)
   * - Token refresh succeeds (useTokenRefreshManager)
   *
   * It is set to false when:
   * - Logout occurs (useLogout, force logout)
   * - Session restore fails with auth error
   * - Token refresh fails with auth error
   */
  isAuthenticated: boolean;

  /**
   * Whether the user's email address has been verified.
   *
   * This flag is derived from the User object's email_confirmed_at field.
   * Supabase sets this timestamp when the user clicks the confirmation link
   * sent to their email.
   *
   * Some auth flows may require email verification before granting full
   * access to the app. Unverified users are redirected to a verification
   * prompt screen.
   */
  isVerified: boolean;
}

/**
 * Derives the target route from normalized auth state.
 *
 * This pure function implements the canonical routing logic for the entire
 * app. It takes boolean flags representing the user's auth status and
 * returns a stable route descriptor that the navigation layer can consume.
 *
 * ## Decision Flow
 *
 * 1. **Unauthenticated**: Route to login (primary gate)
 * 2. **Authenticated but unverified**: Route to email verification
 * 3. **Authenticated and verified**: Route to home (full access)
 *
 * ## Security Model
 *
 * The function enforces a fail-safe security model:
 * - Defaults to denying access (routes to login)
 * - Requires explicit verification flag for home access
 * - No special cases or bypasses
 *
 * ## Idempotency
 *
 * Multiple calls with the same input always return the same output.
 * The function has no internal state and performs no I/O.
 *
 * ## Testing
 *
 * Test coverage should verify all possible state combinations:
 *
 * ```typescript
 * describe('deriveInitialRouteFromAuthState', () => {
 *   it('routes to login when unauthenticated', () => {
 *     expect(deriveInitialRouteFromAuthState({
 *       isAuthenticated: false,
 *       isVerified: false,
 *     })).toBe('login');
 *
 *     expect(deriveInitialRouteFromAuthState({
 *       isAuthenticated: false,
 *       isVerified: true, // Impossible state, but handled safely
 *     })).toBe('login');
 *   });
 *
 *   it('routes to verify when authenticated but unverified', () => {
 *     expect(deriveInitialRouteFromAuthState({
 *       isAuthenticated: true,
 *       isVerified: false,
 *     })).toBe('verify');
 *   });
 *
 *   it('routes to home when authenticated and verified', () => {
 *     expect(deriveInitialRouteFromAuthState({
 *       isAuthenticated: true,
 *       isVerified: true,
 *     })).toBe('home');
 *   });
 * });
 * ```
 *
 * @param input - Normalized auth state with explicit boolean flags
 * @returns Route descriptor for navigation layer
 *
 * @example
 * // Unauthenticated user
 * deriveInitialRouteFromAuthState({
 *   isAuthenticated: false,
 *   isVerified: false,
 * });
 * // Returns: 'login'
 *
 * @example
 * // Authenticated but email not verified
 * deriveInitialRouteFromAuthState({
 *   isAuthenticated: true,
 *   isVerified: false,
 * });
 * // Returns: 'verify'
 *
 * @example
 * // Fully authenticated and verified
 * deriveInitialRouteFromAuthState({
 *   isAuthenticated: true,
 *   isVerified: true,
 * });
 * // Returns: 'home'
 */
export function deriveInitialRouteFromAuthState(
  input: AuthRoutingInput
): AuthRoute {
  // Gate 1: Check authentication status
  // Unauthenticated users must sign in before accessing any protected routes
  if (!input.isAuthenticated) {
    return 'login';
  }

  // Gate 2: Check email verification status
  // Authenticated users with unverified emails must verify before full access
  if (!input.isVerified) {
    return 'verify';
  }

  // Both gates passed: user is authenticated and verified
  // Grant access to the main application
  return 'home';
}
