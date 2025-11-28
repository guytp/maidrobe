/**
 * Auth error toast adapter utility.
 *
 * This module provides integration between the centralized auth error handling
 * (Steps 1-2) and the shared Toast component. It:
 * - Converts normalized auth errors into Toast component props
 * - Maps error severity to appropriate toast types
 * - Ensures user-friendly messages are displayed
 * - Leverages existing Toast accessibility features
 * - Prevents raw Supabase errors from being shown to users
 *
 * The existing Toast component already provides:
 * - Screen reader announcements (accessibilityLiveRegion)
 * - Font scaling support (allowFontScaling, maxFontSizeMultiplier)
 * - WCAG AA compliant contrast and touch targets
 * - Auto-dismiss with manual dismiss option
 *
 * Usage pattern:
 * 1. Call handleAuthError() to normalize the error
 * 2. Call getAuthErrorToastProps() to get Toast props
 * 3. Render Toast component with the props
 *
 * Singleton behavior (one auth toast at a time):
 * - Managed at component level by replacing state
 * - When new error occurs, set new toast props (replaces old)
 * - Toast component handles dismissal and animation
 *
 * @module features/auth/utils/showAuthErrorToast
 */

import type { ToastType } from '../../../core/components/Toast';
import type { NormalizedAuthError, AuthErrorSeverity, AuthFlow } from './authErrorTypes';
import { getAuthErrorMessage } from './authErrorMessages';

/**
 * Props for auth error toast display.
 *
 * This is a subset of ToastProps with pre-configured values
 * for auth error display. Components should spread these into
 * the Toast component along with visible and onDismiss props.
 */
export interface AuthErrorToastProps {
  /** User-facing error message (resolved from i18n) */
  message: string;

  /** Toast type (mapped from error severity) */
  type: ToastType;

  /** Optional duration override (default uses Toast's 4000ms) */
  duration?: number;
}

/**
 * Gets Toast component props for displaying an auth error.
 *
 * This is the main entry point for showing auth errors to users.
 * It takes a normalized error from handleAuthError() and converts
 * it into props suitable for the Toast component.
 *
 * The function:
 * 1. Resolves the user-facing message using getAuthErrorMessage()
 * 2. Maps error severity to appropriate toast type
 * 3. Returns props ready for Toast component
 *
 * Security:
 * - Only uses normalized errors (no raw Supabase errors)
 * - Messages are i18n resolved (no stack traces or codes)
 * - Non-enumerating messages (no account enumeration)
 *
 * Accessibility:
 * - Inherits all accessibility from Toast component
 * - Screen reader will announce the message
 * - Font scaling applies automatically
 * - WCAG AA contrast maintained
 *
 * @param error - Normalized auth error from handleAuthError()
 * @param flow - Authentication flow context
 * @returns Toast props with message and type
 *
 * @example
 * ```typescript
 * // In a component with error handling
 * const [authError, setAuthError] = useState<AuthErrorToastProps | null>(null);
 *
 * try {
 *   await loginUser(email, password);
 * } catch (rawError) {
 *   const normalized = handleAuthError(rawError, { flow: 'login' });
 *   const toastProps = getAuthErrorToastProps(normalized, 'login');
 *   setAuthError(toastProps); // Replaces any previous auth error
 * }
 *
 * // In render
 * {authError && (
 *   <Toast
 *     visible={true}
 *     message={authError.message}
 *     type={authError.type}
 *     duration={authError.duration}
 *     onDismiss={() => setAuthError(null)}
 *   />
 * )}
 * ```
 */
export function getAuthErrorToastProps(
  error: NormalizedAuthError,
  flow: AuthFlow
): AuthErrorToastProps {
  // Step 1: Get user-facing message from Step 2 utility
  // This resolves i18n keys and provides fallbacks
  const message = getAuthErrorMessage(error, flow);

  // Step 2: Map error severity to toast type
  // This determines the visual appearance (color)
  const type = mapSeverityToToastType(error.severity);

  // Step 3: Determine duration based on severity
  // Errors stay longer (5s) to ensure users have time to read
  // Info messages dismiss faster (4s default)
  const duration = error.severity === 'error' ? 5000 : undefined;

  return {
    message,
    type,
    duration,
  };
}

