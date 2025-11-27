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
 * REQUEST:
 * POST /delete-wardrobe-item
 * Authorization: Bearer <user-jwt>
 * Body: { itemId: string }
 *
 * RESPONSE:
 * Success: { success: true }
 * Error: { success: false, error: string, code: string }
 *
 * ERROR CODES:
 * - 'auth': Not authenticated or unauthorized
 * - 'validation': Invalid request body
 * - 'notFound': Item doesn't exist (treated as success for idempotency)
 * - 'server': Database or storage error
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Storage bucket name for wardrobe items
 */
const STORAGE_BUCKET = 'wardrobe-items';

/**
 * Creates a JSON response with CORS headers
 */
function jsonResponse(
  body: DeleteWardrobeItemResponse,
  status: number
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

  try {
    // Extract authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[DeleteItem] Missing or invalid Authorization header');
      return jsonResponse(
        { success: false, error: 'Not authenticated', code: 'auth' },
        401
      );
    }

    const userJwt = authHeader.replace('Bearer ', '');

    // Parse request body
    let requestBody: DeleteWardrobeItemRequest;
    try {
      requestBody = await req.json();
    } catch {
      return jsonResponse(
        { success: false, error: 'Invalid request body', code: 'validation' },
        400
      );
    }

    const { itemId } = requestBody;

    // Validate itemId
    if (!itemId || typeof itemId !== 'string') {
      return jsonResponse(
        { success: false, error: 'Invalid itemId', code: 'validation' },
        400
      );
    }

    // Validate UUID format (basic check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(itemId)) {
      return jsonResponse(
        { success: false, error: 'Invalid itemId format', code: 'validation' },
        400
      );
    }

    // Initialize Supabase client with user's JWT
    // This ensures RLS policies are enforced for the authenticated user
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[DeleteItem] Missing Supabase configuration');
      return jsonResponse(
        { success: false, error: 'Service configuration error', code: 'server' },
        500
      );
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
      console.error('[DeleteItem] Failed to get user:', userError);
      return jsonResponse(
        { success: false, error: 'Authentication failed', code: 'auth' },
        401
      );
    }

    const userId = userData.user.id;

    // Fetch the item to get storage keys and verify ownership
    // RLS will only return the item if user owns it
    const { data: item, error: fetchError } = await supabase
      .from('items')
      .select('id, user_id, original_key, clean_key, thumb_key')
      .eq('id', itemId)
      .maybeSingle();

    if (fetchError) {
      console.error('[DeleteItem] Failed to fetch item:', fetchError);
      return jsonResponse(
        { success: false, error: 'Failed to fetch item', code: 'server' },
        500
      );
    }

    // If item not found (or RLS filtered it out), treat as success for idempotency
    // This handles both:
    // 1. Item was already deleted (retry scenario)
    // 2. Item doesn't belong to user (RLS filtered it)
    if (!item) {
      console.log('[DeleteItem] Item not found or not owned, treating as success:', itemId);
      return jsonResponse({ success: true }, 200);
    }

    const typedItem = item as ItemRecord;

    // Defense in depth: explicit ownership check
    // (Should always pass if RLS is working, but adds safety)
    if (typedItem.user_id !== userId) {
      console.error('[DeleteItem] Ownership mismatch:', {
        itemUserId: typedItem.user_id,
        requestUserId: userId,
      });
      return jsonResponse(
        { success: false, error: 'Not authorized to delete this item', code: 'auth' },
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
      console.log('[DeleteItem] Deleting storage objects:', storageKeys);

      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(storageKeys);

      if (storageError) {
        // Log but don't fail - storage cleanup can be handled by background job
        // if needed. The important thing is to delete the database row.
        console.warn('[DeleteItem] Storage deletion warning:', storageError);
        // Continue with database deletion even if storage fails
      }
    }

    // Delete the database row (hard delete)
    const { error: deleteError } = await supabase
      .from('items')
      .delete()
      .eq('id', itemId);

    if (deleteError) {
      // Check if it's a not-found error (item deleted between fetch and delete)
      if (deleteError.code === 'PGRST116' || deleteError.message?.includes('not found')) {
        console.log('[DeleteItem] Item already deleted, treating as success:', itemId);
        return jsonResponse({ success: true }, 200);
      }

      console.error('[DeleteItem] Failed to delete item:', deleteError);
      return jsonResponse(
        { success: false, error: 'Failed to delete item', code: 'server' },
        500
      );
    }

    console.log('[DeleteItem] Successfully deleted item:', itemId);
    return jsonResponse({ success: true }, 200);
  } catch (error) {
    console.error('[DeleteItem] Unexpected error:', error);
    return jsonResponse(
      { success: false, error: 'Unexpected error', code: 'server' },
      500
    );
  }
}

// Wire the handler to Deno's HTTP server
serve(handler);
