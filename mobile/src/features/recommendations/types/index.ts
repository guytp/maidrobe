import { z } from 'zod';

/**
 * Recommendations feature type definitions.
 *
 * This module defines the stable API contract for outfit recommendations,
 * aligned with the Supabase Edge Function response shape. These types support:
 * - Type-safe API responses from get-outfit-recommendations
 * - Runtime validation via Zod schemas
 * - Client-side type guards for defensive coding
 *
 * NAMING CONVENTION:
 * - OutfitSuggestion: Client-side application type (camelCase fields)
 * - The Edge Function returns the same shape, so no DB row mapping is needed
 *
 * CONTRACT VERSION: v1 (stable)
 * Changes to this contract should be additive (new optional fields) to
 * maintain backwards compatibility with deployed clients.
 *
 * @module features/recommendations/types
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Minimum number of outfits expected in a valid response.
 * Per user story: at least 3 outfits per response.
 */
export const MIN_OUTFITS_PER_RESPONSE = 3;

/**
 * Maximum number of outfits allowed in a response.
 * Per user story: hard cap of 10 to keep payloads small.
 */
export const MAX_OUTFITS_PER_RESPONSE = 10;

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Zod schema for validating a single outfit suggestion from the API.
 *
 * Validation rules per user story contract:
 * - id: Must be a valid UUID string (UUIDv7 format)
 * - userId: Must be a valid UUID string (derived from JWT on server)
 * - itemIds: Must be a non-empty array of strings
 * - reason: Must be a non-empty string (1-2 sentences explaining the outfit)
 * - context: Must be a non-empty string (usage descriptor)
 * - createdAt: Must be a valid ISO 8601 datetime string
 * - rating: Optional number or null (placeholder for future use)
 *
 * @example
 * ```typescript
 * const result = OutfitSuggestionSchema.safeParse(apiResponse.outfits[0]);
 * if (result.success) {
 *   const outfit: OutfitSuggestion = result.data;
 * }
 * ```
 */
export const OutfitSuggestionSchema = z.object({
  /** Unique identifier for this suggestion (UUID) */
  id: z.string().uuid(),

  /** User ID from JWT claims - cannot be overridden by client */
  userId: z.string().uuid(),

  /** Non-empty list of item identifiers (stubbed in story #362) */
  itemIds: z.array(z.string()).min(1, 'recommendations.validation.itemIdsRequired'),

  /** Natural-language explanation of why this outfit works (1-2 sentences) */
  reason: z.string().min(1, 'recommendations.validation.reasonRequired'),

  /** Short descriptor of usage context (e.g., "Smart-casual client coffee") */
  context: z.string().min(1, 'recommendations.validation.contextRequired'),

  /** ISO 8601 timestamp of when the suggestion was created on the server */
  createdAt: z.string().datetime({ message: 'recommendations.validation.invalidCreatedAt' }),

  /** Optional rating placeholder - present in schema but not used in stub */
  rating: z.number().nullable().optional(),
});

/**
 * Zod schema for validating the full API response from get-outfit-recommendations.
 *
 * Validates:
 * - Response has an 'outfits' array
 * - Array contains between MIN_OUTFITS_PER_RESPONSE and MAX_OUTFITS_PER_RESPONSE items
 * - Each item passes OutfitSuggestionSchema validation
 *
 * @example
 * ```typescript
 * const response = await fetch('/get-outfit-recommendations');
 * const json = await response.json();
 * const result = OutfitRecommendationsResponseSchema.safeParse(json);
 * if (!result.success) {
 *   // Handle schema validation error
 *   console.error(result.error.flatten());
 * }
 * ```
 */
export const OutfitRecommendationsResponseSchema = z.object({
  outfits: z
    .array(OutfitSuggestionSchema)
    .min(MIN_OUTFITS_PER_RESPONSE, 'recommendations.validation.tooFewOutfits')
    .max(MAX_OUTFITS_PER_RESPONSE, 'recommendations.validation.tooManyOutfits'),
});

// ============================================================================
// Types (inferred from schemas)
// ============================================================================

