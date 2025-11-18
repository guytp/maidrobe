import { StateCreator } from 'zustand';
import { deriveInitialRouteFromAuthState, AuthRoute } from '../utils/authRouting';
import { checkFeatureFlag } from '../../../core/featureFlags';

/**
 * User entity representing authenticated user information.
 */
export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  hasOnboarded: boolean;
}

/**
 * Token metadata for tracking token expiry without exposing raw tokens.
 *
 * SECURITY: This metadata is safe to store in Zustand and expose to UI.
 * It contains NO cryptographic material - only timing and type information.
 * The actual access_token and refresh_token are stored encrypted in SecureStore.
 */
export interface TokenMetadata {
  /** Unix timestamp in milliseconds when the access token expires */
  expiresAt: number;
  /** Token type (typically "bearer") */
  tokenType: string;
}

/**
 * Session slice interface for managing user authentication state.
 *
 * This slice handles ephemeral session data in the local Zustand store.
 * For server-side authentication state, use Supabase Auth via React Query.
 *
 * SECURITY WARNING:
 * - Raw access_token and refresh_token are NEVER stored in this slice
 * - Tokens are stored encrypted in SecureStore via Supabase client
 * - Only token metadata (expiry time, type) is stored here
 * - Never log or expose the Supabase session object (contains tokens)
 *
 * STATE FIELDS:
 * @property user - Currently authenticated user or null if not authenticated
 * @property isInitialized - Whether initial auth state has been loaded from Supabase
 * @property tokenMetadata - Token expiry and type metadata (NOT the actual tokens)
 * @property logoutReason - Reason for forced logout (e.g., session expired) for UI display
 * @property isAuthenticated - Explicit authentication state flag
 * @property isHydrating - Whether auth restore pipeline is running at cold start
 * @property needsRefresh - Whether deferred token refresh is needed after offline startup
 *
 * ACTIONS - Basic:
 * @property setUser - Action to set the authenticated user (also sets isAuthenticated=true)
 * @property updateEmailVerified - Action to update the emailVerified status
 * @property updateHasOnboarded - Action to update the hasOnboarded status
 * @property setTokenMetadata - Action to store token metadata (expiry, type)
 * @property clearUser - Action to clear the authenticated user (also sets isAuthenticated=false)
 * @property setInitialized - Action to mark auth initialization as complete
 * @property setLogoutReason - Action to set the logout reason for UI display
 *
 * ACTIONS - Hydration lifecycle:
 * @property beginHydration - Mark auth restore pipeline as started
 * @property endHydration - Mark auth restore pipeline as complete
 *
 * ACTIONS - Consolidated auth state:
 * @property applyAuthenticatedUser - Set authenticated user with all metadata
 * @property markUnauthenticated - Clear auth state and optionally set logout reason
 *
 * ACTIONS - Offline handling:
 * @property setNeedsRefresh - Set needsRefresh flag for deferred refresh
 * @property clearNeedsRefresh - Clear needsRefresh flag after successful refresh
 *
 * GETTERS:
 * @property isTokenExpired - Check if access token is expired
 * @property isVerified - Check if user's email is verified (derived from user.emailVerified)
 * @property deriveRoute - Derive target route from current auth state
 */
export interface SessionSlice {
  // State fields
  user: User | null;
  isInitialized: boolean;
  tokenMetadata: TokenMetadata | null;
  logoutReason: string | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  needsRefresh: boolean;

  // Basic actions (backward compatible)
  setUser: (user: User) => void;
  updateEmailVerified: (verified: boolean) => void;
  updateHasOnboarded: (completed: boolean) => void;
  setTokenMetadata: (expiresAt: number, tokenType: string) => void;
  clearUser: () => void;
  setInitialized: (initialized: boolean) => void;
  setLogoutReason: (reason: string | null) => void;

  // Hydration lifecycle actions
  beginHydration: () => void;
  endHydration: () => void;

  // Consolidated auth state actions
  applyAuthenticatedUser: (user: User, tokenMetadata: TokenMetadata) => void;
  markUnauthenticated: (reason?: string) => void;

  // Offline handling actions
  setNeedsRefresh: (value: boolean) => void;
  clearNeedsRefresh: () => void;

