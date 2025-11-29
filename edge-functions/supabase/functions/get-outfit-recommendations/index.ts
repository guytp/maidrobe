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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  createLogger,
  getOrGenerateCorrelationId,
  type StructuredLogger,
} from '../_shared/structuredLogger.ts';
import {
  type Outfit,
  type OutfitRecommendationsResponse,
  type RequestOutcome,
  createOutfit,
  validateOutfitRecommendationsResponse,
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

// ============================================================================
// Types
// ============================================================================

/**
 * Supabase client type for dependency injection.
 * Using a minimal interface to avoid importing the full Supabase types.
 */
interface SupabaseClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): {
        maybeSingle(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
  };
}

/**
 * Result of fetching user's no-repeat preferences.
 */
interface NoRepeatPrefsResult {
  /** The clamped noRepeatDays value (0-90). */
  noRepeatDays: number;
  /** Whether the prefs lookup failed or was missing. */
  prefsLookupFailed: boolean;
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
        prefsLookupFailed: true,
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
        prefsLookupFailed: true,
      };
    }

    // Successfully retrieved prefs - clamp the value
    const rawValue = data.no_repeat_days;
    const clampedValue = clampNoRepeatDays(rawValue);

    logger.debug('prefs_loaded', {
      user_id: userId,
      metadata: {
        no_repeat_days_clamped: clampedValue,
        // Log whether clamping was applied (without exposing raw value)
        was_clamped: rawValue !== clampedValue,
      },
    });

    return {
      noRepeatDays: clampedValue,
      prefsLookupFailed: false,
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
      prefsLookupFailed: true,
    };
  }
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
 * - Rating as null (placeholder for future use)
 *
 * @param userId - Authenticated user's ID from JWT
 * @returns Array of validated Outfit objects
 */
function generateStubbedOutfits(userId: string): Outfit[] {
  const createdAt = new Date().toISOString();

  return OUTFIT_TEMPLATES.map((template) =>
    createOutfit({
      id: crypto.randomUUID(),
      userId,
      itemIds: template.itemIds,
      reason: template.reason,
      context: template.context,
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
 * 4. Outfit generation
 * 5. Response construction with logging
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
    // Step 3: Fetch User Preferences (No-Repeat Window)
    // ========================================================================

    // Fetch the user's noRepeatDays preference for filtering.
    // This call implements degraded-mode behaviour: if prefs cannot be
    // retrieved, it returns noRepeatDays = 0 (no-repeat filtering disabled)
    // and logs a warning. The request continues without failing.
    const { noRepeatDays, prefsLookupFailed } = await fetchUserNoRepeatDays(
      supabase as unknown as SupabaseClient,
      userId,
      logger
    );

    // Log the preference state for observability
    // Note: The actual noRepeatDays value will be logged in bucketed form
    // in the final observability step (Step 5 of the user story)
    if (prefsLookupFailed) {
      logger.info('using_default_prefs', {
        user_id: userId,
        metadata: {
          no_repeat_days: noRepeatDays,
          reason: 'prefs_unavailable',
        },
      });
    }

    // ========================================================================
    // Step 4: Generate Stubbed Outfit Recommendations
    // ========================================================================

    // Note: We intentionally ignore any request body or query parameters.
    // The userId comes exclusively from the JWT, preventing any client override.
    // Future stories (#365) may add context parameters, but for the stub,
    // we return the same static outfits for all requests.
    //
    // TODO (Story #364): Apply no-repeat filtering using noRepeatDays value.
    // For now, noRepeatDays is fetched but not yet used for filtering.
    // The filtering logic will be added in subsequent steps.

    const outfits = generateStubbedOutfits(userId);

    // ========================================================================
    // Step 5: Construct and Validate Response
    // ========================================================================

    const response: OutfitRecommendationsResponse = { outfits };

    // Validate response against contract (catches programming errors)
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

    // ========================================================================
    // Step 6: Return Success Response with Logging
    // ========================================================================

    const durationMs = Date.now() - startTime;

    // Log successful completion with all required observability fields
    logger.info('request_completed', {
      user_id: userId,
      duration_ms: durationMs,
      status_code: 200,
      metadata: {
        outcome: 'success' as RequestOutcome,
        outfit_count: outfits.length,
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
