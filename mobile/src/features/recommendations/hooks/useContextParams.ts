import { useCallback } from 'react';
import { useStore } from '../../../core/state/store';
import { OccasionKey, TemperatureBandKey } from '../types';

/**
 * Result interface for useContextParams hook.
 */
export interface UseContextParamsResult {
  /** Currently selected occasion */
  occasion: OccasionKey;
  /** Currently selected temperature band */
  temperatureBand: TemperatureBandKey;
  /**
   * Whether the context has been hydrated from storage.
   * Use this to determine if the values are ready to use.
   */
  isHydrated: boolean;
  /** Update the selected occasion (persists to storage) */
  setOccasion: (occasion: OccasionKey) => void;
  /** Update the selected temperature band (persists to storage) */
  setTemperatureBand: (temperatureBand: TemperatureBandKey) => void;
  /** Reset context to default values (persists to storage) */
  resetToDefaults: () => void;
}

/**
 * Hook for accessing and managing outfit context parameters.
 *
 * Provides access to the persisted occasion and temperature band selections
 * from the Zustand store. Changes are automatically persisted to AsyncStorage
 * and restored on app restart.
 *
 * Features:
 * - Automatic persistence to AsyncStorage
 * - Hydration status for loading states
 * - Type-safe occasion and temperature band values
 * - Memoized callbacks for stable references
 *
 * @returns Context parameters state and actions
 *
 * @example
 * ```tsx
 * function ContextSelector() {
 *   const { occasion, temperatureBand, isHydrated, setOccasion, setTemperatureBand } = useContextParams();
 *
 *   if (!isHydrated) {
 *     return <LoadingSpinner />;
 *   }
 *
 *   return (
 *     <>
 *       <OccasionPicker value={occasion} onChange={setOccasion} />
 *       <TemperaturePicker value={temperatureBand} onChange={setTemperatureBand} />
 *     </>
 *   );
 * }
 * ```
 */
export function useContextParams(): UseContextParamsResult {
  // Select state from store
  const occasion = useStore((state) => state.occasion);
  const temperatureBand = useStore((state) => state.temperatureBand);
  const isHydrated = useStore((state) => state.isHydrated);

  // Select actions from store
  const storeSetOccasion = useStore((state) => state.setOccasion);
  const storeSetTemperatureBand = useStore((state) => state.setTemperatureBand);
  const storeResetContextToDefaults = useStore((state) => state.resetContextToDefaults);

  // Memoized callbacks for stable references
  const setOccasion = useCallback(
    (newOccasion: OccasionKey) => {
      storeSetOccasion(newOccasion);
    },
    [storeSetOccasion]
  );

  const setTemperatureBand = useCallback(
    (newTemperatureBand: TemperatureBandKey) => {
      storeSetTemperatureBand(newTemperatureBand);
    },
    [storeSetTemperatureBand]
  );

  const resetToDefaults = useCallback(() => {
    storeResetContextToDefaults();
  }, [storeResetContextToDefaults]);

  return {
    occasion,
    temperatureBand,
    isHydrated,
    setOccasion,
    setTemperatureBand,
    resetToDefaults,
  };
}
