/**
 * Get Outfit Recommendations Edge Function
 *
 * Returns a stubbed list of outfit suggestions for authenticated users.
 * This is the v1 stub implementation for story #362 - it returns static
 * outfit data to validate the end-to-end flow before real AI/rules
 * integration in later stories.
 *
 * AUTHENTICATION:
 * - Requires valid Supabase JWT in Authorization header
 * - User ID is derived exclusively from JWT claims
 * - Client cannot supply or override userId via request body or query string
 * - Returns HTTP 401 for missing or invalid tokens
 *
 * RESPONSE CONTRACT:
 * - Returns { outfits: Outfit[] } with 3-5 outfit suggestions
 * - Each outfit has: id, userId, itemIds[], reason, context, createdAt, rating
 * - All outfits use the authenticated user's ID from the JWT
 * - itemIds are stubbed placeholders (real resolution in story #363)
 *
 * OBSERVABILITY:
 * - Structured JSON logging with correlation IDs
 * - Logs: userId, timestamp, outcome, durationMs, correlationId
 * - No PII or sensitive data in logs
 *
 * REQUEST:
 * POST /get-outfit-recommendations
 * Authorization: Bearer <user-jwt>
 * X-Correlation-ID: <uuid> (optional, generated if not provided)
 *
 * RESPONSE:
 * Success (200): { outfits: [...] }
 * Auth Error (401): { error: string, code: 'auth_error' }
 * Server Error (500): { error: string, code: 'server_error' }
 *
 * @module get-outfit-recommendations
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  createLogger,
  getOrGenerateCorrelationId,
  type StructuredLogger,
} from '../_shared/structuredLogger.ts';
import {
  type Outfit,
  type OutfitRecommendationsResponse,
  type RequestOutcome,
  type OccasionKey,
  type EffectiveContext,
  createOutfit,
  validateOutfitRecommendationsResponse,
  isValidOccasion,
  isValidTemperatureBand,
  MIN_OUTFITS_PER_RESPONSE,
  MAX_OUTFITS_PER_RESPONSE,
  DEFAULT_OCCASION,
  DEFAULT_TEMPERATURE_BAND,
} from './types.ts';

// ============================================================================
// Constants
// ============================================================================

/**
 * Function name for logging and identification.
 */
const FUNCTION_NAME = 'get-outfit-recommendations';

/**
 * CORS headers for cross-origin requests.
 * Allows the mobile app and web clients to call this function.
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-correlation-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Minimum allowed value for noRepeatDays.
 * 0 means no-repeat filtering is disabled.
 */
const NO_REPEAT_DAYS_MIN = 0;

/**
 * Maximum allowed value for noRepeatDays.
 * Capped at 90 days per business requirements.
 */
const NO_REPEAT_DAYS_MAX = 90;

/**
 * Maximum rows to fetch from wear history per request.
 * Prevents unbounded queries for users with extensive history.
 * If this limit is reached, a warning is logged but processing continues.
 */
const WEAR_HISTORY_ROW_LIMIT = 2000;

/**
 * Number of milliseconds in one day.
 * Used for computing the wear history cutoff timestamp.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Human-readable context phrases for each occasion type.
 *
 * These phrases are used to populate the `context` field of outfit
 * suggestions based on the effective occasion derived from client
 * context parameters.
 */
const OCCASION_CONTEXT_PHRASES: Record<OccasionKey, string> = {
  everyday: 'A comfortable, versatile look for your day.',
  work_meeting: 'Smart-casual for a client meeting.',
  date: 'Relaxed but polished for a date or drinks.',
  weekend: 'Effortlessly casual for weekend plans.',
  event: 'Dressed to impress for a special occasion.',
};

// ============================================================================
// Context Parameter Parsing
// ============================================================================

/**
 * Parses and validates context parameters from the request body.
 *
 * Implements backwards-compatible validation with defaulting:
 * - If body is null/undefined, returns defaults
 * - If contextParams is missing, returns defaults
 * - If occasion is invalid/wrong type, coerces to default
 * - If temperatureBand is invalid/wrong type, coerces to default
 * - Valid sibling fields are preserved when one field is invalid
 *
 * @param body - The parsed request body (may be null/undefined)
 * @returns EffectiveContext with validated occasion and temperatureBand
 */
export function parseContextParams(body: unknown): EffectiveContext {
  // Handle null/undefined body
  if (body === null || body === undefined) {
    return {
      occasion: DEFAULT_OCCASION,
      temperatureBand: DEFAULT_TEMPERATURE_BAND,
      wasProvided: false,
    };
  }

  // Handle non-object body
  if (typeof body !== 'object') {
    return {
      occasion: DEFAULT_OCCASION,
      temperatureBand: DEFAULT_TEMPERATURE_BAND,
      wasProvided: false,
    };
  }

  const bodyObj = body as Record<string, unknown>;

  // Handle missing contextParams
  if (
    !('contextParams' in bodyObj) ||
    bodyObj.contextParams === null ||
    bodyObj.contextParams === undefined
  ) {
    return {
      occasion: DEFAULT_OCCASION,
      temperatureBand: DEFAULT_TEMPERATURE_BAND,
      wasProvided: false,
    };
  }

  // Handle non-object contextParams
  if (typeof bodyObj.contextParams !== 'object') {
    return {
      occasion: DEFAULT_OCCASION,
      temperatureBand: DEFAULT_TEMPERATURE_BAND,
      wasProvided: true,
    };
  }

  const contextParams = bodyObj.contextParams as Record<string, unknown>;

  // Validate and default occasion
  const occasion = isValidOccasion(contextParams.occasion)
    ? contextParams.occasion
    : DEFAULT_OCCASION;

  // Validate and default temperatureBand
  const temperatureBand = isValidTemperatureBand(contextParams.temperatureBand)
    ? contextParams.temperatureBand
    : DEFAULT_TEMPERATURE_BAND;

  return {
    occasion,
    temperatureBand,
    wasProvided: true,
  };
}

