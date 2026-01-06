/**
 * Error-to-message mapping utility for authentication errors.
 *
 * This module provides centralized mapping from normalized auth errors
 * to user-facing i18n messages. It:
 * - Maps error categories to appropriate i18n keys
 * - Provides flow-specific message customization
 * - Enforces non-enumeration security (prevents user enumeration)
 * - Handles dynamic value replacement (e.g., cooldown seconds)
 * - Provides fallback messages for unmapped errors
 *
 * Security considerations:
 * - Never reveals if an email exists in the system
 * - Uses generic messages for authentication failures
 * - Same message for "wrong password" and "user not found"
 * - Prevents account enumeration attacks
 *
 * @module features/auth/utils/authErrorMessages
 */

import { t } from '../../../core/i18n';
import type { NormalizedAuthError, AuthErrorCategory, AuthFlow } from './authErrorTypes';

/**
 * Union type of all valid i18n keys that can be returned by selectI18nKey.
 *
 * This type ensures compile-time validation of translation keys, preventing
 * typos and invalid key paths from being returned by selectI18nKey.
 *
 * All keys are validated against the actual translation file structure.
 */
type AuthErrorI18nKey =
  | 'screens.auth.login.errors.networkError'
  | 'screens.auth.signup.errors.networkError'
  | 'screens.auth.resetPassword.errors.networkError'
  | 'screens.auth.common.errors.networkError'
  | 'screens.auth.login.errors.invalidCredentials'
  | 'screens.auth.signup.errors.signupFailed'
  | 'screens.auth.resetPassword.errors.tokenInvalid'
  | 'screens.auth.login.sessionMessages.sessionExpired'
  | 'screens.auth.common.errors.invalidCredentials'
  | 'screens.auth.common.errors.unverifiedEmail'
  | 'screens.auth.common.errors.emailAlreadyInUse'
  | 'screens.auth.signup.errors.weakPassword'
  | 'screens.auth.resetPassword.errors.weakPassword'
  | 'screens.auth.common.errors.passwordPolicy'
  | 'screens.auth.login.errors.rateLimitExceeded'
  | 'screens.auth.resetPassword.errors.rateLimitExceeded'
  | 'screens.auth.verify.errors.tooManyRequests'
  | 'screens.auth.common.errors.rateLimited'
  | 'screens.auth.common.errors.unknown';

/**
 * Gets user-facing error message for a normalized auth error.
 *
 * This is the main entry point for converting normalized auth errors
 * into user-friendly i18n messages. It handles:
 * - Category-to-message mapping
 * - Flow-specific customization
 * - Dynamic value replacement
 * - Fallback for missing keys
 * - Non-enumeration security
 *
 * The function always returns a valid, user-friendly message even if
 * the i18n key is missing or the error is malformed.
 *
 * @param error - Normalized auth error from handleAuthError()
 * @param flow - Authentication flow context
 * @returns User-facing error message (resolved i18n string)
 *
 * @example
 * ```typescript
 * const error: NormalizedAuthError = {
 *   category: 'invalid_credentials',
 *   code: '401',
 *   uiMessage: 'auth.errors.invalidCredentials',
 *   severity: 'warning',
 *   isRetryable: false
 * };
 *
 * const message = getAuthErrorMessage(error, 'login');
 * // Returns: "Invalid email or password."
 * ```
 */
export function getAuthErrorMessage(error: NormalizedAuthError, flow: AuthFlow): string {
  try {
    // Step 1: Select appropriate i18n key based on category and flow
    const i18nKey = selectI18nKey(error.category, flow, error.code);

    // Step 2: Resolve i18n key to actual message
    // No type assertion needed: selectI18nKey now returns AuthErrorI18nKey
    // which is a subset of valid TranslationKey, ensuring compile-time safety
    let message = t(i18nKey);

    // Step 3: Apply dynamic replacements (e.g., {seconds} for rate limiting)
    message = applyDynamicReplacements(message, error);

    // Step 4: Fallback if key doesn't exist or returned unchanged
    // (t() returns key itself if translation not found)
    if (!message || message === i18nKey) {
      message = getFallbackMessage(error.category, flow);
    }

    return message;
  } catch {
    // Catastrophic failure: return safe generic message
    return 'Something went wrong. Please try again.';
  }
}

