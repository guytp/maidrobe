import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../../services/supabase';
import { logError, getUserFriendlyMessage, logSuccess } from '../../../core/telemetry';
import type { ErrorClassification } from '../../../core/telemetry';

/**
 * Zod schema for resend verification request validation
 */
const ResendVerificationRequestSchema = z.object({
  email: z.string().email(),
});

/**
 * Zod schema for Supabase resend response validation
 */
const ResendVerificationResponseSchema = z.object({
  // Supabase resend typically returns minimal data on success
  messageId: z.string().optional(),
});

export type ResendVerificationRequest = z.infer<typeof ResendVerificationRequestSchema>;
export type ResendVerificationResponse = z.infer<typeof ResendVerificationResponseSchema>;

/**
 * Classifies Supabase Auth resend errors into standard error categories.
 *
 * @param error - The error object from Supabase or network failure
 * @returns The error classification type
 */
function classifyResendError(error: unknown): ErrorClassification {
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

    // Rate limiting errors
    if (message.includes('rate limit') || message.includes('too many')) {
      return 'user';
    }

    // User-related errors
    if (message.includes('invalid') || message.includes('not found') || message.includes('user')) {
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
 * Get user-friendly error message for resend verification failures.
 *
 * @param classification - The error classification
 * @param error - The original error object
 * @returns User-friendly error message
 */
function getResendErrorMessage(classification: ErrorClassification, error: unknown): string {
  // Check for rate limiting specifically
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('rate limit') || message.includes('too many')) {
      return 'Too many requests. Please wait before trying again.';
    }
  }

  // Use standard messages for other classifications
  return getUserFriendlyMessage(classification);
}

/**
 * React Query mutation hook for resending email verification.
 *
 * This hook handles:
 * - Request validation with Zod
 * - Supabase Auth resend API call
 * - Response validation and parsing
 * - Error classification and telemetry logging (centralized utilities)
 * - Success event logging with latency metrics
 * - User-friendly error message generation
 * - Latency tracking for performance monitoring
 *
 * Implements 60-second cooldown tracking in component state.
 * Logs all operations to telemetry with PII redaction.
 *
 * @returns React Query mutation object with resend function
 *
 * @example
 * ```typescript
 * const { mutate: resendVerification, isPending } = useResendVerification();
 *
 * const handleResend = () => {
 *   resendVerification(
 *     { email: 'user@example.com' },
 *     {
 *       onSuccess: () => {
 *         console.log('Verification email sent');
 *       },
 *       onError: (error) => {
 *         console.error('Resend failed:', error.message);
 *       },
 *     }
 *   );
 * };
 * ```
 */
export function useResendVerification() {
  return useMutation<ResendVerificationResponse, Error, ResendVerificationRequest>({
    mutationFn: async (request: ResendVerificationRequest) => {
      const startTime = Date.now();

      try {
        // Validate request
        const validatedRequest = ResendVerificationRequestSchema.parse(request);

        // Call Supabase Auth resend
        // Note: Using resend method for email verification
        const { data, error } = await supabase.auth.resend({
          type: 'signup',
          email: validatedRequest.email,
        });

        // Calculate latency
        const latency = Date.now() - startTime;

        // Handle Supabase errors
        if (error) {
          const classification = classifyResendError(error);
          logError(error, classification, {
            feature: 'auth',
            operation: 'resend-verification',
            metadata: {
              email: 'redacted', // Never log PII
              errorCode: error.status,
              latency,
            },
          });
          throw new Error(getResendErrorMessage(classification, error));
        }

        // Log successful resend with latency for observability
        logSuccess('auth', 'resend-verification', {
          latency,
          data: {
            email: 'redacted',
          },
        });

        // Validate and return response
        // Supabase resend may return empty object on success
        return ResendVerificationResponseSchema.parse(data || {});
      } catch (error) {
        // Handle Zod validation errors
        if (error instanceof z.ZodError) {
          const latency = Date.now() - startTime;
          logError(error, 'user', {
            feature: 'auth',
            operation: 'resend-verification',
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
        const unknownError = new Error('Unknown error during resend verification');
        logError(unknownError, 'server', {
          feature: 'auth',
          operation: 'resend-verification',
          metadata: { latency },
        });
        throw new Error(getUserFriendlyMessage('server'));
      }
    },
  });
}
