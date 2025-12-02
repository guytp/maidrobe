/**
 * Recommendations hooks exports.
 *
 * @module features/recommendations/hooks
 */

export {
  useOutfitRecommendations,
  useInvalidateOutfitRecommendations,
  outfitRecommendationsQueryKey,
  type UseOutfitRecommendationsResult,
  type RecommendationErrorType,
} from './useOutfitRecommendations';

export { useNetworkStatus, checkIsOffline, type NetworkStatus } from './useNetworkStatus';

// Item resolution hooks (Story #363)
export {
  useResolvedOutfitItems,
  useResolvedOutfitItemsSingle,
  type UseResolvedOutfitItemsParams,
  type UseResolvedOutfitItemsResult,
} from './useResolvedOutfitItems';

// Context parameters hook (Story #365)
export { useContextParams, type UseContextParamsResult } from './useContextParams';

// Recommendation navigation guard (Story #366)
export {
  useRecommendationGuard,
  type UseRecommendationGuardResult,
} from './useRecommendationGuard';
