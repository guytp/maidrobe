/**
 * Recommendations feature public exports.
 *
 * This module provides a clean interface for importing recommendation-related
 * types and utilities from other parts of the application.
 *
 * @module features/recommendations
 */

// Types
export type { OutfitSuggestion, OutfitRecommendationsResponse } from './types';

// Schemas (for direct validation use cases)
export {
  OutfitSuggestionSchema,
  OutfitRecommendationsResponseSchema,
} from './types';

// Type guards
export { isOutfitSuggestion, isOutfitRecommendationsResponse } from './types';

// Validation utilities
export type { ParseOutfitRecommendationsResult } from './types';
export { parseOutfitRecommendationsResponse } from './types';

// Constants
export { MIN_OUTFITS_PER_RESPONSE, MAX_OUTFITS_PER_RESPONSE } from './types';
