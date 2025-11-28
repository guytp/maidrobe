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
 * 3. Outfit generation
 * 4. Response construction with logging
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
    // Step 3: Generate Stubbed Outfit Recommendations
    // ========================================================================

    // Note: We intentionally ignore any request body or query parameters.
    // The userId comes exclusively from the JWT, preventing any client override.
    // Future stories (#365) may add context parameters, but for the stub,
    // we return the same static outfits for all requests.

    const outfits = generateStubbedOutfits(userId);

    // ========================================================================
    // Step 4: Construct and Validate Response
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
    // Step 5: Return Success Response with Logging
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
