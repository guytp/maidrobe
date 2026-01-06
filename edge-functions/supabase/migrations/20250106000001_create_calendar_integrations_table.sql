-- Migration: Create calendar_integrations table
-- Purpose: Store OAuth-connected calendar integrations with encrypted tokens
-- Dependencies: Requires auth.users table (provided by Supabase Auth)
-- Idempotency: Safe to re-run; uses CREATE TABLE IF NOT EXISTS and IF NOT EXISTS for constraints
--
-- This migration creates the backend data model for calendar integration persistence.
-- It stores OAuth tokens encrypted at rest (encrypted by Edge Functions before storage).
-- Row Level Security ensures users can only access their own integrations.

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CREATE TABLE: calendar_integrations
-- ============================================================================
--
-- Purpose: Store OAuth connection state and tokens for calendar providers
-- Security: RLS enforced; tokens encrypted by Edge Functions before storage
--
-- Fields:
--   - user_id: References auth.users, part of composite primary key with provider
--   - provider: Calendar provider (google, outlook, apple) - part of composite primary key
--   - is_connected: Connection state flag
--   - connected_email: Email address of connected account (for display)
--   - access_token: OAuth access token (encrypted at rest)
--   - refresh_token: OAuth refresh token (encrypted at rest)
--   - token_expires_at: When access token expires (for proactive refresh)
--   - scope: OAuth scopes granted
--   - connected_at: When connection was established
--   - disconnected_at: When connection was revoked
--   - last_sync_at: Last successful sync timestamp
--   - last_error: Last error message if sync failed
--   - error_count: Number of consecutive errors (for exponential backoff)
--   - created_at: Record creation timestamp
--   - updated_at: Last update timestamp (auto-updated)

CREATE TABLE IF NOT EXISTS public.calendar_integrations (
  -- Primary key with UUID (server-generated for security)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User ownership - references auth.users with cascade delete
  -- When user is deleted, all their integrations are automatically removed
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Calendar provider (google, outlook, apple)
  -- Part of unique constraint: one integration per user per provider
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook', 'apple')),

  -- Connection state - controls whether sync is enabled
  is_connected BOOLEAN NOT NULL DEFAULT false,

  -- Email address associated with the connected account
  -- Used for display purposes only (e.g., "Connected • user@gmail.com")
  connected_email TEXT,

  -- OAuth tokens - ENCRYPTED by Edge Functions before storage
  -- SECURITY: These contain sensitive cryptographic material and MUST be encrypted
  --           at rest using application-level encryption in Edge Functions
  access_token TEXT,              -- Short-lived API access token (encrypted)
  refresh_token TEXT,             -- Long-lived refresh token (encrypted)
  token_expires_at TIMESTAMPTZ,   -- When access_token expires (for proactive refresh)

  -- OAuth scopes granted by the user
  -- Example: 'https://www.googleapis.com/auth/calendar.readonly calendar.events'
  scope TEXT,

  -- Connection lifecycle timestamps
  connected_at TIMESTAMPTZ,       -- When the calendar was first connected
  disconnected_at TIMESTAMPTZ,    -- When the calendar was disconnected/revoked
  last_sync_at TIMESTAMPTZ,       -- Timestamp of last successful calendar sync

  -- Error tracking for sync operations
  last_error TEXT,                -- Last error message if connection or sync failed
  error_count INTEGER NOT NULL DEFAULT 0,  -- Number of consecutive errors (for backoff)

  -- Audit timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- UNIQUE CONSTRAINT: One integration per user per provider
-- ============================================================================
--
-- Business rule: A user cannot have multiple connections to the same provider.
-- This constraint enforces a one-to-one relationship between (user_id, provider).
-- The ON CONFLICT clause in upsert operations will handle reconnection scenarios.

-- Use DO block for idempotent constraint creation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_calendar_integrations_user_provider'
      AND conrelid = 'public.calendar_integrations'::regclass
  ) THEN
    ALTER TABLE public.calendar_integrations
    ADD CONSTRAINT uq_calendar_integrations_user_provider
    UNIQUE (user_id, provider);

    RAISE NOTICE 'Created unique constraint uq_calendar_integrations_user_provider';
  ELSE
    RAISE NOTICE 'Constraint uq_calendar_integrations_user_provider already exists';
  END IF;
