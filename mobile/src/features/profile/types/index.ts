/**
 * Profile feature type definitions.
 *
 * This module defines types for profile-related features including:
 * - Calendar integration state and management
 *
 * @module features/profile/types
 */

/**
 * Supported calendar providers.
 */
export type CalendarProvider = 'google' | 'outlook' | 'apple';

/**
 * Database representation of a user's calendar integration.
 *
 * Uses snake_case to match Supabase column names directly.
 * This represents the exact schema in the calendar_integrations table.
 *
 * SECURITY NOTE: access_token and refresh_token are encrypted at rest.
 * Edge Functions encrypt these fields before storage and decrypt when needed.
 */
export interface CalendarIntegrationRow {
  /** Unique identifier (server-generated UUID) */
  id: string;

  /** User ID, references auth.users(id). Part of unique constraint with provider. */
  user_id: string;

  /** Calendar provider (google, outlook, apple). Part of unique constraint with user_id. */
  provider: CalendarProvider;

  /** Whether the integration is currently active and tokens are valid */
  is_connected: boolean;

  /** Email address of the connected calendar account (for display) */
  connected_email: string | null;

  /** OAuth access token (encrypted by Edge Functions). SECURITY SENSITIVE. */
  access_token: string | null;

  /** OAuth refresh token (encrypted by Edge Functions). SECURITY CRITICAL. */
  refresh_token: string | null;

  /** When access_token expires. Used for proactive token refresh. */
  token_expires_at: string | null;

  /** OAuth scopes granted by the user (space-separated) */
  scope: string | null;

  /** Timestamp when the calendar was first connected */
  connected_at: string | null;

  /** Timestamp when the calendar was disconnected or tokens were revoked */
  disconnected_at: string | null;

  /** Timestamp of last successful calendar sync */
  last_sync_at: string | null;

  /** Last error message if connection or sync failed */
  last_error: string | null;

  /** Number of consecutive sync/connection errors (for exponential backoff) */
  error_count: number;

  /** Timestamp when the record was created */
  created_at: string;

  /** Timestamp when the record was last updated */
  updated_at: string;
}

/**
 * Client-side representation of calendar integration state.
 *
 * Transforms database snake_case to camelCase for React components.
 * Excludes sensitive token fields (accessToken, refreshToken) as they
 * should only be handled server-side by Edge Functions.
 *
 * SECURITY: Token fields are not included here to prevent accidental
 * exposure to the UI layer. Tokens should only be decrypted and used
 * in trusted Edge Function environments.
 */
export interface CalendarIntegration {
  /** Unique identifier (server-generated UUID) */
  id: string;

  /** User ID, references auth.users(id). */
  userId: string;

  /** Calendar provider (google, outlook, apple) */
  provider: CalendarProvider;

  /** Whether the integration is currently active and tokens are valid */
  isConnected: boolean;

  /** Email address of the connected calendar account (for display) */
  connectedEmail: string | null;

  /** When access_token expires. Used for proactive token refresh. */
  tokenExpiresAt: string | null;

  /** OAuth scopes granted by the user (space-separated) */
  scope: string | null;

  /** Timestamp when the calendar was first connected */
  connectedAt: string | null;

  /** Timestamp when the calendar was disconnected or tokens were revoked */
  disconnectedAt: string | null;

  /** Timestamp of last successful calendar sync */
  lastSyncAt: string | null;

  /** Last error message if connection or sync failed */
  lastError: string | null;

  /** Number of consecutive sync/connection errors (for exponential backoff) */
  errorCount: number;

  /** Timestamp when the record was created */
  createdAt: string;

  /** Timestamp when the record was last updated */
  updatedAt: string;
}

/**
 * Token data for OAuth connections.
 *
 * Contains sensitive OAuth tokens that must be encrypted before storage.
 * This interface is used in Edge Functions before encryption.
 *
 * SECURITY: These fields contain sensitive cryptographic material and must
 * be encrypted before storing in the database. Never log these values.
 */
export interface OAuthTokens {
  /** OAuth access token (short-lived, for API calls) */
  accessToken: string;

  /** OAuth refresh token (long-lived, for obtaining new access tokens) */
  refreshToken: string;

  /** Number of seconds until access token expires */
  expiresIn: number;

  /** OAuth scopes granted (space-separated string) */
  scope?: string;
}

/**
 * Parameters for creating or updating a calendar integration.
 *
 * Used by the repository layer to upsert integration records.
 * Excludes sensitive token fields - those are handled separately via OAuthTokens.
 */
export interface CreateCalendarIntegrationParams {
  /** Calendar provider */
  provider: CalendarProvider;

  /** Whether the integration is connected */
  isConnected: boolean;

  /** Email address of the connected account */
  connectedEmail?: string | null;

  /** When the access token expires (ISO 8601 timestamp) */
  tokenExpiresAt?: string | null;

  /** OAuth scopes granted (space-separated) */
  scope?: string | null;

  /** Timestamp when connection was established */
  connectedAt?: string | null;

  /** Timestamp when connection was disconnected */
  disconnectedAt?: string | null;

  /** Last error message if connection failed */
  lastError?: string | null;

  /** Number of consecutive errors */
  errorCount?: number;
}

/**
 * Parameters for connecting a calendar with OAuth tokens.
 *
 * Used by Edge Functions during OAuth callback to store new connections.
 * Includes OAuthTokens which must be encrypted before database storage.
 */
export interface ConnectCalendarParams extends CreateCalendarIntegrationParams {
  /** OAuth tokens (must be encrypted before storage) */
  tokens: OAuthTokens;
}

/**
 * Parameters for updating tokens on an existing integration.
 *
 * Used by token refresh jobs to update expired access tokens.
 */
export interface UpdateTokensParams {
  /** New OAuth tokens */
  tokens: OAuthTokens;

  /** Reset error count on successful token refresh */
  resetErrorCount?: boolean;
}

/**
 * Transforms a database row to client-side calendar integration.
 *
 * Converts snake_case to camelCase and excludes sensitive token fields.
 * Tokens should only be handled server-side by Edge Functions.
 *
 * @param row - Database row from Supabase query
 * @returns Client-safe calendar integration (no tokens)
 *
 * @example
 * ```ts
 * const { data } = await supabase
 *   .from('calendar_integrations')
 *   .select('*')
 *   .eq('user_id', userId)
 *   .eq('provider', 'google')
 *   .single();
 *
 * const integration = fromCalendarIntegrationRow(data);
 * // integration.accessToken is undefined (intentionally excluded)
 * ```
 */
export function fromCalendarIntegrationRow(row: CalendarIntegrationRow): CalendarIntegration {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    isConnected: row.is_connected,
    connectedEmail: row.connected_email,
    tokenExpiresAt: row.token_expires_at,
    scope: row.scope,
    connectedAt: row.connected_at,
    disconnectedAt: row.disconnected_at,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
    errorCount: row.error_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
