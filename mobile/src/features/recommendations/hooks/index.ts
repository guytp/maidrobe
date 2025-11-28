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
