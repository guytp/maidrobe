/**
 * Connect Google Calendar Edge Function
 *
 * Handles OAuth token exchange for connecting a user's Google Calendar.
 * This function:
 * 1. Validates user authentication (user JWT required)
 * 2. Accepts OAuth authorization code from Google
 * 3. Exchanges code for access/refresh tokens with Google OAuth API
 * 4. Encrypts tokens using AES-256-GCM
 * 5. Stores encrypted tokens in database
 * 6. Marks integration as connected
 *
 * SECURITY:
 * - Authenticates using user's JWT (not service role)
 * - RLS policies provide first line of defense
 * - Tokens encrypted at rest using CALENDAR_ENCRYPTION_KEY
 * - Encryption happens in-memory only
 * - Never log token values (only metadata)
 * - Validates token response from Google
 *
 * IDEMPOTENCY:
 * - Safe to call multiple times (upsert pattern)
 * - Each call updates tokens (useful for token refresh scenarios)
 * - User_id + provider form unique constraint
 *
 * OBSERVABILITY:
 * - Structured JSON logging with correlation IDs
 * - All logs include environment and function name
 * - Correlation ID propagated from client via X-Correlation-ID header
 * - Token operations logged without exposing actual values
 *
 * OAUTH FLOW:
 * 1. Mobile app initiates OAuth flow using expo-auth-session
 * 2. Google returns authorization code to app
 * 3. App calls this Edge Function with the code
 * 4. Function exchanges code for tokens at Google OAuth API
 * 5. Function encrypts tokens using AES-256-GCM
 * 6. Function upserts encrypted tokens to database
 * 7. Function returns integration data to app
 * 8. App updates UI to show connected status
 *
 * REQUEST:
 * POST /connect-google-calendar
 * Authorization: Bearer <user-jwt>
 * X-Correlation-ID: <uuid> (optional, generated if not provided)
 * Content-Type: application/json
 * Body: { code: string, redirectUri: string }
 *
 * RESPONSE:
 * Success (200): { success: true, integration: IntegrationData }
 * Error (4xx/5xx): { success: false, error: string, code: string, correlationId: string }
 *
 * ERROR CODES:
 * - 'auth': Not authenticated or unauthorized
 * - 'validation': Invalid request body (missing code or redirectUri)
 * - 'oauth': Google OAuth token exchange failed
 * - 'server': Database error or unexpected error
 * - 'encryption': Token encryption failed
 *
 * @module functions/connect-google-calendar
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  createLogger,
  getOrGenerateCorrelationId,
  withContext,
  type StructuredLogger,
} from '../_shared/structuredLogger.ts';
import { encryptToken } from '../_shared/crypt.ts';

/**
 * Configuration loaded from environment variables
 */
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const CALENDAR_ENCRYPTION_KEY = Deno.env.get('CALENDAR_ENCRYPTION_KEY');

/**
 * Google OAuth token endpoint
 */
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/**
 * Request body schema for connect operation
 */
interface ConnectCalendarRequest {
  /** OAuth authorization code from Google */
  code: string;

  /** Redirect URI (must match Google Cloud Console configuration) */
  redirectUri: string;
}

/**
 * Response body schema
 */
interface ConnectCalendarResponse {
  success: boolean;
  error?: string;
  code?: string;
  correlationId?: string;
  integration?: CalendarIntegrationData;
}

/**
 * Google OAuth token response
 */
