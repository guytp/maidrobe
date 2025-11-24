/**
 * Error types and utilities for the crop & adjust flow.
 *
 * Provides typed error handling with error codes for robust classification
 * instead of brittle string matching on error messages.
 *
 * @module features/wardrobe/crop/utils/errors
 */

/**
 * Error codes for crop processing failures.
 *
 * Used to classify errors for telemetry and debugging without relying
 * on fragile string matching against error messages.
 */
export type CropErrorCode =
  | 'memory'
  | 'file_system'
  | 'permission'
  | 'corruption'
  | 'network'
  | 'processing'
  | 'unknown';

/**
 * Custom error class for crop processing failures.
 *
 * Extends Error with a typed error code for robust classification.
 * Use this class when throwing errors from image processing operations
 * to enable type-safe error handling in catch blocks.
 *
 * @example
 * ```ts
 * throw new CropError('Out of memory during resize', 'memory');
 *
 * // In catch block:
 * if (error instanceof CropError) {
 *   console.log(error.code); // 'memory'
 * }
 * ```
 */
export class CropError extends Error {
  /** Error classification code */
  readonly code: CropErrorCode;

  /** Original error that caused this error, if any */
  readonly cause?: Error;

  constructor(message: string, code: CropErrorCode, cause?: Error) {
    super(message);
    this.name = 'CropError';
    this.code = code;
    this.cause = cause;

    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CropError);
    }
  }
}

/**
 * Classifies an unknown error into a CropErrorCode.
 *
 * Used to convert errors from external sources (e.g., expo-image-manipulator)
 * into typed CropError instances. Falls back to pattern matching on error
 * messages when the error is not already a CropError.
 *
 * @param error - Unknown error to classify
 * @returns Appropriate CropErrorCode based on error characteristics
 */
export function classifyError(error: unknown): CropErrorCode {
  // Already classified
  if (error instanceof CropError) {
    return error.code;
  }

  // Not an Error instance
  if (!(error instanceof Error)) {
    return 'unknown';
  }

  const message = error.message.toLowerCase();

  // Memory errors
  if (message.includes('out of memory') || message.includes('oom')) {
    return 'memory';
  }

  // File system errors
  if (
    message.includes('enoent') ||
    message.includes('no such file') ||
    message.includes('file not found')
  ) {
    return 'file_system';
  }

  // Permission errors
  if (message.includes('permission') || message.includes('access denied')) {
    return 'permission';
  }

  // Corruption/invalid data errors
  if (
    message.includes('corrupt') ||
    message.includes('invalid') ||
    message.includes('malformed')
  ) {
    return 'corruption';
  }

  // Network errors
  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('connection')
  ) {
    return 'network';
  }

  // Default to processing error for image-related failures
  return 'processing';
}

/**
 * Wraps an unknown error as a CropError with proper classification.
 *
 * Preserves the original error as the cause for debugging purposes.
 * If the error is already a CropError, returns it unchanged.
 *
 * @param error - Unknown error to wrap
 * @param defaultMessage - Message to use if error has no message
 * @returns CropError instance with appropriate code
 */
export function wrapAsCropError(
  error: unknown,
  defaultMessage = 'Image processing failed'
): CropError {
  // Already a CropError, return as-is
  if (error instanceof CropError) {
    return error;
  }

  const code = classifyError(error);
  const originalError = error instanceof Error ? error : undefined;
  const message = originalError?.message || defaultMessage;

  return new CropError(message, code, originalError);
}