/**
 * Maps auth error severity to Toast type.
 *
 * This function determines the visual appearance of the toast
 * based on the error severity from the normalized error.
 *
 * Mapping strategy:
 * - error -> 'error' (red background, critical issues)
 * - warning -> 'error' (also red, user should pay attention)
 * - info -> 'info' (blue background, informational)
 *
 * We map both 'error' and 'warning' to 'error' type because
 * warnings in auth (like invalid credentials) should be visually
 * prominent to the user, even though they're not system errors.
 *
 * @param severity - Error severity from normalized error
 * @returns Toast type for visual styling
 *
 * @example
 * ```typescript
 * const type = mapSeverityToToastType('error');
 * // Returns: 'error'
 *
 * const type2 = mapSeverityToToastType('warning');
 * // Returns: 'error' (warnings are shown as errors to users)
 *
 * const type3 = mapSeverityToToastType('info');
 * // Returns: 'info'
 * ```
 */
export function mapSeverityToToastType(severity: AuthErrorSeverity): ToastType {
  switch (severity) {
    case 'error':
      // Critical errors: network failures, unknown errors, session expired
      return 'error';

    case 'warning':
      // Expected user errors: invalid credentials, validation failures
      // Show as 'error' type for visual prominence
      return 'error';

    case 'info':
      // Informational messages: email verification needed
      return 'info';

    default: {
      // Exhaustive check - TypeScript will error if we miss a case
      const _exhaustive: never = severity;
      void _exhaustive;
      return 'error';
    }
  }
}

/**
 * Helper function to create auth error toast state.
 *
 * This utility function helps components manage auth error toast state
 * consistently. It combines error normalization and toast prop generation
 * into a single step.
 *
 * Use this when you want to handle errors inline without separate
 * normalization and prop generation steps.
 *
 * @param rawError - Raw error from Supabase or network
 * @param flow - Authentication flow context
 * @param handleAuthError - Error handler function from Step 1
 * @returns Toast props ready for display
 *
 * @example
 * ```typescript
 * import { handleAuthError } from './authErrorHandler';
 * import { createAuthErrorToast } from './showAuthErrorToast';
 *
 * try {
 *   await signUp(email, password);
 * } catch (rawError) {
 *   const toastProps = createAuthErrorToast(rawError, 'signup', handleAuthError);
 *   setErrorToast(toastProps);
 * }
 * ```
 */
export function createAuthErrorToast(
  rawError: unknown,
  flow: AuthFlow,
  handleAuthError: (error: unknown, context: { flow: AuthFlow }) => NormalizedAuthError
): AuthErrorToastProps {
  // Normalize the error using Step 1 handler
  const normalized = handleAuthError(rawError, { flow });

  // Convert to toast props using main function
  return getAuthErrorToastProps(normalized, flow);
}

/**
 * Type guard to check if a value is a valid AuthErrorToastProps.
 *
 * Useful for validating toast props before rendering, especially
 * when working with dynamic data or external sources.
 *
 * @param value - Value to check
 * @returns True if value is valid AuthErrorToastProps
 *
 * @example
 * ```typescript
 * if (isAuthErrorToastProps(someValue)) {
 *   // TypeScript knows someValue is AuthErrorToastProps
 *   <Toast {...someValue} visible={true} onDismiss={() => {}} />
 * }
 * ```
 */
export function isAuthErrorToastProps(value: unknown): value is AuthErrorToastProps {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const props = value as Record<string, unknown>;

  return (
    typeof props.message === 'string' &&
    (props.type === 'success' || props.type === 'error' || props.type === 'info') &&
    (props.duration === undefined || typeof props.duration === 'number')
  );
}
