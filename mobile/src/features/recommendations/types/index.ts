import { z } from 'zod';

// ============================================================================
// Context Parameter Types (Story #365)
// ============================================================================

/**
 * Occasion keys for outfit context selection.
 *
 * These keys are used in the client-side UI and sent to the Edge Function
 * in the `contextParams.occasion` field.
 *
 * @example
 * ```typescript
 * const occasion: OccasionKey = 'work_meeting';
 * ```
 */
export type OccasionKey = 'everyday' | 'work_meeting' | 'date' | 'weekend' | 'event';

/**
 * Temperature band keys for outfit context selection.
 *
 * These keys are used in the client-side UI and sent to the Edge Function
 * in the `contextParams.temperatureBand` field.
 *
 * - 'auto': Reserved for future weather integration
 *
 * @example
 * ```typescript
 * const temp: TemperatureBandKey = 'warm';
 * ```
 */
export type TemperatureBandKey = 'cool' | 'mild' | 'warm' | 'auto';

/**
 * Default occasion value for first-time users or when no selection is stored.
 */
export const DEFAULT_OCCASION: OccasionKey = 'everyday';

/**
 * Default temperature band value for first-time users or when no selection is stored.
 */
export const DEFAULT_TEMPERATURE_BAND: TemperatureBandKey = 'auto';

/**
 * All available occasion options in display order.
 */
export const OCCASION_OPTIONS: readonly OccasionKey[] = [
  'everyday',
  'work_meeting',
  'date',
  'weekend',
  'event',
] as const;

/**
 * All available temperature band options in display order.
 */
export const TEMPERATURE_BAND_OPTIONS: readonly TemperatureBandKey[] = [
  'cool',
  'mild',
  'warm',
  'auto',
] as const;

/**
 * Type guard to check if a value is a valid OccasionKey.
 *
 * @param value - Unknown value to check
 * @returns True if value is a valid OccasionKey
 */
export function isOccasionKey(value: unknown): value is OccasionKey {
  return (
    typeof value === 'string' &&
    (OCCASION_OPTIONS as readonly string[]).includes(value)
  );
}

/**
 * Type guard to check if a value is a valid TemperatureBandKey.
 *
 * @param value - Unknown value to check
 * @returns True if value is a valid TemperatureBandKey
 */
export function isTemperatureBandKey(value: unknown): value is TemperatureBandKey {
  return (
    typeof value === 'string' &&
    (TEMPERATURE_BAND_OPTIONS as readonly string[]).includes(value)
  );
}

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

// ============================================================================
// Item Resolution Types (Story #363)
// ============================================================================

/**
 * Resolution status for an item within an outfit suggestion.
 *
 * - 'resolved': Item was found in cache or fetched successfully
 * - 'missing': Item could not be resolved (deleted, invalid ID, or not found)
 */
export type ResolvedItemStatus = 'resolved' | 'missing';

/**
 * View-model for a single item chip in an outfit suggestion card.
 *
 * This type is used by UI components to render item chips without needing
 * to handle raw item IDs or cache lookups. Contains all data needed for:
 * - Display (name, thumbnail)
 * - Accessibility labels (type, colour)
 * - Conditional styling (resolved vs missing status)
 *
 * @example
 * ```typescript
 * const itemViewModel: OutfitItemViewModel = {
 *   id: '018e1234-5678-7abc-def0-123456789abc',
 *   displayName: 'Navy Blazer',
 *   thumbnailUrl: 'https://cdn.example.com/thumb/abc123.jpg',
 *   status: 'resolved',
 *   type: 'blazer',
 *   colour: ['navy'],
 * };
 * ```
 */
export interface OutfitItemViewModel {
  /** Original item ID from the outfit suggestion */
  id: string;

  /**
   * User-facing display name for the item.
   * Falls back to type or generic text for missing/unnamed items.
   */
  displayName: string;

  /**
   * Thumbnail URL for the item image.
   * Null if no image available or item is missing.
   */
  thumbnailUrl: string | null;

  /** Whether the item was successfully resolved or is missing */
  status: ResolvedItemStatus;

  /**
   * AI-detected item type (e.g., 'shirt', 'pants').
   * Used for accessibility labels. Null if unavailable.
   */
  type: string | null;

  /**
   * AI-detected colours for accessibility labels.
   * Null if unavailable.
   */
  colour: string[] | null;
}

/**
 * Resolved items for a single outfit suggestion.
 *
 * Maps an outfit ID to its list of resolved item view-models,
 * preserving the original order from `itemIds`.
 */
export interface ResolvedOutfitItems {
  /** The outfit suggestion ID */
  outfitId: string;

  /** Resolved item view-models in original order */
  items: OutfitItemViewModel[];
}

/**
 * Result of the item resolution process.
 *
 * Contains both the resolved items (with placeholders for missing ones)
 * and a list of IDs that need to be fetched from the server.
 *
 * @example
 * ```typescript
 * const result = resolveOutfitItems(outfits, cacheAccessor);
 *
 * // Check if any items need fetching
 * if (result.uncachedIds.length > 0) {
 *   await batchFetchItems(result.uncachedIds);
 * }
 *
 * // Access resolved items by outfit ID
 * const outfitItems = result.resolvedOutfits.get(outfit.id);
 * ```
 */
export interface ItemResolutionResult {
  /**
   * Map of outfit ID to resolved item view-models.
   * Items that couldn't be resolved have status: 'missing'.
   */
  resolvedOutfits: Map<string, OutfitItemViewModel[]>;

  /**
   * De-duplicated list of item IDs not found in cache.
   * Empty if all items were cached.
   */
  uncachedIds: string[];
}