/**
 * Selects appropriate i18n key based on error category, flow, and code.
 *
 * This function implements the core mapping logic, including:
 * - Flow-specific key selection
 * - Non-enumeration enforcement
 * - Special case handling
 *
 * Non-enumeration security:
 * - Login: Same message for wrong password or non-existent user
 * - Signup: Generic message for existing email (don't confirm registration)
 * - Reset: Generic message (don't confirm email exists)
 *
 * Type Safety:
 * Returns AuthErrorI18nKey union type for compile-time validation.
 * All return statements are checked by TypeScript to ensure they are
 * valid translation keys, preventing typos and invalid paths.
 *
 * @param category - Error category
 * @param flow - Authentication flow
 * @param code - Optional error code for additional context
 * @returns Typed i18n key for the error message
 */
function selectI18nKey(
  category: AuthErrorCategory,
  flow: AuthFlow,
  code?: string
): AuthErrorI18nKey {
  // NETWORK ERRORS: Same across all flows
  if (category === 'network') {
    // Use flow-specific network error messages where available
    if (flow === 'login') {
      return 'screens.auth.login.errors.networkError';
    }
    if (flow === 'signup') {
      return 'screens.auth.signup.errors.networkError';
    }
    if (flow === 'reset') {
      return 'screens.auth.resetPassword.errors.networkError';
    }
    // Fallback for refresh/logout
    return 'screens.auth.common.errors.networkError';
  }

  // INVALID CREDENTIALS: Flow-specific, non-enumerating
  if (category === 'invalid_credentials') {
    if (flow === 'login') {
      // Non-enumerating: same for wrong password or non-existent user
      return 'screens.auth.login.errors.invalidCredentials';
    }
    if (flow === 'signup') {
      // Shouldn't happen during signup, but use generic message
      return 'screens.auth.signup.errors.signupFailed';
    }
    if (flow === 'reset') {
      // Invalid token during password reset
      return 'screens.auth.resetPassword.errors.tokenInvalid';
    }
    if (flow === 'refresh') {
      // Session expired or invalid during refresh
      return 'screens.auth.login.sessionMessages.sessionExpired';
    }
    // Default fallback
    return 'screens.auth.common.errors.invalidCredentials';
  }

  // UNVERIFIED EMAIL: Direct user to verification
  if (category === 'unverified_email') {
    return 'screens.auth.common.errors.unverifiedEmail';
  }

  // EMAIL ALREADY IN USE: Non-enumerating during signup
  if (category === 'email_already_in_use') {
    if (flow === 'signup') {
      // Non-enumerating: don't confirm email is registered
      // Use generic signup failure message
      return 'screens.auth.signup.errors.signupFailed';
    }
    // Shouldn't happen in other flows
    return 'screens.auth.common.errors.emailAlreadyInUse';
  }

  // PASSWORD POLICY VIOLATIONS
  if (category === 'password_policy') {
    if (flow === 'signup') {
      return 'screens.auth.signup.errors.weakPassword';
    }
    if (flow === 'reset') {
      return 'screens.auth.resetPassword.errors.weakPassword';
    }
    // Default password policy message
    return 'screens.auth.common.errors.passwordPolicy';
  }

  // SESSION EXPIRED: Flow-specific messages
  if (category === 'session_expired') {
    if (flow === 'reset') {
      // Expired reset token
      return 'screens.auth.resetPassword.errors.tokenInvalid';
    }
    // Login, refresh, or other flows: session expired
    return 'screens.auth.login.sessionMessages.sessionExpired';
  }

  // RATE LIMITED: Flow-specific with cooldown support
  if (category === 'rate_limited') {
    if (flow === 'login') {
      return 'screens.auth.login.errors.rateLimitExceeded';
    }
    if (flow === 'reset') {
      return 'screens.auth.resetPassword.errors.rateLimitExceeded';
    }
    if (flow === 'signup') {
      return 'screens.auth.verify.errors.tooManyRequests';
    }
    // Default rate limit message
    return 'screens.auth.common.errors.rateLimited';
  }

  // UNKNOWN ERRORS: Generic friendly fallback
  if (category === 'unknown') {
    return 'screens.auth.common.errors.unknown';
  }

  // Exhaustive check - should never reach here
  const _exhaustive: never = category;
  void _exhaustive;
  return 'screens.auth.common.errors.unknown';
}

