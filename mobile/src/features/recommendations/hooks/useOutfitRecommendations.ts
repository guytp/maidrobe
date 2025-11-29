/**
 * React Query hook for fetching outfit recommendations.
 *
 * Provides on-demand fetching of outfit recommendations with:
 * - Retry logic: 2 retries for network/5xx, no retry for 4xx
 * - 5-second timeout for requests
 * - Last successful data preservation across failures
 * - Error type classification for UI states
 * - Offline detection for fast-fail and specific messaging
 * - Integration with central auth error handler (401 triggers logout)
 *
 * QUERY BEHAVIOR:
 * This hook uses `enabled: false` to prevent auto-fetching. The consumer
 * must call `fetchRecommendations()` to trigger the request. This allows
 * the UI to control when recommendations are fetched (e.g., on CTA tap).
 *
 * ERROR HANDLING:
 * - Auth errors (401): Invokes central auth error handler, triggers session
 *   recovery via markUnauthenticated, and routes to login screen
 * - Network/offline: Fast-fail with specific offline message
 * - Server errors (5xx): Retry up to 2 times with backoff
 * - Schema errors: No retry, show generic error
 *
 * STATE PRESERVATION:
 * When a fetch fails, the last successful outfit list is preserved in
 * `lastSuccessfulOutfits`. This allows the UI to continue displaying
 * recommendations even when a refresh fails.
 *
 * @module features/recommendations/hooks/useOutfitRecommendations
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from '../../../core/state/store';
import { logError } from '../../../core/telemetry';
import { handleAuthError } from '../../auth/utils/authErrorHandler';
import {
  fetchOutfitRecommendations,
  FetchRecommendationsError,
  type FetchRecommendationsErrorCode,
} from '../api/fetchOutfitRecommendations';
import { type OutfitSuggestion, type ContextParams } from '../types';
import { checkIsOffline } from './useNetworkStatus';

/**
 * Request timeout in milliseconds.
 * Enforces a sensible upper bound on request duration.
 */
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Maximum retry attempts for transient errors.
 */
const MAX_RETRIES = 2;

/**
 * Base delay for exponential backoff in milliseconds.
 */
const RETRY_BASE_DELAY_MS = 500;

/**
 * Error state types for UI rendering.
 *
 * These map to specific UI treatments:
 * - auth: User needs to re-authenticate (interceptor handles logout)
 * - offline: Device has no connectivity
 * - network: Network issue but device appears online
 * - server: Backend processing error
 * - schema: Unexpected response format
 * - unknown: Catch-all for unexpected errors
 */
export type RecommendationErrorType =
  | 'auth'
  | 'offline'
  | 'network'
  | 'server'
  | 'schema'
  | 'unknown'
  | null;

/**
 * Query key factory for outfit recommendations.
 *
 * Follows project convention of including userId for RLS compliance.
 */
export const outfitRecommendationsQueryKey = {
  /** Base key for all recommendation queries */
  all: ['outfit-recommendations'] as const,

  /** Key for a specific user's recommendations */
  user: (userId: string) => [...outfitRecommendationsQueryKey.all, userId] as const,
};

/**
 * Result type for useOutfitRecommendations hook.
 */
export interface UseOutfitRecommendationsResult {
  /** Current outfit suggestions (may be stale if error occurred) */
  outfits: OutfitSuggestion[];

  /** Last successfully fetched outfits (preserved across failures) */
  lastSuccessfulOutfits: OutfitSuggestion[];

  /** Whether a fetch is currently in progress */
  isLoading: boolean;

  /** Whether the last fetch resulted in an error */
  isError: boolean;

  /** Classified error type for UI rendering */
  errorType: RecommendationErrorType;

  /** User-friendly error message */
  errorMessage: string | null;

  /** Whether the device is currently offline */
  isOffline: boolean;

  /** Whether data has been successfully fetched at least once */
  hasData: boolean;

  /**
   * Trigger a recommendation fetch with optional context parameters.
   *
   * @param contextParams - Optional context parameters (occasion, temperatureBand)
   *                        to include in the request. When provided, these influence
   *                        the outfit suggestions returned by the Edge Function.
   */
  fetchRecommendations: (contextParams?: ContextParams) => Promise<void>;

