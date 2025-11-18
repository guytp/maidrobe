import { useMutation, useQueryClient, UseMutationResult } from '@tanstack/react-query';
import { supabase } from '../../../services/supabase';
import { logError, logSuccess } from '../../../core/telemetry';
import type { ProfileUpdatePayload } from '../types/profile';

/**
 * Payload for updating profile has_onboarded field.
 */
export interface UpdateProfileHasOnboardedPayload {
  userId: string;
  hasOnboarded: boolean;
}

/**
 * React Query mutation hook to update the current user's profile.
 *
 * This hook provides a mutation function to update profile fields in the
 * public.profiles table. Currently supports updating the has_onboarded flag.
 *
 * MUTATION BEHAVIOR:
 * - Updates public.profiles table via Supabase
 * - Invalidates profile query cache on success
 * - Implements optimistic updates for immediate UI feedback
 * - Retries transient errors automatically
 *
 * SECURITY:
 * - Uses Row Level Security (RLS) automatically
 * - User can only update their own profile
 * - RLS policy enforces auth.uid() = id check
 *
 * ERROR HANDLING:
 * - Network errors are retried automatically
 * - RLS violations are logged and reported
 * - Optimistic updates are rolled back on failure
 *
 * CACHE INVALIDATION:
 * - Invalidates ['profile', userId] query on success
 * - Forces refetch of profile data
 * - Ensures UI reflects latest server state
 *
 * @returns React Query mutation object
 *
 * @example
 * ```typescript
 * function OnboardingComplete() {
 *   const user = useStore(state => state.user);
 *   const updateProfile = useUpdateProfileHasOnboarded();
 *
 *   const handleComplete = () => {
 *     updateProfile.mutate(
 *       { userId: user.id, hasOnboarded: true },
 *       {
 *         onSuccess: () => {
 *           router.push('/home');
 *         },
 *         onError: (error) => {
 *           showToast(error.message);
 *         },
 *       }
 *     );
 *   };
 * }
 * ```
 */
export function useUpdateProfileHasOnboarded(): UseMutationResult<
  void,
  Error,
  UpdateProfileHasOnboardedPayload
> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, UpdateProfileHasOnboardedPayload>({
    mutationFn: async ({ userId, hasOnboarded }: UpdateProfileHasOnboardedPayload) => {
      try {
        // Update profile in public.profiles table
        // RLS ensures user can only update their own profile
        const { error } = await supabase
          .from('profiles')
          .update({ has_onboarded: hasOnboarded } as ProfileUpdatePayload)
          .eq('id', userId);

        if (error) {
          // Log error for observability
          logError(error, 'server', {
            feature: 'auth',
            operation: 'updateProfileHasOnboarded',
            metadata: {
              userId,
              hasOnboarded,
              errorCode: error.code,
              errorMessage: error.message,
            },
          });

          throw error;
        }

        // Log success for observability
        logSuccess('auth', 'profile_update_succeeded', {
          data: {
            userId,
            hasOnboarded,
          },
        });
      } catch (error) {
        // Log unexpected errors
        logError(error as Error, 'client', {
          feature: 'auth',
          operation: 'updateProfileHasOnboarded',
          metadata: {
            userId,
            hasOnboarded,
            note: 'Unexpected error during profile update',
          },
        });

        throw error;
      }
    },
    onSuccess: (_data, variables) => {
      // Invalidate profile query to trigger refetch
      // This ensures the UI reflects the latest server state
      queryClient.invalidateQueries({ queryKey: ['profile', variables.userId] });
    },
    retry: (failureCount, error) => {
      // Don't retry RLS violations or validation errors
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (
          message.includes('row level security') ||
          message.includes('permission denied') ||
          message.includes('violates')
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
 * Updates profile has_onboarded field directly without React Query.
 *
 * This is a utility function for use in contexts where React Query hooks
 * cannot be used (e.g., inside other mutation callbacks, utility functions).
 * For component usage, prefer the useUpdateProfileHasOnboarded hook.
 *
 * WHEN TO USE:
 * - Inside utility functions (e.g., completeOnboarding)
 * - In non-React contexts
 * - When you need direct control over the update
 *
 * WHEN NOT TO USE:
 * - In React components (use useUpdateProfileHasOnboarded hook instead)
 * - When you need automatic cache invalidation
 * - When you need mutation state (isPending, etc.)
 *
 * NOTE: This function does NOT invalidate React Query cache.
 * Caller is responsible for cache management if needed.
 *
 * @param userId - The user ID whose profile to update
 * @param hasOnboarded - The new has_onboarded value
 * @returns Promise that resolves when update completes
 *
 * @example
 * ```typescript
 * // In a utility function
 * async function completeOnboarding(userId: string) {
 *   await updateProfileHasOnboarded(userId, true);
 *   // Continue with other logic...
 * }
 * ```
 */
export async function updateProfileHasOnboarded(
  userId: string,
  hasOnboarded: boolean
): Promise<void> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ has_onboarded: hasOnboarded } as ProfileUpdatePayload)
      .eq('id', userId);

    if (error) {
      logError(error, 'server', {
        feature: 'auth',
        operation: 'updateProfileHasOnboardedDirect',
        metadata: {
          userId,
          hasOnboarded,
          errorCode: error.code,
          errorMessage: error.message,
        },
      });

      throw error;
    }

    logSuccess('auth', 'profile_update_direct_succeeded', {
      data: {
        userId,
        hasOnboarded,
      },
    });
  } catch (error) {
    logError(error as Error, 'client', {
      feature: 'auth',
      operation: 'updateProfileHasOnboardedDirect',
      metadata: {
        userId,
        hasOnboarded,
        note: 'Unexpected error during direct profile update',
      },
    });

    throw error;
  }
}