/**
 * Applies dynamic value replacements to message strings.
 *
 * Replaces placeholders like {seconds} with actual values from
 * the error object. This is used for rate limiting messages
 * that show cooldown times.
 *
 * Supported placeholders:
 * - {seconds}: Cooldown time in seconds (from error code)
 *
 * @param message - Message with possible placeholders
 * @param error - Normalized auth error
 * @returns Message with placeholders replaced
 *
 * @example
 * ```typescript
 * const message = "Please wait {seconds} seconds.";
 * const error = { category: 'rate_limited', code: '45', ... };
 * const result = applyDynamicReplacements(message, error);
 * // Returns: "Please wait 45 seconds."
 * ```
 */
function applyDynamicReplacements(message: string, error: NormalizedAuthError): string {
  // Handle {seconds} placeholder for rate limiting
  if (message.includes('{seconds}')) {
    const seconds = extractSecondsFromError(error);
    if (seconds !== null) {
      return message.replace('{seconds}', seconds.toString());
    }
    // If we can't extract seconds, use generic "a few"
    return message.replace('{seconds}', 'a few');
  }

  return message;
}

/**
 * Extracts cooldown seconds from error object.
 *
 * Attempts to extract numeric seconds from error code or metadata.
 * This is used for rate limiting messages with dynamic cooldown times.
 *
 * @param error - Normalized auth error
 * @returns Seconds as number, or null if not found
 */
function extractSecondsFromError(error: NormalizedAuthError): number | null {
  // Try to parse code as number (many rate limiters put seconds in code)
  if (error.code) {
    const parsed = parseInt(error.code, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 3600) {
      // Reasonable range: 1 second to 1 hour
      return parsed;
    }
  }

  // Could not extract seconds
  return null;
}

/**
 * Gets fallback message when i18n key is missing.
 *
 * Provides hard-coded fallback messages for all error categories.
 * These are used when i18n keys don't exist or t() fails.
 *
 * Fallback messages are:
 * - User-friendly and non-technical
 * - Non-enumerating (no account enumeration)
 * - Actionable where possible
 * - Generic but helpful
 *
 * @param category - Error category
 * @param flow - Authentication flow (for context-specific fallbacks)
 * @returns Fallback error message
 */
function getFallbackMessage(category: AuthErrorCategory, flow: AuthFlow): string {
  switch (category) {
    case 'network':
      return 'Unable to connect. Please check your internet connection.';

    case 'invalid_credentials':
      if (flow === 'login') {
        return 'Invalid email or password.';
      }
      if (flow === 'reset') {
        return 'This reset link is no longer valid.';
      }
      return 'Authentication failed. Please try again.';

    case 'unverified_email':
      return 'Please verify your email address to continue.';

    case 'email_already_in_use':
      // Non-enumerating: don't confirm email is registered
      return 'Unable to create account. Please try a different email.';

    case 'password_policy':
      return 'Password does not meet requirements.';

    case 'session_expired':
      if (flow === 'reset') {
        return 'This reset link has expired. Please request a new one.';
      }
      return 'Your session has expired. Please log in again.';

    case 'rate_limited':
      return 'Too many attempts. Please wait and try again.';

    case 'unknown':
      return 'Something went wrong. Please try again.';

    default: {
      const _exhaustive: never = category;
      void _exhaustive;
      return 'Something went wrong. Please try again.';
    }
  }
}

/**
 * Fallback messages for all error categories.
 *
 * These are used when i18n resolution fails or keys are missing.
 * All messages are non-technical, user-friendly, and non-enumerating.
 *
 * @internal
 */
export const FALLBACK_MESSAGES: Record<AuthErrorCategory, string> = {
  network: 'Unable to connect. Please check your internet connection.',
  invalid_credentials: 'Invalid email or password.',
  unverified_email: 'Please verify your email address.',
  email_already_in_use: 'Unable to create account.',
  password_policy: 'Password does not meet requirements.',
  session_expired: 'Your session has expired. Please log in again.',
  rate_limited: 'Too many attempts. Please try again later.',
  unknown: 'Something went wrong. Please try again.',
};
