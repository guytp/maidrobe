import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../../services/supabase';
import { useStore } from '../../../core/state/store';
import { logError, getUserFriendlyMessage, type ErrorClassification } from '../../../core/telemetry';
import type { PrefsRow } from '../utils/prefsTypes';
import { PrefsRowSchema } from '../utils/prefsValidation';

/**
 * Classifies Supabase errors for telemetry and user messaging.
 *
 * @param error - The error to classify
 * @returns Error classification (network, server, or schema)
 */
function classifyPrefsError(error: unknown): ErrorClassification {
  if (error instanceof z.ZodError) {
    return 'schema';
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('offline')
    ) {
      return 'network';
    }

    // Schema validation errors
    if (message.includes('validation') || message.includes('parse') || message.includes('schema')) {
      return 'schema';
    }

    // Default to server error for unknown errors
    return 'server';
  }

  return 'server';
}

/**
 * React Query hook for fetching the current user's preferences.
 *
 * This hook:
 * - Fetches the prefs row from Supabase for the authenticated user
 * - Returns null if the user has no preferences saved yet
 * - Validates the response with Zod schema
 * - Classifies and logs errors appropriately
 * - Uses stale-while-revalidate caching (30s stale, 5min cache)
 * - Only runs when user is authenticated
 *
 * Cache Key Pattern:
 * ['prefs', userId] - Includes userId for user-specific caching
 *
 * Error Handling:
 * - Network errors: Classified and logged, user sees connection message
 * - Server errors: Classified and logged, user sees service unavailable message
 * - Schema errors: Classified and logged, user sees unexpected response message
 *
 * @returns React Query result with PrefsRow | null data, loading, and error states
 *
 * @example
 * ```typescript
 * function PrefsScreen() {
 *   const { data: prefs, isLoading, error } = useUserPrefs();
 *
 *   if (isLoading) return <Spinner />;
 *   if (error) return <ErrorMessage error={error.message} />;
 *
 *   // prefs is PrefsRow | null
 *   const formData = toFormData(prefs);
 *   return <PrefsForm initialData={formData} />;
 * }
 * ```
 */
export function useUserPrefs(): UseQueryResult<PrefsRow | null, Error> {
  const userId = useStore((state) => state.user?.id);

  return useQuery({
    // Cache key includes userId for user-specific caching
    queryKey: ['prefs', userId ?? 'anonymous'],

    queryFn: async (): Promise<PrefsRow | null> => {
      // Return null if user is not authenticated
      // This should not happen due to enabled flag, but defensive check
      if (!userId) {
        return null;
      }

      try {
        // Fetch prefs row for current user
        // Use maybeSingle() to return null if no row exists (not an error)
        const { data, error } = await supabase
          .from('prefs')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        // Handle Supabase errors
        if (error) {
          const classification = classifyPrefsError(error);
          logError(error, classification, {
            feature: 'onboarding',
            operation: 'fetchPrefs',
            metadata: { userId },
          });
          throw new Error(getUserFriendlyMessage(classification));
        }

        // If no row exists, return null (user has no prefs yet)
        if (!data) {
          return null;
        }

        // Validate response with Zod schema
        try {
          const validatedData = PrefsRowSchema.parse(data);
          return validatedData;
        } catch (validationError) {
          // Schema validation failed - log and throw
          logError(validationError, 'schema', {
            feature: 'onboarding',
            operation: 'fetchPrefs',
            metadata: { userId, hasData: !!data },
          });
          throw new Error(getUserFriendlyMessage('schema'));
        }
      } catch (error) {
        // Re-throw if already an Error with user-friendly message
        if (error instanceof Error) {
          throw error;
        }

        // Handle unknown errors
        const unknownError = new Error('Unknown error fetching preferences');
        const classification = classifyPrefsError(unknownError);
        logError(unknownError, classification, {
          feature: 'onboarding',
          operation: 'fetchPrefs',
          metadata: { userId },
        });
        throw new Error(getUserFriendlyMessage(classification));
      }
    },

    // Stale-while-revalidate timing
    staleTime: 30000, // 30 seconds - data considered fresh
    gcTime: 300000, // 5 minutes - cache garbage collection time (formerly cacheTime)

    // Only run query when user is authenticated
    enabled: !!userId,
  });
}
