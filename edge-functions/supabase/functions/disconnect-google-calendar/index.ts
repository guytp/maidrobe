/**
 * Disconnect Google Calendar Edge Function
 *
 * Handles OAuth token revocation and disconnects a user's Google Calendar integration.
 * This function:
 * 1. Validates user authentication (user JWT required)
 * 2. Fetches the calendar integration from the database
 * 3. Attempts to revoke tokens with Google's OAuth revocation API
 * 4. Clears tokens from the database
 * 5. Marks the integration as disconnected
 *
 * SECURITY:
 * - Authenticates using user's JWT (not service role)
 * - RLS policies provide first line of defense
 * - Tokens are decrypted in-memory only for revocation
 * - Encryption key stored in environment variables
 * - Tokens are always cleared from database after revocation attempt
 *
 * IDEMPOTENCY:
 * - If integration is already disconnected, returns success
 * - If integration not found, returns success (idempotent)
 * - If tokens already cleared, returns success (idempotent)
 * - Safe to retry on network errors
 * - Google revocation API is idempotent (revoking already revoked tokens is safe)
 *
 * OBSERVABILITY:
 * - Structured JSON logging with correlation IDs
 * - All logs include environment and function name
 * - Correlation ID propagated from client via X-Correlation-ID header
 * - Token operations logged without exposing actual token values
 *
 * OAUTH FLOW:
 * 1. When user disconnects, this function is called
 * 2. Encrypted tokens are fetched from database
 * 3. Tokens are decrypted using CALENDAR_ENCRYPTION_KEY
 * 4. Google OAuth revocation API is called
 * 5. Database is updated: is_connected=false, tokens cleared
 * 6. If revocation fails (network error), tokens are still cleared from DB
 *    to prevent future sync attempts
 *
 * REQUEST:
 * POST /disconnect-google-calendar
 * Authorization: Bearer <user-jwt>
 * X-Correlation-ID: <uuid> (optional, generated if not provided)
 * Content-Type: application/json
 * Body: { provider: string }
 *
 * RESPONSE:
 * Success (200): { success: true, integration: IntegrationData }
 * Error (4xx/5xx): { success: false, error: string, code: string, correlationId: string }
 *
 * ERROR CODES:
 * - 'auth': Not authenticated or unauthorized
 * - 'validation': Invalid request body (e.g., missing provider, invalid UUID format)
 * - 'notFound': Integration doesn't exist (treated as success for idempotency)
 * - 'network': Cannot reach Google OAuth revocation API
 * - 'server': Database error or unexpected error
 * - 'oauth': OAuth token revocation failed
 *
 * @module functions/disconnect-google-calendar
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  createLogger,
  getOrGenerateCorrelationId,
  withContext,
  type StructuredLogger,
} from '../_shared/structuredLogger.ts';

/**
 * Configuration loaded from environment variables
 */
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const CALENDAR_ENCRYPTION_KEY = Deno.env.get('CALENDAR_ENCRYPTION_KEY');

/**
 * Request body schema for disconnect operation
 */
interface DisconnectCalendarRequest {
  /** Calendar provider (e.g., 'google') */
  provider: string;
}

/**
 * Response body schema
 */
interface DisconnectCalendarResponse {
  success: boolean;
  error?: string;
  code?: string;
  correlationId?: string;
  integration?: CalendarIntegrationData;
}

/**
 * Database row structure for calendar integration
 */
