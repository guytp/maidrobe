/**
 * Home feature barrel export.
 *
 * Exports all public APIs from the home feature module.
 * This allows consumers to import from '@/features/home' instead of
 * deep paths like '@/features/home/api/useHealthcheck'.
 */

export * from './api/useHealthcheck';

// Re-export recommendation hooks for Home screen convenience
export {
  useOutfitRecommendations,
  useInvalidateOutfitRecommendations,
  useNetworkStatus,
  type UseOutfitRecommendationsResult,
  type RecommendationErrorType,
  type NetworkStatus,
} from '../recommendations';