  /** Clear cached recommendations and error state */
  reset: () => void;
}

/**
 * Maps FetchRecommendationsErrorCode to RecommendationErrorType.
 *
 * The offline type is not in FetchRecommendationsErrorCode because
 * offline detection happens in this hook before the fetch.
 */
function mapErrorCodeToType(code: FetchRecommendationsErrorCode): RecommendationErrorType {
  switch (code) {
    case 'auth':
      return 'auth';
    case 'network':
      return 'network';
    case 'server':
      return 'server';
    case 'schema':
      return 'schema';
    case 'unknown':
    default:
      return 'unknown';
  }
}

/**
 * Checks if an error represents an intentional cancellation that should not be retried.
 *
 * Cancellations include:
 * - Timeout errors (REQUEST_TIMEOUT_MS exceeded)
 * - Component unmount (React Query cancels the query)
 * - Query invalidation (user triggered a new fetch)
 *
 * These are identified by the correlationId field which we use as a marker.
 */
function isCancellationError(error: unknown): boolean {
  if (error instanceof FetchRecommendationsError) {
    return error.correlationId === 'timeout' || error.correlationId === 'cancelled';
  }
  return false;
}

/**
 * Determines if an error is transient and should be retried.
 *
 * Retries:
 * - Network errors (connectivity issues, but NOT cancellations/timeouts)
 * - Server errors (5xx, might recover)
 *
 * Does NOT retry:
 * - Auth errors (401/403 - interceptor handles)
 * - Schema errors (response format issue)
 * - Unknown errors (might be permanent)
 * - Cancellation errors (timeout, unmount - intentional)
 */
function isRetryableError(error: unknown): boolean {
  // Never retry intentional cancellations
  if (isCancellationError(error)) {
    return false;
  }

  if (error instanceof FetchRecommendationsError) {
    return error.code === 'network' || error.code === 'server';
  }
  // For unknown errors, check if they look like network errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('5')
    ); // 500, 502, 503, etc.
  }
  return false;
}

/**
 * Hook for fetching outfit recommendations on-demand.
 *
 * This hook provides a complete solution for recommendation fetching with:
 * - On-demand fetching (not auto-fetch)
 * - Smart retry logic for transient errors
 * - Request timeout enforcement
 * - Offline detection with fast-fail
 * - Error classification for UI states
 * - Last successful data preservation
 *
 * AUTHENTICATION:
 * Requires authenticated user. The hook is disabled when no user is present.
 * Auth errors (401) are handled at two levels:
 * 1. Supabase interceptor: Attempts token refresh and retries
 * 2. Hook level: If auth error persists, invokes central auth error handler
 *    and triggers session recovery via markUnauthenticated
 *
 * @returns Object with outfits, loading/error states, and control functions
 *
 * @example
 * ```typescript
 * function RecommendationsSection() {
 *   const {
 *     outfits,
 *     isLoading,
 *     isError,
 *     errorType,
 *     isOffline,
 *     fetchRecommendations,
 *   } = useOutfitRecommendations();
 *
 *   if (isOffline) {
 *     return <OfflineMessage />;
 *   }
 *
 *   return (
 *     <View>
 *       <Button onPress={fetchRecommendations} disabled={isLoading}>
 *         Get Outfit Ideas
 *       </Button>
 *
 *       {isLoading && <Loading />}
 *       {isError && <ErrorMessage type={errorType} />}
 *       {outfits.map(outfit => <OutfitCard key={outfit.id} outfit={outfit} />)}
 *     </View>
 *   );
 * }
 * ```
 */
