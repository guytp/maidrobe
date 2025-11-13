import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../../services/supabase';
import { logError, type ErrorClassification } from '../../../core/telemetry';

/**
 * Zod schema for validating the healthcheck edge function response.
 *
 * The healthcheck edge function returns a plain text "OK" string.
 * This schema validates the string response and transforms it into
 * a structured object for consistent API usage.
 *
 * Validation rules:
 * - Response must be a string
 * - Transforms string to { status: string } object
 *
 * @throws {z.ZodError} If the response is not a string or is malformed
 */
const HealthcheckSchema = z.string().transform((val) => ({
  status: val,
}));

/**
 * Response type from the healthcheck edge function.
 * Inferred from the Zod schema to ensure runtime and compile-time type safety.
 */
type HealthcheckResponse = z.infer<typeof HealthcheckSchema>;

/**
 * Classifies an error based on its type and characteristics.
 *
 * @param error - The error to classify
 * @returns Error classification type
 */
function classifyError(error: unknown): ErrorClassification {
  // Schema validation errors
  if (error instanceof z.ZodError) {
    return 'schema';
  }

  // Network errors - check error message for common network error patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('offline')
    ) {
      return 'network';
    }
  }

  // Default to server error for edge function failures
  return 'server';
}

/**
 * Maps error classification to user-friendly message.
 *
 * @param classification - The error classification
 * @returns User-friendly error message
 */
function getUserFriendlyMessage(classification: ErrorClassification): string {
  switch (classification) {
    case 'network':
      return 'Unable to connect. Please check your internet connection.';
    case 'server':
      return 'Service temporarily unavailable. Please try again later.';
    case 'schema':
      return 'Received unexpected response. Please contact support if this persists.';
    case 'user':
      return 'Invalid request. Please check your input and try again.';
  }
}

/**
 * Custom React Query hook for fetching healthcheck status from Supabase Edge Function.
 *
 * Calls the 'healthcheck' edge function to verify server connectivity and
 * edge function availability. This is a public endpoint that requires no
 * authentication.
 *
 * Query configuration:
 * - Cache key: ['healthcheck'] (no userId required - public endpoint)
 * - Stale time: inherited from global queryClient config (30s)
 * - Retry: inherited from global config (3 attempts with exponential backoff)
 *
 * @returns Query result containing healthcheck data, loading state, and error state
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { data, isLoading, error } = useHealthcheck();
 *
 *   if (isLoading) return <Text>Loading...</Text>;
 *   if (error) return <Text>Error: {error.message}</Text>;
 *   return <Text>Status: {data.status}</Text>;
 * }
 * ```
 */
export function useHealthcheck() {
  return useQuery<HealthcheckResponse, Error>({
    queryKey: ['healthcheck'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.functions.invoke('healthcheck', {
          method: 'GET',
        });

        if (error) {
          const serverError = new Error(`Healthcheck failed: ${error.message}`);
          const classification = classifyError(serverError);

          // Log error to telemetry
          logError(serverError, classification, {
            feature: 'healthcheck',
            operation: 'invoke',
            metadata: { supabaseError: error },
          });

          // Throw user-friendly error
          throw new Error(getUserFriendlyMessage(classification));
        }

        // Validate and parse the response using Zod schema
        try {
          return HealthcheckSchema.parse(data);
        } catch (zodError) {
          const classification = classifyError(zodError);

          // Log schema validation error to telemetry
          logError(zodError, classification, {
            feature: 'healthcheck',
            operation: 'schema_validation',
            metadata: {
              receivedData: data,
              zodIssues:
                zodError instanceof z.ZodError
                  ? zodError.issues.map((i) => ({
                      path: i.path,
                      message: i.message,
                    }))
                  : undefined,
            },
          });

          // Throw user-friendly error
          throw new Error(getUserFriendlyMessage(classification));
        }
      } catch (caughtError) {
        // If error is already user-friendly (thrown above), re-throw
        if (
          caughtError instanceof Error &&
          (caughtError.message.includes('Unable to connect') ||
            caughtError.message.includes('Service temporarily unavailable') ||
            caughtError.message.includes('Received unexpected response'))
        ) {
          throw caughtError;
        }

        // Classify and log unexpected errors
        const classification = classifyError(caughtError);
        logError(caughtError, classification, {
          feature: 'healthcheck',
          operation: 'unexpected_error',
        });

        // Throw user-friendly error
        throw new Error(getUserFriendlyMessage(classification));
      }
    },
  });
}