/**
 * Safely parses the request body as JSON.
 *
 * Returns null if the body is empty or not valid JSON.
 * This allows backwards compatibility with clients that don't send a body.
 *
 * @param req - The HTTP request
 * @returns Parsed body or null if empty/invalid
 */
async function safeParseRequestBody(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (!text || text.trim().length === 0) {
      return null;
    }
    return JSON.parse(text);
  } catch {
    // Invalid JSON is treated as no body (backwards compatibility)
    return null;
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Standard Supabase query error shape.
 * Used to type error responses from Supabase queries.
 */
interface SupabaseError {
  message: string;
  code?: string;
}

// Note: SupabaseClient type is imported from '@supabase/supabase-js' SDK.
// This provides full type safety without needing custom interface definitions.

/**
 * Result of fetching user's no-repeat preferences.
 */
interface NoRepeatPrefsResult {
  /** The clamped noRepeatDays value (0-90). */
  noRepeatDays: number;
  /** Whether default preferences are being used (due to missing record or lookup error). */
  usingDefaultPrefs: boolean;
}

/**
 * Result of fetching user's recent wear history.
 */
interface WearHistoryResult {
  /** Set of item IDs that have been worn within the no-repeat window. */
  recentlyWornItemIds: Set<string>;
  /** Map of item ID to most recent worn_at timestamp (ISO 8601). */
  itemWornAtMap: Map<string, string>;
  /** Whether the history lookup failed or timed out. */
  historyLookupFailed: boolean;
  /** Whether the row limit was reached (may have incomplete data). */
  rowLimitReached: boolean;
}

/**
 * Result of applying no-repeat filtering to outfit candidates.
 */
interface NoRepeatFilterResult {
  /** Outfits that passed the filter (at least one item not recently worn). */
  eligible: Outfit[];
  /** Outfits that were excluded (all items worn within the window). */
  excluded: Outfit[];
}

/**
 * Result of applying MIN/MAX selection with fallback logic.
 */
interface SelectionResult {
  /** Final list of outfits to return (between 0 and MAX_OUTFITS). */
  outfits: Outfit[];
  /** Number of outfits added back from excluded list via fallback. */
  fallbackCount: number;
  /** Whether a configuration warning was triggered (pool too small). */
  configWarning: boolean;
  /** Whether a configuration error was triggered (pool empty). */
  configError: boolean;
}

// ============================================================================
// No-Repeat Preferences
// ============================================================================

/**
 * Clamps a noRepeatDays value into the valid range [0, 90].
 *
 * This is a pure function that handles all edge cases:
 * - null/undefined → 0 (no-repeat disabled)
 * - Negative values → 0
 * - Values > 90 → 90
 * - Non-integer values → floored then clamped
 * - NaN → 0
 *
 * @param value - The raw noRepeatDays value from the database
 * @returns A valid integer in the range [0, 90]
 */
export function clampNoRepeatDays(value: unknown): number {
  // Handle null, undefined, or non-number types
  if (value === null || value === undefined) {
    return NO_REPEAT_DAYS_MIN;
  }

  // Coerce to number if it's not already
  const numValue = typeof value === 'number' ? value : Number(value);

  // Handle NaN (from failed coercion or actual NaN)
  if (Number.isNaN(numValue)) {
    return NO_REPEAT_DAYS_MIN;
  }

  // Floor to handle any floating point values
  const intValue = Math.floor(numValue);

  // Clamp to valid range
  if (intValue < NO_REPEAT_DAYS_MIN) {
    return NO_REPEAT_DAYS_MIN;
  }
  if (intValue > NO_REPEAT_DAYS_MAX) {
    return NO_REPEAT_DAYS_MAX;
  }

  return intValue;
}

/**
 * Valid bucket values for noRepeatDays observability logging.
 * These buckets provide enough granularity for analysis while
 * avoiding exposure of exact user preference values.
 */
type NoRepeatDaysBucket = '0' | '1-7' | '8-30' | '31-90';

/**
 * Buckets a noRepeatDays value into privacy-safe ranges for logging.
 *
 * This function converts exact noRepeatDays values into bucketed
 * representations suitable for observability logging. The buckets
 * provide enough granularity for operational analysis while avoiding
 * exposure of exact user preference values.
 *
 * Bucket ranges:
 * - '0': No-repeat filtering disabled
 * - '1-7': Short window (up to 1 week)
 * - '8-30': Medium window (up to 1 month)
 * - '31-90': Long window (over 1 month)
 *
 * @param days - The noRepeatDays value (expected to be already clamped 0-90)
 * @returns A bucketed string representation
 */
export function bucketNoRepeatDays(days: number): NoRepeatDaysBucket {
  if (days === 0) {
    return '0';
  }
  if (days <= 7) {
    return '1-7';
  }
  if (days <= 30) {
    return '8-30';
  }
  return '31-90';
}

/**
 * Fetches the user's noRepeatDays preference from the prefs table.
 *
 * Implements degraded-mode behaviour:
 * - If the query fails, logs a warning and returns noRepeatDays = 0
 * - If no prefs record exists, logs a warning and returns noRepeatDays = 0
 * - Successfully retrieved values are clamped to [0, 90]
 *
 * Security:
 * - Uses RLS via user JWT (automatic filtering by auth.uid())
 * - Defensive userId filter as belt-and-suspenders protection
 *
 * @param supabase - Supabase client authenticated as the user
 * @param userId - The authenticated user's ID
 * @param logger - Structured logger for observability
 * @returns Promise resolving to NoRepeatPrefsResult with clamped value and failure flag
 */
async function fetchUserNoRepeatDays(
  supabase: SupabaseClient,
  userId: string,
  logger: StructuredLogger
): Promise<NoRepeatPrefsResult> {
  try {
    // Query prefs table with defensive userId filter
    // RLS policies also enforce user_id = auth.uid(), but we add explicit
    // filtering as a defence-in-depth measure
    const { data, error } = await supabase
      .from('prefs')
      .select('no_repeat_days')
      .eq('user_id', userId)
      .maybeSingle();

    // Handle query errors
    if (error) {
      logger.warn('prefs_lookup_failed', {
        user_id: userId,
        error_message: error.message,
        error_code: error.code,
        metadata: {
          degraded_mode: true,
          default_no_repeat_days: NO_REPEAT_DAYS_MIN,
        },
      });

      return {
        noRepeatDays: NO_REPEAT_DAYS_MIN,
        usingDefaultPrefs: true,
      };
    }

    // Handle missing prefs record (user hasn't set preferences yet)
    if (data === null) {
      logger.warn('prefs_not_found', {
        user_id: userId,
        metadata: {
          degraded_mode: true,
          default_no_repeat_days: NO_REPEAT_DAYS_MIN,
        },
      });

      return {
        noRepeatDays: NO_REPEAT_DAYS_MIN,
        usingDefaultPrefs: true,
      };
    }

    // Successfully retrieved prefs - clamp the value
    const rawValue = data.no_repeat_days;
    const clampedValue = clampNoRepeatDays(rawValue);

    // Determine if actual range clamping was applied (value was outside [0, 90]).
    // We normalise the raw value to an integer first (matching clampNoRepeatDays behaviour)
    // to avoid false positives from type coercion (e.g., string "30" vs number 30) or
    // floating point differences (e.g., 30.5 floored to 30 is not "clamping").
    // was_clamped should only be true when the floored value fell outside the valid range.
    const numericRaw = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    const flooredRaw = Number.isNaN(numericRaw) ? 0 : Math.floor(numericRaw);
    const wasClamped = flooredRaw < NO_REPEAT_DAYS_MIN || flooredRaw > NO_REPEAT_DAYS_MAX;

    logger.debug('prefs_loaded', {
      user_id: userId,
      metadata: {
        no_repeat_days_clamped: clampedValue,
        // Log whether range clamping was applied (value was outside [0, 90])
        was_clamped: wasClamped,
      },
    });

    return {
      noRepeatDays: clampedValue,
      usingDefaultPrefs: false,
    };
  } catch (err) {
    // Handle unexpected errors (network issues, etc.)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    logger.warn('prefs_lookup_unexpected_error', {
      user_id: userId,
      error_message: errorMessage,
      metadata: {
        degraded_mode: true,
        default_no_repeat_days: NO_REPEAT_DAYS_MIN,
      },
    });

    return {
      noRepeatDays: NO_REPEAT_DAYS_MIN,
      usingDefaultPrefs: true,
    };
  }
}

