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
