import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { supabase } from '../../../services/supabase';
import { logError } from '../../../core/telemetry';
import type { Profile, ProfileRow } from '../types/profile';
import { mapProfileRowToProfile } from '../types/profile';

/**
 * React Query hook to fetch the current user's profile from public.profiles.
 *
 * This hook fetches profile data including the has_onboarded flag which is
 * critical for onboarding gate routing decisions. The profile is cached by
 * React Query to prevent redundant network calls.
 *
 * QUERY BEHAVIOR:
 * - Enabled only when userId is provided
 * - Stale time: 5 minutes (profiles don't change frequently)
 * - Cache time: 10 minutes
 * - Retry: 3 times for transient errors
 * - Query key: ['profile', userId]
 *
 * CACHING STRATEGY:
 * - Cached data is used optimistically for immediate routing decisions
 * - Background refetches happen automatically after stale time expires
 * - No mid-session routing changes (routing only occurs on cold start)
 * - Cache invalidation triggered after successful profile updates
 * - Stale data is acceptable for routing (eventual consistency model)
 *
 * ROUTING USAGE:
 * - app/index.tsx uses cached profile data for immediate redirect decisions
 * - authRestore.ts fetches fresh profile data on app launch
 * - No re-routing occurs if cached data becomes stale mid-session
 * - User experience prioritized over perfect consistency
 *
 * SECURITY:
 * - Uses Row Level Security (RLS) automatically
 * - User can only fetch their own profile
 * - RLS policy enforces auth.uid() = id check
 *
 * ERROR HANDLING:
 * - Network errors are retried automatically
 * - RLS violations are logged but don't throw
 * - Missing profiles return undefined (handled by caller)
 *
 * PERFORMANCE:
 * - Fetches minimal fields (id, has_onboarded, created_at, updated_at)
 * - Single query with .single() for efficiency
 * - React Query cache prevents redundant fetches
 *
 * @param userId - The user ID to fetch profile for (typically from auth state)
 * @returns React Query result with profile data
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const user = useStore(state => state.user);
 *   const { data: profile, isLoading } = useProfile(user?.id);
 *
 *   if (isLoading) return <Loading />;
 *   if (!profile) return <Error />;
 *
 *   return <div>Onboarded: {profile.hasOnboarded}</div>;
 * }
 * ```
 */
export function useProfile(userId: string | undefined): UseQueryResult<Profile | null, Error> {
  return useQuery<Profile | null, Error>({
    queryKey: ['profile', userId],
    queryFn: async () => {
      if (!userId) {
        throw new Error('User ID is required to fetch profile');
      }

      try {
        // Fetch profile from public.profiles table
        // RLS ensures user can only read their own profile
        const { data, error } = await supabase
          .from('profiles')
          .select('id, has_onboarded, created_at, updated_at')
          .eq('id', userId)
          .single();

        if (error) {
          // Log error for observability but don't prevent app from functioning
          logError(error, 'server', {
            feature: 'auth',
            operation: 'fetchProfile',
            metadata: {
              userId,
              errorCode: error.code,
              errorMessage: error.message,
            },
          });

          // Return null instead of throwing for missing profiles
          // This allows the app to handle missing profiles gracefully
          if (error.code === 'PGRST116') {
            // Not found error - profile doesn't exist yet
            return null;
          }

          // For other errors, throw to trigger retry logic
          throw error;
        }

        if (!data) {
          // No profile found - this can happen for newly created users
          // before the trigger creates their profile
          return null;
        }

        // Convert database row to application type
        return mapProfileRowToProfile(data as ProfileRow);
      } catch (error) {
        // Log unexpected errors
        logError(error as Error, 'client', {
          feature: 'auth',
          operation: 'fetchProfile',
          metadata: {
            userId,
            note: 'Unexpected error during profile fetch',
          },
        });

        throw error;
      }
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    retry: (failureCount, error) => {
      // Don't retry RLS violations or not found errors
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (
          message.includes('row level security') ||
          message.includes('not found') ||
          message.includes('pgrst116')
        ) {
          return false;
        }
      }

      // Retry up to 3 times for transient errors
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => {
      // Exponential backoff: 1s, 2s, 4s
      return Math.min(1000 * Math.pow(2, attemptIndex), 30000);
    },
  });
}

/**
 * Fetches profile directly without React Query caching.
 *
 * This is a utility function for use in contexts where React Query hooks
 * cannot be used (e.g., inside mutation callbacks, auth restore pipeline).
 * For component usage, prefer the useProfile hook for automatic caching.
 *
 * WHEN TO USE:
 * - Inside mutation onSuccess/onError callbacks
 * - In auth restore pipeline (authRestore.ts)
 * - In login flow (useLogin.ts)
 * - Any non-React context
 *
 * WHEN NOT TO USE:
 * - In React components (use useProfile hook instead)
 * - When you need automatic refetching
 * - When you need query state (isLoading, etc.)
 *
 * @param userId - The user ID to fetch profile for
 * @returns Promise resolving to profile or null
 *
 * @example
 * ```typescript
 * // In a mutation callback
 * onSuccess: async (data) => {
 *   const profile = await fetchProfile(data.user.id);
 *   if (profile) {
 *     updateUser({ ...data.user, hasOnboarded: profile.hasOnboarded });
 *   }
 * }
 * ```
 */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, has_onboarded, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error) {
      logError(error, 'server', {
        feature: 'auth',
        operation: 'fetchProfileDirect',
        metadata: {
          userId,
          errorCode: error.code,
          errorMessage: error.message,
        },
      });

      // Return null for not found errors
      if (error.code === 'PGRST116') {
        return null;
      }

      throw error;
    }

    if (!data) {
      return null;
    }

    return mapProfileRowToProfile(data as ProfileRow);
  } catch (error) {
    logError(error as Error, 'client', {
      feature: 'auth',
      operation: 'fetchProfileDirect',
      metadata: {
        userId,
        note: 'Unexpected error during direct profile fetch',
      },
    });

    // Return null instead of throwing to allow app to continue
    // Caller can decide how to handle missing profile
    return null;
  }
}
