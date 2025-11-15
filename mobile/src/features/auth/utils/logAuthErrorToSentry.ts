/**
 * Sentry logging helper for authentication errors.
 *
 * This module provides centralized Sentry logging for auth errors with:
 * - Feature flag control (EXPO_PUBLIC_AUTH_ERROR_LOGGING_ENABLED)
 * - Metadata enrichment (flow, platform, environment, category, severity)
 * - PII sanitization (passwords, tokens, email masking)
 * - Graceful degradation (no-op when Sentry unavailable)
 * - Never blocks auth flows or UI
 *
 * The logging helper integrates with:
 * - Step 1: NormalizedAuthError from handleAuthError()
 * - Existing telemetry: Sentry client and sanitization utilities
 * - React Native Platform API for platform detection
 *
 * Environment variables:
 * - EXPO_PUBLIC_AUTH_ERROR_LOGGING_ENABLED: Enable/disable auth error logging
 * - EXPO_PUBLIC_SENTRY_ENABLED: Enable/disable Sentry (from telemetry)
 * - EXPO_PUBLIC_SENTRY_DSN: Sentry project DSN (from telemetry)
 * - EXPO_PUBLIC_SENTRY_ENVIRONMENT: Environment name (from telemetry)
 *
 * @module features/auth/utils/logAuthErrorToSentry
 */

import { Platform } from 'react-native';
import type { NormalizedAuthError, AuthErrorSeverity, AuthFlow } from './authErrorTypes';
import { captureException, getSentryClient } from '../../../core/telemetry/sentry';
import type { SentrySeverity } from '../../../core/telemetry/sentry';
import { sanitizeAuthMetadata } from '../../../core/telemetry';
import { getFlagConfig } from '../../../core/featureFlags/config';

/**
 * Context information for auth error logging.
 *
 * Provides additional metadata for Sentry event enrichment.
 */
export interface AuthErrorLoggingContext {
  /** Authentication flow that triggered the error */
  flow: AuthFlow;

  /** Optional user ID for event correlation */
  userId?: string;

  /** Platform override (auto-detected if not provided) */
  platform?: 'ios' | 'android' | 'unknown';

  /** Additional metadata for debugging */
  metadata?: Record<string, unknown>;
}

/**
 * Logs authentication error to Sentry with enriched metadata.
 *
 * This is the main entry point for logging auth errors to Sentry.
 * It performs comprehensive checks and sanitization before sending
 * events to ensure:
 * - Feature flag compliance
 * - PII protection
 * - Graceful degradation
 * - Never blocks auth flows
 *
 * The function will no-op (do nothing) if:
 * - Auth error logging is disabled (feature flag)
 * - Sentry is not configured or unavailable
 * - Any error occurs during logging itself
 *
 * Metadata enrichment includes:
 * - flow: Authentication operation (login, signup, etc.)
 * - platform: iOS, Android, or unknown
 * - environment: development, staging, production
 * - category: Error category from normalized error
 * - severity: Error severity level
 * - code: Optional error code
 * - isRetryable: Whether error is retryable
 *
 * PII sanitization:
 * - Removes passwords, tokens, session data
 * - Masks email addresses (first 3 chars + ***)
 * - Only logs userId (internal identifier)
 * - Sanitizes all metadata fields
 *
 * @param errorResult - Normalized error from handleAuthError()
 * @param rawError - Original error (for stack trace if available)
 * @param context - Context metadata (flow, userId, platform, etc.)
 *
 * @example
 * ```typescript
 * try {
 *   await loginUser(email, password);
 * } catch (rawError) {
 *   const normalized = handleAuthError(rawError, { flow: 'login' });
 *
 *   logAuthErrorToSentry(normalized, rawError, {
 *     flow: 'login',
 *     userId: user?.id,
 *     metadata: { attempt: 1 }
 *   });
 *
 *   // Continue with UI error handling
 *   const toastProps = getAuthErrorToastProps(normalized, 'login');
 *   setErrorToast(toastProps);
 * }
 * ```
 */
export function logAuthErrorToSentry(
  errorResult: NormalizedAuthError,
  rawError: unknown,
  context: AuthErrorLoggingContext
): void {
  try {
    // Step 1: Check if auth error logging is enabled
    if (!isAuthErrorLoggingEnabled()) {
      return; // Feature flag disabled - no-op
    }

    // Step 2: Check if Sentry is configured and available
    const sentryClient = getSentryClient();
    if (!sentryClient.enabled) {
      return; // Sentry not enabled - no-op
    }

    // Step 3: Get platform information
    const platform = context.platform || getPlatform();

    // Step 4: Get environment
    const environment = getEnvironment();

    // Step 5: Sanitize metadata (remove PII)
    const sanitizedMetadata = context.metadata
      ? sanitizeErrorMetadata(context.metadata, environment)
      : {};

    // Step 6: Create Error instance for Sentry
    // Use normalized error category as message (not raw error)
    const errorForSentry = createErrorForSentry(errorResult, rawError);

    // Step 7: Map auth severity to Sentry severity
    const sentrySeverity = mapAuthSeverityToSentry(errorResult.severity);

    // Step 8: Build tags for categorization and filtering
    const tags: Record<string, string> = {
      flow: context.flow,
      category: errorResult.category,
      platform,
      environment,
    };

    // Add code as tag if present (helps with filtering)
    if (errorResult.code) {
      tags.errorCode = errorResult.code;
    }

    // Step 9: Build extra metadata for debugging
    const extra: Record<string, unknown> = {
      category: errorResult.category,
      severity: errorResult.severity,
      isRetryable: errorResult.isRetryable,
      ...sanitizedMetadata,
    };

    // Add code to extra if present
    if (errorResult.code) {
      extra.code = errorResult.code;
    }

    // Add userId to extra if provided (not tags for privacy)
    if (context.userId) {
      extra.userId = context.userId;
    }

    // Step 10: Send to Sentry
    captureException(errorForSentry, {
      level: sentrySeverity,
      tags,
      extra,
    });
  } catch (loggingError) {
    // Logging failed - log to console but don't throw
    // This ensures auth flows continue even if logging breaks
    // eslint-disable-next-line no-console
    console.error('[Auth Error Logging] Failed to log to Sentry:', loggingError);
  }
}

