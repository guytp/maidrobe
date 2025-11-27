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

import { getWardrobeFeatureFlags, type WardrobeFeatureFlags } from '../_shared/featureFlags.ts';

// ============================================================================
// Types
// ============================================================================

/**
 * Success response body
 */
interface GetFeatureFlagsResponse {
  success: true;
  flags: WardrobeFeatureFlags;
  timestamp: string;
}

/**
 * Error response body
 */
interface ErrorResponse {
  success: false;
  error: string;
  code: string;
}

/**
 * Structured log entry
 */
interface LogEntry {
  timestamp: string;
  level: 'info' | 'error';
  event: string;
  [key: string]: unknown;
}

// ============================================================================
// Logging
// ============================================================================

/**
 * Emits a structured log entry as JSON.
 */
function structuredLog(
  level: 'info' | 'error',
  event: string,
  data: Record<string, unknown> = {}
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  };

  const message = JSON.stringify(entry);

  // Console logging is intentional for Edge Function observability
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error('[GetFeatureFlags]', message);
  } else {
    // eslint-disable-next-line no-console
    console.log('[GetFeatureFlags]', message);
  }
}

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Creates a JSON response with appropriate headers.
 *
 * Includes CORS headers to allow cross-origin requests from mobile clients.
 */
function jsonResponse(
  body: GetFeatureFlagsResponse | ErrorResponse,
  status: number
): Response {
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
 * Main handler for feature flag requests.
 *
 * Supports GET requests only. Returns the current state of all wardrobe
 * feature flags for client-side UI adjustments.
 */
export async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return jsonResponse(
      { success: false, error: 'Method not allowed', code: 'method_not_allowed' },
      405
    );
  }

  try {
    // Evaluate all wardrobe feature flags
    const flags = getWardrobeFeatureFlags();
    const timestamp = new Date().toISOString();

    structuredLog('info', 'flags_retrieved', {
      wardrobe_image_cleanup_enabled: flags.wardrobe_image_cleanup_enabled,
      wardrobe_ai_attributes_enabled: flags.wardrobe_ai_attributes_enabled,
    });

    const response: GetFeatureFlagsResponse = {
      success: true,
      flags,
      timestamp,
    };

    return jsonResponse(response, 200);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    structuredLog('error', 'flags_retrieval_failed', {
      error_message: errorMessage,
    });

    // On error, return safe defaults (both flags false)
    // This ensures the client doesn't try to use features that may not be available
    return jsonResponse(
      {
        success: true,
        flags: {
          wardrobe_image_cleanup_enabled: false,
          wardrobe_ai_attributes_enabled: false,
        },
        timestamp: new Date().toISOString(),
      },
      200
    );
  }
}

// Wire the handler to Deno's HTTP server
serve(handler);
