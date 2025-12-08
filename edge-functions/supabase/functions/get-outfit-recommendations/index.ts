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
  type OutfitWithMeta,
  type RepeatedItemSummary,
  type OutfitRecommendationsResponse,
  type NoRepeatFilteringMeta,
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
import {
  applyNoRepeatRules,
  type WearHistoryEntry,
  type NoRepeatPrefs,
  type ApplyNoRepeatRulesResult,
  type FallbackCandidate,
  DEFAULT_STRICT_MIN_COUNT,
} from '../_shared/noRepeatRules.ts';

// ============================================================================
// Re-exports for Test Surface
// ============================================================================
//
// These exports provide a consistent public API for testing. They expose
// the no-repeat filtering functionality through the endpoint module,
// allowing tests to exercise the behavior without importing from internal
// shared modules directly.
//
// - applyNoRepeatFilter: Re-export of applyNoRepeatRules for filtering tests
// - applyMinMaxSelection: Alias for applyFinalSelection (legacy naming)
// ============================================================================

/**
 * Re-export of applyNoRepeatRules for test surface consistency.
 *
 * This allows tests to import the no-repeat filtering function from the
 * endpoint module rather than the internal shared module, providing a
 * cleaner public API for testing the recommendation flow.
 */
export { applyNoRepeatRules as applyNoRepeatFilter };

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
  everyday: 'Simple everyday outfit for your usual routine.',
  work_meeting: 'Smart-casual for a client meeting.',
  date: 'Relaxed but polished for a date or drinks.',
  weekend: 'Effortlessly casual for weekend plans.',
  event: 'Dressed-up look for a party or event.',
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

// Note: SupabaseClient type is imported from '@supabase/supabase-js' SDK.
// This provides full type safety without needing custom interface definitions.

/**
 * Default no-repeat mode when not specified or invalid.
 */
const DEFAULT_NO_REPEAT_MODE: 'item' | 'outfit' = 'item';

/**
 * Result of fetching user's no-repeat preferences.
 */
interface NoRepeatPrefsResult {
  /** The clamped noRepeatDays value (0-90). */
  noRepeatDays: number;
  /** The no-repeat mode ('item' or 'outfit'). */
  noRepeatMode: 'item' | 'outfit';
  /** Whether default preferences are being used (due to missing record or lookup error). */
  usingDefaultPrefs: boolean;
}

/**
 * Result of fetching user's recent wear history.
 */
interface WearHistoryResult {
  /** Wear history entries compatible with noRepeatRules module. */
  wearHistory: WearHistoryEntry[];
  /** Whether the history lookup failed or timed out. */
  historyLookupFailed: boolean;
  /** Whether the row limit was reached (may have incomplete data). */
  rowLimitReached: boolean;
}

/**
 * Result of applying final selection with fallback logic.
 */
