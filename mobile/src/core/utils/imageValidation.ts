/**
 * Image validation utilities for capture flow.
 *
 * Validates captured or selected images to ensure they meet requirements
 * for the crop and item creation flow. Checks URI format, image type,
 * dimensions, and other constraints.
 *
 * @module core/utils/imageValidation
 */

/**
 * Image validation result.
 */
export interface ImageValidationResult {
  /** Whether the image is valid */
  isValid: boolean;
  /** Error code if validation failed */
  error?: 'invalid_uri' | 'invalid_type' | 'invalid_dimensions' | 'missing_data' | 'unknown';
  /** Human-readable error message */
  errorMessage?: string;
}

/**
 * Minimum acceptable image dimensions (pixels).
 * Images smaller than this are likely too low quality for wardrobe items.
 * User story requirement: shortest side must be at least 256 pixels.
 */
const MIN_DIMENSION = 256;

/**
 * Maximum acceptable image dimensions (pixels).
 * Images larger than this may cause memory issues or excessive storage.
 */
const MAX_DIMENSION = 8000;

/**
 * Supported image MIME types.
 */
const SUPPORTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

/**
 * Validates a captured or selected image.
 *
 * Checks:
 * - URI is present and well-formed
 * - Type is supported (JPEG/PNG)
 * - Dimensions are within acceptable bounds
 *
 * This is a synchronous validation based on metadata. Does not read
 * the actual image file or validate file integrity.
 *
 * @param uri - Image URI (file:// or content:// scheme)
 * @param width - Image width in pixels (if available)
 * @param height - Image height in pixels (if available)
 * @param type - Image MIME type (if available)
 * @returns Validation result with error details if invalid
 */
export function validateCapturedImage(
  uri: string | null | undefined,
  width?: number | null,
  height?: number | null,
  type?: string | null
): ImageValidationResult {
  // Check URI is present and non-empty
  if (!uri || uri.trim().length === 0) {
    return {
      isValid: false,
      error: 'invalid_uri',
      errorMessage: 'Image URI is missing or empty',
    };
  }

  // Check URI has valid scheme (file:// or content://)
  const trimmedUri = uri.trim();
  if (!trimmedUri.startsWith('file://') && !trimmedUri.startsWith('content://')) {
    return {
      isValid: false,
      error: 'invalid_uri',
      errorMessage: 'Image URI must use file:// or content:// scheme',
    };
  }

  // Check type if provided
  if (type) {
    const normalizedType = type.toLowerCase().trim();
    if (!SUPPORTED_TYPES.includes(normalizedType)) {
      return {
        isValid: false,
        error: 'invalid_type',
        errorMessage: `Image type ${type} is not supported. Use JPEG or PNG.`,
      };
    }
  }

  // Check dimensions if provided
  if (width !== null && width !== undefined) {
    if (width < MIN_DIMENSION) {
      return {
        isValid: false,
        error: 'invalid_dimensions',
        errorMessage: `Image width ${width}px is too small. Minimum ${MIN_DIMENSION}px required.`,
      };
    }
    if (width > MAX_DIMENSION) {
      return {
        isValid: false,
        error: 'invalid_dimensions',
        errorMessage: `Image width ${width}px is too large. Maximum ${MAX_DIMENSION}px allowed.`,
      };
    }
  }

  if (height !== null && height !== undefined) {
    if (height < MIN_DIMENSION) {
      return {
        isValid: false,
        error: 'invalid_dimensions',
        errorMessage: `Image height ${height}px is too small. Minimum ${MIN_DIMENSION}px required.`,
      };
    }
    if (height > MAX_DIMENSION) {
      return {
        isValid: false,
        error: 'invalid_dimensions',
        errorMessage: `Image height ${height}px is too large. Maximum ${MAX_DIMENSION}px allowed.`,
      };
    }
  }

  // All checks passed
  return {
    isValid: true,
  };
}

/**
 * Gets a user-friendly error message for a validation error code.
 *
 * @param error - Error code from validation result
 * @returns User-friendly error message
 */
export function getValidationErrorMessage(error: ImageValidationResult['error']): string {
  switch (error) {
    case 'invalid_uri':
      return 'The image could not be accessed. Please try again.';
    case 'invalid_type':
      return 'This file type is not supported. Please select a JPEG or PNG image.';
    case 'invalid_dimensions':
      return 'This image does not meet size requirements. Please select a different image.';
    case 'missing_data':
      return 'Image information is incomplete. Please try again.';
    case 'unknown':
      return 'An unknown error occurred. Please try again.';
    default:
      return 'Image validation failed. Please try again.';
  }
}
