import { StateCreator } from 'zustand';

/**
 * User entity representing authenticated user information.
 */
export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
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
 * @property user - Currently authenticated user or null if not authenticated
 * @property isInitialized - Whether initial auth state has been loaded from Supabase
 * @property tokenMetadata - Token expiry and type metadata (NOT the actual tokens)
 * @property setUser - Action to set the authenticated user
 * @property updateEmailVerified - Action to update the emailVerified status
 * @property setTokenMetadata - Action to store token metadata (expiry, type)
 * @property isTokenExpired - Getter to check if access token is expired
 * @property clearUser - Action to clear the authenticated user (logout)
 * @property setInitialized - Action to mark auth initialization as complete
 */
export interface SessionSlice {
  user: User | null;
  isInitialized: boolean;
  tokenMetadata: TokenMetadata | null;
  setUser: (user: User) => void;
  updateEmailVerified: (verified: boolean) => void;
  setTokenMetadata: (expiresAt: number, tokenType: string) => void;
  isTokenExpired: () => boolean;
  clearUser: () => void;
  setInitialized: (initialized: boolean) => void;
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
  user: null,
  isInitialized: false,
  tokenMetadata: null,

  setUser: (user) => set({ user }),

  updateEmailVerified: (verified) =>
    set((state) => ({
      user: state.user ? { ...state.user, emailVerified: verified } : null,
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
   * Clears user and token metadata (logout).
   *
   * SECURITY: This clears the metadata only. The actual tokens in SecureStore
   * are cleared by the Supabase client during signOut().
   */
  clearUser: () =>
    set({
      user: null,
      tokenMetadata: null,
    }),

  setInitialized: (initialized) => set({ isInitialized: initialized }),
});
