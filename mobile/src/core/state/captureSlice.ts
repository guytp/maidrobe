/**
 * Capture flow state slice for temporary image payload storage.
 *
 * This slice manages the in-memory payload passed from the capture flow
 * to the crop screen. It stores the captured/selected image URI along with
 * context (origin, source) needed for navigation and telemetry.
 *
 * DESIGN DECISIONS:
 * - Location: core/state instead of features/wardrobe because this is shared
 *   between wardrobe and onboarding features
 * - Persistence: None - this is ephemeral state cleared after hand-off
 * - Singleton pattern: Only one payload at a time (no keying needed)
 *
 * LIFECYCLE:
 * 1. Capture flow sets payload via setPayload()
 * 2. Navigate to crop screen
 * 3. Crop screen reads payload via useStore
 * 4. Crop screen validates with isCaptureImagePayload()
 * 5. Crop screen clears payload after successful processing
 *
 * @module core/state/captureSlice
 */

import { StateCreator } from 'zustand';
import { CaptureImagePayload } from '../types/capture';

/**
 * Capture state interface.
 *
 * Holds the current image payload being passed through the capture flow.
 */
interface CaptureState {
  /**
   * Current capture payload, or null if no capture in progress.
   *
   * Set by capture flow after image selection/capture.
   * Read by crop screen for processing.
   * Cleared after successful hand-off or cancellation.
   */
  payload: CaptureImagePayload | null;
}

/**
 * Capture actions interface.
 *
 * Provides operations for managing the capture payload.
 */
interface CaptureActions {
  /**
   * Sets the current capture payload.
   *
   * Called by the capture flow after a valid image has been
   * captured or selected. This payload is then passed to the
   * crop screen for processing.
   *
   * @param payload - The capture image payload to store
   *
   * @example
   * ```ts
   * const { setPayload } = useStore();
   *
   * // After capturing/selecting image
   * setPayload({
   *   uri: 'file:///path/to/image.jpg',
   *   origin: 'wardrobe',
   *   source: 'camera',
   *   createdAt: new Date().toISOString()
   * });
   *
   * // Navigate to crop
   * router.push('/crop');
   * ```
   */
  setPayload: (payload: CaptureImagePayload) => void;

  /**
   * Clears the current capture payload.
   *
   * Called after successful hand-off to crop screen, or on
   * cancellation of the capture flow. Ensures no stale data
   * remains in memory.
   *
   * @example
   * ```ts
   * const { clearPayload } = useStore();
   *
   * // After successful processing
   * clearPayload();
   * router.push('/wardrobe');
   * ```
   */
  clearPayload: () => void;
}

/**
 * Combined capture slice type.
 *
 * Exported for type-safe store composition.
 */
export type CaptureSlice = CaptureState & CaptureActions;

/**
 * Creates the capture slice for the root store.
 *
 * This factory function returns a Zustand slice with capture state
 * and actions. It follows the standard slice pattern used throughout
 * the application.
 *
 * @param set - Zustand set function for updating state
 * @returns Capture slice with state and actions
 *
 * @example
 * ```ts
 * // In store.ts
 * export const useStore = create<RootState>()((...args) => ({
 *   ...createSessionSlice(...args),
 *   ...createOnboardingSlice(...args),
 *   ...createCaptureSlice(...args),
 * }));
 * ```
 */
export const createCaptureSlice: StateCreator<CaptureSlice, [], [], CaptureSlice> = (set) => ({
  // Initial state
  payload: null,

  // Actions
  setPayload: (payload: CaptureImagePayload) => {
    set({ payload });
  },

  clearPayload: () => {
    set({ payload: null });
  },
});
