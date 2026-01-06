import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../../services/supabase';
import { logAuthEvent } from '../../../core/telemetry';
import { ForgotPasswordRequestSchema } from '../utils/passwordResetSchemas';
import type { ForgotPasswordRequest } from '../utils/passwordResetSchemas';
import { t } from '../../../core/i18n';
import { handleAuthError } from '../utils/authErrorHandler';
import { getAuthErrorMessage } from '../utils/authErrorMessages';
import { logAuthErrorToSentry } from '../utils/logAuthErrorToSentry';

/**
 * Rate limiter configuration for password reset requests.
 *
 * Password reset requests are rate-limited to prevent abuse and
 * potential account enumeration attacks. The rate limit is more
 * restrictive than login (5 requests per hour vs per minute).
 *
 * Rate Limit Policy:
 * - Maximum 5 password reset requests per 60-minute (1 hour) window
 * - Keyed by email address (normalized: trimmed and lowercased)
 * - Persists across app restarts via AsyncStorage
 * - Cooldown message displays remaining seconds
 * - Separate storage key from login rate limiting
 */
const RATE_LIMIT_STORAGE_KEY = 'auth:password-reset:attempts';
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 3600000; // 1 hour = 60 * 60 * 1000

/**
 * Reads password reset attempts from AsyncStorage and filters expired timestamps.
 *
 * @param email - The normalized email address to check attempts for
 * @returns Array of valid attempt timestamps, or empty array on error
 */
async function getAttempts(email: string): Promise<number[]> {
  try {
    const storageKey = `${RATE_LIMIT_STORAGE_KEY}:${email}`;
    const stored = await AsyncStorage.getItem(storageKey);
    if (!stored) {
      return [];
    }

    const attempts = JSON.parse(stored) as number[];
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    // Filter out expired attempts
    return attempts.filter((timestamp) => timestamp > windowStart);
  } catch (error) {
    // Log error but don't block password reset on storage failure
    // eslint-disable-next-line no-console
    console.error('[RateLimit] Failed to read password reset attempts:', error);
    return [];
  }
}

/**
 * Writes password reset attempts to AsyncStorage.
 *
 * @param email - The normalized email address
 * @param attempts - Array of attempt timestamps to persist
 */
async function setAttempts(email: string, attempts: number[]): Promise<void> {
  try {
    const storageKey = `${RATE_LIMIT_STORAGE_KEY}:${email}`;
    await AsyncStorage.setItem(storageKey, JSON.stringify(attempts));
  } catch (error) {
    // Log error but don't throw - storage failure shouldn't block password reset
    // eslint-disable-next-line no-console
    console.error('[RateLimit] Failed to write password reset attempts:', error);
  }
}

/**
 * Checks if the rate limit has been exceeded for password reset requests.
 *
 * This function reads from AsyncStorage to ensure rate limiting persists
 * across app restarts. If storage operations fail, it allows the request
 * to proceed (fail-open for availability).
 *
 * @param email - The normalized email address to check
 * @returns Promise resolving to object with allowed status and remaining cooldown
 */
async function checkRateLimit(
  email: string
): Promise<{ allowed: boolean; remainingSeconds: number }> {
  const attempts = await getAttempts(email);
  const now = Date.now();

  // Check if limit exceeded
  if (attempts.length >= MAX_ATTEMPTS) {
    const oldestAttempt = attempts[0];
    const remainingMs = WINDOW_MS - (now - oldestAttempt);
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    return {
      allowed: false,
      remainingSeconds: Math.max(0, remainingSeconds),
    };
  }

  return {
    allowed: true,
    remainingSeconds: 0,
  };
}

/**
 * Records a password reset attempt for rate limiting.
 *
 * Persists the attempt timestamp to AsyncStorage along with cleanup of
 * expired attempts. If storage fails, the attempt is not recorded but
 * the function does not throw to avoid blocking the password reset flow.
 *
 * @param email - The normalized email address
 */
async function recordAttempt(email: string): Promise<void> {
  const attempts = await getAttempts(email);
  attempts.push(Date.now());
  await setAttempts(email, attempts);
}

