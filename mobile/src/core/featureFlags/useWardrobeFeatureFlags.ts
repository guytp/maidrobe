/**
 * Hook for fetching wardrobe feature flags from the server.
 *
 * This hook provides access to server-side wardrobe feature flags for UI adjustments.
 * The flags are fetched from the get-feature-flags Edge Function and cached with
 * a 5-minute stale time.
 *
 * IMPORTANT: These flags are for UI purposes only. The server always makes the
 * authoritative decision for backend operations. Even if the client shows a feature
 * as enabled, the backend may still reject operations if its flag evaluation differs.
 *
 * SAFE DEFAULTS:
 * When the server is unreachable or returns an error, both flags default to `false`.
 * This ensures features are hidden rather than shown when availability is uncertain.
 *
 * USAGE:
 * ```typescript
 * const { flags, isLoading, error, refetch } = useWardrobeFeatureFlags();
 *
 * // Hide AI attributes section if feature is disabled
 * {flags.wardrobe_ai_attributes_enabled && <AIAttributesSection />}
 * ```
 *
 * @module core/featureFlags/useWardrobeFeatureFlags
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabase';
import type { UserRole } from '../../features/auth/types/profile';

/**
 * Wardrobe feature flags structure returned by the server.
 */
export interface WardrobeFeatureFlags {
  /**
   * Whether image cleanup (background removal) is enabled.
   * When false, hide any UI related to image cleanup status.
   */
  wardrobe_image_cleanup_enabled: boolean;

  /**
   * Whether AI attribute detection is enabled.
   * When false, hide AI attributes UI elements and don't show
   * "detecting attributes" status indicators.
   */
  wardrobe_ai_attributes_enabled: boolean;

  /**
   * Whether the outfit recommendation stub is enabled for the user.
   * Evaluation considers environment and user cohort/role.
   *
   * Environment-specific defaults (when service unavailable):
   * - development: ON for all users
   * - staging: ON for internal, OFF for others
   * - production: OFF for all
   */
  outfit_recommendation_stub_enabled: boolean;
}

/**
 * Response from the get-feature-flags Edge Function.
 */
interface FeatureFlagsResponse {
  success: boolean;
  flags?: WardrobeFeatureFlags;
  timestamp?: string;
  error?: string;
  code?: string;
}

/**
 * Query key for wardrobe feature flags.
 * Used for cache invalidation and refetching.
 */
export const WARDROBE_FEATURE_FLAGS_QUERY_KEY = ['wardrobe', 'featureFlags'] as const;

/**
 * Safe default flags when server is unreachable or returns an error.
 * All flags are false to ensure features are hidden when availability is uncertain.
 *
 * Note: The outfit_recommendation_stub flag has environment-specific fallback
 * logic that is handled separately in the dedicated evaluation helper.
 * This default is used only as a last resort when all other fallbacks fail.
 */
const SAFE_DEFAULT_FLAGS: WardrobeFeatureFlags = {
  wardrobe_image_cleanup_enabled: false,
  wardrobe_ai_attributes_enabled: false,
  outfit_recommendation_stub_enabled: false,
};

/**
 * Options for fetching wardrobe feature flags.
 */
interface FetchWardrobeFlagsOptions {
  /** User's role for cohort-based targeting */
  userRole?: UserRole;
  /** User ID for logging (not used for targeting) */
  userId?: string;
}

/**
 * Fetches wardrobe feature flags from the server.
 *
 * Makes a request to the get-feature-flags Edge Function and returns the
 * current state of wardrobe feature flags. On error, returns safe defaults
 * (all flags false).
 *
 * @param options - Optional user context for cohort-based targeting
 * @returns Promise resolving to wardrobe feature flags
 */
