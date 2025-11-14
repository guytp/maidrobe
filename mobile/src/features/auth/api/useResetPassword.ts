import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../../services/supabase';
import { logError, getUserFriendlyMessage, logAuthEvent } from '../../../core/telemetry';
import type { ErrorClassification } from '../../../core/telemetry';
import { ResetPasswordRequestSchema } from '../utils/passwordResetSchemas';
import type { ResetPasswordRequest } from '../utils/passwordResetSchemas';
import { validatePassword } from '../utils/validation';
import { checkPasswordReuse } from '../utils/passwordReuse';
import { t } from '../../../core/i18n';

/**
 * Response type for password reset mutation
 */
interface ResetPasswordResponse {
  success: boolean;
}

/**
 * Context type for reset password mutation (used for latency tracking)
 */
interface ResetPasswordContext {
  startTime: number;
}

/**
 * Classifies password reset errors into standard error categories.
 *
 * Uses error message patterns to identify token expiry, invalid tokens,
 * network issues, and server errors.
 *
 * @param error - The error object from Supabase or validation
 * @returns The error classification type
 */
function classifyResetPasswordError(error: unknown): ErrorClassification {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network-related errors
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('connection')
    ) {
      return 'network';
    }

    // Token-related errors (user errors - expired or invalid token)
    if (
      message.includes('token') ||
      message.includes('expired') ||
      message.includes('invalid') ||
      message.includes('unauthorized') ||
      message.includes('forbidden')
    ) {
      return 'user';
    }

    // Validation errors
    if (
      message.includes('validation') ||
      message.includes('weak') ||
      message.includes('reused') ||
      message.includes('requirements')
    ) {
      return 'user';
    }

    // Server errors
    if (message.includes('500') || message.includes('503') || message.includes('502')) {
      return 'server';
    }
  }

  // Default to server error for unknown issues
  return 'server';
}

/**
 * Gets user-friendly error message for password reset failures.
 *
 * Maps error classifications and specific error patterns to
 * user-facing messages from i18n.
 *
 * @param classification - The error classification
 * @param error - The original error object for specific message detection
 * @returns User-friendly error message
 */
function getResetPasswordErrorMessage(classification: ErrorClassification, error: unknown): string {
  // Check for specific error patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Token errors
    if (message.includes('token') || message.includes('expired') || message.includes('invalid')) {
      return t('screens.auth.resetPassword.errors.tokenInvalid');
    }

    // Password validation errors
    if (message.includes('weak') || message.includes('requirements')) {
      return t('screens.auth.resetPassword.errors.weakPassword');
    }

    // Password reuse error
    if (message.includes('reused')) {
      return t('screens.auth.resetPassword.errors.passwordReused');
    }

    // Network errors
    if (classification === 'network') {
      return t('screens.auth.resetPassword.errors.networkError');
    }
  }

  // Map classification to default messages
  if (classification === 'user') {
    return t('screens.auth.resetPassword.errors.weakPassword');
  }

  // Default to server error message
  return getUserFriendlyMessage(classification);
}

/**
 * React Query mutation hook for resetting user password.
 *
 * This hook handles:
 * - Request validation with Zod (accessToken, refreshToken, password, confirmPassword, optional userId)
 * - Session establishment via Supabase setSession with tokens from deep link
 * - Client-side password policy enforcement (length, character classes, symbol)
 * - Password reuse checking when userId is provided (via Edge Function backend)
 * - Supabase Auth updateUser API call to change password
 * - Telemetry event logging (reset_succeeded, reset_failed)
 * - Sentry error capture for failures (via logError)
 * - Error classification and user-friendly messages
 * - Retry logic with exponential backoff for transient failures
 *
 * Password Policy Enforcement:
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - At least 1 special character/symbol
 * - No reuse of last 3 passwords (enforced via Edge Function)
 *
 * Token Handling (Supabase Deep Link Flow):
 * - User receives email with reset link: maidrobe://reset-password#access_token=XXX&refresh_token=YYY&type=recovery
 * - access_token: Already-validated session token from Supabase
 * - refresh_token: Token for session refresh and management
 * - Call setSession({ access_token, refresh_token }) to establish authenticated session
 * - Then call updateUser({ password }) to change the password
 * - Tokens expire after 1 hour (Supabase default)
 * - Invalid or expired tokens are detected during setSession call
 *
 * Retry Strategy:
 * - Retries up to 3 times for network/server errors
 * - Does NOT retry token errors (permanent failures)
 * - Does NOT retry validation errors (permanent failures)
 * - Exponential backoff: 1s, 2s, 4s (with jitter)
 * - Max delay capped at 30 seconds
 *
 * Telemetry Events:
 * - password-reset-succeeded: When password successfully changed
 * - password-reset-failed: When reset fails (with error details)
 *
 * Refactored API:
 * - Calling components must provide userId via the request parameter
 * - This removes direct dependency on Zustand store (useStore.getState())
 * - Enables better testability and separation of concerns
 *
 * @returns React Query mutation object with password reset function
 *
 * @example
 * ```typescript
 * const { mutate: resetPassword, isPending } = useResetPassword();
 * const user = useStore((state) => state.user);
 *
 * const handleResetPassword = () => {
 *   resetPassword(
 *     {
 *       accessToken: 'access-token-from-deep-link',
 *       refreshToken: 'refresh-token-from-deep-link',
 *       password: 'NewP@ssw0rd123',
 *       confirmPassword: 'NewP@ssw0rd123',
 *       userId: user?.id, // Optional - enables password reuse checking
 *     },
 *     {
 *       onSuccess: () => {
 *         // Show success toast and navigate to login
 *         Toast.show('Password reset successful');
 *         router.push('/auth/login');
 *       },
 *       onError: (error) => {
 *         // Show specific error message
 *         Alert.alert('Reset Failed', error.message);
 *       },
 *     }
 *   );
 * };
 * ```
 */