interface SelectionResult {
  /** Final list of outfits with no-repeat metadata (between 0 and MAX_OUTFITS). */
  outfits: OutfitWithMeta[];
  /** Number of outfits from fallback candidates used. */
  fallbackCount: number;
  /** Whether a configuration warning was triggered (pool too small). */
  configWarning: boolean;
  /** Whether a configuration error was triggered (pool empty). */
  configError: boolean;
  /** IDs of items that would be repeated (for analytics). */
  repeatedItemIds: string[];
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
 * Validates and normalizes the no_repeat_mode value.
 *
 * @param value - The raw no_repeat_mode value from the database
 * @returns A valid 'item' or 'outfit' mode
 */
function normalizeNoRepeatMode(value: unknown): 'item' | 'outfit' {
  if (value === 'item' || value === 'outfit') {
    return value;
  }
  return DEFAULT_NO_REPEAT_MODE;
}

/**
 * Fetches the user's no-repeat preferences from the prefs table.
 *
 * Implements degraded-mode behaviour:
 * - If the query fails, logs a warning and returns noRepeatDays = 0, mode = 'item'
 * - If no prefs record exists, logs a warning and returns noRepeatDays = 0, mode = 'item'
 * - Successfully retrieved values are clamped/normalized
 *
 * Security:
 * - Uses RLS via user JWT (automatic filtering by auth.uid())
 * - Defensive userId filter as belt-and-suspenders protection
 *
 * @param supabase - Supabase client authenticated as the user
 * @param userId - The authenticated user's ID
 * @param logger - Structured logger for observability
 * @returns Promise resolving to NoRepeatPrefsResult with clamped/normalized values
 */
async function fetchUserNoRepeatPrefs(
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
      .select('no_repeat_days, no_repeat_mode')
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
          default_no_repeat_mode: DEFAULT_NO_REPEAT_MODE,
        },
      });

      return {
        noRepeatDays: NO_REPEAT_DAYS_MIN,
        noRepeatMode: DEFAULT_NO_REPEAT_MODE,
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
          default_no_repeat_mode: DEFAULT_NO_REPEAT_MODE,
        },
      });

      return {
        noRepeatDays: NO_REPEAT_DAYS_MIN,
        noRepeatMode: DEFAULT_NO_REPEAT_MODE,
        usingDefaultPrefs: true,
      };
    }

    // Successfully retrieved prefs - clamp and normalize values
    const rawDays = data.no_repeat_days;
    const clampedDays = clampNoRepeatDays(rawDays);
    const normalizedMode = normalizeNoRepeatMode(data.no_repeat_mode);

    // Determine if actual range clamping was applied (value was outside [0, 90]).
    // We normalise the raw value to an integer first (matching clampNoRepeatDays behaviour)
    // to avoid false positives from type coercion (e.g., string "30" vs number 30) or
    // floating point differences (e.g., 30.5 floored to 30 is not "clamping").
    // was_clamped should only be true when the floored value fell outside the valid range.
    const numericRaw = typeof rawDays === 'number' ? rawDays : Number(rawDays);
    const flooredRaw = Number.isNaN(numericRaw) ? 0 : Math.floor(numericRaw);
    const wasDaysClamped = flooredRaw < NO_REPEAT_DAYS_MIN || flooredRaw > NO_REPEAT_DAYS_MAX;

    logger.debug('prefs_loaded', {
      user_id: userId,
      metadata: {
        no_repeat_days_clamped: clampedDays,
        no_repeat_mode: normalizedMode,
        // Log whether range clamping was applied (value was outside [0, 90])
        was_days_clamped: wasDaysClamped,
      },
    });

    return {
      noRepeatDays: clampedDays,
      noRepeatMode: normalizedMode,
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
        default_no_repeat_mode: DEFAULT_NO_REPEAT_MODE,
      },
    });

    return {
      noRepeatDays: NO_REPEAT_DAYS_MIN,
      noRepeatMode: DEFAULT_NO_REPEAT_MODE,
      usingDefaultPrefs: true,
    };
  }
}

// ============================================================================
// Wear History
// ============================================================================

/**
 * Computes the cutoff date for wear history queries.
 *
 * We add an extra buffer day to the query to ensure we capture all potentially
 * relevant entries. The noRepeatRules module will do the precise calendar-day
 * filtering using the targetDate.
 *
 * Note: This uses UTC date via `toISOString()`. See `getTodayDateString()`
 * for details on UTC vs local time considerations.
 *
 * @param noRepeatDays - Number of days in the no-repeat window (1-90)
 * @returns ISO 8601 date string (YYYY-MM-DD) representing the cutoff in UTC
 */
function computeWearHistoryCutoffDate(noRepeatDays: number): string {
  const now = new Date();
  // Add buffer to ensure we get all relevant entries
  const cutoffMs = now.getTime() - (noRepeatDays + 1) * MS_PER_DAY;
  const cutoff = new Date(cutoffMs);
  // Return YYYY-MM-DD format (UTC)
  return cutoff.toISOString().split('T')[0];
}

/**
 * Converts database wear history rows to WearHistoryEntry format.
 *
 * Each row contains item_ids (array), outfit_id (UUID), and worn_date (DATE).
 * This function transforms them into the format expected by the noRepeatRules module.
 *
 * @param rows - Array of wear history rows from the database
 * @returns Array of WearHistoryEntry objects
 */
