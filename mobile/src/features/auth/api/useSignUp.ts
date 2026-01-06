import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../../services/supabase';
import { logSuccess } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';
import { saveSessionFromSupabase } from '../storage/sessionPersistence';
import { handleAuthError } from '../utils/authErrorHandler';
import { getAuthErrorMessage } from '../utils/authErrorMessages';
import { logAuthErrorToSentry } from '../utils/logAuthErrorToSentry';

/**
 * Zod schema for signup request validation
 */
const SignUpRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/**
 * Zod schema for Supabase signup response validation
 */
const SignUpResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    email_confirmed_at: z.string().nullable().optional(),
  }),
  session: z
    .object({
      access_token: z.string(),
      refresh_token: z.string(),
    })
    .nullable(),
});

export type SignUpRequest = z.infer<typeof SignUpRequestSchema>;
export type SignUpResponse = z.infer<typeof SignUpResponseSchema>;

/**
 * Context type for signup mutation (used for latency tracking)
 */
interface SignUpMutationContext {
  startTime: number;
}

/**
 * React Query mutation hook for user signup with email and password.
 *
 * This hook handles:
 * - Request validation with Zod
 * - Supabase Auth signup API call
 * - Response validation and parsing
 * - Error classification and telemetry logging (centralized utilities)
 * - Success event logging with latency metrics for SLO tracking
 * - User-friendly error message generation
 * - Automatic user session state management (sets authenticated user in store)
 * - Retry logic with exponential backoff and jitter for transient failures
 *
 * Retry Strategy:
 * - Retries up to 3 times for network/server errors
 * - Does NOT retry user validation or schema errors (permanent failures)
 * - Uses exponential backoff: 1s, 2s, 4s (plus jitter)
 * - Jitter (0-1000ms) prevents thundering herd problem
 * - Max delay capped at 30 seconds
 *
 * Business logic (setting user in Zustand store) is handled automatically
 * in the mutation's onSuccess handler. Components can provide additional
 * onSuccess callbacks for UI-specific concerns like navigation.
 *
 * @returns React Query mutation object with signup function
 *
 * @example
 * ```typescript
 * const { mutate: signUp, isPending } = useSignUp();
 *
 * const handleSignUp = () => {
 *   signUp(
 *     { email: 'user@example.com', password: 'SecurePass123' },
 *     {
 *       onSuccess: () => {
 *         // User is already set in store by mutation
 *         // Handle UI-specific logic like navigation
 *         router.push('/auth/verify');
 *       },
 *       onError: (error) => {
 *         Alert.alert('Signup Failed', error.message);
 *       },
 *     }
 *   );
 * };
 * ```
 */
export function useSignUp() {
  return useMutation<SignUpResponse, Error, SignUpRequest, SignUpMutationContext>({
    // Retry configuration with exponential backoff and jitter
    // Only retry on network/server errors, not user validation errors
    retry: (failureCount, error) => {
      // Don't retry user validation errors or schema errors
      // These are permanent failures that won't succeed on retry
      const message = error.message;
      if (
        message.includes('Invalid request') ||
        message.includes('unexpected response') ||
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
    mutationFn: async (request: SignUpRequest) => {
      try {
        // Validate request
        const validatedRequest = SignUpRequestSchema.parse(request);

        // Call Supabase Auth signup
        const { data, error } = await supabase.auth.signUp({
          email: validatedRequest.email,
          password: validatedRequest.password,
        });

        // Handle Supabase errors
        if (error) {
          const normalizedError = handleAuthError(error, {
            flow: 'signup',
            supabaseOperation: 'signUp',
          });

          logAuthErrorToSentry(normalizedError, error, {
            flow: 'signup',
            userId: undefined,
            platform: Platform.OS as 'ios' | 'android' | 'unknown',
            metadata: {},
          });

          const userMessage = getAuthErrorMessage(normalizedError, 'signup');
          throw new Error(userMessage);
        }

        // Validate and parse response
        if (!data || !data.user) {
          const schemaError = new Error('Invalid response from signup API');
          const normalizedError = handleAuthError(schemaError, {
            flow: 'signup',
            supabaseOperation: 'signUp',
          });

          logAuthErrorToSentry(normalizedError, schemaError, {
            flow: 'signup',
            userId: undefined,
            platform: Platform.OS as 'ios' | 'android' | 'unknown',
            metadata: { hasData: !!data, hasUser: !!data?.user },
          });

          const userMessage = getAuthErrorMessage(normalizedError, 'signup');
          throw new Error(userMessage);
        }

        const validatedResponse = SignUpResponseSchema.parse(data);

        return validatedResponse;
      } catch (error) {
        // Handle Zod validation errors
        if (error instanceof z.ZodError) {
          const validationError = new Error('Validation failed');
          const normalizedError = handleAuthError(validationError, {
            flow: 'signup',
            supabaseOperation: 'validation',
          });

          logAuthErrorToSentry(normalizedError, error, {
            flow: 'signup',
            userId: undefined,
            platform: Platform.OS as 'ios' | 'android' | 'unknown',
            metadata: { validationErrors: error.issues },
          });

          const userMessage = getAuthErrorMessage(normalizedError, 'signup');
          throw new Error(userMessage);
        }

        // Re-throw if already an Error
        if (error instanceof Error) {
          throw error;
        }

        // Handle unknown errors
        const unknownError = new Error('Unknown error during signup');
        const normalizedError = handleAuthError(unknownError, {
          flow: 'signup',
          supabaseOperation: 'signUp',
        });

        logAuthErrorToSentry(normalizedError, unknownError, {
          flow: 'signup',
          userId: undefined,
          platform: Platform.OS as 'ios' | 'android' | 'unknown',
          metadata: {},
        });

        const userMessage = getAuthErrorMessage(normalizedError, 'signup');
        throw new Error(userMessage);
      }
    },
    onSuccess: (data, _variables, context) => {
      // Calculate request latency for performance monitoring
      const latency = context?.startTime ? Date.now() - context.startTime : undefined;

      // Business logic: Update Zustand session store with authenticated user
      // This runs automatically for all signup calls, keeping UI components
      // free of business logic concerns
      useStore.getState().setUser({
        id: data.user.id,
        email: data.user.email,
        emailVerified: !!data.user.email_confirmed_at,
        hasOnboarded: false,
      });

      // Persist session bundle if auto-login occurred (session is non-null)
      // Some Supabase configurations require email confirmation before auto-login
      if (data.session) {
        // Cast to Session type - we know this comes from Supabase signUp
        saveSessionFromSupabase(data.session as Session, new Date().toISOString()).catch(
          (error) => {
            // Log error but don't throw - session save failures are non-critical
            // eslint-disable-next-line no-console
            console.error('[SignUp] Failed to save session bundle:', error);
          }
        );
      }

      // Log success with latency for observability and SLO tracking
      logSuccess('auth', 'signup', {
        latency,
        data: {
          userId: data.user.id,
          emailVerified: !!data.user.email_confirmed_at,
        },
      });
    },
    onError: (_error, _variables, context) => {
      // Calculate request latency for performance monitoring in error path
      const latency = context?.startTime ? Date.now() - context.startTime : undefined;

      // Log error latency for observability
      // Note: Detailed error logging is already handled in mutationFn
      // This captures the latency metric for failed requests
      // eslint-disable-next-line no-console
      console.log('[Telemetry]', {
        feature: 'auth',
        operation: 'signup',
        status: 'error',
        latency,
        timestamp: new Date().toISOString(),
      });
    },
  });
}
