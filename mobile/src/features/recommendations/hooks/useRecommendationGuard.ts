import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useOutfitRecommendationStubFlag } from '../../../core/featureFlags';
import { logSuccess, logError } from '../../../core/telemetry';

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
 * Logs navigation guard events with differentiated severity based on whether
 * blocks are expected or unexpected:
 *
 * - Authorized access: logSuccess with outcome: 'authorized'
 * - Expected blocks: logSuccess with outcome: 'blocked'
 *   (e.g., standard user in production with flag correctly OFF)
 * - Unexpected blocks: logError with outcome: 'blocked_unexpected'
 *   (e.g., dev environment where flag should be ON, or fallback values)
 *
 * Unexpected blocks are logged at warning severity to surface potential issues
 * in observability dashboards without generating noise for intentional blocks.
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
  const { isEnabled, isLoading, isEvaluated, result } = useOutfitRecommendationStubFlag();

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

    // Access denied - determine if this block is expected or unexpected
    //
    // UNEXPECTED BLOCKS (should be investigated):
    // - Development environment: flag should default to ON for all users
    // - Staging + internal user: flag should be ON for internal testers
    // - Fallback source: indicates flag service may be unavailable
    //
    // EXPECTED BLOCKS (working as designed):
    // - Production with remote/cached OFF: intentional feature gating
    // - Staging for non-internal users: controlled rollout working correctly
    const isUnexpectedBlock =
      result?.environment === 'development' ||
      (result?.environment === 'staging' && result?.userRole === 'internal') ||
      result?.source === 'fallback';

    const blockMetadata = {
      path: currentPath,
      flagSource: result?.source,
      flagEnvironment: result?.environment,
      userRole: result?.userRole,
      redirectTo: '/home',
    };

    if (isUnexpectedBlock) {
      // Unexpected block - log as error with warning severity for visibility
      // Classification 'user' maps to 'warning' level in Sentry
      logError(
        new Error(
          `Unexpected recommendation guard block: ${result?.environment}/${result?.userRole}/${result?.source}`
        ),
        'user',
        {
          feature: 'recommendations',
          operation: 'guard-check',
          metadata: {
            outcome: 'blocked_unexpected',
            ...blockMetadata,
          },
        }
      );
    } else {
      // Expected block - log as success with blocked outcome (low noise)
      logSuccess('recommendations', 'guard-check', {
        data: {
          outcome: 'blocked',
          ...blockMetadata,
        },
      });
    }

    // Use replace to prevent back navigation to gated route
    router.replace('/home');
  }, [isLoading, isEvaluated, isEnabled, currentPath, result, router]);

  return {
    isAuthorized: isEvaluated && isEnabled,
    isLoading,
    flagResult: result,
  };
}