export function useOutfitRecommendations(): UseOutfitRecommendationsResult {
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);
  const markUnauthenticated = useStore((state) => state.markUnauthenticated);
  const userId = user?.id;

  // Track last successful outfits across failures
  const lastSuccessfulOutfitsRef = useRef<OutfitSuggestion[]>([]);

  // Track offline state for fast-fail
  const isOfflineRef = useRef<boolean>(false);

  // Track context params for the current/next request
  // This ref captures the params at the time of fetch, ensuring in-flight
  // requests use the params that were active when the request started
  const contextParamsRef = useRef<ContextParams | undefined>(undefined);

  // Query configuration
  const query = useQuery<OutfitSuggestion[], FetchRecommendationsError>({
    queryKey: outfitRecommendationsQueryKey.user(userId ?? ''),

    queryFn: async ({ signal }) => {
      // Pre-flight offline check
      const offline = await checkIsOffline();
      isOfflineRef.current = offline;

      if (offline) {
        throw new FetchRecommendationsError(
          'You appear to be offline. Please check your connection.',
          'network',
          'offline-preflight'
        );
      }

      // Create timeout controller and track whether timeout specifically fired.
      // This flag distinguishes timeout aborts from other aborts (e.g., component unmount).
      let didTimeout = false;
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => {
        didTimeout = true;
        timeoutController.abort();
      }, REQUEST_TIMEOUT_MS);

      // Handler to propagate React Query's abort signal to the timeout controller.
      // Defined outside try block so it's accessible in both success and error cleanup.
      // Note: When this fires, didTimeout remains false, distinguishing it from timeout.
      const abortHandler = () => {
        if (!timeoutController.signal.aborted) {
          timeoutController.abort();
        }
      };

      try {
        // Check if React Query's signal is already aborted
        if (signal?.aborted) {
          throw new FetchRecommendationsError('Request was cancelled', 'network', 'cancelled');
        }

        // Link React Query's signal to the timeout controller
        signal?.addEventListener('abort', abortHandler);

        // Check timeout before fetch
        if (timeoutController.signal.aborted) {
          throw new FetchRecommendationsError(
            'Request timed out. Please try again.',
            'network',
            'timeout'
          );
        }

        // Pass the timeout controller's signal to enable request cancellation.
        // This signal is aborted when either:
        // - The timeout fires (REQUEST_TIMEOUT_MS exceeded)
        // - React Query cancels the request (component unmount, query invalidation)
        // Also include contextParams captured at fetch time
        const response = await fetchOutfitRecommendations({
          signal: timeoutController.signal,
          contextParams: contextParamsRef.current,
        });

        // Clear timeout on success
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortHandler);

        // Update last successful outfits and reset offline state.
        // Resetting isOfflineRef ensures consumers receive accurate connectivity status.
        lastSuccessfulOutfitsRef.current = response.outfits;
        isOfflineRef.current = false;

        return response.outfits;
      } catch (error) {
        // Clean up timeout and event listener
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortHandler);

        // Handle the error based on what caused the abort:
        // 1. Timeout: didTimeout is true - throw a timeout error
        // 2. React Query abort (unmount): signal?.aborted is true but didTimeout is false
        // 3. Other errors: neither of the above, just re-throw

        // If the timeout fired, throw a timeout-specific error
        if (didTimeout) {
          // Don't wrap if already a FetchRecommendationsError (avoid double-handling)
          if (error instanceof FetchRecommendationsError) {
            throw error;
          }
          throw new FetchRecommendationsError(
            'Request timed out. Please try again.',
            'network',
            'timeout'
          );
        }

        // If React Query cancelled (component unmount, query invalidation),
        // throw a cancellation error. This won't be retried and won't show
        // an error to the user since the component is unmounting anyway.
        if (signal?.aborted && !(error instanceof FetchRecommendationsError)) {
          throw new FetchRecommendationsError('Request was cancelled', 'network', 'cancelled');
        }

        // For all other errors, re-throw as-is
        throw error;
      }
    },

    // Disable auto-fetching - consumer must call refetch()
    enabled: false,

    // Custom retry logic
    retry: (failureCount, error) => {
      // Don't retry if we've hit max retries
      if (failureCount >= MAX_RETRIES) {
        return false;
      }

      // Only retry transient errors
      return isRetryableError(error);
    },

    // Exponential backoff with jitter
    retryDelay: (attemptIndex) => {
      const exponentialDelay = RETRY_BASE_DELAY_MS * Math.pow(2, attemptIndex);
      const jitter = Math.random() * 200;
      return Math.min(exponentialDelay + jitter, 3000);
    },

    // Keep stale data visible while refetching
    staleTime: 60 * 1000, // 1 minute

    // Cache for 5 minutes
    gcTime: 5 * 60 * 1000,
  });

  // Handle auth errors by invoking central auth error handler and triggering session recovery.
  // This effect runs when query.error changes and detects auth-related failures (401).
  // It complements the Supabase interceptor's handling by ensuring auth errors at the
  // application layer also trigger proper session cleanup and logout.
  useEffect(() => {
    if (!query.error) return;

    // Check if this is an auth error from the recommendations fetch
    const isAuthError =
      query.error instanceof FetchRecommendationsError && query.error.code === 'auth';

    if (!isAuthError) return;

    // Invoke the central auth error handler to normalize the error and log appropriately.
    // Using 'refresh' flow context since this is a data fetch that failed due to auth,
    // similar to how token refresh failures are handled.
    const normalizedError = handleAuthError(query.error, {
      flow: 'refresh',
      supabaseOperation: 'get-outfit-recommendations',
    });

    // Log the auth error for observability
    logError(query.error, 'user', {
      feature: 'recommendations',
      operation: 'auth_error_recovery',
      metadata: {
        category: normalizedError.category,
        severity: normalizedError.severity,
        correlationId:
          query.error instanceof FetchRecommendationsError ? query.error.correlationId : undefined,
      },
    });

    // Trigger session recovery by marking user as unauthenticated.
    // This clears auth state and sets a logout reason for the login screen.
    // The auth routing logic will then navigate to the login screen.
    markUnauthenticated('Your session has expired. Please sign in again.');
  }, [query.error, markUnauthenticated]);

  // Derive error type from query error
  const errorType: RecommendationErrorType = (() => {
    if (!query.error) return null;

    // Check if offline (from pre-flight check)
    if (isOfflineRef.current) {
      return 'offline';
    }

    if (query.error instanceof FetchRecommendationsError) {
      // Special case: network error when we detected offline
      if (query.error.correlationId === 'offline-preflight') {
        return 'offline';
      }
      return mapErrorCodeToType(query.error.code);
    }

    return 'unknown';
  })();

  // Get error message
  const errorMessage: string | null = (() => {
    if (!query.error) return null;

    if (errorType === 'offline') {
      return 'You appear to be offline. Please check your connection.';
    }

    if (query.error instanceof FetchRecommendationsError) {
      return query.error.message;
    }

    return 'An unexpected error occurred. Please try again.';
  })();

  // Fetch recommendations function
  const fetchRecommendations = useCallback(
    async (contextParams?: ContextParams) => {
      if (!userId) {
        logError(new Error('Cannot fetch recommendations: user not authenticated'), 'user', {
          feature: 'recommendations',
          operation: 'fetch_attempt_unauthenticated',
        });
        return;
      }

      // Capture context params for this request
      // The ref ensures the queryFn uses these params even if state changes mid-request
      contextParamsRef.current = contextParams;

      try {
        await query.refetch();
      } catch {
        // Error is captured in query.error, no need to handle here
      }
    },
    [userId, query]
  );

  // Reset function
  const reset = useCallback(() => {
    if (userId) {
      queryClient.resetQueries({
        queryKey: outfitRecommendationsQueryKey.user(userId),
      });
    }
    lastSuccessfulOutfitsRef.current = [];
    isOfflineRef.current = false;
  }, [queryClient, userId]);

  return {
    outfits: query.data ?? lastSuccessfulOutfitsRef.current,
    lastSuccessfulOutfits: lastSuccessfulOutfitsRef.current,
    isLoading: query.isFetching,
    isError: query.isError,
    errorType,
    errorMessage,
    isOffline: isOfflineRef.current,
    hasData: query.data !== undefined || lastSuccessfulOutfitsRef.current.length > 0,
    fetchRecommendations,
    reset,
  };
}

/**
 * Hook for invalidating outfit recommendations cache.
 *
 * Useful when the wardrobe changes and recommendations should be refreshed.
 *
 * @returns Function to invalidate recommendations cache
 */
export function useInvalidateOutfitRecommendations(): () => void {
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);

  return useCallback(() => {
    if (user?.id) {
      queryClient.invalidateQueries({
        queryKey: outfitRecommendationsQueryKey.user(user.id),
      });
    }
  }, [queryClient, user?.id]);
}
