/**
 * Delete Wardrobe Item Edge Function
 *
 * Handles complete deletion of a wardrobe item including:
 * - Ownership verification (auth.uid() must match item's user_id)
 * - Storage object cleanup (original, clean, thumb images)
 * - Database row deletion (hard delete)
 *
 * SECURITY:
 * - Authenticates using user's JWT (not service role)
 * - RLS policies provide first line of defense
 * - Explicit ownership check provides defense in depth
 * - Storage deletion uses user-scoped RLS policies
 *
 * IDEMPOTENCY:
 * - If item is already deleted (not found), returns success
 * - Safe to retry failed requests
 * - Storage deletions are idempotent (404 ignored)
 *
 * OBSERVABILITY:
 * - Structured JSON logging with correlation IDs
 * - All logs include environment and function name
 * - Correlation ID propagated from client via X-Correlation-ID header
 *
 * REQUEST:
 * POST /delete-wardrobe-item
 * Authorization: Bearer <user-jwt>
 * X-Correlation-ID: <uuid> (optional, generated if not provided)
 * Body: { itemId: string }
 *
 * RESPONSE:
 * Success: { success: true, correlationId: string }
 * Error: { success: false, error: string, code: string, correlationId: string }
 *
 * ERROR CODES:
 * - 'auth': Not authenticated or unauthorized
 * - 'validation': Invalid request body
 * - 'notFound': Item doesn't exist (treated as success for idempotency)
 * - 'server': Database or storage error
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
 * Request body schema
 */
interface DeleteWardrobeItemRequest {
  itemId: string;
}

/**
 * Response body schema
 */
interface DeleteWardrobeItemResponse {
  success: boolean;
  error?: string;
  code?: string;
  correlationId?: string;
}

/**
 * Item record from database (minimal fields needed for deletion)
 */
interface ItemRecord {
  id: string;
  user_id: string;
  original_key: string | null;
  clean_key: string | null;
  thumb_key: string | null;
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
const FUNCTION_NAME = 'delete-wardrobe-item';

/**
 * Storage bucket name for wardrobe items
 */
const STORAGE_BUCKET = 'wardrobe-items';

/**
 * Creates a JSON response with CORS headers
 */
function jsonResponse(body: DeleteWardrobeItemResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    { success: false, error: message, code, correlationId: logger.correlationId },
    status
  );
}

/**
 * Main handler for wardrobe item deletion.
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

  // Initialize logger with correlation ID from request or generate new one
  const correlationId = getOrGenerateCorrelationId(req);
  const logger = createLogger(FUNCTION_NAME, correlationId);
  const startTime = Date.now();

  logger.info('request_received');

  try {
    // Extract authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(logger, 'auth_header_missing', 'Not authenticated', 'auth', 401);
    }

    const userJwt = authHeader.replace('Bearer ', '');

    // Parse request body
    let requestBody: DeleteWardrobeItemRequest;
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

    const { itemId } = requestBody;

    // Validate itemId
    if (!itemId || typeof itemId !== 'string') {
      return errorResponse(logger, 'invalid_item_id', 'Invalid itemId', 'validation', 400);
    }

    // Validate UUID format (basic check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(itemId)) {
      return errorResponse(
        logger,
        'invalid_item_id_format',
        'Invalid itemId format',
        'validation',
        400,
        { item_id: itemId }
      );
    }

    // Initialize Supabase client with user's JWT
    // This ensures RLS policies are enforced for the authenticated user
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      return errorResponse(logger, 'config_missing', 'Service configuration error', 'server', 500);
    }

    // Create client authenticated as the user
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

    // Create user-scoped logger
    const userLogger = withContext(logger, { item_id: itemId, user_id: userId });

    userLogger.info('deletion_started');

    // Fetch the item to get storage keys and verify ownership
    // RLS will only return the item if user owns it
    const { data: item, error: fetchError } = await supabase
      .from('items')
      .select('id, user_id, original_key, clean_key, thumb_key')
      .eq('id', itemId)
      .maybeSingle();

    if (fetchError) {
      userLogger.error('fetch_failed', {
        error_message: fetchError.message,
        error_code: fetchError.code,
      });
      return jsonResponse(
        { success: false, error: 'Failed to fetch item', code: 'server', correlationId },
        500
      );
    }

    // If item not found (or RLS filtered it out), treat as success for idempotency
    // This handles both:
    // 1. Item was already deleted (retry scenario)
    // 2. Item doesn't belong to user (RLS filtered it)
    if (!item) {
      const durationMs = Date.now() - startTime;
      userLogger.info('item_not_found_success', {
        duration_ms: durationMs,
        metadata: { reason: 'idempotent_success' },
      });
      return jsonResponse({ success: true, correlationId }, 200);
    }

    const typedItem = item as ItemRecord;

    // Defense in depth: explicit ownership check
    // (Should always pass if RLS is working, but adds safety)
    if (typedItem.user_id !== userId) {
      userLogger.error('ownership_mismatch', {
        error_code: 'OWNERSHIP_MISMATCH',
        error_category: 'authorization',
      });
      return jsonResponse(
        {
          success: false,
          error: 'Not authorized to delete this item',
          code: 'auth',
          correlationId,
        },
        403
      );
    }

    // Collect storage keys to delete
    const storageKeys: string[] = [];
    if (typedItem.original_key) storageKeys.push(typedItem.original_key);
    if (typedItem.clean_key) storageKeys.push(typedItem.clean_key);
    if (typedItem.thumb_key) storageKeys.push(typedItem.thumb_key);

    // Delete storage objects (ignore not-found errors for idempotency)
    if (storageKeys.length > 0) {
      userLogger.info('storage_deletion_started', {
        metadata: { object_count: storageKeys.length },
      });

      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(storageKeys);

      if (storageError) {
        // Log but don't fail - storage cleanup can be handled by background job
        // if needed. The important thing is to delete the database row.
        userLogger.warn('storage_deletion_warning', {
          error_message: storageError.message,
        });
        // Continue with database deletion even if storage fails
      } else {
        userLogger.info('storage_deletion_completed');
      }
    }

    // Delete the database row (hard delete)
    const { error: deleteError } = await supabase.from('items').delete().eq('id', itemId);

    if (deleteError) {
      // Check if it's a not-found error (item deleted between fetch and delete)
      if (deleteError.code === 'PGRST116' || deleteError.message?.includes('not found')) {
        const durationMs = Date.now() - startTime;
        userLogger.info('item_already_deleted_success', {
          duration_ms: durationMs,
          metadata: { reason: 'idempotent_success' },
        });
        return jsonResponse({ success: true, correlationId }, 200);
      }

      userLogger.error('database_deletion_failed', {
        error_message: deleteError.message,
        error_code: deleteError.code,
      });
      return jsonResponse(
        { success: false, error: 'Failed to delete item', code: 'server', correlationId },
        500
      );
    }

    const durationMs = Date.now() - startTime;
    userLogger.info('deletion_completed', {
      duration_ms: durationMs,
      status_code: 200,
    });
    return jsonResponse({ success: true, correlationId }, 200);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('unexpected_error', {
      error_message: error instanceof Error ? error.message : 'Unknown error',
      error_code: 'UNEXPECTED_ERROR',
      duration_ms: durationMs,
    });
    return jsonResponse(
      { success: false, error: 'Unexpected error', code: 'server', correlationId },
      500
    );
  }
}

// Wire the handler to Deno's HTTP server
serve(handler);
