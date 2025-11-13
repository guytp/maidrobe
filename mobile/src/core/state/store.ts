import { create } from 'zustand';
import { SessionSlice, createSessionSlice } from '../../features/auth/store/sessionSlice';

/**
 * Root application state interface.
 *
 * Combines all Zustand slices for local ephemeral UI state.
 * Server state is managed separately via React Query.
 *
 * Currently includes:
 * - SessionSlice: User authentication state (user, setUser, clearUser)
 *
 * Future slices can be added using intersection types:
 * ```
 * type RootState = SessionSlice & PreferencesSlice & OtherSlice;
 * ```
 */
export type RootState = SessionSlice;

/**
 * Typed Zustand store hook for accessing local application state.
 *
 * Combines multiple slices into a single store while maintaining type safety
 * and separation of concerns. Each slice is created with its own factory function
 * and spread into the root store.
 *
 * Usage:
 * ```
 * // Access state
 * const user = useStore((state) => state.user);
 *
 * // Access actions
 * const setUser = useStore((state) => state.setUser);
 * const clearUser = useStore((state) => state.clearUser);
 * ```
 *
 * Note: Only use for ephemeral UI state. Server state belongs in React Query.
 */
export const useStore = create<RootState>()((...args) => ({
  ...createSessionSlice(...args),
}));
