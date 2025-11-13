import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../services/supabase';

/**
 * Response type from the healthcheck edge function.
 */
interface HealthcheckResponse {
  status: string;
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
      const { data, error } = await supabase.functions.invoke('healthcheck', {
        method: 'GET',
      });

      if (error) {
        throw new Error(`Healthcheck failed: ${error.message}`);
      }

      // The healthcheck function returns plain text "OK"
      // Wrap it in an object for consistent API
      return {
        status: typeof data === 'string' ? data : 'OK',
      };
    },
  });
}