// ============================================================================
// Wear History
// ============================================================================

/**
 * Computes the UTC cutoff timestamp for wear history queries.
 *
 * @param noRepeatDays - Number of days in the no-repeat window (1-90)
 * @returns ISO 8601 timestamp string representing the cutoff
 */
function computeWearHistoryCutoff(noRepeatDays: number): string {
  const now = Date.now();
  const cutoffMs = now - noRepeatDays * MS_PER_DAY;
  return new Date(cutoffMs).toISOString();
}

/**
 * Result of extracting item IDs and timestamps from wear history rows.
 */
interface WearHistoryExtraction {
  /** Set of all unique item IDs found in the rows. */
  itemIds: Set<string>;
  /** Map of item ID to most recent worn_at timestamp. */
  itemWornAtMap: Map<string, string>;
}

/**
 * Extracts item IDs and worn_at timestamps from wear history rows.
 *
 * Each wear history row contains an `item_ids` array of item UUIDs and
 * a `worn_at` timestamp. This function:
 * - Flattens all item_ids into a single Set for O(1) lookups
 * - Builds a map from item ID to its most recent worn_at timestamp
 *
 * For the timestamp map, if an item appears in multiple rows, we keep
 * the most recent (lexicographically largest) ISO 8601 timestamp.
 *
 * @param rows - Array of wear history rows from the database
 * @returns Object with itemIds Set and itemWornAtMap
 */
function extractWearHistoryData(rows: Record<string, unknown>[]): WearHistoryExtraction {
  const itemIds = new Set<string>();
  const itemWornAtMap = new Map<string, string>();

  for (const row of rows) {
    const rowItemIds = row.item_ids;
    const wornAt = row.worn_at;

    // Validate that item_ids is an array
    if (!Array.isArray(rowItemIds)) {
      continue;
    }

    // Validate worn_at is a string (ISO 8601 timestamp)
    const wornAtStr = typeof wornAt === 'string' ? wornAt : null;

    // Process each item ID in this row
    for (const itemId of rowItemIds) {
      if (typeof itemId === 'string' && itemId.length > 0) {
        itemIds.add(itemId);

        // Update the worn_at map if this is more recent
        if (wornAtStr !== null) {
          const existing = itemWornAtMap.get(itemId);
          // ISO 8601 strings can be compared lexicographically
          if (existing === undefined || wornAtStr > existing) {
            itemWornAtMap.set(itemId, wornAtStr);
          }
        }
      }
    }
  }

  return { itemIds, itemWornAtMap };
}