  // Getters
  isTokenExpired: () => boolean;
  isVerified: () => boolean;
  deriveRoute: () => AuthRoute;
}

/**
 * Creates a session slice for the Zustand store.
 *
 * This factory function follows the Zustand slice pattern, allowing
 * multiple slices to be combined into a single root store while maintaining
 * type safety and separation of concerns.
 *
 * @param set - Zustand set function for updating state
 * @param get - Zustand get function for reading current state
 * @returns Session slice with initial state and actions
 *
 * @example
 * ```typescript
 * // In store.ts
 * export const useStore = create<RootState>()((...args) => ({
 *   ...createSessionSlice(...args),
 * }));
 *
 * // In a component
 * const user = useStore((state) => state.user);
 * const setUser = useStore((state) => state.setUser);
 * const isExpired = useStore((state) => state.isTokenExpired());
 * ```
 */
export const createSessionSlice: StateCreator<SessionSlice, [], [], SessionSlice> = (set, get) => ({
  // Initial state
  user: null,
  isInitialized: false,
  tokenMetadata: null,
  logoutReason: null,
  isAuthenticated: false,
  isHydrating: false,
  needsRefresh: false,

  /**
   * Sets the authenticated user.
   *
   * BACKWARD COMPATIBILITY: This action now also sets isAuthenticated=true
   * to maintain consistency between user state and authentication flag.
   *
   * @param user - User object with id, email, and emailVerified
   */
  setUser: (user) =>
    set({
      user,
      isAuthenticated: true,
    }),

  /**
   * Updates the email verification status of the current user.
   *
   * @param verified - Whether the user's email is verified
   */
  updateEmailVerified: (verified) =>
    set((state) => ({
      user: state.user ? { ...state.user, emailVerified: verified } : null,
    })),

  /**
   * Updates the onboarding completion status of the current user.
   *
   * @param completed - Whether the user has completed onboarding
   */
  updateHasOnboarded: (completed) =>
    set((state) => ({
      user: state.user ? { ...state.user, hasOnboarded: completed } : null,
    })),

  /**
   * Stores token metadata (expiry time and type).
   *
   * SECURITY: This stores ONLY metadata, never the actual tokens.
   * The tokens themselves are encrypted in SecureStore.
   *
   * @param expiresAt - Unix timestamp in milliseconds when token expires
   * @param tokenType - Token type (e.g., "bearer")
   */
  setTokenMetadata: (expiresAt, tokenType) =>
    set({
      tokenMetadata: { expiresAt, tokenType },
    }),

  /**
   * Clears user and token metadata (logout).
   *
   * BACKWARD COMPATIBILITY: This action now also sets isAuthenticated=false
   * and clears needsRefresh flag to ensure complete state cleanup.
   *
   * SECURITY: This clears the metadata only. The actual tokens in SecureStore
   * are cleared by the Supabase client during signOut() or via clearStoredSession().
   */
  clearUser: () =>
    set({
      user: null,
      tokenMetadata: null,
      isAuthenticated: false,
      needsRefresh: false,
    }),

  setInitialized: (initialized) => set({ isInitialized: initialized }),

  /**
   * Sets the logout reason for UI display.
   *
   * This is used to communicate forced logout reasons (e.g., session expired)
   * to the user interface. The reason is displayed on the login screen and
   * cleared when the user logs in successfully or dismisses the message.
   *
   * @param reason - Logout reason message or null to clear
   */
  setLogoutReason: (reason) => set({ logoutReason: reason }),

  /**
   * Marks the start of the auth hydration pipeline.
   *
   * Sets isHydrating=true to indicate that the app is restoring auth state
   * from SecureStore at cold start. This prevents the UI from rendering
   * Login/Home/Verification screens before the restore completes.
   *
   * Must be paired with endHydration() when restore completes.
   */
  beginHydration: () => set({ isHydrating: true }),

  /**
   * Marks the end of the auth hydration pipeline.
   *
   * Sets isHydrating=false to indicate that auth state restoration is complete
   * and the UI can proceed with routing based on authentication state.
   *
   * Called after restore completes successfully or fails.
   */
  endHydration: () => set({ isHydrating: false }),

  /**
   * Applies authenticated user state with all metadata.
   *
   * This is a consolidated action for setting authenticated state, typically
   * used by the auth restore pipeline and token refresh flows. It sets all
   * related fields atomically to avoid intermediate inconsistent states.
   *
   * @param user - User object with id, email, and emailVerified
   * @param tokenMetadata - Token expiry and type metadata
   */
  applyAuthenticatedUser: (user, tokenMetadata) =>
    set({
      user,
      tokenMetadata,
      isAuthenticated: true,
      logoutReason: null,
    }),

  /**
   * Marks the user as unauthenticated and clears all auth state.
   *
   * This is a consolidated action for clearing auth state, typically used
   * by failed auth restore, forced logout, and session expiry scenarios.
   *
   * Optionally sets a logout reason to display on the login screen.
   *
   * @param reason - Optional logout reason message for UI display
   */
  markUnauthenticated: (reason) =>
    set({
      user: null,
      tokenMetadata: null,
      isAuthenticated: false,
      needsRefresh: false,
      logoutReason: reason || null,
    }),

  /**
   * Sets the needsRefresh flag.
   *
   * Used after offline cold start when the cached session is within the
   * 7-day trust window but couldn't be refreshed due to network issues.
   * Indicates that a deferred refresh should be attempted when connectivity
   * is restored.
   *
   * @param value - Whether deferred refresh is needed
   */
  setNeedsRefresh: (value) => set({ needsRefresh: value }),

  /**
   * Clears the needsRefresh flag.
   *
   * Called after successful deferred token refresh or when no longer needed.
   */
  clearNeedsRefresh: () => set({ needsRefresh: false }),

  /**
   * Checks if the access token is expired based on stored metadata.
   *
   * Returns true if:
   * - No token metadata is available (not logged in)
   * - Current time is past the expiry time
   *
   * @returns true if token is expired or missing, false otherwise
   */
  isTokenExpired: () => {
    const { tokenMetadata } = get();
    if (!tokenMetadata) {
      return true; // No token metadata means not logged in
    }
    return Date.now() >= tokenMetadata.expiresAt;
  },

  /**
   * Checks if the user's email is verified.
   *
   * This is a derived getter that returns the verification status from the
   * user object. It maintains a single source of truth (user.emailVerified)
   * and is used by launch-time routing logic.
   *
   * @returns true if user exists and email is verified, false otherwise
   */
  isVerified: () => {
    const { user } = get();
    return user?.emailVerified ?? false;
  },

  /**
   * Derives the target route from current auth state.
   *
   * This method integrates the pure routing logic from authRouting.ts with
   * the Zustand store, providing a convenient way to determine where the
   * user should be routed based on their current authentication status.
   *
   * The method extracts the normalized auth state (isAuthenticated,
   * isVerified, hasOnboarded) and checks the onboarding gate feature flag,
   * then delegates to deriveInitialRouteFromAuthState for the actual routing
   * decision. This ensures consistent routing behavior across:
   * - Cold start navigation (Step 5)
   * - Route protection hooks (Story #7)
   * - Deep link handling
   * - Session state changes
   *
   * @returns Route descriptor: 'login', 'verify', 'onboarding', or 'home'
   *
   * @example
   * ```typescript
   * // In navigation layer
   * const targetRoute = useStore.getState().deriveRoute();
   * if (targetRoute === 'login') {
   *   router.replace('/auth/login');
   * } else if (targetRoute === 'verify') {
   *   router.replace('/auth/verify');
   * } else if (targetRoute === 'onboarding') {
   *   router.replace('/onboarding/welcome');
   * } else {
   *   router.replace('/home');
   * }
   * ```
   */
  deriveRoute: () => {
    const state = get();

    // Check if onboarding gate feature is enabled
    // Defaults to true if not specified (fail-safe: show onboarding)
    const onboardingGateResult = checkFeatureFlag('onboarding.gate');
    const onboardingGateEnabled = onboardingGateResult.enabled;

    // Extract hasOnboarded from user object, default to false if not set
    // This ensures new users are routed to onboarding when gate is enabled
    const hasOnboarded = state.user?.hasOnboarded ?? false;

    return deriveInitialRouteFromAuthState({
      isAuthenticated: state.isAuthenticated,
      isVerified: state.isVerified(),
      hasOnboarded,
      onboardingGateEnabled,
    });
  },
});