/**
 * Context type for password reset request mutation (used for latency tracking)
 */
interface PasswordResetRequestContext {
  startTime: number;
  email: string;
}

/**
 * React Query mutation hook for requesting a password reset email.
 *
 * This hook handles:
 * - Request validation with Zod
 * - Email normalization (trim + lowercase)
 * - Client-side rate limiting (5 requests per hour per email)
 * - Supabase Auth resetPasswordForEmail API call
 * - Telemetry event logging (reset_requested, email_sent, reset_failed)
 * - Generic user messaging to prevent account enumeration
 * - Error classification and user-friendly messages
 * - Latency tracking for performance monitoring
 *
 * SECURITY: Generic Messaging to Prevent Account Enumeration
 * - Always returns success message to user (even if email doesn't exist)
 * - Only exceptions: rate limiting and network errors (user can retry)
 * - Internal telemetry logs actual result for monitoring
 * - This prevents attackers from discovering valid email addresses
 *
 * Rate Limiting:
 * - Maximum 5 password reset requests per 60-minute window
 * - Keyed by normalized email address
 * - Persists to AsyncStorage (survives app restarts)
 * - Returns cooldown message with remaining time when exceeded
 * - Gracefully handles storage failures (fail-open for availability)
 *
 * No Retry Logic:
 * - Password reset requests are NOT retried automatically
 * - This prevents abuse and excessive email sending
 * - User can manually retry if needed
 *
 * Telemetry Events:
 * - password-reset-requested: When user submits request (may not be valid email)
 * - password-reset-email-sent: When Supabase confirms email sent successfully
 * - password-reset-failed: When request fails (logged internally, not shown to user)
 *
 * @returns React Query mutation object with password reset request function
 *
 * @example
 * ```typescript
 * const { mutate: requestReset, isPending } = useRequestPasswordReset();
 *
 * const handleForgotPassword = () => {
 *   requestReset(
 *     { email: 'user@example.com' },
 *     {
 *       onSuccess: () => {
 *         // Always shows: "If an account exists, we've sent a link."
 *         navigate('/auth/check-email');
 *       },
 *       onError: (error) => {
 *         // Only for rate limit or network errors
 *         Alert.alert('Error', error.message);
 *       },
 *     }
 *   );
 * };
 * ```
 */