/**
 * A single outfit suggestion from the recommendation engine.
 *
 * This type represents one outfit returned by the get-outfit-recommendations
 * Edge Function. In the stub implementation (story #362), itemIds are
 * placeholder values; real item resolution happens in story #363.
 *
 * @example
 * ```typescript
 * const outfit: OutfitSuggestion = {
 *   id: '018e1234-5678-7abc-def0-123456789abc',
 *   userId: '018e0000-0000-7000-8000-000000000001',
 *   itemIds: ['item-1', 'item-2', 'item-3'],
 *   reason: 'The navy blazer keeps this polished while the white tee stops it feeling too formal.',
 *   context: 'Smart-casual client coffee',
 *   createdAt: '2025-01-15T10:30:00.000Z',
 *   rating: null,
 * };
 * ```
 */
export type OutfitSuggestion = z.infer<typeof OutfitSuggestionSchema>;

/**
 * Response shape from the get-outfit-recommendations Edge Function.
 *
 * Contains an array of outfit suggestions wrapped in a top-level object.
 * This structure allows for future expansion (e.g., adding metadata,
 * pagination info) without breaking the existing contract.
 *
 * @example
 * ```typescript
 * const response: OutfitRecommendationsResponse = {
 *   outfits: [
 *     { id: '...', userId: '...', itemIds: [...], reason: '...', context: '...', createdAt: '...', rating: null },
 *     // ... more outfits (3-10 total)
 *   ],
 * };
 * ```
 */
export type OutfitRecommendationsResponse = z.infer<typeof OutfitRecommendationsResponseSchema>;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid OutfitSuggestion.
 *
 * Uses Zod's safeParse for runtime validation, returning a boolean
 * that narrows the type when used in conditionals.
 *
 * @param value - Unknown value to check
 * @returns True if value is a valid OutfitSuggestion, false otherwise
 *
 * @example
 * ```typescript
 * const maybeOutfit: unknown = JSON.parse(someString);
 * if (isOutfitSuggestion(maybeOutfit)) {
 *   // TypeScript knows maybeOutfit is OutfitSuggestion here
 *   console.log(maybeOutfit.reason);
 * }
 * ```
 */
export function isOutfitSuggestion(value: unknown): value is OutfitSuggestion {
  return OutfitSuggestionSchema.safeParse(value).success;
}

/**
 * Type guard to check if a value is a valid OutfitRecommendationsResponse.
 *
 * Uses Zod's safeParse for runtime validation. This guard validates
 * the entire response structure including all nested outfits.
 *
 * @param value - Unknown value to check
 * @returns True if value is a valid OutfitRecommendationsResponse, false otherwise
 *
 * @example
 * ```typescript
 * const apiResponse: unknown = await response.json();
 * if (isOutfitRecommendationsResponse(apiResponse)) {
 *   // Safe to access apiResponse.outfits
 *   apiResponse.outfits.forEach(outfit => console.log(outfit.context));
 * }
 * ```
 */
export function isOutfitRecommendationsResponse(
  value: unknown
): value is OutfitRecommendationsResponse {
  return OutfitRecommendationsResponseSchema.safeParse(value).success;
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Result of parsing an outfit recommendations response.
 *
 * Provides either the validated data or structured error information
 * for handling in the service layer.
 */
export type ParseOutfitRecommendationsResult =
  | { success: true; data: OutfitRecommendationsResponse }
  | { success: false; error: z.ZodError };

/**
 * Parses and validates an unknown value as an OutfitRecommendationsResponse.
 *
 * This function provides structured error information when validation fails,
 * making it suitable for service-layer error handling and logging.
 *
 * @param value - Unknown value to parse (typically from JSON.parse)
 * @returns Result object with either validated data or Zod error
 *
 * @example
 * ```typescript
 * const result = parseOutfitRecommendationsResponse(jsonData);
 * if (result.success) {
 *   return result.data.outfits;
 * } else {
 *   // Log structured error for debugging
 *   console.error('Validation failed:', result.error.flatten());
 *   throw new SchemaValidationError(result.error);
 * }
 * ```
 */
export function parseOutfitRecommendationsResponse(
  value: unknown
): ParseOutfitRecommendationsResult {
  const result = OutfitRecommendationsResponseSchema.safeParse(value);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
