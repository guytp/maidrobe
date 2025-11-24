/**
 * Crop feature exports.
 *
 * Provides feature-level exports for the wardrobe item image crop functionality.
 *
 * This feature handles the Crop & Adjust screen in the wardrobe item capture flow,
 * allowing users to frame and adjust captured images before item creation.
 *
 * Navigation Contract:
 * - Route: /crop
 * - Data: Via Zustand captureSlice.payload (CaptureImagePayload)
 * - Feature Flag: capture.cropScreen
 * - See: NAVIGATION_CONTRACT.md for full documentation
 *
 * @module features/wardrobe/crop
 */

export { CropScreen } from './components';

// Re-export utilities for use by other modules
export {
  computeCropRectangle,
  cropAndProcessImage,
  TARGET_MAX_DIMENSION,
  JPEG_QUALITY,
  CROP_ASPECT_RATIO,
} from './utils/imageProcessing';

export { CropError, classifyError, formatErrorForLogging } from './utils/errors';
