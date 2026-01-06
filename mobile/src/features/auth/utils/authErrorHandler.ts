/**
 * Centralized authentication error handler.
 *
 * This module provides the core error handling logic for all auth flows
 * (signup, login, password reset, token refresh, logout). It:
 * - Defensively inspects Supabase and network error shapes
 * - Classifies errors into auth-specific categories
 * - Returns normalized error objects for UI and logging
 * - Never throws, always returns a valid error object
 *
 * Design principles:
 * - Defensive: Never assumes error properties exist
 * - Consistent: All auth flows use the same classification logic
 * - Extensible: Easy to add new error patterns and categories
 * - Safe: Never exposes sensitive information in error messages
 *
 * @module features/auth/utils/authErrorHandler
 */

import type {
  AuthErrorCategory,
  AuthErrorContext,
  AuthErrorSeverity,
  NormalizedAuthError,
  SupabaseAuthError,
} from './authErrorTypes';

/**
 * Central authentication error handler.
 *
 * This function is the single entry point for all auth error handling.
 * It accepts any error shape (Supabase errors, network errors, validation
 * errors, etc.) and returns a normalized error object suitable for both
 * UI display and telemetry logging.
 *
 * Classification strategy:
 * 1. HTTP status code inspection (most reliable signal)
 * 2. Error message pattern matching (fallback)
 * 3. Flow context for disambiguation (e.g., 401 during login vs refresh)
 * 4. Defensive fallback to 'unknown' category
 *
 * Guarantees:
 * - Never throws (all code paths return valid object)
 * - Always provides uiMessage (even if generic fallback)
 * - Handles null, undefined, and malformed errors gracefully
 *
 * @param rawError - The error from Supabase, network, or validation
 * @param context - Context information (auth flow type)
 * @returns Normalized auth error object
 *
 * @example
 * ```typescript
 * // Login with wrong password
 * const error = { message: "Invalid login credentials", status: 401 };
 * const normalized = handleAuthError(error, { flow: 'login' });
 * // {
 * //   category: 'invalid_credentials',
 * //   code: '401',
 * //   uiMessage: 'auth.errors.invalidCredentials',
 * //   severity: 'warning',
 * //   isRetryable: false
 * // }
 * ```
 *
 * @example
 * ```typescript
 * // Network timeout
 * const error = new Error("Network request failed");
 * const normalized = handleAuthError(error, { flow: 'signup' });
 * // {
 * //   category: 'network',
 * //   code: undefined,
 * //   uiMessage: 'auth.errors.network',
 * //   severity: 'error',
 * //   isRetryable: true
 * // }
 * ```
 */
export function handleAuthError(rawError: unknown, context: AuthErrorContext): NormalizedAuthError {
  try {
    // Extract error information defensively
    const errorInfo = extractErrorInfo(rawError);

    // Classify the error based on status code, message, and context
    const category = classifyAuthError(errorInfo, context);

    // Map category to severity
    const severity = mapCategoryToSeverity(category);

    // Determine if error is retryable
    const isRetryable = isErrorRetryable(category, context);

    // Get user-facing message key
    const uiMessage = mapCategoryToMessageKey(category);

    // Extract error code (HTTP status or other identifier)
    const code = errorInfo.status?.toString() || errorInfo.code;

    return {
      category,
      code,
      uiMessage,
      severity,
      isRetryable,
    };
  } catch {
    // If error handling itself fails, return safe fallback
    // This should never happen, but defensive programming requires it
    return createFallbackError();
  }
}

/**
 * Extracted error information structure.
 *
 * Internal interface for normalized error data extraction.
 */
interface ErrorInfo {
  message: string;
  status?: number;
  code?: string;
  name?: string;
}

/**
 * Extracts error information from unknown error shape.
 *
 * Defensively extracts message, status, code, and name from any
 * error object. Handles Error instances, Supabase errors, plain
 * objects, and primitive values.
 *
 * @param error - Unknown error object
 * @returns Extracted error information
 */
function extractErrorInfo(error: unknown): ErrorInfo {
  // Handle null or undefined
  if (error == null) {
    return {
      message: 'Unknown error occurred',
    };
  }

  // Handle Error instances
  if (error instanceof Error) {
    const info: ErrorInfo = {
      message: error.message || 'Unknown error',
      name: error.name,
    };

    // Check for status property (Supabase errors)
    if (typeof error === 'object' && 'status' in error) {
      const status = (error as SupabaseAuthError).status;
      if (typeof status === 'number') {
        info.status = status;
      } else if (typeof status === 'string') {
        // Handle status as string (parse to number)
        const parsed = parseInt(status, 10);
        if (!isNaN(parsed)) {
          info.status = parsed;
        }
      }
    }

    // Check for code property (Supabase error codes)
    if (typeof error === 'object' && 'code' in error) {
      const code = (error as SupabaseAuthError).code;
      if (typeof code === 'string') {
        info.code = code;
      }
    }

    return info;
  }

  // Handle plain objects with error-like properties
  if (typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    const info: ErrorInfo = {
      message: typeof obj.message === 'string' ? obj.message : 'Unknown error',
    };

    // Extract status
    if (typeof obj.status === 'number') {
      info.status = obj.status;
    } else if (typeof obj.status === 'string') {
      const parsed = parseInt(obj.status, 10);
      if (!isNaN(parsed)) {
        info.status = parsed;
      }
    }

    // Extract code
    if (typeof obj.code === 'string') {
      info.code = obj.code;
    }

    // Extract name
    if (typeof obj.name === 'string') {
      info.name = obj.name;
    }

    return info;
  }

  // Handle primitive values (string, number, etc.)
  return {
    message: String(error),
  };
}

