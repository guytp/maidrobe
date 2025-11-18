import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../services/supabase';
import { useStore } from '../../../core/state/store';
import { logError, type ErrorClassification } from '../../../core/telemetry';

/**
 * Response type from the wardrobe items check query.
 */
interface HasWardrobeItemsResponse {
  /** Whether the user has at least one wardrobe item */
  hasItems: boolean;
}

/**
 * Classifies an error based on its type and characteristics.
 *
 * @param error - The error to classify
 * @returns Error classification type
 */
function classifyError(error: unknown): ErrorClassification {
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

  // Default to server error for Supabase failures
  return 'server';
}

/**
 * Custom React Query hook for checking if user has any wardrobe items.
 *
 * Performs a lightweight count query against the items table to determine
 * whether the authenticated user has at least one wardrobe item. This is
 * used to provide contextual success messaging in the onboarding flow.
 *
 * PLACEHOLDER IMPLEMENTATION:
 * This hook queries the 'items' table which will be fully implemented in
 * Feature #3 (Wardrobe Item Capture & Management). The query structure
 * and RLS policies are based on the expected schema.
 *
 * Query strategy:
 * - Uses COUNT query with head:true for maximum efficiency (no data returned)
 * - Respects Row Level Security (RLS) policies on items table
 * - Only enabled when user is authenticated
 * - Non-blocking: component renders with default before query completes
 *
 * Error handling:
 * - All errors are caught and logged via telemetry
 * - No user-facing errors displayed
 * - Returns undefined on error (component uses safe default)
 * - Does not retry (fail-fast for non-critical query)
 *
 * Query configuration:
 * - Cache key: ['onboarding', 'hasWardrobeItems', userId]
 * - Stale time: 5 minutes (reasonable for onboarding context)
 * - Retry: false (non-critical query, fail fast)
 * - Enabled: only when user is authenticated
 *
 * @returns Query result containing hasItems boolean or undefined on error/loading
 *
 * @example
 * ```tsx
 * function SuccessScreen() {
 *   const { data } = useHasWardrobeItems();
 *   const hasItems = data?.hasItems ?? false; // Safe default
 *
 *   return (
 *     <Text>
 *       {hasItems ? 'You have items!' : 'Start adding items!'}
 *     </Text>
 *   );
 * }
 * ```
 */
export function useHasWardrobeItems() {
  const user = useStore((state) => state.user);

  return useQuery<HasWardrobeItemsResponse, Error>({
    queryKey: ['onboarding', 'hasWardrobeItems', user?.id],
    queryFn: async () => {
      // Defensive check: should not happen due to enabled flag, but ensure safety
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      try {
        // PLACEHOLDER: This query anticipates the items table from Feature #3
        // (Wardrobe Item Capture & Management). The table structure and RLS
        // policies are based on expected schema. If table doesn't exist yet,
        // count will be null and we'll treat it as 0 items (safe default).
        // NOTE: This query may need revisiting once Feature #3's schema is
        // finalized to ensure it aligns with the actual implementation.
        //
        // Perform lightweight COUNT query with head:true to avoid fetching data
        // This is the most efficient way to check if any items exist
        // RLS policies on items table will automatically filter to current user
        const { count, error } = await supabase
          .from('items')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (error) {
          throw error;
        }

        // Count can be null if table doesn't exist yet (Feature #3 not implemented)
        // Treat null as 0 items
        const hasItems = (count ?? 0) > 0;

        return { hasItems };
      } catch (error) {
        // Classify and log error for observability
        const classification = classifyError(error);

        logError(error as Error, classification, {
          feature: 'onboarding_success',
          operation: 'checkHasItems',
          metadata: {
            userId: user.id,
            errorType: classification,
          },
        });

        // Re-throw to let React Query handle the error state
        // Component will use safe default (no items) on error
        throw error;
      }
    },
    // Only run query when user is authenticated
    enabled: !!user?.id,
    // Cache result for 5 minutes - reasonable for onboarding context
    staleTime: 5 * 60 * 1000,
    // Don't retry on error - this is non-critical and we want fail-fast behavior
    // Component will use safe default if query fails
    retry: false,
    // Don't refetch on window focus - not needed for onboarding
    refetchOnWindowFocus: false,
    // Don't refetch on reconnect - stale data is acceptable
    refetchOnReconnect: false,
  });
}
