import { create } from 'zustand';

/**
 * Root application state interface.
 *
 * Combines all Zustand slices for local ephemeral UI state.
 * Server state is managed separately via React Query.
 *
 * Pattern: Each feature can define its own slice (e.g., SessionSlice, PreferencesSlice)
 * and they are combined here into a single store for type-safe access.
 *
 * Example slice integration:
 * ```
 * type RootState = SessionSlice & PreferencesSlice;
 *
 * export const useStore = create<RootState>()((...args) => ({
 *   ...createSessionSlice(...args),
 *   ...createPreferencesSlice(...args),
 * }));
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RootState {
  // Slices will be added here as features are developed.
  // Currently empty - waiting for sessionSlice and other feature slices.
}

/**
 * Typed Zustand store hook for accessing local application state.
 *
 * Usage:
 * ```
 * const user = useStore((state) => state.user);
 * const setUser = useStore((state) => state.setUser);
 * ```
 *
 * Note: Only use for ephemeral UI state. Server state belongs in React Query.
 */
export const useStore = create<RootState>()(() => ({
  // Initial empty state - slices will be combined here in future steps
}));
