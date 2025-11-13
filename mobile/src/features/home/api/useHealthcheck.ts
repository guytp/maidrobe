import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../../services/supabase';

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
      const { data, error } = await supabase.functions.invoke('healthcheck', {
        method: 'GET',
      });

      if (error) {
        throw new Error(`Healthcheck failed: ${error.message}`);
      }

      // Validate and parse the response using Zod schema
      // This provides runtime type safety and will throw ZodError if validation fails
      try {
        return HealthcheckSchema.parse(data);
      } catch (zodError) {
        if (zodError instanceof z.ZodError) {
          const errorMessages = zodError.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join(', ');
          throw new Error(`Healthcheck response validation failed: ${errorMessages}`);
        }
        throw zodError;
      }
    },
  });
}
