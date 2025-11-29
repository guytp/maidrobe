import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  OccasionKey,
  TemperatureBandKey,
  DEFAULT_OCCASION,
  DEFAULT_TEMPERATURE_BAND,
  isOccasionKey,
  isTemperatureBandKey,
} from '../types';

/**
 * Context state interface for outfit recommendations.
 *
 * Stores the user's occasion and temperature band selections that are
 * sent with recommendation requests. This state is persisted to AsyncStorage
 * for restoration across app restarts.
 */
interface ContextState {
  /** Selected occasion for outfit recommendations */
  occasion: OccasionKey;
  /** Selected temperature band for outfit recommendations */
  temperatureBand: TemperatureBandKey;
  /**
   * Whether the state has been hydrated from AsyncStorage.
   * False until the persist middleware completes initial hydration.
   */
  isHydrated: boolean;
}

/**
 * Context slice interface with state and actions.
 *
 * Provides operations for managing outfit context parameters with persistence.
 * Changes are automatically saved to AsyncStorage and restored on app restart.
 */
export interface ContextSlice extends ContextState {
  /** Update the selected occasion */
  setOccasion: (occasion: OccasionKey) => void;
  /** Update the selected temperature band */
  setTemperatureBand: (temperatureBand: TemperatureBandKey) => void;
  /** Reset context to default values */
  resetContextToDefaults: () => void;
  /** Mark hydration as complete (called by persist middleware) */
  setHydrated: (hydrated: boolean) => void;
}

/**
 * Initial context state with defaults.
 * Used for first-time users and when resetting invalid persisted state.
 */
const initialState: ContextState = {
  occasion: DEFAULT_OCCASION,
  temperatureBand: DEFAULT_TEMPERATURE_BAND,
  isHydrated: false,
};

/**
 * Validate and sanitize persisted context state.
 *
 * Ensures that state loaded from AsyncStorage is valid and safe to use.
 * If any field is invalid or corrupted, it returns the default for that field.
 *
 * Validation rules:
 * - occasion must be a valid OccasionKey
 * - temperatureBand must be a valid TemperatureBandKey
 *
 * @param state - Persisted state from AsyncStorage
 * @returns Validated state with invalid fields replaced by defaults
 * @internal Exported for testing purposes only
 */
export function validatePersistedContextState(state: unknown): ContextState {
  // Check if state is an object
  if (!state || typeof state !== 'object') {
    return initialState;
  }

  const stateObj = state as Record<string, unknown>;

  // Validate and default occasion
  const occasion = isOccasionKey(stateObj.occasion) ? stateObj.occasion : DEFAULT_OCCASION;

  // Validate and default temperatureBand
  const temperatureBand = isTemperatureBandKey(stateObj.temperatureBand)
    ? stateObj.temperatureBand
    : DEFAULT_TEMPERATURE_BAND;

  return {
    occasion,
    temperatureBand,
    isHydrated: false, // Will be set to true after hydration completes
  };
}

/**
 * Create the context state slice with persistence.
 *
 * This slice manages outfit context parameters (occasion, temperatureBand)
 * with local AsyncStorage persistence. State is automatically saved on changes
 * and restored on app restart.
 *
 * Persistence features:
 * - Stores state in AsyncStorage under 'maidrobe-context-params' key
 * - Validates state on rehydration to prevent crashes from corrupted data
 * - Gracefully handles migration between app versions
 * - Resets invalid fields to defaults while preserving valid ones
 *
 * @param set - Zustand set function
 * @param get - Zustand get function
 * @returns Context slice with state and actions
 */
export const createContextSlice = persist<ContextSlice>(
  (set) => ({
    ...initialState,

    /**
     * Update the selected occasion.
     * Changes are automatically persisted to AsyncStorage.
     *
     * @param occasion - New occasion value
     */
    setOccasion: (occasion) => set({ occasion }),

    /**
     * Update the selected temperature band.
     * Changes are automatically persisted to AsyncStorage.
     *
     * @param temperatureBand - New temperature band value
     */
    setTemperatureBand: (temperatureBand) => set({ temperatureBand }),

    /**
     * Reset context to default values.
     * Called on logout or when user wants to start fresh.
     */
    resetContextToDefaults: () =>
      set({
        occasion: DEFAULT_OCCASION,
        temperatureBand: DEFAULT_TEMPERATURE_BAND,
      }),

    /**
     * Mark hydration as complete.
     * Called by persist middleware's onRehydrateStorage callback.
     *
     * @param hydrated - Whether hydration is complete
     */
    setHydrated: (hydrated) => set({ isHydrated: hydrated }),
  }),
  {
    name: 'maidrobe-context-params',
    storage: createJSONStorage(() => AsyncStorage),
    version: 1,

    // Only persist state fields, not action functions or isHydrated
    partialize: (state) =>
      ({
        occasion: state.occasion,
        temperatureBand: state.temperatureBand,
      }) as ContextSlice,

    // Validate and migrate persisted state
    migrate: (persistedState: unknown, version: number) => {
      // Version 1: Initial schema with occasion and temperatureBand
      if (version === 1) {
        const validated = validatePersistedContextState(persistedState);
        return validated as ContextSlice;
      }

      // For version 0 (no version) or unknown versions, reset to initial state
      return initialState as ContextSlice;
    },

    // Mark hydration as complete when storage is rehydrated
    onRehydrateStorage: () => (state) => {
      if (state) {
        state.setHydrated(true);
      }
    },
  }
);
