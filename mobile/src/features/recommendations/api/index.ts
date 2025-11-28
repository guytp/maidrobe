/**
 * Recommendations API exports.
 *
 * This module provides a clean interface for importing recommendation-related
 * API functions and error types.
 *
 * @module features/recommendations/api
 */

export {
  fetchOutfitRecommendations,
  FetchRecommendationsError,
  type FetchRecommendationsErrorCode,
  type FetchOutfitRecommendationsOptions,
} from './fetchOutfitRecommendations';