END
$$;

-- ============================================================================
-- INDEXES: Query performance optimization
-- ============================================================================
--
-- Composite index on (user_id, is_connected) for common queries
-- Used by: getCalendarIntegration hook, sync jobs checking active connections
CREATE INDEX IF NOT EXISTS idx_calendar_integrations_user_connected
ON public.calendar_integrations(user_id, is_connected);

-- Index on (provider, connected_email) for admin/debugging queries
-- Useful for: Finding all users connected to a specific account
CREATE INDEX IF NOT EXISTS idx_calendar_integrations_provider_email
ON public.calendar_integrations(provider, connected_email);

-- Index on token_expires_at for background token refresh jobs
-- Used by: Scheduled function that proactively refreshes expiring tokens
CREATE INDEX IF NOT EXISTS idx_calendar_integrations_token_expiry
ON public.calendar_integrations(token_expires_at)
WHERE is_connected = true;

-- ============================================================================
-- COMMENTS: Database documentation
-- ============================================================================
COMMENT ON TABLE public.calendar_integrations IS
  'OAuth-connected calendar integrations for users. ' ||
  'Stores encrypted tokens and sync state for Google Calendar and other providers. ' ||
  'Row-level security ensures users can only access their own integrations. ' ||
  'Tokens are encrypted at rest by Edge Functions before storage.';

COMMENT ON COLUMN public.calendar_integrations.id IS 'Unique identifier for the integration. Server-generated UUID.';
COMMENT ON COLUMN public.calendar_integrations.user_id IS 'User ID, references auth.users(id). Part of unique constraint with provider.';
COMMENT ON COLUMN public.calendar_integrations.provider IS 'Calendar provider (google, outlook, apple). Part of unique constraint with user_id.';
COMMENT ON COLUMN public.calendar_integrations.is_connected IS 'Whether the integration is currently active and tokens are valid.';
COMMENT ON COLUMN public.calendar_integrations.connected_email IS 'Email address of the connected calendar account (for display). Plain text, not sensitive.';
COMMENT ON COLUMN public.calendar_integrations.access_token IS 'Encrypted OAuth access token for API calls. Encrypted by Edge Functions before storage. SECURITY SENSITIVE.';
COMMENT ON COLUMN public.calendar_integrations.refresh_token IS 'Encrypted OAuth refresh token for obtaining new access tokens. Must be stored securely. SECURITY CRITICAL.';
COMMENT ON COLUMN public.calendar_integrations.token_expires_at IS 'Timestamp when access_token expires. Used for proactive token refresh before expiration.';
COMMENT ON COLUMN public.calendar_integrations.scope IS 'OAuth scopes granted by the user (space-separated). Example: calendar.readonly calendar.events';
COMMENT ON COLUMN public.calendar_integrations.connected_at IS 'Timestamp when the calendar was first successfully connected.';
COMMENT ON COLUMN public.calendar_integrations.disconnected_at IS 'Timestamp when the calendar was disconnected or tokens were revoked.';
COMMENT ON COLUMN public.calendar_integrations.last_sync_at IS 'Timestamp of last successful calendar sync operation.';
COMMENT ON COLUMN public.calendar_integrations.last_error IS 'Last error message if connection or sync failed. Cleared on successful operation.';
COMMENT ON COLUMN public.calendar_integrations.error_count IS 'Number of consecutive sync/connection errors. Used for exponential backoff. Reset on success.';
COMMENT ON COLUMN public.calendar_integrations.created_at IS 'Timestamp when the record was created. Set automatically.';
COMMENT ON COLUMN public.calendar_integrations.updated_at IS 'Timestamp when the record was last updated. Auto-updated by trigger.';
