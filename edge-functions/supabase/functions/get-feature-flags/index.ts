/**
 * Get Feature Flags Edge Function
 *
 * Provides a read-only endpoint for clients to fetch the current state of
 * wardrobe feature flags. This enables the mobile client to adjust its UI
 * based on server-side flag configuration.
 *
 * IMPORTANT SECURITY NOTE:
 * This endpoint is READ-ONLY. The client CANNOT override backend behaviour
 * by manipulating these values. The backend Edge Functions (process-item-image,
 * detect-item-attributes) evaluate flags independently on every request.
 *
 * Client usage of these flags should be limited to:
 * - Hiding/disabling UI elements for disabled features
 * - Showing appropriate messaging when features are unavailable
 * - Preventing unnecessary API calls when features are known to be disabled
 *
 * CACHING:
 * Clients should cache the response with a reasonable TTL (e.g., 5 minutes)
 * to avoid excessive requests while still getting reasonably fresh data.
 *
 * REQUEST:
 * GET /get-feature-flags
 * No authentication required (flags are not user-specific)
 *
 * RESPONSE:
 * {
 *   "success": true,
 *   "flags": {
 *     "wardrobe_image_cleanup_enabled": boolean,
 *     "wardrobe_ai_attributes_enabled": boolean
 *   },
 *   "timestamp": string (ISO 8601)
 * }
 *
 * ERROR RESPONSE:
 * {
 *   "success": false,
 *   "error": string,
 *   "code": string
 * }
 *
 * @module get-feature-flags
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

import {
  getWardrobeFeatureFlags,
  type WardrobeFeatureFlags,
  type UserFlagContext,
  type UserRole,
} from '../_shared/featureFlags.ts';
import {
  createLogger,
  getOrGenerateCorrelationId,
  getEnvironment,
} from '../_shared/structuredLogger.ts';

// ============================================================================
// Types
// ============================================================================

/**
 * Success response body.
 *
 * When `defaults_used` is true, the flags are safe fallback defaults
 * rather than the actual configured values. This occurs when flag
 * retrieval fails but the endpoint still returns a 2xx response.
 */
interface GetFeatureFlagsResponse {
  success: true;
  flags: WardrobeFeatureFlags;
  timestamp: string;
  /** True when fallback defaults are returned due to retrieval failure */
  defaults_used?: boolean;
}

/**
 * Error response body
 */
interface ErrorResponse {
  success: false;
  error: string;
  code: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Function name for logging attribution */
const FUNCTION_NAME = 'get-feature-flags';

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Creates a JSON response with appropriate headers.
 *
 * Includes CORS headers to allow cross-origin requests from mobile clients.
 */
function jsonResponse(body: GetFeatureFlagsResponse | ErrorResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // CORS headers for mobile client access
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      // Cache control: clients should cache for 5 minutes
      'Cache-Control': 'public, max-age=300',
    },
  });
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Classifies an error into a category for monitoring and debugging.
 *
 * @param error - The error to classify
 * @returns Error category string
 */
function classifyError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'unknown';
  }

  const message = error.message.toLowerCase();

  // Configuration errors (missing env vars, invalid config)
  if (
    message.includes('env') ||
    message.includes('config') ||
    message.includes('undefined') ||
    message.includes('not defined')
  ) {
    return 'config_error';
  }

  // Type/parsing errors
  if (message.includes('type') || message.includes('parse') || message.includes('json')) {
    return 'parse_error';
  }

  return 'unknown';
}

/**
 * Extracts user context from request URL query parameters.
 *
 * Query parameters:
 * - role: User's role/cohort ('internal', 'beta', 'standard')
 * - user_id: User ID for logging (not used for targeting)
 *
 * @param req - The incoming HTTP request
 * @returns User context for flag evaluation
 */
function extractUserContext(req: Request): UserFlagContext {
  const url = new URL(req.url);
  const roleParam = url.searchParams.get('role');
  const userIdParam = url.searchParams.get('user_id');

  // Validate role parameter
  let role: UserRole = 'standard';
  if (roleParam === 'internal' || roleParam === 'beta' || roleParam === 'standard') {
    role = roleParam;
  }

  return {
    role,
    userId: userIdParam ?? undefined,
  };
}

/**
 * Main handler for feature flag requests.
 *
 * Supports GET requests only. Returns the current state of all wardrobe
 * feature flags for client-side UI adjustments.
 *
 * Query parameters (optional):
 * - role: User's role/cohort for cohort-based flag targeting
 * - user_id: User ID for logging purposes (not used for targeting)
 *
 * @example
 * GET /get-feature-flags
 * GET /get-feature-flags?role=internal
 * GET /get-feature-flags?role=beta&user_id=user-123
 */
export function handler(req: Request): Response {
  // Handle CORS preflight (no logging needed for preflight)
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Correlation-ID',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Extract or generate correlation ID for request tracing
  const correlationId = getOrGenerateCorrelationId(req);
  const environment = getEnvironment();
  const logger = createLogger(FUNCTION_NAME, correlationId, environment);

  // Extract user context from query parameters for cohort-based targeting
  const userContext = extractUserContext(req);

  // Log request received with environment context for observability filtering
  // User story #241: Environment tagging enables separation of feature flag
  // requests by environment (development/staging/production) in dashboards
  logger.info('request_received', {
    metadata: {
      environment,
      user_role: userContext.role,
      has_user_id: !!userContext.userId,
    },
  });

  // Only allow GET requests
  if (req.method !== 'GET') {
    logger.warn('method_not_allowed', { metadata: { method: req.method } });
    return jsonResponse(
      { success: false, error: 'Method not allowed', code: 'method_not_allowed' },
      405
    );
  }

  try {
    // Evaluate all wardrobe feature flags with user context
    const flags = getWardrobeFeatureFlags(userContext);
    const timestamp = new Date().toISOString();

    logger.info('flags_retrieved', {
      feature_flags: {
        wardrobe_image_cleanup_enabled: flags.wardrobe_image_cleanup_enabled,
        wardrobe_ai_attributes_enabled: flags.wardrobe_ai_attributes_enabled,
        outfit_recommendation_stub_enabled: flags.outfit_recommendation_stub_enabled,
      },
      metadata: {
        environment,
        user_role: userContext.role,
      },
    });

    const response: GetFeatureFlagsResponse = {
      success: true,
      flags,
      timestamp,
    };

    return jsonResponse(response, 200);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCategory = classifyError(error);

    // Log the failure at error level with full context for monitoring
    logger.error('flags_retrieval_failed', {
      error_code: 'FLAG_RETRIEVAL_ERROR',
      error_category: errorCategory,
      error_message: errorMessage,
      metadata: {
        environment,
        user_role: userContext.role,
        fallback_applied: true,
      },
    });

    // On error, return safe defaults (all flags false) with defaults_used marker
    // This ensures the client doesn't try to use features that may not be available
    // while allowing clients and monitoring to distinguish fallback from real values
    return jsonResponse(
      {
        success: true,
        flags: {
          wardrobe_image_cleanup_enabled: false,
          wardrobe_ai_attributes_enabled: false,
          outfit_recommendation_stub_enabled: false,
        },
        timestamp: new Date().toISOString(),
        defaults_used: true,
      },
      200
    );
  }
}

// Wire the handler to Deno's HTTP server
serve(handler);