export function useResetPassword() {
  return useMutation<ResetPasswordResponse, Error, ResetPasswordRequest, ResetPasswordContext>({
    // Retry configuration with exponential backoff and jitter
    // Only retry on network/server errors, not token or validation errors
    retry: (failureCount, error) => {
      const message = error.message;

      // Don't retry token errors (permanent failures)
      if (
        message.includes(t('screens.auth.resetPassword.errors.tokenInvalid')) ||
        message.includes(t('screens.auth.resetPassword.errors.tokenMissing'))
      ) {
        return false;
      }

      // Don't retry validation errors (permanent failures)
      if (
        message.includes(t('screens.auth.resetPassword.errors.weakPassword')) ||
        message.includes(t('screens.auth.resetPassword.errors.passwordReused')) ||
        message.includes(t('screens.auth.resetPassword.errors.passwordMismatch')) ||
        message.includes('Invalid request') ||
        message.includes('check your input')
      ) {
        return false;
      }

      // Retry up to 3 times for transient network/server errors
      return failureCount < 3;
    },
    // Exponential backoff with jitter to avoid thundering herd
    // Formula: min(baseDelay * 2^attempt + random jitter, maxDelay)
    retryDelay: (attemptIndex) => {
      const baseDelay = 1000; // 1 second base
      const exponentialDelay = baseDelay * Math.pow(2, attemptIndex);
      const jitter = Math.random() * 1000; // 0-1000ms jitter
      const totalDelay = exponentialDelay + jitter;
      const maxDelay = 30000; // Cap at 30 seconds
      return Math.min(totalDelay, maxDelay);
    },
    onMutate: () => {
      // Capture start timestamp for latency tracking
      return { startTime: Date.now() };
    },
    mutationFn: async (request: ResetPasswordRequest) => {
      const startTime = Date.now();

      // 1. Validate request with Zod
      let validatedRequest: ResetPasswordRequest;
      try {
        validatedRequest = ResetPasswordRequestSchema.parse(request);
      } catch (error) {
        if (error instanceof z.ZodError) {
          const latency = Date.now() - startTime;
          logError(error, 'user', {
            feature: 'auth',
            operation: 'password-reset',
            metadata: {
              validationErrors: error.issues,
              latency,
            },
          });

          // Check for password mismatch error
          const mismatchError = error.issues.find((issue) =>
            issue.path.includes('confirmPassword')
          );
          if (mismatchError) {
            throw new Error(t('screens.auth.resetPassword.errors.passwordMismatch'));
          }

          throw new Error(getUserFriendlyMessage('user'));
        }
        throw error;
      }

      // Extract values
      const { accessToken, refreshToken, password, userId } = validatedRequest;

      try {
        // 2. Validate password meets policy requirements
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.isValid) {
          const error = new Error(t('screens.auth.resetPassword.errors.weakPassword'));
          const latency = Date.now() - startTime;
          logError(error, 'user', {
            feature: 'auth',
            operation: 'password-reset',
            metadata: {
              reason: 'password_policy_violation',
              errors: passwordValidation.errors,
              latency,
            },
          });

          logAuthEvent('password-reset-failed', {
            errorCode: 'password_policy_violation',
            outcome: 'failure',
            latency,
          });

          throw error;
        }

        // 3. Check password reuse via Edge Function
        // Calls 'check-password-reuse' Edge Function which securely compares
        // the new password against last 3 password hashes stored in password_history table
        // Password reuse checking only runs when userId is provided by the calling component
        if (userId) {
          const reuseCheck = await checkPasswordReuse(userId, password);
          if (reuseCheck.isReused) {
            const error = new Error(t('screens.auth.resetPassword.errors.passwordReused'));
            const latency = Date.now() - startTime;
            logError(error, 'user', {
              feature: 'auth',
              operation: 'password-reset',
              metadata: {
                reason: 'password_reused',
                latency,
              },
            });

            logAuthEvent('password-reset-failed', {
              errorCode: 'password_reused',
              outcome: 'failure',
              latency,
            });

            throw error;
          }
        }

        // 4. Establish authenticated session using tokens from deep link
        // The Supabase password reset email includes access_token and refresh_token
        // in the deep link URL fragment. We use setSession to establish an authenticated
        // session, which allows us to call updateUser to change the password.
        //
        // Deep link format: maidrobe://reset-password#access_token=XXX&refresh_token=YYY&type=recovery
        // setSession validates the tokens and creates a session if valid
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          const latency = Date.now() - startTime;
          const classification = classifyResetPasswordError(sessionError);
          logError(sessionError, classification, {
            feature: 'auth',
            operation: 'password-reset',
            metadata: {
              step: 'session_establishment',
              errorCode: sessionError.status,
              latency,
            },
          });

          logAuthEvent('password-reset-failed', {
            errorCode: sessionError.status?.toString() || 'session_establishment_failed',
            outcome: 'failure',
            latency,
          });

          throw new Error(getResetPasswordErrorMessage(classification, sessionError));
        }

        // Session established successfully, now update the password
        const { data: updateData, error: updateError } = await supabase.auth.updateUser({
          password: password,
        });

        // Calculate latency
        const latency = Date.now() - startTime;

        // Handle update errors
        if (updateError) {
          const classification = classifyResetPasswordError(updateError);
          logError(updateError, classification, {
            feature: 'auth',
            operation: 'password-reset',
            metadata: {
              step: 'password_update',
              errorCode: updateError.status,
              latency,
            },
          });

          logAuthEvent('password-reset-failed', {
            errorCode: updateError.status?.toString() || 'password_update_failed',
            outcome: 'failure',
            latency,
          });

          throw new Error(getResetPasswordErrorMessage(classification, updateError));
        }

        // Password reset successful
        logAuthEvent('password-reset-succeeded', {
          outcome: 'success',
          latency,
          metadata: {
            userId: updateData.user?.id || 'unknown',
          },
        });

        return {
          success: true,
        };
      } catch (error) {
        // Handle Zod validation errors
        if (error instanceof z.ZodError) {
          const latency = Date.now() - startTime;
          logError(error, 'user', {
            feature: 'auth',
            operation: 'password-reset',
            metadata: {
              validationErrors: error.issues,
              latency,
            },
          });
          throw new Error(getUserFriendlyMessage('user'));
        }

        // Re-throw if already an Error
        if (error instanceof Error) {
          throw error;
        }

        // Handle unknown errors
        const latency = Date.now() - startTime;
        const unknownError = new Error('Unknown error during password reset');
        logError(unknownError, 'server', {
          feature: 'auth',
          operation: 'password-reset',
          metadata: { latency },
        });
        throw new Error(getUserFriendlyMessage('server'));
      }
    },
    onSuccess: (_data, _variables, context) => {
      // Calculate request latency for performance monitoring
      const latency = context?.startTime ? Date.now() - context.startTime : undefined;

      // Log success latency for observability
      // eslint-disable-next-line no-console
      console.log('[Telemetry]', {
        feature: 'auth',
        operation: 'password-reset',
        status: 'success',
        latency,
        timestamp: new Date().toISOString(),
      });
    },
    onError: (_error, _variables, context) => {
      // Calculate request latency for performance monitoring in error path
      const latency = context?.startTime ? Date.now() - context.startTime : undefined;

      // Log error latency for observability
      // eslint-disable-next-line no-console
      console.log('[Telemetry]', {
        feature: 'auth',
        operation: 'password-reset',
        status: 'error',
        latency,
        timestamp: new Date().toISOString(),
      });
    },
  });
}