export function useRequestPasswordReset() {
  return useMutation<void, Error, ForgotPasswordRequest, PasswordResetRequestContext>({
    // No retry logic for password reset to prevent abuse
    retry: false,
    onMutate: (request) => {
      // Capture start timestamp and email for latency tracking and telemetry
      return {
        startTime: Date.now(),
        email: request.email.trim().toLowerCase(),
      };
    },
    mutationFn: async (request: ForgotPasswordRequest) => {
      const startTime = Date.now();

      // 1. Validate request
      let validatedRequest: ForgotPasswordRequest;
      try {
        validatedRequest = ForgotPasswordRequestSchema.parse(request);
      } catch (error) {
        if (error instanceof z.ZodError) {
          const latency = Date.now() - startTime;
          const validationError = new Error('Validation failed');
          const normalizedError = handleAuthError(validationError, {
            flow: 'reset',
            supabaseOperation: 'validation',
          });

          logAuthErrorToSentry(normalizedError, error, {
            flow: 'reset',
            userId: undefined,
            platform: Platform.OS as 'ios' | 'android' | 'unknown',
            metadata: {
              validationErrors: error.issues,
              latency,
            },
          });

          const userMessage = getAuthErrorMessage(normalizedError, 'reset');
          throw new Error(userMessage);
        }
        throw error;
      }

      // Normalize email for consistent rate limiting and authentication
      const normalizedEmail = validatedRequest.email.trim().toLowerCase();

      try {
        // 2. Check rate limit
        const rateLimit = await checkRateLimit(normalizedEmail);
        if (!rateLimit.allowed) {
          const error = new Error(
            t('screens.auth.forgotPassword.errors.rateLimitExceeded').replace(
              '{seconds}',
              rateLimit.remainingSeconds.toString()
            )
          );

          // Log telemetry event
          logAuthEvent('password-reset-failed', {
            errorCode: 'rate_limit_exceeded',
            outcome: 'failure',
          });

          throw error;
        }

        // 3. Record attempt (before API call to prevent bypass)
        await recordAttempt(normalizedEmail);

        // Log request event
        logAuthEvent('password-reset-requested', {
          outcome: 'requested',
          metadata: {
            email: 'redacted',
          },
        });

        // 4. Call Supabase Auth resetPasswordForEmail
        // The redirectTo URL should be the deep link for the mobile app
        // Format: maidrobe://reset-password (will be handled by Expo Router)
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: 'maidrobe://reset-password',
        });

        // Calculate latency
        const latency = Date.now() - startTime;

        // Handle Supabase errors
        if (error) {
          const normalizedError = handleAuthError(error, {
            flow: 'reset',
            supabaseOperation: 'resetPasswordForEmail',
          });

          logAuthErrorToSentry(normalizedError, error, {
            flow: 'reset',
            userId: undefined,
            platform: Platform.OS as 'ios' | 'android' | 'unknown',
            metadata: {
              latency,
            },
          });

          // Log telemetry event
          logAuthEvent('password-reset-failed', {
            errorCode: normalizedError.code,
            outcome: 'failure',
            latency,
          });

          // SECURITY: Only throw error for network issues
          // All other errors return success to prevent account enumeration
          if (normalizedError.category === 'network') {
            const userMessage = getAuthErrorMessage(normalizedError, 'reset');
            throw new Error(userMessage);
          }

          // For all other errors, silently succeed to prevent enumeration
          // Log the error internally but show success to user
          // eslint-disable-next-line no-console
          console.warn('[PasswordReset] Request failed but showing success to prevent enumeration');

          // Log success event even though it failed (for consistency)
          logAuthEvent('password-reset-email-sent', {
            outcome: 'success',
            latency,
            metadata: {
              email: 'redacted',
              actualOutcome: 'failed-but-hidden',
            },
          });

          return;
        }

        // Log successful email sent with latency for observability
        logAuthEvent('password-reset-email-sent', {
          outcome: 'success',
          latency,
          metadata: {
            email: 'redacted',
          },
        });

        // Return void (no data needed, always show generic success message)
        return;
      } catch (error) {
        // Handle Zod validation errors (for response validation if needed)
        if (error instanceof z.ZodError) {
          const latency = Date.now() - startTime;
          const validationError = new Error('Response validation failed');
          const normalizedError = handleAuthError(validationError, {
            flow: 'reset',
            supabaseOperation: 'resetPasswordForEmail',
          });

          logAuthErrorToSentry(normalizedError, error, {
            flow: 'reset',
            userId: undefined,
            platform: Platform.OS as 'ios' | 'android' | 'unknown',
            metadata: {
              validationErrors: error.issues,
              latency,
            },
          });

          const userMessage = getAuthErrorMessage(normalizedError, 'reset');
          throw new Error(userMessage);
        }

        // Re-throw if already an Error
        if (error instanceof Error) {
          throw error;
        }

        // Handle unknown errors
        const latency = Date.now() - startTime;
        const unknownError = new Error('Unknown error during password reset request');
        const normalizedError = handleAuthError(unknownError, {
          flow: 'reset',
          supabaseOperation: 'resetPasswordForEmail',
        });

        logAuthErrorToSentry(normalizedError, unknownError, {
          flow: 'reset',
          userId: undefined,
          platform: Platform.OS as 'ios' | 'android' | 'unknown',
          metadata: { latency },
        });

        const userMessage = getAuthErrorMessage(normalizedError, 'reset');
        throw new Error(userMessage);
      }
    },
    onError: (_error, _variables, context) => {
      // Calculate request latency for performance monitoring in error path
      const latency = context?.startTime ? Date.now() - context.startTime : undefined;

      // Log error latency for observability
      // eslint-disable-next-line no-console
      console.log('[Telemetry]', {
        feature: 'auth',
        operation: 'password-reset-request',
        status: 'error',
        latency,
        timestamp: new Date().toISOString(),
      });
    },
  });
}