function convertToWearHistoryEntries(rows: Record<string, unknown>[]): WearHistoryEntry[] {
  const entries: WearHistoryEntry[] = [];

  for (const row of rows) {
    const rowItemIds = row.item_ids;
    const wornDate = row.worn_date;
    const outfitId = row.outfit_id;

    // Validate that item_ids is an array
    if (!Array.isArray(rowItemIds)) {
      continue;
    }

    // Validate worn_date is a string (YYYY-MM-DD format from DATE column)
    if (typeof wornDate !== 'string') {
      continue;
    }

    // Extract valid string item IDs
    const itemIds: string[] = [];
    for (const itemId of rowItemIds) {
      if (typeof itemId === 'string' && itemId.length > 0) {
        itemIds.push(itemId);
      }
    }

    // Skip if no valid item IDs
    if (itemIds.length === 0) {
      continue;
    }

    const entry: WearHistoryEntry = {
      itemIds,
      wornDate,
    };

    // Add outfit ID if present (used for outfit mode matching)
    if (typeof outfitId === 'string' && outfitId.length > 0) {
      entry.outfitId = outfitId;
    }

    entries.push(entry);
  }

  return entries;
}

/**
 * Fetches the user's recent wear history for no-repeat filtering.
 *
 * Queries the wear_history table for entries within a generous window,
 * then returns WearHistoryEntry[] compatible with the noRepeatRules module.
 *
 * Implements degraded-mode behaviour:
 * - If the query fails, logs an error and returns empty array
 * - If the row limit is reached, logs a warning but continues with available data
 * - The request proceeds even if history cannot be loaded
 *
 * Security:
 * - Uses RLS via user JWT (automatic filtering by auth.uid())
 * - Defensive userId filter as belt-and-suspenders protection
 *
 * Performance:
 * - Uses (user_id, worn_date) index for efficient range queries
 * - Bounded by WEAR_HISTORY_ROW_LIMIT to prevent unbounded reads
 * - Selects item_ids, outfit_id, and worn_date for filtering
 *
 * @param supabase - Supabase client authenticated as the user
 * @param userId - The authenticated user's ID
 * @param noRepeatDays - Number of days in the no-repeat window (must be > 0)
 * @param logger - Structured logger for observability
 * @returns Promise resolving to WearHistoryResult with entries and status flags
 */
async function fetchRecentWearHistory(
  supabase: SupabaseClient,
  userId: string,
  noRepeatDays: number,
  logger: StructuredLogger
): Promise<WearHistoryResult> {
  // Compute the cutoff date (with buffer)
  const cutoffDate = computeWearHistoryCutoffDate(noRepeatDays);

  logger.debug('wear_history_query_start', {
    user_id: userId,
    metadata: {
      cutoff_date: cutoffDate,
      row_limit: WEAR_HISTORY_ROW_LIMIT,
    },
  });

  try {
    // Query wear_history table with defensive userId filter
    // RLS policies also enforce user_id = auth.uid(), but we add explicit
    // filtering as a defence-in-depth measure.
    // Order by worn_date descending to get most recent entries first if limit is hit.
    // Select item_ids, outfit_id, and worn_date for the noRepeatRules module.
    const { data, error } = await supabase
      .from('wear_history')
      .select('item_ids, outfit_id, worn_date')
      .eq('user_id', userId)
      .gte('worn_date', cutoffDate)
      .order('worn_date', { ascending: false })
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
        wearHistory: [],
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
        wearHistory: [],
        historyLookupFailed: true,
        rowLimitReached: false,
      };
    }

    // Check if we hit the row limit.
    const rowLimitReached = data.length === WEAR_HISTORY_ROW_LIMIT;

    if (rowLimitReached) {
      logger.warn('wear_history_row_limit_reached', {
        user_id: userId,
        metadata: {
          rows_returned: data.length,
          row_limit: WEAR_HISTORY_ROW_LIMIT,
          cutoff_date: cutoffDate,
        },
      });
    }

    // Convert to WearHistoryEntry format
    const wearHistory = convertToWearHistoryEntries(data);

    logger.debug('wear_history_loaded', {
      user_id: userId,
      metadata: {
        rows_fetched: data.length,
        entries_converted: wearHistory.length,
        row_limit_reached: rowLimitReached,
      },
    });

    return {
      wearHistory,
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
      wearHistory: [],
      historyLookupFailed: true,
      rowLimitReached: false,
    };
  }
}