interface GoogleTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
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
  access_token: string | null;
  refresh_token: string | null;
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
const FUNCTION_NAME = 'connect-google-calendar';

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
function jsonResponse<T extends ConnectCalendarResponse>(body: T, status: number): Response {
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
 * Exchanges authorization code for tokens with Google OAuth API
 *
 * @param code - Authorization code from Google
 * @param redirectUri - Must match the URI in Google Cloud Console
 * @returns Promise resolving to token response from Google
 * @throws Error if token exchange fails
 */
async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<GoogleTokenResponse> {
  const params = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID || '',
    client_secret: GOOGLE_CLIENT_SECRET || '',
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google OAuth token exchange failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json();
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
 * Main handler for Google Calendar connection.
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

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return errorResponse(
        logger,
        'config_error',
        'Server configuration error: Google OAuth credentials not set',
        'server',
        500,
        { missing_config: 'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET' }
      );
    }

    // Extract authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(logger, 'auth_header_missing', 'Not authenticated', 'auth', 401);
    }

    const userJwt = authHeader.replace('Bearer ', '');

    // Parse request body
    let requestBody: ConnectCalendarRequest;
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

    const { code, redirectUri } = requestBody;

    // Validate request parameters
    if (!code || typeof code !== 'string') {
      return errorResponse(
        logger,
        'invalid_code',
        'Authorization code is required and must be a string',
        'validation',
        400
      );
    }

    if (!redirectUri || typeof redirectUri !== 'string') {
      return errorResponse(
        logger,
        'invalid_redirect_uri',
        'Redirect URI is required and must be a string',
        'validation',
        400
      );
    }

    // Validate code format (basic check - Google uses specific format)
    if (code.length < 10 || code.length > 500) {
      return errorResponse(
        logger,
        'invalid_code_format',
        'Invalid authorization code format',
        'validation',
        400
      );
    }

    // Initialize Supabase client with user's JWT
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

    logger.info('connection_start', { user_id: userId });

    // Exchange authorization code for tokens
    logger.info('exchanging_code_for_tokens');
    let tokenResponse: GoogleTokenResponse;
    try {
      tokenResponse = await exchangeCodeForTokens(code, redirectUri);
    } catch (error) {
      logger.error('token_exchange_failed', {
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });

      return errorResponse(
        logger,
        'oauth_error',
        'Failed to exchange authorization code with Google',
        'oauth',
        400
      );
    }

    logger.info('tokens_received', {
      token_type: tokenResponse.token_type,
      expires_in: tokenResponse.expires_in,
      scope: tokenResponse.scope,
    });

    // Validate token response
    if (!tokenResponse.access_token || !tokenResponse.refresh_token) {
      logger.error('invalid_token_response', {
        missing_access: !tokenResponse.access_token,
        missing_refresh: !tokenResponse.refresh_token,
      });

      return errorResponse(
        logger,
        'invalid_token_response',
        'Invalid token response from Google',
        'oauth',
        500
      );
    }

    // Encrypt tokens before storage
    logger.info('encrypting_tokens');
    let encryptedAccessToken: string;
    let encryptedRefreshToken: string;

    try {
      encryptedAccessToken = encryptToken(tokenResponse.access_token, CALENDAR_ENCRYPTION_KEY);
      encryptedRefreshToken = encryptToken(tokenResponse.refresh_token, CALENDAR_ENCRYPTION_KEY);
    } catch (error) {
      logger.error('encryption_failed', {
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });

      return errorResponse(logger, 'encryption_error', 'Failed to encrypt tokens', 'server', 500);
    }

    logger.info('tokens_encrypted');

    // Calculate token expiration
    const tokenExpiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString();

    // Fetch user's email from profile (or use token info)
    // For now, we'll extract from the ID token or use a placeholder
    // In production, you might want to fetch from Google UserInfo endpoint
    const connectedEmail = userData.user.email || null;

    // Upsert integration to database
    logger.info('storing_integration');
    const { data: upsertedIntegration, error: upsertError } = await supabase
      .from('calendar_integrations')
      .upsert(
        {
          user_id: userId,
          provider: 'google',
          is_connected: true,
          connected_email: connectedEmail,
          access_token: encryptedAccessToken,
          refresh_token: encryptedRefreshToken,
          token_expires_at: tokenExpiresAt,
          scope: tokenResponse.scope,
          connected_at: new Date().toISOString(),
          disconnected_at: null,
          last_error: null,
          error_count: 0,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,provider',
        }
      )
      .select('*')
      .single();

    if (upsertError) {
      logger.error('database_upsert_failed', {
        error_message: upsertError.message,
        error_code: upsertError.code,
        user_id: userId,
      });

      return errorResponse(
        logger,
        'database_error',
        'Failed to store calendar integration',
        'server',
        500
      );
    }

    const durationMs = Date.now() - startTime;
    logger.info('connection_completed', {
      duration_ms: durationMs,
      user_id: userId,
      integration_id: upsertedIntegration?.id,
    });

    // Return success with integration data
    return jsonResponse(
      {
        success: true,
        correlationId,
        integration: upsertedIntegration
          ? toIntegrationData(upsertedIntegration as CalendarIntegrationRow)
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