/**
 * Classifies auth error into specific category.
 *
 * Uses a multi-stage classification strategy:
 * 1. HTTP status codes (most reliable)
 * 2. Error message patterns (fallback)
 * 3. Flow context for disambiguation
 *
 * @param errorInfo - Extracted error information
 * @param context - Auth flow context
 * @returns Error category
 */
function classifyAuthError(errorInfo: ErrorInfo, context: AuthErrorContext): AuthErrorCategory {
  const message = errorInfo.message.toLowerCase();
  const status = errorInfo.status;

  // Stage 1: Classify by HTTP status code (most reliable)
  if (status !== undefined) {
    const category = classifyByStatusCode(status, message, context);
    if (category !== null) {
      return category;
    }
  }

  // Stage 2: Classify by message patterns
  const category = classifyByMessagePattern(message, context);
  if (category !== null) {
    return category;
  }

  // Stage 3: Fallback to unknown
  return 'unknown';
}

/**
 * Classifies error by HTTP status code.
 *
 * @param status - HTTP status code
 * @param message - Error message (for disambiguation)
 * @param context - Auth flow context
 * @returns Error category or null if status doesn't determine category
 */
function classifyByStatusCode(
  status: number,
  message: string,
  context: AuthErrorContext
): AuthErrorCategory | null {
  // 401 Unauthorized - context-dependent
  if (status === 401) {
    // During token refresh, 401 means session expired
    if (context.flow === 'refresh') {
      return 'session_expired';
    }

    // Check message for session/token expiry indicators
    if (
      message.includes('expired') ||
      message.includes('invalid grant') ||
      message.includes('invalid refresh token') ||
      message.includes('refresh token')
    ) {
      return 'session_expired';
    }

    // During login/signup, 401 means invalid credentials
    if (context.flow === 'login' || context.flow === 'signup') {
      return 'invalid_credentials';
    }

    // Default 401 to invalid credentials
    return 'invalid_credentials';
  }

  // 403 Forbidden - could be unverified email or other auth issue
  if (status === 403) {
    if (
      message.includes('email not confirmed') ||
      message.includes('email not verified') ||
      message.includes('verify your email')
    ) {
      return 'unverified_email';
    }
    // Other 403 errors default to invalid credentials
    return 'invalid_credentials';
  }

  // 400 Bad Request - could be validation or existing user
  if (status === 400) {
    if (
      message.includes('user already registered') ||
      message.includes('email already') ||
      message.includes('already exists')
    ) {
      return 'email_already_in_use';
    }
    // Other 400 errors might be validation issues
    if (
      message.includes('password') &&
      (message.includes('weak') || message.includes('requirement') || message.includes('policy'))
    ) {
      return 'password_policy';
    }
    // Generic 400 falls through to message classification
    return null;
  }

  // 422 Unprocessable Entity - validation failures
  if (status === 422) {
    if (
      message.includes('password') ||
      message.includes('weak') ||
      message.includes('requirement')
    ) {
      return 'password_policy';
    }
    // Other validation errors fall through
    return null;
  }

  // 429 Too Many Requests - rate limiting
  if (status === 429) {
    return 'rate_limited';
  }

  // 5xx Server Errors - map to unknown (outside auth scope)
  if (status >= 500 && status < 600) {
    return 'unknown';
  }

  // Other status codes don't determine category
  return null;
}

/**
 * Classifies error by message pattern matching.
 *
 * This is the fallback when status code is unavailable or doesn't
 * determine the category. It searches for known error message patterns.
 *
 * @param message - Lowercased error message
 * @param context - Auth flow context (for disambiguation)
 * @returns Error category or null if no pattern matches
 */