// ============================================================================
// Final Selection
// ============================================================================

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
 * Converts a FallbackCandidate's repeatedItems to RepeatedItemSummary[].
 *
 * @param fallback - The fallback candidate containing repeated items
 * @returns Array of RepeatedItemSummary for the response
 */
function toRepeatedItemSummaries(fallback: FallbackCandidate): RepeatedItemSummary[] {
  return fallback.repeatedItems.map((item) => ({
    id: item.id,
    // Include name if available (may be undefined in stub)
    ...(item.name !== undefined && { name: item.name }),
  }));
}

/**
 * Adds no-repeat metadata to an outfit, marking it as strict.
 *
 * @param outfit - The base outfit
 * @returns Outfit with strict noRepeatMeta
 */
function addStrictMeta(outfit: Outfit): OutfitWithMeta {
  return {
    ...outfit,
    noRepeatMeta: {
      filterStatus: 'strict',
      repeatedItems: [],
    },
  };
}

/**
 * Adds no-repeat metadata to a fallback outfit.
 *
 * @param fallback - The fallback candidate with repeated items
 * @returns Outfit with fallback noRepeatMeta
 */
function addFallbackMeta(fallback: FallbackCandidate): OutfitWithMeta {
  return {
    ...fallback.outfit,
    noRepeatMeta: {
      filterStatus: 'fallback',
      repeatedItems: toRepeatedItemSummaries(fallback),
    },
  };
}

/**
 * Applies deterministic ordering to outfits with metadata.
 *
 * @param outfits - Array of outfits with metadata to sort
 * @returns New array sorted by outfit.id
 */
