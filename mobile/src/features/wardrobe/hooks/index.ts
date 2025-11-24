/**
 * Wardrobe feature hooks public exports.
 *
 * @module features/wardrobe/hooks
 */

export { useCapturePermissions } from './useCapturePermissions';
export type { CapturePermissions } from './useCapturePermissions';

export { useCreateItemWithImage } from './useCreateItemWithImage';
export type {
  CreateItemErrorType,
  CreateItemWithImageError,
  CreateItemInput,
  CreateItemResult,
  UseCreateItemWithImageState,
  UseCreateItemWithImageActions,
} from './useCreateItemWithImage';
