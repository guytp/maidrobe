/**
 * Type definitions for the get-outfit-recommendations Edge Function.
 *
 * This module defines the stable API contract for outfit recommendations.
 * These types are designed to mirror the client-side OutfitSuggestion type
 * to ensure contract alignment between server and client.
 *
 * CONTRACT VERSION: v1 (stable)
 * Changes to this contract should be additive (new optional fields) to
 * maintain backwards compatibility with deployed clients.
 *
 * @module get-outfit-recommendations/types
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Minimum number of outfits to include in a response.
 * Per user story: at least 3 outfits per response.
 */
export const MIN_OUTFITS_PER_RESPONSE = 3;

/**
 * Maximum number of outfits allowed in a response.
 * Per user story: hard cap of 10 to keep payloads small.
 */
export const MAX_OUTFITS_PER_RESPONSE = 10;

/**
 * Target number of outfits for the stub implementation.
 * Per user story: target 3-5 outfits.
 */
export const TARGET_OUTFITS_COUNT = 5;

// ============================================================================
// Core Types
// ============================================================================

/**
 * A single outfit recommendation.
 *
 * This interface represents one outfit suggestion returned by the
 * recommendation engine. In the stub implementation (story #362),
 * all data is static/hardcoded. Future stories will integrate with
 * real wardrobe items and AI-powered suggestions.
 *
 * Field requirements per user story:
 * - id: Unique UUID for this suggestion
 * - userId: Derived from JWT claims (never from client input)
 * - itemIds: Non-empty array of item identifiers
 * - reason: Natural-language explanation (1-2 sentences)
 * - context: Short usage descriptor
 * - createdAt: ISO 8601 timestamp
 * - rating: Optional, null in stub implementation
 */
export interface Outfit {
  /** Unique identifier for this suggestion (UUID) */
  id: string;

  /** User ID from authenticated JWT - populated server-side, not from client */
  userId: string;

  /** List of item identifiers comprising this outfit (stubbed in #362) */
  itemIds: string[];

  /** Natural-language explanation of why this outfit works */
  reason: string;

  /** Short descriptor of usage context (e.g., "Smart-casual client coffee") */
  context: string;

  /** ISO 8601 timestamp of when the suggestion was created */
  createdAt: string;

  /** Optional rating - present in schema but not used in stub */
  rating: number | null;
}

/**
 * Response shape for the get-outfit-recommendations endpoint.
 *
 * Contains an array of outfit suggestions wrapped in a top-level object.
 * This structure allows for future expansion without breaking the contract.
 */
export interface OutfitRecommendationsResponse {
  /** Array of outfit suggestions (3-10 items) */
  outfits: Outfit[];
}

// ============================================================================
// Request Types
// ============================================================================

/**
 * Request body for get-outfit-recommendations.
 *
 * In the stub implementation (story #362), the request body is empty
 * or ignored. Future stories may add parameters for context selection,
 * filters, or pagination.
 *
 * IMPORTANT: userId is NEVER accepted from the request body.
 * It must be derived from the JWT claims server-side.
 */
export interface OutfitRecommendationsRequest {
  // Reserved for future use (story #365: user context selection)
  // context?: string;
  // occasion?: string;
}

// ============================================================================
// Logging Types
// ============================================================================

/**
 * Outcome classification for request logging.
 *
 * Per user story observability requirements:
 * - success: Request completed successfully
 * - auth_error: JWT invalid or missing (401)
 * - client_error: Invalid request format (4xx)
 * - server_error: Internal error (5xx)
 */
export type RequestOutcome = 'success' | 'auth_error' | 'client_error' | 'server_error';

/**
 * Per-request log entry structure.
 *
 * Contains all fields required for observability per story requirements:
 * - userId: Authenticated user (from JWT)
 * - timestamp: When the request was processed
 * - outcome: Success or categorized failure
 * - durationMs: Request processing time
 * - correlationId: Request/trace ID for distributed tracing
 *
 * Privacy: Does not include PII, outfit details, or item content.
 */
export interface RequestLogEntry {
  /** Authenticated user ID (from JWT) */
  userId: string;

  /** ISO 8601 timestamp of request processing */
  timestamp: string;

  /** Outcome classification for monitoring */
  outcome: RequestOutcome;

  /** Request processing duration in milliseconds */
  durationMs: number;

  /** Correlation/trace ID for request tracing */
  correlationId: string;

