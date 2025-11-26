/**
 * Wardrobe UI state slice for preserving screen state across navigation.
 *
 * This slice manages ephemeral UI state for the wardrobe screen:
 * - Search query: preserved when navigating to item detail or capture flow
 * - Scroll offset: restored when returning to wardrobe screen
 *
 * DESIGN DECISIONS:
 * - Location: core/state because wardrobe state may be accessed from multiple features
 * - Persistence: None - this is ephemeral state cleared on logout
 * - Data: UI state only - actual item data is managed by React Query
 *
 * LIFECYCLE:
 * 1. User navigates to wardrobe screen
 * 2. Search query and scroll position saved on navigation away
 * 3. State restored when returning to wardrobe
 * 4. State cleared on logout via resetWardrobeUI()
 *
 * @module core/state/wardrobeSlice
 */

import { StateCreator } from 'zustand';

/**
 * Wardrobe UI state interface.
 *
 * Holds ephemeral UI state for the wardrobe screen that should
 * persist across navigation but not across app restarts.
 */
interface WardrobeUIState {
  /**
   * Current search query for filtering wardrobe items.
   *
   * Empty string means no active search filter.
   * Preserved when navigating to item detail or capture flow.
   */
  wardrobeSearchQuery: string;

  /**
   * Current scroll offset in pixels.
   *
   * Used to restore scroll position when returning to wardrobe.
   * Reset to 0 when search query changes.
   */
  wardrobeScrollOffset: number;
}

/**
 * Wardrobe UI actions interface.
 *
 * Provides operations for managing wardrobe screen state.
 */
interface WardrobeUIActions {
  /**
   * Sets the current search query.
   *
   * Called when user types in the search input.
   * Also resets scroll offset to 0 since results change.
   *
   * @param query - The search query string
   *
   * @example
   * ```ts
   * const { setWardrobeSearchQuery } = useStore();
   * setWardrobeSearchQuery('blue shirt');
   * ```
   */
  setWardrobeSearchQuery: (query: string) => void;

  /**
   * Sets the current scroll offset.
   *
   * Called when FlatList scrolls to save position for restoration.
   *
   * @param offset - The scroll offset in pixels
   *
   * @example
   * ```ts
   * const { setWardrobeScrollOffset } = useStore();
   *
   * <FlatList
   *   onScroll={(e) => setWardrobeScrollOffset(e.nativeEvent.contentOffset.y)}
   * />
   * ```
   */
  setWardrobeScrollOffset: (offset: number) => void;

  /**
   * Resets all wardrobe UI state to initial values.
   *
   * Called on logout or when explicitly clearing state.
   *
   * @example
   * ```ts
   * const { resetWardrobeUI } = useStore();
   * resetWardrobeUI(); // Clears search and scroll
   * ```
   */
  resetWardrobeUI: () => void;
}

/**
 * Combined wardrobe slice type.
 *
 * Exported for type-safe store composition.
 */
export type WardrobeSlice = WardrobeUIState & WardrobeUIActions;

/**
 * Creates the wardrobe slice for the root store.
 *
 * This factory function returns a Zustand slice with wardrobe UI state
 * and actions. It follows the standard slice pattern used throughout
 * the application.
 *
 * @param set - Zustand set function for updating state
 * @returns Wardrobe slice with state and actions
 *
 * @example
 * ```ts
 * // In store.ts
 * export const useStore = create<RootState>()((...args) => ({
 *   ...createSessionSlice(...args),
 *   ...createWardrobeSlice(...args),
 * }));
 * ```
 */
export const createWardrobeSlice: StateCreator<WardrobeSlice, [], [], WardrobeSlice> = (set) => ({
  // Initial state
  wardrobeSearchQuery: '',
  wardrobeScrollOffset: 0,

  // Actions
  setWardrobeSearchQuery: (query: string) => {
    // Reset scroll offset when search changes since results will be different
    set({ wardrobeSearchQuery: query, wardrobeScrollOffset: 0 });
  },

  setWardrobeScrollOffset: (offset: number) => {
    set({ wardrobeScrollOffset: offset });
  },

  resetWardrobeUI: () => {
    set({
      wardrobeSearchQuery: '',
      wardrobeScrollOffset: 0,
    });
  },
});