/**
 * Fetches the user's recent wear history within the no-repeat window.
 *
 * Queries the wear_history table for entries where worn_at >= cutoff,
 * then extracts item IDs and timestamps for filtering and recency scoring.
 *
 * Implements degraded-mode behaviour:
 * - If the query fails, logs an error and returns empty collections
 * - If the row limit is reached, logs a warning but continues with available data
 * - The request proceeds even if history cannot be loaded
 *
 * Security:
 * - Uses RLS via user JWT (automatic filtering by auth.uid())
 * - Defensive userId filter as belt-and-suspenders protection
 *
 * Performance:
 * - Uses (user_id, worn_at) index for efficient range queries
 * - Bounded by WEAR_HISTORY_ROW_LIMIT to prevent unbounded reads
 * - Selects item_ids and worn_at columns for filtering and recency scoring
 *
 * @param supabase - Supabase client authenticated as the user
 * @param userId - The authenticated user's ID
 * @param noRepeatDays - Number of days in the no-repeat window (must be > 0)
 * @param logger - Structured logger for observability
 * @returns Promise resolving to WearHistoryResult with item IDs, timestamps, and status flags
 */
async function fetchRecentWearHistory(
  supabase: SupabaseClient,
  userId: string,
  noRepeatDays: number,
  logger: StructuredLogger
): Promise<WearHistoryResult> {
  // Compute the cutoff timestamp
  const cutoff = computeWearHistoryCutoff(noRepeatDays);

  logger.debug('wear_history_query_start', {
    user_id: userId,
    metadata: {
      cutoff_timestamp: cutoff,
      row_limit: WEAR_HISTORY_ROW_LIMIT,
    },
  });

  try {
    // Query wear_history table with defensive userId filter
    // RLS policies also enforce user_id = auth.uid(), but we add explicit
    // filtering as a defence-in-depth measure.
    // Order by worn_at descending to get most recent entries first if limit is hit.
    // Select both item_ids and worn_at for filtering and recency scoring.
    const { data, error } = await supabase
      .from('wear_history')
      .select('item_ids, worn_at')
      .eq('user_id', userId)
      .gte('worn_at', cutoff)
      .order('worn_at', { ascending: false })
      .limit(WEAR_HISTORY_ROW_LIMIT);

    // Handle query errors
    if (error) {
      logger.error('wear_history_lookup_failed', {
        user_id: userId,
        error_message: error.message,
        error_code: error.code,
        metadata: {
          degraded_mode: true,
        },
      });

      return {
        recentlyWornItemIds: new Set<string>(),
        itemWornAtMap: new Map<string, string>(),
        historyLookupFailed: true,
        rowLimitReached: false,
      };
    }

    // Handle null data (shouldn't happen with valid query, but be defensive)
    if (data === null) {
      logger.warn('wear_history_null_response', {
        user_id: userId,
        metadata: {
          degraded_mode: true,
        },
      });

      return {
        recentlyWornItemIds: new Set<string>(),
        itemWornAtMap: new Map<string, string>(),
        historyLookupFailed: true,
        rowLimitReached: false,
      };
    }

    // Check if we hit the row limit.
    // Using strict equality (===) because the query uses .limit(WEAR_HISTORY_ROW_LIMIT),
    // so data.length can never exceed the limit. When data.length equals the limit,
    // there may be additional rows that were not returned.
    const rowLimitReached = data.length === WEAR_HISTORY_ROW_LIMIT;

    if (rowLimitReached) {
      logger.warn('wear_history_row_limit_reached', {
        user_id: userId,
        metadata: {
          rows_returned: data.length,
          row_limit: WEAR_HISTORY_ROW_LIMIT,
          cutoff_timestamp: cutoff,
        },
      });
    }

    // Extract item IDs and timestamps from the wear history rows
    const { itemIds: recentlyWornItemIds, itemWornAtMap } = extractWearHistoryData(data);

    logger.debug('wear_history_loaded', {
      user_id: userId,
      metadata: {
        rows_fetched: data.length,
        unique_item_count: recentlyWornItemIds.size,
        row_limit_reached: rowLimitReached,
      },
    });

    return {
      recentlyWornItemIds,
      itemWornAtMap,
      historyLookupFailed: false,
      rowLimitReached,
    };
  } catch (err) {
    // Handle unexpected errors (network issues, timeouts, etc.)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    logger.error('wear_history_lookup_unexpected_error', {
      user_id: userId,
      error_message: errorMessage,
      metadata: {
        degraded_mode: true,
      },
    });

    return {
      recentlyWornItemIds: new Set<string>(),
      itemWornAtMap: new Map<string, string>(),
      historyLookupFailed: true,
      rowLimitReached: false,
    };
  }
}

// ============================================================================
// No-Repeat Filtering
// ============================================================================

/**
 * Checks whether ALL items in an outfit have been worn recently.
 *
 * An outfit is considered "fully recent" (and should be excluded) if
 * every item in its itemIds array exists in the recentlyWornItemIds set.
 * An outfit with at least one unworn item is considered eligible.
 *
 * Edge cases:
 * - Empty itemIds array → returns false (eligible, not filtered out)
 * - Empty recentlyWornItemIds → returns false (no history = all eligible)
 *
 * @param outfit - The outfit to check
 * @param recentlyWornItemIds - Set of item IDs worn within the no-repeat window
 * @returns true if all items were worn recently (should exclude), false otherwise
 */
function isOutfitFullyRecent(outfit: Outfit, recentlyWornItemIds: Set<string>): boolean {
  // Edge case: empty itemIds → treat as eligible (not filtered)
  if (outfit.itemIds.length === 0) {
    return false;
  }

  // Edge case: no wear history → all outfits are eligible
  if (recentlyWornItemIds.size === 0) {
    return false;
  }

  // Check if ALL items are in the recently worn set
  // If we find any item NOT in the set, the outfit is eligible
  return outfit.itemIds.every((itemId) => recentlyWornItemIds.has(itemId));
}

