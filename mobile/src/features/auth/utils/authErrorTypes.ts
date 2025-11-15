/**
 * Type definitions for centralized auth error handling.
 *
 * This module defines the normalized error contract used across all auth flows
 * (signup, login, password reset, token refresh, logout). It provides:
 * - Standardized error categories specific to authentication
 * - Normalized error result interface for consistent error handling
 * - Type safety for error classification and severity mapping
 *
 * @module features/auth/utils/authErrorTypes
 */

/**
 * Authentication error categories.
 *
 * These categories classify all possible auth-related errors into
 * well-defined buckets for consistent handling across flows.
 *
 * Categories:
 * - network: Connection failures, timeouts, DNS errors
 * - invalid_credentials: Wrong password, email not found, auth failures
 * - unverified_email: Email address not confirmed/verified
 * - email_already_in_use: Signup attempt with existing email
 * - password_policy: Password validation failures (length, complexity, reuse)
 * - session_expired: Expired tokens, invalid refresh tokens
 * - rate_limited: Too many attempts, rate limiting triggered
 * - unknown: Unmapped or unexpected errors
 */
export type AuthErrorCategory =
  | 'network'
  | 'invalid_credentials'
  | 'unverified_email'
  | 'email_already_in_use'
  | 'password_policy'
  | 'session_expired'
  | 'rate_limited'
  | 'unknown';

/**
 * Error severity levels for UI presentation and logging.
 *
 * - info: Informational messages (e.g., email verification needed)
 * - warning: Expected user errors (e.g., wrong password, validation failures)
 * - error: Unexpected errors requiring attention (e.g., network, server failures)
 */
export type AuthErrorSeverity = 'info' | 'warning' | 'error';

/**
 * Authentication flow types for contextual error classification.
 *
 * The flow context helps disambiguate errors that have similar shapes
 * but different meanings depending on the operation (e.g., 401 during
 * login vs 401 during token refresh).
 */
export type AuthFlow = 'signup' | 'login' | 'reset' | 'refresh' | 'logout';

/**
 * Normalized authentication error result.
 *
 * This interface represents the canonical error shape returned by the
 * central error handler. All auth flows consume this normalized format
 * for consistent error handling, UI display, and telemetry logging.
 *
 * @property category - Classified error type (one of 8 auth categories)
 * @property code - Optional underlying error code (HTTP status, Supabase code, etc.)
 * @property uiMessage - User-facing message key or text for display
 * @property severity - Error severity level for UI styling and logging
 * @property isRetryable - Whether retrying the operation might succeed
 */
export interface NormalizedAuthError {
  /** Classified error category */
  category: AuthErrorCategory;

  /** Optional underlying error code (e.g., HTTP status, error identifier) */
  code?: string;

  /** User-facing message key (i18n) or fallback text */
  uiMessage: string;

  /** Severity level for UI presentation and logging */
  severity: AuthErrorSeverity;

  /** Whether retrying the operation is likely to succeed */
  isRetryable: boolean;
}

/**
 * Context information for auth error handling.
 *
 * Provides additional context to the error handler for better
 * classification and debugging.
 *
 * @property flow - Which auth operation triggered the error
 */
export interface AuthErrorContext {
  /** Authentication flow that triggered this error */
  flow: AuthFlow;
}

/**
 * Supabase auth error shape (defensive typing).
 *
 * This interface represents the observed shape of Supabase auth errors.
 * Properties are optional to handle various error shapes defensively.
 *
 * Observed properties:
 * - message: Error description (always present for Error instances)
 * - status: HTTP status code (present for API errors)
 * - code: Supabase-specific error code (sometimes present)
 * - name: Error name/type (standard Error property)
 */
export interface SupabaseAuthError {
  /** Error message */
  message?: string;

  /** HTTP status code (if available) */
  status?: number;

  /** Supabase error code (if available) */
  code?: string;

  /** Error name/type */
  name?: string;

  /** Error stack trace */
  stack?: string;
}
