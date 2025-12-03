/**
 * Wardrobe feature hooks public exports.
 *
 * @module features/wardrobe/hooks
 */

export { useCapturePermissions } from './useCapturePermissions';
export type { CapturePermissions } from './useCapturePermissions';

export { useCreateItemWithImage, CreateItemWithImageError } from './useCreateItemWithImage';
export type {
  CreateItemErrorType,
  CreateItemInput,
  CreateItemResult,
  UseCreateItemWithImageState,
  UseCreateItemWithImageActions,
} from './useCreateItemWithImage';

export { useDebounce } from './useDebounce';
