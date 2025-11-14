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
 * Session slice interface for managing user authentication state.
 *
 * This slice handles ephemeral session data in the local Zustand store.
 * For server-side authentication state, use Supabase Auth via React Query.
 *
 * @property user - Currently authenticated user or null if not authenticated
 * @property isInitialized - Whether initial auth state has been loaded from Supabase
 * @property setUser - Action to set the authenticated user
 * @property updateEmailVerified - Action to update the emailVerified status
 * @property clearUser - Action to clear the authenticated user (logout)
 * @property setInitialized - Action to mark auth initialization as complete
 */
export interface SessionSlice {
  user: User | null;
  isInitialized: boolean;
  setUser: (user: User) => void;
  updateEmailVerified: (verified: boolean) => void;
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
 * ```
 */
export const createSessionSlice: StateCreator<SessionSlice, [], [], SessionSlice> = (set) => ({
  user: null,
  isInitialized: false,
  setUser: (user) => set({ user }),
  updateEmailVerified: (verified) =>
    set((state) => ({
      user: state.user ? { ...state.user, emailVerified: verified } : null,
    })),
  clearUser: () => set({ user: null }),
  setInitialized: (initialized) => set({ isInitialized: initialized }),
});
