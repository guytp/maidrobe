/**
 * Password reuse checking utilities for password reset flow.
 *
 * SECURITY ARCHITECTURE:
 * This module provides client-side coordination for password reuse validation.
 * The actual password comparison MUST occur server-side using secure hashing.
 *
 * Backend Implementation:
 * Uses Supabase Edge Function 'check-password-reuse' located at:
 * edge-functions/supabase/functions/check-password-reuse/index.ts
 *
 * The Edge Function:
 * - Receives userId and newPassword over HTTPS
 * - Queries password_history table for last 3 password hashes
 * - Uses bcrypt to compare new password against historical hashes
 * - Returns { isReused: boolean } (never exposes hashes to client)
 * - Fails open on errors to prevent DoS
 *
 * Database Requirements:
 * - password_history table with user_id, password_hash, created_at columns
 * - Index on (user_id, created_at DESC) for query performance
 * - Table populated via trigger when passwords are changed
 * - If table doesn't exist, function fails open (allows password change)
 *
 * Client-Side Role:
 * - Call Edge Function via supabase.functions.invoke()
 * - Display user-friendly error messages
 * - Handle network/server errors gracefully
 * - Never send or store plaintext passwords beyond API call
 * - Fail open on errors to prevent user being locked out
 */

import { supabase } from '../../../services/supabase';

/**
 * Number of previous passwords to check for reuse.
 * User story requirement: "Disallow reuse of last three passwords"
 */
export const PASSWORD_HISTORY_LIMIT = 3;

/**
 * Result of password reuse check
 */
export interface PasswordReuseCheckResult {
  isReused: boolean;
  error?: string;
}

/**
 * Checks if a new password has been used recently.
 *
 * IMPLEMENTATION:
 * Calls the 'check-password-reuse' Supabase Edge Function which:
 * - Queries password_history table for user's last 3 password hashes
 * - Uses bcrypt to securely compare new password against historical hashes
 * - Returns { isReused: boolean } without exposing any password hashes
 * - Fails open on errors (returns isReused: false) to prevent user lockout
 *
 * SECURITY:
 * - Password sent over HTTPS (encrypted in transit)
 * - Comparison happens server-side using bcrypt
 * - Client receives only boolean result
 * - Never logs plaintext passwords
 * - Fails open on errors to prevent DoS
 *
 * DATABASE REQUIREMENTS:
 * Requires password_history table with schema:
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
 * The table should be populated via database trigger when passwords change.
 * If the table doesn't exist, the Edge Function will fail open (allow password).
 *
 * ERROR HANDLING:
 * This function implements fail-open behavior:
 * - Network errors: Allow password change (return isReused: false)
 * - Backend errors: Allow password change (return isReused: false)
 * - Missing table: Allow password change (return isReused: false)
 * - Invalid response: Allow password change (return isReused: false)
 *
 * This ensures users are never locked out due to infrastructure issues
 * while still providing security when the system is functioning correctly.
 *
 * @param userId - The user ID to check password history for
 * @param newPassword - The new password to validate (will be hashed server-side)
 * @returns Promise resolving to check result
 *
 * @example
 * ```typescript
 * const result = await checkPasswordReuse(userId, newPassword);
 * if (result.isReused) {
 *   setError('Cannot reuse one of your last 3 passwords');
 * }
 * if (result.error) {
 *   // Log error but allow user to proceed (fail-open for availability)
 *   console.error('Password reuse check failed:', result.error);
 * }
 * ```
 */
export async function checkPasswordReuse(
  userId: string,
  newPassword: string
): Promise<PasswordReuseCheckResult> {
  try {
    // Call Supabase Edge Function to check password reuse
    const { data, error } = await supabase.functions.invoke('check-password-reuse', {
      body: {
        userId,
        newPassword,
      },
    });

    // Handle Edge Function invocation errors
    if (error) {
      // Log error but fail-open (allow password change)
      // eslint-disable-next-line no-console
      console.error('[PasswordReuse] Edge Function error:', error);
      return {
        isReused: false,
        error: 'Unable to verify password history',
      };
    }

    // Validate response structure
    if (!data || typeof data.isReused !== 'boolean') {
      // eslint-disable-next-line no-console
      console.error('[PasswordReuse] Invalid response format:', data);
      return {
        isReused: false,
        error: 'Invalid response from password check service',
      };
    }

    // Return the result from Edge Function
    return {
      isReused: data.isReused,
      error: data.error,
    };
  } catch (error) {
    // Network or unexpected error - fail-open
    // eslint-disable-next-line no-console
    console.error('[PasswordReuse] Unexpected error:', error);
    return {
      isReused: false,
      error: 'Unable to verify password history',
    };
  }
}
