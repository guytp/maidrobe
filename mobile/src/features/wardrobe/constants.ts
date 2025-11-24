/**
 * Wardrobe feature constants.
 *
 * Centralizes timing values and other constants used throughout the
 * wardrobe capture flow to ensure consistency and easy tunability.
 *
 * @module features/wardrobe/constants
 */

/**
 * Navigation debounce delay in milliseconds.
 *
 * Used to reset navigation state after router.push() calls.
 * This delay ensures the navigation transition completes before
 * resetting the isNavigating flag, preventing double-navigation
 * and ensuring smooth UI transitions.
 *
 * Used in:
 * - CaptureScreen: After navigating to camera screen
 * - CaptureCameraScreen: After navigating to crop screen
 * - WardrobeScreen: After navigating to capture screen
 * - useGallerySelection: After navigating to crop screen
 */
export const NAVIGATION_DEBOUNCE_MS = 500;

/**
 * Settings return delay in milliseconds.
 *
 * Used to delay permission re-checking after returning from
 * app settings. This gives the OS time to fully return from
 * settings and update permission states before we query them.
 *
 * Used in:
 * - useCapturePermissions: After openAppSettings() returns
 */
export const SETTINGS_RETURN_DELAY_MS = 500;

/**
 * Supabase Edge Function names for wardrobe item processing.
 *
 * These function names are used when triggering background processing
 * pipelines for wardrobe items. Centralizing them here ensures consistency
 * across the codebase and makes it easier to update function names if they
 * change during deployment or refactoring.
 *
 * Used in:
 * - useCreateItemWithImage: Triggers both pipelines after item creation
 */
export const EDGE_FUNCTIONS = {
  /**
   * Image processing pipeline (Story #229).
   * Cleans up the original image and generates optimized thumbnails.
   */
  PROCESS_ITEM_IMAGE: 'process-item-image',

  /**
   * Attribute classification pipeline (Story #235).
   * Detects item type, colours, patterns, fabric, etc.
   */
  CLASSIFY_ITEM: 'classify-item',
} as const;
