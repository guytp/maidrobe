/**
 * Recommendations feature public exports.
 *
 * This module provides a clean interface for importing recommendation-related
 * types, utilities, and API functions from other parts of the application.
 *
 * @module features/recommendations
 */

// Types
export type {
  OutfitSuggestion,
  OutfitRecommendationsResponse,
  ResolvedItemStatus,
  OutfitItemViewModel,
  ResolvedOutfitItems,
  ItemResolutionResult,
  OccasionKey,
  TemperatureBandKey,
} from './types';

// Context Constants (Story #365)
export {
  DEFAULT_OCCASION,
  DEFAULT_TEMPERATURE_BAND,
  OCCASION_OPTIONS,
  TEMPERATURE_BAND_OPTIONS,
  isOccasionKey,
  isTemperatureBandKey,
} from './types';

// Schemas (for direct validation use cases)
export { OutfitSuggestionSchema, OutfitRecommendationsResponseSchema } from './types';

// Type guards
export { isOutfitSuggestion, isOutfitRecommendationsResponse } from './types';

// Validation utilities
export type { ParseOutfitRecommendationsResult } from './types';
export { parseOutfitRecommendationsResponse } from './types';

// Constants
export { MIN_OUTFITS_PER_RESPONSE, MAX_OUTFITS_PER_RESPONSE } from './types';

// API
export {
  fetchOutfitRecommendations,
  FetchRecommendationsError,
  type FetchRecommendationsErrorCode,
  type FetchOutfitRecommendationsOptions,
} from './api';

// Hooks
export {
  useOutfitRecommendations,
  useInvalidateOutfitRecommendations,
  outfitRecommendationsQueryKey,
  type UseOutfitRecommendationsResult,
  type RecommendationErrorType,
} from './hooks';

export { useNetworkStatus, checkIsOffline, type NetworkStatus } from './hooks';

// Item resolution hooks (Story #363)
export {
  useResolvedOutfitItems,
  useResolvedOutfitItemsSingle,
  type UseResolvedOutfitItemsParams,
  type UseResolvedOutfitItemsResult,
} from './hooks';

// Components
export {
  ContextSelector,
  OutfitItemChip,
  OutfitSuggestionCard,
  SuggestionsSection,
  type ContextSelectorProps,
  type OutfitItemChipProps,
  type OutfitSuggestionCardProps,
  type SuggestionsSectionProps,
} from './components';

// Item Resolution Utilities (Story #363)
export {
  resolveOutfitItems,
  extractAllItemIds,
  normalizeItemIds,
  createEmptyCacheAccessor,
  type CacheableItem,
  type ItemCacheAccessor,
} from './utils';