function classifyByMessagePattern(
  message: string,
  context: AuthErrorContext
): AuthErrorCategory | null {
  // Network errors
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('dns') ||
    message.includes('offline') ||
    message.includes('econnrefused') ||
    message.includes('enotfound')
  ) {
    return 'network';
  }

  // Invalid credentials
  if (
    message.includes('invalid login credentials') ||
    message.includes('invalid credentials') ||
    message.includes('invalid email or password') ||
    message.includes('incorrect password') ||
    message.includes('wrong password') ||
    message.includes('email not found') ||
    message.includes('user not found') ||
    (message.includes('invalid') && message.includes('password'))
  ) {
    return 'invalid_credentials';
  }

  // Unverified email
  if (
    message.includes('email not confirmed') ||
    message.includes('email not verified') ||
    message.includes('verify your email') ||
    message.includes('confirmation required')
  ) {
    return 'unverified_email';
  }

  // Email already in use
  if (
    message.includes('user already registered') ||
    message.includes('email already') ||
    message.includes('already exists') ||
    message.includes('duplicate')
  ) {
    return 'email_already_in_use';
  }

  // Password policy violations
  if (
    message.includes('password is too weak') ||
    message.includes('password does not meet') ||
    message.includes('password requirement') ||
    message.includes('password policy') ||
    message.includes('weak password') ||
    message.includes('password reused') ||
    message.includes('password must')
  ) {
    return 'password_policy';
  }

  // Session expired / token issues
  if (
    message.includes('session expired') ||
    message.includes('token expired') ||
    message.includes('invalid grant') ||
    message.includes('refresh token') ||
    message.includes('token invalid') ||
    message.includes('token not found') ||
    (message.includes('expired') && context.flow === 'refresh')
  ) {
    return 'session_expired';
  }

  // Rate limiting
  if (
    message.includes('rate limit') ||
    message.includes('too many') ||
    message.includes('throttled') ||
    message.includes('quota exceeded')
  ) {
    return 'rate_limited';
  }

  // No pattern matched
  return null;
}

/**
 * Maps error category to severity level.
 *
 * Severity levels:
 * - info: Informational (unverified_email)
 * - warning: Expected user errors (invalid_credentials, validation, rate limits)
 * - error: Unexpected errors (network, session expired, unknown)
 *
 * @param category - Error category
 * @returns Severity level
 */
function mapCategoryToSeverity(category: AuthErrorCategory): AuthErrorSeverity {
  switch (category) {
    case 'unverified_email':
      return 'info';

    case 'invalid_credentials':
    case 'email_already_in_use':
    case 'password_policy':
    case 'rate_limited':
      return 'warning';

    case 'network':
    case 'session_expired':
    case 'unknown':
      return 'error';

    default: {
      // Exhaustive check - TypeScript will error if we miss a category
      const _exhaustive: never = category;
      void _exhaustive;
      return 'error';
    }
  }
}

/**
 * Determines if error is retryable.
 *
 * Retryable errors are those where retrying the same operation
 * might succeed (e.g., network issues, rate limits after cooldown, transient failures).
 *
 * Non-retryable errors are permanent failures that won't change
 * on retry (e.g., invalid credentials, validation errors).
 *
 * @param category - Error category
 * @param context - Auth flow context
 * @returns Whether error is retryable
 */
function isErrorRetryable(category: AuthErrorCategory, context: AuthErrorContext): boolean {
  switch (category) {
    // Retryable: Network issues, rate limits, and unknown errors (might be transient)
    case 'network':
    case 'rate_limited':
    case 'unknown':
      return true;

    // Session expired might be retryable after token refresh
    // But not retryable with the same expired token
    case 'session_expired':
      return false;

    // Non-retryable: Permanent failures
    case 'invalid_credentials':
    case 'unverified_email':
    case 'email_already_in_use':
    case 'password_policy':
      return false;

    default: {
      const _exhaustive: never = category;
      void _exhaustive;
      return false;
    }
  }
}

/**
 * Maps error category to i18n message key.
 *
 * Returns an i18n key that will be resolved to user-facing text
 * by the error message mapping utility (Step 2).
 *
 * Message keys follow the pattern: auth.errors.<category>
 *
 * @param category - Error category
 * @returns i18n message key
 */
function mapCategoryToMessageKey(category: AuthErrorCategory): string {
  switch (category) {
    case 'network':
      return 'auth.errors.network';
    case 'invalid_credentials':
      return 'auth.errors.invalidCredentials';
    case 'unverified_email':
      return 'auth.errors.unverifiedEmail';
    case 'email_already_in_use':
      return 'auth.errors.emailAlreadyInUse';
    case 'password_policy':
      return 'auth.errors.passwordPolicy';
    case 'session_expired':
      return 'auth.errors.sessionExpired';
    case 'rate_limited':
      return 'auth.errors.rateLimited';
    case 'unknown':
      return 'auth.errors.unknown';
    default: {
      const _exhaustive: never = category;
      void _exhaustive;
      return 'auth.errors.unknown';
    }
  }
}

/**
 * Creates a safe fallback error for catastrophic failures.
 *
 * This is returned when error handling itself fails (should never happen).
 * Provides a minimal valid error object that won't crash the app.
 *
 * @returns Fallback error object
 */
function createFallbackError(): NormalizedAuthError {
  return {
    category: 'unknown',
    code: undefined,
    uiMessage: 'auth.errors.unknown',
    severity: 'error',
    isRetryable: true,
  };
}