/**
 * Applies no-repeat filtering to a list of outfit candidates.
 *
 * Separates outfits into two lists:
 * - eligible: Outfits where at least one item has NOT been worn recently
 * - excluded: Outfits where ALL items have been worn within the window
 *
 * This is a pure function that can be reused by future AI engines.
 * The filtering logic follows the rule: "exclude outfits where EVERY item
 * has at least one wear event within the window."
 *
 * @param outfits - Array of outfit candidates to filter
 * @param recentlyWornItemIds - Set of item IDs worn within the no-repeat window
 * @returns NoRepeatFilterResult with eligible and excluded lists
 */
export function applyNoRepeatFilter(
  outfits: Outfit[],
  recentlyWornItemIds: Set<string>
): NoRepeatFilterResult {
  const eligible: Outfit[] = [];
  const excluded: Outfit[] = [];

  for (const outfit of outfits) {
    if (isOutfitFullyRecent(outfit, recentlyWornItemIds)) {
      excluded.push(outfit);
    } else {
      eligible.push(outfit);
    }
  }

  return { eligible, excluded };
}

// ============================================================================
// Fallback Selection
// ============================================================================

/**
 * Sentinel value for outfits with no recency score.
 * Using empty string ensures these sort before any valid ISO 8601 timestamp
 * when sorting in ascending order (least recently worn first).
 */
const NO_RECENCY_SCORE = '';

/**
 * Computes the recency score for an outfit based on its items' wear history.
 *
 * The recency score is the most recent (maximum) worn_at timestamp among
 * all items in the outfit. This represents when the outfit was "last fully
 * represented in a wear event."
 *
 * Items not found in the map are treated as having no wear history,
 * which returns the NO_RECENCY_SCORE sentinel.
 *
 * @param outfit - The outfit to score
 * @param itemWornAtMap - Map of item ID to most recent worn_at timestamp
 * @returns The most recent worn_at timestamp, or NO_RECENCY_SCORE if none found
 */
function computeOutfitRecencyScore(outfit: Outfit, itemWornAtMap: Map<string, string>): string {
  let maxTimestamp = NO_RECENCY_SCORE;

  for (const itemId of outfit.itemIds) {
    const timestamp = itemWornAtMap.get(itemId);
    if (timestamp !== undefined && timestamp > maxTimestamp) {
      maxTimestamp = timestamp;
    }
  }

  return maxTimestamp;
}

/**
 * Sorts outfits by recency score (ascending) with stable tie-breaking by ID.
 *
 * Outfits with no recency score (NO_RECENCY_SCORE) sort first, meaning
 * they are considered "least recently worn" and preferred for fallback.
 *
 * This is a pure function that returns a new sorted array.
 *
 * @param outfits - Array of outfits to sort
 * @param itemWornAtMap - Map of item ID to most recent worn_at timestamp
 * @returns New array sorted by ascending recency, then by outfit.id
 */
function sortOutfitsByRecency(outfits: Outfit[], itemWornAtMap: Map<string, string>): Outfit[] {
  // Compute scores once to avoid repeated calculations during sort
  const scored = outfits.map((outfit) => ({
    outfit,
    score: computeOutfitRecencyScore(outfit, itemWornAtMap),
  }));

  // Sort by ascending recency score, then by outfit.id for stability
  scored.sort((a, b) => {
    // Primary: ascending recency score (empty string sorts first)
    if (a.score !== b.score) {
      return a.score < b.score ? -1 : 1;
    }
    // Secondary: stable sort by outfit.id
    return a.outfit.id < b.outfit.id ? -1 : a.outfit.id > b.outfit.id ? 1 : 0;
  });

  return scored.map((s) => s.outfit);
}

/**
 * Applies deterministic ordering to outfits for consistent responses.
 *
 * The stub engine uses outfit.id as the sort key for deterministic ordering.
 * This ensures that the same set of outfits always returns in the same order.
 *
 * @param outfits - Array of outfits to sort
 * @returns New array sorted by outfit.id
 */