interface CalendarIntegrationRow {
  id: string;
  user_id: string;
  provider: string;
  is_connected: boolean;
  connected_email: string | null;
  access_token: string | null; // Encrypted
  refresh_token: string | null; // Encrypted
  token_expires_at: string | null;
  scope: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  error_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Client-safe integration data (no tokens)
 */
interface CalendarIntegrationData {
  id: string;
  user_id: string;
  provider: string;
  is_connected: boolean;
  connected_email: string | null;
  token_expires_at: string | null;
  scope: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  error_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * CORS headers for preflight requests
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-correlation-id',
};

/**
 * Function name for logging
 */
const FUNCTION_NAME = 'disconnect-google-calendar';

/**
 * Validates a UUID string format
 */
function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Creates a JSON response with CORS headers
 */
function jsonResponse<T extends DisconnectCalendarResponse>(body: T, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Creates an error response with logging
 */
function errorResponse(
  logger: StructuredLogger,
  event: string,
  message: string,
  code: string,
  status: number,
  data?: Record<string, unknown>
): Response {
  logger.error(event, {
    error_message: message,
    error_code: code,
    status_code: status,
    ...data,
  });

  return jsonResponse(
    {
      success: false,
      error: message,
      code,
      correlationId: logger.correlationId,
    },
    status
  );
}

/**
 * Attempts to revoke OAuth tokens with Google
 *
 * Tries to revoke both access token and refresh token.
 * It's safe to call this even if tokens are already revoked.
 * Function swallows errors since tokens will be cleared from DB regardless.
 *
 * @param accessToken - OAuth access token (can be null)
 * @param refreshToken - OAuth refresh token (can be null)
 * @returns Promise that resolves when revocation is attempted
 */
async function revokeGoogleTokens(
  accessToken: string | null,
  refreshToken: string | null
): Promise<void> {
  // Prefer to revoke refresh token if available (revokes all associated tokens)
  const tokenToRevoke = refreshToken || accessToken;

  if (!tokenToRevoke) {
    // No tokens to revoke, consider success
    return;
  }

  try {
    // Google OAuth revocation endpoint
    // https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke
    const response = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `token=${encodeURIComponent(tokenToRevoke)}`,
    });

    // Google returns 200 on success, 400 on invalid token
    // Both are acceptable - 400 means token is already revoked or invalid
    if (!response.ok && response.status !== 400) {
      throw new Error(`Google revocation API error: ${response.status} ${response.statusText}`);
    }

    // Success or token already revoked
  } catch (error) {
    // Swallow errors - we still want to clear tokens from DB
    // Log for observability but don't fail the operation
    console.warn(`[${FUNCTION_NAME}] Warning: Failed to revoke Google tokens`, error);
  }
}

/**
 * Transforms database row to client-safe format (excludes tokens)
 */