/**
 * Checks if auth error logging is enabled via feature flag.
 *
 * Uses the centralized feature flag system to read configuration.
 * Environment variable: EXPO_PUBLIC_FEATURE_AUTH_ERRORLOGGING_ENABLED
 * Default is true (enabled) per feature flag fail-safe design.
 *
 * @returns True if auth error logging is enabled
 */
function isAuthErrorLoggingEnabled(): boolean {
  try {
    const config = getFlagConfig('auth.errorLogging');
    return config.enabled;
  } catch {
    // On error, default to false for privacy
    return false;
  }
}

/**
 * Gets current platform (iOS, Android, or unknown).
 *
 * Uses React Native Platform API to detect platform.
 * Falls back to 'unknown' if detection fails.
 *
 * @returns Platform identifier
 */
function getPlatform(): 'ios' | 'android' | 'unknown' {
  try {
    const os = Platform.OS;
    if (os === 'ios' || os === 'android') {
      return os;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Gets current environment name.
 *
 * Reads from EXPO_PUBLIC_SENTRY_ENVIRONMENT.
 * Defaults to 'development' if not set.
 *
 * @returns Environment name
 */
function getEnvironment(): string {
  return process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT || 'development';
}

/**
 * Maps auth error severity to Sentry severity level.
 *
 * Mapping:
 * - error -> 'error' (critical issues)
 * - warning -> 'warning' (user errors needing attention)
 * - info -> 'info' (informational messages)
 *
 * @param severity - Auth error severity
 * @returns Sentry severity level
 */
function mapAuthSeverityToSentry(severity: AuthErrorSeverity): SentrySeverity {
  switch (severity) {
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    case 'info':
      return 'info';
    default:
      // Exhaustive check
      const _exhaustive: never = severity;
      return 'error';
  }
}

/**
 * Creates Error instance for Sentry from normalized error.
 *
 * Strategy:
 * - Use normalized error category as message (safe, non-PII)
 * - Extract stack trace from raw error if available
 * - Never expose raw Supabase errors or sensitive data
 *
 * @param errorResult - Normalized auth error
 * @param rawError - Original error (for stack trace)
 * @returns Error instance for Sentry
 */
function createErrorForSentry(
  errorResult: NormalizedAuthError,
  rawError: unknown
): Error {
  // Create error with normalized category as message
  // This ensures we never send raw Supabase errors to Sentry
  const message = `Auth error: ${errorResult.category}`;
  const error = new Error(message);

  // Try to extract stack trace from raw error if it's an Error instance
  // This helps with debugging while keeping messages safe
  if (rawError instanceof Error && rawError.stack) {
    error.stack = rawError.stack;
  }

  // Set error name for better categorization in Sentry
  error.name = 'AuthError';

  return error;
}

/**
 * Sanitizes error metadata to remove PII.
 *
 * This function provides environment-aware sanitization:
 * - Always removes passwords, tokens, session data
 * - Masks email addresses based on environment
 * - Preserves safe fields for debugging
 *
 * Email masking strategy:
 * - Production: Always mask (first 3 chars + ***)
 * - Development/Staging: Mask for consistency
 *
 * @param metadata - Raw metadata that may contain PII
 * @param environment - Current environment (for masking strategy)
 * @returns Sanitized metadata safe for logging
 */
function sanitizeErrorMetadata(
  metadata: Record<string, unknown>,
  environment: string
): Record<string, unknown> {
  // Use existing sanitization from telemetry module
  // This handles password/token removal and email masking
  const sanitized = sanitizeAuthMetadata(metadata);

  // Additional sanitization for nested objects
  const doubleSanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(sanitized)) {
    // Recursively sanitize nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      doubleSanitized[key] = sanitizeAuthMetadata(value as Record<string, unknown>);
    } else {
      doubleSanitized[key] = value;
    }
  }

  return doubleSanitized;
}

/**
 * Helper function to check if Sentry is available and configured.
 *
 * This is useful for testing or conditionally enabling logging.
 * Checks both feature flag and Sentry configuration.
 *
 * @returns True if logging is possible
 */
export function isAuthErrorLoggingAvailable(): boolean {
  if (!isAuthErrorLoggingEnabled()) {
    return false;
  }

  const sentryClient = getSentryClient();
  return sentryClient.enabled;
}