function applyDeterministicOrdering(outfits: Outfit[]): Outfit[] {
  return [...outfits].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Applies MIN/MAX selection with fallback logic to outfit candidates.
 *
 * This function implements the full selection pipeline:
 *
 * 1. If staticPool is empty → configError, return empty array
 * 2. If staticPool < MIN_OUTFITS → configWarning, return all static outfits
 * 3. If eligible ≥ MIN_OUTFITS → use eligible list
 * 4. If eligible < MIN_OUTFITS → add excluded outfits by ascending recency
 *    until reaching MIN_OUTFITS or exhausting excluded list
 * 5. Apply deterministic ordering
 * 6. Truncate to MAX_OUTFITS
 *
 * This is a pure function that can be reused by future AI engines.
 *
 * @param staticPool - The full pool of outfit candidates before filtering
 * @param eligible - Outfits that passed the no-repeat filter
 * @param excluded - Outfits that were excluded by the no-repeat filter
 * @param itemWornAtMap - Map of item ID to worn_at timestamp for recency scoring
 * @returns SelectionResult with final outfits and status flags
 */
export function applyMinMaxSelection(
  staticPool: Outfit[],
  eligible: Outfit[],
  excluded: Outfit[],
  itemWornAtMap: Map<string, string>
): SelectionResult {
  // Case 1: Empty static pool - configuration error
  if (staticPool.length === 0) {
    return {
      outfits: [],
      fallbackCount: 0,
      configWarning: false,
      configError: true,
    };
  }

  // Case 2: Static pool smaller than MIN_OUTFITS - configuration warning
  // Skip all filtering and fallback logic, return full pool
  if (staticPool.length < MIN_OUTFITS_PER_RESPONSE) {
    const ordered = applyDeterministicOrdering(staticPool);
    return {
      outfits: ordered,
      fallbackCount: 0,
      configWarning: true,
      configError: false,
    };
  }

  // Case 3 & 4: Normal operation with MIN_OUTFITS threshold
  let candidates: Outfit[];
  let fallbackCount = 0;

  if (eligible.length >= MIN_OUTFITS_PER_RESPONSE) {
    // Case 3: Enough eligible outfits - use them directly
    candidates = eligible;
  } else {
    // Case 4: Not enough eligible - add from excluded by recency
    candidates = [...eligible];
    const needed = MIN_OUTFITS_PER_RESPONSE - candidates.length;

    if (needed > 0 && excluded.length > 0) {
      // Sort excluded by ascending recency (least recently worn first)
      const sortedExcluded = sortOutfitsByRecency(excluded, itemWornAtMap);

      // Add outfits until we reach MIN_OUTFITS or exhaust excluded
      const toAdd = sortedExcluded.slice(0, needed);
      candidates = candidates.concat(toAdd);
      fallbackCount = toAdd.length;
    }
  }

  // Step 5: Apply deterministic ordering
  const ordered = applyDeterministicOrdering(candidates);

  // Step 6: Truncate to MAX_OUTFITS
  const truncated = ordered.slice(0, MAX_OUTFITS_PER_RESPONSE);

  return {
    outfits: truncated,
    fallbackCount,
    configWarning: false,
    configError: false,
  };
}

// ============================================================================
// Stubbed Outfit Data
// ============================================================================

/**
 * Static outfit templates for the stub implementation.
 *
 * Each template contains the static content for an outfit suggestion.
 * The userId and createdAt are populated dynamically at request time.
 *
 * These represent diverse use cases to demonstrate the feature:
 * - Work/professional contexts
 * - Casual/weekend contexts
 * - Weather-appropriate contexts
 * - Social occasion contexts
 */
const OUTFIT_TEMPLATES = [
  {
    itemIds: ['stub-blazer-navy-001', 'stub-tee-white-001', 'stub-chinos-tan-001'],
    reason:
      'The navy blazer keeps this polished while the white tee and tan chinos stop it feeling too formal. Perfect balance of smart and relaxed.',
    context: 'Smart-casual client coffee',
  },
  {
    itemIds: ['stub-jacket-rain-001', 'stub-sweater-grey-001', 'stub-jeans-dark-001'],
    reason:
      'Layering a lightweight sweater under a water-resistant jacket keeps you warm and dry. Dark jeans work in most settings if you need to head indoors.',
    context: 'Rainy weekday commute',
  },
  {
    itemIds: ['stub-shirt-linen-001', 'stub-shorts-navy-001', 'stub-sneakers-white-001'],
    reason:
      'A breathable linen shirt with tailored shorts strikes the right note—relaxed but put-together. White sneakers keep it fresh.',
    context: 'Weekend brunch',
  },
  {
    itemIds: ['stub-knit-cream-001', 'stub-shirt-oxford-001'],
    reason:
      'A cream knit over a collared shirt gives you that effortlessly polished look from the waist up. Comfortable yet camera-ready.',
    context: 'Video call from home',
  },
  {
    itemIds: [
      'stub-jacket-leather-001',
      'stub-tee-black-001',
      'stub-jeans-black-001',
      'stub-boots-chelsea-001',
    ],
    reason:
      'The leather jacket adds edge while the all-black base keeps things sleek. Chelsea boots elevate it beyond everyday casual.',
    context: 'Evening drinks',
  },
];

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Creates a JSON response with CORS headers.
 *
 * @param body - Response body to serialize
 * @param status - HTTP status code
 * @returns Response object with JSON content type and CORS headers
 */
function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Creates an error response with logging.
 *
 * Logs the error event and returns a standardized error response.
 * The correlationId is included in the response for client-side tracing.
 *
 * @param logger - Structured logger instance
 * @param event - Event name for logging
 * @param message - User-facing error message
 * @param outcome - Outcome classification for metrics
 * @param status - HTTP status code
 * @param durationMs - Request duration for logging
 * @returns Response object with error details
 */
function errorResponse(
  logger: StructuredLogger,
  event: string,
  message: string,
  outcome: RequestOutcome,
  status: number,
  durationMs: number
): Response {
  logger.error(event, {
    error_message: message,
    error_code: outcome,
    status_code: status,
    duration_ms: durationMs,
    metadata: { outcome },
  });

  return jsonResponse(
    {
      error: message,
      code: outcome,
      correlationId: logger.correlationId,
    },
    status
  );
}

// ============================================================================
// Outfit Generation
// ============================================================================

/**
 * Generates stubbed outfit recommendations for a user.
 *
 * Creates outfit objects from the static templates, populating:
 * - Unique UUID for each outfit
 * - User ID from authenticated JWT
 * - Current timestamp for createdAt
 * - Context phrase derived from effectiveOccasion
 * - Rating as null (placeholder for future use)
 *
 * The context phrase is determined by the effective occasion from
 * client context parameters, ensuring all outfits have consistent
 * context messaging aligned with the user's intent.
 *
 * @param userId - Authenticated user's ID from JWT
 * @param effectiveContext - Validated context with occasion and temperatureBand
 * @returns Array of validated Outfit objects
 */
function generateStubbedOutfits(userId: string, effectiveContext: EffectiveContext): Outfit[] {
  const createdAt = new Date().toISOString();
  const contextPhrase = OCCASION_CONTEXT_PHRASES[effectiveContext.occasion];

  return OUTFIT_TEMPLATES.map((template) =>
    createOutfit({
      id: crypto.randomUUID(),
      userId,
      itemIds: template.itemIds,
      reason: template.reason,
      context: contextPhrase,
      createdAt,
      rating: null,
    })
  );
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Main request handler for outfit recommendations.
 *
 * Handles:
 * 1. CORS preflight requests
 * 2. Authentication validation
 * 3. User preferences loading (with degraded-mode fallback)
 * 4. Wear history loading (conditional, with degraded-mode fallback)
 * 5. Outfit generation
 * 6. Response construction with logging
 *
 * Exported for unit testing.
 *
 * @param req - Incoming HTTP request
 * @returns Promise resolving to HTTP response
 */
export async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // Initialize logging with correlation ID
  const correlationId = getOrGenerateCorrelationId(req);
  const logger = createLogger(FUNCTION_NAME, correlationId);
  const startTime = Date.now();

  logger.info('request_received', {
    metadata: { method: req.method },
  });

  // Only allow POST requests
  if (req.method !== 'POST') {
    const durationMs = Date.now() - startTime;
    return errorResponse(
      logger,
      'method_not_allowed',
      'Method not allowed. Use POST.',
      'client_error',
      405,
      durationMs
    );
  }

  try {
    // ========================================================================
    // Step 1: Validate Authorization Header
    // ========================================================================

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const durationMs = Date.now() - startTime;
      return errorResponse(
        logger,
        'auth_header_missing',
        'Authorization header is required',
        'auth_error',
        401,
        durationMs
      );
    }

    const userJwt = authHeader.replace('Bearer ', '');

    // ========================================================================
    // Step 2: Validate JWT and Extract User ID
    // ========================================================================

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      const durationMs = Date.now() - startTime;
      logger.error('config_missing', {
        error_message: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY',
        error_code: 'server_error',
      });
      return errorResponse(
        logger,
        'config_error',
        'Service configuration error',
        'server_error',
        500,
        durationMs
      );
    }

    // Create Supabase client authenticated as the user
    // This ensures we validate the JWT through Supabase Auth
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${userJwt}` },
      },
    });

    // Validate JWT and get user information
    // This is the ONLY source of userId - never from request body or query
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      const durationMs = Date.now() - startTime;
      return errorResponse(
        logger,
        'auth_invalid_token',
        'Invalid or expired token',
        'auth_error',
        401,
        durationMs
      );
    }

    const userId = userData.user.id;

    // Log authenticated request (userId is safe for operational logging)
    logger.info('auth_validated', {
      user_id: userId,
    });

    // ========================================================================
    // Step 3: Parse Context Parameters (Story #365)
    // ========================================================================

    // Parse request body for context parameters (backwards-compatible)
    // If body is missing/invalid or contextParams is absent, defaults are used
    const requestBody = await safeParseRequestBody(req);
    const effectiveContext = parseContextParams(requestBody);

    // Log context parameter parsing for observability (Story #365)
    // This info-level log enables tracking of context adoption rates and
    // default fallback frequency in production dashboards. The correlation_id
    // is automatically included via the logger instance for request tracing.
    logger.info('context_params_parsed', {
      user_id: userId,
      metadata: {
        context_provided: effectiveContext.wasProvided,
        effective_occasion: effectiveContext.occasion,
        effective_temperature_band: effectiveContext.temperatureBand,
      },
    });

    // ========================================================================
    // Step 4: Fetch User Preferences (No-Repeat Window)
    // ========================================================================

    // Fetch the user's noRepeatDays preference for filtering.
    // This call implements degraded-mode behaviour: if prefs cannot be
    // retrieved, it returns noRepeatDays = 0 (no-repeat filtering disabled)
    // and logs a warning. The request continues without failing.
    const { noRepeatDays, usingDefaultPrefs } = await fetchUserNoRepeatDays(
      supabase,
      userId,
      logger
    );

    // Log the preference state for observability
    // Note: The actual noRepeatDays value will be logged in bucketed form
    // in the final observability step (Step 5 of the user story)
    if (usingDefaultPrefs) {
      logger.info('using_default_prefs', {
        user_id: userId,
        metadata: {
          no_repeat_days: noRepeatDays,
          reason: 'prefs_unavailable',
        },
      });
    }

    // ========================================================================
    // Step 5: Fetch Recent Wear History (if no-repeat enabled)
    // ========================================================================

    // Track wear history state for filtering, recency scoring, and observability
    let recentlyWornItemIds = new Set<string>();
    let itemWornAtMap = new Map<string, string>();
    let historyLookupFailed = false;

    // Only fetch wear history if noRepeatDays > 0 (no-repeat filtering enabled)
    // When noRepeatDays = 0, skip the query entirely to save latency
    if (noRepeatDays > 0) {
      const historyResult = await fetchRecentWearHistory(supabase, userId, noRepeatDays, logger);

      recentlyWornItemIds = historyResult.recentlyWornItemIds;
      itemWornAtMap = historyResult.itemWornAtMap;
      historyLookupFailed = historyResult.historyLookupFailed;

      // If history lookup failed, log that we're proceeding in degraded mode
      // (treating as if noRepeatDays = 0, i.e., no filtering)
      if (historyLookupFailed) {
        logger.info('using_degraded_mode', {
          user_id: userId,
          metadata: {
            reason: 'wear_history_unavailable',
            effective_no_repeat_days: 0,
          },
        });
      }
    } else {
      // No-repeat filtering is disabled, skip wear history query
      logger.debug('wear_history_skipped', {
        user_id: userId,
        metadata: {
          reason: 'no_repeat_disabled',
          no_repeat_days: noRepeatDays,
        },
      });
    }

    // ========================================================================
    // Step 6: Generate, Filter, and Select Outfit Recommendations
    // ========================================================================

    // Generate the full candidate pool from static templates
    // Context phrase is derived from effectiveContext.occasion
    // The userId comes exclusively from the JWT, preventing any client override
    const candidateOutfits = generateStubbedOutfits(userId, effectiveContext);

    // Apply no-repeat filtering based on user preferences and wear history
    // Filtering is skipped when:
    // - noRepeatDays = 0 (feature disabled by user or default)
    // - historyLookupFailed = true (degraded mode - treat as no filtering)
    const shouldApplyFiltering = noRepeatDays > 0 && !historyLookupFailed;

    let eligible: Outfit[];
    let excluded: Outfit[];

    if (shouldApplyFiltering) {
      const filterResult = applyNoRepeatFilter(candidateOutfits, recentlyWornItemIds);
      eligible = filterResult.eligible;
      excluded = filterResult.excluded;

      logger.debug('no_repeat_filter_applied', {
        user_id: userId,
        metadata: {
          candidates_count: candidateOutfits.length,
          eligible_count: eligible.length,
          excluded_count: excluded.length,
          recently_worn_item_count: recentlyWornItemIds.size,
        },
      });
    } else {
      // No filtering - all candidates are eligible, none excluded
      eligible = candidateOutfits;
      excluded = [];

      logger.debug('no_repeat_filter_skipped', {
        user_id: userId,
        metadata: {
          reason: noRepeatDays === 0 ? 'feature_disabled' : 'degraded_mode',
          candidates_count: candidateOutfits.length,
        },
      });
    }

    // Apply MIN/MAX selection with fallback logic
    const selectionResult = applyMinMaxSelection(
      candidateOutfits,
      eligible,
      excluded,
      itemWornAtMap
    );

    // Handle configuration error (empty static pool)
    if (selectionResult.configError) {
      logger.error('outfit_pool_empty', {
        user_id: userId,
        error_message: 'Static outfit pool is empty - configuration error',
        error_code: 'server_error',
        metadata: {
          static_pool_size: candidateOutfits.length,
        },
      });

      // Return empty array per requirements (not a 500 error)
      // Include full no-repeat observability for consistency
      const durationMs = Date.now() - startTime;
      logger.info('request_completed', {
        user_id: userId,
        duration_ms: durationMs,
        status_code: 200,
        metadata: {
          outcome: 'success' as RequestOutcome,
          outfit_count: 0,
          config_error: true,
          // Context parameter observability (Story #365)
          context_provided: effectiveContext.wasProvided,
          effective_occasion: effectiveContext.occasion,
          effective_temperature_band: effectiveContext.temperatureBand,
          // No-repeat observability fields (privacy-safe, bucketed)
          no_repeat_days_bucket: bucketNoRepeatDays(noRepeatDays),
          static_pool_size: candidateOutfits.length,
          filtered_pool_size: eligible.length,
          final_pool_size: 0,
          fallback_applied: false,
          using_default_prefs: usingDefaultPrefs,
          degraded_mode: historyLookupFailed,
        },
      });

      return jsonResponse({ outfits: [] }, 200);
    }

    // Handle configuration warning (pool smaller than MIN_OUTFITS)
    if (selectionResult.configWarning) {
      logger.warn('outfit_pool_below_minimum', {
        user_id: userId,
        metadata: {
          static_pool_size: candidateOutfits.length,
          min_outfits_required: MIN_OUTFITS_PER_RESPONSE,
        },
      });
    }

    // Log fallback usage if any excluded outfits were added back
    if (selectionResult.fallbackCount > 0) {
      logger.debug('fallback_outfits_added', {
        user_id: userId,
        metadata: {
          fallback_count: selectionResult.fallbackCount,
          eligible_count: eligible.length,
          final_count: selectionResult.outfits.length,
        },
      });
    }

    const outfits = selectionResult.outfits;

    // ========================================================================
    // Step 7: Construct and Validate Response
    // ========================================================================

    const response: OutfitRecommendationsResponse = { outfits };

    // Validate response against contract (catches programming errors)
    // Note: Validation is skipped for config edge cases (empty pool, small pool)
    // which legitimately return fewer than MIN_OUTFITS
    const skipValidation = selectionResult.configError || selectionResult.configWarning;

    if (!skipValidation) {
      const validation = validateOutfitRecommendationsResponse(response);
      if (!validation.valid) {
        const durationMs = Date.now() - startTime;
        logger.error('response_validation_failed', {
          user_id: userId,
          error_message: validation.error,
          error_code: 'server_error',
          duration_ms: durationMs,
        });
        return errorResponse(
          logger,
          'response_validation_failed',
          'Failed to generate valid recommendations',
          'server_error',
          500,
          durationMs
        );
      }
    }

    // ========================================================================
    // Step 8: Return Success Response with Logging
    // ========================================================================

    const durationMs = Date.now() - startTime;

    // Log successful completion with all required observability fields
    // This log entry includes privacy-safe, bucketed no-repeat metrics
    // that integrate with OpenTelemetry/Honeycomb for analysis without
    // exposing raw wear history, specific timestamps, or exact prefs values.
    logger.info('request_completed', {
      user_id: userId,
      duration_ms: durationMs,
      status_code: 200,
      metadata: {
        outcome: 'success' as RequestOutcome,
        outfit_count: outfits.length,
        // Context parameter observability (Story #365)
        context_provided: effectiveContext.wasProvided,
        effective_occasion: effectiveContext.occasion,
        effective_temperature_band: effectiveContext.temperatureBand,
        // No-repeat observability fields (privacy-safe, bucketed)
        no_repeat_days_bucket: bucketNoRepeatDays(noRepeatDays),
        static_pool_size: candidateOutfits.length,
        filtered_pool_size: eligible.length,
        final_pool_size: outfits.length,
        fallback_applied: selectionResult.fallbackCount > 0,
        using_default_prefs: usingDefaultPrefs,
        degraded_mode: historyLookupFailed,
      },
    });

    return jsonResponse(response, 200);
  } catch (error) {
    // Handle unexpected errors
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error('unexpected_error', {
      error_message: errorMessage,
      error_code: 'server_error',
      duration_ms: durationMs,
    });

    return jsonResponse(
      {
        error: 'An unexpected error occurred',
        code: 'server_error',
        correlationId,
      },
      500
    );
  }
}

// Wire the handler to Deno's HTTP server
serve(handler);
