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
import { useStore } from '../../../core/state/store';

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
function getResetPasswordErrorMessage(
  classification: ErrorClassification,
  error: unknown
): string {
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
 * - Request validation with Zod (token, password, confirmPassword)
 * - Client-side password policy enforcement (length, character classes, symbol)
 * - Password reuse checking (stub implementation, TODO: backend integration)
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
 * - No reuse of last 3 passwords (stub - needs backend integration)
 *
 * Token Handling:
 * - Expects reset token from deep link to be in Supabase session
 * - Token is automatically validated by Supabase on updateUser call
 * - Expired or invalid tokens return specific error messages
 * - Tokens expire after 1 hour (Supabase default)
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
 * @returns React Query mutation object with password reset function
 *
 * @example
 * ```typescript
 * const { mutate: resetPassword, isPending } = useResetPassword();
 *
 * const handleResetPassword = () => {
 *   resetPassword(
 *     {
 *       token: 'reset-token-from-deep-link',
 *       password: 'NewP@ssw0rd123',
 *       confirmPassword: 'NewP@ssw0rd123',
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
          const mismatchError = error.issues.find((issue) => issue.path.includes('confirmPassword'));
          if (mismatchError) {
            throw new Error(t('screens.auth.resetPassword.errors.passwordMismatch'));
          }

          throw new Error(getUserFriendlyMessage('user'));
        }
        throw error;
      }

      // Extract values
      const { token, password } = validatedRequest;

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

        // 3. Check password reuse (stub implementation)
        // TODO: Replace with actual backend integration
        // For now, this always returns isReused: false
        // The user ID should be obtained from the current session after token verification
        const currentUser = useStore.getState().user;
        if (currentUser) {
          const reuseCheck = await checkPasswordReuse(currentUser.id, password);
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

        // 4. Call Supabase Auth to reset password
        // Note: The token from the reset link should already be in the session
        // when the deep link is opened. We call updateUser to change the password.
        // If token is not in session, we may need to call verifyOtp first.
        //
        // For now, we assume the token is passed explicitly and we need to verify it.
        // This approach uses verifyOtp to validate the token and set the session,
        // then updateUser to change the password.

        // First, verify the OTP token from the reset link
        const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: 'recovery',
        });

        if (verifyError) {
          const latency = Date.now() - startTime;
          const classification = classifyResetPasswordError(verifyError);
          logError(verifyError, classification, {
            feature: 'auth',
            operation: 'password-reset',
            metadata: {
              step: 'token_verification',
              errorCode: verifyError.status,
              latency,
            },
          });

          logAuthEvent('password-reset-failed', {
            errorCode: verifyError.status?.toString() || 'token_verification_failed',
            outcome: 'failure',
            latency,
          });

          throw new Error(getResetPasswordErrorMessage(classification, verifyError));
        }

        // Token verified successfully, now update the password
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
