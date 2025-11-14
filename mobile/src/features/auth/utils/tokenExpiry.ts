/**
 * Token expiry calculation utilities.
 *
 * This module provides centralized logic for deriving token expiry timestamps
 * from Supabase session data. The three-tier fallback strategy ensures consistent
 * token metadata across login, auth state changes, and token refresh operations.
 *
 * DESIGN RATIONALE:
 * Supabase Auth provides token expiry information in two forms:
 * 1. expires_at: Absolute unix timestamp (seconds) when token expires
 * 2. expires_in: Relative duration (seconds) until token expires
 *
 * Not all Supabase auth events include both fields. For example:
 * - SIGNED_IN events typically include expires_at
 * - TOKEN_REFRESHED events may only include expires_in
 * - Some edge cases may include neither
 *
 * THREE-TIER FALLBACK STRATEGY:
 * This utility implements a defensive fallback chain to ensure we always have
 * valid token metadata for proactive refresh scheduling:
 *
 * 1. Prefer expires_at (absolute timestamp):
 *    - Most accurate, no clock drift issues
 *    - Directly from server, authoritative
 *    - Convert from seconds to milliseconds
 *
 * 2. Calculate from expires_in (relative duration):
 *    - Add to current client time
 *    - Subject to client clock drift
 *    - But better than blind fallback
 *
 * 3. Default to 3600 seconds (1 hour):
 *    - Supabase standard token lifetime
 *    - Safe fallback for edge cases
 *    - Ensures refresh system continues to operate
 *
 * SECURITY:
 * This utility only handles metadata (timestamps). The actual access_token and
 * refresh_token remain encrypted in SecureStore and are never exposed here.
 *
 * OBSERVABILITY:
 * The fallbackUsed indicator enables telemetry to track when fallbacks occur,
 * helping identify potential issues with Supabase auth events or client state.
 */

/**
 * Result of token expiry derivation.
 */
export interface TokenExpiryResult {
  /**
   * Absolute timestamp (milliseconds since epoch) when the token expires.
   * Compatible with JavaScript Date and Date.now() for easy comparison.
   */
  expiresAt: number;

  /**
   * Indicates which fallback tier was used to derive the expiry.
   *
   * - 'none': expires_at was provided (preferred path)
   * - 'expires_in': calculated from expires_in (fallback tier 1)
   * - 'default_ttl': neither provided, used 1 hour default (fallback tier 2)
   */
  fallbackUsed: 'none' | 'expires_in' | 'default_ttl';
}

/**
 * Minimal Supabase session interface for token expiry derivation.
 *
 * This is a subset of the full Supabase Session type, containing only
 * the fields needed for expiry calculation. This keeps the utility
 * focused and testable without requiring full session objects.
 */
export interface SupabaseSession {
  /** Absolute unix timestamp in seconds when token expires */
  expires_at?: number;
  /** Relative duration in seconds until token expires */
  expires_in?: number;
}

/**
 * Default token time-to-live in milliseconds (1 hour).
 *
 * This matches Supabase's standard access token lifetime and is used
 * as a safe fallback when neither expires_at nor expires_in are available.
 */
export const DEFAULT_TOKEN_TTL_MS = 3600 * 1000; // 1 hour in milliseconds

/**
 * Derives token expiry timestamp from Supabase session data.
 *
 * Implements a three-tier fallback strategy to ensure we always have valid
 * token metadata for proactive refresh scheduling, even when Supabase auth
 * events don't include complete expiry information.
 *
 * Tier 1 (Preferred): Use session.expires_at if provided
 * - Absolute timestamp from server, most accurate
 * - Converts from seconds to milliseconds
 *
 * Tier 2 (Fallback): Calculate from session.expires_in if provided
 * - Relative duration added to current time
 * - Subject to client clock drift but better than default
 *
 * Tier 3 (Default): Use 1 hour (3600 seconds) standard lifetime
 * - Safe fallback for edge cases
 * - Ensures refresh system continues to operate
 *
 * VALIDATION:
 * Invalid values (NaN, Infinity, non-positive) cause fallthrough to next tier.
 * This prevents corrupted session data from breaking the refresh system.
 *
 * @param session - Supabase session object (or minimal subset with expiry fields)
 * @returns Token expiry result with timestamp and fallback indicator
 *
 * @example
 * ```typescript
 * // Normal case: expires_at provided
 * const result = deriveTokenExpiry({ expires_at: 1234567890 });
 * // result = { expiresAt: 1234567890000, fallbackUsed: 'none' }
 *
 * // Fallback case: only expires_in provided
 * const result = deriveTokenExpiry({ expires_in: 3600 });
 * // result = { expiresAt: Date.now() + 3600000, fallbackUsed: 'expires_in' }
 *
 * // Default case: neither provided
 * const result = deriveTokenExpiry({});
 * // result = { expiresAt: Date.now() + 3600000, fallbackUsed: 'default_ttl' }
 * ```
 */
export function deriveTokenExpiry(session: SupabaseSession): TokenExpiryResult {
  // Tier 1: Prefer expires_at (absolute timestamp from server)
  if (session.expires_at != null) {
    // Validate that expires_at is a valid positive number
    if (
      typeof session.expires_at === 'number' &&
      Number.isFinite(session.expires_at) &&
      session.expires_at > 0
    ) {
      // Supabase provides expires_at as unix timestamp in seconds
      // Convert to milliseconds for JavaScript Date compatibility
      const expiresAt = session.expires_at * 1000;

      return {
        expiresAt,
        fallbackUsed: 'none',
      };
    }
    // Invalid expires_at, fall through to next tier
  }

  // Tier 2: Calculate from expires_in (relative duration)
  if (session.expires_in != null) {
    // Validate that expires_in is a valid positive number
    if (
      typeof session.expires_in === 'number' &&
      Number.isFinite(session.expires_in) &&
      session.expires_in > 0
    ) {
      // Calculate absolute expiry from relative duration
      // Add expires_in (seconds) to current time
      const expiresAt = Date.now() + session.expires_in * 1000;

      return {
        expiresAt,
        fallbackUsed: 'expires_in',
      };
    }
    // Invalid expires_in, fall through to default
  }

  // Tier 3: Default to standard 1 hour token lifetime
  // This ensures the refresh system continues to operate even when
  // Supabase session data is incomplete or corrupted
  const expiresAt = Date.now() + DEFAULT_TOKEN_TTL_MS;

  return {
    expiresAt,
    fallbackUsed: 'default_ttl',
  };
}
