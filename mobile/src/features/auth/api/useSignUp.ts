import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../../services/supabase';
import { logError, getUserFriendlyMessage } from '../../../core/telemetry';
import type { ErrorClassification } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';

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
 * Classifies Supabase Auth errors into standard error categories.
 *
 * @param error - The error object from Supabase or network failure
 * @returns The error classification type
 */
function classifyAuthError(error: unknown): ErrorClassification {
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

    // User-related errors (validation, existing user, etc.)
    if (
      message.includes('invalid') ||
      message.includes('already registered') ||
      message.includes('weak password') ||
      message.includes('user already exists')
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
 * React Query mutation hook for user signup with email and password.
 *
 * This hook handles:
 * - Request validation with Zod
 * - Supabase Auth signup API call
 * - Response validation and parsing
 * - Error classification and telemetry logging
 * - User-friendly error message generation
 * - Automatic user session state management (sets authenticated user in store)
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
  return useMutation<SignUpResponse, Error, SignUpRequest>({
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
          const classification = classifyAuthError(error);
          logError(error, classification, {
            feature: 'auth',
            operation: 'signup',
            metadata: {
              email: 'redacted', // Never log PII
              errorCode: error.status,
            },
          });
          throw new Error(getUserFriendlyMessage(classification));
        }

        // Validate and parse response
        if (!data || !data.user) {
          const schemaError = new Error('Invalid response from signup API');
          logError(schemaError, 'schema', {
            feature: 'auth',
            operation: 'signup',
            metadata: { hasData: !!data, hasUser: !!data?.user },
          });
          throw new Error(getUserFriendlyMessage('schema'));
        }

        const validatedResponse = SignUpResponseSchema.parse(data);

        return validatedResponse;
      } catch (error) {
        // Handle Zod validation errors
        if (error instanceof z.ZodError) {
          logError(error, 'user', {
            feature: 'auth',
            operation: 'signup',
            metadata: { validationErrors: error.issues },
          });
          throw new Error(getUserFriendlyMessage('user'));
        }

        // Re-throw if already an Error
        if (error instanceof Error) {
          throw error;
        }

        // Handle unknown errors
        const unknownError = new Error('Unknown error during signup');
        logError(unknownError, 'server', {
          feature: 'auth',
          operation: 'signup',
        });
        throw new Error(getUserFriendlyMessage('server'));
      }
    },
    onSuccess: (data) => {
      // Business logic: Update Zustand session store with authenticated user
      // This runs automatically for all signup calls, keeping UI components
      // free of business logic concerns
      useStore.getState().setUser({
        id: data.user.id,
        email: data.user.email,
        emailVerified: !!data.user.email_confirmed_at,
      });
    },
  });
}