  /** Number of outfits returned (only for success outcome) */
  outfitCount?: number;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validation result for outfit response construction.
 */
export interface OutfitValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates that an Outfit object has all required fields with correct types.
 *
 * This validation is used server-side before returning responses to ensure
 * the contract is satisfied. It catches programming errors early.
 *
 * @param outfit - Outfit object to validate
 * @returns Validation result with error message if invalid
 */
export function validateOutfit(outfit: unknown): OutfitValidationResult {
  if (typeof outfit !== 'object' || outfit === null) {
    return { valid: false, error: 'Outfit must be an object' };
  }

  const o = outfit as Record<string, unknown>;

  // Validate id (UUID string)
  if (typeof o.id !== 'string' || !isValidUuid(o.id)) {
    return { valid: false, error: 'Invalid or missing id (must be UUID)' };
  }

  // Validate userId (UUID string)
  if (typeof o.userId !== 'string' || !isValidUuid(o.userId)) {
    return { valid: false, error: 'Invalid or missing userId (must be UUID)' };
  }

  // Validate itemIds (non-empty array of strings)
  if (!Array.isArray(o.itemIds) || o.itemIds.length === 0) {
    return { valid: false, error: 'itemIds must be a non-empty array' };
  }
  if (!o.itemIds.every((id) => typeof id === 'string')) {
    return { valid: false, error: 'All itemIds must be strings' };
  }

  // Validate reason (non-empty string)
  if (typeof o.reason !== 'string' || o.reason.trim().length === 0) {
    return { valid: false, error: 'reason must be a non-empty string' };
  }

  // Validate context (non-empty string)
  if (typeof o.context !== 'string' || o.context.trim().length === 0) {
    return { valid: false, error: 'context must be a non-empty string' };
  }

  // Validate createdAt (ISO 8601 string)
  if (typeof o.createdAt !== 'string' || !isValidIsoDate(o.createdAt)) {
    return { valid: false, error: 'createdAt must be a valid ISO 8601 string' };
  }

  // Validate rating (number or null, optional)
  if (o.rating !== null && o.rating !== undefined && typeof o.rating !== 'number') {
    return { valid: false, error: 'rating must be a number or null' };
  }

  return { valid: true };
}

/**
 * Validates a complete OutfitRecommendationsResponse.
 *
 * Checks:
 * - Response has an 'outfits' array
 * - Array length is within bounds (MIN to MAX)
 * - Each outfit passes individual validation
 *
 * @param response - Response object to validate
 * @returns Validation result with error message if invalid
 */
export function validateOutfitRecommendationsResponse(response: unknown): OutfitValidationResult {
  if (typeof response !== 'object' || response === null) {
    return { valid: false, error: 'Response must be an object' };
  }

  const r = response as Record<string, unknown>;

  // Validate outfits array exists
  if (!Array.isArray(r.outfits)) {
    return { valid: false, error: 'Response must have an outfits array' };
  }

  // Validate array bounds
  if (r.outfits.length < MIN_OUTFITS_PER_RESPONSE) {
    return {
      valid: false,
      error: `Response must have at least ${MIN_OUTFITS_PER_RESPONSE} outfits`,
    };
  }

  if (r.outfits.length > MAX_OUTFITS_PER_RESPONSE) {
    return {
      valid: false,
      error: `Response must have at most ${MAX_OUTFITS_PER_RESPONSE} outfits`,
    };
  }

  // Validate each outfit
  for (let i = 0; i < r.outfits.length; i++) {
    const result = validateOutfit(r.outfits[i]);
    if (!result.valid) {
      return { valid: false, error: `Outfit at index ${i}: ${result.error}` };
    }
  }

  return { valid: true };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validates UUID format (v1-v7 compatible).
 *
 * @param value - String to validate
 * @returns True if value is a valid UUID format
 */
function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validates ISO 8601 datetime string format.
 *
 * @param value - String to validate
 * @returns True if value is a valid ISO 8601 datetime
 */
function isValidIsoDate(value: string): boolean {
  const date = new Date(value);
  return !isNaN(date.getTime()) && value.includes('T');
}

/**
 * Creates a valid Outfit object with the provided data.
 *
 * This factory function ensures all required fields are present
 * and validates the result before returning. Use this when
 * constructing outfits to guarantee contract compliance.
 *
 * @param data - Outfit data to construct
 * @returns Validated Outfit object
 * @throws Error if the constructed outfit fails validation
 */
export function createOutfit(data: {
  id: string;
  userId: string;
  itemIds: string[];
  reason: string;
  context: string;
  createdAt?: string;
  rating?: number | null;
}): Outfit {
  const outfit: Outfit = {
    id: data.id,
    userId: data.userId,
    itemIds: data.itemIds,
    reason: data.reason,
    context: data.context,
    createdAt: data.createdAt ?? new Date().toISOString(),
    rating: data.rating ?? null,
  };

  const validation = validateOutfit(outfit);
  if (!validation.valid) {
    throw new Error(`Invalid outfit: ${validation.error}`);
  }

  return outfit;
}