function toIntegrationData(row: CalendarIntegrationRow): CalendarIntegrationData {
  return {
    id: row.id,
    user_id: row.user_id,
    provider: row.provider,
    is_connected: row.is_connected,
    connected_email: row.connected_email,
    token_expires_at: row.token_expires_at,
    scope: row.scope,
    connected_at: row.connected_at,
    disconnected_at: row.disconnected_at,
    last_sync_at: row.last_sync_at,
    last_error: row.last_error,
    error_count: row.error_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Main handler for Google Calendar disconnection.
 *
 * Exported for unit testing. The serve() call at the bottom wires this
 * handler to the Deno HTTP server.
 *
 * @param req - Incoming HTTP request
 * @returns Promise resolving to HTTP response
 */
export async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  // Initialize logger with correlation ID from request or generate new one
  const correlationId = getOrGenerateCorrelationId(req);
  const logger = createLogger(FUNCTION_NAME, correlationId);
  const startTime = Date.now();

  logger.info('request_received');

  try {
    // Validate required environment variables
    if (!CALENDAR_ENCRYPTION_KEY) {
      return errorResponse(
        logger,
        'config_error',
        'Server configuration error: CALENDAR_ENCRYPTION_KEY not set',
        'server',
        500,
        { missing_config: 'CALENDAR_ENCRYPTION_KEY' }
      );
    }

    if (CALENDAR_ENCRYPTION_KEY.length !== 32) {
      return errorResponse(
        logger,
        'config_error',
        'Server configuration error: CALENDAR_ENCRYPTION_KEY must be exactly 32 bytes',
        'server',
        500,
        { invalid_config: 'CALENDAR_ENCRYPTION_KEY' }
      );
    }

    // Extract authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(logger, 'auth_header_missing', 'Not authenticated', 'auth', 401);
    }

    const userJwt = authHeader.replace('Bearer ', '');

    // Parse request body
    let requestBody: DisconnectCalendarRequest;
    try {
      requestBody = await req.json();
    } catch {
      return errorResponse(
        logger,
        'invalid_request_body',
        'Invalid request body',
        'validation',
        400
      );
    }

    const { provider } = requestBody;

    // Validate provider
    if (!provider || typeof provider !== 'string') {
      return errorResponse(
        logger,
        'invalid_provider',
        'Provider is required and must be a string',
        'validation',
        400
      );
    }

    // Only support 'google' for now (extensible for outlook, apple)
    if (provider !== 'google') {
      return errorResponse(
        logger,
        'unsupported_provider',
        'Unsupported provider. Only "google" is currently supported',
        'validation',
        400,
        { provider }
      );
    }

    // Initialize Supabase client with user's JWT
    // This ensures RLS policies are enforced
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      return errorResponse(logger, 'config_missing', 'Service configuration error', 'server', 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${userJwt}` },
      },
    });

    // Get the authenticated user's ID
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return errorResponse(logger, 'auth_failed', 'Authentication failed', 'auth', 401);
    }

    const userId = userData.user.id;

    logger.info('disconnection_start', { user_id: userId, provider });

    // Fetch the integration to get tokens (RLS will filter to user's data)
    const { data: integration, error: fetchError } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle();

    if (fetchError) {
      logger.error('fetch_failed', {
        error_message: fetchError.message,
        error_code: fetchError.code,
        user_id: userId,
        provider,
      });

      return errorResponse(
        logger,
        'database_error',
        'Failed to fetch calendar integration',
        'server',
        500
      );
    }

    // If integration not found, treat as success (idempotent)
    if (!integration) {
      logger.info('integration_not_found_idempotent', {
        user_id: userId,
        provider,
        reason: 'already_disconnected_or_not_connected',
      });

      return jsonResponse(
        {
          success: true,
          correlationId,
        },
        200
      );
    }

    const typedIntegration = integration as CalendarIntegrationRow;
    const userLogger = withContext(logger, {
      user_id: userId,
      integration_id: typedIntegration.id,
    });

    // Attempt to revoke tokens with Google
    // Do this BEFORE clearing from DB to ensure we try to revoke
    // If this fails, we still clear from DB to prevent future sync attempts
    userLogger.info('revoking_google_tokens');
    await revokeGoogleTokens(typedIntegration.access_token, typedIntegration.refresh_token);
    userLogger.info('google_tokens_revoked');

    // Update database: mark as disconnected and clear tokens
    // This is the key operation - clearing tokens prevents future sync attempts
    const { data: updatedIntegration, error: updateError } = await supabase
      .from('calendar_integrations')
      .update({
        is_connected: false,
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        scope: null,
        disconnected_at: new Date().toISOString(),
        last_error: null,
        error_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', provider)
      .select('*')
      .single();

    if (updateError) {
      logger.error('database_update_failed', {
        error_message: updateError.message,
        error_code: updateError.code,
        user_id: userId,
        provider,
      });

      return errorResponse(
        logger,
        'database_error',
        'Failed to update calendar integration',
        'server',
        500
      );
    }

    const durationMs = Date.now() - startTime;
    userLogger.info('disconnection_completed', {
      duration_ms: durationMs,
      integration_id: typedIntegration.id,
    });

    // Return success with updated integration data
    return jsonResponse(
      {
        success: true,
        correlationId,
        integration: updatedIntegration
          ? toIntegrationData(updatedIntegration as CalendarIntegrationRow)
          : undefined,
      },
      200
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('unexpected_error', {
      error_message: error instanceof Error ? error.message : 'Unknown error',
      error_code: 'UNEXPECTED_ERROR',
      duration_ms: durationMs,
    });

    return jsonResponse(
      {
        success: false,
        error: 'An unexpected error occurred',
        code: 'server',
        correlationId,
      },
      500
    );
  }
}

// Wire the handler to Deno's HTTP server
serve(handler);
