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
  if (message.includes('corrupt') || message.includes('invalid') || message.includes('malformed')) {
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

/**
 * Structured error data for logging and telemetry.
 *
 * Contains all relevant error information in a format suitable
 * for structured logging systems.
 */
export interface ErrorLogData {
  /** Error message */
  message: string;
  /** Error name/type */
  name: string;
  /** CropErrorCode if available */
  code?: CropErrorCode;
  /** Stack trace */
  stack?: string;
  /** Cause chain - array of nested error details */
  causeChain: {
    message: string;
    name: string;
    stack?: string;
  }[];
}

/**
 * Extracts the full chain of errors from a potentially nested error.
 *
 * Traverses the error.cause chain to collect all errors that led to
 * the current failure. Useful for debugging cascading failures where
 * the root cause is wrapped multiple times.
 *
 * @param error - Error to extract chain from
 * @param maxDepth - Maximum chain depth to prevent infinite loops (default: 10)
 * @returns Array of errors from outermost to innermost (root cause last)
 *
 * @example
 * ```ts
 * const rootCause = new Error('File not found');
 * const wrapper = new CropError('Processing failed', 'file_system', rootCause);
 * const chain = getErrorChain(wrapper);
 * // chain = [wrapper, rootCause]
 * ```
 */
export function getErrorChain(error: unknown, maxDepth = 10): Error[] {
  const chain: Error[] = [];

  let current: unknown = error;
  let depth = 0;

  while (current instanceof Error && depth < maxDepth) {
    chain.push(current);

    // Access cause - could be on CropError or standard Error with cause
    const cause = (current as { cause?: unknown }).cause;
    current = cause;
    depth++;
  }

  return chain;
}

/**
 * Formats an error and its cause chain for structured logging.
 *
 * Extracts all relevant information from an error including its
 * CropErrorCode (if applicable) and full cause chain. The resulting
 * object is suitable for passing to telemetry systems.
 *
 * @param error - Error to format
 * @returns Structured error data for logging
 *
 * @example
 * ```ts
 * try {
 *   await cropAndProcessImage(...);
 * } catch (error) {
 *   const logData = formatErrorForLogging(error);
 *   logError(error, 'user', {
 *     feature: 'crop',
 *     operation: 'image_processing',
 *     metadata: logData,
 *   });
 * }
 * ```
 */
export function formatErrorForLogging(error: unknown): ErrorLogData {
  // Handle non-Error values
  if (!(error instanceof Error)) {
    return {
      message: String(error),
      name: 'UnknownError',
      causeChain: [],
    };
  }

  const chain = getErrorChain(error);
  const primaryError = chain[0];

  // Build cause chain (excluding the primary error)
  const causeChain = chain.slice(1).map((err) => ({
    message: err.message,
    name: err.name,
    stack: err.stack,
  }));

  const result: ErrorLogData = {
    message: primaryError.message,
    name: primaryError.name,
    stack: primaryError.stack,
    causeChain,
  };

  // Add code if it's a CropError
  if (primaryError instanceof CropError) {
    result.code = primaryError.code;
  }

  return result;
}
