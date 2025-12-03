import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useOutfitRecommendationStubFlag } from '../../../core/featureFlags';
import { logSuccess } from '../../../core/telemetry';

/**
 * Navigation guard hook for recommendation-related routes.
 *
 * This hook enforces the outfit_recommendation_stub feature flag for any routes
 * that provide access to outfit recommendation features. When the flag is OFF,
 * users are redirected to the home screen to prevent unauthorized access.
 *
 * FEATURE FLAG GATING:
 * The outfit_recommendation_stub flag controls access to outfit recommendations.
 * It supports:
 * - Environment-specific defaults (dev: ON, staging: internal only, prod: OFF)
 * - Cohort-based targeting (internal, beta, standard users)
 * - Safe fallback behaviour when flag service is unavailable
 *
 * LOADING BEHAVIOR:
 * While the flag is being evaluated, this hook returns `isAuthorized: false` and
 * `isLoading: true`. Components should show a loading state during this time
 * rather than rendering recommendation content.
 *
 * REDIRECT BEHAVIOR:
 * When the flag evaluates to OFF, the hook redirects to /home using router.replace().
 * This prevents users from navigating back to the gated route.
 *
 * USE CASES:
 * - Dedicated recommendation routes (e.g., /recommendations/details)
 * - Deep links to recommendation features
 * - Any future recommendation-related screens
 *
 * TELEMETRY:
 * Logs navigation guard events for observability using a unified event with
 * an explicit outcome field for clear distinction in dashboards:
 * - recommendations.guard-check with outcome: 'authorized' - Flag is ON, access granted
 * - recommendations.guard-check with outcome: 'blocked' - Flag is OFF, redirecting to home
 *
 * This design allows filtering by outcome in observability tools without
 * treating blocked access as a generic "success" event.
 *
 * @returns Object containing authorization and loading states
 *
 * @example
 * ```typescript
 * export default function RecommendationDetailsScreen() {
 *   const { isAuthorized, isLoading } = useRecommendationGuard();
 *
 *   if (isLoading) {
 *     return <LoadingSpinner />;
 *   }
 *
 *   if (!isAuthorized) {
 *     // Will redirect automatically, render nothing
 *     return null;
 *   }
 *
 *   return <RecommendationDetails />;
 * }
 * ```
 */
export interface UseRecommendationGuardResult {
  /**
   * Whether the user is authorized to access recommendation features.
   * True when the outfit_recommendation_stub flag is ON and evaluated.
   */
  isAuthorized: boolean;

  /**
   * Whether the feature flag is still being evaluated.
   * True during initial load from cache and server.
   */
  isLoading: boolean;

  /**
   * The evaluated feature flag result, if available.
   * Null while loading or if evaluation failed.
   */
  flagResult: ReturnType<typeof useOutfitRecommendationStubFlag>['result'];
}

/**
 * Hook that guards recommendation routes based on feature flag evaluation.
 *
 * @returns Guard result with authorization state and loading indicator
 */
export function useRecommendationGuard(): UseRecommendationGuardResult {
  const router = useRouter();
  const segments = useSegments();
  const {
    isEnabled,
    isLoading,
    isEvaluated,
    result,
  } = useOutfitRecommendationStubFlag();

  // Track current path for telemetry
  const currentPath = segments.join('/');

  useEffect(() => {
    // Wait for flag evaluation to complete
    if (isLoading || !isEvaluated) {
      return;
    }

    // Flag evaluated - check if access should be granted
    if (isEnabled) {
      // Access granted - log authorization event with explicit outcome
      logSuccess('recommendations', 'guard-check', {
        data: {
          outcome: 'authorized',
          path: currentPath,
          flagSource: result?.source,
          flagEnvironment: result?.environment,
          userRole: result?.userRole,
        },
      });
      return;
    }

    // Access denied - log block event with explicit outcome and redirect to home
    logSuccess('recommendations', 'guard-check', {
      data: {
        outcome: 'blocked',
        path: currentPath,
        flagSource: result?.source,
        flagEnvironment: result?.environment,
        userRole: result?.userRole,
        redirectTo: '/home',
      },
    });

    // Use replace to prevent back navigation to gated route
    router.replace('/home');
  }, [isLoading, isEvaluated, isEnabled, currentPath, result, router]);

  return {
    isAuthorized: isEvaluated && isEnabled,
    isLoading,
    flagResult: result,
  };
}