function applyDeterministicOrderingWithMeta(outfits: OutfitWithMeta[]): OutfitWithMeta[] {
  return [...outfits].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Applies MIN/MAX selection using results from the noRepeatRules module.
 *
 * This function implements the final selection pipeline:
 *
 * 1. If staticPool is empty → configError, return empty array
 * 2. If staticPool < MIN_OUTFITS → configWarning, return all static outfits (no metadata)
 * 3. If strictFiltered ≥ MIN_OUTFITS → use strict results with 'strict' metadata
 * 4. If strictFiltered < MIN_OUTFITS → add from fallbackCandidates with 'fallback' metadata
 *    (already sorted by fewest repeated items first)
 * 5. Apply deterministic ordering
 * 6. Truncate to MAX_OUTFITS
 *
 * Each outfit includes noRepeatMeta indicating whether it's strict or fallback,
 * and for fallback outfits, a summary of repeated items.
 *
 * @param staticPool - The full pool of outfit candidates before filtering
 * @param rulesResult - Result from applyNoRepeatRules (strictFiltered + fallbackCandidates)
 * @param includeMetadata - Whether to include noRepeatMeta (false when filtering disabled)
 * @returns SelectionResult with final outfits and status flags
 */
export function applyFinalSelection(
  staticPool: Outfit[],
  rulesResult: ApplyNoRepeatRulesResult,
  includeMetadata: boolean = true
): SelectionResult {
  // Case 1: Empty static pool - configuration error
  if (staticPool.length === 0) {
    return {
      outfits: [],
      fallbackCount: 0,
      configWarning: false,
      configError: true,
      repeatedItemIds: [],
    };
  }

  // Case 2: Static pool smaller than MIN_OUTFITS - configuration warning
  // Skip all filtering and fallback logic, return full pool without metadata
  if (staticPool.length < MIN_OUTFITS_PER_RESPONSE) {
    const ordered = applyDeterministicOrdering(staticPool);
    return {
      outfits: ordered,
      fallbackCount: 0,
      configWarning: true,
      configError: false,
      repeatedItemIds: [],
    };
  }

  const { strictFiltered, fallbackCandidates } = rulesResult;

  // Case 3 & 4: Normal operation with MIN_OUTFITS threshold
  const candidates: OutfitWithMeta[] = [];
  let fallbackCount = 0;
  const repeatedItemIds = new Set<string>();

  // Track selected outfit IDs to prevent duplicates (defence-in-depth)
  // The noRepeatRules module already excludes strict outfits from fallbacks,
  // but this guard protects against edge cases and future changes.
  const selectedOutfitIds = new Set<string>();

  // Add strict outfits with metadata
  for (const outfit of strictFiltered) {
    selectedOutfitIds.add(outfit.id);
    if (includeMetadata) {
      candidates.push(addStrictMeta(outfit));
    } else {
      candidates.push(outfit);
    }
  }

  // If not enough strict, add from fallbackCandidates
  if (strictFiltered.length < MIN_OUTFITS_PER_RESPONSE) {
    const needed = MIN_OUTFITS_PER_RESPONSE - strictFiltered.length;

    if (needed > 0 && fallbackCandidates.length > 0) {
      let added = 0;

      for (const fallback of fallbackCandidates) {
        if (added >= needed) {
          break;
        }

        // Skip if already selected (defence-in-depth against duplicates)
        if (selectedOutfitIds.has(fallback.outfit.id)) {
          continue;
        }

        selectedOutfitIds.add(fallback.outfit.id);

        if (includeMetadata) {
          candidates.push(addFallbackMeta(fallback));
        } else {
          candidates.push(fallback.outfit);
        }
        added++;
        fallbackCount++;

        // Collect repeated item IDs for analytics
        for (const item of fallback.repeatedItems) {
          repeatedItemIds.add(item.id);
        }
      }
    }
  }

  // Step 5: Apply deterministic ordering
  const ordered = applyDeterministicOrderingWithMeta(candidates);

  // Step 6: Truncate to MAX_OUTFITS
  const truncated = ordered.slice(0, MAX_OUTFITS_PER_RESPONSE);

  return {
    outfits: truncated,
    fallbackCount,
    configWarning: false,
    configError: false,
    repeatedItemIds: Array.from(repeatedItemIds),
  };
}

/**
 * Alias for applyFinalSelection for test surface consistency.
 *
 * This provides an alternative name that may be used in tests or
 * documentation referring to the MIN/MAX selection logic. Both names
 * reference the same underlying function.
 *
 * @see applyFinalSelection
 */
export const applyMinMaxSelection = applyFinalSelection;

/**
 * Gets today's date in YYYY-MM-DD format (UTC).
 *
 * This is used as the targetDate for the noRepeatRules module.
 *
 * ## Time Semantics
 *
 * The current stub implementation uses **UTC date** via `toISOString()`.
 * This means the returned date may differ from the user's local calendar
 * date near midnight. For example:
 * - At 11pm EST (04:00 UTC next day), this returns tomorrow's UTC date
 * - At 1am EST (06:00 UTC), this returns today's UTC date
 *
 * ## Future Considerations
 *
 * Production implementations should accept a client-provided timezone
 * or derive the user's timezone from their profile to ensure the
 * targetDate matches the user's local calendar day. The noRepeatRules
 * module expects dates in the user's local timezone for accurate
 * calendar-day semantics.
 *
 * @returns Today's UTC date as YYYY-MM-DD string
 */
function getTodayDateString(): string {
  const now = new Date();
  // Note: toISOString() returns UTC time, not local time
  return now.toISOString().split('T')[0];
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
      'The navy blazer keeps this polished while the white tee and tan chinos ' +
      'stop it feeling too formal. Perfect balance of smart and relaxed.',
    context: 'Smart-casual client coffee',
  },
  {
    itemIds: ['stub-jacket-rain-001', 'stub-sweater-grey-001', 'stub-jeans-dark-001'],
    reason:
      'Layering a lightweight sweater under a water-resistant jacket keeps you ' +
      'warm and dry. Dark jeans work in most settings if you need to head indoors.',
    context: 'Rainy weekday commute',
  },
  {
    itemIds: ['stub-shirt-linen-001', 'stub-shorts-navy-001', 'stub-sneakers-white-001'],
    reason:
      'A breathable linen shirt with tailored shorts strikes the right note—relaxed ' +
      'but put-together. White sneakers keep it fresh.',
    context: 'Weekend brunch',
  },
  {
    itemIds: ['stub-knit-cream-001', 'stub-shirt-oxford-001'],
    reason:
      'A cream knit over a collared shirt gives you that effortlessly polished look ' +
      'from the waist up. Comfortable yet camera-ready.',
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
      'The leather jacket adds edge while the all-black base keeps things sleek. ' +
      'Chelsea boots elevate it beyond everyday casual.',
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
    // Cast RequestOutcome to string for metadata type compatibility
    metadata: { outcome: outcome as string },
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
        // Cast string literal union types to string for metadata type compatibility
        effective_occasion: effectiveContext.occasion as string,
        effective_temperature_band: effectiveContext.temperatureBand as string,
      },
    });

    // ========================================================================
    // Step 4: Fetch User Preferences (No-Repeat Window and Mode)
    // ========================================================================

    // Fetch the user's no-repeat preferences for filtering.
    // This call implements degraded-mode behaviour: if prefs cannot be
    // retrieved, it returns noRepeatDays = 0, noRepeatMode = 'item'
    // and logs a warning. The request continues without failing.
    const { noRepeatDays, noRepeatMode, usingDefaultPrefs } = await fetchUserNoRepeatPrefs(
      supabase,
      userId,
      logger
    );

    // Log the preference state for observability
    if (usingDefaultPrefs) {
      logger.info('using_default_prefs', {
        user_id: userId,
        metadata: {
          no_repeat_days: noRepeatDays,
          no_repeat_mode: noRepeatMode,
          reason: 'prefs_unavailable',
        },
      });
    }

    // ========================================================================
    // Step 5: Fetch Recent Wear History (if no-repeat enabled)
    // ========================================================================

    // Track wear history state for filtering and observability
    let wearHistory: WearHistoryEntry[] = [];
    let historyLookupFailed = false;

    // Only fetch wear history if noRepeatDays > 0 (no-repeat filtering enabled)
    // When noRepeatDays = 0, skip the query entirely to save latency
    if (noRepeatDays > 0) {
      const historyResult = await fetchRecentWearHistory(supabase, userId, noRepeatDays, logger);

      wearHistory = historyResult.wearHistory;
      historyLookupFailed = historyResult.historyLookupFailed;

      // If history lookup failed, log that we're proceeding in degraded mode
      // (treating as if noRepeatDays = 0, i.e., no filtering)
      // Uses warn severity for alerting - this indicates service degradation
      if (historyLookupFailed) {
        logger.warn('using_degraded_mode', {
          user_id: userId,
          metadata: {
            reason: 'wear_history_unavailable',
            effective_no_repeat_days: 0,
            requested_no_repeat_days: noRepeatDays,
            no_repeat_mode: noRepeatMode,
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

    // Apply no-repeat filtering using the rules module
    // Filtering is skipped when:
    // - noRepeatDays = 0 (feature disabled by user or default)
    // - historyLookupFailed = true (degraded mode - treat as no filtering)
    const shouldApplyFiltering = noRepeatDays > 0 && !historyLookupFailed;

    // Build prefs object for rules module
    const noRepeatPrefs: NoRepeatPrefs = {
      noRepeatDays,
      noRepeatMode,
    };

    // Get today's date for the rules module
    const targetDate = getTodayDateString();

    // Apply the no-repeat rules using the shared module
    // Track timing for p95 performance monitoring (target: filtering should be fast)
    const noRepeatFilterStartTime = Date.now();
    let rulesResult: ApplyNoRepeatRulesResult;

    if (shouldApplyFiltering) {
      rulesResult = applyNoRepeatRules({
        candidates: candidateOutfits,
        wearHistory,
        prefs: noRepeatPrefs,
        targetDate,
        strictMinCount: DEFAULT_STRICT_MIN_COUNT,
      });

      logger.debug('no_repeat_rules_applied', {
        user_id: userId,
        metadata: {
          candidates_count: candidateOutfits.length,
          strict_count: rulesResult.strictFiltered.length,
          fallback_candidates_count: rulesResult.fallbackCandidates.length,
          no_repeat_mode: noRepeatMode,
          target_date: targetDate,
        },
      });
    } else {
      // No filtering - all candidates pass strict, no fallbacks needed
      rulesResult = {
        strictFiltered: [...candidateOutfits],
        fallbackCandidates: [],
      };

      logger.debug('no_repeat_rules_skipped', {
        user_id: userId,
        metadata: {
          reason: noRepeatDays === 0 ? 'feature_disabled' : 'degraded_mode',
          candidates_count: candidateOutfits.length,
        },
      });
    }

    // Apply final selection with fallback logic
    // Include per-outfit metadata only when filtering was actually applied
    const selectionResult = applyFinalSelection(
      candidateOutfits,
      rulesResult,
      shouldApplyFiltering
    );

    // Calculate no-repeat filtering duration (includes rules + selection)
    const noRepeatFilterDurationMs = Date.now() - noRepeatFilterStartTime;

    // Log no-repeat filtering performance for p95 monitoring
    // This dedicated timing log enables tracking filter latency separate from total request
    logger.info('no_repeat_filter_completed', {
      user_id: userId,
      duration_ms: noRepeatFilterDurationMs,
      metadata: {
        filtering_applied: shouldApplyFiltering,
        total_candidates: candidateOutfits.length,
        strict_kept_count: rulesResult.strictFiltered.length,
        fallback_count: selectionResult.fallbackCount,
        wear_history_count: wearHistory.length,
        no_repeat_mode: noRepeatMode,
        no_repeat_days_bucket: bucketNoRepeatDays(noRepeatDays),
      },
    });

    // Emit analytics event: recommendations_filtered_by_no_repeat
    // This event is emitted on EVERY call when filtering is enabled (per spec)
    if (shouldApplyFiltering) {
      logger.info('recommendations_filtered_by_no_repeat', {
        user_id: userId,
        metadata: {
          total_candidates: candidateOutfits.length,
          strict_kept_count: rulesResult.strictFiltered.length,
          fallback_used: selectionResult.fallbackCount > 0,
          no_repeat_days: noRepeatDays,
          no_repeat_mode: noRepeatMode,
        },
      });
    }

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
          outcome: 'success' as string,
          outfit_count: 0,
          config_error: true,
          // Context parameter observability (Story #365)
          context_provided: effectiveContext.wasProvided,
          effective_occasion: effectiveContext.occasion as string,
          effective_temperature_band: effectiveContext.temperatureBand as string,
          // No-repeat observability fields (privacy-safe, bucketed)
          no_repeat_days_bucket: bucketNoRepeatDays(noRepeatDays),
          no_repeat_mode: noRepeatMode,
          static_pool_size: candidateOutfits.length,
          strict_filtered_size: rulesResult.strictFiltered.length,
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

    // Emit analytics event: no_repeat_fallback_triggered (when fallbacks used)
    if (selectionResult.fallbackCount > 0) {
      logger.info('no_repeat_fallback_triggered', {
        user_id: userId,
        metadata: {
          total_candidates: candidateOutfits.length,
          strict_kept_count: rulesResult.strictFiltered.length,
          fallback_count: selectionResult.fallbackCount,
          // Additional context for debugging
          repeated_item_count: selectionResult.repeatedItemIds.length,
          no_repeat_mode: noRepeatMode,
        },
      });
    }

    const outfits = selectionResult.outfits;

    // ========================================================================
    // Step 7: Construct and Validate Response
    // ========================================================================

    // Build the response with optional no-repeat filtering metadata
    // The metadata is only included when filtering was actually applied,
    // enabling client-side analytics for story #448 observability
    const response: OutfitRecommendationsResponse = { outfits };

    if (shouldApplyFiltering) {
      const noRepeatFilteringMeta: NoRepeatFilteringMeta = {
        totalCandidates: candidateOutfits.length,
        strictKeptCount: rulesResult.strictFiltered.length,
        fallbackUsed: selectionResult.fallbackCount > 0,
        fallbackCount: selectionResult.fallbackCount,
        noRepeatDays,
        noRepeatMode,
      };
      response.noRepeatFilteringMeta = noRepeatFilteringMeta;
    }

    // Include degradedMode flag when wear history lookup failed
    // This allows the client to optionally surface a UX indicator that
    // no-repeat filtering is temporarily unavailable
    if (historyLookupFailed && noRepeatDays > 0) {
      response.degradedMode = true;
    }

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
        outcome: 'success' as string,
        outfit_count: outfits.length,
        // Context parameter observability (Story #365)
        context_provided: effectiveContext.wasProvided,
        effective_occasion: effectiveContext.occasion as string,
        effective_temperature_band: effectiveContext.temperatureBand as string,
        // No-repeat observability fields (privacy-safe, bucketed)
        no_repeat_days_bucket: bucketNoRepeatDays(noRepeatDays),
        no_repeat_mode: noRepeatMode,
        static_pool_size: candidateOutfits.length,
        strict_filtered_size: rulesResult.strictFiltered.length,
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
