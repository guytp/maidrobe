-- Migration: Add calendar_integrations Row Level Security policies
-- Purpose: Enable RLS and define access policies for calendar integration data
-- Dependencies: 20250106000001_create_calendar_integrations_table.sql
-- Idempotency: Safe to re-run; uses DROP POLICY IF EXISTS before CREATE
--
-- This migration adds Row Level Security (RLS) to the calendar_integrations table.
-- RLS is critical for security - it ensures users can only access their own
-- calendar integrations and cannot view or modify other users' data.
--
-- Security Model:
--   - SELECT: Users can view their own integrations only
--   - INSERT: Users can create integrations only for themselves
--   - UPDATE: Users can update their own integrations (e.g., disconnect, refresh tokens)
--   - DELETE: Users can delete their own integrations (or Edge Functions can hard delete)

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
--
-- Critical for security - ensures users can only access their own integrations.
-- Without RLS, any authenticated user could query all calendar integrations.

ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DROP EXISTING POLICIES (for idempotency)
-- ============================================================================
--
-- Drop any existing policies to ensure clean recreation on re-run.
-- This prevents duplicate policies and ensures policy definitions are current.

DROP POLICY IF EXISTS "Users can view their own calendar integrations" ON public.calendar_integrations;
DROP POLICY IF EXISTS "Users can insert their own calendar integrations" ON public.calendar_integrations;
DROP POLICY IF EXISTS "Users can update their own calendar integrations" ON public.calendar_integrations;
DROP POLICY IF EXISTS "Users can delete their own calendar integrations" ON public.calendar_integrations;

-- ============================================================================
-- RLS POLICIES FOR AUTHENTICATED USERS
-- ============================================================================

-- SELECT Policy: Users can only view their own calendar integrations
-- Used by: Profile screen, Calendar Integration detail screen, sync status checks
-- Security: Filters rows where auth.uid() matches user_id
CREATE POLICY "Users can view their own calendar integrations"
  ON public.calendar_integrations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT Policy: Users can only create integrations for themselves
-- Enforces that user_id must match the authenticated user's ID
-- Prevents users from creating integrations attributed to other users
-- Used by: OAuth connection flow (Edge Functions create on user's behalf)
CREATE POLICY "Users can insert their own calendar integrations"
  ON public.calendar_integrations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE Policy: Users can only update their own integrations
-- Using clause (USING): Restricts which rows can be targeted for update
--   - Ensures users can only modify rows where auth.uid() = user_id
-- Check clause (WITH CHECK): Validates the updated row
--   - Prevents changing user_id to a different user
--   - Together they ensure users cannot transfer ownership
-- Used by: Disconnect action, token refresh updates, error tracking
CREATE POLICY "Users can update their own calendar integrations"
  ON public.calendar_integrations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE Policy: Users can delete their own integrations
-- Note: In practice, we recommend soft-delete via is_connected=false instead of hard delete
--       Hard delete should only be done by Edge Functions or admin operations
-- Used by: Edge Functions during complete account deletion or data retention policies
CREATE POLICY "Users can delete their own calendar integrations"
  ON public.calendar_integrations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- POLICY FOR SERVICE ROLE (SERVER-SIDE OPERATIONS)
-- ============================================================================
--
-- Edge Functions use service_role key to bypass RLS for operations like:
--   - Token refresh jobs (running as background tasks)
--   - Data cleanup operations
--   - Admin-initiated disconnections
--   - Migration scripts
--
-- SECURITY WARNING: service_role has unrestricted access. Only use in trusted
-- Edge Functions with proper authentication checks and logging.

-- No explicit policy needed for service_role - it bypasses RLS by default

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
--
-- Reuse existing handle_updated_at function from profiles migration
-- Automatically updates updated_at timestamp on any row modification

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS set_updated_at ON public.calendar_integrations;

-- Create trigger to auto-update updated_at on any UPDATE
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.calendar_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
