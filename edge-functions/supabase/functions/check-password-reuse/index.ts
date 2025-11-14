/**
 * Password Reuse Check Edge Function
 *
 * Validates that a new password has not been used in the user's recent password history.
 * This enforces the security requirement: "Disallow reuse of last three passwords"
 *
 * SECURITY:
 * - Receives new password over HTTPS (encrypted in transit)
 * - Hashes password server-side using bcrypt
 * - Compares against historical password hashes
 * - Returns only boolean result (never exposes hashes)
 * - Fail-open on errors to prevent DoS
 *
 * DATABASE REQUIREMENTS:
 * Expects a password_history table with schema:
 * ```sql
 * CREATE TABLE password_history (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
 *   password_hash TEXT NOT NULL,
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * CREATE INDEX idx_password_history_user_created
 *   ON password_history(user_id, created_at DESC);
 * ```
 *
 * The table should be populated via database trigger when passwords are changed.
 * If the table doesn't exist, this function fails open (returns not reused).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

/**
 * Number of previous passwords to check against.
 * Must match PASSWORD_HISTORY_LIMIT in client code.
 */
const PASSWORD_HISTORY_LIMIT = 3;

/**
 * Request body schema
 */
interface CheckPasswordReuseRequest {
  userId: string;
  newPassword: string;
}

/**
 * Response body schema
 */
interface CheckPasswordReuseResponse {
  isReused: boolean;
  error?: string;
}

/**
 * Password history record from database
 */
interface PasswordHistoryRecord {
  id: string;
  user_id: string;
  password_hash: string;
  created_at: string;
}

/**
 * CORS headers for preflight requests
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Main handler for password reuse checking
 */
serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const requestBody = await req.json();
    const { userId, newPassword } = requestBody as CheckPasswordReuseRequest;

    // Validate request
    if (!userId || typeof userId !== 'string') {
      return new Response(
        JSON.stringify({
          isReused: false,
          error: 'Invalid userId',
        } as CheckPasswordReuseResponse),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!newPassword || typeof newPassword !== 'string') {
      return new Response(
        JSON.stringify({
          isReused: false,
          error: 'Invalid newPassword',
        } as CheckPasswordReuseResponse),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client with service role key for database access
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[PasswordReuse] Missing Supabase configuration');
      // Fail open - allow password change if environment not configured
      return new Response(
        JSON.stringify({
          isReused: false,
          error: 'Service configuration error',
        } as CheckPasswordReuseResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Query password history for this user (last N passwords)
    const { data: historyRecords, error: queryError } = await supabase
      .from('password_history')
      .select('id, user_id, password_hash, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PASSWORD_HISTORY_LIMIT);

    if (queryError) {
      // Log error but fail open
      console.error('[PasswordReuse] Database query error:', queryError);

      // If table doesn't exist, fail open
      if (queryError.code === '42P01' || queryError.message.includes('does not exist')) {
        console.warn('[PasswordReuse] password_history table does not exist - failing open');
        return new Response(
          JSON.stringify({
            isReused: false,
            error: 'Password history not available',
          } as CheckPasswordReuseResponse),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Other database errors - fail open
      return new Response(
        JSON.stringify({
          isReused: false,
          error: 'Database error',
        } as CheckPasswordReuseResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // If no history records, password is not reused
    if (!historyRecords || historyRecords.length === 0) {
      return new Response(
        JSON.stringify({
          isReused: false,
        } as CheckPasswordReuseResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Compare new password against each historical hash
    for (const record of historyRecords as PasswordHistoryRecord[]) {
      try {
        const isMatch = await bcrypt.compare(newPassword, record.password_hash);

        if (isMatch) {
          // Password matches a historical hash - it's reused
          console.log('[PasswordReuse] Password reuse detected for user:', userId);
          return new Response(
            JSON.stringify({
              isReused: true,
            } as CheckPasswordReuseResponse),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
      } catch (compareError) {
        // Log error comparing this specific hash but continue checking others
        console.error('[PasswordReuse] Error comparing password hash:', compareError);
        continue;
      }
    }

    // No matches found - password is not reused
    return new Response(
      JSON.stringify({
        isReused: false,
      } as CheckPasswordReuseResponse),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    // Unexpected error - fail open
    console.error('[PasswordReuse] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        isReused: false,
        error: 'Unexpected error',
      } as CheckPasswordReuseResponse),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
