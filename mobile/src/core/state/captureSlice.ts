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
import { CaptureImagePayload, CaptureOrigin, CaptureSource } from '../types/capture';

/**
 * Capture state interface.
 *
 * Holds the current state for the capture flow, including origin, source,
 * navigation status, error messages, and the final image payload.
 */
interface CaptureState {
  /**
   * Origin context - which feature initiated the capture flow.
   *
   * Set when entering the capture flow from Wardrobe or Onboarding.
   * Used to determine back/cancel navigation behavior.
   * Cleared on flow completion or cancellation.
   */
  origin: CaptureOrigin | null;

  /**
   * Source of the image - camera or gallery.
   *
   * Set when user selects camera or gallery option.
   * Used for telemetry and payload construction.
   * Cleared on flow completion or cancellation.
   */
  source: CaptureSource | null;

  /**
   * Navigation debouncing flag.
   *
   * Set to true when navigation is in progress to prevent
   * duplicate navigations from rapid taps or double-clicks.
   * Automatically cleared after navigation completes.
   */
  isNavigating: boolean;

  /**
   * Current error message, or null if no error.
   *
   * Set by any capture flow screen when an error occurs.
   * Cleared when user dismisses error or retries.
   * Centralized to allow error state to persist across navigation.
   */
  errorMessage: string | null;

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
 * Provides operations for managing the capture flow state.
 */
interface CaptureActions {
  /**
   * Sets the origin context for the capture flow.
   *
   * Called when entering the capture flow to track which
   * feature initiated it (wardrobe or onboarding).
   *
   * @param origin - The origin context
   *
   * @example
   * ```ts
   * const { setOrigin } = useStore();
   *
   * // On capture screen mount
   * setOrigin('wardrobe');
   * ```
   */
  setOrigin: (origin: CaptureOrigin) => void;

  /**
   * Sets the source for the capture.
   *
   * Called when user selects camera or gallery option.
   *
   * @param source - The capture source
   *
   * @example
   * ```ts
   * const { setSource } = useStore();
   *
   * // When navigating to camera
   * setSource('camera');
   * ```
   */
  setSource: (source: CaptureSource) => void;

  /**
   * Sets the navigation debouncing flag.
   *
   * Set to true before navigation to prevent duplicate navigations.
   * Should be cleared after navigation completes or times out.
   *
   * @param isNavigating - Whether navigation is in progress
   *
   * @example
   * ```ts
   * const { setIsNavigating } = useStore();
   *
   * // Before navigation
   * setIsNavigating(true);
   * router.push('/camera');
   * setTimeout(() => setIsNavigating(false), 500);
   * ```
   */
  setIsNavigating: (isNavigating: boolean) => void;

  /**
   * Sets an error message.
   *
   * Called when an error occurs in the capture flow.
   * Pass null to clear the error.
   *
   * @param message - The error message, or null to clear
   *
   * @example
   * ```ts
   * const { setErrorMessage } = useStore();
   *
   * // On error
   * setErrorMessage('Camera initialization failed');
   *
   * // On retry or dismiss
   * setErrorMessage(null);
   * ```
   */
  setErrorMessage: (message: string | null) => void;

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

  /**
   * Resets all capture flow state to initial values.
   *
   * Called on flow cancellation or completion to ensure
   * clean state for the next capture session.
   *
   * @example
   * ```ts
   * const { resetCapture } = useStore();
   *
   * // On cancel or after completion
   * resetCapture();
   * router.push('/wardrobe');
   * ```
   */
  resetCapture: () => void;
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
  origin: null,
  source: null,
  isNavigating: false,
  errorMessage: null,
  payload: null,

  // Actions
  setOrigin: (origin: CaptureOrigin) => {
    set({ origin });
  },

  setSource: (source: CaptureSource) => {
    set({ source });
  },

  setIsNavigating: (isNavigating: boolean) => {
    set({ isNavigating });
  },

  setErrorMessage: (errorMessage: string | null) => {
    set({ errorMessage });
  },

  setPayload: (payload: CaptureImagePayload) => {
    set({ payload });
  },

  clearPayload: () => {
    set({ payload: null });
  },

  resetCapture: () => {
    set({
      origin: null,
      source: null,
      isNavigating: false,
      errorMessage: null,
      payload: null,
    });
  },
});