async function fetchWardrobeFeatureFlags(
  options?: FetchWardrobeFlagsOptions
): Promise<WardrobeFeatureFlags> {
  try {
    // Build query params for cohort targeting if provided
    let endpoint = 'get-feature-flags';
    if (options?.userRole || options?.userId) {
      const queryParams = new URLSearchParams();
      if (options.userRole) {
        queryParams.set('role', options.userRole);
      }
      if (options.userId) {
        queryParams.set('user_id', options.userId);
      }
      endpoint = `get-feature-flags?${queryParams.toString()}`;
    }

    const { data, error } = await supabase.functions.invoke<FeatureFlagsResponse>(endpoint, {
      method: 'GET',
    });

    if (error) {
      // Log error but return safe defaults
      // eslint-disable-next-line no-console
      console.warn('[useWardrobeFeatureFlags] Error fetching flags:', error.message);
      return SAFE_DEFAULT_FLAGS;
    }

    if (!data || !data.success || !data.flags) {
      // Log warning but return safe defaults
      // eslint-disable-next-line no-console
      console.warn('[useWardrobeFeatureFlags] Invalid response:', data);
      return SAFE_DEFAULT_FLAGS;
    }

    return data.flags;
  } catch (err) {
    // Network error or other failure - return safe defaults
    // eslint-disable-next-line no-console
    console.warn('[useWardrobeFeatureFlags] Fetch failed:', err);
    return SAFE_DEFAULT_FLAGS;
  }
}

/**
 * Hook return type for wardrobe feature flags.
 */
export interface UseWardrobeFeatureFlagsResult {
  /** Current wardrobe feature flags (safe defaults if loading or error) */
  flags: WardrobeFeatureFlags;
  /** Whether the flags are currently being fetched */
  isLoading: boolean;
  /** Error from the last fetch attempt, if any */
  error: Error | null;
  /** Function to manually refetch flags */
  refetch: () => Promise<void>;
  /** Whether data is from cache and potentially stale */
  isStale: boolean;
}

/**
 * Hook for accessing wardrobe feature flags from the server.
 *
 * Fetches the current state of wardrobe feature flags and caches them
 * with a 5-minute stale time. Safe defaults are returned while loading
 * or on error.
 *
 * CACHING STRATEGY:
 * - staleTime: 5 minutes - flags are considered fresh for 5 minutes
 * - gcTime: 30 minutes - cached data is kept for 30 minutes
 * - refetchOnMount: true - refetch stale data when component mounts (screen navigation)
 * - refetchOnWindowFocus: true - refetch when app comes to foreground
 * - retry: 2 - retry failed requests twice before giving up
 *
 * @returns Object containing flags, loading state, error, and refetch function
 *
 * @example
 * ```typescript
 * function ItemDetailScreen() {
 *   const { flags, isLoading } = useWardrobeFeatureFlags();
 *
 *   // Show AI attributes section only if feature is enabled
 *   return (
 *     <View>
 *       {flags.wardrobe_ai_attributes_enabled && (
 *         <AIAttributesSection />
 *       )}
 *     </View>
 *   );
 * }
 * ```
 */
export function useWardrobeFeatureFlags(): UseWardrobeFeatureFlagsResult {
  const queryClient = useQueryClient();

  const { data, isLoading, error, isStale } = useQuery({
    queryKey: WARDROBE_FEATURE_FLAGS_QUERY_KEY,
    queryFn: () => fetchWardrobeFeatureFlags(),
    // Cache configuration
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
    // Refetch behaviour
    refetchOnMount: true, // Refetch stale data on component mount (screen navigation)
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // Retry configuration
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    // Return safe defaults as placeholder while loading
    placeholderData: SAFE_DEFAULT_FLAGS,
  });

  const refetch = async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: WARDROBE_FEATURE_FLAGS_QUERY_KEY,
    });
  };

  return {
    // Use data if available, otherwise safe defaults
    flags: data ?? SAFE_DEFAULT_FLAGS,
    isLoading,
    error: error as Error | null,
    refetch,
    isStale,
  };
}

/**
 * Prefetches wardrobe feature flags into the query cache.
 *
 * Call this during app initialization or navigation to warm the cache
 * before the flags are needed in UI components.
 *
 * @param queryClient - React Query client instance
 */
export async function prefetchWardrobeFeatureFlags(
  queryClient: ReturnType<typeof useQueryClient>
): Promise<void> {
  await queryClient.prefetchQuery({
    queryKey: WARDROBE_FEATURE_FLAGS_QUERY_KEY,
    queryFn: () => fetchWardrobeFeatureFlags(),
    staleTime: 5 * 60 * 1000,
  });
}
