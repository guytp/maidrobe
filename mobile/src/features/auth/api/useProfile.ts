import { useQuery, UseQueryResult, QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../../services/supabase';
import { logError } from '../../../core/telemetry';
import type { Profile } from '../types/profile';
import { mapProfileRowToProfile, ProfileRowSchema } from '../types/profile';

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
 * - Fetches minimal fields (id, has_onboarded, role, created_at, updated_at)
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
          .select('id, has_onboarded, role, created_at, updated_at')
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
            // Not found error - distinguish brand new vs existing user
            // Brand new users: missing profile is expected (async profile creation)
            // Existing users: missing profile is a data integrity issue

            try {
              // Fetch user metadata to determine account age
              const { data: userData } = await supabase.auth.getUser();

              if (userData?.user?.created_at) {
                const userCreatedAt = new Date(userData.user.created_at).getTime();
                const now = Date.now();
                const accountAgeMs = now - userCreatedAt;
                const accountAgeMinutes = Math.floor(accountAgeMs / (60 * 1000));
                const isBrandNewUser = accountAgeMs < 5 * 60 * 1000; // Less than 5 minutes

                if (isBrandNewUser) {
                  // Brand new user - missing profile is expected
                  return null;
                } else {
                  // Existing user - missing profile is a data integrity issue
                  logError(
                    new Error('Profile not found for existing user'),
                    'server',
                    {
                      feature: 'auth',
                      operation: 'fetchProfile',
                      metadata: {
                        userId,
                        errorCode: 'PGRST116',
                        accountAgeMinutes,
                        isBrandNewUser,
                        note: 'Data integrity issue: existing user has no profile row',
                      },
                    }
                  );
                  // Still return null to allow app to continue with degraded functionality
                  return null;
                }
              }
            } catch (authError) {
              // If we can't fetch user metadata, log and return null
              logError(authError as Error, 'server', {
                feature: 'auth',
                operation: 'fetchProfile',
                metadata: {
                  userId,
                  errorCode: 'PGRST116',
                  note: 'Failed to fetch user metadata for account age check',
                },
              });
            }

            // Fallback: return null if we couldn't determine user age
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

        // Validate profile data with Zod schema before mapping
        try {
          const validatedData = ProfileRowSchema.parse(data);
          return mapProfileRowToProfile(validatedData);
        } catch (zodError) {
          // Log schema validation error
          logError(zodError as Error, 'schema', {
            feature: 'auth',
            operation: 'validateProfile',
            metadata: {
              userId,
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

          throw new Error('Invalid profile data received from server');
        }
      } catch (error) {
        // Log unexpected errors
        logError(error as Error, 'server', {
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
 * Fetches profile with React Query cache awareness.
 *
 * This function checks the React Query cache first before making a network
 * request, allowing offline users to benefit from cached profile data. This
 * is the recommended approach for most profile fetch scenarios outside of
 * React components.
 *
 * CACHE STRATEGY:
 * 1. Check React Query cache for ['profile', userId]
 * 2. If cache hit, return cached data immediately
 * 3. If cache miss or forceNetwork=true, fetch from network
 * 4. Update cache with fresh data to maintain consistency
 *
 * OFFLINE BEHAVIOR:
 * - Returns cached data even if potentially stale when offline
 * - Allows app to function with cached profile data during network outages
 * - Network fetch failures fall back to cached data if available
 * - Graceful degradation: stale data is better than no data
 *
 * WHEN TO USE:
 * - Auth restore pipeline (authRestore.ts) - benefits from offline cache
 * - Login flow when cached data is acceptable
 * - Any scenario where offline resilience is needed
 * - When QueryClient instance is available
 *
 * WHEN NOT TO USE (use fetchProfile instead):
 * - When guaranteed fresh data is absolutely required
 * - When QueryClient instance is not available
 * - When you need to bypass cache intentionally
 *
 * LIMITATIONS:
 * 1. Stale data risk: Offline users may receive outdated profile information
 * 2. Cache key coupling: Must exactly match useProfile hook's query key
 * 3. QueryClient dependency: Requires QueryClient instance parameter
 * 4. Eventual consistency: Cache and database may be temporarily inconsistent
 * 5. No automatic refetch: Does not set up background refetching like useProfile
 * 6. Not for post-mutation validation: Use cache invalidation instead
 *
 * @param userId - The user ID to fetch profile for
 * @param queryClient - React Query client instance for cache access
 * @param options - Optional configuration
 * @param options.forceNetwork - Skip cache and always fetch from network (default: false)
 * @returns Promise resolving to profile or null
 *
 * @example
 * ```typescript
 * // In auth restore - benefit from cached data for offline resilience
 * const profile = await fetchProfileWithCache(userId, queryClient);
 *
 * // Force fresh fetch when guaranteed fresh data is needed
 * const profile = await fetchProfileWithCache(userId, queryClient, {
 *   forceNetwork: true
 * });
 * ```
 */
export async function fetchProfileWithCache(
  userId: string,
  queryClient: QueryClient,
  options?: { forceNetwork?: boolean }
): Promise<Profile | null> {
  const forceNetwork = options?.forceNetwork ?? false;

  // Step 1: Check cache first unless forceNetwork is true
  if (!forceNetwork) {
    const cachedData = queryClient.getQueryData<Profile | null>(['profile', userId]);
    if (cachedData !== undefined) {
      // Cache hit - return cached data immediately
      // Note: We return even potentially stale data for offline resilience
      return cachedData;
    }
  }

  // Step 2: Cache miss or forced network fetch - fetch from network
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, has_onboarded, role, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error) {
      logError(error, 'server', {
        feature: 'auth',
        operation: 'fetchProfileWithCache',
        metadata: {
          userId,
          errorCode: error.code,
          errorMessage: error.message,
          forceNetwork,
        },
      });

      // Return null for not found errors
      if (error.code === 'PGRST116') {
        // Not found error - distinguish brand new vs existing user
        // Brand new users: missing profile is expected (async profile creation)
        // Existing users: missing profile is a data integrity issue

        try {
          // Fetch user metadata to determine account age
          const { data: userData } = await supabase.auth.getUser();

          if (userData?.user?.created_at) {
            const userCreatedAt = new Date(userData.user.created_at).getTime();
            const now = Date.now();
            const accountAgeMs = now - userCreatedAt;
            const accountAgeMinutes = Math.floor(accountAgeMs / (60 * 1000));
            const isBrandNewUser = accountAgeMs < 5 * 60 * 1000; // Less than 5 minutes

            if (isBrandNewUser) {
              // Brand new user - missing profile is expected
              // Update cache with null to avoid repeated fetches
              queryClient.setQueryData(['profile', userId], null);
              return null;
            } else {
              // Existing user - missing profile is a data integrity issue
              logError(
                new Error('Profile not found for existing user'),
                'server',
                {
                  feature: 'auth',
                  operation: 'fetchProfileWithCache',
                  metadata: {
                    userId,
                    errorCode: 'PGRST116',
                    accountAgeMinutes,
                    isBrandNewUser,
                    forceNetwork,
                    note: 'Data integrity issue: existing user has no profile row',
                  },
                }
              );
              // Update cache with null but allow retry by React Query
              queryClient.setQueryData(['profile', userId], null);
              return null;
            }
          }
        } catch (authError) {
          // If we can't fetch user metadata, log and return null
          logError(authError as Error, 'server', {
            feature: 'auth',
            operation: 'fetchProfileWithCache',
            metadata: {
              userId,
              errorCode: 'PGRST116',
              forceNetwork,
              note: 'Failed to fetch user metadata for account age check',
            },
          });
        }

        // Fallback: update cache and return null if we couldn't determine user age
        queryClient.setQueryData(['profile', userId], null);
        return null;
      }

      // For network errors, fall back to cached data if available
      const cachedData = queryClient.getQueryData<Profile | null>(['profile', userId]);
      if (cachedData !== undefined) {
        // Return stale cache data rather than failing completely
        return cachedData;
      }

      throw error;
    }

    if (!data) {
      // No profile found - update cache and return null
      queryClient.setQueryData(['profile', userId], null);
      return null;
    }

    // Step 3: Validate, convert, and cache the fresh data
    try {
      const validatedData = ProfileRowSchema.parse(data);
      const profile = mapProfileRowToProfile(validatedData);
      queryClient.setQueryData(['profile', userId], profile);

      return profile;
    } catch (zodError) {
      // Log schema validation error
      logError(zodError as Error, 'schema', {
        feature: 'auth',
        operation: 'validateProfileWithCache',
        metadata: {
          userId,
          receivedData: data,
          forceNetwork,
          zodIssues:
            zodError instanceof z.ZodError
              ? zodError.issues.map((i) => ({
                  path: i.path,
                  message: i.message,
                }))
              : undefined,
        },
      });

      throw new Error('Invalid profile data received from server');
    }
  } catch (error) {
    logError(error as Error, 'server', {
      feature: 'auth',
      operation: 'fetchProfileWithCache',
      metadata: {
        userId,
        forceNetwork,
        note: 'Network fetch failed, attempting cache fallback',
      },
    });

    // Final fallback: return cached data if available
    const cachedData = queryClient.getQueryData<Profile | null>(['profile', userId]);
    if (cachedData !== undefined) {
      return cachedData;
    }

    // No cache available - return null instead of throwing
    // This allows the app to continue with degraded functionality
    return null;
  }
}

/**
 * Fetches profile directly without React Query caching.
 *
 * This is a utility function that ALWAYS makes a network request and bypasses
 * the React Query cache entirely. Use this only when guaranteed fresh data is
 * required or when QueryClient is not available.
 *
 * For most use cases, prefer fetchProfileWithCache for better offline support.
 *
 * WHEN TO USE:
 * - When QueryClient instance is not available
 * - When guaranteed fresh data is absolutely required
 * - When you need to bypass cache intentionally
 * - Legacy code that doesn't have access to QueryClient
 *
 * WHEN NOT TO USE (use fetchProfileWithCache instead):
 * - In auth restore pipeline (use cache-aware version)
 * - When offline resilience is important
 * - When you have access to QueryClient
 *
 * IMPORTANT: This function always makes a network call, even if fresh data
 * exists in the React Query cache. This can cause unnecessary network traffic
 * and poor offline behavior.
 *
 * @param userId - The user ID to fetch profile for
 * @returns Promise resolving to profile or null
 *
 * @example
 * ```typescript
 * // In a context without QueryClient access
 * const profile = await fetchProfile(userId);
 * ```
 */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, has_onboarded, role, created_at, updated_at')
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
        // Not found error - distinguish brand new vs existing user
        // Brand new users: missing profile is expected (async profile creation)
        // Existing users: missing profile is a data integrity issue

        try {
          // Fetch user metadata to determine account age
          const { data: userData } = await supabase.auth.getUser();

          if (userData?.user?.created_at) {
            const userCreatedAt = new Date(userData.user.created_at).getTime();
            const now = Date.now();
            const accountAgeMs = now - userCreatedAt;
            const accountAgeMinutes = Math.floor(accountAgeMs / (60 * 1000));
            const isBrandNewUser = accountAgeMs < 5 * 60 * 1000; // Less than 5 minutes

            if (isBrandNewUser) {
              // Brand new user - missing profile is expected
              return null;
            } else {
              // Existing user - missing profile is a data integrity issue
              logError(
                new Error('Profile not found for existing user'),
                'server',
                {
                  feature: 'auth',
                  operation: 'fetchProfileDirect',
                  metadata: {
                    userId,
                    errorCode: 'PGRST116',
                    accountAgeMinutes,
                    isBrandNewUser,
                    note: 'Data integrity issue: existing user has no profile row',
                  },
                }
              );
              // Still return null to allow app to continue
              return null;
            }
          }
        } catch (authError) {
          // If we can't fetch user metadata, log and return null
          logError(authError as Error, 'server', {
            feature: 'auth',
            operation: 'fetchProfileDirect',
            metadata: {
              userId,
              errorCode: 'PGRST116',
              note: 'Failed to fetch user metadata for account age check',
            },
          });
        }

        // Fallback: return null if we couldn't determine user age
        return null;
      }

      throw error;
    }

    if (!data) {
      return null;
    }

    // Validate profile data with Zod schema before mapping
    try {
      const validatedData = ProfileRowSchema.parse(data);
      return mapProfileRowToProfile(validatedData);
    } catch (zodError) {
      // Log schema validation error
      logError(zodError as Error, 'schema', {
        feature: 'auth',
        operation: 'validateProfileDirect',
        metadata: {
          userId,
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

      throw new Error('Invalid profile data received from server');
    }
  } catch (error) {
    logError(error as Error, 'server', {
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
